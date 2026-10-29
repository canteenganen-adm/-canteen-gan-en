/* Pekan sekolah (Senin–Jumat) untuk Transaksi → Belum Dibayar.
   Pekan = Senin sampai Minggu; tanggal Sabtu/Minggu ikut pekan Senin sebelumnya,
   jadi pesanan yang salah catat di akhir pekan tidak hilang dari daftar. */

const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const BLN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const pad2 = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromISO = (iso: string) => new Date(iso + "T00:00:00");

export const isoAdd = (iso: string, hari: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + hari);
  return toISO(d);
};

/** Senin pada pekan tanggal ini (YYYY-MM-DD). */
export const mondayOf = (iso: string) => isoAdd(iso, -((fromISO(iso).getDay() + 6) % 7));

export const namaHari = (iso: string) => HARI[fromISO(iso).getDay()];

export const isAkhirPekan = (iso: string) => {
  const h = fromISO(iso).getDay();
  return h === 0 || h === 6;
};

/** "12–16 Okt" atau "28 Sep–2 Okt" bila melintasi bulan. */
export function labelPekan(senin: string) {
  const a = fromISO(senin);
  const b = fromISO(isoAdd(senin, 4));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${BLN[b.getMonth()]}`
    : `${a.getDate()} ${BLN[a.getMonth()]}–${b.getDate()} ${BLN[b.getMonth()]}`;
}

/** Bulan tempat pekan "berakhir" (Jumat) — "YYYY-MM". */
export const bulanPekan = (senin: string) => isoAdd(senin, 4).slice(0, 7);

export function labelBulan(ym: string) {
  return `${BLN_PANJANG[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
}

/** Pekan belum selesai: sebelum Sabtu pekan itu. Pekan yang masih berjalan
 * (atau belum mulai) belum ditagih supaya sekali jalan, tidak dua kali. */
export const pekanBerjalan = (senin: string, hariIni: string) => hariIni < isoAdd(senin, 5);

/** "Jumat, 30 Okt" — untuk tombol pilihan tanggal. */
export const labelHariTgl = (iso: string) => `${namaHari(iso)}, ${Number(iso.slice(8, 10))} ${BLN[Number(iso.slice(5, 7)) - 1]}`;

/** n hari kerja (Senin–Jumat) terakhir SEBELUM tanggal ini, terbaru dulu. */
export function hariKerjaSebelum(iso: string, n: number) {
  const hasil: string[] = [];
  let d = iso;
  while (hasil.length < n) {
    d = isoAdd(d, -1);
    if (!isAkhirPekan(d)) hasil.push(d);
  }
  return hasil;
}
