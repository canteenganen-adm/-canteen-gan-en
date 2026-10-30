import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { t } from "../../lib/theme";

/* Baris yang bisa digeser menyamping (kelas di Pre-order, kategori di Menu).
   Tanda ‹ › = bulatan kecil krem (pilihan pemilik 30 Okt) yang MENGAMBANG di tepi, di atas
   tulisan: tidak mengambil ruang barisnya dan hanya muncul di sisi yang masih menyimpan isi di luar layar.
   Area ketuk 40px x tinggi baris, bulatannya 32px. Ketuk = geser lebih jauh. */
export default function RailGeser({ children, style, bawah = 0 }: { children: ReactNode; style?: CSSProperties; bawah?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [kiri, setKiri] = useState(false);
  const [kanan, setKanan] = useState(false);
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setKiri(el.scrollLeft > 4);
    setKanan(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };
  useEffect(update); // isi baris bisa berubah (kategori baru termuat)
  useEffect(() => {
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const panah = (sisi: "left" | "right"): CSSProperties => ({
    position: "absolute", top: 0, bottom: bawah, [sisi]: 0, width: 40, padding: 0, border: "none", background: "transparent",
    cursor: "pointer", display: "grid", placeItems: "center", color: t.text,
  });
  const bulat: CSSProperties = {
    width: 32, height: 32, borderRadius: 999, background: "rgba(255,252,247,.94)", border: `1.5px solid ${t.border}`,
    boxShadow: "0 1px 4px rgba(60,48,20,.12)", display: "grid", placeItems: "center",
  };
  return (
    <div style={{ position: "relative" }}>
      <div ref={ref} onScroll={update} className="flex hscroll" style={{ overflowX: "auto", ...style }}>{children}</div>
      {kiri && (
        <button onClick={() => ref.current?.scrollBy({ left: -160, behavior: "smooth" })} aria-label="Geser ke kiri" style={panah("left")}>
          <span style={bulat}><ChevronLeft size={20} /></span>
        </button>
      )}
      {kanan && (
        <button onClick={() => ref.current?.scrollBy({ left: 160, behavior: "smooth" })} aria-label="Geser ke kanan" style={panah("right")}>
          <span style={bulat}><ChevronRight size={20} /></span>
        </button>
      )}
    </div>
  );
}
