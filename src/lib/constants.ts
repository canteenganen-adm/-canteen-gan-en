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
