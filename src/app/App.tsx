import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router";
import { ClipboardList, ShoppingBag, CreditCard, BookOpen, AlertTriangle, Store } from "lucide-react";
import { t, NAV_HEIGHT } from "../lib/theme";
import { nowLabel, orderNo, serviceDateLabel, autoClosedNow, reopenActiveNow, todayISO } from "../lib/format";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  fetchMenus, fetchMenuTetap, setMenuTetapItems, fetchStokSisa, setMenuStok, type StokInfo, fetchTransactions, fetchAppState, fetchKelas, subscribeToCanteenChanges, inLiveWindow,
  upsertMenuItem, deleteMenuItem,
  insertTransaction, updateTransaction,
  submitPreOrderTransaction,
  upsertKelas, deleteKelas,
  patchTransactionCustomer,
  fetchTrashedTransactions, purgeOldTrash, softDeleteTransaction,
  restoreFromTrash as apiRestoreFromTrash, hardDeleteTransaction,
  fetchMenuHarian, saveMenuHarianSnapshot,
  appStatePatch,
} from "../lib/canteenApi";
import type { MenuItem, Transaction, TransactionCustomer, CanteenSettings, Kelas, PickupSchedule } from "../types";

import MasterMenu, { type MenuView } from "./screens/MasterMenu";
import Penjualan from "./screens/Penjualan";
import Tagihan from "./screens/Tagihan";
import PreOrderAdmin from "./screens/PreOrderAdmin";
import PreOrderParent, { type PreOrderReceipt } from "./screens/PreOrderParent";
import Pengaturan from "./screens/Pengaturan";
import Laporan from "./screens/Laporan";
import BackToTop from "./components/BackToTop";

/* ============================================================
   APP SHELL — Canteen Gan En
   Decision Lock §1: bottom nav 4 tab (Pre-order · Penjualan ·
   Tagihan · Menu), gear di header buka Pengaturan (bukan tab).
   App dibuka LANGSUNG ke Pre-order. Rute "/pesan" = link orang
   tua yang berdiri sendiri (tanpa nav/gear).
   ------------------------------------------------------------
   Satu sumber state (useCanteenStore) dibuat SEKALI di sini dan
   dibagi ke shell utama maupun rute /pesan. State ini sinkron
   dengan Supabase: fetch awal + realtime subscription, supaya
   pesanan dari link orang tua (device/tab berbeda) langsung
   terlihat di sisi admin tanpa refresh manual.
   ============================================================ */

export default function App() {
  const store = useCanteenStore();

  if (!isSupabaseConfigured) {
    return <ConfigError message="Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di file .env (lihat .env.example), lalu restart server dev." />;
  }
  if (store.error) {
    return <ConfigError message={store.error} />;
  }
  if (store.loading) {
    return <LoadingScreen />;
  }

  return (
    <Routes>
      {/* Admin di path tersembunyi — root & path nyasar SELALU jatuh ke halaman
          ortu, supaya ortu yang mengetik domain tanpa /pesan tidak pernah
          mendarat di layar admin (app ini tanpa login). */}
      <Route path="/dapur-gan-en" element={<IngatKasir><MainShell store={store} /></IngatKasir>} />
      <Route path="*" element={<GerbangOrtu store={store} />} />
    </Routes>
  );
}

/* HP/tablet milik Mama & Papa: sekali membuka /dapur-gan-en, perangkat itu DIINGAT sebagai perangkat kasir. Setelah itu
   alamat lama / pintasan layar utama (domain utama tanpa tambahan) langsung membawa ke kasir, bukan ke halaman "Mulai Memesan"
   milik orang tua. Perangkat orang tua tidak pernah membuka /dapur-gan-en, jadi mereka tidak terpengaruh. /pesan selalu halaman orang tua. */
const KUNCI_KASIR = "ganen_kasir";
const bacaKasir = () => { try { return localStorage.getItem(KUNCI_KASIR) === "1"; } catch { return false; } };
function IngatKasir({ children }: { children: React.ReactNode }) {
  useEffect(() => { try { localStorage.setItem(KUNCI_KASIR, "1"); } catch { /* penyimpanan diblokir: abaikan */ } }, []);
  return <>{children}</>;
}
function GerbangOrtu({ store }: { store: CanteenStore }) {
  const { pathname } = useLocation();
  if (bacaKasir() && !pathname.toLowerCase().startsWith("/pesan")) return <Navigate to="/dapur-gan-en" replace />;
  return <ParentRoute store={store} />;
}

function LoadingScreen() {
  return (
    <div style={{ height: "100dvh", display: "grid", placeItems: "center", background: t.bg, color: t.text2, fontSize: 14 }}>
      Memuat data…
    </div>
  );
}

function ConfigError({ message }: { message: string }) {
  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: t.bg, color: t.text, padding: 24, textAlign: "center", gap: 12 }}>
      <AlertTriangle size={32} color={t.error} />
      <div style={{ fontWeight: 700, fontSize: 16 }}>Tidak bisa memuat data</div>
      <div style={{ fontSize: 13.5, color: t.text2, maxWidth: 340 }}>{message}</div>
    </div>
  );
}

/* ---------------- Shared state (satu sumber untuk semua layar, tersinkron ke Supabase) ---------------- */

type CanteenStore = ReturnType<typeof useCanteenStore>;

