import { useMemo, useRef, useState, type RefObject } from "react";
import {
  Calendar, Link2, Copy, Share2, Clock, CookingPot, Printer,
  Box, Check, X, ChevronRight, Search, Plus, Trash2, Power, AlertCircle, Settings,
} from "lucide-react";
import { t } from "../../lib/theme";
import { rupiah, itemsText, serviceDateLabel } from "../../lib/format";
import type { Transaction } from "../../types";

/* ============================================================
   PRE-ORDER (ADMIN) — versi SEDERHANA (untuk mama, gaptek-friendly)
   TANPA filter/dropdown. Cuma kotak Cari. Daftar utama = preset
   pertama (mis. "Istirahat 1"), TANPA label. Bagian "Ambil beda
   waktu" untuk preset lainnya. Ketuk kartu = toggle Sudah Dikemas.
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

export default function PreOrderAdmin({
  serviceDate,
  onServiceDateChange,
  open,
  onToggleOpen,
  presets,
  onPresetsChange,
  transactions,
  onTogglePacked,
  poLink,
  onOpenSettings,
}: {
  serviceDate: string;
  onServiceDateChange: (d: string) => void;
  open: boolean;
  onToggleOpen: () => void;
  presets: string[];
  onPresetsChange: (presets: string[]) => void;
  transactions: Transaction[];
  onTogglePacked: (id: string) => void;
  poLink: string;
  onOpenSettings: () => void;
}) {
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState<null | "link" | "waktu" | "rekap" | "print">(null);
  const [copied, setCopied] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const defaultAmbil = presets[0] || "Istirahat 1";

  const orders: AdminOrder[] = useMemo(
    () =>
      transactions
        .filter((tx) => tx.source === "preorder" && tx.serviceDate === serviceDate)
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

  const ql = q.toLowerCase().trim();
  const match = (o: AdminOrder) => `${o.nama} ${o.tingkat} ${o.kelas}`.toLowerCase().includes(ql);
  const utama = orders.filter((o) => o.ambil === defaultAmbil && match(o));
  const beda = orders.filter((o) => o.ambil !== defaultAmbil && match(o));

  const dateLabel = useMemo(() => serviceDateLabel(serviceDate), [serviceDate]);

  const handleCopy = () => {
    navigator.clipboard.writeText(poLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleShareWA = () => {
    const text = encodeURIComponent(
      `Pre-order Kantin Gan En untuk ${dateLabel} sudah ${open ? "DIBUKA" : "DITUTUP"}!\n\n${open ? `Pesan di sini:\n${poLink}` : "Pre-order untuk tanggal ini sudah ditutup."}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 90px" }}>

        <div style={{ padding: "20px 20px 12px" }}>
          <div className="flex items-center justify-between">
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>Pre-order</div>
            <div className="flex items-center gap-2">
              <button onClick={onToggleOpen} className="flex items-center gap-2"
                style={{ height: 38, padding: "0 14px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 13.5, border: "none",
                  background: open ? t.successBg : t.errorBg, color: open ? t.successText : t.error }}>
                <Power size={15} /> {open ? "Dibuka" : "Ditutup"}
              </button>
              <button
                onClick={onOpenSettings}
                aria-label="Pengaturan"
                style={{ width: 38, height: 38, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}
              >
                <Settings size={17} />
              </button>
            </div>
          </div>

          {/* Tanggal Layanan — seluruh kartu adalah tombol; klik di mana saja
              membuka date picker secara eksplisit lewat showPicker()/click(),
              bukan mengandalkan hit-testing input tersembunyi. Diprioritaskan
              untuk admin yang kurang terbiasa teknologi — tidak ada area kecil
              yang harus dicari. */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => openDatePicker(dateInputRef)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDatePicker(dateInputRef); }
            }}
            className="flex items-center gap-3"
            style={{ marginTop: 14, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 14, padding: "12px 14px", cursor: "pointer", position: "relative" }}
          >
            <span style={{ width: 42, height: 42, borderRadius: 11, background: t.primaryLight, color: t.amberText, display: "grid", placeItems: "center", flex: "none" }}><Calendar size={22} /></span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: t.text2 }}>Tanggal Layanan</span>
              <span style={{ display: "block", fontSize: 16, fontWeight: 700, marginTop: 2 }}>{dateLabel}</span>
            </span>
            <input
              ref={dateInputRef}
              type="date"
              value={serviceDate}
              onChange={(e) => onServiceDateChange(e.target.value)}
              aria-label="Pilih Tanggal Layanan"
              tabIndex={-1}
              style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
            />
            <ChevronRight size={18} color={t.textDis} />
          </div>

          {/* Ringkasan hari ini */}
          <div className="flex gap-2" style={{ marginTop: 12 }}>
            <Stat n={orders.length} label="Pesanan" />
            <Stat n={packed} label="Sudah Dikemas" tone="ok" />
            <Stat n={belum} label="Belum Dikemas" tone="warn" />
          </div>

          {/* Actions */}
          <div className="flex gap-2" style={{ marginTop: 12 }}>
            <Action icon={<Link2 size={20} />} label="Bagikan Link" onClick={() => setSheet("link")} />
            <Action icon={<Clock size={20} />} label="Waktu Ambil" onClick={() => setSheet("waktu")} />
            <Action icon={<CookingPot size={20} />} label="Rekap Masak" onClick={() => setSheet("rekap")} />
            <Action icon={<Printer size={20} />} label="Print" onClick={() => setSheet("print")} />
          </div>

          {/* Cari (satu-satunya kontrol daftar) */}
          <div className="flex items-center gap-2" style={{ marginTop: 14, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "0 12px", height: 50 }}>
            <Search size={20} color={t.text2} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama murid…"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 15.5, width: "100%", color: t.text, fontFamily: "inherit" }} />
            {q && <X size={18} color={t.text2} style={{ cursor: "pointer" }} onClick={() => setQ("")} />}
          </div>
        </div>

        {/* Daftar utama — preset pertama, TANPA label */}
        <div style={{ padding: "0 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.text, margin: "8px 2px 10px" }}>Pesanan Hari Ini</div>
          {utama.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: t.text2, fontSize: 14 }}>{q ? "Tidak ada yang cocok." : "Belum ada pesanan."}</div>
          ) : utama.map((o) => <OrderCard key={o.id} o={o} onTap={() => onTogglePacked(o.id)} />)}

          {/* Ambil beda waktu — hanya kalau ada */}
          {beda.length > 0 && (
            <>
              <div className="flex items-center gap-2" style={{ margin: "20px 2px 10px", color: t.amberText }}>
                <AlertCircle size={16} />
                <span style={{ fontSize: 13, fontWeight: 800 }}>Ambil beda waktu</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: t.text2, background: t.primaryLight, padding: "1px 8px", borderRadius: 999 }}>{beda.length}</span>
              </div>
              {beda.map((o) => <OrderCard key={o.id} o={o} onTap={() => onTogglePacked(o.id)} showAmbil />)}
            </>
          )}
        </div>
      </div>

      {/* Sheets */}
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
      {sheet === "waktu" && (
        <Sheet title="Preset Waktu Ambil" onClose={() => setSheet(null)}>
          <div style={{ fontSize: 13, color: t.text2, marginBottom: 12 }}>Pilihan yang muncul di form orang tua. Preset pertama tampil tanpa label di daftar utama. Tanpa jam spesifik.</div>
          {presets.map((p, i) => (
            <div key={i} className="flex items-center gap-2" style={{ marginBottom: 8 }}>
              <input value={p} onChange={(e) => onPresetsChange(presets.map((x, j) => (j === i ? e.target.value : x)))} style={{ ...inputStyle, flex: 1 }} />
              <button onClick={() => onPresetsChange(presets.filter((_, j) => j !== i))} style={{ width: 48, height: 50, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.error, cursor: "pointer", display: "grid", placeItems: "center" }}><Trash2 size={18} /></button>
            </div>
          ))}
          <button onClick={() => onPresetsChange([...presets, "Waktu baru"])} className="flex items-center justify-center gap-2" style={{ width: "100%", height: 48, borderRadius: 12, border: `1.5px dashed ${t.primary}`, background: t.surfaceSoft, color: t.amberText, fontWeight: 700, cursor: "pointer" }}><Plus size={18} /> Tambah Waktu</button>
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
          ).sort((a, b) => b[1] - a[1]).map(([name, qty]) => (
            <div key={name} className="flex items-center justify-between" style={{ padding: "13px 0", borderBottom: `1px solid ${t.divider}` }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{name}</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{qty}</span>
            </div>
          ))}
          {orders.length === 0 && <div style={{ textAlign: "center", padding: "24px 0", color: t.text2, fontSize: 14 }}>Belum ada pesanan.</div>}
          <div style={{ fontSize: 12.5, color: t.text2, marginTop: 14 }}>Cukup angka untuk dapur — tanpa nama murid.</div>
        </Sheet>
      )}
      {sheet === "print" && (
        <Sheet title="Print" onClose={() => setSheet(null)}>
          {([["Rekap per Kelas", Box], ["Rekap per Menu", CookingPot], ["Label Pesanan", Box]] as const).map(([label, Ic]) => (
            <button key={label} className="flex items-center gap-3" style={{ width: "100%", height: 56, marginBottom: 10, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, cursor: "pointer", padding: "0 16px", color: t.text }}>
              <Ic size={20} color={t.amberText} /><span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: 700 }}>{label}</span><Printer size={18} color={t.textDis} />
            </button>
          ))}
          <div style={{ fontSize: 12, color: t.text2, textAlign: "center", marginTop: 6 }}>Print thermal — segera hadir.</div>
        </Sheet>
      )}
    </div>
  );
}

