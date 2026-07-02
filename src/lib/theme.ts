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
