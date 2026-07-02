import React, { useState, useMemo, useEffect } from "react";
import {
  Search, X, Plus, Minus, ShoppingCart, Check, Receipt,
  Layers, ChevronRight, Trash2, ArrowLeft, Wallet,
} from "lucide-react";

/* ============================================================
   PENJUALAN — Canteen Gan En (POS tenang)
   Decision Lock: hanya menu channel Penjualan, alur
   Pilih Menu → Ringkasan → Dibayar / Masuk Tagihan.
   Popup Tagihan: Nama Siswa*, Kelas*, WhatsApp (opsional).
   Auto catat Tanggal+Waktu. Snapshot harga saat transaksi.
   ------------------------------------------------------------
   Port: export default function Penjualan({ menus, onTransaction })
   - menus  : MENU_SEED dari Master Menu (yang channel.sales aktif dipakai)
   - onTransaction(tx) : commit ke store/Supabase. tx berisi snapshot.
   ============================================================ */

const t = {
  primary: "#FDB833", primaryHover: "#F9A03F", primaryLight: "#FFF1CC",
  bg: "#FAF6EE", surface: "#FFFCF7", surfaceSoft: "#FFF8EE",
  text: "#2F2A24", text2: "#756B5D", textDis: "#B7AEA0",
  success: "#6FA76D", successBg: "#EAF5E6", successText: "#3F6B43",
  error: "#D95D5D", errorBg: "#FBEAEA",
  border: "#E8E0D2", divider: "#F1EBE0", amberText: "#9A6700",
};

// Contoh menu (di repo diganti props `menus` dari Master Menu)
const DEFAULT = [
  { id: "m1", name: "Nasi Goreng Kecap", category: "Nasi Goreng", price: null, channels: { sales: true },
    variants: [{ id: "a", name: "S", price: 5000 }, { id: "b", name: "M", price: 12000 }, { id: "c", name: "L", price: 15000 }] },
  { id: "m2", name: "Tahu Crispy", category: "Tahu", price: 3000, variants: [], channels: { sales: true } },
  { id: "m3", name: "Tempe Mendoan", category: "Tempe", price: 3000, variants: [], channels: { sales: true } },
  { id: "m4", name: "Telur Balado", category: "Telur", price: 5000, variants: [], channels: { sales: true } },
  { id: "m5", name: "Corndog", category: "Snack", price: 10000, variants: [], channels: { sales: true } },
  { id: "m6", name: "Sup Ayam", category: "Sup", price: 5000, variants: [], channels: { sales: true } },
  { id: "m7", name: "Bola Mie", category: "Mie", price: 2000, variants: [], channels: { sales: true } },
  { id: "m8", name: "Puding + Vla", category: "Puding", price: null, channels: { sales: true },
    variants: [{ id: "p1", name: "Coklat", price: 5000 }, { id: "p2", name: "Matcha", price: 5000 }, { id: "p3", name: "Mangga", price: 5000 }] },
  { id: "m9", name: "Bakwan Jagung", category: "Gorengan", price: 2000, variants: [], channels: { sales: true } },
  { id: "m10", name: "Sandwich Keju", category: "Roti", price: 10000, variants: [], channels: { sales: true } },
];

const rupiah = (n) => "Rp" + (n ?? 0).toLocaleString("id-ID");
const uid = () => Math.random().toString(36).slice(2, 9);
const nowLabel = () => {
  const d = new Date();
  const hari = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][d.getDay()];
  const bln = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][d.getMonth()];
  const jam = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  return `${hari}, ${d.getDate()} ${bln} ${d.getFullYear()} · ${jam} WIB`;
};
const priceLabel = (m) => {
  if (m.variants?.length) {
    const ps = m.variants.map((v) => v.price);
    const lo = Math.min(...ps), hi = Math.max(...ps);
    return lo === hi ? rupiah(lo) : `${rupiah(lo)}–${rupiah(hi)}`;
  }
  return rupiah(m.price);
};

