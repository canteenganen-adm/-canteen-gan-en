import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { t } from "../../lib/theme";

/* Baris yang bisa digeser menyamping (kelas di Pre-order, kategori di Menu).
   Tanda ‹ › setengah transparan MENGAMBANG di tepi: tidak mengambil ruang, dan
   hanya muncul di sisi yang masih menyimpan isi di luar layar. Ketuk = geser lebih jauh. */
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
    position: "absolute", top: 0, bottom: bawah, [sisi]: 0, width: 30, padding: 0, border: "none", background: "transparent",
    cursor: "pointer", display: "grid", placeItems: "center", color: t.text, opacity: 0.5,
  });
  return (
    <div style={{ position: "relative" }}>
      <div ref={ref} onScroll={update} className="flex hscroll" style={{ overflowX: "auto", ...style }}>{children}</div>
      {kiri && (
        <button onClick={() => ref.current?.scrollBy({ left: -160, behavior: "smooth" })} aria-label="Geser ke kiri" style={panah("left")}>
          <ChevronLeft size={22} />
        </button>
      )}
      {kanan && (
        <button onClick={() => ref.current?.scrollBy({ left: 160, behavior: "smooth" })} aria-label="Geser ke kanan" style={panah("right")}>
          <ChevronRight size={22} />
        </button>
      )}
    </div>
  );
}
