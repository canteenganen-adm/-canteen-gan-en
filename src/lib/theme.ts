// Palet Final — Decision Lock §10. Satu sumber token warna untuk semua layar.
export const t = {
  // Palet "Taman" (N2): krem hangat + kartu putih. Satu warna = satu tugas:
  //   kuning madu = satu warna hero (aksi/dipilih), tulisan di atasnya GELAP. Hijau HANYA untuk status Dibuka/Sudah (permintaan Mama). BUKAN hitam, BUKAN biru · hijau = Sudah · jingga = Belum · merah = Telat.
  primary: "#F2B53C",
  primaryHover: "#E0A12E",
  primaryLight: "#FFF1CC",
  onPrimary: "#2A2820",
  bg: "#FAF6EE",
  surface: "#FFFCF7",
  surfaceSoft: "#FFF8EE",
  surfaceAlt: "#E6ECF1", // kartu pesanan selang-seling (biru abu lembut) supaya pesanan bersebelahan terbedakan
  text: "#2A2820",
  text2: "#6B6859",
  textDis: "#B3AF9F",
  success: "#3F8A3A",
  successBg: "#DDEFD3",
  successText: "#17702B",
  // isi solid cerah untuk kotak ringkasan (tulisan gelap di atasnya)
  successFill: "#DCEFD3",
  warnFill: "#FFE9CC",
  infoFill: "#E1EAF6",
  // solid untuk pil status (tulisan putih di atasnya, kontras >= 4.5)
  successSolid: "#2A7F3A",
  warnSolid: "#A85A0C",
  errorSolid: "#C63E2B",
  warn: "#D9822B",
  warnBg: "#FFE6C7",
  warnText: "#8F4E08",
  error: "#B5352A",
  errorBg: "#FBE7E3",
  border: "#DCD6C2",
  borderStrong: "#C4BDA3",
  divider: "#E6E1CF",
  amberText: "#2A2820",
} as const;

/** Tinggi bottom nav (4 tab) — dipakai layar untuk menyisakan ruang bagi
 * elemen non-modal yang fixed di bawah (cart bar, toast/undo) supaya
 * tidak menutupi nav. Sheet/modal full-screen boleh menutupi nav. */
export const NAV_HEIGHT = 76;

/** Font mono struk thermal — dipakai popup gaya struk (rincian transaksi,
 * konfirmasi menu, rekap per-item) supaya kontras dengan Onest. */
export const STRUK_MONO = "'DM Mono', ui-monospace, 'Cascadia Mono', 'SF Mono', 'Roboto Mono', 'Courier New', monospace";

/** Tepi zigzag ala struk thermal — dipakai semua popup bergaya struk. */
export const STRUK_ZIGZAG = "polygon(0 4px, 4% 0, 8% 4px, 12% 0, 16% 4px, 20% 0, 24% 4px, 28% 0, 32% 4px, 36% 0, 40% 4px, 44% 0, 48% 4px, 52% 0, 56% 4px, 60% 0, 64% 4px, 68% 0, 72% 4px, 76% 0, 80% 4px, 84% 0, 88% 4px, 92% 0, 96% 4px, 100% 0, 100% calc(100% - 4px), 96% 100%, 92% calc(100% - 4px), 88% 100%, 84% calc(100% - 4px), 80% 100%, 76% calc(100% - 4px), 72% 100%, 68% calc(100% - 4px), 64% 100%, 60% calc(100% - 4px), 56% 100%, 52% calc(100% - 4px), 48% 100%, 44% calc(100% - 4px), 40% 100%, 36% calc(100% - 4px), 32% 100%, 28% calc(100% - 4px), 24% 100%, 20% calc(100% - 4px), 16% 100%, 12% calc(100% - 4px), 8% 100%, 4% calc(100% - 4px), 0 100%)";
