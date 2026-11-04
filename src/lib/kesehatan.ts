import type { MenuItem, Transaction } from "../types";

/* KESEHATAN SISTEM — pemeriksaan otomatis atas data yang SUDAH dimuat di layar (tanpa permintaan baru ke database, tanpa menulis apa pun).
   Dibuat 4 Nov (permintaan pemilik: kurangi beban patroli manual). Transaksi hanya dilihat 14 hari terakhir supaya yang tampil = masalah BARU,
   bukan data lama yang sudah diketahui. Dibaca di Kantin → baris Kesehatan. */

export interface Masalah {
  id: string;
  judul: string;
  /** true = perlu dicek (kuning); false = hanya info. */
  perlu: boolean;
  jumlah: number;
  contoh: string[];
  /** Langkah singkat untuk Mama/Papa. */
  langkah: string;
}

const HARI = 86_400_000;
const nama = (t: Transaction) => t.customer.nama?.trim() || "Penjualan tunai";
const ringkasHari = (iso: string) => { const d = new Date(new Date(iso).getTime() + 7 * 3_600_000); return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`; };

export function hitungKesehatan(transactions: Transaction[], menus: MenuItem[], sekarang = Date.now()): Masalah[] {
  const baru = transactions.filter((t) => !t.cancelledAt && !t.deletedAt && sekarang - new Date(t.createdAt).getTime() <= 14 * HARI);
  const out: Masalah[] = [];
  const tambah = (m: Omit<Masalah, "contoh"> & { daftar: string[] }) => {
    if (m.jumlah > 0) out.push({ id: m.id, judul: m.judul, perlu: m.perlu, jumlah: m.jumlah, contoh: m.daftar.slice(0, 4), langkah: m.langkah });
  };

  // 1. Total Rp0 atau item berharga di bawah Rp1.000 (pesanan 14 hari terakhir)
  const nol = baru.filter((t) => !(t.total > 0));
  tambah({ id: "total-nol", judul: "Pesanan bertotal Rp0", perlu: true, jumlah: nol.length, daftar: nol.map((t) => `${nama(t)} · ${ringkasHari(t.createdAt)}`), langkah: "Buka Transaksi, cari namanya, lalu Batalkan bila memang salah catat." });
  const murah = baru.filter((t) => t.total > 0 && t.items.some((i) => !(i.price >= 1000)));
  tambah({ id: "item-murah", judul: "Pesanan dengan harga item di bawah Rp1.000", perlu: true, jumlah: murah.length, daftar: murah.map((t) => `${nama(t)} · ${ringkasHari(t.createdAt)}`), langkah: "Periksa harga menunya di Menu, lalu cek pesanan itu di Transaksi." });

  // 2. Menu berharga di bawah Rp1.000
  const menuMurah = menus.filter((m) => (m.price != null && m.price < 1000) || m.variants.some((v) => !(v.price >= 1000)));
  tambah({ id: "menu-murah", judul: "Menu berharga di bawah Rp1.000", perlu: true, jumlah: menuMurah.length, daftar: menuMurah.map((m) => m.name), langkah: "Buka Menu, ketuk menunya, perbaiki harga lalu Simpan." });

  // 3. Pesanan kembar (nama + tanggal layanan + isi sama persis)
  const kelompok = new Map<string, Transaction[]>();
  for (const t of baru) {
    const k = [t.source, nama(t).toLowerCase(), t.serviceDate ?? t.createdAt.slice(0, 10), t.items.map((i) => `${i.name}x${i.qty}`).sort().join("|")].join("#");
    (kelompok.get(k) ?? kelompok.set(k, []).get(k)!).push(t);
  }
  // Ganda = isi sama persis DAN terkirim berdekatan (selisih ≤ 10 menit): ciri ketuk dua kali / sinyal lambat.
  // Pesanan berulang di jam berjauhan (mis. anak yang sama memesan ulang) tidak ditandai.
  const kembar = [...kelompok.values()].filter((g) => {
    if (g.length < 2) return false;
    const w = g.map((x) => new Date(x.createdAt).getTime()).sort((a, b) => a - b);
    return w.some((x, i) => i > 0 && x - w[i - 1] <= 10 * 60_000);
  });
  tambah({ id: "kembar", judul: "Kemungkinan pesanan ganda", perlu: true, jumlah: kembar.length, daftar: kembar.map((g) => `${nama(g[0])} · ${g.length}×`), langkah: "Cek di Transaksi. Kalau terkirim dua kali, Batalkan salah satunya." });

  // 4. Belum Dibayar lebih dari 3 minggu
  const lama = transactions.filter((t) => !t.paid && !t.cancelledAt && !t.deletedAt && sekarang - new Date(t.createdAt).getTime() > 21 * HARI);
  const namaLama = [...new Set(lama.map(nama))];
  tambah({ id: "belum-lama", judul: "Belum Dibayar lebih dari 3 minggu", perlu: false, jumlah: lama.length, daftar: namaLama, langkah: "Buka Transaksi → Belum Dibayar, pilih minggunya lalu tagih." });

  // 5. Tanggal layanan jatuh di Sabtu/Minggu (info)
  const akhirPekan = baru.filter((t) => { if (!t.serviceDate) return false; const d = new Date(t.serviceDate + "T00:00:00").getDay(); return d === 0 || d === 6; });
  tambah({ id: "akhir-pekan", judul: "Tanggal layanan jatuh di Sabtu/Minggu", perlu: false, jumlah: akhirPekan.length, daftar: akhirPekan.map((t) => `${nama(t)} · ${t.serviceDate}`), langkah: "Wajar bila memang ada pesanan akhir pekan. Kalau keliru, ubah di struk → baris Untuk." });

  return out;
}

export const jumlahPerlu = (m: Masalah[]) => m.filter((x) => x.perlu).length;
