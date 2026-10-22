import { supabase } from "./supabase";
import type {
  MenuItem,
  Transaction,
  CanteenSettings,
  TransactionCustomer,
  TransactionItemSnapshot,
  Kelas,
  PickupSchedule,
} from "../types";

/* ============================================================
   Lapisan akses data Supabase — mapping antara baris tabel
   (snake_case) dan tipe domain di src/types.ts (camelCase).
   Skema: lihat supabase/schema.sql
   ============================================================ */

interface MenuRow {
  id: string;
  name: string;
  category: string;
  kategori_ortu?: string | null;
  price: number | null;
  variants: MenuItem["variants"];
  channels: MenuItem["channels"];
}

interface TransaksiRow {
  id: string;
  source: Transaction["source"];
  paid: boolean;
  customer: TransactionCustomer;
  items: TransactionItemSnapshot[];
  total: number;
  created_at: string;
  label: string;
  service_date: string | null;
  waktu_ambil: string | null;
  packed: boolean | null;
  packed_at?: string | null;
  order_no: string | null;
  cancelled_at: string | null;
  deleted_at: string | null;
  billed_at?: string | null;
}

interface AppStateRow {
  id: number;
  preorder_open: boolean;
  service_date: string;
  auto_close_time: string;
  reopen_until: string | null;
  pickup_presets: string[];
  pickup_schedules: PickupSchedule[] | null;
  nama_kantin: string;
  whatsapp: string;
  printer_connected: boolean;
  wa_opening: string | null;
  wa_closing: string | null;
  nama_bank: string | null;
  no_rekening: string | null;
  nama_rekening: string | null;
}

interface KelasRow {
  id: string;
  tingkat: string;
  nama: string;
}

const menuRowToItem = (r: MenuRow): MenuItem => ({
  id: r.id,
  name: r.name,
  category: r.category,
  kategoriOrtu: r.kategori_ortu ?? null,
  price: r.price,
  variants: r.variants,
  channels: r.channels,
});

const menuItemToRow = (m: MenuItem): MenuRow => {
  const row: MenuRow = {
    id: m.id,
    name: m.name,
    category: m.category,
    price: m.price,
    variants: m.variants,
    channels: m.channels,
  };
  // Sertakan kategori_ortu hanya kalau terisi — supaya upsert tetap jalan
  // sebelum migration_8_kategori_ortu.sql dijalankan (kolom belum ada).
  if (m.kategoriOrtu != null) row.kategori_ortu = m.kategoriOrtu;
  return row;
};

const txRowToTransaction = (r: TransaksiRow): Transaction => ({
  id: r.id,
  source: r.source,
  paid: r.paid,
  customer: r.customer,
  items: r.items,
  total: r.total,
  createdAt: r.created_at,
  label: r.label,
  serviceDate: r.service_date ?? undefined,
  waktuAmbil: r.waktu_ambil ?? undefined,
  packed: r.packed ?? undefined,
  packedAt: r.packed_at ?? undefined,
  orderNo: r.order_no ?? undefined,
  cancelledAt: r.cancelled_at ?? undefined,
  deletedAt: r.deleted_at ?? undefined,
  billedAt: r.billed_at ?? undefined,
});

const transactionToRow = (tx: Transaction): Record<string, unknown> => {
  const row: Record<string, unknown> = {
    id: tx.id,
    source: tx.source,
    paid: tx.paid,
    customer: tx.customer,
    items: tx.items,
    total: tx.total,
    created_at: tx.createdAt,
    label: tx.label,
    service_date: tx.serviceDate ?? null,
    waktu_ambil: tx.waktuAmbil ?? null,
    packed: tx.packed ?? null,
    order_no: tx.orderNo ?? null,
  };
  if (tx.cancelledAt != null) row.cancelled_at = tx.cancelledAt;
  return row;
};

export interface AppStateData {
  preorderOpen: boolean;
  serviceDate: string;
  autoCloseTime: string;
  reopenUntil: string | null;
  pickupPresets: string[];
  pickupSchedules: PickupSchedule[];
  settings: CanteenSettings;
}

