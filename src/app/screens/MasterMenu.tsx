import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Search, X, Utensils, ShoppingCart, Trash2,
  Check, Tag, Layers, Settings, Calendar, Lock, RefreshCw,
} from "lucide-react";
import { t, NAV_HEIGHT } from "../../lib/theme";
import { priceLabel, uid, serviceDateLabel, todayISO } from "../../lib/format";
import { KATEGORI_ORTU_LIST, KATEGORI_ORTU_ORDER, KATEGORI_ORTU_FALLBACK } from "../../lib/constants";
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

/* Tepi zigzag ala struk thermal — dipakai pratinjau PO & pengingat Simpan */
const STRUK_ZIGZAG = "polygon(0 4px, 4% 0, 8% 4px, 12% 0, 16% 4px, 20% 0, 24% 4px, 28% 0, 32% 4px, 36% 0, 40% 4px, 44% 0, 48% 4px, 52% 0, 56% 4px, 60% 0, 64% 4px, 68% 0, 72% 4px, 76% 0, 80% 4px, 84% 0, 88% 4px, 92% 0, 96% 4px, 100% 0, 100% calc(100% - 4px), 96% 100%, 92% calc(100% - 4px), 88% 100%, 84% calc(100% - 4px), 80% 100%, 76% calc(100% - 4px), 72% 100%, 68% calc(100% - 4px), 64% 100%, 60% calc(100% - 4px), 56% 100%, 52% calc(100% - 4px), 48% 100%, 44% calc(100% - 4px), 40% 100%, 36% calc(100% - 4px), 32% 100%, 28% calc(100% - 4px), 24% 100%, 20% calc(100% - 4px), 16% 100%, 12% calc(100% - 4px), 8% 100%, 4% calc(100% - 4px), 0 100%)";

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

  // Refresh dengan umpan balik visual — ikon berputar sebentar supaya
  // jelas bahwa data benar-benar diambil ulang
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = () => {
    setRefreshing(true);
    onLoadDate(tanggal);
    setTimeout(() => setRefreshing(false), 900);
  };

  // Sheet pilihan saat menutup pengingat Simpan: Simpan / Buang / Kembali
  const [discardSheet, setDiscardSheet] = useState(false);

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

  /* Tambah = DRAFT dulu, bukan langsung tercipta di database. Baru benar-benar
     ditambahkan saat "Simpan" ditekan di editor; batal (ketuk area gelap) =
     tidak ada jejak. Mencegah sampah "Menu Baru" dari percobaan yang urung. */
  const [draftNew, setDraftNew] = useState<MenuItem | null>(null);
  const addMenu = () => {
    setDraftNew({
      id: uid(),
      name: "",
      category: categories[1] || "Lainnya",
      price: 0,
      variants: [],
      channels: { preorder: true, sales: true },
    });
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
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>Menu</div>
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
              tabs={[{ id: "menu", label: "Menu" }, { id: "po", label: "PO" }]}
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
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: t.text2 }}>Tanggal Layanan</div>
                      <div style={{ fontSize: 16.5, fontWeight: 800 }}>{serviceDateLabel(tanggal)}</div>
                    </div>
                    {!isPast && (
                      <button onClick={(e) => { e.stopPropagation(); doRefresh(); }}
                        title="Refresh" aria-label="Refresh pratinjau"
                        style={{ position: "relative", zIndex: 2, width: 40, height: 40, borderRadius: 11,
                          border: `1.5px solid ${refreshing ? t.primary : t.border}`,
                          background: refreshing ? t.primaryLight : t.surface,
                          color: t.amberText, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}>
                        <style>{`@keyframes ganen-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
                        <RefreshCw size={17} style={{ animation: refreshing ? "ganen-spin .9s linear" : undefined }} />
                      </button>
                    )}
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
                  {/* STRUK THERMAL — proofread menu ala cetakan kasir. Data &
                      urutan SAMA dengan halaman ortu; tanpa tombol/keranjang.
                      Satu-satunya tempat di app yang memakai huruf monospace
                      (pengecualian gaya yang disengaja, pilihan pemilik). */}
                  {(() => {
                    const tampil = previewMenus.filter((m) => m.channels.preorder);
                    const byKat: Record<string, MenuItem[]> = {};
                    tampil.forEach((m) => {
                      const k = m.kategoriOrtu && KATEGORI_ORTU_ORDER.includes(m.kategoriOrtu) ? m.kategoriOrtu : KATEGORI_ORTU_FALLBACK;
                      (byKat[k] = byKat[k] || []).push(m);
                    });
                    for (const k in byKat) byKat[k].sort((a, b) => a.name.localeCompare(b.name, "id"));
                    const riwayat = isPast && menuHarianReady;
                    const kats = KATEGORI_ORTU_ORDER.filter((k) =>
                      riwayat ? byKat[k]?.length : (k !== KATEGORI_ORTU_FALLBACK || byKat[k]?.length));
                    /* Format harga ala struk: ".000" jadi "k" (10.000 -> 10k).
                       Varian ditulis berjejer "3k 5k 7k" (urutan S/M/L sesuai
                       data); lebih dari 3 varian diringkas jadi rentang. */
                    const hargaK = (n: number) => n % 1000 === 0 ? `${n / 1000}k` : n.toLocaleString("id-ID");
                    const strukHarga = (m: MenuItem) => {
                      if (!m.variants.length) return hargaK(m.price ?? 0);
                      const ps = m.variants.map((v) => v.price);
                      return ps.length <= 3
                        ? ps.map(hargaK).join("/")
                        : `${hargaK(Math.min(...ps))}~${hargaK(Math.max(...ps))}`;
                    };
                    const garis = (c: string) => (
                      <div style={{ overflow: "hidden", whiteSpace: "nowrap", color: t.textDis, userSelect: "none" }}>{c.repeat(72)}</div>
                    );
                    const zigzag = "polygon(0 6px, 4% 0, 8% 6px, 12% 0, 16% 6px, 20% 0, 24% 6px, 28% 0, 32% 6px, 36% 0, 40% 6px, 44% 0, 48% 6px, 52% 0, 56% 6px, 60% 0, 64% 6px, 68% 0, 72% 6px, 76% 0, 80% 6px, 84% 0, 88% 6px, 92% 0, 96% 6px, 100% 0, 100% calc(100% - 6px), 96% 100%, 92% calc(100% - 6px), 88% 100%, 84% calc(100% - 6px), 80% 100%, 76% calc(100% - 6px), 72% 100%, 68% calc(100% - 6px), 64% 100%, 60% calc(100% - 6px), 56% 100%, 52% calc(100% - 6px), 48% 100%, 44% calc(100% - 6px), 40% 100%, 36% calc(100% - 6px), 32% 100%, 28% calc(100% - 6px), 24% 100%, 20% calc(100% - 6px), 16% 100%, 12% calc(100% - 6px), 8% 100%, 4% calc(100% - 6px), 0 100%)";
                    return (
                      <div style={{ background: t.surface, margin: "0 6px", padding: "18px 16px 22px",
                        fontFamily: "ui-monospace, 'Cascadia Mono', 'Courier New', monospace",
                        fontSize: 13, fontWeight: 600, lineHeight: 1.85, color: t.text,
                        boxShadow: "0 3px 14px rgba(47,42,36,.12)", clipPath: zigzag }}>
                        <div style={{ textAlign: "center", fontWeight: 700, fontSize: 14, letterSpacing: ".14em" }}>MENU PO</div>
                        {garis("=")}
                        {kats.map((k, i) => (
                          <div key={k}>
                            {i > 0 && garis("-")}
                            <div style={{ textAlign: "center", fontWeight: 700, letterSpacing: ".06em" }}>
                              {k.toUpperCase()} ({byKat[k]?.length || 0})
                            </div>
                            {byKat[k]?.length ? byKat[k].map((m) => (
                              <div key={m.id} className="flex" style={{ gap: 8, alignItems: "baseline" }}>
                                {/* Hybrid: nama menu (yang paling lama ditatap saat
                                    proofread) pakai font standar app; kerangka struk
                                    (judul/garis/harga) tetap monospace */}
                                <span style={{ flex: 1, minWidth: 0, fontFamily: "'Plus Jakarta Sans', -apple-system, 'Segoe UI', system-ui, sans-serif", fontSize: 14, fontWeight: 600 }}>{m.name}</span>
                                <span style={{ flex: "none", fontVariantNumeric: "tabular-nums" }}>{strukHarga(m)}</span>
                              </div>
                            )) : (
                              <div style={{ textAlign: "center", color: t.textDis }}>(kosong)</div>
                            )}
                          </div>
                        ))}
                        {garis("=")}
                        <div className="flex" style={{ gap: 8, fontWeight: 700 }}>
                          <span style={{ flex: 1 }}>TOTAL</span>
                          <span>{tampil.length} ITEM</span>
                        </div>
                        {tampil.length === 0 && (
                          <div style={{ textAlign: "center", color: t.text2, marginTop: 8 }}>Belum ada menu yang akan tampil ke orang tua.</div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Tanpa bar Simpan di sini — kertas PO murni pratinjau;
                      menyusun & Simpan seluruhnya di kertas Menu. */}
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

          {/* Bar Simpan — SATU-SATUNYA tempat mengesahkan menu harian
              (kertas PO murni pratinjau). Muncul saat ada perubahan belum
              disimpan ATAU tanggal terpilih belum pernah disimpan. */}
          {view === "menu" && menuHarianReady && !isPast && snapLoaded && (dailyDirty || snapshot === null) && (
            /* Pengingat Simpan gaya STRUK THERMAL — X nongol di pojok kanan
               atas membuka pilihan Batal / Buang Perubahan / Simpan. */
            <div style={{ position: "fixed", left: 20, right: 20, bottom: NAV_HEIGHT + 14, zIndex: 40, pointerEvents: "none" }}>
              <div style={{ position: "relative", maxWidth: 330, margin: "0 auto", filter: "drop-shadow(0 8px 22px rgba(47,42,36,.28))", pointerEvents: "auto" }}>
                <div style={{ background: t.surface, padding: "18px 16px 16px", textAlign: "center",
                  fontFamily: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', 'SF Mono', 'Roboto Mono', 'Courier New', monospace",
                  fontWeight: 600, clipPath: STRUK_ZIGZAG }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: ".02em" }}>
                    {serviceDateLabel(tanggal).toUpperCase()}
                  </div>
                  <div style={{ fontSize: 12.5, color: t.text2, marginTop: 2 }}>{aktifCount} ITEM</div>
                  <div style={{ borderTop: `1.5px dashed ${t.border}`, margin: "10px 0 0" }} />
                  <button onClick={() => setConfirmSave(true)}
                    style={{ width: "100%", height: 52, marginTop: 12, borderRadius: 13, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 15.5, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Simpan
                  </button>
                </div>
                {dailyDirty && (
                  <button onClick={() => setDiscardSheet(true)}
                    title="Tutup pengingat" aria-label="Tutup pengingat"
                    style={{ position: "absolute", top: -12, right: -8, width: 42, height: 42, borderRadius: "50%", border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 4px 12px rgba(47,42,36,.2)" }}>
                    <X size={19} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pilihan saat menutup pengingat: Simpan / Buang Perubahan / Kembali */}
      {discardSheet && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={() => setDiscardSheet(false)} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
          <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", padding: 24, boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Perubahan belum disimpan</div>
            <div style={{ fontSize: 14.5, color: t.text2, lineHeight: 1.6, marginBottom: 18 }}>
              Menu {serviceDateLabel(tanggal)} · <b style={{ color: t.text }}>{aktifCount} item aktif</b>. Mau diapakan?
            </div>
            <button onClick={() => { setDiscardSheet(false); setConfirmSave(true); }}
              className="flex items-center justify-center gap-2"
              style={{ width: "100%", height: 54, marginBottom: 10, borderRadius: 13, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
              <Check size={18} /> Simpan
            </button>
            <button onClick={() => { setDraft({ ...seed }); setDiscardSheet(false); }}
              style={{ width: "100%", height: 54, marginBottom: 10, borderRadius: 13, border: `1.5px solid ${t.border}`, background: t.errorBg, color: t.error, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
              Buang Perubahan
            </button>
            <button onClick={() => setDiscardSheet(false)}
              style={{ width: "100%", height: 54, borderRadius: 13, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              Batal
            </button>
          </div>
        </div>
      )}

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

      {/* Editor sheet — item existing (auto-save) atau draft menu baru */}
      {(editing || draftNew) && (
        <Editor
          m={draftNew ?? editing!}
          isNew={!!draftNew}
          categories={categories.filter((c) => c !== "Semua")}
          onClose={() => { setEditingId(null); setDraftNew(null); }}
          onPatch={(f) => draftNew
            ? setDraftNew((prev) => (prev ? { ...prev, ...f } : prev))
            : patch(editing!.id, f)}
          onSaveNew={() => {
            setDraftNew((prev) => {
              if (prev) onAdd(prev);
              return null;
            });
          }}
          onRemove={() => editing && removeMenu(editing.id)}
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
function Editor({ m, categories, onClose, onPatch, onRemove, isNew = false, onSaveNew }: {
  m: MenuItem;
  categories: string[];
  onClose: () => void;
  onPatch: (f: Partial<MenuItem>) => void;
  onRemove: () => void;
  /** true = draft menu baru: belum ada di database sampai Simpan ditekan. */
  isNew?: boolean;
  onSaveNew?: () => void;
}) {
  const hasVariants = m.variants.length > 0;
  const [newCatMode, setNewCatMode] = useState(false);
  const [newCat, setNewCat] = useState("");
  const canSaveNew = m.name.trim().length > 0 && !!m.kategoriOrtu;

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
          <div style={{ fontSize: 18, fontWeight: 800 }}>{isNew ? "Menu Baru" : "Edit Menu"}</div>
          <div className="flex items-center gap-2">
            {isNew && (
              <button onClick={onClose} style={{ background: "transparent", color: t.text2, border: `1.5px solid ${t.border}`, borderRadius: 10, height: 40, padding: "0 14px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Batal
              </button>
            )}
            <button
              onClick={isNew ? (canSaveNew ? onSaveNew : undefined) : onClose}
              className="flex items-center gap-2"
              style={{ background: t.primary, color: t.text, border: "none", borderRadius: 10, height: 40, padding: "0 16px", fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: isNew && !canSaveNew ? 0.45 : 1 }}>
              <Check size={18} /> {isNew ? "Simpan" : "Selesai"}
            </button>
          </div>
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

          {/* Delete — hanya untuk item yang sudah ada */}
          {!isNew && (
            <button onClick={onRemove} className="flex items-center justify-center gap-2"
              style={{ width: "100%", height: 48, borderRadius: 12, border: `1.5px solid ${t.error}`, background: t.errorBg, color: t.error, fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 20 }}>
              <Trash2 size={18} /> Hapus Menu
            </button>
          )}
          <div style={{ fontSize: 12, color: t.text2, textAlign: "center", marginTop: 10 }}>
            {isNew
              ? "Menu BELUM tersimpan — isi nama & kategori ortu, lalu tekan Simpan. Batal = tidak ada yang ditambahkan."
              : "Perubahan tersimpan otomatis — tanpa tombol Simpan."}
          </div>
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
