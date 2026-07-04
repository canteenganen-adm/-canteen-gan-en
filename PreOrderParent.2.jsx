import React, { useState, useEffect } from "react";
import {
  Plus, Minus, ChevronRight, ChevronDown, ArrowLeft, Check, Clock, Layers,
  Store, Calendar, StickyNote, ShoppingBag, Trash2,
} from "lucide-react";

/* ============================================================
   PRE-ORDER (PARENT) — final
   - Checkout ala GrabFood/Shopee: di halaman "Periksa Pesanan" ada
     daftar item yang bisa +/- sebelum kirim.
   - Kelas = PICKER/dropdown ("[Pilih kelas]") dari daftar yang dikelola ADMIN.
     Pemesan TIDAK bisa menambah/mengetik kelas sendiri.
   - Nama umum, Tingkat 6 pilihan (Guru/Karyawan tanpa kelas).
   - WhatsApp wajib, angka saja, min 10 digit (tanpa caption live).
   - Kalau PO ditutup (auto/manual) → pemesanan diblokir.
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
const uid = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const TINGKAT = ["TK A", "TK B", "SD", "SMP", "SMA", "Guru/Karyawan"];
const NO_KELAS = "Guru/Karyawan";
const PICKUP = ["Istirahat 1", "Istirahat 2", "Istirahat 3", "Pulang Sekolah"];
const DEFAULT_PICKUP = "Istirahat 1";
const WA_MIN = 10;

// Dikelola admin (Pengaturan → Daftar Kelas). Di app asli: dari Supabase.
const KELAS_BY_TINGKAT = {
  "TK A": ["TK A-1", "TK A-2"],
  "TK B": ["TK B-1", "TK B-2"],
  "SD": ["1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B", "5A", "5B", "6A", "6B"],
  "SMP": ["7A", "7B", "8A", "8B", "9A", "9B"],
  "SMA": ["10 IPA 1", "10 IPS 1", "11 IPA 1", "11 IPS 1", "12 IPA 1", "12 IPS 1"],
  "Guru/Karyawan": [],
};

const MENUS = [
  { id: "m1", name: "Nasi Hainan", category: "Paket", price: 15000, variants: [], channels: { preorder: true } },
  { id: "m2", name: "Nasi Goreng Kecap", category: "Nasi Goreng", price: null, channels: { preorder: true },
    variants: [{ id: "a", name: "S", price: 5000 }, { id: "b", name: "M", price: 12000 }, { id: "c", name: "L", price: 15000 }] },
  { id: "m3", name: "Mie Goreng", category: "Mie", price: 12000, variants: [], channels: { preorder: true } },
  { id: "m4", name: "Bubur Ayam", category: "Bubur", price: 10000, variants: [], channels: { preorder: true } },
  { id: "m5", name: "Puding + Vla", category: "Puding", price: null, channels: { preorder: true },
    variants: [{ id: "p1", name: "Coklat", price: 5000 }, { id: "p2", name: "Matcha", price: 5000 }, { id: "p3", name: "Mangga", price: 5000 }] },
];

export default function PreOrderParent({
  kantin = "Kantin Gan En", serviceDate = "Jumat, 4 Juli 2026",
  open = true, menus = MENUS, pickupOptions = PICKUP, kelasByTingkat = KELAS_BY_TINGKAT, onSubmit,
}) {
  const [step, setStep] = useState("landing");   // landing | menu | checkout | done
  const [cart, setCart] = useState({});
  const [variantFor, setVariantFor] = useState(null);
  const [noteFor, setNoteFor] = useState(null);
  const [showKelas, setShowKelas] = useState(false);
  const [form, setForm] = useState({ nama: "", tingkat: "", kelas: "", wa: "", ambil: DEFAULT_PICKUP });
  const [tried, setTried] = useState(false);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    const l = document.createElement("link"); l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(l);
  }, []);

  const kelasNeeded = form.tingkat && form.tingkat !== NO_KELAS;
  const kelasOptions = kelasNeeded ? (kelasByTingkat[form.tingkat] || []) : [];
  const pre = menus.filter((m) => m.channels?.preorder);
  const lines = Object.values(cart);
  const total = lines.reduce((s, l) => s + (l.variant ? l.variant.price : l.menu.price) * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const waDigits = form.wa.replace(/\D/g, "");

  const add = (menu, variant) => {
    const key = menu.id + (variant ? ":" + variant.id : "");
    setCart((c) => ({ ...c, [key]: { menu, variant: variant || null, qty: (c[key]?.qty || 0) + 1, note: c[key]?.note || "" } }));
  };
  const dec = (key) => setCart((c) => { const n = { ...c }; if (!n[key]) return n; n[key].qty <= 1 ? delete n[key] : (n[key] = { ...n[key], qty: n[key].qty - 1 }); return n; });
  const keyOf = (l) => l.menu.id + (l.variant ? ":" + l.variant.id : "");
  const tap = (m) => (m.variants?.length ? setVariantFor(m) : add(m));
  const qtyOf = (id) => Object.values(cart).filter((l) => l.menu.id === id).reduce((s, l) => s + l.qty, 0);

  const pickTingkat = (tg) => setForm({ ...form, tingkat: tg, kelas: "" });

  const invalid = () => !form.nama.trim() || !form.tingkat || (kelasNeeded && !form.kelas) || waDigits.length < WA_MIN || count === 0;

  const submit = () => {
    if (!open) { setStep("landing"); return; }         // PO ditutup → blokir
    if (invalid()) { setTried(true); return; }
    const kelasLabel = form.kelas ? `${form.tingkat} · ${form.kelas}` : form.tingkat;
    const r = {
      no: "PO-" + uid(), nama: form.nama.trim(), tingkat: form.tingkat, kelas: kelasNeeded ? form.kelas : "",
      kelasLabel, wa: waDigits, ambil: form.ambil, serviceDate, submittedAt: new Date().toLocaleString("id-ID"),
      items: lines.map((l) => ({ name: l.menu.name, variant: l.variant?.name || null, price: l.variant ? l.variant.price : l.menu.price, qty: l.qty, note: l.note || "" })),
      total,
    };
    onSubmit?.(r); setReceipt(r); setStep("done");
  };

  const resetAll = () => { setCart({}); setForm({ nama: "", tingkat: "", kelas: "", wa: "", ambil: DEFAULT_PICKUP }); setTried(false); setStep("landing"); };

  /* ---------- LANDING ---------- */
  if (step === "landing") {
    return (
      <Screen>
        <div style={{ padding: "40px 24px", textAlign: "center" }}>
          <div style={{ width: 76, height: 76, borderRadius: 22, background: t.primary, color: t.text, display: "grid", placeItems: "center", margin: "0 auto 18px" }}><Store size={38} /></div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{kantin}</div>
          <div className="flex items-center justify-center gap-2" style={{ marginTop: 10, color: t.text2, fontSize: 14.5 }}><Calendar size={16} /> {serviceDate}</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14, padding: "6px 14px", borderRadius: 999, fontWeight: 700, fontSize: 13.5, background: open ? t.successBg : t.errorBg, color: open ? t.successText : t.error }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: open ? t.success : t.error }} /> Pre-order {open ? "Dibuka" : "Ditutup"}
          </div>
          <div style={{ marginTop: 36 }}>
            {open ? (
              <button onClick={() => setStep("menu")} className="flex items-center justify-center gap-2" style={{ width: "100%", height: 58, borderRadius: 16, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 17, cursor: "pointer" }}>
                <ShoppingBag size={22} /> Mulai Memesan
              </button>
            ) : (
              <div style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 14, padding: 18, color: t.text2, fontSize: 14.5 }}>Maaf, periode Pre-order untuk tanggal ini sudah ditutup.</div>
            )}
          </div>
        </div>
      </Screen>
    );
  }

  /* ---------- DONE ---------- */
  if (step === "done" && receipt) {
    return (
      <Screen>
        <div style={{ padding: "32px 20px" }}>
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: t.successBg, color: t.success, display: "grid", placeItems: "center", margin: "0 auto 14px" }}><Check size={40} /></div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Pesanan Berhasil Dikirim</div>
          </div>
          <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: t.amberText, marginBottom: 12 }}>Bukti Pesanan</div>
            <Row k="No. Pesanan" v={receipt.no} />
            <Row k="Nama" v={receipt.nama} />
            <Row k="Tingkat / Kelas" v={receipt.kelasLabel} />
            <Row k="Tanggal Layanan" v={receipt.serviceDate} />
            <Row k="Waktu Ambil" v={receipt.ambil} />
            <div style={{ borderTop: `1px solid ${t.divider}`, margin: "12px 0", paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.text2, marginBottom: 8 }}>Rincian Pesanan</div>
              {receipt.items.map((it, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 14.5 }}>{it.name}{it.variant ? ` (${it.variant})` : ""} ×{it.qty}</span>
                    <span style={{ fontSize: 14.5, fontWeight: 700 }}>{rupiah(it.price * it.qty)}</span>
                  </div>
                  {it.note && <div style={{ fontSize: 12, color: t.text2, fontStyle: "italic" }}>“{it.note}”</div>}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between" style={{ borderTop: `1px solid ${t.divider}`, paddingTop: 12 }}>
              <span style={{ fontWeight: 700 }}>Total</span><span style={{ fontSize: 20, fontWeight: 800 }}>{rupiah(receipt.total)}</span>
            </div>
            <div style={{ fontSize: 11.5, color: t.textDis, marginTop: 10 }}>{receipt.submittedAt}</div>
          </div>
          <div style={{ textAlign: "center", fontSize: 14, color: t.text2, margin: "18px 8px", lineHeight: 1.6 }}>
            Mohon menyiapkan kotak bekal makan Ananda dan meletakkannya di kantin sebelum jam masuk sekolah.
            <div style={{ marginTop: 10, fontWeight: 600, color: t.text }}>🪷 感恩 Gan En 🙏🏻✨</div>
          </div>
          <button onClick={resetAll} style={{ width: "100%", height: 54, borderRadius: 14, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 16, cursor: "pointer" }}>Selesai</button>
        </div>
      </Screen>
    );
  }

  /* ---------- CHECKOUT (data pemesan + daftar pesanan +/-) ---------- */
  if (step === "checkout") {
    return (
      <Screen>
        <Top title="Periksa Pesanan" onBack={() => setStep("menu")} />
        <div style={{ padding: "4px 20px 20px" }}>
          {/* Daftar pesanan bisa +/- */}
          <SectionLabel>Pesanan</SectionLabel>
          {count === 0 ? (
            <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20, textAlign: "center", color: t.text2, marginBottom: 18 }}>
              Belum ada item. <button onClick={() => setStep("menu")} style={{ border: "none", background: "transparent", color: t.amberText, fontWeight: 700, cursor: "pointer" }}>Tambah menu</button>
            </div>
          ) : (
            <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: "4px 14px", marginBottom: 18 }}>
              {lines.map((l) => (
                <div key={keyOf(l)} className="flex items-center gap-3" style={{ padding: "12px 0", borderBottom: `1px solid ${t.divider}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{l.menu.name}{l.variant ? ` (${l.variant.name})` : ""}</div>
                    <div style={{ fontSize: 13, color: t.text2, marginTop: 2 }}>{rupiah((l.variant ? l.variant.price : l.menu.price) * l.qty)}</div>
                  </div>
                  <div className="flex items-center gap-2" style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 999, padding: 3 }}>
                    <button onClick={() => dec(keyOf(l))} style={stepBtn}>{l.qty <= 1 ? <Trash2 size={16} color={t.error} /> : <Minus size={18} />}</button>
                    <span style={{ minWidth: 20, textAlign: "center", fontWeight: 800, fontSize: 15 }}>{l.qty}</span>
                    <button onClick={() => add(l.menu, l.variant)} style={stepBtn}><Plus size={18} /></button>
                  </div>
                </div>
              ))}
              <button onClick={() => setStep("menu")} className="flex items-center gap-1" style={{ padding: "12px 0", background: "transparent", border: "none", color: t.amberText, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
                <Plus size={16} /> Tambah menu lain
              </button>
            </div>
          )}

          {/* Data pemesan */}
          <SectionLabel>Data Pemesan</SectionLabel>
          <Field label="Nama" req err={tried && !form.nama.trim()}>
            <input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="Nama lengkap" style={inp(tried && !form.nama.trim())} />
          </Field>

          <Field label="Tingkat" req err={tried && !form.tingkat}>
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              {TINGKAT.map((tg) => {
                const on = tg === form.tingkat;
                return <button key={tg} onClick={() => pickTingkat(tg)}
                  style={{ height: 44, padding: "0 14px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer",
                    border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, color: on ? t.amberText : t.text2 }}>{tg}</button>;
              })}
            </div>
          </Field>

          {/* Kelas — PICKER (daftar dari admin) */}
          {kelasNeeded && (
            <Field label="Kelas" req err={tried && !form.kelas}>
              <button onClick={() => setShowKelas(true)} className="flex items-center justify-between"
                style={{ ...inp(tried && !form.kelas), cursor: "pointer", textAlign: "left" }}>
                <span style={{ color: form.kelas ? t.text : t.textDis }}>{form.kelas || "Pilih kelas"}</span>
                <ChevronDown size={18} color={t.text2} />
              </button>
              <div style={{ fontSize: 12, color: t.text2, marginTop: 6 }}>Kelas tidak ada? Hubungi kantin untuk menambahkannya.</div>
            </Field>
          )}

          <Field label="Nomor WhatsApp" req err={tried && waDigits.length < WA_MIN}>
            <input value={form.wa} onChange={(e) => setForm({ ...form, wa: e.target.value.replace(/\D/g, "") })}
              placeholder="08…" inputMode="numeric" style={inp(tried && waDigits.length < WA_MIN)} />
          </Field>

          <Field label="Waktu Ambil">
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              {pickupOptions.map((p) => {
                const on = p === form.ambil;
                return <button key={p} onClick={() => setForm({ ...form, ambil: p })} className="flex items-center gap-1"
                  style={{ height: 46, padding: "0 14px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer",
                    border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, color: on ? t.amberText : t.text2 }}><Clock size={14} /> {p}</button>;
              })}
            </div>
          </Field>

          {/* Total + kirim */}
          <div className="flex items-center justify-between" style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 14, padding: "14px 16px", margin: "8px 0 16px" }}>
            <span style={{ color: t.text2, fontSize: 14 }}>{count} item</span><span style={{ fontWeight: 800, fontSize: 20 }}>{rupiah(total)}</span>
          </div>
          <button onClick={submit} className="flex items-center justify-center gap-2" style={{ width: "100%", height: 56, borderRadius: 14, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 16, cursor: "pointer" }}>
            <Check size={20} /> Kirim Pesanan
          </button>
        </div>

        {/* Sheet pilih kelas */}
        {showKelas && (
          <BottomSheet title={`Pilih Kelas · ${form.tingkat}`} onClose={() => setShowKelas(false)}>
            {kelasOptions.length === 0 ? (
              <div style={{ color: t.text2, fontSize: 14, padding: "8px 0" }}>Belum ada kelas untuk tingkat ini. Hubungi kantin.</div>
            ) : kelasOptions.map((k) => {
              const on = k === form.kelas;
              return (
                <button key={k} onClick={() => { setForm({ ...form, kelas: k }); setShowKelas(false); }} className="flex items-center justify-between"
                  style={{ width: "100%", height: 54, marginBottom: 8, borderRadius: 12, border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, padding: "0 16px", cursor: "pointer" }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: on ? t.amberText : t.text }}>{k}</span>
                  {on && <Check size={18} color={t.amberText} />}
                </button>
              );
            })}
          </BottomSheet>
        )}
      </Screen>
    );
  }

  /* ---------- MENU ---------- */
  return (
    <Screen>
      <Top title="Pilih Menu" subtitle={serviceDate} onBack={() => setStep("landing")} />
      <div style={{ padding: "4px 20px 20px" }}>
        {pre.map((m) => {
          const inCart = qtyOf(m.id);
          return (
            <div key={m.id} style={{ background: t.surface, border: `1.5px solid ${inCart ? t.primary : t.border}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
              <div className="flex items-start justify-between gap-3">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{m.name}</div>
                  <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
                    {m.variants?.length > 0 && <Layers size={13} color={t.amberText} />}
                    <span style={{ fontSize: 14, fontWeight: 700, color: t.text2 }}>
                      {m.variants?.length ? `${rupiah(Math.min(...m.variants.map(v => v.price)))}–${rupiah(Math.max(...m.variants.map(v => v.price)))}` : rupiah(m.price)}
                    </span>
                  </div>
                </div>
                {inCart > 0 && !m.variants?.length ? (
                  <Stepper val={inCart} onMinus={() => dec(m.id)} onPlus={() => add(m)} />
                ) : (
                  <button onClick={() => tap(m)} className="flex items-center gap-1" style={{ height: 44, padding: "0 16px", borderRadius: 12, border: "none", background: t.primary, color: t.text, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                    <Plus size={18} /> {m.variants?.length ? "Pilih" : "Tambah"}
                  </button>
                )}
              </div>
              {Object.values(cart).filter((l) => l.menu.id === m.id && l.variant).map((l) => (
                <div key={l.variant.id} className="flex items-center justify-between" style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.divider}` }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{l.variant.name} · {rupiah(l.variant.price)}</span>
                  <Stepper val={l.qty} onMinus={() => dec(m.id + ":" + l.variant.id)} onPlus={() => add(m, l.variant)} />
                </div>
              ))}
              {inCart > 0 && (
                noteFor === m.id ? (
                  <input autoFocus placeholder="Catatan (cth. tidak pedas)" onBlur={() => setNoteFor(null)}
                    onChange={(e) => setCart((c) => { const n = { ...c }; Object.keys(n).forEach((k) => { if (n[k].menu.id === m.id) n[k] = { ...n[k], note: e.target.value }; }); return n; })}
                    style={{ ...inp(false), marginTop: 10, height: 44, fontSize: 14 }} />
                ) : (
                  <button onClick={() => setNoteFor(m.id)} className="flex items-center gap-1" style={{ marginTop: 10, background: "transparent", border: "none", color: t.amberText, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    <StickyNote size={14} /> {Object.values(cart).find((l) => l.menu.id === m.id)?.note ? "Edit catatan" : "Tambah catatan"}
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>

      {variantFor && (
        <BottomSheet title={variantFor.name} onClose={() => setVariantFor(null)}>
          {variantFor.variants.map((v) => (
            <button key={v.id} onClick={() => { add(variantFor, v); setVariantFor(null); }} className="flex items-center justify-between"
              style={{ width: "100%", height: 56, marginBottom: 10, borderRadius: 14, border: `1.5px solid ${t.border}`, background: t.surface, padding: "0 16px", cursor: "pointer" }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{v.name}</span>
              <span className="flex items-center gap-2" style={{ fontWeight: 700 }}>{rupiah(v.price)} <Plus size={18} color={t.amberText} /></span>
            </button>
          ))}
        </BottomSheet>
      )}

      {count > 0 && !variantFor && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 20px 18px", background: "linear-gradient(transparent," + t.bg + " 22%)" }}>
          <div style={{ maxWidth: 460, margin: "0 auto" }}>
            <button onClick={() => setStep("checkout")} className="flex items-center justify-between" style={{ width: "100%", height: 58, borderRadius: 16, border: "none", background: t.primary, color: t.text, padding: "0 18px", cursor: "pointer", boxShadow: "0 6px 20px rgba(253,184,51,.4)" }}>
              <span style={{ fontWeight: 700 }}>{count} item · {rupiah(total)}</span>
              <span className="flex items-center gap-1" style={{ fontWeight: 800 }}>Lanjut <ChevronRight size={20} /></span>
            </button>
          </div>
        </div>
      )}
    </Screen>
  );
}

/* ---- bits ---- */
function Screen({ children }) {
  return <div style={{ background: t.bg, color: t.text, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", minHeight: "100vh" }}>
    <div style={{ maxWidth: 460, margin: "0 auto", paddingBottom: 96, position: "relative" }}>{children}</div></div>;
}
function Top({ title, subtitle, onBack }) {
  return (
    <div className="flex items-center gap-3" style={{ padding: "18px 20px 10px", position: "sticky", top: 0, background: t.bg, zIndex: 5 }}>
      <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: 11, border: `1px solid ${t.border}`, background: t.surface, cursor: "pointer", display: "grid", placeItems: "center", color: t.text }}><ArrowLeft size={20} /></button>
      <div><div style={{ fontSize: 19, fontWeight: 800 }}>{title}</div>{subtitle && <div style={{ fontSize: 12.5, color: t.text2 }}>{subtitle}</div>}</div>
    </div>
  );
}
function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: t.text2, margin: "4px 2px 10px" }}>{children}</div>;
}
function Row({ k, v }) {
  return <div className="flex items-center justify-between" style={{ padding: "5px 0", fontSize: 14 }}>
    <span style={{ color: t.text2 }}>{k}</span><span style={{ fontWeight: 700, textAlign: "right" }}>{v}</span></div>;
}
function Stepper({ val, onMinus, onPlus }) {
  return <div className="flex items-center gap-2" style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 999, padding: 3 }}>
    <button onClick={onMinus} style={stepBtn}><Minus size={18} /></button>
    <span style={{ minWidth: 22, textAlign: "center", fontWeight: 800, fontSize: 16 }}>{val}</span>
    <button onClick={onPlus} style={stepBtn}><Plus size={18} /></button></div>;
}
function BottomSheet({ title, children, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
      <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", maxHeight: "80vh", overflowY: "auto", padding: 20 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
          <button onClick={onClose} style={{ border: "none", background: t.surfaceSoft, cursor: "pointer", color: t.text2, width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center" }}><ArrowLeft size={0} style={{ display: "none" }} /><span style={{ fontSize: 20, lineHeight: 1 }}>×</span></button>
        </div>
        {children}
      </div>
    </div>
  );
}
const stepBtn = { width: 40, height: 40, borderRadius: 999, border: "none", background: t.primaryLight, color: t.text, cursor: "pointer", display: "grid", placeItems: "center" };
const inp = (err) => ({ width: "100%", height: 52, fontSize: 16, color: t.text, background: t.surface, border: `1.5px solid ${err ? t.error : t.border}`, borderRadius: 12, padding: "0 14px", outline: "none", fontFamily: "inherit" });
function Field({ label, children, req, err }) {
  return <div style={{ marginBottom: 16 }}>
    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{label}{req && <span style={{ color: t.error }}> *</span>}</div>
    {children}{err && <div style={{ fontSize: 12.5, color: t.error, marginTop: 6 }}>Wajib diisi.</div>}</div>;
}
