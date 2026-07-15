import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Search, X, Utensils, ShoppingCart, Trash2,
  Check, Tag, Layers, Settings, Calendar, Lock,
} from "lucide-react";
import PreOrderParent from "./PreOrderParent";
import { t } from "../../lib/theme";
import { priceLabel, uid, serviceDateLabel, todayISO } from "../../lib/format";
import { KATEGORI_ORTU_LIST } from "../../lib/constants";
import PaperTabs from "../components/PaperTabs";
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

export type MenuView = "po" | "menu";

export default function MasterMenu({
  menus,
  onAdd,
  onPatch,
  onToggleChannel,
  onRemove,
  onOpenSettings,
  view,
  onViewChange,
  serviceDate,
  menuHarian,
  menuHarianReady,
  onLoadDate,
  onSaveDaily,
  kantin,
}: {
  menus: MenuItem[];
  onAdd: (item: MenuItem) => void;
  onPatch: (id: string, fields: Partial<MenuItem>) => void;
  onToggleChannel: (id: string, key: keyof MenuItem["channels"]) => void;
  onRemove: (id: string) => void;
  onOpenSettings: () => void;
  view: MenuView;
  onViewChange: (v: MenuView) => void;
  /** Tanggal sesi PO berikutnya — default selector tanggal di kertas PO. */
  serviceDate: string;
  /** Snapshot menu_harian per tanggal: null = belum pernah disimpan,
   * key tidak ada = belum di-fetch. */
  menuHarian: Record<string, MenuItem[] | null>;
  /** false = migration_9 belum dijalankan → kertas PO fallback ke toggle live. */
  menuHarianReady: boolean;
  onLoadDate: (tanggal: string) => void;
  onSaveDaily: (tanggal: string, items: MenuItem[]) => Promise<void>;
  /** Nama kantin — dipakai header pratinjau "Lihat sebagai Ortu". */
  kantin: string;
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

  /* ============ Kertas PO: MENU HARIAN per tanggal + tombol Simpan ============
     Toggle di kertas ini mengubah DRAFT di layar saja; baru tersimpan permanen
     ke menu_harian saat tombol "Simpan" ditekan (dengan konfirmasi). Tanggal
     lampau = read-only (riwayat). Sebelum migration_9: fallback toggle live. */
  const [tanggal, setTanggal] = useState(serviceDate);
  useEffect(() => { setTanggal(serviceDate); }, [serviceDate]);
  const dateRef = useRef<HTMLInputElement>(null);
  const isPast = tanggal < todayISO();
  const snapshot = menuHarian[tanggal]; // undefined = belum di-fetch
  const snapLoaded = snapshot !== undefined;

  useEffect(() => {
    if (menuHarianReady && !snapLoaded) onLoadDate(tanggal);
  }, [tanggal, menuHarianReady, snapLoaded, onLoadDate]);

  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [seed, setSeed] = useState<Record<string, boolean>>({});
  const menusRef = useRef(menus);
  menusRef.current = menus;
  useEffect(() => {
    // Seed draft saat ganti tanggal / snapshot pertama termuat. SENGAJA tidak
    // depend ke `menus` supaya reload realtime tidak menghapus draft yang
    // sedang diedit.
    if (!menuHarianReady || isPast || !snapLoaded) return;
    const base: Record<string, boolean> = {};
    if (snapshot) {
      const on = new Set(snapshot.filter((s) => s.channels.preorder).map((s) => s.id));
      menusRef.current.forEach((m) => { base[m.id] = on.has(m.id); });
    } else {
      menusRef.current.forEach((m) => { base[m.id] = m.channels.preorder; });
    }
    setDraft(base);
    setSeed(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tanggal, menuHarianReady, isPast, snapLoaded]);

  /** Flag Pre-order yang berlaku di kertas PO: draft (mode harian) atau
   * channels live (fallback pra-migration). */
  const poOn = (m: MenuItem) =>
    menuHarianReady && !isPast ? !!draft[m.id] : m.channels.preorder;
  const poToggle = (m: MenuItem, on: boolean) => {
    if (menuHarianReady && !isPast) setDraft((prev) => ({ ...prev, [m.id]: on }));
    else toggleChannel(m.id, "preorder");
  };

  const dailyDirty = useMemo(
    () => menuHarianReady && !isPast && menus.some((m) => (draft[m.id] ?? false) !== (seed[m.id] ?? false)),
    [menus, draft, seed, menuHarianReady, isPast]
  );
  const aktifCount = useMemo(() => menus.filter((m) => poOn(m)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menus, draft, menuHarianReady, isPast]);

  /* Data untuk pratinjau tampilan ortu (komponen PreOrderParent asli,
     mode baca) — membaca DRAFT yang sedang disusun; tanggal lampau
     membaca snapshot yang tersimpan. */
  const previewMenus = useMemo(() => {
    if (isPast && menuHarianReady) return snapshot || [];
    return menus.map((m) => ({ ...m, channels: { ...m.channels, preorder: poOn(m) } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menus, draft, snapshot, isPast, menuHarianReady]);

  // Simpan (dengan konfirmasi) + toast hasil
  const [confirmSave, setConfirmSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);
  const doSave = async () => {
    setSaving(true);
    try {
      const items = menus.map((m) => ({ ...m, channels: { preorder: !!draft[m.id], sales: m.channels.sales } }));
      await onSaveDaily(tanggal, items);
      setSeed({ ...draft });
      setConfirmSave(false);
      setToast(`Menu untuk ${serviceDateLabel(tanggal)} berhasil disimpan (${aktifCount} item aktif)`);
    } catch {
      setToast("Gagal menyimpan. Periksa koneksi internet, lalu coba lagi.");
    } finally {
      setSaving(false);
    }
  };

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

          {/* Dua "kertas" ala tab Chrome: Tampilan Ortu (pratinjau) · Menu (daftar semula) */}
          <div style={{ marginTop: 16 }}>
            <PaperTabs
              tabs={[{ id: "po", label: "PO" }, { id: "menu", label: "Menu" }]}
              value={view}
              onChange={onViewChange}
            />
          </div>

          {view === "menu" && (
            <>
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
            </>
          )}
        </div>

        {/* List */}
        <div style={{ padding: "4px 20px" }}>
          {/* Banner item belum dikategorikan — hilang otomatis saat 0 */}
          {view === "menu" && uncategorized.length > 0 && (
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
          {view === "po" ? (
            <>
              {/* Selector tanggal — default: tanggal sesi PO berikutnya.
                  Boleh pilih tanggal lampau untuk lihat riwayat (read-only). */}
              {menuHarianReady ? (
                <div style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 14, marginBottom: 14, overflow: "hidden" }}>
                  {/* Seluruh area bisa diketuk: input date overlay inset:0
                      menerima ketukan langsung (pola wajib CLAUDE.md — fix
                      "tidak merespon di HP"). showPicker = pemanis desktop. */}
                  <div className="flex items-center gap-3"
                    style={{ position: "relative", padding: "12px 14px", cursor: "pointer" }}>
                    <Calendar size={19} color={t.amberText} style={{ flex: "none" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: t.text2 }}>Menu untuk</div>
                      <div style={{ fontSize: 16.5, fontWeight: 800 }}>{serviceDateLabel(tanggal)}</div>
                    </div>
                    <input ref={dateRef} type="date" value={tanggal}
                      onChange={(e) => e.target.value && setTanggal(e.target.value)}
                      onClick={() => { try { dateRef.current?.showPicker?.(); } catch { /* fallback native */ } }}
                      aria-label="Pilih tanggal menu"
                      style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
                  </div>
                  {isPast && (
                    <div className="flex items-center gap-2" style={{ padding: "9px 14px", borderTop: `1px solid ${t.divider}`, background: t.surfaceSoft, fontSize: 12.5, fontWeight: 700, color: t.text2 }}>
                      <Lock size={13} /> Mode Lihat Riwayat — data tanggal ini terkunci
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ background: "#FFF4DA", border: "1px solid #F1DFB0", borderRadius: 14, padding: "12px 14px", marginBottom: 14, fontSize: 13, color: t.amberText, lineHeight: 1.55 }}>
                  Riwayat menu per tanggal butuh <b>migration_9_menu_harian.sql</b> dijalankan di Supabase dulu. Sementara itu toggle di bawah masih langsung tersimpan (perilaku lama).
                </div>
              )}

              {isPast && menuHarianReady && !snapLoaded ? (
                <div style={{ textAlign: "center", color: t.text2, fontSize: 14, padding: "32px 0" }}>Memuat…</div>
              ) : isPast && menuHarianReady && snapshot === null ? (
                <div style={{ textAlign: "center", color: t.text2, fontSize: 14.5, padding: "36px 12px" }}>Belum ada data tersimpan untuk tanggal ini.</div>
              ) : (
                <>
                  {/* Pratinjau = komponen halaman ortu ASLI (previewMode),
                      membaca draft. Menyusun (toggle) dilakukan di kertas
                      Menu; kertas ini murni untuk memastikan hasilnya. */}
                  <div style={{ border: `1.5px solid ${t.border}`, borderRadius: 18, overflow: "hidden", background: t.bg }}>
                    <PreOrderParent
                      previewMode
                      kantin={kantin}
                      serviceDate={serviceDateLabel(tanggal)}
                      open
                      menus={previewMenus}
                      kelasList={[]}
                      pickupOptions={[]}
                      onSubmit={async () => { throw new Error("preview"); }}
                    />
                  </div>

                  {/* Bar status + Simpan — kuning: belum resmi, hijau: tersimpan */}
                  {menuHarianReady && !isPast && (() => {
                    const belumResmi = dailyDirty || !snapshot;
                    return (
                      <div style={{ position: "sticky", bottom: 10, marginTop: 14, zIndex: 5 }}>
                        <div className="flex items-center gap-3" style={{ background: belumResmi ? "#FFF4DA" : t.successBg, border: `1.5px solid ${belumResmi ? t.primary : "#D8E6D4"}`, borderRadius: 14, padding: "10px 12px", boxShadow: "0 6px 20px rgba(47,42,36,.14)" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 800 }}>{aktifCount} item aktif</div>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: belumResmi ? t.amberText : t.successText }}>
                              {belumResmi ? "Belum disimpan — ortu masih melihat versi lama" : "Resmi tersimpan — persis yang dilihat ortu"}
                            </div>
                          </div>
                          <button onClick={() => setConfirmSave(true)}
                            style={{ height: 48, padding: "0 18px", borderRadius: 12, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 14, cursor: "pointer", flex: "none" }}>
                            Simpan
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </>
          ) : filtered.length === 0 ? (
            <Empty />
          ) : (
            filtered.map((m) => (
              // Ikon Utensils = "jual di PO tanggal terpilih" (draft, disahkan
              // lewat Simpan); ikon ShoppingCart tetap ketersediaan Penjualan.
              <MenuCard key={m.id} m={{ ...m, channels: { ...m.channels, preorder: poOn(m) } }}
                onEdit={() => setEditingId(m.id)}
                onToggle={(k) => k === "preorder" ? poToggle(m, !poOn(m)) : toggleChannel(m.id, k)} />
            ))
          )}

          {/* Pengingat Simpan — ikut tampil di kertas Menu saat ada draft
              yang belum disahkan, supaya tidak ada perubahan yang terlupa */}
          {view === "menu" && menuHarianReady && !isPast && dailyDirty && (
            <div style={{ position: "sticky", bottom: 10, marginTop: 14, zIndex: 5 }}>
              <div className="flex items-center gap-3" style={{ background: "#FFF4DA", border: `1.5px solid ${t.primary}`, borderRadius: 14, padding: "10px 12px", boxShadow: "0 6px 20px rgba(47,42,36,.14)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>Menu {serviceDateLabel(tanggal)}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: t.amberText }}>Belum disimpan — ortu masih melihat versi lama</div>
                </div>
                <button onClick={() => setConfirmSave(true)}
                  style={{ height: 48, padding: "0 18px", borderRadius: 12, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 14, cursor: "pointer", flex: "none" }}>
                  Simpan
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Konfirmasi Simpan Menu Harian */}
      {confirmSave && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={() => !saving && setConfirmSave(false)} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
          <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", padding: 24, boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Simpan menu untuk {serviceDateLabel(tanggal)}?</div>
            <div style={{ fontSize: 14.5, color: t.text2, lineHeight: 1.6 }}>
              <b style={{ color: t.text }}>{aktifCount} item aktif</b> akan disimpan sebagai menu tanggal ini — inilah yang tampil ke orang tua.
            </div>
            <div className="flex gap-2" style={{ marginTop: 20 }}>
              <button onClick={() => setConfirmSave(false)} disabled={saving}
                style={{ flex: 1, height: 52, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={doSave} disabled={saving}
                className="flex items-center justify-center gap-2"
                style={{ flex: 1, height: 52, borderRadius: 12, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 15, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
                <Check size={18} /> {saving ? "Menyimpan…" : "Ya, Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast hasil simpan */}
      {toast && (
        <div style={{ position: "fixed", left: 20, right: 20, bottom: 90, display: "flex", justifyContent: "center", zIndex: 70 }}>
          <div className="flex items-center gap-2" style={{ maxWidth: 400, width: "100%", background: t.text, color: "#FBF7EF", borderRadius: 14, padding: "14px 18px", fontSize: 14, fontWeight: 600, boxShadow: "0 14px 34px rgba(47,42,36,.3)" }}>
            <Check size={18} color={t.success} /> {toast}
          </div>
        </div>
      )}

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
              <span className="flex items-center gap-1" title={`${m.variants.length} varian`}
                style={{ fontSize: 11, fontWeight: 700, color: t.amberText, background: t.primaryLight, padding: "2px 8px", borderRadius: 999 }}>
                <Layers size={12} /> {m.variants.length}
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
