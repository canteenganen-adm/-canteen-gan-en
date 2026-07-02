import React, { useState, useMemo, useEffect } from "react";
import {
  Plus, Search, X, Utensils, ShoppingCart, Pencil, Trash2,
  Check, ChevronRight, Tag, Layers,
} from "lucide-react";

/* ============================================================
   MASTER MENU — Canteen Gan En
   Source of truth untuk seluruh data makanan.
   Sesuai Decision Lock: varian + harga per varian, channel
   Pre-order/Penjualan (toggle, auto-save), kategori = filter,
   tanpa foto, tanpa emoji (ikon Lucide), Rupiah, mobile-first.
   ------------------------------------------------------------
   Cara port ke repo: simpan sebagai src/app/screens/MasterMenu.tsx,
   pasang interface di bawah ke type kamu, lalu render di tab "Menu".
   ============================================================ */

// --- Token palet final (di repo: pindahkan ke theme.css / Tailwind) ---
const t = {
  primary: "#FDB833", primaryHover: "#F9A03F", primaryLight: "#FFF1CC",
  bg: "#FAF6EE", surface: "#FFFCF7", surfaceSoft: "#FFF8EE",
  text: "#2F2A24", text2: "#756B5D", textDis: "#B7AEA0",
  success: "#6FA76D", successBg: "#EAF5E6",
  error: "#D95D5D", errorBg: "#FBEAEA",
  border: "#E8E0D2", divider: "#F1EBE0",
  amberText: "#9A6700",
};

const CATEGORIES = ["Semua", "Nasi", "Mie", "Roti", "Minuman", "Snack"];
const EDIT_CATEGORIES = CATEGORIES.filter((c) => c !== "Semua");

const SEED = [
  { id: "1", name: "Nasi Goreng Hongkong", category: "Nasi", price: 18000, variants: [], channels: { preorder: true, sales: true } },
  { id: "2", name: "Nasi Ayam", category: "Nasi", price: 15000, variants: [], channels: { preorder: true, sales: true } },
  { id: "3", name: "Bakmi Bakso Vegan", category: "Mie", price: null, channels: { preorder: true, sales: false },
    variants: [{ id: "v1", name: "S", price: 15000 }, { id: "v2", name: "M", price: 18000 }, { id: "v3", name: "L", price: 20000 }] },
  { id: "4", name: "Thai Tea", category: "Minuman", price: null, channels: { preorder: true, sales: true },
    variants: [{ id: "v4", name: "Reguler", price: 10000 }, { id: "v5", name: "Jumbo", price: 15000 }] },
  { id: "5", name: "Air Mineral", category: "Minuman", price: 4000, variants: [], channels: { preorder: true, sales: true } },
  { id: "6", name: "Risol Mayo", category: "Snack", price: 6000, variants: [], channels: { preorder: false, sales: true } },
];

const rupiah = (n) =>
  n == null ? "—" : "Rp" + n.toLocaleString("id-ID");

const uid = () => Math.random().toString(36).slice(2, 9);

function priceLabel(m) {
  if (m.variants.length > 0) {
    const ps = m.variants.map((v) => v.price).filter((x) => x != null);
    if (ps.length === 0) return `${m.variants.length} varian`;
    const lo = Math.min(...ps), hi = Math.max(...ps);
    return lo === hi ? rupiah(lo) : `${rupiah(lo)} – ${rupiah(hi)}`;
  }
  return rupiah(m.price);
}

