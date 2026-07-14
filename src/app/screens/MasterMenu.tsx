import { useMemo, useState } from "react";
import {
  Plus, Search, X, Utensils, ShoppingCart, Trash2,
  Check, Tag, Layers, Settings,
} from "lucide-react";
import { t } from "../../lib/theme";
import { priceLabel, uid } from "../../lib/format";
import { KATEGORI_ORTU_LIST } from "../../lib/constants";
import type { MenuItem, Variant } from "../../types";

/* ============================================================
   MENU (Master Menu) — Canteen Gan En
   Source of truth untuk seluruh data makanan.
   Decision Lock §3: varian + harga per varian, channel
   Pre-order/Penjualan (toggle, auto-save), kategori = filter,
   tanpa foto, tanpa emoji (ikon Lucide), Rupiah.
   ------------------------------------------------------------
   Mutasi lewat callback per-aksi (bukan setMenus mentah) supaya
   App.tsx bisa menulis delta satu baris ke Supabase, bukan diff
   seluruh array 179 item tiap ketikan.
   ============================================================ */

export default function MasterMenu({
  menus,
  onAdd,
  onPatch,
  onToggleChannel,
  onRemove,
  onOpenSettings,
}: {
  menus: MenuItem[];
  onAdd: (item: MenuItem) => void;
  onPatch: (id: string, fields: Partial<MenuItem>) => void;
  onToggleChannel: (id: string, key: keyof MenuItem["channels"]) => void;
  onRemove: (id: string) => void;
  onOpenSettings: () => void;
}) {
  const [cat, setCat] = useState("Semua");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showUncategorized, setShowUncategorized] = useState(false);

  // Item yang belum punya Kategori untuk Orang Tua — tampil sebagai "Lainnya"
  // di halaman ortu; banner di bawah mengajak mengisinya cepat satu per satu.
  const uncategorized = useMemo(() => menus.filter((m) => !m.kategoriOrtu), [menus]);

  const categories = useMemo(
    () => ["Semua", ...Array.from(new Set(menus.map((m) => m.category))).sort()],
    [menus]
  );

  const filtered = useMemo(() => {
    const base = showUncategorized ? uncategorized : menus;
    return base.filter(
      (m) =>
        (showUncategorized || cat === "Semua" || m.category === cat) &&
        m.name.toLowerCase().includes(q.toLowerCase())
    );
  }, [menus, cat, q, showUncategorized, uncategorized]);

  const editing = menus.find((m) => m.id === editingId) || null;

  // --- mutations (semua auto-save: langsung ubah state) ---
  const patch = onPatch;
  const toggleChannel = onToggleChannel;

  const addMenu = () => {
    const m: MenuItem = {
      id: uid(),
      name: "Menu Baru",
      category: categories[1] || "Lainnya",
      price: 0,
      variants: [],
      channels: { preorder: true, sales: true },
    };
    onAdd(m);
    setEditingId(m.id);
  };

  const removeMenu = (id: string) => {
    onRemove(id);
    setEditingId(null);
  };

  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 96px" }}>
        {/* Header */}
        <div style={{ padding: "22px 20px 12px", position: "sticky", top: 0, background: t.bg, zIndex: 5 }}>
          <div className="flex items-center justify-between">
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>Menu</div>
              <div style={{ fontSize: 13, color: t.text2, marginTop: 2 }}>Master Menu — sumber data semua transaksi</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onOpenSettings}
                aria-label="Pengaturan"
                style={{ width: 44, height: 44, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}
              >
                <Settings size={19} />
              </button>
              <button onClick={addMenu}
                className="flex items-center gap-2"
                style={{ background: t.primary, color: t.text, fontWeight: 700, fontSize: 15, height: 44, padding: "0 16px", borderRadius: 12, border: "none", cursor: "pointer" }}>
                <Plus size={20} /> Tambah
              </button>
            </div>
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
            {categories.map((c) => {
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
          {/* Banner item belum dikategorikan — hilang otomatis saat 0 */}
          {uncategorized.length > 0 && (
            <button onClick={() => setShowUncategorized((v) => !v)}
              className="flex items-center gap-2"
              style={{ width: "100%", padding: "12px 14px", marginBottom: 12, borderRadius: 12, cursor: "pointer",
                border: `1.5px solid ${showUncategorized ? t.primary : "#F1DFB0"}`, background: "#FFF4DA", color: t.amberText, fontWeight: 700, fontSize: 14 }}>
              <Tag size={16} />
              <span style={{ flex: 1, textAlign: "left" }}>
                {showUncategorized
                  ? "← Kembali ke semua menu"
                  : `${uncategorized.length} item belum dikategorikan untuk halaman ortu`}
              </span>
            </button>
          )}
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
          categories={categories.filter((c) => c !== "Semua")}
          onClose={() => setEditingId(null)}
          onPatch={(f) => patch(editing.id, f)}
          onRemove={() => removeMenu(editing.id)}
        />
      )}
    </div>
  );
}

