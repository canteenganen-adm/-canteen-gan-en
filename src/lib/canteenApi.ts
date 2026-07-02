import { supabase } from "./supabase";
import type {
  MenuItem,
  Transaction,
  CanteenSettings,
  TransactionCustomer,
  TransactionItemSnapshot,
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
  order_no: string | null;
}

interface AppStateRow {
  id: number;
  preorder_open: boolean;
  service_date: string;
  pickup_presets: string[];
  nama_kantin: string;
  whatsapp: string;
  printer_connected: boolean;
}

const menuRowToItem = (r: MenuRow): MenuItem => ({
  id: r.id,
  name: r.name,
  category: r.category,
  price: r.price,
  variants: r.variants,
  channels: r.channels,
});

const menuItemToRow = (m: MenuItem): MenuRow => ({
  id: m.id,
  name: m.name,
  category: m.category,
  price: m.price,
  variants: m.variants,
  channels: m.channels,
});

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
  orderNo: r.order_no ?? undefined,
});

const transactionToRow = (tx: Transaction): TransaksiRow => ({
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
});

export interface AppStateData {
  preorderOpen: boolean;
  serviceDate: string;
  pickupPresets: string[];
  settings: CanteenSettings;
}

const appStateRowToData = (r: AppStateRow): AppStateData => ({
  preorderOpen: r.preorder_open,
  serviceDate: r.service_date,
  pickupPresets: r.pickup_presets,
  settings: {
    namaKantin: r.nama_kantin,
    whatsapp: r.whatsapp,
    printerConnected: r.printer_connected,
  },
});

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

/* ---------------- Transaksi ---------------- */

export async function fetchTransactions(): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transaksi")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as TransaksiRow[]).map(txRowToTransaction);
}

export async function insertTransaction(tx: Transaction): Promise<void> {
  const { error } = await supabase.from("transaksi").upsert(transactionToRow(tx));
  if (error) throw error;
}

export async function updateTransaction(id: string, patch: Partial<Transaction>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.paid !== undefined) row.paid = patch.paid;
  if (patch.packed !== undefined) row.packed = patch.packed;
  const { error } = await supabase.from("transaksi").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from("transaksi").delete().eq("id", id);
  if (error) throw error;
}

export async function insertCancelledTransaction(tx: Transaction): Promise<void> {
  const { error } = await supabase.from("cancelled_transaksi").insert({ tx: transactionToRow(tx) });
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
  pickupPresets: (v: string[]) => updateAppState({ pickup_presets: v }),
  namaKantin: (v: string) => updateAppState({ nama_kantin: v }),
  whatsapp: (v: string) => updateAppState({ whatsapp: v }),
  printerConnected: (v: boolean) => updateAppState({ printer_connected: v }),
};

/* ---------------- Realtime ---------------- */

/** Berlangganan perubahan menu/transaksi/app_state, panggil `onChange` tiap
 * ada INSERT/UPDATE/DELETE supaya semua device (admin & orang tua) sinkron
 * tanpa refresh manual. Return unsubscribe function. */
export function subscribeToCanteenChanges(onChange: () => void): () => void {
  const channel = supabase
    .channel("canteen-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "menu" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "transaksi" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "app_state" }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
