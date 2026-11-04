/* Siapa yang memakai HP ini — dipilih sekali per HP (tanpa kata sandi), dikirim ke Supabase di setiap permintaan lewat
   header x-ganen-siapa / x-ganen-hp, lalu dicatat trigger "catat_perubahan" (supabase/migration_15_catatan.sql). */

const K_SIAPA = "ganen_siapa";
const K_HP = "ganen_hp";

export const bacaSiapa = (): string => {
  try { return localStorage.getItem(K_SIAPA) || ""; } catch { return ""; }
};

export const simpanSiapa = (nama: string) => {
  try { localStorage.setItem(K_SIAPA, nama.trim().slice(0, 30)); } catch { /* penyimpanan diblokir: abaikan */ }
};

/** Kode acak per HP — membedakan dua HP yang memakai nama sama. */
export const kodeHp = (): string => {
  try {
    let v = localStorage.getItem(K_HP);
    if (!v) { v = Math.random().toString(36).slice(2, 8); localStorage.setItem(K_HP, v); }
    return v;
  } catch { return ""; }
};

/** Nama yang dikirim: nama pilihan HP; halaman orang tua (bukan kasir) = "Pemesan". */
export const namaUntukHeader = (): string => {
  const n = bacaSiapa();
  if (n) return n;
  return window.location.pathname.toLowerCase().startsWith("/dapur-gan-en") ? "" : "Pemesan";
};

/** Nama dari catatan (tersimpan URL-encoded) → teks biasa. */
export const bacaNamaCatatan = (s: string | null | undefined): string => {
  if (!s) return "";
  try { return decodeURIComponent(s); } catch { return s; }
};
