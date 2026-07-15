import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar, Link2, Copy, Share2, Clock, CookingPot, Printer,
  Box, Check, X, Search, Power, AlertCircle, Settings,
} from "lucide-react";
import { t } from "../../lib/theme";
import { rupiah, itemsText, serviceDateLabel, nextSchoolDayISO, hhmm, autoClosedNow, wibTimeHHMM, reopenActiveNow, wibClock } from "../../lib/format";
import { openPicker } from "../../lib/picker";
import { TINGKAT_LIST } from "../../lib/constants";
import type { Transaction, PickupSchedule } from "../../types";

const TINGKAT_WARNA: Record<string, string> = {
  "KB": "#D6608A", "TK A": "#7C6BAF", "TK B": "#7C6BAF",
  "SD": "#C94F4F", "SMP": "#4A7BA6", "SMA": "#6E6E6E",
  "Guru/Karyawan": "#2F2A24",
};
const tingkatColor = (tg: string) => TINGKAT_WARNA[tg] || "#2F2A24";

/* ============================================================
   PRE-ORDER (ADMIN) — versi SEDERHANA (untuk mama, gaptek-friendly)
   Satu SESI PO aktif = tanggal + status jadi satu kartu (bukan dua
   saklar terpisah). TANPA filter/dropdown pada daftar. Cuma kotak
   Cari. Daftar utama = preset pertama (mis. "Istirahat 1"), TANPA
   label. Bagian "Ambil beda waktu" untuk preset lainnya. Ketuk
   kartu pesanan = toggle Sudah Dikemas.
   Aturan sebenarnya (buka/tutup/jam tutup/tanggal) ditegakkan di
   SERVER (trigger DB) — lihat supabase/migration_2_session_rules.sql.
   Widget di sini hanya kontrol; kebenaran datanya di server.
   ============================================================ */

type AdminOrder = {
  id: string;
  nama: string;
  tingkat: string;
  kelas: string;
  ambil: string;
  packed: boolean;
  items: Transaction["items"];
  total: number;
};

type MergedGroup = {
  key: string;
  ids: string[];
  nama: string;
  tingkat: string;
  kelas: string;
  ambil: string;
  allPacked: boolean;
  somePacked: boolean;
  flatItems: Transaction["items"];
  total: number;
};

function mergeOrders(list: AdminOrder[]): MergedGroup[] {
  const map = new Map<string, MergedGroup & { _orders: AdminOrder[] }>();
  for (const o of list) {
    const key = `${o.nama.toLowerCase()}|${o.kelas.toLowerCase()}`;
    if (!map.has(key)) map.set(key, { key, ids: [], nama: o.nama, tingkat: o.tingkat, kelas: o.kelas, ambil: o.ambil, allPacked: true, somePacked: false, flatItems: [], total: 0, _orders: [] });
    const g = map.get(key)!;
    g.ids.push(o.id);
    g.allPacked = g.allPacked && o.packed;
    g.somePacked = g.somePacked || o.packed;
    g.flatItems = [...g.flatItems, ...o.items];
    g.total += o.total;
    g._orders.push(o);
  }
  return Array.from(map.values());
}

