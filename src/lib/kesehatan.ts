import type { MenuItem, Transaction } from "../types";
import { rupiah } from "./format";

/* KESEHATAN SISTEM — pemeriksaan otomatis atas data yang SUDAH dimuat di layar (tanpa permintaan baru ke database, TANPA mengubah apa pun).
   Hanya PENANDA: siapa, kapan, apa saja. Tidak pernah menyuruh membatalkan atau menghapus (pemilik 4 Nov: "jangan diutak-atik dulu, tandain aja").
   Transaksi hanya dilihat 14 hari terakhir supaya yang tampil = hal BARU, bukan data lama yang sudah diketahui. Dibaca di Kantin → baris Kesehatan. */

export interface Rincian {
  /** Judul satu temuan, mis. nama pembeli. */
  judul: string;
  /** Baris keterangan: kapan, isi, jumlah. */
  garis: string[];
}

export interface Masalah {
  id: string;
  judul: string;
  /** true = perlu dicek (kuning); false = hanya info. */
  perlu: boolean;
  jumlah: number;
  contoh: string[];
  /** Penjelasan netral (bukan perintah mengubah data). */
  langkah: string;
  rincian: Rincian[];
}

const HARI = 86_400_000;
const nama = (t: Transaction) => t.customer.nama?.trim() || "Penjualan tunai";
const kelasTeks = (t: Transaction) => [t.customer.tingkat, t.customer.kelas].filter(Boolean).join(" ");
const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const wib = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return `${d.getUTCDate()} ${BLN[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}.${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const ringkasHari = (iso: string) => { const d = new Date(new Date(iso).getTime() + 7 * 3_600_000); return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`; };
const sumber = (t: Transaction) => (t.source === "preorder" ? "Pre-order" : "Penjualan");
const isi = (t: Transaction) => t.items.map((i) => `${i.name}${i.variant ? ` (${i.variant})` : ""} ×${i.qty}${i.price >= 1000 ? "" : ` [harga ${rupiah(i.price)}]`}`).join(", ");
/** Siapa yang memesan, kelas, dan sumbernya. */
const siapa = (t: Transaction) => [nama(t), kelasTeks(t)].filter(Boolean).join(" · ");
const MAKS = 40;

