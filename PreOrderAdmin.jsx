import React, { useState, useMemo, useEffect } from "react";
import {
  Calendar, Link2, Copy, Share2, Clock, CookingPot, Printer,
  Box, Check, X, ChevronRight, Search, Plus, Trash2, Power, AlertCircle,
} from "lucide-react";

/* ============================================================
   PRE-ORDER (ADMIN) — versi SEDERHANA (untuk mama, gaptek-friendly)
   Masukan mama: "Sebelum masuk" hampir tak ada; mayoritas Istirahat 1;
   Istirahat 1 tak perlu label; yang beda (Ist 2 / Pulang) minim → pisahkan.
   → TANPA filter/dropdown. Cuma kotak Cari.
     Daftar utama = Istirahat 1 (tanpa label). Bagian "Ambil beda waktu"
     hanya untuk Istirahat 2 / Pulang. Ketuk kartu = Sudah Dikemas.
   ============================================================ */

const t = {
  primary: "#FDB833", primaryLight: "#FFF1CC", bg: "#FAF6EE",
  surface: "#FFFCF7", surfaceSoft: "#FFF8EE",
  text: "#2F2A24", text2: "#756B5D", textDis: "#B7AEA0",
  success: "#6FA76D", successBg: "#EAF5E6", successText: "#3F6B43",
  error: "#D95D5D", errorBg: "#FBEAEA",
  border: "#E8E0D2", divider: "#F1EBE0", amberText: "#9A6700",
};
const rupiah = (n) => "Rp" + (n ?? 0).toLocaleString("id-ID");
const itemsText = (items) => items.map((i) => `${i.name}${i.variant ? " " + i.variant : ""} ×${i.qty}`).join(", ");
const DEFAULT_AMBIL = "Istirahat 1";

const PRESETS0 = ["Istirahat 1", "Istirahat 2", "Istirahat 3", "Pulang Sekolah"];
const ORDERS0 = [
  { id: "o1", nama: "Aisyah Putri", tingkat: "SD", kelas: "3B", ambil: "Istirahat 1", packed: false, items: [{ name: "Nasi Hainan", price: 15000, qty: 1 }, { name: "Telur Balado", price: 5000, qty: 1 }], total: 20000 },
  { id: "o2", nama: "Bima Saputra", tingkat: "SD", kelas: "5A", ambil: "Istirahat 1", packed: true, items: [{ name: "Nasi Goreng Kecap", variant: "M", price: 12000, qty: 1 }], total: 12000 },
  { id: "o3", nama: "Rafa Putri", tingkat: "TK A", kelas: "", ambil: "Istirahat 1", packed: false, items: [{ name: "Bubur Ayam", price: 10000, qty: 1 }], total: 10000 },
  { id: "o4", nama: "Citra Dewi", tingkat: "SMP", kelas: "8A", ambil: "Istirahat 2", packed: false, items: [{ name: "Mie Goreng", price: 12000, qty: 1 }, { name: "Puding + Vla", variant: "Coklat", price: 5000, qty: 1 }], total: 17000 },
  { id: "o5", nama: "Dimas Aji", tingkat: "SD", kelas: "4A", ambil: "Pulang Sekolah", packed: false, items: [{ name: "Corndog", price: 10000, qty: 1 }], total: 10000 },
];

const kelasLabel = (o) => (o.kelas ? `${o.tingkat} · ${o.kelas}` : o.tingkat);

