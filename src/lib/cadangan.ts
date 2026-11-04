/* Penanda "Excel bulan ini sudah diunduh" per HP per bulan (localStorage). Dipakai pengingat di Kantin DAN semua jalur unduh Excel
   (menu Laporan, tombol Unduh pengingat), supaya pengingat tidak menyuruh mengunduh terus setelah diunduh lewat jalur mana pun.
   Catatan: penanda hanya berlaku di perangkat itu; bisa juga ditutup manual lewat tombol X di pengingat. */
const kunci = (y: number, m: number) => `ganen_cadangan_${y}-${m + 1}`;

export const sudahDiunduh = (y: number, m: number): boolean => {
  try { return localStorage.getItem(kunci(y, m)) === "1"; } catch { return false; }
};

export const tandaiSudahDiunduh = (y: number, m: number) => {
  try { localStorage.setItem(kunci(y, m), "1"); } catch { /* tanpa penyimpanan: pengingat muncul lagi, tidak masalah */ }
};