export function hitungKesehatan(transactions: Transaction[], menus: MenuItem[], sekarang = Date.now()): Masalah[] {
  const baru = transactions.filter((t) => !t.cancelledAt && !t.deletedAt && sekarang - new Date(t.createdAt).getTime() <= 14 * HARI);
  const out: Masalah[] = [];
  const tambah = (m: { id: string; judul: string; perlu: boolean; langkah: string; rincian: Rincian[] }) => {
    if (m.rincian.length > 0) out.push({ id: m.id, judul: m.judul, perlu: m.perlu, langkah: m.langkah, jumlah: m.rincian.length, contoh: m.rincian.slice(0, 4).map((r) => r.judul), rincian: m.rincian.slice(0, MAKS) });
  };
  const rincianTx = (t: Transaction): Rincian => ({ judul: siapa(t), garis: [`${sumber(t)} · ${wib(t.createdAt)} · ${rupiah(t.total)}`, isi(t)] });

  // 1. Total Rp0 atau item berharga di bawah Rp1.000 (pesanan 14 hari terakhir)
  tambah({ id: "total-nol", judul: "Pesanan bertotal Rp0", perlu: true, rincian: baru.filter((t) => !(t.total > 0)).map(rincianTx), langkah: "Hanya penanda. Belum ada yang diubah. Cek dulu di Transaksi." });
  tambah({ id: "item-murah", judul: "Pesanan dengan harga item di bawah Rp1.000", perlu: true, rincian: baru.filter((t) => t.total > 0 && t.items.some((i) => !(i.price >= 1000))).map(rincianTx), langkah: "Hanya penanda. Mungkin harga menu saat itu keliru. Cek harganya di Menu." });

  // 2. Menu berharga di bawah Rp1.000
  tambah({
    id: "menu-murah", judul: "Menu berharga di bawah Rp1.000", perlu: true, langkah: "Perbaiki harganya di Menu bila memang keliru, lalu Simpan.",
    rincian: menus.filter((m) => (m.price != null && m.price < 1000) || m.variants.some((v) => !(v.price >= 1000)))
      .map((m) => ({ judul: m.name, garis: [m.variants.length > 0 ? m.variants.map((v) => `${v.name || "?"} ${rupiah(v.price)}`).join(" · ") : `Harga ${rupiah(m.price ?? 0)}`, m.category] })),
  });

  // 3. Kemungkinan pesanan ganda: isi sama persis DAN terkirim berdekatan (selisih ≤ 10 menit) — ciri ketuk dua kali / sinyal lambat.
  //    Pesanan berulang di jam berjauhan (mis. anak yang sama memesan ulang) tidak ditandai.
  const kelompok = new Map<string, Transaction[]>();
  for (const t of baru) {
    const k = [t.source, nama(t).toLowerCase(), t.serviceDate ?? t.createdAt.slice(0, 10), t.items.map((i) => `${i.name}x${i.qty}`).sort().join("|")].join("#");
    (kelompok.get(k) ?? kelompok.set(k, []).get(k)!).push(t);
  }
  const kembar: Rincian[] = [];
  for (const g of kelompok.values()) {
    if (g.length < 2) continue;
    const urut = [...g].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const dekat = urut.some((x, i) => i > 0 && new Date(x.createdAt).getTime() - new Date(urut[i - 1].createdAt).getTime() <= 10 * 60_000);
    if (!dekat) continue;
    const selisih = Math.round((new Date(urut[urut.length - 1].createdAt).getTime() - new Date(urut[0].createdAt).getTime()) / 60_000);
    kembar.push({
      judul: `${siapa(urut[0])} · ${urut.length} pesanan`,
      garis: [
        `Masuk: ${urut.map((x) => wib(x.createdAt)).join(" dan ")} (selisih ${selisih} menit)`,
        `${sumber(urut[0])}${urut[0].serviceDate ? ` · tanggal layanan ${urut[0].serviceDate}` : ""} · tiap pesanan ${rupiah(urut[0].total)}`,
        `Isi: ${isi(urut[0])}`,
      ],
    });
  }
  tambah({ id: "kembar", judul: "Kemungkinan pesanan ganda", perlu: true, rincian: kembar, langkah: "Hanya penanda. Belum ada yang diubah. Bisa saja anak itu memang memesan dua kali. Cek dulu di Transaksi." });

  // 4. Belum Dibayar lebih dari 3 minggu (info)
  const perNama = new Map<string, { n: number; total: number; tertua: string }>();
  for (const t of transactions) {
    if (t.paid || t.cancelledAt || t.deletedAt || sekarang - new Date(t.createdAt).getTime() <= 21 * HARI) continue;
    const k = nama(t);
    const cur = perNama.get(k) ?? { n: 0, total: 0, tertua: t.createdAt };
    cur.n++; cur.total += t.total; if (t.createdAt < cur.tertua) cur.tertua = t.createdAt;
    perNama.set(k, cur);
  }
  tambah({
    id: "belum-lama", judul: "Belum Dibayar lebih dari 3 minggu", perlu: false, langkah: "Info saja. Buka Transaksi → Belum Dibayar untuk menagih.",
    rincian: [...perNama.entries()].sort((a, b) => a[1].tertua.localeCompare(b[1].tertua)).map(([k, v]) => ({ judul: k, garis: [`${v.n} pesanan · ${rupiah(v.total)} · tertua ${ringkasHari(v.tertua)}`] })),
  });

  // 5. Tanggal layanan jatuh di Sabtu/Minggu (info)
  tambah({
    id: "akhir-pekan", judul: "Tanggal layanan jatuh di Sabtu/Minggu", perlu: false, langkah: "Info saja. Wajar bila memang ada pesanan akhir pekan.",
    rincian: baru.filter((t) => { if (!t.serviceDate) return false; const d = new Date(t.serviceDate + "T00:00:00").getDay(); return d === 0 || d === 6; }).map(rincianTx),
  });

  return out;
}

export const jumlahPerlu = (m: Masalah[]) => m.filter((x) => x.perlu).length;
