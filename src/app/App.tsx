import { useEffect, useState, useCallback, useRef } from "react";
import { Routes, Route } from "react-router";
import { ClipboardList, ShoppingBag, CreditCard, BookOpen, AlertTriangle } from "lucide-react";
import { t, NAV_HEIGHT } from "../lib/theme";
import { nowLabel, orderNo, serviceDateLabel, autoClosedNow, reopenActiveNow } from "../lib/format";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  fetchMenus, fetchTransactions, fetchAppState, fetchKelas, subscribeToCanteenChanges,
  upsertMenuItem, deleteMenuItem,
  insertTransaction, updateTransaction,
  submitPreOrderTransaction,
  upsertKelas, deleteKelas,
  patchTransactionCustomer,
  fetchTrashedTransactions, purgeOldTrash, softDeleteTransaction,
  restoreFromTrash as apiRestoreFromTrash, hardDeleteTransaction,
  appStatePatch,
} from "../lib/canteenApi";
import type { MenuItem, Transaction, TransactionCustomer, CanteenSettings, Kelas, PickupSchedule } from "../types";

import MasterMenu, { type MenuView } from "./screens/MasterMenu";
import Penjualan from "./screens/Penjualan";
import Tagihan from "./screens/Tagihan";
import PreOrderAdmin from "./screens/PreOrderAdmin";
import PreOrderParent, { type PreOrderReceipt } from "./screens/PreOrderParent";
import Pengaturan from "./screens/Pengaturan";

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
      <Route path="/dapur-gan-en" element={<MainShell store={store} />} />
      <Route path="*" element={<ParentRoute store={store} />} />
    </Routes>
  );
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const loadedOnce = useRef(false);
  /** Timer debounce tulis menu per-id — mengetik nama menu TIDAK boleh
   * jadi satu request per huruf (berat + memicu badai event realtime). */
  const menuWriteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const loadAll = useCallback(async () => {
    try {
      const [menusData, txData, appState, kelasData] = await Promise.all([
        fetchMenus(),
        fetchTransactions(),
        fetchAppState(),
        fetchKelas(),
      ]);
      // Jangan timpa menus saat masih ada tulisan menu yang tertunda
      // (pengguna sedang mengetik di editor) — data server masih versi
      // lama dan akan MENGHAPUS ketikan yang belum tersimpan.
      if (menuWriteTimers.current.size === 0) setMenus(menusData);
      setTransactions(txData);
      setKelasList(kelasData);
      setPreorderOpenLocal(appState.preorderOpen);
      setServiceDateLocal(appState.serviceDate);
      setAutoCloseTimeLocal(appState.autoCloseTime);
      setReopenUntilLocal(appState.reopenUntil);
      setPickupPresetsLocal(appState.pickupPresets);
      setPickupSchedulesLocal(appState.pickupSchedules);
      setSettingsLocal(appState.settings);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data dari Supabase.");
    } finally {
      setLoading(false);
      loadedOnce.current = true;
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    loadAll();
    // Realtime: perubahan dari device/tab lain (mis. pesanan baru dari /pesan)
    // memicu reload penuh. Reload di-debounce 800ms supaya rentetan event
    // beruntun (mis. beberapa save berdekatan) jadi SATU fetch, bukan badai.
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToCanteenChanges(() => {
      if (!loadedOnce.current) return;
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(loadAll, 800);
    });
    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
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
          upsertMenuItem(updated).catch((e) => reportError("patchMenuItem", e));
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
      if (updated) upsertMenuItem(updated).catch((e) => reportError("toggleMenuChannel", e));
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
  const togglePacked = (id: string) => {
    setTransactions((prev) => {
      const next = prev.map((tx) => (tx.id === id ? { ...tx, packed: !tx.packed } : tx));
      const updated = next.find((tx) => tx.id === id);
      if (updated) updateTransaction(id, { packed: updated.packed }).catch((e) => reportError("togglePacked", e));
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
  const togglePreorderOpen = () => {
    setPreorderOpenLocal((prev) => {
      const next = !prev;
      appStatePatch.preorderOpen(next).catch((e) => reportError("togglePreorderOpen", e));
      return next;
    });
  };
  const setServiceDate = (date: string) => {
    setServiceDateLocal(date);
    appStatePatch.serviceDate(date).catch((e) => reportError("setServiceDate", e));
  };
  const setAutoCloseTime = (time: string) => {
    setAutoCloseTimeLocal(time);
    appStatePatch.autoCloseTime(time).catch((e) => reportError("setAutoCloseTime", e));
  };
  /** "Buka Lagi" sementara setelah tutup otomatis — null = tutup lagi sekarang. */
  const setReopenUntil = (iso: string | null) => {
    setReopenUntilLocal(iso);
    appStatePatch.reopenUntil(iso).catch((e) => reportError("setReopenUntil", e));
  };
  const setPickupPresets = (presets: string[]) => {
    setPickupPresetsLocal(presets);
    appStatePatch.pickupPresets(presets).catch((e) => reportError("setPickupPresets", e));
  };
  const setPickupSchedules = (schedules: PickupSchedule[]) => {
    setPickupSchedulesLocal(schedules);
    appStatePatch.pickupSchedules(schedules).catch((e) => reportError("setPickupSchedules", e));
  };
  const patchSettings = (patch: Partial<CanteenSettings>) => {
    setSettingsLocal((s) => ({ ...s, ...patch }));
    if (patch.namaKantin !== undefined) appStatePatch.namaKantin(patch.namaKantin).catch((e) => reportError("patchSettings.namaKantin", e));
    if (patch.whatsapp !== undefined) appStatePatch.whatsapp(patch.whatsapp).catch((e) => reportError("patchSettings.whatsapp", e));
    if (patch.printerConnected !== undefined) appStatePatch.printerConnected(patch.printerConnected).catch((e) => reportError("patchSettings.printerConnected", e));
    if (patch.waOpening !== undefined) appStatePatch.waOpening(patch.waOpening).catch((e) => reportError("patchSettings.waOpening", e));
    if (patch.waClosing !== undefined) appStatePatch.waClosing(patch.waClosing).catch((e) => reportError("patchSettings.waClosing", e));
    if (patch.namaBank !== undefined) appStatePatch.namaBank(patch.namaBank).catch((e) => reportError("patchSettings.namaBank", e));
    if (patch.noRekening !== undefined) appStatePatch.noRekening(patch.noRekening).catch((e) => reportError("patchSettings.noRekening", e));
    if (patch.namaRekening !== undefined) appStatePatch.namaRekening(patch.namaRekening).catch((e) => reportError("patchSettings.namaRekening", e));
  };

  return {
    menus, addMenuItem, patchMenuItem, toggleMenuChannel, removeMenuItem,
    transactions, addTransaction, markPaid, unmarkPaid, cancelTransaction, restoreTransaction, togglePacked, editTransactionCustomer,
    trashTransactions, moveToTrash, restoreFromTrash, hardDeleteFromTrash, loadTrash,
    kelasList, addKelas, patchKelas, removeKelas,
    preorderOpen, togglePreorderOpen,
    serviceDate, setServiceDate,
    autoCloseTime, setAutoCloseTime,
    reopenUntil, setReopenUntil,
    pickupPresets, setPickupPresets,
    pickupSchedules, setPickupSchedules,
    settings, patchSettings,
    submitPreOrder,
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
  const effectiveOpen = store.preorderOpen &&
    (!autoClosedNow(store.serviceDate, store.autoCloseTime) || reopenActiveNow(store.reopenUntil));

  return (
    <PreOrderParent
      kantin={store.settings.namaKantin}
      serviceDate={serviceDateLabel(store.serviceDate)}
      open={effectiveOpen}
      menus={store.menus}
      kelasList={store.kelasList}
      pickupOptions={store.pickupPresets}
      onSubmit={store.submitPreOrder}
    />
  );
}

/* ---------------- Shell utama: 4 tab + gear ---------------- */

type Tab = "preorder" | "penjualan" | "tagihan" | "menu";

function MainShell({ store }: { store: CanteenStore }) {
  const [tab, setTab] = useState<Tab>("preorder");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>("menu");
  const contentRef = useRef<HTMLDivElement>(null);

  /* "Lihat Menu" dari PO Admin: lompat ke tab Menu, kertas "Menu PO"
     (pratinjau seperti /pesan), scroll ke atas. */
  const lihatMenu = () => {
    setTab("menu");
    setMenuView("po");
    requestAnimationFrame(() => contentRef.current?.scrollTo({ top: 0 }));
  };

  const poLink = `${window.location.origin}/pesan`;
  const unpaidCount = store.transactions.filter((tx) => !tx.paid && !tx.cancelledAt).length;

  const openSettings = () => { setSettingsOpen(true); store.loadTrash(); };

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
            onOpenSettings={openSettings}
          />
        )}
        {tab === "penjualan" && (
          <Penjualan
            menus={store.menus}
            transactions={store.transactions}
            onTransaction={store.addTransaction}
            onOpenSettings={openSettings}
          />
        )}
        {tab === "tagihan" && (
          <Tagihan
            transactions={store.transactions}
            settings={store.settings}
            onMarkPaid={store.markPaid}
            onUnmarkPaid={store.unmarkPaid}
            onCancel={store.cancelTransaction}
            onRestore={store.restoreTransaction}
            onMoveToTrash={store.moveToTrash}
            onOpenSettings={openSettings}
          />
        )}
        {tab === "menu" && (
          <MasterMenu
            menus={store.menus}
            onAdd={store.addMenuItem}
            onPatch={store.patchMenuItem}
            onToggleChannel={store.toggleMenuChannel}
            onRemove={store.removeMenuItem}
            onOpenSettings={openSettings}
            view={menuView}
            onViewChange={setMenuView}
          />
        )}
      </div>

      {/* Bottom nav — 4 tab, tanpa lebih. Teks/ikon gelap di atas amber. */}
      <div data-testid="bottom-nav" style={{ flex: "none", borderTop: `1px solid ${t.border}`, background: t.surface, height: NAV_HEIGHT, display: "flex" }}>
        {tabs.map(({ id, label, Icon, badge }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              data-testid={`tab-${id}`}
              onClick={() => setTab(id)}
              className="flex flex-col items-center justify-center gap-1"
              style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer", position: "relative" }}
            >
              <span style={{
                width: 40, height: 32, borderRadius: 12, display: "grid", placeItems: "center",
                background: active ? t.primary : "transparent",
              }}>
                <Icon size={19} color={active ? t.text : t.textDis} strokeWidth={active ? 2.25 : 1.75} />
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

      {/* Pengaturan — overlay dari ikon gear, bukan tab */}
      {settingsOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, background: t.bg, overflowY: "auto" }}>
          <Pengaturan
            settings={store.settings}
            onChange={store.patchSettings}
            kelasList={store.kelasList}
            onAddKelas={store.addKelas}
            onPatchKelas={store.patchKelas}
            onRemoveKelas={store.removeKelas}
            onClose={() => setSettingsOpen(false)}
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