/* ---------------- Menu Card ---------------- */
function MenuCard({ m, onEdit, onToggle }: { m: MenuItem; onEdit: () => void; onToggle: (k: keyof MenuItem["channels"]) => void }) {
  return (
    // Seluruh kartu tappable = buka form edit; ikon toggle stopPropagation.
    <div onClick={onEdit}
      style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: "0 1px 2px rgba(47,42,36,.04)", cursor: "pointer" }}>
      <div className="flex items-start justify-between" style={{ gap: 12 }}>
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
        {/* Toggle kanal icon-only — tap TIDAK membuka edit */}
        <div className="flex gap-2" style={{ flex: "none" }}>
          <ChannelIcon on={m.channels.preorder} label="Tersedia di Pre-order"
            onClick={(e) => { e.stopPropagation(); onToggle("preorder"); }}>
            <Utensils size={17} />
          </ChannelIcon>
          <ChannelIcon on={m.channels.sales} label="Tersedia di Penjualan"
            onClick={(e) => { e.stopPropagation(); onToggle("sales"); }}>
            <ShoppingCart size={17} />
          </ChannelIcon>
        </div>
      </div>
    </div>
  );
}

function ChannelIcon({ on, label, onClick, children }: {
  on: boolean; label: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} title={label} aria-label={label} aria-pressed={on}
      style={{ width: 44, height: 44, borderRadius: 12, cursor: "pointer",
        border: `1.5px solid ${on ? t.primary : t.border}`,
        background: on ? t.primaryLight : t.surface,
        color: on ? t.amberText : t.textDis,
        display: "grid", placeItems: "center", flex: "none" }}>
      {children}
    </button>
  );
}

function ChannelChip({ on, icon, label, onClick }: { on: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
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
function Editor({ m, categories, onClose, onPatch, onRemove }: {
  m: MenuItem;
  categories: string[];
  onClose: () => void;
  onPatch: (f: Partial<MenuItem>) => void;
  onRemove: () => void;
}) {
  const hasVariants = m.variants.length > 0;
  const [newCatMode, setNewCatMode] = useState(false);
  const [newCat, setNewCat] = useState("");

  const setName = (name: string) => onPatch({ name });
  const setPrice = (v: string) => onPatch({ price: v === "" ? null : Number(v) });

  const pickCategory = (category: string) => { onPatch({ category }); setNewCatMode(false); setNewCat(""); };
  const applyNewCat = () => {
    const val = newCat.trim();
    if (!val) return;
    pickCategory(val);
  };
  // Kategori item ini bisa saja belum ada di daftar (baru dibuat) — tetap tampilkan.
  const catChips = categories.includes(m.category) ? categories : [...categories, m.category];

  const enableVariants = (on: boolean) => {
    if (on) onPatch({ variants: [{ id: uid(), name: "", price: 0 }], price: null });
    else onPatch({ variants: [], price: 0 });
  };
  const patchVariant = (id: string, f: Partial<Variant>) =>
    onPatch({ variants: m.variants.map((v) => (v.id === id ? { ...v, ...f } : v)) });
  const addVariant = () => onPatch({ variants: [...m.variants, { id: uid(), name: "", price: 0 }] });
  const removeVariant = (id: string) => onPatch({ variants: m.variants.filter((v) => v.id !== id) });

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

          {/* Kategori — chip ketuk langsung ganti, + Lainnya untuk kategori baru */}
          <Field label="Kategori">
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              {catChips.map((c) => {
                const on = c === m.category && !newCatMode;
                return (
                  <button key={c} onClick={() => pickCategory(c)}
                    style={{ height: 44, padding: "0 14px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer",
                      border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, color: on ? t.amberText : t.text2 }}>
                    {c}
                  </button>
                );
              })}
              <button onClick={() => { setNewCatMode(true); setNewCat(""); }}
                className="flex items-center gap-1"
                style={{ height: 44, padding: "0 14px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer",
                  border: `1.5px dashed ${newCatMode ? t.primary : t.border}`, background: newCatMode ? t.primaryLight : t.surfaceSoft, color: t.amberText }}>
                <Plus size={16} /> Lainnya
              </button>
            </div>
            {newCatMode && (
              <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
                <input value={newCat} onChange={(e) => setNewCat(e.target.value)} autoFocus
                  onKeyDown={(e) => e.key === "Enter" && applyNewCat()}
                  placeholder="Nama kategori baru…" style={{ ...inputStyle, flex: 1, height: 48 }} />
                <button onClick={applyNewCat}
                  style={{ flex: "none", width: 48, height: 48, borderRadius: 10, border: "none", background: t.primary, color: t.text, cursor: "pointer", display: "grid", placeItems: "center" }}>
                  <Check size={18} />
                </button>
              </div>
            )}
          </Field>

          {/* Kategori untuk Orang Tua — WAJIB; menentukan kelompok di halaman /pesan */}
          <Field label="Kategori untuk Orang Tua">
            <select
              value={m.kategoriOrtu || ""}
              onChange={(e) => onPatch({ kategoriOrtu: e.target.value })}
              style={{ ...inputStyle, height: 50, cursor: "pointer",
                border: `1.5px solid ${m.kategoriOrtu ? t.border : t.error}`,
                color: m.kategoriOrtu ? t.text : t.textDis }}>
              <option value="" disabled>Pilih kategori…</option>
              {KATEGORI_ORTU_LIST.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            {!m.kategoriOrtu && (
              <div style={{ fontSize: 12.5, color: t.error, marginTop: 6 }}>
                Wajib dipilih — tanpa ini menu tampil sebagai "Lainnya" di halaman ortu.
              </div>
            )}
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

const inputStyle: React.CSSProperties = {
  width: "100%", height: 50, fontSize: 16, color: t.text, background: t.surface,
  border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "0 14px", outline: "none",
  fontFamily: "inherit",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: t.text }}>{label}</div>
      {children}
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
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
