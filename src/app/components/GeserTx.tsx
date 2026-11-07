import { useRef, useState, type ReactNode } from "react";
import { t } from "../../lib/theme";

/** Satu aksi yang terungkap saat baris digeser. */
export type AksiGeser = { label: string; ikon: ReactNode; bg: string; warna: string; onAksi: () => void };

const AMBANG = 96; // geser lebih dari ini lalu lepas = aksi jalan (tanpa dialog; pemanggil menampilkan Urungkan)
const MAKS = 140;

/** Baris transaksi yang bisa digeser (Lunas/Dibatalkan): kiri = aksi di sisi kanan baris, kanan = aksi di sisi kiri baris.
 *  Geser tidak mengubah apa pun sampai dilepas melewati ambang; ketuk biasa tetap membuka rincian. */
export default function GeserTx({ children, kiri, kanan, bg }: { children: ReactNode; kiri?: AksiGeser; kanan?: AksiGeser; bg?: string }) {
  const [dx, setDx] = useState(0);
  const [tarik, setTarik] = useState(false);
  const s = useRef<{ x0?: number; x: number; y: number; mode: "" | "h" } | null>(null);
  const bergeser = useRef(false);

  const turun = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    s.current = { x: e.clientX, y: e.clientY, mode: "" };
    bergeser.current = false;
  };
  const gerak = (e: React.PointerEvent) => {
    const m = s.current;
    if (!m) return;
    const mx = e.clientX - m.x, my = e.clientY - m.y;
    if (m.mode === "") {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my) * 1.5) {
        m.mode = "h"; m.x0 = mx; setTarik(true);
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* abaikan */ }
      } else if (Math.abs(my) > 8) { s.current = null; return; }
      else return;
    }
    bergeser.current = true;
    const min = kiri ? -MAKS : 0, max = kanan ? MAKS : 0;
    const g = mx - (m.x0 ?? 0);
    /* mulai dari 0 saat sentuhan terbaca sebagai geseran (tidak melompat), makin jauh makin berat (karet) */
    const lunak = (v: number) => { const a = Math.abs(v); const r = a < AMBANG ? a * 0.85 : AMBANG * 0.85 + (a - AMBANG) * 0.35; return Math.sign(v) * r; };
    setDx(Math.max(min, Math.min(max, lunak(g))));
  };
  const lepas = () => {
    const m = s.current; s.current = null;
    if (!m || m.mode !== "h") return;
    setTarik(false);
    const a = dx <= -AMBANG * 0.85 ? kiri : dx >= AMBANG * 0.85 ? kanan : undefined;
    setDx(0);
    if (a) a.onAksi();
  };

  const aktif = dx < 0 ? kiri : dx > 0 ? kanan : undefined;
  const lebar = Math.abs(dx);
  const lewat = lebar >= AMBANG * 0.85;
  return (
    <div style={{ position: "relative", overflow: "hidden", touchAction: "pan-y" }}
      onPointerDown={turun} onPointerMove={gerak} onPointerUp={lepas} onPointerCancel={lepas}
      onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
      {aktif && (
        <div aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, [dx < 0 ? "right" : "left"]: 0, width: lebar, background: aktif.bg, color: aktif.warna, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, overflow: "hidden", fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", opacity: lewat ? 1 : 0.55 + Math.min(0.3, lebar / 200) }}>
          {lebar > 56 && <>{aktif.ikon}{aktif.label}</>}
        </div>
      )}
      <div onClickCapture={(e) => { if (bergeser.current) { e.stopPropagation(); e.preventDefault(); bergeser.current = false; } }}
        style={{ position: "relative", background: bg || t.surface, transform: `translateX(${dx}px)`, transition: tarik ? "none" : "transform .24s cubic-bezier(.22,.8,.3,1)" }}>
        {children}
      </div>
    </div>
  );
}
