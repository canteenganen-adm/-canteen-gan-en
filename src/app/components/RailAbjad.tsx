import { useRef } from "react";
import { t } from "../../lib/theme";

/* Indeks A–Z di tepi kanan (seperti kontak): ketuk atau seret jari di atas huruf untuk meloncat ke bagian itu.
   Mengambang (fixed) di atas daftar, tidak mengambil ruang kartu. */
export default function RailAbjad({ huruf, onPilih, bawah }: { huruf: string[]; onPilih: (h: string) => void; bawah: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const terakhir = useRef("");
  const dariY = (y: number) => {
    const el = ref.current;
    if (!el || !huruf.length) return;
    const r = el.getBoundingClientRect();
    const i = Math.min(huruf.length - 1, Math.max(0, Math.floor(((y - r.top) / r.height) * huruf.length)));
    if (huruf[i] === terakhir.current) return;
    terakhir.current = huruf[i];
    onPilih(huruf[i]);
  };
  return (
    <div ref={ref} aria-label="Loncat ke huruf"
      onTouchStart={(e) => dariY(e.touches[0].clientY)} onTouchMove={(e) => dariY(e.touches[0].clientY)} onTouchEnd={() => { terakhir.current = ""; }}
      onClick={(e) => { terakhir.current = ""; dariY(e.clientY); }}
      style={{ position: "fixed", right: 3, top: 196, bottom: bawah, width: 24, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center",
        padding: "8px 0", borderRadius: 999, background: "rgba(255,252,247,.92)", border: `1px solid ${t.border}`, touchAction: "none", userSelect: "none", cursor: "pointer" }}>
      {huruf.map((h) => <span key={h} style={{ fontSize: 11, fontWeight: 800, color: t.text2, lineHeight: 1 }}>{h}</span>)}
    </div>
  );
}
