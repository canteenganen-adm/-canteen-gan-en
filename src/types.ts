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
  /** Kategori versi orang tua (8 taksonomi tetap) — dipilih admin di editor
   * menu. null/undefined = belum dikategorikan → tampil sebagai "Lainnya"
   * di halaman ortu (safety net, tidak pernah disembunyikan). */
  kategoriOrtu?: string | null;
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
  /** Jam server saat DITANDAI Sudah Dikemas — dicatat OTOMATIS oleh sistem
   * (bukan diketik admin), jadi jadi bukti objektif kapan sebenarnya
   * dikemas. Dikosongkan lagi kalau ditandai ulang Belum Dikemas. */
  packedAt?: string | null;
  /** No. Pesanan tampil di Bukti Pesanan (PO-XXXXXX). Hanya source:'preorder'. */
  orderNo?: string;
  /** Diisi saat "Batalkan Transaksi" — soft-delete, transaksi TETAP ada untuk
   * Riwayat (audit), bukan dihapus permanen. null/undefined = aktif normal. */
  cancelledAt?: string | null;
  /** Diisi saat dipindah ke Tong Sampah — tersimpan 30 hari, bisa dipulihkan.
   * null/undefined = tidak di tong sampah. */
  deletedAt?: string | null;
  /** Diisi saat tagihan DIKIRIM via WhatsApp — penanda "sudah ditagih"
   * supaya tidak dobel menagih. Sinkron antar perangkat (kolom DB). */
  billedAt?: string | null;
}

export interface CanteenSettings {
  namaKantin: string;
  whatsapp: string;
  printerConnected: boolean;
  waOpening: string;
  waClosing: string;
  namaBank: string;
  noRekening: string;
  namaRekening: string;
}

/** Kelas per Tingkat — dikelola admin (Pengaturan), jadi sumber picker
 * Kelas di form orang tua (orang tua tidak bisa mengetik/menambah sendiri). */
export interface Kelas {
  id: string;
  tingkat: string;
  nama: string;
}

/** Jam layanan per Waktu Ambil — dikelola admin di sub-screen Waktu Ambil.
 * Dipakai untuk deteksi "Lewat Waktu Ambil" di PO Admin.
 * Guru/Karyawan TIDAK mewarisi defaultTime — hanya dicek kalau byTingkat diisi. */
export interface PickupSchedule {
  name: string;
  defaultTime?: string;
  byTingkat?: Record<string, string>;
}