export default function PreOrderAdmin() {
  const [serviceDate, setServiceDate] = useState("2026-06-30");
  const [openPO, setOpenPO] = useState(true);
  const [orders, setOrders] = useState(ORDERS0);
  const [presets, setPresets] = useState(PRESETS0);
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState(null);

  useEffect(() => {
    const l = document.createElement("link"); l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(l);
  }, []);

  const packed = orders.filter((o) => o.packed).length;
  const belum = orders.length - packed;
  const togglePack = (id) => setOrders((os) => os.map((o) => (o.id === id ? { ...o, packed: !o.packed } : o)));

  const ql = q.toLowerCase().trim();
  const match = (o) => `${o.nama} ${o.tingkat} ${o.kelas}`.toLowerCase().includes(ql);
  const utama = orders.filter((o) => o.ambil === DEFAULT_AMBIL && match(o));
  const beda = orders.filter((o) => o.ambil !== DEFAULT_AMBIL && match(o));

  const dateLabel = useMemo(() => {
    const d = new Date(serviceDate + "T00:00:00");
    const hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][d.getDay()];
    const bln = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][d.getMonth()];
    return `${hari}, ${d.getDate()} ${bln} ${d.getFullYear()}`;
  }, [serviceDate]);

  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", minHeight: "100vh" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 90px" }}>

        <div style={{ padding: "20px 20px 12px" }}>
          <div className="flex items-center justify-between">
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>Pre-order</div>
            <button onClick={() => setOpenPO(!openPO)} className="flex items-center gap-2"
              style={{ height: 38, padding: "0 14px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 13.5, border: "none",
                background: openPO ? t.successBg : t.errorBg, color: openPO ? t.successText : t.error }}>
              <Power size={15} /> {openPO ? "Dibuka" : "Ditutup"}
            </button>
          </div>

          {/* Tanggal Layanan */}
          <label className="flex items-center gap-3" style={{ marginTop: 14, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 14, padding: "12px 14px", cursor: "pointer", position: "relative" }}>
            <span style={{ width: 42, height: 42, borderRadius: 11, background: t.primaryLight, color: t.amberText, display: "grid", placeItems: "center", flex: "none" }}><Calendar size={22} /></span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: t.text2 }}>Tanggal Layanan</span>
              <span style={{ display: "block", fontSize: 16, fontWeight: 700, marginTop: 2 }}>{dateLabel}</span>
            </span>
            <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} />
            <ChevronRight size={18} color={t.textDis} />
          </label>

          {/* Ringkasan */}
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

        {/* Daftar utama — Istirahat 1, TANPA label */}
        <div style={{ padding: "0 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.text, margin: "8px 2px 10px" }}>Pesanan Hari Ini</div>
          {utama.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: t.text2, fontSize: 14 }}>{q ? "Tidak ada yang cocok." : "Belum ada pesanan."}</div>
          ) : utama.map((o) => <OrderCard key={o.id} o={o} onTap={() => togglePack(o.id)} />)}

          {/* Ambil beda waktu — hanya kalau ada */}
          {beda.length > 0 && (
            <>
              <div className="flex items-center gap-2" style={{ margin: "20px 2px 10px", color: t.amberText }}>
                <AlertCircle size={16} />
                <span style={{ fontSize: 13, fontWeight: 800 }}>Ambil beda waktu</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: t.text2, background: t.primaryLight, padding: "1px 8px", borderRadius: 999 }}>{beda.length}</span>
              </div>
              {beda.map((o) => <OrderCard key={o.id} o={o} onTap={() => togglePack(o.id)} showAmbil />)}
            </>
          )}
        </div>
      </div>

      {/* Sheets */}
      {sheet === "link" && (
        <Sheet title="Bagikan Link Pre-order" onClose={() => setSheet(null)}>
          <div style={{ fontSize: 13, color: t.text2, marginBottom: 12 }}>Link untuk {dateLabel}. {openPO ? "Pre-order sedang dibuka." : "Saat ini ditutup."}</div>
          <div style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 13.5, color: t.text2, wordBreak: "break-all", marginBottom: 14 }}>kantingan.en/po/2026-06-30</div>
          <div className="flex gap-2">
            <button className="flex items-center justify-center gap-2" style={btn(false)}><Copy size={18} /> Salin Link</button>
            <button className="flex items-center justify-center gap-2" style={btn(true)}><Share2 size={18} /> WhatsApp</button>
          </div>
        </Sheet>
      )}
      {sheet === "waktu" && (
        <Sheet title="Preset Waktu Ambil" onClose={() => setSheet(null)}>
          <div style={{ fontSize: 13, color: t.text2, marginBottom: 12 }}>Pilihan yang muncul di form orang tua. Tanpa jam spesifik.</div>
          {presets.map((p, i) => (
            <div key={i} className="flex items-center gap-2" style={{ marginBottom: 8 }}>
              <input value={p} onChange={(e) => setPresets(presets.map((x, j) => (j === i ? e.target.value : x)))} style={{ ...inputStyle, flex: 1 }} />
              <button onClick={() => setPresets(presets.filter((_, j) => j !== i))} style={{ width: 48, height: 50, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.error, cursor: "pointer", display: "grid", placeItems: "center" }}><Trash2 size={18} /></button>
            </div>
          ))}
          <button onClick={() => setPresets([...presets, "Waktu baru"])} className="flex items-center justify-center gap-2" style={{ width: "100%", height: 48, borderRadius: 12, border: `1.5px dashed ${t.primary}`, background: t.surfaceSoft, color: t.amberText, fontWeight: 700, cursor: "pointer" }}><Plus size={18} /> Tambah Waktu</button>
        </Sheet>
      )}
      {sheet === "rekap" && (
        <Sheet title="Rekap Masak" onClose={() => setSheet(null)}>
          <div style={{ fontSize: 13, color: t.text2, marginBottom: 6 }}>{dateLabel} · semua pesanan</div>
          {Object.entries(orders.reduce((acc, o) => { o.items.forEach((it) => { const k = it.name + (it.variant ? " " + it.variant : ""); acc[k] = (acc[k] || 0) + it.qty; }); return acc; }, {})).sort((a, b) => b[1] - a[1]).map(([name, qty]) => (
            <div key={name} className="flex items-center justify-between" style={{ padding: "13px 0", borderBottom: `1px solid ${t.divider}` }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{name}</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{qty}</span>
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: t.text2, marginTop: 14 }}>Cukup angka untuk dapur — tanpa nama murid.</div>
        </Sheet>
      )}
      {sheet === "print" && (
        <Sheet title="Print" onClose={() => setSheet(null)}>
          {[["Rekap per Kelas", Box], ["Rekap per Menu", CookingPot], ["Label Pesanan", Box]].map(([label, Ic]) => (
            <button key={label} className="flex items-center gap-3" style={{ width: "100%", height: 56, marginBottom: 10, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, cursor: "pointer", padding: "0 16px", color: t.text }}>
              <Ic size={20} color={t.amberText} /><span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: 700 }}>{label}</span><Printer size={18} color={t.textDis} />
            </button>
          ))}
        </Sheet>
      )}
    </div>
  );
}

/* ---- bits ---- */
function OrderCard({ o, onTap, showAmbil }) {
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
function Stat({ n, label, tone }) {
  const col = tone === "ok" ? t.successText : tone === "warn" ? t.amberText : t.text;
  return (
    <div style={{ flex: 1, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: "12px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: col, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 11.5, color: t.text2, marginTop: 5 }}>{label}</div>
    </div>
  );
}
function Action({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2" style={{ flex: 1, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: "12px 4px", cursor: "pointer", color: t.text }}>
      <span style={{ color: t.amberText }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight: 700, textAlign: "center", lineHeight: 1.2 }}>{label}</span>
    </button>
  );
}
function Sheet({ title, children, onClose }) {
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
const inputStyle = { width: "100%", height: 50, fontSize: 16, color: t.text, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "0 14px", outline: "none", fontFamily: "inherit" };
const btn = (primary) => ({ flex: 1, height: 52, borderRadius: 12, border: primary ? "none" : `1.5px solid ${t.border}`, background: primary ? t.primary : t.surface, color: t.text, fontWeight: 700, fontSize: 15, cursor: "pointer" });
