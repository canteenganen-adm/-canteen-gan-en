import type { MenuItem } from "../types";

export const rupiah = (n: number | null | undefined) =>
  n == null ? "—" : "Rp" + n.toLocaleString("id-ID");

export const uid = () => Math.random().toString(36).slice(2, 9);
export const orderNo = () => "PO-" + Math.random().toString(36).slice(2, 8).toUpperCase();

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const HARI_PANJANG = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const BULAN_PANJANG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** cth. "Sen, 30 Jun 2025 · 09:12:05 WIB" — dipakai sebagai label transaksi
 * (Order Timestamp). Detik disertakan untuk keperluan audit. */
export function nowLabel(d = new Date()) {
  const jam = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()} · ${jam} WIB`;
}

/** cth. "Jumat, 27 Juni 2026" — dipakai untuk Tanggal Layanan. */
export function serviceDateLabel(isoDate: string) {
  const d = new Date(isoDate + "T00:00:00");
  return `${HARI_PANJANG[d.getDay()]}, ${d.getDate()} ${BULAN_PANJANG[d.getMonth()]} ${d.getFullYear()}`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function toISO(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** YYYY-MM-DD untuk hari ini (dipakai sebagai default Tanggal Layanan). */
export function todayISO() {
  return toISO(new Date());
}

/** Hari sekolah berikutnya (besok, tapi lompati Sabtu/Minggu) — default
 * saat admin membuka sesi PO baru, supaya tidak kejebak jatuh di weekend. */
export function nextSchoolDayISO(from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return toISO(d);
}

/** cth. "08:00" dari "08:00:00" (kolom time Postgres). */
export function hhmm(time: string) {
  return time.slice(0, 5);
}

/** true jika sekarang (WIB) sudah lewat jam autoCloseTime pada hari serviceDate.
 * Dipakai klien untuk menampilkan status "Tutup Otomatis" tanpa harus submit. */
export function autoClosedNow(serviceDate: string, autoCloseTime: string): boolean {
  const now = new Date();
  const wibDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
  const wibTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(now);
  return wibDate === serviceDate && wibTime >= autoCloseTime;
}

/** Jam WIB sekarang dalam format "HH:MM" — dipakai untuk deteksi Lewat Waktu Ambil. */
export function wibTimeHHMM(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date());
}

export function priceLabel(m: MenuItem) {
  if (m.variants.length > 0) {
    const ps = m.variants.map((v) => v.price).filter((x) => x != null);
    if (ps.length === 0) return `${m.variants.length} varian`;
    const lo = Math.min(...ps);
    const hi = Math.max(...ps);
    return lo === hi ? rupiah(lo) : `${rupiah(lo)}–${rupiah(hi)}`;
  }
  return rupiah(m.price);
}

export function itemsText(items: { name: string; variant?: string | null; qty: number }[]) {
  return items.map((i) => `${i.name}${i.variant ? " " + i.variant : ""} ×${i.qty}`).join(", ");
}