const appStateRowToData = (r: AppStateRow): AppStateData => ({
  preorderOpen: r.preorder_open,
  serviceDate: r.service_date,
  autoCloseTime: r.auto_close_time,
  reopenUntil: r.reopen_until ?? null,
  pickupPresets: r.pickup_presets,
  pickupSchedules: r.pickup_schedules ?? [],
  settings: {
    namaKantin: r.nama_kantin,
    whatsapp: r.whatsapp,
    printerConnected: r.printer_connected,
    waOpening: r.wa_opening ?? "Halo Papa/Mama,\n\nTerima kasih telah melakukan pemesanan di Canteen Gan En. Berikut rincian pesanan Ananda:",
    waClosing: r.wa_closing ?? "Pembayaran dapat dilakukan secara tunai dengan menitipkan kepada Ananda, atau melalui transfer ke rekening berikut:",
    namaBank: r.nama_bank ?? "BCA",
    noRekening: r.no_rekening ?? "7347028990",
    namaRekening: r.nama_rekening ?? "Roswinarti",
  },
});

const kelasRowToItem = (r: KelasRow): Kelas => ({ id: r.id, tingkat: r.tingkat, nama: r.nama });

/* ---------------- Menu ---------------- */

export async function fetchMenus(): Promise<MenuItem[]> {
  const { data, error } = await supabase.from("menu").select("*").order("name");
  if (error) throw error;
  return (data as MenuRow[]).map(menuRowToItem);
}

export async function upsertMenuItem(item: MenuItem): Promise<void> {
  const { error } = await supabase.from("menu").upsert(menuItemToRow(item));
  if (error) throw error;
}