export default function Penjualan({ menus = DEFAULT, onTransaction }) {
  const sales = useMemo(() => menus.filter((m) => m.channels?.sales), [menus]);
  const cats = useMemo(() => ["Semua", ...Array.from(new Set(sales.map((m) => m.category)))], [sales]);

  const [cat, setCat] = useState("Semua");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState([]); // {key,menuId,name,variant,price,qty}
  const [view, setView] = useState("shop"); // shop | summary
  const [variantFor, setVariantFor] = useState(null);
  const [billing, setBilling] = useState(false);
  const [form, setForm] = useState({ nama: "", kelas: "", wa: "" });
  const [tried, setTried] = useState(false);
  const [toast, setToast] = useState(null);
  const [todayCount, setTodayCount] = useState(0);
  const [todaySum, setTodaySum] = useState(0);

  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(l);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const filtered = useMemo(
    () => sales.filter((m) => (cat === "Semua" || m.category === cat) && m.name.toLowerCase().includes(q.toLowerCase())),
    [sales, cat, q]
  );

  const count = cart.reduce((s, l) => s + l.qty, 0);
  const total = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const qtyOf = (menuId) => cart.filter((l) => l.menuId === menuId).reduce((s, l) => s + l.qty, 0);

  const addLine = (menu, variant) => {
    const key = menu.id + (variant ? ":" + variant.id : "");
    const price = variant ? variant.price : menu.price;
    setCart((c) => {
      const i = c.findIndex((l) => l.key === key);
      if (i >= 0) { const n = [...c]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; }
      return [...c, { key, menuId: menu.id, name: menu.name, variant: variant?.name || null, price, qty: 1 }];
    });
  };
  const tapMenu = (menu) => (menu.variants?.length ? setVariantFor(menu) : addLine(menu));
  const changeQty = (key, d) =>
    setCart((c) => c.map((l) => (l.key === key ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0));

  const commit = (paid, customer) => {
    const tx = {
      id: uid(), source: "penjualan", paid, customer: customer || null,
      createdAt: new Date().toISOString(), label: nowLabel(),
      items: cart.map((l) => ({ name: l.name, variant: l.variant, price: l.price, qty: l.qty })), // snapshot
      total,
    };
    onTransaction?.(tx);
    setTodayCount((n) => n + 1);
    setTodaySum((s) => s + total);
    setCart([]); setView("shop"); setBilling(false); setForm({ nama: "", kelas: "", wa: "" }); setTried(false);
    setToast(paid ? { ok: true, msg: `Penjualan dicatat — ${rupiah(total)} · Lunas` }
                   : { ok: false, msg: `Masuk Tagihan — ${customer.nama} (${customer.kelas})` });
  };
  const submitTagihan = () => {
    if (!form.nama.trim() || !form.kelas.trim()) { setTried(true); return; }
    commit(false, { ...form });
  };

  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", minHeight: "100vh" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 110px", position: "relative" }}>

        {/* Header */}
        <div style={{ padding: "20px 20px 10px", position: "sticky", top: 0, background: t.bg, zIndex: 5 }}>
          <div className="flex items-center justify-between">
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>Penjualan</div>
              <div style={{ fontSize: 12.5, color: t.text2, marginTop: 2 }}>{nowLabel()}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: t.text2, fontWeight: 600 }}>Hari ini</div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{todayCount}× · {rupiah(todaySum)}</div>
            </div>
          </div>

          <div className="flex items-center gap-2" style={{ marginTop: 14, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "0 12px", height: 48 }}>
            <Search size={20} color={t.text2} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari menu…"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 16, width: "100%", color: t.text, fontFamily: "inherit" }} />
            {q && <X size={18} color={t.text2} style={{ cursor: "pointer" }} onClick={() => setQ("")} />}
          </div>

          <div className="flex gap-2" style={{ marginTop: 12, overflowX: "auto", paddingBottom: 4 }}>
            {cats.map((c) => {
              const on = c === cat;
              return (
                <button key={c} onClick={() => setCat(c)} style={{ flex: "none", height: 38, padding: "0 16px", borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, color: on ? t.amberText : t.text2 }}>
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        {/* Menu grid */}
        <div style={{ padding: "4px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {filtered.map((m) => {
            const inCart = qtyOf(m.id);
            return (
              <button key={m.id} onClick={() => tapMenu(m)} style={{ position: "relative", textAlign: "left", cursor: "pointer", background: inCart ? t.primarySoft || t.surfaceSoft : t.surface, border: `1.5px solid ${inCart ? t.primary : t.border}`, borderRadius: 16, padding: 14, minHeight: 92 }}>
                {inCart > 0 && (
                  <span style={{ position: "absolute", top: -10, right: -8, minWidth: 30, height: 30, padding: "0 8px", borderRadius: 999, background: t.primary, color: t.text, fontSize: 15, fontWeight: 800, display: "grid", placeItems: "center", boxShadow: "0 1px 3px rgba(47,42,36,.2)" }}>{inCart}</span>
                )}
                <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25 }}>{m.name}</div>
                <div className="flex items-center gap-1" style={{ marginTop: 6 }}>
                  {m.variants?.length > 0 && <Layers size={13} color={t.amberText} />}
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: t.text2, fontVariantNumeric: "tabular-nums" }}>{priceLabel(m)}</span>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 0", color: t.text2 }}>Menu tidak ditemukan.</div>
          )}
        </div>
      </div>

      {/* Sticky total bar */}
      {count > 0 && view === "shop" && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 20px 18px", background: "linear-gradient(transparent, " + t.bg + " 22%)" }}>
          <div style={{ maxWidth: 460, margin: "0 auto" }} className="flex items-center gap-3">
            <button onClick={() => setView("summary")} className="flex items-center justify-between" style={{ flex: 1, height: 58, borderRadius: 16, border: "none", cursor: "pointer", background: t.primary, color: t.text, padding: "0 18px", boxShadow: "0 6px 20px rgba(253,184,51,.4)" }}>
              <span className="flex items-center gap-2" style={{ fontWeight: 700, fontSize: 15 }}><ShoppingCart size={20} /> {count} item</span>
              <span className="flex items-center gap-2" style={{ fontWeight: 800, fontSize: 18 }}>{rupiah(total)} <ChevronRight size={20} /></span>
            </button>
          </div>
        </div>
      )}

      {/* Variant picker */}
      {variantFor && (
        <Sheet onClose={() => setVariantFor(null)} title={variantFor.name}>
          <div style={{ fontSize: 13, color: t.text2, marginBottom: 12 }}>Pilih ukuran / jenis:</div>
          {variantFor.variants.map((v) => (
            <button key={v.id} onClick={() => { addLine(variantFor, v); setVariantFor(null); }} className="flex items-center justify-between" style={{ width: "100%", height: 56, marginBottom: 10, borderRadius: 14, border: `1.5px solid ${t.border}`, background: t.surface, padding: "0 16px", cursor: "pointer" }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{v.name}</span>
              <span className="flex items-center gap-2" style={{ fontSize: 16, fontWeight: 700 }}>{rupiah(v.price)} <Plus size={18} color={t.amberText} /></span>
            </button>
          ))}
        </Sheet>
      )}

      {/* Ringkasan */}
      {view === "summary" && (
        <Sheet onClose={() => setView("shop")} title="Ringkasan Pesanan" leftIcon={<ArrowLeft size={20} />} onLeft={() => setView("shop")}>
          {cart.map((l) => (
            <div key={l.key} className="flex items-center gap-3" style={{ padding: "12px 0", borderBottom: `1px solid ${t.divider}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{l.name}{l.variant ? ` · ${l.variant}` : ""}</div>
                <div style={{ fontSize: 13, color: t.text2, marginTop: 2 }}>{rupiah(l.price)}</div>
              </div>
              <div className="flex items-center gap-2">
                <Stepper onMinus={() => changeQty(l.key, -1)} onPlus={() => changeQty(l.key, 1)} val={l.qty} />
              </div>
              <div style={{ width: 78, textAlign: "right", fontWeight: 800, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{rupiah(l.price * l.qty)}</div>
            </div>
          ))}

          <div className="flex items-center justify-between" style={{ padding: "16px 0 4px" }}>
            <span style={{ fontSize: 15, color: t.text2, fontWeight: 600 }}>Total</span>
            <span style={{ fontSize: 24, fontWeight: 800 }}>{rupiah(total)}</span>
          </div>

          <div className="flex gap-3" style={{ marginTop: 14 }}>
            <button onClick={() => setBilling(true)} className="flex items-center justify-center gap-2" style={{ flex: 1, height: 56, borderRadius: 14, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              <Receipt size={20} /> Masuk Tagihan
            </button>
            <button onClick={() => commit(true)} className="flex items-center justify-center gap-2" style={{ flex: 1, height: 56, borderRadius: 14, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 16, cursor: "pointer" }}>
              <Wallet size={20} /> Dibayar
            </button>
          </div>
        </Sheet>
      )}

      {/* Popup Tagihan */}
      {billing && (
        <Sheet onClose={() => setBilling(false)} title="Masuk Tagihan">
          <div style={{ fontSize: 13, color: t.text2, marginBottom: 14 }}>Catat atas nama siapa tagihannya:</div>
          <Field label="Nama Siswa" req tried={tried} val={form.nama}>
            <input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="cth. Aisyah Putri" style={inputStyle(tried && !form.nama.trim())} />
          </Field>
          <Field label="Kelas" req tried={tried} val={form.kelas}>
            <input value={form.kelas} onChange={(e) => setForm({ ...form, kelas: e.target.value })} placeholder="cth. 3B" style={inputStyle(tried && !form.kelas.trim())} />
          </Field>
          <Field label="WhatsApp (opsional)">
            <input value={form.wa} onChange={(e) => setForm({ ...form, wa: e.target.value })} placeholder="08…" style={inputStyle(false)} />
          </Field>
          <button onClick={submitTagihan} className="flex items-center justify-center gap-2" style={{ width: "100%", height: 56, borderRadius: 14, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 16, cursor: "pointer", marginTop: 8 }}>
            <Check size={20} /> Simpan ke Tagihan · {rupiah(total)}
          </button>
        </Sheet>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", left: 20, right: 20, bottom: 24, zIndex: 60, display: "flex", justifyContent: "center" }}>
          <div className="flex items-center gap-3" style={{ maxWidth: 420, width: "100%", background: t.text, color: "#FBF7EF", borderRadius: 14, padding: "14px 18px", boxShadow: "0 14px 34px rgba(47,42,36,.3)" }}>
            <span style={{ width: 26, height: 26, borderRadius: "50%", background: toast.ok ? t.success : t.primary, display: "grid", placeItems: "center", flex: "none", color: toast.ok ? "#fff" : t.text }}>
              {toast.ok ? <Check size={16} /> : <Receipt size={15} />}
            </span>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- shared bits ---- */
function Sheet({ title, children, onClose, leftIcon, onLeft }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
      <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
        <div style={{ position: "sticky", top: 0, background: t.surface, padding: "16px 20px 12px", borderBottom: `1px solid ${t.divider}` }} className="flex items-center gap-2">
          {leftIcon && <button onClick={onLeft} style={{ border: "none", background: "transparent", cursor: "pointer", color: t.text, display: "grid", placeItems: "center" }}>{leftIcon}</button>}
          <div style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>{title}</div>
          <button onClick={onClose} style={{ border: "none", background: t.surfaceSoft, cursor: "pointer", color: t.text2, width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}
function Stepper({ onMinus, onPlus, val }) {
  const b = { width: 40, height: 40, borderRadius: 999, border: "none", background: t.primaryLight, color: t.text, cursor: "pointer", display: "grid", placeItems: "center" };
  return (
    <div className="flex items-center gap-2" style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 999, padding: 3 }}>
      <button onClick={onMinus} style={b}><Minus size={18} /></button>
      <span style={{ minWidth: 22, textAlign: "center", fontWeight: 800, fontSize: 16 }}>{val}</span>
      <button onClick={onPlus} style={b}><Plus size={18} /></button>
    </div>
  );
}
const inputStyle = (err) => ({
  width: "100%", height: 52, fontSize: 16, color: t.text, background: t.surface,
  border: `1.5px solid ${err ? t.error : t.border}`, borderRadius: 12, padding: "0 14px", outline: "none", fontFamily: "inherit",
});
function Field({ label, children, req, tried, val }) {
  const err = req && tried && !String(val || "").trim();
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{label}{req && <span style={{ color: t.error }}> *</span>}</div>
      {children}
      {err && <div style={{ fontSize: 12.5, color: t.error, marginTop: 6 }}>Wajib diisi.</div>}
    </div>
  );
}
