/** Centang dua biru gaya WhatsApp = "sudah ditagih". Warna biru `t.ditagih`;
 *  hijau (centang tunggal dalam lingkaran) dicadangkan untuk Lunas. */
export default function IkonDitagih({ size = 24, color, strokeWidth = 2.6 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
      <path d="M18 6 7 17l-5-5" />
      <path d="m22 10-7.5 7.5L13 16" />
    </svg>
  );
}