export async function deleteMenuItem(id: string): Promise<void> {
  const { error } = await supabase.from("menu").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- Menu Tetap (daftar menu yang sering dipakai) ---------------- */

/** Id item yang ditandai Menu Tetap. Melempar error kalau tabel belum ada
 * (migration_12 belum dijalankan) — pemanggil menyembunyikan fitur ini. */
export async function fetchMenuTetap(): Promise<string[]> {
  const { data, error } = await supabase.from("menu_tetap").select("item_id");
  if (error) throw error;
  return (data as { item_id: string }[]).map((r) => r.item_id);
}

export async function setMenuTetapItems(ids: string[], on: boolean): Promise<void> {
  if (ids.length === 0) return;
  if (on) {
    const { error } = await supabase.from("menu_tetap").upsert(ids.map((item_id) => ({ item_id })), { onConflict: "item_id" });
    if (error) throw error;
  } else {
    const { error } = await supabase.from("menu_tetap").delete().in("item_id", ids);
    if (error) throw error;
  }
}

/* ---------------- Stok per menu per tanggal ---------------- */

export interface StokInfo { stok: number; terpakai: number; sisa: number }

/** Sisa stok semua menu yang diberi stok untuk satu tanggal (menu tanpa baris =
 * tanpa batas). Dihitung di server dari pesanan Pre-order yang belum dibatalkan.
 * Melempar error kalau migration_13 belum dijalankan — pemanggil menyembunyikan
 * fitur stok. */
export async function fetchStokSisa(tanggal: string): Promise<Record<string, StokInfo>> {
  const { data, error } = await supabase.rpc("get_stok_sisa", { p_tanggal: tanggal });
  if (error) throw error;
  const map: Record<string, StokInfo> = {};
  (data as { item_id: string; stok: number; terpakai: number; sisa: number }[]).forEach((r) => {
    map[r.item_id] = { stok: r.stok, terpakai: r.terpakai, sisa: r.sisa };
  });
  return map;
}

/** Isi stok (angka >= 0) atau hapus batas (null = tanpa batas). */
export async function setMenuStok(tanggal: string, itemId: string, stok: number | null): Promise<void> {
  if (stok == null) {
    const { error } = await supabase.from("menu_stok").delete().eq("tanggal", tanggal).eq("item_id", itemId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("menu_stok").upsert(
      { tanggal, item_id: itemId, stok: Math.max(0, Math.floor(stok)), updated_at: new Date().toISOString() },
      { onConflict: "tanggal,item_id" });
    if (error) throw error;
  }
}

/* ---------------- Menu Harian (snapshot per tanggal + history) ---------------- */

interface MenuHarianRow {
  tanggal: string;
  item_id: string;
  nama: string;
  kategori: string;
  kategori_ortu: string | null;
  price: number | null;
  variants: MenuItem["variants"];
  tersedia_preorder: boolean;
  tersedia_penjualan: boolean;
}

const menuHarianRowToItem = (r: MenuHarianRow): MenuItem => ({
  id: r.item_id,
  name: r.nama,
  category: r.kategori,
  kategoriOrtu: r.kategori_ortu,
  price: r.price,
  variants: r.variants,
  channels: { preorder: r.tersedia_preorder, sales: r.tersedia_penjualan },
});

/** Ambil snapshot menu untuk beberapa tanggal sekaligus. Tanggal yang
 * diminta tapi tidak punya baris = null ("belum pernah disimpan").
 * Melempar error kalau tabel belum ada (migration_9 belum dijalankan) —
 * pemanggil fallback ke perilaku lama. */
export async function fetchMenuHarian(dates: string[]): Promise<Record<string, MenuItem[] | null>> {
  const { data, error } = await supabase
    .from("menu_harian")
    .select("*")
    .in("tanggal", dates)
    .order("nama");
  if (error) throw error;
  const map: Record<string, MenuItem[] | null> = {};
  dates.forEach((d) => { map[d] = null; });
  (data as MenuHarianRow[]).forEach((r) => {
    const list = (map[r.tanggal] as MenuItem[] | null) ?? [];
    list.push(menuHarianRowToItem(r));
    map[r.tanggal] = list;
  });
  return map;
}

/** Simpan snapshot menu untuk satu tanggal (dipanggil dari tombol Simpan
 * eksplisit — BUKAN auto-save). Ganti seluruh isi tanggal itu: item yang
 * kedua kanalnya mati tidak ikut disimpan. */
export async function saveMenuHarianSnapshot(tanggal: string, items: MenuItem[]): Promise<void> {
  const rows = items
    .filter((m) => m.channels.preorder || m.channels.sales)
    .map((m) => ({
      tanggal,
      item_id: m.id,
      nama: m.name,
      kategori: m.category,
      kategori_ortu: m.kategoriOrtu ?? null,
      price: m.price,
      variants: m.variants,
      tersedia_preorder: m.channels.preorder,
      tersedia_penjualan: m.channels.sales,
    }));
  const del = await supabase.from("menu_harian").delete().eq("tanggal", tanggal);
  if (del.error) throw del.error;
  if (rows.length) {
    const ins = await supabase.from("menu_harian").insert(rows);
    if (ins.error) throw ins.error;
  }
}

/* ---------------- Transaksi ---------------- */

/** Jendela data "hidup" di aplikasi harian: transaksi 30 hari terakhir +
 * SEMUA yang masih Belum Dibayar (tagihan lama tidak boleh hilang dari
 * layar). Data yang lebih lama tetap aman di database dan dibaca lewat
 * Laporan. Ini yang menjaga pemuatan tetap ringan dan kuota bandwidth
 * tidak habis (tabel sudah >7.000 baris dan terus bertambah). */
export const LIVE_DAYS = 30;
const liveCutoffISO = () => new Date(Date.now() - LIVE_DAYS * 86_400_000).toISOString();

/** Apakah baris (dari realtime) layak masuk jendela data hidup? */
export function inLiveWindow(tx: Transaction): boolean {
  return tx.createdAt >= liveCutoffISO() || (!tx.paid && !tx.cancelledAt);
}

export async function fetchTransactions(): Promise<Transaction[]> {
  // PostgREST membatasi 1 request maks 1000 baris (default project) — wajib
  // paging eksplisit, kalau tidak sisanya diam-diam tidak pernah termuat.
  const PAGE_SIZE = 1000;
  const cutoff = liveCutoffISO();
  const rows: TransaksiRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("transaksi")
      .select("*")
      .or(`created_at.gte.${cutoff},and(paid.eq.false,cancelled_at.is.null)`)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data as TransaksiRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  // Filter di JS agar resilient terhadap kolom deleted_at yang belum ada di DB
  // (kolom ditambah via migration_4_tong_sampah.sql yang perlu dijalankan manual).
  // Sebelum migration: r.deleted_at undefined → tx.deletedAt undefined → lolos filter (benar).
  // Setelah migration: baris di tong sampah punya deletedAt terisi → dibuang (benar).
  return rows.map(txRowToTransaction).filter((tx) => !tx.deletedAt);
}

/** Semua transaksi satu BULAN (batas bulan menurut WIB, UTC+7) — dipakai Laporan.
 * Hanya dibaca saat Laporan dibuka; tidak ikut pemuatan harian. Yang ada di
 * Tong Sampah tidak dihitung. month: 0–11. */
export async function fetchTransactionsMonth(year: number, month: number): Promise<Transaction[]> {
  const WIB = 7 * 3_600_000;
  const start = new Date(Date.UTC(year, month, 1) - WIB).toISOString();
  const end = new Date(Date.UTC(year, month + 1, 1) - WIB).toISOString();
  const PAGE_SIZE = 1000;
  const rows: TransaksiRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("transaksi")
      .select("*")
      .gte("created_at", start)
      .lt("created_at", end)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data as TransaksiRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows.map(txRowToTransaction);
}

/** Ringkasan ringan satu bulan (hanya total Lunas) — untuk perbandingan "dibanding bulan lalu".
 * Hanya mengambil 3 kolom kecil, bukan seluruh baris transaksi. month: 0–11. */
/** sampaiHari (opsional): hanya sampai tanggal itu (inklusif) — untuk membandingkan periode yang sama dengan bulan berjalan. */
export async function fetchMasukBulan(year: number, month: number, sampaiHari?: number): Promise<{ masuk: number; n: number; po: number; pj: number }> {
  const WIB = 7 * 3_600_000;
  const start = new Date(Date.UTC(year, month, 1) - WIB).toISOString();
  const end = new Date(Math.min(Date.UTC(year, month + 1, 1), sampaiHari ? Date.UTC(year, month, sampaiHari + 1) : Infinity) - WIB).toISOString();
  const PAGE_SIZE = 1000;
  let masuk = 0, n = 0, po = 0, pj = 0;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("transaksi")
      .select("total, source")
      .gte("created_at", start)
      .lt("created_at", end)
      .eq("paid", true)
      .is("cancelled_at", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const r of data as { total: number; source: string }[]) { masuk += r.total; n++; if (r.source === "preorder") po += r.total; else pj += r.total; }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { masuk, n, po, pj };
}

export async function fetchTrashedTransactions(): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transaksi")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw error;
  return (data as TransaksiRow[]).map(txRowToTransaction);
}

export async function purgeOldTrash(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("transaksi").delete().lt("deleted_at", cutoff);
  if (error) throw error;
}

export async function softDeleteTransaction(id: string): Promise<void> {
  const { error } = await supabase
    .from("transaksi")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function restoreFromTrash(id: string): Promise<void> {
  const { error } = await supabase.from("transaksi").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

export async function hardDeleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from("transaksi").delete().eq("id", id);
  if (error) throw error;
}

export async function insertTransaction(tx: Transaction): Promise<void> {
  const { error } = await supabase.from("transaksi").upsert(transactionToRow(tx));
  if (error) throw error;
}

/** Khusus submit Pre-order dari link orang tua. Server (trigger DB) yang
 * menentukan boleh/tidaknya (sesi dibuka + belum lewat jam tutup) dan
 * menetapkan service_date — nilai dari klien tidak pernah dipercaya.
 * Melempar Error dengan pesan yang sudah ramah ditampilkan ke orang tua
 * kalau server menolak (sesi ditutup / sudah lewat jam tutup otomatis). */
export async function submitPreOrderTransaction(tx: Transaction): Promise<Transaction> {
  const { data, error } = await supabase
    .from("transaksi")
    .insert(transactionToRow(tx))
    .select()
    .single();
  if (error) throw new Error(error.message);
  return txRowToTransaction(data as TransaksiRow);
}

export async function updateTransaction(id: string, patch: Partial<Transaction>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.paid !== undefined) row.paid = patch.paid;
  if (patch.packed !== undefined) row.packed = patch.packed;
  if (patch.packedAt !== undefined) row.packed_at = patch.packedAt;
  if (patch.cancelledAt !== undefined) row.cancelled_at = patch.cancelledAt;
  if (patch.serviceDate !== undefined) row.service_date = patch.serviceDate;
  if (patch.billedAt !== undefined) row.billed_at = patch.billedAt;
  const { error } = await supabase.from("transaksi").update(row).eq("id", id);
  if (error) throw error;
}

export async function patchTransactionCustomer(
  id: string,
  customer: TransactionCustomer,
  waktuAmbil?: string
): Promise<void> {
  const patch: Record<string, unknown> = { customer };
  if (waktuAmbil !== undefined) patch.waktu_ambil = waktuAmbil;
  const { error } = await supabase.from("transaksi").update(patch).eq("id", id);
  if (error) throw error;
}

/* ---------------- App state (status Pre-order, Tanggal Layanan, Pengaturan) ---------------- */

export async function fetchAppState(): Promise<AppStateData> {
  const { data, error } = await supabase.from("app_state").select("*").eq("id", 1).single();
  if (error) throw error;
  return appStateRowToData(data as AppStateRow);
}

export async function updateAppState(patch: Partial<AppStateRow>): Promise<void> {
  const { error } = await supabase.from("app_state").update(patch).eq("id", 1);
  if (error) throw error;
}

export const appStatePatch = {
  preorderOpen: (v: boolean) => updateAppState({ preorder_open: v }),
  serviceDate: (v: string) => updateAppState({ service_date: v }),
  autoCloseTime: (v: string) => updateAppState({ auto_close_time: v }),
  reopenUntil: (v: string | null) => updateAppState({ reopen_until: v }),
  pickupPresets: (v: string[]) => updateAppState({ pickup_presets: v }),
  pickupSchedules: (v: PickupSchedule[]) => updateAppState({ pickup_schedules: v }),
  namaKantin: (v: string) => updateAppState({ nama_kantin: v }),
  whatsapp: (v: string) => updateAppState({ whatsapp: v }),
  printerConnected: (v: boolean) => updateAppState({ printer_connected: v }),
  waOpening: (v: string) => updateAppState({ wa_opening: v }),
  waClosing: (v: string) => updateAppState({ wa_closing: v }),
  namaBank: (v: string) => updateAppState({ nama_bank: v }),
  noRekening: (v: string) => updateAppState({ no_rekening: v }),
  namaRekening: (v: string) => updateAppState({ nama_rekening: v }),
};

/* ---------------- Kelas (per Tingkat, dikelola admin) ---------------- */

export async function fetchKelas(): Promise<Kelas[]> {
  const { data, error } = await supabase.from("kelas").select("*").order("tingkat").order("nama");
  if (error) throw error;
  return (data as KelasRow[]).map(kelasRowToItem);
}

export async function upsertKelas(k: Kelas): Promise<void> {
  const { error } = await supabase.from("kelas").upsert(k);
  if (error) throw error;
}

export async function deleteKelas(id: string): Promise<void> {
  const { error } = await supabase.from("kelas").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- Realtime ---------------- */

/** Berlangganan perubahan menu/transaksi/app_state, panggil `onChange` tiap
 * ada INSERT/UPDATE/DELETE supaya semua device (admin & orang tua) sinkron
 * tanpa refresh manual. Return unsubscribe function. */
/** Perubahan realtime. Untuk `transaksi`, isi barisnya ikut dibawa sehingga
 * layar cukup MENAMBAL satu baris — tidak perlu menarik ulang ribuan baris
 * tiap ada satu pesanan masuk atau satu centang dikemas (pemborosan terbesar
 * sebelumnya). Tabel lain tetap memicu muat ulang ringan (menu/pengaturan). */
export type CanteenChange =
  | { table: "transaksi"; kind: "upsert"; tx: Transaction }
  | { table: "transaksi"; kind: "delete"; id: string }
  | { table: "other" };

/** `tanpaTransaksi` = halaman orang tua: tidak ikut menerima baris transaksi (data pembeli lain; tidak dipakai di sana). */
export function subscribeToCanteenChanges(onChange: (c: CanteenChange) => void, opts?: { tanpaTransaksi?: boolean }): () => void {
  const other = () => onChange({ table: "other" });
  const base = supabase
    .channel("canteen-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "menu" }, other);
  const channel = (opts?.tanpaTransaksi ? base : base
    .on("postgres_changes", { event: "*", schema: "public", table: "transaksi" }, (p) => {
      if (p.eventType === "DELETE") {
        const id = (p.old as { id?: string } | null)?.id;
        if (id) onChange({ table: "transaksi", kind: "delete", id });
        return;
      }
      const row = p.new as TransaksiRow | null;
      // Baris tanpa kolom wajib (mis. payload terpotong) → jatuh ke muat ulang.
      if (!row || !row.id || !row.customer || !row.items) { onChange({ table: "other" }); return; }
      onChange({ table: "transaksi", kind: "upsert", tx: txRowToTransaction(row) });
    }))
    .on("postgres_changes", { event: "*", schema: "public", table: "app_state" }, other)
    .on("postgres_changes", { event: "*", schema: "public", table: "kelas" }, other)
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_harian" }, other)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
