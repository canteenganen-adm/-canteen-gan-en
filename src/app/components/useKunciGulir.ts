import { useEffect } from "react";

/* Saat popover/menu terbuka, halaman di belakangnya TIDAK boleh ikut tergulir.
   Mengunci gulir pada elemen penggulir terdekat di atas `ref`, lalu mengembalikannya saat ditutup. */
export function useKunciGulir(aktif: boolean, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!aktif) return;
    let el: HTMLElement | null = ref.current?.parentElement ?? null;
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
    if (!el) return;
    const target = el;
    const prev = target.style.overflowY;
    target.style.overflowY = "hidden";
    return () => { target.style.overflowY = prev; };
  }, [aktif, ref]);
}
