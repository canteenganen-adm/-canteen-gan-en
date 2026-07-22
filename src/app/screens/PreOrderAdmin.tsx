import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar, Clock, CookingPot, Printer,
  Box, Check, X, Search, Power, AlertCircle, Settings,
  ChevronLeft, ChevronRight, Share2, Copy,
} from "lucide-react";
import { t, STRUK_MONO, STRUK_ZIGZAG } from "../../lib/theme";
import { rupiah, itemsText, serviceDateLabel, nextSchoolDayISO, hhmm, autoClosedNow, wibTimeHHMM, wibTodayISO, reopenActiveNow, wibClock, toTitleCase } from "../../lib/format";
import { TINGKAT_LIST, tingkatColor } from "../../lib/constants";
import type { Transaction, PickupSchedule } from "../../types";


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
  packedAt: string | null;
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
  /** Jam kemas TERBARU di antara pesanan dalam grup ini — tercatat otomatis
   * oleh sistem, bukan diketik admin, jadi jadi bukti objektif jam berapa
   * sebenarnya dikemas (mis. Papa/Mama bisa saling cek siapa lambat). */
  packedAt: string | null;
  flatItems: Transaction["items"];
  /** Daftar item PER PESANAN — pesanan dobel tampil sebagai 2 daftar
   * terpisah (bukan digabung), supaya ketahuan kalau ortu tak sengaja
   * memesan dua kali. */
  perOrder: Transaction["items"][];
  total: number;
};

