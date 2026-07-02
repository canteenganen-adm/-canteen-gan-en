// Shared domain types — Canteen Gan En
// Sesuai Decision Lock: varian + harga per varian, channel Pre-order/Penjualan,
// transaksi snapshot (tidak berubah walau harga Master Menu berubah kemudian).

export interface Variant {
  id: string;
  name: string;
  price: number;
}

export interface Channels {
  preorder: boolean;
  sales: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  /** Harga menu tanpa varian. null jika menu ini punya varian (lihat `variants`). */
  price: number | null;
  variants: Variant[];
  channels: Channels;
}

export type TransactionSource = "preorder" | "penjualan";

/** Salinan nama+varian+harga saat transaksi dibuat — tidak ikut berubah jika Master Menu berubah. */
export interface TransactionItemSnapshot {
  name: string;
  variant?: string | null;
  price: number;
  qty: number;
  note?: string;
}

export interface TransactionCustomer {
  nama: string;
  kelas: string;
  wa?: string;
  /** Hanya diisi untuk transaksi Pre-order (parent link). */
  tingkat?: string;
}

export interface Transaction {
  id: string;
  source: TransactionSource;
  /** true = Dibayar/Lunas, false = Belum Bayar (masuk Tagihan). */
  paid: boolean;
  customer: TransactionCustomer;
  items: TransactionItemSnapshot[];
  total: number;
  createdAt: string;
  /** Label tanggal+waktu siap-tampil, cth. "Sen, 30 Jun 2025 · 09:12 WIB". */
  label: string;
  /** Hanya untuk source:'preorder' — satu Tanggal Layanan aktif saat pesanan dibuat. */
  serviceDate?: string;
  /** Hanya untuk source:'preorder' — preset Waktu Ambil dipilih orang tua. */
  waktuAmbil?: string;
  /** Hanya untuk source:'preorder' — status kemas di sisi admin. */
  packed?: boolean;
  /** No. Pesanan tampil di Bukti Pesanan (PO-XXXXXX). Hanya source:'preorder'. */
  orderNo?: string;
}

/** Riwayat pembatalan — implementasi di belakang layar, tidak tampil di UI utama. */
export interface CancelledTransaction {
  tx: Transaction;
  cancelledAt: string;
}

export interface CanteenSettings {
  namaKantin: string;
  whatsapp: string;
  printerConnected: boolean;
}