export default function PreOrderAdmin({
  serviceDate,
  onServiceDateChange,
  open,
  onToggleOpen,
  autoCloseTime,
  onAutoCloseTimeChange,
  reopenUntil,
  onReopenUntilChange,
  presets,
  schedules,
  transactions,
  onTogglePacked,
  poLink,
  onOpenSettings,
}: {
  serviceDate: string;
  onServiceDateChange: (d: string) => void;
  open: boolean;
  onToggleOpen: () => void;
  autoCloseTime: string;
  onAutoCloseTimeChange: (t: string) => void;
  reopenUntil: string | null;
  onReopenUntilChange: (iso: string | null) => void;
  presets: string[];
  schedules: PickupSchedule[];
  transactions: Transaction[];
  onTogglePacked: (id: string) => void;
  poLink: string;
  onOpenSettings: () => void;
}) {
  const [q, setQ] = useState("");
  const [tingkatFilter, setTingkatFilter] = useState("Semua");
  const [sheet, setSheet] = useState<null | "link" | "waktu" | "rekap" | "cetak" | "gantiTanggal" | "jamTutup">(null);
  const [copied, setCopied] = useState(false);
  const [nowTick, setNowTick] = useState(0);
  const [showLateOnly, setShowLateOnly] = useState(false);
  const [packedFilter, setPackedFilter] = useState<"semua" | "sudah" | "belum">("semua");
  const gantiTanggalRef = useRef<HTMLInputElement>(null);
  const jamTutupRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // "Buka Lagi" sementara masih berlaku? (re-evaluate tiap 30 detik)
  const reopenNow = useMemo(() => {
    void nowTick;
    return reopenActiveNow(reopenUntil);
  }, [reopenUntil, nowTick]);

  // true jika sesi dibuka tapi jam WIB sudah lewat auto_close_time pada hari
  // serviceDate — dan tidak sedang "Buka Lagi"
  const isAutoClosed = useMemo(() => {
    void nowTick; // re-evaluate tiap 30 detik
    return open && autoClosedNow(serviceDate, autoCloseTime) && !reopenNow;
  }, [open, serviceDate, autoCloseTime, nowTick, reopenNow]);

  const reopenFor = (minutes: number) =>
    onReopenUntilChange(new Date(Date.now() + minutes * 60_000).toISOString());

  // Jam WIB sekarang (HH:MM) — di-refresh tiap 30 detik oleh nowTick
  const currentWIBTime = useMemo(() => {
    void nowTick;
    return wibTimeHHMM();
  }, [nowTick]);

  const defaultAmbil = presets[0] || "Istirahat 1";

  const orders: AdminOrder[] = useMemo(
    () =>
      transactions
        .filter((tx) => tx.source === "preorder" && tx.serviceDate === serviceDate && !tx.cancelledAt)
        .map((tx) => ({
          id: tx.id,
          nama: tx.customer.nama,
          tingkat: tx.customer.tingkat || "",
          kelas: tx.customer.kelas,
          ambil: tx.waktuAmbil || defaultAmbil,
          packed: !!tx.packed,
          items: tx.items,
          total: tx.total,
        })),
    [transactions, serviceDate, defaultAmbil]
  );

  const packed = orders.filter((o) => o.packed).length;
  const belum = orders.length - packed;

  const tingkats = ["Semua", ...TINGKAT_LIST];

  const ql = q.toLowerCase().trim();
  const match = (o: AdminOrder) =>
    `${o.nama} ${o.tingkat} ${o.kelas}`.toLowerCase().includes(ql) &&
    (tingkatFilter === "Semua" || o.tingkat === tingkatFilter);

  const rawUtama = mergeOrders(orders.filter((o) => o.ambil === defaultAmbil && match(o)));
  const rawBeda = mergeOrders(orders.filter((o) => o.ambil !== defaultAmbil && match(o)));

  // Deteksi telat: Belum Dikemas + jam WIB sekarang > jam waktu ambil untuk tingkat tsb.
  // Guru/Karyawan hanya dianggap telat jika byTingkat diisi secara eksplisit.
  const isGroupLate = (g: MergedGroup): boolean => {
    if (g.allPacked || !schedules.length) return false;
    const sched = schedules.find(s => s.name === g.ambil);
    if (!sched) return false;
    const time = g.tingkat === "Guru/Karyawan"
      ? sched.byTingkat?.[g.tingkat]
      : (sched.byTingkat?.[g.tingkat] || sched.defaultTime);
    if (!time) return false;
    return currentWIBTime > time;
  };

  const sortLateFirst = (list: MergedGroup[]) => {
    const late = list.filter(isGroupLate);
    const notLate = list.filter(g => !isGroupLate(g));
    return [...late, ...notLate];
  };
  // Filter Sudah/Belum Dikemas dari kotak ringkasan (grup campuran dihitung Belum)
  const byPacked = (g: MergedGroup) =>
    packedFilter === "semua" || (packedFilter === "sudah" ? g.allPacked : !g.allPacked);
  const utama = (showLateOnly ? rawUtama.filter(isGroupLate) : sortLateFirst(rawUtama)).filter(byPacked);
  const beda = (showLateOnly ? rawBeda.filter(isGroupLate) : sortLateFirst(rawBeda)).filter(byPacked);
  const lateCount = [...rawUtama, ...rawBeda].filter(isGroupLate).length;

  const handleGroupTap = (g: MergedGroup) => {
    const shouldBePacked = !g.allPacked;
    orders.forEach((o) => {
      if (g.ids.includes(o.id) && o.packed !== shouldBePacked) {
        onTogglePacked(o.id);
      }
    });
  };

  const dateLabel = useMemo(() => serviceDateLabel(serviceDate), [serviceDate]);

  const handleCopy = () => {
    navigator.clipboard.writeText(poLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleShareWA = () => {
    const text = encodeURIComponent(
      open
        ? `Halo Papa/Mama,\n\nPre-order Kantin Gan En untuk ${dateLabel} telah dibuka.\n\nSilakan melakukan pemesanan melalui tautan berikut:\n${poLink}\n\n🪷Gan En🙏🏻✨`
        : "Pre-order untuk tanggal ini sudah ditutup."
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const pickNextSchoolDay = () => {
    onServiceDateChange(nextSchoolDayISO());
    setSheet(null);
  };

  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 90px" }}>

        <div style={{ padding: "20px 20px 12px" }}>
          <div className="flex items-center justify-between">
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>Pre-order</div>
            <button
              onClick={onOpenSettings}
              aria-label="Pengaturan"
              style={{ width: 38, height: 38, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}
            >
              <Settings size={17} />
            </button>
          </div>

          {/* Kartu Sesi PO — tanggal + status jadi SATU sesi, bukan dua saklar terpisah */}
          <div style={{ marginTop: 14, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 16, padding: 16 }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: t.text2 }}>Sesi Pre-order</span>
              <button onClick={onToggleOpen} className="flex items-center gap-1.5"
                style={{ height: 32, padding: "0 12px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 12.5, border: "none",
                  background: isAutoClosed ? t.primaryLight : open ? t.successBg : t.errorBg,
                  color: isAutoClosed ? t.amberText : open ? t.successText : t.error }}>
                <Power size={13} />
                {isAutoClosed ? "Tutup Otomatis" : open ? "Dibuka" : "Ditutup"}
              </button>
            </div>

            {/* Tanggal (besar) — juga bisa diketuk untuk ganti tanggal, sesuai
                bagian 0 (seluruh area, bukan cuma tombol Ganti Tanggal di bawah) */}
            <button
              onClick={() => setSheet("gantiTanggal")}
              className="flex items-center gap-2"
              style={{ width: "100%", marginTop: 8, background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
            >
              <Calendar size={20} color={t.amberText} />
              <span style={{ fontSize: 21, fontWeight: 800 }}>{dateLabel}</span>
            </button>

            {/* Otomatis tutup jam — "Ubah" buka widget jam besar, seluruhnya bisa diketuk */}
            <div className="flex items-center justify-between" style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.divider}` }}>
              <span style={{ fontSize: 13.5, color: t.text2 }}>
                Otomatis tutup jam <b style={{ color: t.text }}>{hhmm(autoCloseTime)}</b>
                {open && reopenNow && reopenUntil && autoClosedNow(serviceDate, autoCloseTime) && (
                  <> · <b style={{ color: t.successText }}>dibuka lagi s/d {wibClock(reopenUntil)}</b></>
                )}
              </span>
              <button onClick={() => setSheet("jamTutup")} style={{ background: "transparent", border: "none", color: t.amberText, fontWeight: 700, fontSize: 13.5, cursor: "pointer", padding: "6px 4px" }}>
                Ubah
              </button>
            </div>

            {/* Ganti Tanggal */}
            <button onClick={() => setSheet("gantiTanggal")} className="flex items-center justify-center gap-2"
              style={{ width: "100%", height: 46, marginTop: 12, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surfaceSoft, color: t.text, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              <Calendar size={16} /> Ganti Tanggal
            </button>
          </div>

          {/* Ringkasan hari ini — bisa diketuk sebagai filter daftar */}
          <div className="flex gap-2" style={{ marginTop: 12 }}>
            <Stat n={orders.length} label="Pesanan" active={packedFilter === "semua"}
              onClick={() => setPackedFilter("semua")} />
            <Stat n={packed} label="Sudah Dikemas" tone="ok" active={packedFilter === "sudah"}
              onClick={() => setPackedFilter(packedFilter === "sudah" ? "semua" : "sudah")} />
            <Stat n={belum} label="Belum Dikemas" tone="warn" active={packedFilter === "belum"}
              onClick={() => setPackedFilter(packedFilter === "belum" ? "semua" : "belum")} />
          </div>

          {/* Actions */}
          <div className="flex gap-2" style={{ marginTop: 12 }}>
            <Action icon={<Link2 size={20} />} label="Bagikan Link" onClick={() => setSheet("link")} />
            <Action icon={<CookingPot size={20} />} label="Rekap Masak" onClick={() => setSheet("rekap")} />
            <Action icon={<Printer size={20} />} label="Cetak" onClick={() => setSheet("cetak")} />
          </div>

          {/* Cari */}
          <div className="flex items-center gap-2" style={{ marginTop: 14, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "0 12px", height: 50 }}>
            <Search size={20} color={t.text2} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama murid…"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 15.5, width: "100%", color: t.text, fontFamily: "inherit" }} />
            {q && <X size={18} color={t.text2} style={{ cursor: "pointer" }} onClick={() => setQ("")} />}
          </div>

          {/* Filter Tingkat */}
          <div className="flex gap-2" style={{ marginTop: 10, overflowX: "auto", paddingBottom: 2 }}>
              {tingkats.map((tg) => {
                const on = tg === tingkatFilter;
                const bgColor = on && tg !== "Semua" ? tingkatColor(tg) : undefined;
                return (
                  <button key={tg} onClick={() => setTingkatFilter(tg)}
                    style={{ flex: "none", height: 36, padding: "0 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
                      border: `1.5px solid ${on ? (tg === "Semua" ? t.primary : bgColor!) : t.border}`,
                      background: on ? (tg === "Semua" ? t.primaryLight : bgColor!) : t.surface,
                      color: on ? (tg === "Semua" ? t.amberText : "#FFFCF7") : t.text2 }}>
                    {tg}
                  </button>
                );
              })}
            </div>
        </div>

        {/* Daftar utama — preset pertama, TANPA label */}
        <div style={{ padding: "0 20px" }}>

          {/* Banner pesanan telat — sticky, diketuk untuk toggle filter */}
          {lateCount > 0 && (
            <button onClick={() => setShowLateOnly(v => !v)} className="flex items-center gap-2"
              style={{ position: "sticky", top: 0, zIndex: 10, width: "100%", padding: "11px 14px", marginBottom: 10, background: t.error, color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              <AlertCircle size={16} />
              <span style={{ flex: 1, textAlign: "left" }}>
                {showLateOnly ? "← Semua pesanan" : `${lateCount} pesanan lewat waktu ambil`}
              </span>
            </button>
          )}

          <div style={{ fontSize: 13, fontWeight: 800, color: t.text, margin: "8px 2px 10px" }}>Pesanan Hari Ini</div>
          {utama.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: t.text2, fontSize: 14 }}>{q ? "Tidak ada yang cocok." : "Belum ada pesanan."}</div>
          ) : utama.map((g) => <MergedOrderCard key={g.key} g={g} onTap={() => handleGroupTap(g)} isLate={isGroupLate(g)} />)}

          {/* Ambil beda waktu — hanya kalau ada */}
          {beda.length > 0 && (
            <>
              <div className="flex items-center gap-2" style={{ margin: "20px 2px 10px", color: "#A32E2E" }}>
                <AlertCircle size={16} />
                <span style={{ fontSize: 13, fontWeight: 800 }}>Ambil beda waktu</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#A32E2E", background: "#FBEAEA", border: "1px solid #E8B9B9", padding: "1px 8px", borderRadius: 999 }}>{beda.length}</span>
              </div>
              {beda.map((g) => <MergedOrderCard key={g.key} g={g} onTap={() => handleGroupTap(g)} showAmbil isLate={isGroupLate(g)} />)}
            </>
          )}
        </div>
      </div>

      {/* Sheets */}
      {sheet === "gantiTanggal" && (
        <Sheet title="Ganti Tanggal" onClose={() => setSheet(null)}>
          <div style={{ fontSize: 13, color: t.text2, marginBottom: 14 }}>Pilih tanggal untuk sesi Pre-order berikutnya.</div>
          <button onClick={pickNextSchoolDay} className="flex items-center justify-center gap-2"
            style={{ width: "100%", height: 56, borderRadius: 14, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
            <Calendar size={18} /> Hari Sekolah Berikutnya
          </button>
          <div style={{ textAlign: "center", fontSize: 12, color: t.textDis, margin: "12px 0" }}>atau</div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openPicker(gantiTanggalRef)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(gantiTanggalRef); } }}
            className="flex items-center gap-3"
            style={{ position: "relative", height: 56, borderRadius: 14, border: `1.5px solid ${t.border}`, background: t.surface, padding: "0 16px", cursor: "pointer" }}
          >
            <Calendar size={18} color={t.amberText} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>Pilih tanggal lain</span>
            <input
              ref={gantiTanggalRef}
              type="date"
              value={serviceDate}
              onChange={(e) => { onServiceDateChange(e.target.value); setSheet(null); }}
              aria-label="Pilih tanggal lain"
              tabIndex={-1}
              style={{ position: "absolute", inset: 0, opacity: 0, pointerEvents: "none" }}
            />
          </div>
        </Sheet>
      )}
      {sheet === "jamTutup" && (
        <Sheet title="Jam Tutup Otomatis" onClose={() => setSheet(null)}>
          <div style={{ fontSize: 13, color: t.text2, marginBottom: 14 }}>Pre-order otomatis ditutup pada jam ini di hari layanan. Ditegakkan di server — bukan cuma tampilan.</div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openPicker(jamTutupRef)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(jamTutupRef); } }}
            style={{ position: "relative", height: 84, borderRadius: 16, border: `1.5px solid ${t.border}`, background: t.surfaceSoft, cursor: "pointer", display: "grid", placeItems: "center" }}
          >
            <span style={{ fontSize: 34, fontWeight: 800, color: t.amberText, fontVariantNumeric: "tabular-nums" }}>{hhmm(autoCloseTime)}</span>
            <input
              ref={jamTutupRef}
              type="time"
              value={hhmm(autoCloseTime)}
              onChange={(e) => onAutoCloseTimeChange(e.target.value + ":00")}
              aria-label="Jam Tutup Otomatis"
              tabIndex={-1}
              style={{ position: "absolute", inset: 0, opacity: 0, pointerEvents: "none" }}
            />
          </div>

          {/* Buka Lagi — hanya saat sesi sudah Tutup Otomatis. Jam standar di
              atas tidak berubah; pembukaan sementara berakhir sendiri. */}
          {isAutoClosed && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${t.divider}` }}>
              <div style={{ fontSize: 13, color: t.text2, marginBottom: 10 }}>
                Ada yang masih mau pesan? Buka lagi sementara:
              </div>
              <div className="flex gap-2">
                <button onClick={() => { reopenFor(30); setSheet(null); }}
                  style={{ flex: 1, height: 48, borderRadius: 12, border: `1.5px solid ${t.primary}`, background: t.primaryLight, color: t.amberText, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                  +30 menit
                </button>
                <button onClick={() => { reopenFor(60); setSheet(null); }}
                  style={{ flex: 1, height: 48, borderRadius: 12, border: `1.5px solid ${t.primary}`, background: t.primaryLight, color: t.amberText, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                  +1 jam
                </button>
              </div>
            </div>
          )}
          {open && reopenNow && reopenUntil && autoClosedNow(serviceDate, autoCloseTime) && (
            <div className="flex items-center justify-between" style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${t.divider}` }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: t.successText }}>
                Dibuka lagi sampai {wibClock(reopenUntil)}
              </span>
              <button onClick={() => { onReopenUntilChange(null); setSheet(null); }}
                style={{ height: 40, padding: "0 14px", borderRadius: 10, border: `1.5px solid ${t.border}`, background: t.surface, color: t.error, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Tutup Sekarang
              </button>
            </div>
          )}
        </Sheet>
      )}
      {sheet === "link" && (
        <Sheet title="Bagikan Link Pre-order" onClose={() => setSheet(null)}>
          <div style={{ fontSize: 13, color: t.text2, marginBottom: 12 }}>Link untuk {dateLabel}. {open ? "Pre-order sedang dibuka." : "Saat ini ditutup."}</div>
          <div style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 13.5, color: t.text2, wordBreak: "break-all", marginBottom: 14 }}>{poLink}</div>
          <div className="flex gap-2">
            <button onClick={handleCopy} className="flex items-center justify-center gap-2" style={btn(false)}>{copied ? <Check size={18} /> : <Copy size={18} />} {copied ? "Tersalin!" : "Salin Link"}</button>
            <button onClick={handleShareWA} className="flex items-center justify-center gap-2" style={btn(true)}><Share2 size={18} /> WhatsApp</button>
          </div>
        </Sheet>
      )}
      {sheet === "rekap" && (
        <Sheet title="Rekap Masak" onClose={() => setSheet(null)}>
          <div style={{ fontSize: 13, color: t.text2, marginBottom: 6 }}>{dateLabel} · semua pesanan</div>
          {Object.entries(
            orders.reduce<Record<string, number>>((acc, o) => {
              o.items.forEach((it) => { const k = it.name + (it.variant ? " " + it.variant : ""); acc[k] = (acc[k] || 0) + it.qty; });
              return acc;
            }, {})
          ).sort((a, b) => a[0].localeCompare(b[0], "id")).map(([name, qty]) => (
            <div key={name} className="flex items-center justify-between" style={{ padding: "13px 0", borderBottom: `1px solid ${t.divider}` }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{name}</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{qty}</span>
            </div>
          ))}
          {orders.length === 0 && <div style={{ textAlign: "center", padding: "24px 0", color: t.text2, fontSize: 14 }}>Belum ada pesanan.</div>}
          <div style={{ fontSize: 12.5, color: t.text2, marginTop: 14 }}>Cukup angka untuk dapur — tanpa nama murid.</div>
        </Sheet>
      )}
      {sheet === "cetak" && (
        <Sheet title="Cetak" onClose={() => setSheet(null)}>
          {([["Rekap per Kelas", Box], ["Rekap per Menu", CookingPot], ["Label Pesanan", Box]] as const).map(([label, Ic]) => (
            <button key={label} className="flex items-center gap-3" style={{ width: "100%", height: 56, marginBottom: 10, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, cursor: "pointer", padding: "0 16px", color: t.text }}>
              <Ic size={20} color={t.amberText} /><span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: 700 }}>{label}</span><Printer size={18} color={t.textDis} />
            </button>
          ))}
          <div style={{ fontSize: 12, color: t.text2, textAlign: "center", marginTop: 6 }}>Cetak thermal — segera hadir.</div>
        </Sheet>
      )}
    </div>
  );
}

/* ---- bits ---- */
function MergedOrderCard({ g, onTap, showAmbil, isLate }: { g: MergedGroup; onTap: () => void; showAmbil?: boolean; isLate?: boolean }) {
  const partial = g.somePacked && !g.allPacked;
  const checkBg = g.allPacked ? t.success : partial ? t.primary : t.surface;
  const checkBorder = g.allPacked ? t.success : partial ? t.primary : t.border;
  const late = isLate && !g.allPacked;
  const cardBorder = late ? t.error : g.allPacked ? "#D8E6D4" : t.border;
  return (
    <div onClick={onTap}
      style={{ background: t.surface, border: `1.5px solid ${cardBorder}`, borderLeft: late ? `4px solid ${t.error}` : `1.5px solid ${cardBorder}`, borderRadius: 14, padding: 14, marginBottom: 9, cursor: "pointer" }}>
      <div className="flex items-center gap-3">
        <span style={{ width: 30, height: 30, borderRadius: 9, flex: "none", display: "grid", placeItems: "center",
          background: checkBg, border: `2px solid ${checkBorder}`, color: "#fff" }}>
          {g.allPacked && <Check size={18} />}
          {partial && <span style={{ width: 12, height: 2, background: t.text, borderRadius: 2, display: "block" }} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
            <span style={{ fontSize: 18, fontWeight: 800, textDecoration: g.allPacked ? "line-through" : "none", color: g.allPacked ? t.text2 : t.text }}>{g.nama}</span>
            <span style={{ background: tingkatColor(g.tingkat), color: "#FFFCF7", padding: "2px 10px", borderRadius: 999, fontSize: 13, fontWeight: 800 }}>
              {g.kelas || g.tingkat}
            </span>
            {g.ids.length > 1 && (
              <span style={{ fontSize: 11, fontWeight: 800, color: t.amberText, background: t.primaryLight, border: `1px solid #F1DFB0`, padding: "2px 8px", borderRadius: 999 }}>{g.ids.length} pesanan</span>
            )}
            {showAmbil && <span className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 700, color: "#A32E2E", background: "#FBEAEA", border: "1px solid #E8B9B9", padding: "2px 8px", borderRadius: 999 }}><Clock size={11} />{g.ambil}</span>}
            {late && <span className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 700, color: t.error, background: t.errorBg, border: `1px solid #E8B9B9`, padding: "2px 8px", borderRadius: 999 }}><Clock size={11} />Lewat {g.ambil}</span>}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 10, paddingLeft: 42 }}>
        {g.flatItems.map((it, i) => (
          <div key={i} style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.5 }}>
            {it.name}{it.variant ? ` (${it.variant})` : ""} ×{it.qty}
          </div>
        ))}
      </div>
    </div>
  );
}
function Stat({ n, label, tone, active, onClick }: { n: number; label: string; tone?: "ok" | "warn"; active?: boolean; onClick?: () => void }) {
  const col = tone === "ok" ? t.successText : tone === "warn" ? t.error : t.text;
  return (
    <button onClick={onClick}
      style={{ flex: 1, background: active ? t.primaryLight : t.surface,
        border: active ? `1.5px solid ${t.primary}` : `1px solid ${t.border}`,
        borderRadius: 14, padding: "12px 8px", textAlign: "center", cursor: "pointer", fontFamily: "inherit" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: col, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 11.5, color: active ? t.amberText : t.text2, fontWeight: active ? 700 : 400, marginTop: 5 }}>{label}</div>
    </button>
  );
}
function Action({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2" style={{ flex: 1, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: "12px 4px", cursor: "pointer", color: t.text }}>
      <span style={{ color: t.amberText }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight: 700, textAlign: "center", lineHeight: 1.2 }}>{label}</span>
    </button>
  );
}
function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
      <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
        <div style={{ position: "sticky", top: 0, background: t.surface, padding: "16px 20px 12px", borderBottom: `1px solid ${t.divider}` }} className="flex items-center justify-between">
          <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
          <button onClick={onClose} style={{ border: "none", background: t.surfaceSoft, cursor: "pointer", color: t.text2, width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}
const inputStyle: React.CSSProperties = { width: "100%", height: 50, fontSize: 16, color: t.text, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "0 14px", outline: "none", fontFamily: "inherit" };
const btn = (primary: boolean): React.CSSProperties => ({ flex: 1, height: 52, borderRadius: 12, border: primary ? "none" : `1.5px solid ${t.border}`, background: primary ? t.primary : t.surface, color: t.text, fontWeight: 700, fontSize: 15, cursor: "pointer" });
