import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { t } from "../../lib/theme";

/* Tombol gulir melayang — dua ubin persegi membulat, SAMA dengan ubin kalender di Pre-order (krem kartu + garis tipis), ditumpuk di kanan bawah:
   ▲ "kembali ke atas": muncul setelah menggulir jauh; ketuk = gulir mulus ke atas.
   ▼ "turun" (permintaan Mama 4 Nov: "kalau scroll turun bisa klik ikon turun juga biar ga cape"): muncul selama masih ada isi di bawah;
     ketuk = turun SATU LAYAR (±85%), ketuk lagi = turun lagi.
   Dipakai di SEMUA halaman yang bisa panjang (tab admin, Pengaturan/Laporan, halaman pemesanan orang tua).
   - root diisi  : hanya mengikuti gulir DI DALAM elemen itu (kolom gulir sendiri).
   - root kosong : mengikuti gulir halaman (window).
   Gulir menyamping (chip, tab) diabaikan: hanya perubahan scrollTop yang dihitung. */
type Penggulir = Element | Window;

const ukur = (el: Penggulir) =>
  el === window
    ? { top: window.scrollY, max: document.documentElement.scrollHeight - window.innerHeight, h: window.innerHeight }
    : { top: (el as Element).scrollTop, max: (el as Element).scrollHeight - (el as Element).clientHeight, h: (el as Element).clientHeight };

export default function BackToTop({ root, bottom = "calc(20px + env(safe-area-inset-bottom, 0px))", zIndex = 30 }: {
  root?: React.RefObject<HTMLElement | null>;
  bottom?: string | number;
  zIndex?: number;
}) {
  const [tampil, setTampil] = useState({ atas: false, bawah: false });
  const last = useRef<Penggulir | null>(null);
  const prevTop = useRef(new WeakMap<object, number>());

  useEffect(() => {
    const set = (atas: boolean, bawah: boolean) => setTampil((p) => (p.atas === atas && p.bawah === bawah ? p : { atas, bawah }));
    const hitung = (el: Penggulir) => { const u = ukur(el); set(u.top > 400, u.max - u.top > 120); };

    /** Cari elemen yang menggulir bila belum ada gulir sama sekali (halaman baru dibuka). */
    const cari = (): Penggulir | null => {
      if (!root) return window;
      const r = root.current;
      if (!r) return null;
      if (r.scrollHeight > r.clientHeight + 40) return r;
      let terbaik: Element | null = null;
      r.querySelectorAll("[style*='overflow-y: auto'], [style*='overflow-y: scroll'], .pos-scroll").forEach((e) => {
        if (e.scrollHeight > e.clientHeight + 40 && (!terbaik || e.clientHeight > terbaik.clientHeight)) terbaik = e;
      });
      return terbaik;
    };

    const on = (e: Event) => {
      const tg = e.target;
      let el: Penggulir;
      if (tg === document || tg === document.documentElement || tg === document.body) {
        if (root) return;
        el = window;
      } else if (tg instanceof Element) {
        const r = root?.current;
        if (!r || !(r === tg || r.contains(tg))) return;
        if (tg.scrollHeight <= tg.clientHeight) return;
        el = tg;
      } else return;
      const top = ukur(el).top;
      const before = prevTop.current.get(el) ?? 0;
      prevTop.current.set(el, top);
      if (top === before) return; // gulir menyamping — abaikan
      last.current = el;
      hitung(el);
    };

    // Isi halaman bisa bertambah (data baru termuat): ukur ulang berkala, murah (satu elemen)
    const periksa = () => {
      const el = last.current && (last.current === window || document.contains(last.current as Element)) ? last.current : (last.current = cari());
      if (el) hitung(el); else set(false, false);
    };
    const t1 = setTimeout(periksa, 350);
    const t2 = setInterval(periksa, 800);
    document.addEventListener("scroll", on, true);
    window.addEventListener("resize", periksa);
    return () => { clearTimeout(t1); clearInterval(t2); document.removeEventListener("scroll", on, true); window.removeEventListener("resize", periksa); };
  }, [root]);

  if (!tampil.atas && !tampil.bawah) return null;
  const ubin: React.CSSProperties = { width: 46, height: 46, borderRadius: "50%", border: "none", background: t.surface, color: t.text, cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 1px 4px rgba(42,40,32,.12)", padding: 0 };
  return (
    <div style={{ position: "fixed", right: 12, bottom, zIndex, display: "flex", flexDirection: "column", gap: 10 }}>
      {tampil.atas && (
        <button onClick={() => last.current?.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Kembali ke atas" style={ubin}>
          <ArrowUp size={22} strokeWidth={2.4} />
        </button>
      )}
      {tampil.bawah && (
        <button onClick={() => { const el = last.current; if (el) el.scrollBy({ top: Math.round(ukur(el).h * 0.85), behavior: "smooth" }); }} aria-label="Turun" style={ubin}>
          <ArrowDown size={22} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}
