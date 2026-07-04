import type { RefObject } from "react";

/** Buka date/time picker native secara eksplisit — tidak bergantung pada
 * di mana tepatnya pengguna klik di dalam input, supaya kartu/tombol
 * pembungkusnya bisa jadi pemicu di SELURUH area (bukan cuma ikon/angka
 * kecil). showPicker() bila didukung, fallback ke focus()+click().
 * Dipakai untuk semua widget tanggal & jam: Tanggal Layanan, Ganti
 * Tanggal, Jam Tutup Otomatis. */
export function openPicker(ref: RefObject<HTMLInputElement | null>) {
  const el = ref.current;
  if (!el) return;
  const withPicker = el as HTMLInputElement & { showPicker?: () => void };
  if (typeof withPicker.showPicker === "function") {
    try { withPicker.showPicker(); return; } catch { /* fall through to click() */ }
  }
  el.focus();
  el.click();
}
