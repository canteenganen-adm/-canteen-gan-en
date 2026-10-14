import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { t } from "../../lib/theme";

/* Tombol "kembali ke atas" — ubin persegi membulat, SAMA dengan ubin kalender di Pre-order (krem kartu + garis tipis) — dipakai di SEMUA halaman yang bisa panjang
   (tab admin, Pengaturan/Laporan, halaman pemesanan orang tua).
   Muncul setelah menggulir jauh; ketuk = gulir mulus ke atas.
   - root diisi  : hanya mengikuti gulir DI DALAM elemen itu (kolom gulir sendiri).
   - root kosong : mengikuti gulir halaman (window).
   Gulir menyamping (chip, tab) diabaikan: hanya perubahan scrollTop yang dihitung. */
export default function BackToTop({ root, bottom = "calc(20px + env(safe-area-inset-bottom, 0px))", zIndex = 30 }: {
  root?: React.RefObject<HTMLElement | null>;
  bottom?: string | number;
  zIndex?: number;
}) {
  const [show, setShow] = useState(false);
  const last = useRef<Element | Window | null>(null);
  const prevTop = useRef(new WeakMap<object, number>());

  useEffect(() => {
    const on = (e: Event) => {
      const tg = e.target;
      let el: Element | Window;
      let top: number;
      if (tg === document || tg === document.documentElement || tg === document.body) {
        if (root) return;
        el = window; top = window.scrollY;
      } else if (tg instanceof Element) {
        const r = root?.current;
        if (!r || !(r === tg || r.contains(tg))) return;
        if (tg.scrollHeight <= tg.clientHeight) return;
        el = tg; top = tg.scrollTop;
      } else return;
      const before = prevTop.current.get(el) ?? 0;
      prevTop.current.set(el, top);
      if (top === before) return; // gulir menyamping — abaikan
      last.current = el;
      setShow(top > 400);
    };
    document.addEventListener("scroll", on, true);
    return () => document.removeEventListener("scroll", on, true);
  }, [root]);

  if (!show) return null;
  return (
    <button onClick={() => last.current?.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Kembali ke atas"
      style={{ position: "fixed", right: 16, bottom, zIndex, width: 48, height: 48, borderRadius: 14, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 2px 8px rgba(42,40,32,.14)" }}>
      <ArrowUp size={22} strokeWidth={2.4} />
    </button>
  );
}
