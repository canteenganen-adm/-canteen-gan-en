import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Search, X, Utensils, ShoppingCart, Trash2,
  Check, Tag, Layers, Settings, Calendar, Lock, RefreshCw, Pin, Package, ChevronDown, ListChecks,
} from "lucide-react";
import { t, NAV_HEIGHT, STRUK_MONO } from "../../lib/theme";
import { priceLabel, uid, serviceDateLabel, todayISO, toTitleCase, wibTodayISO, wibTimeHHMM, nextSchoolDayISO, hhmm } from "../../lib/format";
import { KATEGORI_ORTU_LIST, KATEGORI_ORTU_ORDER, KATEGORI_ORTU_FALLBACK } from "../../lib/constants";
import PaperTabs from "../components/PaperTabs";
import type { MenuItem, Variant, PickupSchedule } from "../../types";

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

/** "Rabu, 14 Oktober 2026" -> "Rabu, 14 Okt" (muat satu baris di HP, tanpa terpotong "…"). */
const BULAN_PENDEK: Record<string, string> = { Januari: "Jan", Februari: "Feb", Maret: "Mar", April: "Apr", Mei: "Mei", Juni: "Jun", Juli: "Jul", Agustus: "Agu", September: "Sep", Oktober: "Okt", November: "Nov", Desember: "Des" };
const tglParts = (iso: string) => serviceDateLabel(iso).split(" "); // ["Rabu,","14","Oktober","2026"]
/** "Rabu, 14 Okt" */
const tglPendek = (iso: string) => { const w = tglParts(iso); return w[0] + " " + w[1] + " " + (BULAN_PENDEK[w[2]] ?? w[2]); };
/** "14 Okt" */
const tglSingkat = (iso: string) => { const w = tglParts(iso); return w[1] + " " + (BULAN_PENDEK[w[2]] ?? w[2]); };

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
  pickupSchedules,
  menuHarian,
  menuHarianReady,
  onLoadDate,
  onSaveDaily,
  menuTetap,
  menuTetapReady,
  onMenuTetap,
  stokReady,
  stokByDate,
  onLoadStok,
  onSetStok,
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
  /** Jadwal Waktu Ambil — jam ambil TERAKHIR hari itu menentukan kapan tab Menu pindah ke besok. */
  pickupSchedules?: PickupSchedule[];
  /** Snapshot menu_harian per tanggal: null = belum pernah disimpan,
   * key tidak ada = belum di-fetch. */
  menuHarian: Record<string, MenuItem[] | null>;
  /** false = migration_9 belum dijalankan → kertas PO fallback ke toggle live. */
  menuHarianReady: boolean;
  onLoadDate: (tanggal: string) => void;
  onSaveDaily: (tanggal: string, items: MenuItem[]) => Promise<void>;
  /** Id item Menu Tetap (daftar menu yang sering dipakai). */
  menuTetap: string[];
  /** false = migration_12 belum dijalankan → fitur disembunyikan. */
  menuTetapReady: boolean;
  onMenuTetap: (ids: string[], on: boolean) => void;
  /** false = migration_13 belum dijalankan → fitur stok disembunyikan. */
  stokReady: boolean;
  stokByDate: Record<string, Record<string, { stok: number; terpakai: number; sisa: number }>>;
  onLoadStok: (tanggal: string) => void;
  onSetStok: (tanggal: string, itemId: string, stok: number | null) => Promise<void>;
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
  /* Tanggal menu BAWAAN: setelah jam tutup sesi (08:00) orang tua masih packing sampai jam ambil
     terakhir, jadi menu hari ini tetap tampil. BARU setelah jam ambil TERAKHIR hari itu lewat
     (mis. Pulang Sekolah; cadangan 13:00 bila jadwal kosong) — atau tanggal sesi sudah lewat —
     tab Menu otomatis membuka HARI SEKOLAH BERIKUTNYA (lewati Sabtu/Minggu) untuk menyusun
     menu besok. Sesi yang sudah diatur ke tanggal depan dipakai apa adanya. */
  const akhirHari = () => {
    const semua = (pickupSchedules ?? []).flatMap((x) => [x.defaultTime, ...Object.values(x.byTingkat ?? {})]).filter((v): v is string => !!v).map(hhmm);
    return semua.length ? semua.reduce((a, b) => (a > b ? a : b)) : "13:00";
  };
  const tanggalBawaan = () => {
    const hariIni = wibTodayISO();
    const lewat = serviceDate < hariIni || (serviceDate === hariIni && wibTimeHHMM() >= akhirHari());
    return lewat ? nextSchoolDayISO(new Date(hariIni + "T00:00:00")) : serviceDate;
  };
  const [tanggal, setTanggal] = useState(tanggalBawaan);
  useEffect(() => { setTanggal(tanggalBawaan()); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceDate, pickupSchedules]);
  const dateRef = useRef<HTMLInputElement>(null);
  /** Jalan pintas TAMBAHAN ke `tanggal` yang sama, langsung dari tab
   * Buku Menu — supaya tidak perlu lompat ke Preview PO dulu cuma buat
   * ganti tanggal yang sedang diatur. */
  const ubahTanggalRef = useRef<HTMLInputElement>(null);
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
      // Tanggal belum pernah disimpan → mulai KOSONG, bukan meniru toggle
      // hari lain. Tiap tanggal keputusan sendiri; tidak ada warisan menu.
      menusRef.current.forEach((m) => { base[m.id] = false; });
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


  // Simpan + toast hasil
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
      setToast(`Menu untuk ${serviceDateLabel(tanggal)} berhasil disimpan (${aktifCount} item aktif)`);
    } catch {
      setToast("Gagal menyimpan. Periksa koneksi internet, lalu coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  /* ============ Menu Tetap ============
     "Pakai Menu Tetap" hanya mengisi DRAFT (menambah centang Pre-order untuk
     semua menu tetap) — tidak mengurangi pilihan lain, dan baru berlaku
     setelah Simpan. Menu tetap TIDAK otomatis dijual. */
  const [tetapSheet, setTetapSheet] = useState(false);
  /** Menu melayang di bawah tombol plus (bukan lembar dari bawah layar). */
  const [aksiMenu, setAksiMenu] = useState(false);
  const [tetapQ, setTetapQ] = useState("");
  const tetapSet = useMemo(() => new Set(menuTetap), [menuTetap]);
  const tetapMenus = useMemo(() => menus.filter((m) => tetapSet.has(m.id)), [menus, tetapSet]);
  const pakaiMenuTetap = () => {
    // Hanya yang BELUM aktif yang berubah; yang sudah aktif dibiarkan.
    const baru = tetapMenus.filter((m) => !draft[m.id]);
    if (baru.length === 0) {
      setToast("Semua " + tetapMenus.length + " menu tetap sudah ada di menu tanggal ini. Tidak ada yang berubah.");
      return;
    }
    setDraft((prev) => {
      const next = { ...prev };
      baru.forEach((m) => { next[m.id] = true; });
      return next;
    });
    setToast(baru.length + " menu tetap ditambahkan. Ketuk Simpan supaya berlaku.");
  };
  /** Daftar awal dari pemilik; dicocokkan ke menu yang sudah ada lewat nama
   * (tanpa peduli huruf besar/kecil dan spasi). Yang tidak ketemu dilaporkan,
   * tidak dibuatkan menu baru diam-diam. */
  // [nama dari pemilik, ...nama yang dipakai di Buku Menu bila beda ejaan]
  const DAFTAR_AWAL: string[][] = [
    ["Nasi putih"], ["Enoki goreng", "Enoki Krispi"], ["Cheese ball"], ["Nasi goreng kecap"],
    ["Hongkong", "Nasi Goreng Hongkong"], ["Telur"], ["Telur ceplok matang"], ["Telur ceplok setengah matang"],
    ["Telur dadar garam"], ["Telur dadar kecap", "Telur Dadar Kecap Manis"], ["Mi goreng", "Mie Goreng"],
  ];
  const awalMatch = useMemo(() => {
    const norm = (x: string) => x.toLowerCase().replace(/\s+/g, "");
    const byName = new Map(menus.map((m) => [norm(m.name), m]));
    const found: MenuItem[] = [];
    const missing: string[] = [];
    DAFTAR_AWAL.forEach((names) => { const m = names.map((n) => byName.get(norm(n))).find(Boolean); if (m) found.push(m); else missing.push(names[0]); });
    return { found, missing };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menus]);
  const tetapList = useMemo(
    () => menus.filter((m) => m.name.toLowerCase().includes(tetapQ.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name, "id")),
    [menus, tetapQ]
  );

  /* ============ Stok per menu (untuk tanggal yang sedang diatur) ============
     Kosong = tanpa batas. Tersimpan LANGSUNG (bukan draft): stok sering
     ditambah di tengah hari saat ada yang masak lagi. */
  const stokMap = stokByDate[tanggal];
  useEffect(() => {
    if (stokReady && !isPast && stokMap === undefined) onLoadStok(tanggal);
  }, [stokReady, isPast, tanggal, stokMap, onLoadStok]);
  const [stokFor, setStokFor] = useState<MenuItem | null>(null);
  const [stokVal, setStokVal] = useState("");
  const [stokSaving, setStokSaving] = useState(false);
  const openStok = (m: MenuItem) => {
    setStokFor(m);
    setStokVal(stokMap?.[m.id] ? String(stokMap[m.id].stok) : "");
  };
  const simpanStok = async (nilai: number | null) => {
    if (!stokFor) return;
    setStokSaving(true);
    try {
      await onSetStok(tanggal, stokFor.id, nilai);
      setToast(nilai == null ? toTitleCase(stokFor.name) + ": tanpa batas" : "Stok " + toTitleCase(stokFor.name) + " " + nilai + " porsi disimpan");
      setStokFor(null);
    } catch {
      setToast("Gagal menyimpan stok. Periksa koneksi internet, lalu coba lagi.");
    } finally {
      setStokSaving(false);
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
        {/* Yang MENEMPEL di atas hanya judul + tab (±110px). Cari, tanggal, Menu Tetap,
            dan chip kategori ikut tergulir — sebelumnya semuanya menempel (±45% layar HP) dan
            menimpa daftar menu. */}
        <div style={{ padding: "20px 20px 10px", position: "sticky", top: 0, background: t.bg, zIndex: 5, boxShadow: "0 8px 8px -8px rgba(70,55,20,.22)" }}>
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
            </div>
          </div>

          {/* Tanggal menu yang sedang diatur: subjudul BESAR di bawah judul (pilihan pemilik "C", dibesarkan agar
              terlihat). Chip berbingkai, BUKAN kuning (tombol + di bawah sudah kuning). Seluruh chip bisa
              diketuk — input tanggal menutupi chip (inset 0). */}
          {view === "menu" && menuHarianReady && (
            <div className="flex items-center" style={{ position: "relative", marginTop: 8, height: 40, padding: "0 12px", gap: 8, borderRadius: 12, background: t.surface, border: `1.5px solid ${t.borderStrong}`, boxSizing: "border-box", width: "fit-content", maxWidth: "100%" }}>
              <Calendar size={19} />
              <span style={{ fontSize: 15.5, fontWeight: 700, whiteSpace: "nowrap" }}>{tglParts(tanggal)[0]} {tglSingkat(tanggal)}</span>
              <ChevronDown size={17} color={t.text2} />
              <input ref={ubahTanggalRef} type="date" value={tanggal} min={todayISO()}
                onChange={(e) => e.target.value && setTanggal(e.target.value)}
                onClick={() => { try { ubahTanggalRef.current?.showPicker?.(); } catch { /* fallback native */ } }}
                aria-label="Ganti tanggal yang diatur"
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
            </div>
          )}

          {/* Dua "kertas" ala tab Chrome: Buku Menu · Preview PO. Tanggal yang diatur
              ada di chip di bawah judul (di atas kertas ini). */}
          <div style={{ marginTop: 16, position: "relative" }}>
            <PaperTabs
              tabs={[{ id: "menu", label: "Buku Menu" }, { id: "po", label: "Preview PO" }]}
              value={view}
              onChange={onViewChange}
            />
          </div>
        </div>
        <div style={{ padding: "0 20px 4px" }}>
          {view === "menu" && (
            <>
              {/* Cari + tombol plus (membuka menu melayang: Tambah menu / Menu Tetap) */}
              <div style={{ position: "relative", marginTop: 14 }}>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2" style={{ flex: 1, minWidth: 0, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "0 12px", height: 52 }}>
                    <Search size={20} color={t.text2} style={{ flex: "none" }} />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari menu…"
                      style={{ border: "none", outline: "none", background: "transparent", fontSize: 16, width: "100%", minWidth: 0, color: t.text, fontFamily: "inherit" }} />
                    {q && <X size={18} color={t.text2} style={{ cursor: "pointer", flex: "none" }} onClick={() => setQ("")} />}
                  </div>
                  <button onClick={() => setAksiMenu((v) => !v)} aria-label="Tambah menu atau Menu Tetap" aria-expanded={aksiMenu}
                    style={{ flex: "none", width: 52, height: 52, display: "grid", placeItems: "center", background: t.primary, color: t.onPrimary, borderRadius: 12, border: `1.5px solid ${t.primaryLine}`, cursor: "pointer" }}>
                    <Plus size={26} />
                  </button>
                </div>
                {aksiMenu && (
                  <>
                    <style>{`@keyframes ganen-pop{from{opacity:0;transform:translateY(-8px) scale(.94)}to{opacity:1;transform:none}}`}</style>
                    <div onClick={() => setAksiMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 44, background: "rgba(47,42,36,.18)" }} />
                    <div role="menu" style={{ position: "absolute", top: 60, right: 0, zIndex: 45, width: "min(310px, 100%)", background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 16, boxShadow: "0 14px 34px rgba(60,48,20,.22)", padding: 6, transformOrigin: "top right", animation: "ganen-pop .16s ease-out" }}>
                      {([
                        { show: true, Ic: Plus, label: "Tambah menu baru", sub: "", on: () => { setAksiMenu(false); addMenu(); } },
                        { show: menuTetapReady && !isPast && tetapMenus.length > 0, Ic: Pin, label: "Pakai Menu Tetap", sub: tglSingkat(tanggal) + " · " + tetapMenus.length + " menu", on: () => { setAksiMenu(false); pakaiMenuTetap(); } },
                        { show: menuTetapReady, Ic: ListChecks, label: "Atur Menu Tetap", sub: "", on: () => { setAksiMenu(false); setTetapSheet(true); } },
                      ]).filter((o) => o.show).map((o, i) => (
                        <button key={o.label} role="menuitem" onClick={o.on} className="flex items-center"
                          style={{ gap: 12, width: "100%", minHeight: 56, padding: "0 12px", border: "none", borderTop: i ? `1px solid ${t.divider}` : "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: t.text }}>
                          <o.Ic size={21} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 15.5, fontWeight: 700 }}>{o.label}</span>
                            {o.sub && <span style={{ display: "block", fontSize: 12.5, color: t.text2, marginTop: 1 }}>{o.sub}</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Kategori: tab bergaris bawah (bukan kapsul) */}
              <div className="flex hscroll" style={{ gap: 20, marginTop: 10, overflowX: "auto", borderBottom: `1px solid ${t.divider}` }}>
                {categories.map((c) => {
                  const on = c === cat;
                  return (
                    <button key={c} onClick={() => setCat(c)}
                      style={{ flex: "none", padding: "12px 0 10px", background: "none", border: "none", borderBottom: `3px solid ${on ? t.primaryLine : "transparent"}`, marginBottom: -1,
                        fontSize: 15, fontWeight: on ? 800 : 600, color: on ? t.text : t.text2, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                      {c}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* List */}
        <div style={{ padding: "10px 20px 4px" }}>
          {/* Banner item belum dikategorikan — hilang otomatis saat 0 */}
          {view === "menu" && uncategorized.length > 0 && (
            <button onClick={() => setShowUncategorized((v) => !v)}
              className="flex items-center gap-2"
              style={{ width: "100%", padding: "12px 14px", marginBottom: 12, borderRadius: 12, cursor: "pointer",
                border: `1.5px solid ${showUncategorized ? t.primaryLine : "#FFE66D"}`, background: "#FFF4BF", color: t.amberText, fontWeight: 700, fontSize: 14 }}>
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
                          border: `1.5px solid ${refreshing ? t.primaryLine : t.border}`,
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
                  {/* Tanggal ke depan yang BELUM PERNAH disimpan: mulai KOSONG
                      (tidak mewarisi toggle hari lain) — admin pilih sendiri
                      lalu tekan Simpan baru ortu bisa lihat. Tanpa banner ini
                      gampang dikira "sudah jadi menu tanggal itu" padahal
                      belum, atau dikira kosong itu bug. */}
                  {!isPast && menuHarianReady && snapLoaded && snapshot === null && (
                    <div className="flex items-center gap-2" style={{ padding: "9px 14px", borderTop: `1px solid ${t.divider}`, background: "#FFF4BF", fontSize: 12.5, fontWeight: 700, color: t.amberText }}>
                      <RefreshCw size={13} /> Menu untuk tanggal ini belum disimpan — mulai kosong, pilih menu lalu tekan Simpan
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ background: "#FFF4BF", border: "1px solid #FFE66D", borderRadius: 14, padding: "12px 14px", marginBottom: 14, fontSize: 13, color: t.amberText, lineHeight: 1.55 }}>
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
                      Salah satu tempat bergaya struk (DM Mono, sama dengan Transaksi dan Pre-order)
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
                        fontFamily: STRUK_MONO,
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
                                <span style={{ flex: 1, minWidth: 0, fontFamily: "'Onest', -apple-system, 'Segoe UI', system-ui, sans-serif", fontSize: 14, fontWeight: 600 }}>{toTitleCase(m.name)}</span>
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
                stok={stokReady && !isPast && poOn(m) ? (stokMap?.[m.id] ?? null) : undefined}
                onStok={stokReady && !isPast && poOn(m) ? () => openStok(m) : undefined}
                onEdit={() => setEditingId(m.id)}
                onToggle={(k) => k === "preorder" ? poToggle(m, !poOn(m)) : toggleChannel(m.id, k)} />
            ))
          )}

          {/* Bar Simpan — SATU-SATUNYA tempat mengesahkan menu harian
              (kertas PO murni pratinjau). Muncul saat ada perubahan belum
              disimpan ATAU tanggal terpilih belum pernah disimpan. */}
          {view === "menu" && menuHarianReady && !isPast && snapLoaded && (dailyDirty || snapshot === null) && (
            /* SATU struk KONFIRMASI PERUBAHAN MENU — MELAYANG DI TENGAH layar,
               tanpa lapisan gelap: daftar di belakang tetap bisa digulir &
               di-toggle. Batal / X = buang perubahan; Simpan = langsung simpan. */
            <div style={{ position: "fixed", inset: 0, zIndex: 40, display: "grid", placeItems: "center", padding: 20, pointerEvents: "none" }}>
              <div style={{ position: "relative", width: "100%", maxWidth: 330, filter: "drop-shadow(0 12px 30px rgba(47,42,36,.32))", pointerEvents: "auto" }}>
                <div style={{ background: t.surface, clipPath: STRUK_ZIGZAG, padding: "20px 18px 18px", textAlign: "center",
                  fontFamily: "'DM Mono', ui-monospace, 'Cascadia Mono', 'SF Mono', 'Roboto Mono', 'Courier New', monospace", fontWeight: 600 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: ".01em" }}>KONFIRMASI PERUBAHAN MENU</div>
                  <div style={{ borderTop: `1.5px dashed ${t.border}`, margin: "10px 0" }} />
                  <div className="flex items-center justify-center gap-1.5" style={{ fontSize: 13 }}>
                    <Calendar size={14} color={t.amberText} style={{ flex: "none" }} />
                    {serviceDateLabel(tanggal).toUpperCase()}
                  </div>
                  <div style={{ fontSize: 12, color: t.text2, marginTop: 2 }}>{aktifCount} ITEM</div>
                  <div className="flex gap-2" style={{ marginTop: 14, fontFamily: "'Onest', sans-serif" }}>
                    {dailyDirty && (
                      <button onClick={() => { setDraft({ ...seed }); setToast("Perubahan dibuang — menu kembali seperti tersimpan"); }} disabled={saving}
                        style={{ flex: 1, height: 50, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                        Batal
                      </button>
                    )}
                    <button onClick={doSave} disabled={saving}
                      style={{ flex: 2, height: 50, borderRadius: 12, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 15, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
                      {saving ? "Menyimpan…" : "Simpan"}
                    </button>
                  </div>
                </div>
                {dailyDirty && !saving && (
                  <button onClick={() => { setDraft({ ...seed }); setToast("Perubahan dibuang — menu kembali seperti tersimpan"); }}
                    title="Buang perubahan" aria-label="Buang perubahan"
                    style={{ position: "absolute", top: -12, right: -8, width: 42, height: 42, borderRadius: "50%", border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 4px 12px rgba(47,42,36,.2)" }}>
                    <X size={19} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Isi stok satu menu */}
      {stokFor && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={() => !stokSaving && setStokFor(null)} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
          <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
            <div className="flex items-center justify-between" style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${t.divider}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>Stok {toTitleCase(stokFor.name)}</div>
                <div style={{ fontSize: 13.5, color: t.text2, marginTop: 2 }}>{serviceDateLabel(tanggal)}</div>
              </div>
              <button onClick={() => setStokFor(null)} aria-label="Tutup"
                style={{ border: `1.5px solid ${t.border}`, background: t.surface, cursor: "pointer", color: t.text, width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center", flex: "none" }}><X size={19} /></button>
            </div>
            <div style={{ padding: 20 }}>
              {stokMap?.[stokFor.id] && (
                <div style={{ fontSize: 15, color: t.text2, marginBottom: 12 }}>
                  Sudah dipesan <b style={{ color: t.text }}>{stokMap[stokFor.id].terpakai}</b>, sisa <b style={{ color: t.text }}>{stokMap[stokFor.id].sisa}</b>.
                </div>
              )}
              <div style={{ fontSize: 14, fontWeight: 700, color: t.text2, marginBottom: 6 }}>Jumlah porsi yang dibuat</div>
              <input type="number" inputMode="numeric" min={0} value={stokVal} autoFocus
                onChange={(e) => setStokVal(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Contoh: 20"
                style={{ width: "100%", height: 60, borderRadius: 14, border: `1.5px solid ${t.border}`, background: t.surface, fontSize: 28, fontWeight: 800, textAlign: "center", color: t.text, fontFamily: "inherit", outline: "none" }} />
              {stokMap?.[stokFor.id] && stokVal !== "" && parseInt(stokVal, 10) < stokMap[stokFor.id].terpakai && (
                <div style={{ fontSize: 13.5, color: t.error, marginTop: 10, lineHeight: 1.5 }}>
                  Sudah dipesan {stokMap[stokFor.id].terpakai}, lebih banyak dari angka ini. Menu langsung tampil Habis untuk ortu.
                </div>
              )}
              <button onClick={() => stokVal !== "" && simpanStok(parseInt(stokVal, 10))} disabled={stokSaving || stokVal === ""}
                style={{ marginTop: 14, width: "100%", height: 54, borderRadius: 14, border: "none", background: stokVal === "" ? t.divider : t.primary, color: stokVal === "" ? t.textDis : t.onPrimary, fontWeight: 800, fontSize: 16, cursor: stokVal === "" ? "default" : "pointer", fontFamily: "inherit" }}>
                {stokSaving ? "Menyimpan…" : "Simpan stok"}
              </button>
              <button onClick={() => simpanStok(null)} disabled={stokSaving}
                style={{ marginTop: 8, width: "100%", height: 48, borderRadius: 12, border: "none", background: "transparent", color: t.amberText, fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                Tanpa batas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Atur Menu Tetap */}
      {tetapSheet && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={() => setTetapSheet(false)} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
          <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", height: "86vh", display: "flex", flexDirection: "column", boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
            <div className="flex items-center justify-between" style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${t.divider}` }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>Menu Tetap</div>
                <div style={{ fontSize: 13.5, color: t.text2, marginTop: 2 }}>{tetapMenus.length} menu ditandai. Ketuk menu di bawah untuk menandai atau melepas.</div>
              </div>
              <button onClick={() => setTetapSheet(false)} aria-label="Tutup"
                style={{ border: `1.5px solid ${t.border}`, background: t.surface, cursor: "pointer", color: t.text, width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center", flex: "none" }}><X size={19} /></button>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "12px 20px 24px" }}>
              {!isPast && tetapMenus.length > 0 && (
                <button onClick={() => { pakaiMenuTetap(); setTetapSheet(false); }}
                  style={{ width: "100%", height: 54, marginBottom: 14, borderRadius: 14, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>
                  Pakai {tetapMenus.length} menu tetap untuk {tglPendek(tanggal)}
                </button>
              )}
              {tetapMenus.length === 0 && awalMatch.found.length > 0 && (
                <div style={{ border: `1.5px solid ${t.border}`, borderRadius: 14, padding: 14, marginBottom: 14, background: t.surfaceSoft }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>Isi daftar awal</div>
                  <div style={{ fontSize: 14, color: t.text2, marginTop: 4, lineHeight: 1.5 }}>
                    {awalMatch.found.length} dari {DAFTAR_AWAL.length} menu ditemukan di Buku Menu: {awalMatch.found.map((m) => toTitleCase(m.name)).join(", ")}.
                    {awalMatch.missing.length > 0 && <> Tidak ketemu: {awalMatch.missing.join(", ")}. Bisa ditandai sendiri di daftar bawah.</>}
                  </div>
                  <button onClick={() => onMenuTetap(awalMatch.found.map((m) => m.id), true)}
                    style={{ marginTop: 10, width: "100%", height: 48, borderRadius: 12, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                    Tandai {awalMatch.found.length} menu ini
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2" style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "0 12px", height: 48, marginBottom: 6 }}>
                <Search size={20} color={t.text2} />
                <input value={tetapQ} onChange={(e) => setTetapQ(e.target.value)} placeholder="Cari menu…"
                  style={{ border: "none", outline: "none", background: "transparent", fontSize: 16, width: "100%", color: t.text, fontFamily: "inherit" }} />
                {tetapQ && <X size={18} color={t.text2} style={{ cursor: "pointer" }} onClick={() => setTetapQ("")} />}
              </div>
              {tetapList.map((m) => {
                const on = tetapSet.has(m.id);
                return (
                  <button key={m.id} onClick={() => onMenuTetap([m.id], !on)} aria-pressed={on}
                    className="flex items-center" style={{ gap: 14, width: "100%", minHeight: 52, padding: "6px 2px", border: "none", borderBottom: `1px solid ${t.divider}`, background: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: t.text }}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, flex: "none", display: "grid", placeItems: "center", border: `2px solid ${on ? t.success : t.text2}`, background: on ? t.success : "transparent", color: "#fff" }}>
                      {on && <Check size={16} strokeWidth={3} />}
                    </span>
                    <span style={{ flex: 1, fontSize: 16, fontWeight: on ? 800 : 600 }}>{toTitleCase(m.name)}</span>
                  </button>
                );
              })}
              {tetapList.length === 0 && <div style={{ textAlign: "center", color: t.text2, padding: "28px 0", fontSize: 15 }}>Tidak ada menu yang cocok.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Toast hasil simpan */}
      {toast && (
        <div style={{ position: "fixed", left: 20, right: 20, bottom: 90, display: "flex", justifyContent: "center", zIndex: 70 }}>
          <div className="flex items-center gap-2" style={{ maxWidth: 400, width: "100%", background: t.primary, color: t.onPrimary, borderRadius: 14, padding: "14px 18px", fontSize: 14, fontWeight: 600, boxShadow: "0 14px 34px rgba(47,42,36,.3)" }}>
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
function MenuCard({ m, onEdit, onToggle, stok, onStok }: {
  m: MenuItem; onEdit: () => void; onToggle: (k: keyof MenuItem["channels"]) => void;
  /** undefined = baris stok disembunyikan; null = tanpa batas; objek = ada stok. */
  stok?: { stok: number; terpakai: number; sisa: number } | null;
  onStok?: () => void;
}) {
  return (
    // Seluruh kartu tappable = buka form edit; ikon toggle stopPropagation.
    <div onClick={onEdit}
      style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: "0 1px 2px rgba(47,42,36,.04)", cursor: "pointer" }}>
      <div className="flex items-start justify-between" style={{ gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="flex items-center gap-2">
            <div style={{ fontSize: 17, fontWeight: 700 }}>{toTitleCase(m.name)}</div>
            {m.variants.length > 0 && (
              <span className="flex items-center gap-1" title={`${m.variants.length} varian`}
                style={{ fontSize: 11, fontWeight: 700, color: t.amberText, background: t.primaryLight, padding: "2px 8px", borderRadius: 999 }}>
                <Layers size={12} /> {m.variants.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
            <span style={{ fontSize: 13, color: t.text2 }}>{m.category}</span>
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
      {/* Stok untuk tanggal yang diatur — hanya menu yang sedang tersedia di Pre-order */}
      {onStok && stok !== undefined && (
        <button onClick={(e) => { e.stopPropagation(); onStok(); }}
          className="flex items-center gap-1"
          style={{ marginTop: 4, padding: "0 2px", minHeight: 36, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, color: stok && stok.sisa <= 0 ? t.error : t.text2 }}>
          <Package size={15} />
          {stok ? (stok.sisa <= 0 ? "Habis" : "Sisa " + stok.sisa) + " dari " + stok.stok : "Atur stok"}
        </button>
      )}
    </div>
  );
}

function ChannelIcon({ on, label, onClick, children }: {
  on: boolean; label: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} title={label} aria-label={label} aria-pressed={on}
      style={{ width: 44, height: 44, borderRadius: 12, cursor: "pointer",
        border: `1.5px solid ${on ? t.primaryLine : t.border}`,
        background: on ? t.primary : t.surface,
        color: on ? t.onPrimary : t.textDis,
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
        border: `1.5px solid ${on ? t.primaryLine : t.border}`,
        background: on ? t.primary : t.surfaceSoft,
        color: on ? t.onPrimary : t.textDis,
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
          <div className="flex items-center gap-2">
            {/* X keluar — menutup editor tanpa menyentuh apa pun */}
            <button onClick={onClose} aria-label="Keluar"
              style={{ width: 40, height: 40, borderRadius: "50%", border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}>
              <X size={18} />
            </button>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{isNew ? "Menu Baru" : "Edit Menu"}</div>
          </div>
          <div className="flex items-center gap-2">
            {isNew && (
              <button onClick={onClose} style={{ background: "transparent", color: t.text2, border: `1.5px solid ${t.border}`, borderRadius: 10, height: 40, padding: "0 14px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Batal
              </button>
            )}
            <button
              onClick={isNew ? (canSaveNew ? onSaveNew : undefined) : onClose}
              className="flex items-center gap-2"
              style={{ background: t.primary, color: t.onPrimary, border: "none", borderRadius: 10, height: 40, padding: "0 16px", fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: isNew && !canSaveNew ? 0.45 : 1 }}>
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
                      border: `1.5px solid ${on ? t.primaryLine : t.border}`, background: on ? t.primary : t.surface, color: on ? t.onPrimary : t.text2 }}>
                    {c}
                  </button>
                );
              })}
              <button onClick={() => { setNewCatMode(true); setNewCat(""); }}
                className="flex items-center gap-1"
                style={{ height: 44, padding: "0 14px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer",
                  border: `1.5px dashed ${newCatMode ? t.primaryLine : t.border}`, background: newCatMode ? t.primary : t.surfaceSoft, color: t.amberText }}>
                <Plus size={16} /> Lainnya
              </button>
            </div>
            {newCatMode && (
              <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
                <input value={newCat} onChange={(e) => setNewCat(e.target.value)} autoFocus
                  onKeyDown={(e) => e.key === "Enter" && applyNewCat()}
                  placeholder="Nama kategori baru…" style={{ ...inputStyle, flex: 1, height: 48 }} />
                <button onClick={applyNewCat}
                  style={{ flex: "none", width: 48, height: 48, borderRadius: 10, border: "none", background: t.primary, color: t.onPrimary, cursor: "pointer", display: "grid", placeItems: "center" }}>
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
                style={{ width: "100%", height: 46, borderRadius: 10, border: `1.5px dashed ${t.primaryLine}`, background: t.surfaceSoft, color: t.amberText, fontWeight: 700, fontSize: 14, cursor: "pointer", marginTop: 4 }}>
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
