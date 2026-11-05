import { t } from "../../lib/theme";

/** Cincin hitung mundur bersama (halaman ortu + PO Admin). frac = sisa waktu 0..1 (dasar 24 jam); beku = sesi ditutup → cincin kosong abu. */
export default function JamHitung({ frac, warn, beku, size = 20 }: { frac: number; warn: boolean; beku?: boolean; size?: number }) {
  const r = 8, c = 2 * Math.PI * r, warna = beku ? t.textDis : warn ? t.warnText : t.text;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden style={{ flex: "none" }}>
      <circle cx="10" cy="10" r={r} fill="none" stroke={t.textDis} strokeWidth="2" strokeDasharray="1.2 2.5" strokeLinecap="round" />
      {!beku && <circle cx="10" cy="10" r={r} fill="none" stroke={warna} strokeWidth="2.4" strokeLinecap="round"
        strokeDasharray={`${Math.max(0.01, c * frac)} ${c}`} transform="rotate(-90 10 10)" />}
      <path d="M10 6.2V10l2.4 1.4" fill="none" stroke={warna} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