/* ---- bits ---- */
/** Buka date picker native secara eksplisit — tidak bergantung pada di mana
 * tepatnya pengguna klik di dalam input, supaya seluruh kartu bisa jadi
 * pemicu (showPicker() bila didukung, fallback ke click()/focus()). */
function openDatePicker(ref: RefObject<HTMLInputElement | null>) {
  const el = ref.current;
  if (!el) return;
  const withPicker = el as HTMLInputElement & { showPicker?: () => void };
  if (typeof withPicker.showPicker === "function") {
    try { withPicker.showPicker(); return; } catch { /* fall through to click() */ }
  }
  el.focus();
  el.click();
}

function kelasLabel(o: AdminOrder) {
  return o.kelas ? `${o.tingkat} · ${o.kelas}` : o.tingkat;
}
function OrderCard({ o, onTap, showAmbil }: { o: AdminOrder; onTap: () => void; showAmbil?: boolean }) {
  return (
    <div className="flex items-center gap-3" onClick={onTap}
      style={{ background: t.surface, border: `1px solid ${o.packed ? "#D8E6D4" : t.border}`, borderRadius: 14, padding: 14, marginBottom: 9, cursor: "pointer" }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, flex: "none", display: "grid", placeItems: "center",
        background: o.packed ? t.success : t.surface, border: `2px solid ${o.packed ? t.success : t.border}`, color: "#fff" }}>
        {o.packed && <Check size={18} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 15, fontWeight: 700, textDecoration: o.packed ? "line-through" : "none", color: o.packed ? t.text2 : t.text }}>{o.nama}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: t.text2, background: t.surfaceSoft, border: `1px solid ${t.border}`, padding: "1px 7px", borderRadius: 999 }}>{kelasLabel(o)}</span>
          {showAmbil && <span className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 700, color: t.amberText, background: t.primaryLight, padding: "1px 7px", borderRadius: 999 }}><Clock size={11} />{o.ambil}</span>}
        </div>
        <div style={{ fontSize: 13, color: t.text2, marginTop: 3 }}>{itemsText(o.items)}</div>
      </div>
      <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap" }}>{rupiah(o.total)}</div>
    </div>
  );
}
function Stat({ n, label, tone }: { n: number; label: string; tone?: "ok" | "warn" }) {
  const col = tone === "ok" ? t.successText : tone === "warn" ? t.amberText : t.text;
  return (
    <div style={{ flex: 1, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: "12px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: col, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 11.5, color: t.text2, marginTop: 5 }}>{label}</div>
    </div>
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
