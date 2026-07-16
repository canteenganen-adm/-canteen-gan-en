/** Daftar Tingkat — dipakai form orang tua (Pre-order) dan Pengaturan
 * (Daftar Kelas per Tingkat). Guru/Karyawan tidak punya Kelas. */
export const TINGKAT_LIST = ["KB", "TK A", "TK B", "SD", "SMP", "SMA", "Guru/Karyawan"];
export const NO_KELAS_TINGKAT = "Guru/Karyawan";

/** Taksonomi kategori versi ORANG TUA (final, vegan-safe) — pilihan dropdown
 * "Kategori untuk Orang Tua" di editor menu admin. "Lainnya" BUKAN pilihan
 * manual — murni fallback otomatis untuk item yang belum dikategorikan. */
export const KATEGORI_ORTU_LIST = [
  "Makanan Utama", "Lauk", "Gorengan", "Camilan Sehat",
  "Snack", "Buah", "Dessert", "Paket",
];
export const KATEGORI_ORTU_FALLBACK = "Lainnya";

/** Emoji + urutan tampil kategori ortu — dipakai PreOrderParent DAN
 * pratinjau visual di tab Menu admin (satu sumber, jangan duplikat).
 * Vegan-safe: tanpa ikon hewan/daging/seafood. */
/** Warna pil kelas per tingkat (keputusan terkunci: solid, teks putih). */
export const TINGKAT_WARNA: Record<string, string> = {
  "KB": "#D6608A", "TK A": "#7C6BAF", "TK B": "#7C6BAF",
  "SD": "#C94F4F", "SMP": "#4A7BA6", "SMA": "#6E6E6E",
  "Guru/Karyawan": "#2F2A24",
};

/** Warna pil kelas. Pakai tingkat bila tercatat; untuk data lama Penjualan
 * (kelas ketik bebas tanpa tingkat) tebak dari teks kelas: angka 1-6 = SD,
 * 7-9 = SMP, 10-12 = SMA, awalan KB/TK. Gagal tebak = hitam. */
export function tingkatColor(tingkat?: string, kelas?: string): string {
  if (tingkat && TINGKAT_WARNA[tingkat]) return TINGKAT_WARNA[tingkat];
  const k = (kelas || "").trim().toUpperCase();
  if (k.startsWith("KB")) return TINGKAT_WARNA["KB"];
  if (k.startsWith("TK")) return TINGKAT_WARNA["TK A"];
  const n = parseInt(k, 10);
  if (n >= 1 && n <= 6) return TINGKAT_WARNA["SD"];
  if (n >= 7 && n <= 9) return TINGKAT_WARNA["SMP"];
  if (n >= 10 && n <= 12) return TINGKAT_WARNA["SMA"];
  return "#2F2A24";
}

export const KATEGORI_ORTU_EMOJI: Record<string, string> = {
  "Makanan Utama": "🍚", "Lauk": "🥘", "Gorengan": "🧆", "Camilan Sehat": "🥗",
  "Snack": "🍪", "Buah": "🍎", "Dessert": "🧁", "Paket": "🍱", "Lainnya": "🍽️",
};
export const KATEGORI_ORTU_ORDER = [...KATEGORI_ORTU_LIST, KATEGORI_ORTU_FALLBACK];
