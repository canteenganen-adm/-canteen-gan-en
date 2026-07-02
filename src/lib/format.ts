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

/** cth. "Sen, 30 Jun 2025 · 09:12 WIB" — dipakai sebagai label transaksi. */
export function nowLabel(d = new Date()) {
  const jam = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()} · ${jam} WIB`;
}

/** cth. "Jumat, 27 Juni 2026" — dipakai untuk Tanggal Layanan. */
export function serviceDateLabel(isoDate: string) {
  const d = new Date(isoDate + "T00:00:00");
  return `${HARI_PANJANG[d.getDay()]}, ${d.getDate()} ${BULAN_PANJANG[d.getMonth()]} ${d.getFullYear()}`;
}

/** YYYY-MM-DD untuk hari ini (dipakai sebagai default Tanggal Layanan). */
export function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