function mergeOrders(list: AdminOrder[]): MergedGroup[] {
  const map = new Map<string, MergedGroup & { _orders: AdminOrder[] }>();
  for (const o of list) {
    // Nama dinormalkan (spasi ganda/ujung) supaya pesanan anak yang sama
    // tidak pecah jadi dua kartu hanya karena beda ketikan spasi
    const key = `${o.nama.trim().replace(/\s+/g, " ").toLowerCase()}|${o.kelas.trim().toLowerCase()}`;
    if (!map.has(key)) map.set(key, { key, ids: [], nama: o.nama, tingkat: o.tingkat, kelas: o.kelas, ambil: o.ambil, allPacked: true, somePacked: false, packedAt: null, flatItems: [], perOrder: [], total: 0, _orders: [] });
    const g = map.get(key)!;
    g.ids.push(o.id);
    g.allPacked = g.allPacked && o.packed;
    g.somePacked = g.somePacked || o.packed;
    if (o.packedAt && (!g.packedAt || o.packedAt > g.packedAt)) g.packedAt = o.packedAt;
    g.flatItems = [...g.flatItems, ...o.items];
    g.perOrder.push(o.items);
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
  onLihatMenu,
  menuBelumDisimpan,
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
  onLihatMenu: () => void;
  /** true = tanggal sesi belum punya snapshot menu_harian — halaman ortu
   * kosong sampai admin menekan Simpan di tab Menu (kertas PO). */
  menuBelumDisimpan: boolean;
  onOpenSettings: () => void;
}) {
  const [q, setQ] = useState("");
  const [tingkatFilter, setTingkatFilter] = useState("Semua");
  const [sheet, setSheet] = useState<null | "waktu" | "rekap" | "cetak" | "gantiTanggal" | "jamTutup" | "bagikan">(null);
  /** Struk rincian per-item Rekap Masak: ketuk nama menu -> siapa saja yang
   * pesan + jumlahnya (menjawab "siapa yang pesan Bakwan?" tanpa buka
   * satu-satu kartu pesanan). Digabung per anak (nama+kelas) supaya pesanan
   * susulan/dobel tidak tampil sebagai baris terpisah. */
  const [menuDetail, setMenuDetail] = useState<{ name: string; buyers: { nama: string; kelas: string; qty: number }[]; total: number } | null>(null);
  const openMenuDetail = (itemKey: string) => {
    const map = new Map<string, { nama: string; kelas: string; qty: number }>();
    orders.forEach((o) => {
      o.items.forEach((it) => {
        const key = it.name + (it.variant ? " " + it.variant : "");
        if (key !== itemKey) return;
        const buyerKey = `${o.nama.trim().toLowerCase()}|${o.kelas.trim().toLowerCase()}`;
        const existing = map.get(buyerKey);
        if (existing) existing.qty += it.qty;
        else map.set(buyerKey, { nama: o.nama, kelas: o.kelas || o.tingkat, qty: it.qty });
      });
    });
    const buyers = Array.from(map.values()).sort((a, b) => a.nama.localeCompare(b.nama, "id"));
    setMenuDetail({ name: itemKey, buyers, total: buyers.reduce((s, b) => s + b.qty, 0) });
  };
  const [linkCopied, setLinkCopied] = useState(false);
  const poLink = `${window.location.origin}/pesan`;
  const handleCopyLink = () => {
    navigator.clipboard.writeText(poLink).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };
  const handleShareLinkWA = () => {
    const text = encodeURIComponent(
      open
        ? `Halo Papa/Mama,\n\nPre-order Kantin Gan En untuk ${serviceDateLabel(serviceDate)} telah dibuka.\n\nSilakan melakukan pemesanan melalui tautan berikut:\n${poLink}\n\nGan En 🙏🏻`
        : "Pre-order untuk tanggal ini sudah ditutup."
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };
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

  /* Tanggal yang DILIHAT di daftar pesanan — terpisah dari sesi live.
     Geser < > untuk menengok hari lain (kemarin/besok) tanpa pernah
     menyentuh buka/tutup/tanggal sesi PO yang sedang berjalan. */
  const [viewDate, setViewDate] = useState(serviceDate);
  useEffect(() => { setViewDate(serviceDate); }, [serviceDate]);
  const shiftDay = (n: number) => {
    const d = new Date(viewDate + "T00:00:00");
    d.setDate(d.getDate() + n);
    setViewDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  };
  const lihatSesi = viewDate === serviceDate;

  const orders: AdminOrder[] = useMemo(
    () =>
      transactions
        .filter((tx) => tx.source === "preorder" && tx.serviceDate === viewDate && !tx.cancelledAt)
        .map((tx) => ({
          id: tx.id,
          nama: tx.customer.nama,
          tingkat: tx.customer.tingkat || "",
          kelas: tx.customer.kelas,
          ambil: tx.waktuAmbil || defaultAmbil,
          packed: !!tx.packed,
          packedAt: tx.packedAt ?? null,
          items: tx.items,
          total: tx.total,
        })),
    [transactions, viewDate, defaultAmbil]
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

  // Deteksi telat: HANYA untuk pesanan hari ini (viewDate = tanggal WIB
  // sekarang) + Belum Dikemas + jam WIB sekarang > jam waktu ambil untuk
  // tingkat tsb. Tanpa penjaga tanggal ini, pesanan sesi BESOK yang dilihat
  // sore/malam ini bisa salah ditandai "telat" — jam ambilnya memang sudah
  // lewat dibanding jam SEKARANG, tapi pesanannya untuk hari lain.
  // Guru/Karyawan hanya dianggap telat jika byTingkat diisi secara eksplisit.
  const isGroupLate = (g: MergedGroup): boolean => {
    if (viewDate !== wibTodayISO()) return false;
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

  const pickNextSchoolDay = () => {
    onServiceDateChange(nextSchoolDayISO());
    setSheet(null);
  };

  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 90px" }}>

        <div style={{ padding: "20px 20px 12px" }}>
          <div className="flex items-center justify-between">
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>Pre-order</div>
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

            {/* Tanggal Layanan: panah kiri/kanan = jelajah pesanan hari lain
                (TANPA menyentuh sesi); ketuk tanggal di tengah = Ganti Tanggal. */}
            <div className="flex items-center gap-1" style={{ marginTop: 10 }}>
              <button onClick={() => shiftDay(-1)} aria-label="Hari sebelumnya"
                style={{ width: 44, height: 48, borderRadius: 12, border: "none", background: "transparent", color: t.text2, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}>
                <ChevronLeft size={22} />
              </button>
              <button onClick={() => setSheet("gantiTanggal")}
                className="flex items-center justify-center gap-2"
                style={{ flex: 1, minHeight: 48, background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
                <Calendar size={19} color={t.amberText} style={{ flex: "none" }} />
                <span style={{ fontSize: 21, fontWeight: 800, color: lihatSesi ? t.text : t.amberText, textAlign: "center", lineHeight: 1.25 }}>
                  {serviceDateLabel(viewDate)}
                </span>
              </button>
              <button onClick={() => shiftDay(1)} aria-label="Hari berikutnya"
                style={{ width: 44, height: 48, borderRadius: 12, border: "none", background: "transparent", color: t.text2, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}>
                <ChevronRight size={22} />
              </button>
            </div>
            {!lihatSesi && (
              /* Satu baris kecil, tanpa kotak — tidak mengganggu widget */
              <button onClick={() => setViewDate(serviceDate)}
                style={{ display: "block", margin: "0 auto", background: "transparent", border: "none", minHeight: 34, padding: "2px 12px", color: t.amberText, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Kembali ke Hari Ini
              </button>
            )}

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
            <Action icon={<Share2 size={20} />} label="Bagikan Link" onClick={() => setSheet("bagikan")} />
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
          <div className="flex gap-2 hscroll" style={{ marginTop: 10, overflowX: "auto", paddingBottom: 2 }}>
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

          {/* Guard: menu tanggal sesi belum disimpan → halaman ortu kosong */}
          {menuBelumDisimpan && (
            <button onClick={onLihatMenu} className="flex items-center gap-2"
              style={{ width: "100%", padding: "11px 14px", marginBottom: 10, background: "#FFF4DA", border: "1.5px solid #F1DFB0", borderRadius: 12, color: t.amberText, fontWeight: 700, fontSize: 13.5, cursor: "pointer", textAlign: "left" }}>
              <AlertCircle size={16} style={{ flex: "none" }} />
              <span style={{ flex: 1 }}>Menu untuk {dateLabel} belum disimpan — ortu belum bisa melihat menu. Ketuk untuk mengatur & Simpan.</span>
            </button>
          )}

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

          <div style={{ fontSize: 13, fontWeight: 800, color: t.text, margin: "8px 2px 10px" }}>
            {lihatSesi ? "Pesanan Hari Ini" : `Pesanan ${serviceDateLabel(viewDate)}`}
          </div>
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
          {/* Pola wajib CLAUDE.md: input date overlay inset:0 MENERIMA ketukan
              langsung (bukan pointerEvents:none + skrip pembuka yang gagal
              senyap di HP). showPicker di onClick = pemanis desktop. */}
          <div className="flex items-center gap-3"
            style={{ position: "relative", height: 56, borderRadius: 14, border: `1.5px solid ${t.border}`, background: t.surface, padding: "0 16px", cursor: "pointer" }}>
            <Calendar size={18} color={t.amberText} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>Pilih tanggal lain</span>
            <input
              ref={gantiTanggalRef}
              type="date"
              value={serviceDate}
              onChange={(e) => { if (e.target.value) { onServiceDateChange(e.target.value); setSheet(null); } }}
              onClick={() => { try { gantiTanggalRef.current?.showPicker?.(); } catch { /* native fallback */ } }}
              aria-label="Pilih tanggal lain"
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
            />
          </div>
        </Sheet>
      )}
      {sheet === "jamTutup" && (
        <Sheet title="Jam Tutup Otomatis" onClose={() => setSheet(null)}>
          <div style={{ fontSize: 13, color: t.text2, marginBottom: 14 }}>Pre-order otomatis ditutup pada jam ini di hari layanan. Ditegakkan di server — bukan cuma tampilan.</div>
          <div style={{ position: "relative", height: 84, borderRadius: 16, border: `1.5px solid ${t.border}`, background: t.surfaceSoft, cursor: "pointer", display: "grid", placeItems: "center" }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: t.amberText, fontVariantNumeric: "tabular-nums" }}>{hhmm(autoCloseTime)}</span>
            <input
              ref={jamTutupRef}
              type="time"
              value={hhmm(autoCloseTime)}
              onChange={(e) => e.target.value && onAutoCloseTimeChange(e.target.value + ":00")}
              onClick={() => { try { jamTutupRef.current?.showPicker?.(); } catch { /* native fallback */ } }}
              aria-label="Jam Tutup Otomatis"
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
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
      {sheet === "bagikan" && (
        <Sheet title="Bagikan Link Pemesanan" onClose={() => setSheet(null)}>
          <div style={{ fontSize: 13, color: t.text2, marginBottom: 12 }}>
            Link untuk {serviceDateLabel(serviceDate)}. {open ? "Pre-order sedang dibuka." : "Saat ini ditutup."}
          </div>
          <div style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 13.5, color: t.text2, wordBreak: "break-all", marginBottom: 14 }}>{poLink}</div>
          <div className="flex gap-2">
            <button onClick={handleCopyLink} className="flex items-center justify-center gap-2"
              style={{ flex: 1, height: 52, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              {linkCopied ? <Check size={18} /> : <Copy size={18} />} {linkCopied ? "Tersalin!" : "Salin Link"}
            </button>
            <button onClick={handleShareLinkWA} className="flex items-center justify-center gap-2"
              style={{ flex: 1, height: 52, borderRadius: 12, border: "none", background: t.primary, color: t.text, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              <Share2 size={18} /> WhatsApp
            </button>
          </div>
        </Sheet>
      )}
      {sheet === "rekap" && (
        <Sheet title="Rekap Masak" onClose={() => setSheet(null)}>
          <div style={{ fontSize: 13, color: t.text2, marginBottom: 6 }}>{serviceDateLabel(viewDate)} · semua pesanan</div>
          {Object.entries(
            orders.reduce<Record<string, number>>((acc, o) => {
              o.items.forEach((it) => { const k = it.name + (it.variant ? " " + it.variant : ""); acc[k] = (acc[k] || 0) + it.qty; });
              return acc;
            }, {})
          ).sort((a, b) => a[0].localeCompare(b[0], "id")).map(([name, qty]) => (
            <button key={name} onClick={() => openMenuDetail(name)}
              className="flex items-center justify-between" style={{ width: "100%", padding: "13px 0", borderBottom: `1px solid ${t.divider}`, background: "transparent", border: "none", borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: t.divider, cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{toTitleCase(name)}</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{qty}</span>
            </button>
          ))}
          {orders.length === 0 && <div style={{ textAlign: "center", padding: "24px 0", color: t.text2, fontSize: 14 }}>Belum ada pesanan.</div>}
          <div style={{ fontSize: 12.5, color: t.text2, marginTop: 14 }}>Ketuk nama menu untuk melihat siapa saja yang pesan.</div>
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

      {/* Popup struk RINCIAN PER-MENU (dari Rekap Masak) — siapa saja yang
          pesan menu ini + jumlahnya. Melayang di tengah seperti struk lain. */}
      {menuDetail && (
        <div style={{ position: "fixed", inset: 0, zIndex: 85, display: "grid", placeItems: "center", padding: 20 }}>
          <div onClick={() => setMenuDetail(null)} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.4)" }} />
          <div style={{ position: "relative", width: "100%", maxWidth: 330, filter: "drop-shadow(0 12px 30px rgba(47,42,36,.32))" }}>
            <div style={{ background: t.surface, clipPath: STRUK_ZIGZAG, padding: "20px 18px 18px", fontFamily: STRUK_MONO, fontWeight: 600 }}>
              <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800 }}>{toTitleCase(menuDetail.name)}</div>
              <div style={{ borderTop: `1.5px dashed ${t.border}`, margin: "10px 0" }} />
              {menuDetail.buyers.length === 0 ? (
                <div style={{ textAlign: "center", fontSize: 13, color: t.text2, padding: "8px 0" }}>Belum ada yang pesan.</div>
              ) : menuDetail.buyers.map((b, i) => (
                <div key={i} className="flex justify-between" style={{ fontSize: 13, lineHeight: 1.85, gap: 8 }}>
                  <span>{b.nama} {b.kelas}</span>
                  <span style={{ flex: "none" }}>({b.qty})</span>
                </div>
              ))}
              <div style={{ borderTop: `1.5px dashed ${t.border}`, margin: "10px 0" }} />
              <div className="flex justify-between" style={{ fontSize: 14, fontWeight: 800 }}>
                <span>TOTAL</span><span>{menuDetail.total}</span>
              </div>
            </div>
            <button onClick={() => setMenuDetail(null)} aria-label="Tutup rincian menu"
              style={{ position: "absolute", top: -12, right: -8, width: 42, height: 42, borderRadius: "50%", border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 4px 12px rgba(47,42,36,.2)" }}>
              <X size={19} />
            </button>
          </div>
        </div>
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
  // Satu aksen saja untuk "telat" — garis kiri merah tipis, border sisi
  // lain tetap netral. Border merah PENUH + garis kiri tebal sekaligus
  // (sebelumnya) bikin kartu kelihatan berat/tidak rapi.
  const cardBorder = g.allPacked ? "#D8E6D4" : t.border;
  return (
    <div onClick={onTap}
      style={{ background: t.surface, border: `1.5px solid ${cardBorder}`, borderLeft: late ? `3px solid ${t.error}` : `1.5px solid ${cardBorder}`, borderRadius: 14, padding: 14, marginBottom: 9, cursor: "pointer" }}>
      <div className="flex items-center gap-3">
        <div style={{ flex: "none", width: 30, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, flex: "none", display: "grid", placeItems: "center",
            background: checkBg, border: `2px solid ${checkBorder}`, color: "#fff" }}>
            {g.allPacked && <Check size={18} />}
            {partial && <span style={{ width: 12, height: 2, background: t.text, borderRadius: 2, display: "block" }} />}
          </span>
          {/* Jam kemas — tercatat OTOMATIS oleh sistem (bukan diketik admin),
              bukti objektif kapan sebenarnya dikemas; mutlak tidak bisa diubah manual. */}
          {g.allPacked && g.packedAt && (
            <span style={{ fontSize: 10, fontWeight: 700, color: t.text2, whiteSpace: "nowrap" }}>{wibClock(g.packedAt)}</span>
          )}
        </div>
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
        {g.perOrder.length <= 1 ? (
          g.flatItems.map((it, i) => (
            <div key={i} style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.5 }}>
              {toTitleCase(it.name)}{it.variant ? ` (${it.variant})` : ""} ×{it.qty}
            </div>
          ))
        ) : (
          /* Pesanan dobel/tripel: daftar per pesanan DIPISAH, tidak digabung —
             supaya langsung kelihatan kalau ortu tak sengaja pesan 2× */
          g.perOrder.map((items, oi) => (
            <div key={oi} style={{ borderLeft: `3px solid ${t.primary}`, paddingLeft: 10, marginBottom: oi < g.perOrder.length - 1 ? 10 : 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: t.amberText, letterSpacing: ".04em" }}>PESANAN {oi + 1}</div>
              {items.map((it, i) => (
                <div key={i} style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.5 }}>
                  {toTitleCase(it.name)}{it.variant ? ` (${it.variant})` : ""} ×{it.qty}
                </div>
              ))}
            </div>
          ))
        )}
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
  // Pelindung ghost-tap di HP: ketukan yang membuka sheet tidak boleh ikut
  // menekan tombol yang muncul di posisi jari (mis. "Hari Sekolah Berikutnya").
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(id);
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end", pointerEvents: ready ? "auto" : "none" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
      <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
        <div style={{ position: "sticky", top: 0, background: t.surface, padding: "16px 20px 12px", borderBottom: `1px solid ${t.divider}` }} className="flex items-center justify-between">
          <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
          <button onClick={onClose} aria-label="Tutup"
            style={{ border: `1.5px solid ${t.border}`, background: t.surface, cursor: "pointer", color: t.text, width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center", boxShadow: "0 2px 6px rgba(47,42,36,.1)" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}
