// Palet Final — Decision Lock §10. Satu sumber token warna untuk semua layar.
export const t = {
  primary: "#FDB833",
  primaryHover: "#F9A03F",
  primaryLight: "#FFF1CC",
  bg: "#FAF6EE",
  surface: "#FFFCF7",
  surfaceSoft: "#FFF8EE",
  text: "#2F2A24",
  text2: "#756B5D",
  textDis: "#B7AEA0",
  success: "#6FA76D",
  successBg: "#EAF5E6",
  successText: "#3F6B43",
  error: "#D95D5D",
  errorBg: "#FBEAEA",
  border: "#E8E0D2",
  divider: "#F1EBE0",
  amberText: "#9A6700",
} as const;

/** Tinggi bottom nav (4 tab) — dipakai layar untuk menyisakan ruang bagi
 * elemen non-modal yang fixed di bawah (cart bar, toast/undo) supaya
 * tidak menutupi nav. Sheet/modal full-screen boleh menutupi nav. */
export const NAV_HEIGHT = 76;

/** Font mono struk thermal — dipakai popup gaya struk (rincian transaksi,
 * konfirmasi menu, rekap per-item) supaya kontras dengan Jakarta Sans. */
export const STRUK_MONO = "'JetBrains Mono', ui-monospace, 'Cascadia Mono', 'SF Mono', 'Roboto Mono', 'Courier New', monospace";

/** Tepi zigzag ala struk thermal — dipakai semua popup bergaya struk. */
export const STRUK_ZIGZAG = "polygon(0 4px, 4% 0, 8% 4px, 12% 0, 16% 4px, 20% 0, 24% 4px, 28% 0, 32% 4px, 36% 0, 40% 4px, 44% 0, 48% 4px, 52% 0, 56% 4px, 60% 0, 64% 4px, 68% 0, 72% 4px, 76% 0, 80% 4px, 84% 0, 88% 4px, 92% 0, 96% 4px, 100% 0, 100% calc(100% - 4px), 96% 100%, 92% calc(100% - 4px), 88% 100%, 84% calc(100% - 4px), 80% 100%, 76% calc(100% - 4px), 72% 100%, 68% calc(100% - 4px), 64% 100%, 60% calc(100% - 4px), 56% 100%, 52% calc(100% - 4px), 48% 100%, 44% calc(100% - 4px), 40% 100%, 36% calc(100% - 4px), 32% 100%, 28% calc(100% - 4px), 24% 100%, 20% calc(100% - 4px), 16% 100%, 12% calc(100% - 4px), 8% 100%, 4% calc(100% - 4px), 0 100%)";
