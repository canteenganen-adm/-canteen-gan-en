import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, MessageCircle } from "lucide-react";
import { t } from "../../lib/theme";

/** Lebar dua tombol (Tagih + Lunas) yang terbuka setelah baris digeser sebagian. */
const LEBAR_AKSI = 168;
const LEBAR_TAGIH = 84;
/** Geser lebih dari ini (bagian lebar baris) = langsung Lunas, seperti geser penuh di Mail/WhatsApp. Sengaja jauh supaya tidak kebetulan. */
const AMBANG_PENUH = 0.62;
let sudahIntip = false;

/** Baris yang bisa digeser ke kiri: geser sebagian = dua tombol (Tagih, Lunas); geser penuh = Lunas langsung (Urungkan muncul).
 *  Mengikuti kebiasaan iPhone (usul pemilik 1 Nov: Mama capek membuka kartu satu per satu untuk melunaskan). */
export default function GeserBaris({ children, onTagih, onLunas, sudahTagih }: { children: ReactNode; onTagih: () => void; onLunas: () => void; sudahTagih?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);
  const [tarik, setTarik] = useState(false);
  const s = useRef<{ x: number; y: number; awal: number; mode: "" | "h" } | null>(null);
  const bergeser = useRef(false);
  const terbuka = dx !== 0;

  /* Intip sekali per HP: baris pertama bergeser sedikit lalu kembali, supaya Mama tahu baris bisa digeser (bukan fungsi tersembunyi). */
  useEffect(() => {
    if (sudahIntip) return;
    let sudah = false;
    try { sudah = localStorage.getItem("ganen_intip_geser") === "1"; } catch { /* tanpa penyimpanan: intip tiap sesi saja */ }
    sudahIntip = true;
    if (sudah) return;
    const a = setTimeout(() => setDx(-72), 900);
    const b = setTimeout(() => { setDx(0); try { localStorage.setItem("ganen_intip_geser", "1"); } catch { /* abaikan */ } }, 1900);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  /* Ketuk di luar baris yang terbuka = menutup. */
  useEffect(() => {
    if (!terbuka) return;
    const f = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setDx(0); };
    document.addEventListener("pointerdown", f, true);
    return () => document.removeEventListener("pointerdown", f, true);
  }, [terbuka]);

  const lebar = () => box.current?.clientWidth || 320;

  const turun = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    s.current = { x: e.clientX, y: e.clientY, awal: dx, mode: "" };
    bergeser.current = false;
  };
  const gerak = (e: React.PointerEvent) => {
    const m = s.current;
    if (!m) return;
    const mx = e.clientX - m.x;
    const my = e.clientY - m.y;
    if (m.mode === "") {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my) * 1.5) {
        m.mode = "h";
        setTarik(true);
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* abaikan */ }
      } else if (Math.abs(my) > 8) { s.current = null; return; }
      else return;
    }
    bergeser.current = true;
    setDx(Math.max(-lebar(), Math.min(0, m.awal + mx)));
  };
  const lepas = () => {
    const m = s.current;
    s.current = null;
    if (!m || m.mode !== "h") return;
    setTarik(false);
    if (-dx > lebar() * AMBANG_PENUH) { setDx(0); onLunas(); }
    else if (-dx > 70) setDx(-LEBAR_AKSI);
    else setDx(0);
  };

  const lebarAksi = Math.max(0, -dx);
  const penuh = lebarAksi > lebar() * AMBANG_PENUH;
  return (
    <div ref={box} style={{ position: "relative", overflow: "hidden", touchAction: "pan-y" }}
      onPointerDown={turun} onPointerMove={gerak} onPointerUp={lepas} onPointerCancel={lepas}
      onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
      <div aria-hidden={!terbuka} style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: lebarAksi, display: "flex", overflow: "hidden" }}>
        <button tabIndex={terbuka ? 0 : -1} onClick={() => { setDx(0); onTagih(); }} aria-label={sudahTagih ? `Sudah ditagih ${sudahTagih}, kirim ulang via WhatsApp` : "Tagih via WhatsApp"}
          style={{ flex: "none", width: LEBAR_TAGIH, border: "none", background: sudahTagih ? t.ditagihBg : "#8C8575", color: sudahTagih ? t.text : "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>
          <MessageCircle size={20} color={sudahTagih ? t.ditagih : "#fff"} strokeWidth={sudahTagih ? 2.4 : 2} />
          <span style={{ lineHeight: 1.15, textAlign: "center" }}>{sudahTagih ? "Ditagih" : "Tagih"}{sudahTagih && <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: t.text2 }}>{sudahTagih}</span>}</span>
        </button>
        <button tabIndex={terbuka ? 0 : -1} onClick={() => { setDx(0); onLunas(); }} aria-label="Lunas"
          style={{ flex: 1, minWidth: 0, border: "none", background: t.success, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, cursor: "pointer", padding: 0, opacity: penuh ? 1 : 0.96 }}>
          <Check size={22} strokeWidth={3} />Lunas
        </button>
      </div>
      <div onClickCapture={(e) => { if (bergeser.current) { e.stopPropagation(); e.preventDefault(); bergeser.current = false; } else if (terbuka) { e.stopPropagation(); e.preventDefault(); setDx(0); } }}
        style={{ position: "relative", background: t.bg, transform: `translateX(${dx}px)`, transition: tarik ? "none" : "transform .24s cubic-bezier(.22,.8,.3,1)" }}>
        {children}
      </div>
    </div>
  );
}