function useCanteenStore() {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [preorderOpen, setPreorderOpenLocal] = useState(true);
  const [serviceDate, setServiceDateLocal] = useState("");
  const [autoCloseTime, setAutoCloseTimeLocal] = useState("08:00:00");
  const [reopenUntil, setReopenUntilLocal] = useState<string | null>(null);
  const [pickupPresets, setPickupPresetsLocal] = useState<string[]>([]);
  const [pickupSchedules, setPickupSchedulesLocal] = useState<PickupSchedule[]>([]);
  const [settings, setSettingsLocal] = useState<CanteenSettings>({ namaKantin: "", whatsapp: "", printerConnected: false });
  const [trashTransactions, setTrashTransactions] = useState<Transaction[]>([]);
  /** Snapshot menu per tanggal (menu_harian). null = tanggal itu belum pernah
   * disimpan; key tidak ada = belum di-fetch. */
  const [menuHarian, setMenuHarianLocal] = useState<Record<string, MenuItem[] | null>>({});
  /** false = tabel menu_harian belum ada (migration_9 belum jalan) → semua
   * layar fallback ke perilaku lama (baca channels di master menu). */
  const [menuHarianReady, setMenuHarianReady] = useState(false);
  /** Menu Tetap: id item favorit. menuTetapReady=false → tabel belum ada
   * (migration_12) → fitur disembunyikan, sisanya normal. */
  const [menuTetap, setMenuTetapLocal] = useState<string[]>([]);
  const [menuTetapReady, setMenuTetapReady] = useState(false);
  /** Stok per tanggal: { tanggal: { item_id: {stok, terpakai, sisa} } }. stokReady=false
   * → migration_13 belum jalan → fitur stok disembunyikan. */
  const [stokByDate, setStokByDate] = useState<Record<string, Record<string, StokInfo>>>({});
  const [stokReady, setStokReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const loadedOnce = useRef(false);
  /** Timer debounce tulis menu per-id — mengetik nama menu TIDAK boleh
   * jadi satu request per huruf (berat + memicu badai event realtime). */
  const menuWriteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  /** Penulisan menu yang SEDANG berjalan ke server + penanda "ada penulisan
   * baru". Muat ulang yang dimulai SEBELUM sebuah penulisan bisa kembali dengan
   * data lama dan menimpa huruf yang baru diketik (terasa seperti huruf hilang
   * / teks melompat balik) — hasilnya dibuang bila ada penulisan sejak ia mulai. */
  const menuWritesInFlight = useRef(0);
  /** Jumlah tulisan app_state (tanggal sesi, buka/tutup, jam tutup, pengaturan) yang belum selesai. Selama > 0,
   * muat ulang data TIDAK boleh menimpa nilai app_state di layar dengan versi server yang masih lama. */
  const appWritesInFlight = useRef(0);
  const menuWriteEpoch = useRef(0);
  const writeMenuToServer = (item: MenuItem, label: string) => {
    menuWriteEpoch.current++;
    menuWritesInFlight.current++;
    upsertMenuItem(item)
      .catch((e) => reportError(label, e))
      .finally(() => { menuWritesInFlight.current--; menuWriteEpoch.current++; });
  };

  /** Cadangan LOKAL status "sudah ditagih" — supaya tombol hijau Ditagih
   * langsung berubah dan BERTAHAN walau data dimuat ulang (mis. balik dari
   * WhatsApp), bahkan sebelum kolom billed_at ada di DB (migration_10). */
  const billedLocal = useRef<Record<string, string>>((() => {
    try { return JSON.parse(localStorage.getItem("ganen_billed") || "{}"); } catch { return {}; }
  })());
  const applyBilledLocal = useCallback((txs: Transaction[]) => {
    const map = billedLocal.current;
    if (Object.keys(map).length === 0) return txs;
    return txs.map((tx) => (!tx.billedAt && map[tx.id] ? { ...tx, billedAt: map[tx.id] } : tx));
  }, []);

  /** `skipTx` = lewati penarikan transaksi (ribuan baris). Dipakai untuk muat
   * ulang ringan saat yang berubah cuma menu/pengaturan/kelas. */
  const loadAll = useCallback(async (opts?: { skipTx?: boolean }) => {
    const epochAtStart = menuWriteEpoch.current;
    try {
      const [menusData, txData, appState, kelasData] = await Promise.all([
        fetchMenus(),
        opts?.skipTx ? Promise.resolve(null) : fetchTransactions(),
        fetchAppState(),
        fetchKelas(),
      ]);
      // Jangan timpa menus saat masih ada tulisan menu yang tertunda
      // (pengguna sedang mengetik di editor) — data server masih versi
      // lama dan akan MENGHAPUS ketikan yang belum tersimpan.
      if (menuWriteTimers.current.size === 0 && menuWritesInFlight.current === 0 && menuWriteEpoch.current === epochAtStart) setMenus(menusData);
      if (txData) setTransactions(applyBilledLocal(txData));
      setKelasList(kelasData);
      if (appWritesInFlight.current === 0) {
        setPreorderOpenLocal(appState.preorderOpen);
        setServiceDateLocal(appState.serviceDate);
        setAutoCloseTimeLocal(appState.autoCloseTime);
        setReopenUntilLocal(appState.reopenUntil);
        setPickupPresetsLocal(appState.pickupPresets);
        setPickupSchedulesLocal(appState.pickupSchedules);
        setSettingsLocal(appState.settings);
      }
      // Snapshot menu untuk tanggal sesi PO + hari ini (untuk POS).
      // Kalau tabel belum ada (migration_9 belum jalan) → fallback mode.
      try {
        const dates = Array.from(new Set([appState.serviceDate, todayISO()]));
        const map = await fetchMenuHarian(dates);
        setMenuHarianLocal((prev) => ({ ...prev, ...map }));
        setMenuHarianReady(true);
      } catch {
        setMenuHarianReady(false);
      }
      try {
        setMenuTetapLocal(await fetchMenuTetap());
        setMenuTetapReady(true);
      } catch {
        setMenuTetapReady(false);
      }
      try {
        const sm = await fetchStokSisa(appState.serviceDate);
        setStokByDate((prev) => ({ ...prev, [appState.serviceDate]: sm }));
        setStokReady(true);
      } catch {
        setStokReady(false);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data dari Supabase.");
    } finally {
      setLoading(false);
      loadedOnce.current = true;
    }
  }, [applyBilledLocal]);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    loadAll();
    // Realtime: perubahan TRANSAKSI dari device/tab lain (mis. pesanan baru
    // dari /pesan, centang dikemas) cukup MENAMBAL satu baris di layar —
    // tidak lagi menarik ulang ribuan baris tiap kali (pemborosan kuota
    // terbesar). Perubahan menu/pengaturan/kelas memicu muat ulang ringan
    // tanpa transaksi, di-debounce 800ms supaya rentetan event jadi SATU fetch.
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToCanteenChanges((c) => {
      if (!loadedOnce.current) return;
      if (c.table === "transaksi") {
        if (c.kind === "delete") {
          setTransactions((prev) => prev.filter((t) => t.id !== c.id));
          return;
        }
        const tx = c.tx;
        setTransactions((prev) => {
          const exists = prev.some((t) => t.id === tx.id);
          if (tx.deletedAt) return exists ? prev.filter((t) => t.id !== tx.id) : prev;
          const merged = applyBilledLocal([tx])[0];
          if (exists) return prev.map((t) => (t.id === tx.id ? merged : t));
          if (!inLiveWindow(tx)) return prev;
          return [merged, ...prev];
        });
        return;
      }
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => loadAll({ skipTx: true }), 800);
    });
    // HP yang lama di background: Safari/Chrome mematikan koneksi realtime,
    // jadi data bisa basi tanpa terasa (kasus dua gadget beda angka).
    // Kembali terlihat → menu/pengaturan selalu disegarkan; transaksi hanya
    // ditarik ulang kalau lama di latar (>60 detik, saat realtime mungkin putus).
    let hiddenAt = 0;
    const onVisible = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      const lama = hiddenAt > 0 && Date.now() - hiddenAt > 60_000;
      loadAll({ skipTx: !lama });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [loadAll]);

  /** Setiap kegagalan simpan (bukan cuma fetch awal) sekarang juga tampil
   * ke pengguna — sebelumnya cuma di-console.error, jadi kelihatan "tidak
   * merespon" tanpa penjelasan saat sebuah aksi gagal tersimpan. */
  const reportError = (context: string, e: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[Supabase] ${context}:`, e);
    setSaveError("Gagal menyimpan perubahan. Periksa koneksi internet, lalu coba lagi.");
  };
  const clearSaveError = () => setSaveError(null);

  /* ---- Menu ---- */
  const addMenuItem = (item: MenuItem) => {
    setMenus((prev) => [item, ...prev]);
    upsertMenuItem(item).catch((e) => reportError("addMenuItem", e));
  };
  /** Simpan ke DB di-debounce 600ms per item: mengetik "Sate Ayam" = SATU
   * request setelah berhenti mengetik, bukan sembilan. Tiap ketikan
   * menjadwal ulang timer dengan snapshot item terbaru. */
  const patchMenuItem = (id: string, fields: Partial<MenuItem>) => {
    setMenus((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, ...fields } : m));
      const updated = next.find((m) => m.id === id);
      if (updated) {
        const timers = menuWriteTimers.current;
        const existing = timers.get(id);
        if (existing) clearTimeout(existing);
        timers.set(id, setTimeout(() => {
          timers.delete(id);
          writeMenuToServer(updated, "patchMenuItem");
        }, 600));
      }
      return next;
    });
  };
  const toggleMenuChannel = (id: string, key: keyof MenuItem["channels"]) => {
    setMenus((prev) => {
      const next = prev.map((m) =>
        m.id === id ? { ...m, channels: { ...m.channels, [key]: !m.channels[key] } } : m
      );
      const updated = next.find((m) => m.id === id);
      if (updated) writeMenuToServer(updated, "toggleMenuChannel");
      return next;
    });
  };
  const removeMenuItem = (id: string) => {
    setMenus((prev) => prev.filter((m) => m.id !== id));
    deleteMenuItem(id).catch((e) => reportError("removeMenuItem", e));
  };

  /* ---- Transaksi ---- */
  const addTransaction = (tx: Transaction) => {
    setTransactions((prev) => [tx, ...prev]);
    insertTransaction(tx).catch((e) => reportError("addTransaction", e));
  };
  const markPaid = (id: string) => {
    setTransactions((prev) => prev.map((tx) => (tx.id === id ? { ...tx, paid: true } : tx)));
    updateTransaction(id, { paid: true }).catch((e) => reportError("markPaid", e));
  };
  const unmarkPaid = (id: string) => {
    setTransactions((prev) => prev.map((tx) => (tx.id === id ? { ...tx, paid: false } : tx)));
    updateTransaction(id, { paid: false }).catch((e) => reportError("unmarkPaid", e));
  };
  /** Tandai "sudah ditagih via WA" — dicatat saat Kirim ke WhatsApp ditekan.
   * Error DITELAN diam-diam: sebelum migration_10 dijalankan kolomnya belum
   * ada, dan fitur ini murni penanda (bukan data uang). */
  const markBilled = (ids: string[]) => {
    const billedAt = new Date().toISOString();
    setTransactions((prev) => prev.map((tx) => (ids.includes(tx.id) ? { ...tx, billedAt } : tx)));
    // Cadangan lokal: hijau "Ditagih" bertahan melewati muat-ulang apa pun
    ids.forEach((id) => { billedLocal.current[id] = billedAt; });
    try { localStorage.setItem("ganen_billed", JSON.stringify(billedLocal.current)); } catch { /* penuh/di-blok: abaikan */ }
    ids.forEach((id) => updateTransaction(id, { billedAt }).catch(() => {}));
  };
  /** Ubah Tanggal Layanan transaksi — untuk membetulkan entri yang terlanjur
   * tercatat di tanggal yang salah (mis. input susulan yang lupa backdate). */
  const changeTxDate = (id: string, date: string) => {
    setTransactions((prev) => prev.map((tx) => (tx.id === id ? { ...tx, serviceDate: date } : tx)));
    updateTransaction(id, { serviceDate: date }).catch((e) => reportError("changeTxDate", e));
  };
  /** Batalkan Transaksi = soft-delete (set cancelled_at), BUKAN hapus permanen —
   * transaksi tetap ada untuk Riwayat/audit, hanya hilang dari daftar Belum Dibayar. */
  const cancelTransaction = (id: string) => {
    const cancelledAt = new Date().toISOString();
    setTransactions((prev) => prev.map((tx) => (tx.id === id ? { ...tx, cancelledAt } : tx)));
    updateTransaction(id, { cancelledAt }).catch((e) => reportError("cancelTransaction", e));
  };
  /** Undo pembatalan — cukup UPDATE (bukan insert ulang), jadi tidak lewat
   * trigger BEFORE INSERT sama sekali (service_date lama tetap aman). */
  const restoreTransaction = (tx: Transaction) => {
    setTransactions((prev) => prev.map((x) => (x.id === tx.id ? { ...x, cancelledAt: undefined } : x)));
    updateTransaction(tx.id, { cancelledAt: null }).catch((e) => reportError("restoreTransaction", e));
  };
  /** Pindahkan transaksi Dibatalkan ke Tong Sampah (set deleted_at). */
  const moveToTrash = (id: string) => {
    const deletedAt = new Date().toISOString();
    const tx = transactions.find((t) => t.id === id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    if (tx) setTrashTransactions((prev) => [{ ...tx, deletedAt }, ...prev]);
    softDeleteTransaction(id).catch((e) => reportError("moveToTrash", e));
  };
  /** Pulihkan dari Tong Sampah — kembali ke tab Lunas sebagai Dibatalkan. */
  const restoreFromTrash = (id: string) => {
    const tx = trashTransactions.find((t) => t.id === id);
    setTrashTransactions((prev) => prev.filter((t) => t.id !== id));
    if (tx) setTransactions((prev) => [{ ...tx, deletedAt: undefined }, ...prev]);
    apiRestoreFromTrash(id).catch((e) => reportError("restoreFromTrash", e));
  };
  /** Hapus permanen dari Tong Sampah — tidak bisa dikembalikan. */
  const hardDeleteFromTrash = (id: string) => {
    setTrashTransactions((prev) => prev.filter((t) => t.id !== id));
    hardDeleteTransaction(id).catch((e) => reportError("hardDeleteFromTrash", e));
  };
  /** Muat ulang Tong Sampah (jalankan purge dulu, lalu fetch). */
  const loadTrash = useCallback(async () => {
    try {
      await purgeOldTrash();
      const data = await fetchTrashedTransactions();
      setTrashTransactions(data);
    } catch (e) {
      reportError("loadTrash", e);
    }
  }, []);
  /** Jam kemas TERCATAT OTOMATIS oleh sistem (bukan diketik admin) — bukti
   * objektif kapan sebenarnya dikemas, tidak bisa diakali. Dikosongkan lagi
   * kalau ditandai ulang Belum Dikemas (bukan status "sudah pernah", tapi
   * status SAAT INI). */
  const togglePacked = (id: string) => {
    setTransactions((prev) => {
      const next = prev.map((tx) =>
        tx.id === id ? { ...tx, packed: !tx.packed, packedAt: !tx.packed ? new Date().toISOString() : null } : tx
      );
      const updated = next.find((tx) => tx.id === id);
      if (updated) updateTransaction(id, { packed: updated.packed, packedAt: updated.packedAt }).catch((e) => reportError("togglePacked", e));
      return next;
    });
  };
  const editTransactionCustomer = (id: string, customer: TransactionCustomer, waktuAmbil?: string) => {
    setTransactions((prev) =>
      prev.map((tx) => tx.id === id ? { ...tx, customer, ...(waktuAmbil !== undefined && { waktuAmbil }) } : tx)
    );
    patchTransactionCustomer(id, customer, waktuAmbil).catch((e) => reportError("editTransactionCustomer", e));
  };

  /** Submit Pre-order dari link orang tua. TIDAK optimistic — kalau sesi
   * sudah ditutup/lewat jam tutup, server (trigger DB) menolak dan ini
   * melempar Error dengan pesan yang siap ditampilkan ke orang tua.
   * service_date pada baris yang tersimpan SELALU dari server, bukan
   * dari `serviceDate` lokal ini (nilai lokal cuma dugaan awal). */
  const submitPreOrder = async (r: PreOrderReceipt): Promise<Transaction> => {
    const tx: Transaction = {
      id: orderNo(),
      source: "preorder",
      paid: false,
      customer: { nama: r.nama, kelas: r.kelas, wa: r.wa, tingkat: r.tingkat },
      items: r.items,
      total: r.total,
      createdAt: new Date().toISOString(),
      label: nowLabel(),
      serviceDate,
      waktuAmbil: r.ambil,
      packed: false,
      orderNo: r.no,
    };
    const confirmed = await submitPreOrderTransaction(tx);
    setTransactions((prev) => [confirmed, ...prev]);
    return confirmed;
  };

  /* ---- Menu Harian (snapshot per tanggal + history) ---- */
  /** Muat snapshot untuk satu tanggal (dipakai selector riwayat di tab Menu). */
  const loadMenuHarianDate = useCallback(async (tanggal: string) => {
    try {
      const map = await fetchMenuHarian([tanggal]);
      setMenuHarianLocal((prev) => ({ ...prev, ...map }));
    } catch (e) {
      reportError("loadMenuHarianDate", e);
    }
  }, []);
  /** Simpan snapshot dari tombol Simpan eksplisit. TIDAK optimistic —
   * menunggu server supaya konfirmasi "tersimpan" yang tampil itu jujur. */
  const saveDailyMenu = async (tanggal: string, items: MenuItem[]) => {
    await saveMenuHarianSnapshot(tanggal, items);
    const aktif = items.filter((m) => m.channels.preorder || m.channels.sales);
    setMenuHarianLocal((prev) => ({ ...prev, [tanggal]: aktif.length ? aktif : null }));
  };

  /** Tandai / lepas Menu Tetap (satu atau banyak item). Optimistic; gagal
   * simpan dilaporkan lewat reportError seperti tulisan lain. */
  const setMenuTetap = (ids: string[], on: boolean) => {
    setMenuTetapLocal((prev) => on ? Array.from(new Set([...prev, ...ids])) : prev.filter((x) => !ids.includes(x)));
    setMenuTetapItems(ids, on).catch((e) => reportError("setMenuTetap", e));
  };

  /** Muat ulang sisa stok satu tanggal (dipanggil berkala di halaman ortu,
   * setelah pesanan gagal karena stok, dan saat Mama mengubah stok). */
  /** Baca ulang HANYA status sesi (satu baris kecil): tanggal, buka/tutup, jam tutup. Dipakai halaman orang tua yang
   * dibiarkan terbuka lama — koneksi realtime di HP sering putus diam-diam, jadi tanggal/status bisa basi. */
  const serviceDateRef = useRef("");
  serviceDateRef.current = serviceDate;
  const muatStatusSesi = useCallback(async () => {
    try {
      const a = await fetchAppState();
      if (appWritesInFlight.current > 0) return;
      setPreorderOpenLocal(a.preorderOpen);
      setAutoCloseTimeLocal(a.autoCloseTime);
      setReopenUntilLocal(a.reopenUntil);
      if (a.serviceDate !== serviceDateRef.current) loadAll({ skipTx: true }); // tanggal sesi berganti → menu/stok tanggal baru ikut dimuat
    } catch { /* jaringan putus: coba lagi 30 detik lagi */ }
  }, [loadAll]);
  const loadStokDate = useCallback(async (tanggal: string) => {
    try {
      const sm = await fetchStokSisa(tanggal);
      setStokByDate((prev) => ({ ...prev, [tanggal]: sm }));
      setStokReady(true);
    } catch { /* migration_13 belum jalan: abaikan */ }
  }, []);
  /** Isi/hapus stok. TIDAK optimistic: tunggu server lalu baca ulang sisa,
   * supaya angka "sisa" yang tampil selalu jujur. */
  const setStok = async (tanggal: string, itemId: string, stok: number | null) => {
    await setMenuStok(tanggal, itemId, stok);
    await loadStokDate(tanggal);
  };

  /* ---- Kelas (per Tingkat, dikelola admin) ---- */
  const addKelas = (k: Kelas) => {
    setKelasList((prev) => [...prev, k]);
    upsertKelas(k).catch((e) => reportError("addKelas", e));
  };
  const patchKelas = (id: string, fields: Partial<Kelas>) => {
    setKelasList((prev) => {
      const next = prev.map((k) => (k.id === id ? { ...k, ...fields } : k));
      const updated = next.find((k) => k.id === id);
      if (updated) upsertKelas(updated).catch((e) => reportError("patchKelas", e));
      return next;
    });
  };
  const removeKelas = (id: string) => {
    setKelasList((prev) => prev.filter((k) => k.id !== id));
    deleteKelas(id).catch((e) => reportError("removeKelas", e));
  };

  /* ---- Status operasional & Pengaturan (app_state) ---- */
  /** Kirim satu tulisan app_state: dihitung "sedang berjalan" supaya muat ulang tidak menimpanya; kalau GAGAL,
   * tampilkan galat lalu baca ulang server sehingga layar jujur (bukan menampilkan tanggal/status yang tidak pernah tersimpan). */
  const kirimApp = (kirim: Promise<void>, ctx: string) => {
    appWritesInFlight.current++;
    let gagal = false;
    kirim.catch((e) => { gagal = true; reportError(ctx, e); }).finally(() => {
      appWritesInFlight.current--;
      if (gagal && appWritesInFlight.current === 0) loadAll({ skipTx: true }); // hanya bila gagal: layar kembali ke yang benar-benar tersimpan
    });
  };
  const togglePreorderOpen = () => {
    setPreorderOpenLocal((prev) => {
      const next = !prev;
      kirimApp(appStatePatch.preorderOpen(next), "togglePreorderOpen");
      return next;
    });
  };
  const setServiceDate = (date: string) => {
    setServiceDateLocal(date);
    kirimApp(appStatePatch.serviceDate(date), "setServiceDate");
  };
  const setAutoCloseTime = (time: string) => {
    setAutoCloseTimeLocal(time);
    kirimApp(appStatePatch.autoCloseTime(time), "setAutoCloseTime");
  };
  /** "Buka Lagi" sementara setelah tutup otomatis — null = tutup lagi sekarang. */
  const setReopenUntil = (iso: string | null) => {
    setReopenUntilLocal(iso);
    kirimApp(appStatePatch.reopenUntil(iso), "setReopenUntil");
  };
  const setPickupPresets = (presets: string[]) => {
    setPickupPresetsLocal(presets);
    kirimApp(appStatePatch.pickupPresets(presets), "setPickupPresets");
  };
  const setPickupSchedules = (schedules: PickupSchedule[]) => {
    setPickupSchedulesLocal(schedules);
    kirimApp(appStatePatch.pickupSchedules(schedules), "setPickupSchedules");
  };
  const patchSettings = (patch: Partial<CanteenSettings>) => {
    setSettingsLocal((s) => ({ ...s, ...patch }));
    if (patch.namaKantin !== undefined) kirimApp(appStatePatch.namaKantin(patch.namaKantin), "patchSettings.namaKantin");
    if (patch.whatsapp !== undefined) kirimApp(appStatePatch.whatsapp(patch.whatsapp), "patchSettings.whatsapp");
    if (patch.printerConnected !== undefined) kirimApp(appStatePatch.printerConnected(patch.printerConnected), "patchSettings.printerConnected");
    if (patch.waOpening !== undefined) kirimApp(appStatePatch.waOpening(patch.waOpening), "patchSettings.waOpening");
    if (patch.waClosing !== undefined) kirimApp(appStatePatch.waClosing(patch.waClosing), "patchSettings.waClosing");
    if (patch.namaBank !== undefined) kirimApp(appStatePatch.namaBank(patch.namaBank), "patchSettings.namaBank");
    if (patch.noRekening !== undefined) kirimApp(appStatePatch.noRekening(patch.noRekening), "patchSettings.noRekening");
    if (patch.namaRekening !== undefined) kirimApp(appStatePatch.namaRekening(patch.namaRekening), "patchSettings.namaRekening");
  };

  return {
    menus, addMenuItem, patchMenuItem, toggleMenuChannel, removeMenuItem,
    menuHarian, menuHarianReady, loadMenuHarianDate, saveDailyMenu,
    menuTetap, menuTetapReady, setMenuTetap,
    stokByDate, stokReady, loadStokDate, setStok,
    transactions, addTransaction, markPaid, unmarkPaid, cancelTransaction, restoreTransaction, togglePacked, editTransactionCustomer, changeTxDate, markBilled,
    trashTransactions, moveToTrash, restoreFromTrash, hardDeleteFromTrash, loadTrash,
    kelasList, addKelas, patchKelas, removeKelas,
    preorderOpen, togglePreorderOpen,
    serviceDate, setServiceDate, muatStatusSesi,
    autoCloseTime, setAutoCloseTime,
    reopenUntil, setReopenUntil,
    pickupPresets, setPickupPresets,
    pickupSchedules, setPickupSchedules,
    settings, patchSettings,
    submitPreOrder,
    reload: loadAll,
    loading, error,
    saveError, clearSaveError,
  };
}

/* ---------------- Rute "/pesan" — link orang tua, berdiri sendiri ---------------- */

function ParentRoute({ store }: { store: CanteenStore }) {
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  void nowTick;
  // Sisa stok disegarkan tiap 30 detik (angka kecil, tanpa data pembeli)
  const { stokReady, loadStokDate, muatStatusSesi } = store;
  useEffect(() => {
    if (stokReady) loadStokDate(store.serviceDate);
  }, [nowTick, stokReady, loadStokDate, store.serviceDate]);
  useEffect(() => { muatStatusSesi(); }, [nowTick, muatStatusSesi]);
  const effectiveOpen = store.preorderOpen &&
    (!autoClosedNow(store.serviceDate, store.autoCloseTime) || reopenActiveNow(store.reopenUntil));

  /* Menu yang dilihat ortu = SNAPSHOT menu_harian untuk Tanggal Layanan
   * (yang disimpan lewat tombol Simpan) — bukan lagi toggle live. Belum
   * disimpan = kosong (PO Admin menampilkan banner peringatan). Fallback
   * ke master hanya jika migration_9 belum dijalankan. */
  const parentMenus = store.menuHarianReady
    ? (store.menuHarian[store.serviceDate] ?? [])
    : store.menus;

  return (
    <PreOrderParent
      kantin={store.settings.namaKantin}
      serviceDate={serviceDateLabel(store.serviceDate)}
      open={effectiveOpen}
      menus={parentMenus}
      kelasList={store.kelasList}
      pickupOptions={store.pickupPresets}
      onSubmit={store.submitPreOrder}
      stokMap={store.stokReady ? store.stokByDate[store.serviceDate] : undefined}
      onStokRefresh={() => store.loadStokDate(store.serviceDate)}
    />
  );
}

/* ---------------- Shell utama: 4 tab + gear ---------------- */

type Tab = "preorder" | "penjualan" | "tagihan" | "menu" | "kantin";

function MainShell({ store }: { store: CanteenStore }) {
  const [tab, setTab] = useState<Tab>("preorder");
  const [laporanOpen, setLaporanOpen] = useState(false);
  /* Tanggal yang DIPILIH Mama (null = ikut tanggal bawaan/sesi). Disimpan DI SINI, bukan di dalam tab, supaya
     tidak "balik sendiri" ke hari ini saat pindah tab Pre-order ⇄ Menu atau saat data dimuat ulang realtime.
     Direset hanya kalau tanggal SESI diganti. */
  const [tglLihatPO, setTglLihatPO] = useState<string | null>(null);
  const [tglMenu, setTglMenu] = useState<string | null>(null);
  useEffect(() => { setTglLihatPO(null); setTglMenu(null); }, [store.serviceDate]);
  const [menuView, setMenuView] = useState<MenuView>("menu");
  const contentRef = useRef<HTMLDivElement>(null);

  /* Double-tap ikon tab yang sedang aktif = scroll ke atas + refresh data
     (ambil ulang semua dari server) + toast kecil di atas. */
  const lastNavTap = useRef<{ id: Tab; at: number }>({ id: "preorder", at: 0 });
  const [refreshedToast, setRefreshedToast] = useState(false);
  const tapNav = (id: Tab) => {
    const now = Date.now();
    if (tab === id && lastNavTap.current.id === id && now - lastNavTap.current.at < 500) {
      contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      // Penjualan pakai kolom scroll sendiri (rail kategori + grid menu)
      contentRef.current?.querySelectorAll(".pos-scroll").forEach((el) => el.scrollTo({ top: 0, behavior: "smooth" }));
      store.reload();
      setRefreshedToast(true);
      setTimeout(() => setRefreshedToast(false), 1600);
    }
    lastNavTap.current = { id, at: now };
    setTab(id);
  };

  /* "Lihat Menu" dari PO Admin: lompat ke tab Menu, kertas "Menu PO"
     (pratinjau seperti /pesan), scroll ke atas. */
  const lihatMenu = () => {
    setTab("menu");
    setMenuView("po");
    requestAnimationFrame(() => contentRef.current?.scrollTo({ top: 0 }));
  };

  const poLink = `${window.location.origin}/pesan`;
  const unpaidCount = store.transactions.filter((tx) => !tx.paid && !tx.cancelledAt).length;

  /* POS: ketersediaan Penjualan ikut snapshot HARI INI per item (kalau ada);
   * item yang tidak ada di snapshot (mis. menu baru) ikut master. Data
   * nama/harga selalu dari master (harga jual = harga terkini). */
  const salesMenus = useMemo(() => {
    if (!store.menuHarianReady) return store.menus;
    const snap = store.menuHarian[todayISO()];
    if (!snap) return store.menus;
    const byId = new Map(snap.map((s) => [s.id, s]));
    return store.menus.map((m) => {
      const s = byId.get(m.id);
      return s ? { ...m, channels: { ...m.channels, sales: s.channels.sales } } : m;
    });
  }, [store.menus, store.menuHarian, store.menuHarianReady]);

  /* Guard: sesi PO dibuka tapi menu untuk tanggalnya belum disimpan →
   * halaman ortu kosong. Banner di PO Admin mengarahkan ke tab Menu. */
  const menuBelumDisimpan = store.menuHarianReady && !(store.menuHarian[store.serviceDate]?.length);

  useEffect(() => { if (tab === "kantin") store.loadTrash(); }, [tab]);

  useEffect(() => {
    if (!store.saveError) return;
    const id = setTimeout(store.clearSaveError, 4000);
    return () => clearTimeout(id);
  }, [store.saveError, store.clearSaveError]);

  const tabs: { id: Tab; label: string; Icon: typeof ClipboardList; badge?: number }[] = [
    { id: "preorder", label: "Pre-order", Icon: ClipboardList },
    { id: "penjualan", label: "Penjualan", Icon: ShoppingBag },
    { id: "tagihan", label: "Transaksi", Icon: CreditCard, badge: unpaidCount },
    { id: "menu", label: "Menu", Icon: BookOpen },
    { id: "kantin", label: "Kantin", Icon: Store },
  ];

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: t.bg }}>
      <div ref={contentRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", position: "relative" }}>
        {tab === "preorder" && (
          <PreOrderAdmin
            serviceDate={store.serviceDate}
            onServiceDateChange={store.setServiceDate}
            open={store.preorderOpen}
            onToggleOpen={store.togglePreorderOpen}
            autoCloseTime={store.autoCloseTime}
            onAutoCloseTimeChange={store.setAutoCloseTime}
            reopenUntil={store.reopenUntil}
            onReopenUntilChange={store.setReopenUntil}
            presets={store.pickupPresets}
            schedules={store.pickupSchedules}
            transactions={store.transactions}
            onTogglePacked={store.togglePacked}
            onLihatMenu={lihatMenu}
            viewDatePilihan={tglLihatPO}
            onViewDatePilihan={setTglLihatPO}
            menuBelumDisimpan={menuBelumDisimpan}
          />
        )}
        {tab === "penjualan" && (
          <Penjualan
            menus={salesMenus}
            kelasList={store.kelasList}
            menuHarian={store.menuHarian}
            menuHarianReady={store.menuHarianReady}
            onLoadDate={store.loadMenuHarianDate}
            transactions={store.transactions}
            onTransaction={store.addTransaction}
          />
        )}
        {/* Tetap mounted (display:none saat tidak aktif) — bukan
            unmount/remount seperti tab lain, supaya filter/urutan/pencarian
            yang sedang dipakai tidak diam-diam balik ke default cuma
            karena pindah tab sebentar lalu balik lagi. */}
        <div style={{ display: tab === "tagihan" ? "block" : "none", height: "100%" }}>
          <Tagihan
            transactions={store.transactions}
            settings={store.settings}
            onMarkPaid={store.markPaid}
            onUnmarkPaid={store.unmarkPaid}
            onCancel={store.cancelTransaction}
            onRestore={store.restoreTransaction}
            onMoveToTrash={store.moveToTrash}
            onChangeDate={store.changeTxDate}
            onMarkBilled={store.markBilled}
          />
        </div>
        {/* Kantin = profil + Laporan + pengaturan (satu pintu). Laporan dibuka di dalamnya dengan tombol kembali. */}
        {tab === "kantin" && (laporanOpen ? (
          <Laporan pickupSchedules={store.pickupSchedules} onBack={() => { setLaporanOpen(false); requestAnimationFrame(() => contentRef.current?.scrollTo({ top: 0 })); }} />
        ) : (
          <Pengaturan
            settings={store.settings}
            onChange={store.patchSettings}
            kelasList={store.kelasList}
            onAddKelas={store.addKelas}
            onPatchKelas={store.patchKelas}
            onRemoveKelas={store.removeKelas}
            onOpenLaporan={() => { setLaporanOpen(true); requestAnimationFrame(() => contentRef.current?.scrollTo({ top: 0 })); }}
            transactions={store.transactions}
            pickupPresets={store.pickupPresets}
            onSetPickupPresets={store.setPickupPresets}
            pickupSchedules={store.pickupSchedules}
            onSetPickupSchedules={store.setPickupSchedules}
            onEditCustomer={store.editTransactionCustomer}
            trashTransactions={store.trashTransactions}
            onLoadTrash={store.loadTrash}
            onRestoreFromTrash={store.restoreFromTrash}
            onHardDeleteFromTrash={store.hardDeleteFromTrash}
            poLink={poLink}
            serviceDate={store.serviceDate}
            preorderOpen={store.preorderOpen}
          />
        ))}
        {tab === "menu" && (
          <MasterMenu
            menus={store.menus}
            onAdd={store.addMenuItem}
            onPatch={store.patchMenuItem}
            onToggleChannel={store.toggleMenuChannel}
            onRemove={store.removeMenuItem}
            view={menuView}
            onViewChange={setMenuView}
            tanggalPilihan={tglMenu}
            onTanggalPilihan={setTglMenu}
            serviceDate={store.serviceDate}
            pickupSchedules={store.pickupSchedules}
            menuHarian={store.menuHarian}
            menuHarianReady={store.menuHarianReady}
            onLoadDate={store.loadMenuHarianDate}
            onSaveDaily={store.saveDailyMenu}
            menuTetap={store.menuTetap}
            menuTetapReady={store.menuTetapReady}
            onMenuTetap={store.setMenuTetap}
            stokReady={store.stokReady}
            stokByDate={store.stokByDate}
            onLoadStok={store.loadStokDate}
            onSetStok={store.setStok}
          />
        )}
      </div>

      {/* Bottom nav — 5 tab (Pre-order · Penjualan · Transaksi · Menu · Kantin). Teks/ikon gelap di atas amber. */}
      <BackToTop key={tab} root={contentRef} bottom={`calc(${NAV_HEIGHT}px + 20px + env(safe-area-inset-bottom, 0px))`} />
      <div data-testid="bottom-nav" style={{ flex: "none", borderTop: `1px solid ${t.border}`, background: t.surface, height: NAV_HEIGHT, display: "flex" }}>
        {tabs.map(({ id, label, Icon, badge }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              data-testid={`tab-${id}`}
              onClick={() => tapNav(id)}
              className="flex flex-col items-center justify-center gap-1"
              style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer", position: "relative" }}
            >
              <span style={{
                width: 40, height: 32, borderRadius: 12, display: "grid", placeItems: "center",
                background: active ? t.primary : "transparent",
              }}>
                <Icon size={19} color={active ? t.onPrimary : t.textDis} strokeWidth={active ? 2.25 : 1.75} />
              </span>
              {!!badge && (
                <span style={{ position: "absolute", top: 2, right: "22%", minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999, background: t.error, color: "#fff", fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center" }}>
                  {badge}
                </span>
              )}
              <span style={{ fontSize: 10.5, fontWeight: 700, color: active ? t.amberText : t.text2 }}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Toast refresh dari double-tap nav — di ATAS, searah dengan
          scroll-ke-atas yang menyertai refresh */}
      {refreshedToast && (
        <div style={{ position: "fixed", left: 20, right: 20, top: 18, zIndex: 75, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ background: t.primary, color: t.onPrimary, borderRadius: 12, padding: "10px 16px", fontSize: 13.5, fontWeight: 700, boxShadow: "0 8px 24px rgba(47,42,36,.25)" }}>
            Data diperbarui
          </div>
        </div>
      )}

      {/* Kegagalan simpan — supaya aksi yang gagal tidak terlihat "diam saja" */}
      {store.saveError && (
        <div style={{ position: "fixed", left: 20, right: 20, bottom: 24 + NAV_HEIGHT, zIndex: 80, display: "flex", justifyContent: "center" }}>
          <div className="flex items-center gap-3" style={{ maxWidth: 420, width: "100%", background: t.error, color: "#fff", borderRadius: 14, padding: "14px 18px", boxShadow: "0 14px 34px rgba(217,93,93,.35)" }}>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{store.saveError}</span>
            <button onClick={store.clearSaveError} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 13 }}>Tutup</button>
          </div>
        </div>
      )}
    </div>
  );
}