export default function MasterMenu() {
  const [menus, setMenus] = useState(SEED);
  const [cat, setCat] = useState("Semua");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState(null); // id of menu open in editor

  useEffect(() => {
    // muat font brand (di repo sudah global, ini hanya untuk preview)
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(l);
  }, []);

  const filtered = useMemo(() => {
    return menus.filter(
      (m) =>
        (cat === "Semua" || m.category === cat) &&
        m.name.toLowerCase().includes(q.toLowerCase())
    );
  }, [menus, cat, q]);

  const editing = menus.find((m) => m.id === editingId) || null;

  // --- mutations (semua auto-save: langsung ubah state) ---
  const patch = (id, fields) =>
    setMenus((ms) => ms.map((m) => (m.id === id ? { ...m, ...fields } : m)));

  const toggleChannel = (id, key) =>
    setMenus((ms) =>
      ms.map((m) =>
        m.id === id ? { ...m, channels: { ...m.channels, [key]: !m.channels[key] } } : m
      )
    );

  const addMenu = () => {
    const m = { id: uid(), name: "Menu Baru", category: EDIT_CATEGORIES[0], price: 0, variants: [], channels: { preorder: true, sales: true } };
    setMenus((ms) => [m, ...ms]);
    setEditingId(m.id);
  };

  const removeMenu = (id) => {
    setMenus((ms) => ms.filter((m) => m.id !== id));
    setEditingId(null);
  };

  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", minHeight: "100vh" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 96px" }}>

        {/* Header */}
        <div style={{ padding: "22px 20px 12px", position: "sticky", top: 0, background: t.bg, zIndex: 5 }}>
          <div className="flex items-center justify-between">
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>Menu</div>
              <div style={{ fontSize: 13, color: t.text2, marginTop: 2 }}>Master Menu — sumber data semua transaksi</div>
            </div>
            <button onClick={addMenu}
              className="flex items-center gap-2"
              style={{ background: t.primary, color: t.text, fontWeight: 700, fontSize: 15, height: 48, padding: "0 16px", borderRadius: 12, border: "none", cursor: "pointer" }}>
              <Plus size={20} /> Tambah
            </button>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2" style={{ marginTop: 14, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "0 12px", height: 48 }}>
            <Search size={20} color={t.text2} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari menu…"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 16, width: "100%", color: t.text, fontFamily: "inherit" }} />
            {q && <X size={18} color={t.text2} style={{ cursor: "pointer" }} onClick={() => setQ("")} />}
          </div>

          {/* Category filter */}
          <div className="flex gap-2" style={{ marginTop: 12, overflowX: "auto", paddingBottom: 4 }}>
            {CATEGORIES.map((c) => {
              const on = c === cat;
              return (
                <button key={c} onClick={() => setCat(c)}
                  style={{
                    flex: "none", height: 38, padding: "0 16px", borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: "pointer",
                    border: `1.5px solid ${on ? t.primary : t.border}`,
                    background: on ? t.primaryLight : t.surface,
                    color: on ? t.amberText : t.text2,
                  }}>
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        {/* List */}
        <div style={{ padding: "4px 20px" }}>
          {filtered.length === 0 ? (
            <Empty />
          ) : (
            filtered.map((m) => (
              <MenuCard key={m.id} m={m}
                onEdit={() => setEditingId(m.id)}
                onToggle={(k) => toggleChannel(m.id, k)} />
            ))
          )}
        </div>
      </div>

      {/* Editor sheet */}
      {editing && (
        <Editor
          m={editing}
          onClose={() => setEditingId(null)}
          onPatch={(f) => patch(editing.id, f)}
          onRemove={() => removeMenu(editing.id)}
        />
      )}
    </div>
  );
}

/* ---------------- Menu Card ---------------- */
function MenuCard({ m, onEdit, onToggle }) {
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: "0 1px 2px rgba(47,42,36,.04)" }}>
      <div className="flex items-start justify-between" style={{ cursor: "pointer" }} onClick={onEdit}>
        <div style={{ minWidth: 0 }}>
          <div className="flex items-center gap-2">
            <div style={{ fontSize: 17, fontWeight: 700 }}>{m.name}</div>
            {m.variants.length > 0 && (
              <span className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 700, color: t.amberText, background: t.primaryLight, padding: "2px 8px", borderRadius: 999 }}>
                <Layers size={12} /> {m.variants.length} varian
              </span>
            )}
          </div>
          <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
            <span style={{ fontSize: 12.5, color: t.text2, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Tag size={13} /> {m.category}
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{priceLabel(m)}</span>
          </div>
        </div>
        <Pencil size={18} color={t.textDis} />
      </div>

      {/* Channel toggles — tap = auto-save */}
      <div className="flex gap-2" style={{ marginTop: 14 }}>
        <ChannelChip on={m.channels.preorder} icon={<Utensils size={16} />} label="Pre-order" onClick={() => onToggle("preorder")} />
        <ChannelChip on={m.channels.sales} icon={<ShoppingCart size={16} />} label="Penjualan" onClick={() => onToggle("sales")} />
      </div>
    </div>
  );
}

function ChannelChip({ on, icon, label, onClick }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2"
      style={{
        flex: 1, height: 44, borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 14, justifyContent: "center",
        border: `1.5px solid ${on ? t.primary : t.border}`,
        background: on ? t.primaryLight : t.surfaceSoft,
        color: on ? t.amberText : t.textDis,
      }}>
      {icon}{label}{on && <Check size={16} />}
    </button>
  );
}

/* ---------------- Editor (bottom sheet) ---------------- */
function Editor({ m, onClose, onPatch, onRemove }) {
  const hasVariants = m.variants.length > 0;

  const setName = (name) => onPatch({ name });
  const setCategory = (category) => onPatch({ category });
  const setPrice = (v) => onPatch({ price: v === "" ? null : Number(v) });

  const enableVariants = (on) => {
    if (on) onPatch({ variants: [{ id: uid(), name: "", price: 0 }], price: null });
    else onPatch({ variants: [], price: 0 });
  };
  const patchVariant = (id, f) =>
    onPatch({ variants: m.variants.map((v) => (v.id === id ? { ...v, ...f } : v)) });
  const addVariant = () => onPatch({ variants: [...m.variants, { id: uid(), name: "", price: 0 }] });
  const removeVariant = (id) => onPatch({ variants: m.variants.filter((v) => v.id !== id) });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
      <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
        <div style={{ position: "sticky", top: 0, background: t.surface, padding: "16px 20px 12px", borderBottom: `1px solid ${t.divider}` }} className="flex items-center justify-between">
          <div style={{ fontSize: 18, fontWeight: 800 }}>Edit Menu</div>
          <button onClick={onClose} className="flex items-center gap-2" style={{ background: t.primary, color: t.text, border: "none", borderRadius: 10, height: 40, padding: "0 16px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
            <Check size={18} /> Selesai
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {/* Nama */}
          <Field label="Nama Menu">
            <input value={m.name} onChange={(e) => setName(e.target.value)} placeholder="cth. Nasi Goreng Hongkong" style={inputStyle} />
          </Field>

          {/* Kategori */}
          <Field label="Kategori">
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              {EDIT_CATEGORIES.map((c) => {
                const on = c === m.category;
                return (
                  <button key={c} onClick={() => setCategory(c)}
                    style={{ height: 40, padding: "0 14px", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer",
                      border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, color: on ? t.amberText : t.text2 }}>
                    {c}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Varian toggle */}
          <div className="flex items-center justify-between" style={{ padding: "14px 0", borderTop: `1px solid ${t.divider}`, borderBottom: `1px solid ${t.divider}`, margin: "4px 0 16px" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Punya varian?</div>
              <div style={{ fontSize: 12.5, color: t.text2, marginTop: 2 }}>cth. S / M / L, atau Reguler / Jumbo</div>
            </div>
            <Toggle on={hasVariants} onClick={() => enableVariants(!hasVariants)} />
          </div>

          {/* Harga / Varian */}
          {!hasVariants ? (
            <Field label="Harga">
              <div className="flex items-center" style={{ ...inputStyle, padding: 0, overflow: "hidden" }}>
                <span style={{ padding: "0 12px", color: t.text2, fontWeight: 600 }}>Rp</span>
                <input type="number" value={m.price ?? ""} onChange={(e) => setPrice(e.target.value)} placeholder="0"
                  style={{ border: "none", outline: "none", background: "transparent", fontSize: 16, width: "100%", height: 50, color: t.text, fontFamily: "inherit" }} />
              </div>
            </Field>
          ) : (
            <Field label="Varian & Harga">
              {m.variants.map((v) => (
                <div key={v.id} className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                  <input value={v.name} onChange={(e) => patchVariant(v.id, { name: e.target.value })} placeholder="Nama (cth. M)"
                    style={{ ...inputStyle, flex: 1, height: 48 }} />
                  <div className="flex items-center" style={{ ...inputStyle, padding: 0, width: 130, height: 48, overflow: "hidden" }}>
                    <span style={{ padding: "0 10px", color: t.text2, fontWeight: 600 }}>Rp</span>
                    <input type="number" value={v.price} onChange={(e) => patchVariant(v.id, { price: Number(e.target.value) })}
                      style={{ border: "none", outline: "none", background: "transparent", fontSize: 15, width: "100%", height: 46, color: t.text, fontFamily: "inherit" }} />
                  </div>
                  <button onClick={() => removeVariant(v.id)} style={{ flex: "none", width: 44, height: 48, borderRadius: 10, border: `1.5px solid ${t.border}`, background: t.surface, color: t.error, cursor: "pointer", display: "grid", placeItems: "center" }}>
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              <button onClick={addVariant} className="flex items-center justify-center gap-2"
                style={{ width: "100%", height: 46, borderRadius: 10, border: `1.5px dashed ${t.primary}`, background: t.surfaceSoft, color: t.amberText, fontWeight: 700, fontSize: 14, cursor: "pointer", marginTop: 4 }}>
                <Plus size={18} /> Tambah Varian
              </button>
            </Field>
          )}

          {/* Channels */}
          <Field label="Tampil di">
            <div className="flex gap-2">
              <ChannelChip on={m.channels.preorder} icon={<Utensils size={16} />} label="Pre-order" onClick={() => onPatch({ channels: { ...m.channels, preorder: !m.channels.preorder } })} />
              <ChannelChip on={m.channels.sales} icon={<ShoppingCart size={16} />} label="Penjualan" onClick={() => onPatch({ channels: { ...m.channels, sales: !m.channels.sales } })} />
            </div>
          </Field>

          {/* Delete */}
          <button onClick={onRemove} className="flex items-center justify-center gap-2"
            style={{ width: "100%", height: 48, borderRadius: 12, border: `1.5px solid ${t.error}`, background: t.errorBg, color: t.error, fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 20 }}>
            <Trash2 size={18} /> Hapus Menu
          </button>
          <div style={{ fontSize: 12, color: t.text2, textAlign: "center", marginTop: 10 }}>Perubahan tersimpan otomatis — tanpa tombol Simpan.</div>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", height: 50, fontSize: 16, color: t.text, background: t.surface,
  border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "0 14px", outline: "none",
  fontFamily: "inherit",
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: t.text }}>{label}</div>
      {children}
    </div>
  );
}

function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} style={{ width: 52, height: 30, borderRadius: 999, border: "none", cursor: "pointer", background: on ? t.primary : t.border, position: "relative", transition: "background .15s" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 25 : 3, width: 24, height: 24, borderRadius: "50%", background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
    </button>
  );
}

function Empty() {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px" }}>
      <div style={{ width: 60, height: 60, borderRadius: 16, background: t.primaryLight, color: t.amberText, display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
        <Search size={26} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 700 }}>Menu tidak ditemukan</div>
      <div style={{ fontSize: 14, color: t.text2, marginTop: 6 }}>Coba kategori lain, atau tambah menu baru.</div>
    </div>
  );
}
