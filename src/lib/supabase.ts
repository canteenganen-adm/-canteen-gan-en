import { createClient } from "@supabase/supabase-js";
import { namaUntukHeader, kodeHp } from "./siapa";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** false jika .env belum diisi — dicek di App.tsx supaya bisa tampilkan
 * pesan yang jelas alih-alih layar putih kosong. */
export const isSupabaseConfigured = Boolean(url && anonKey);

/** Setiap permintaan membawa nama + kode HP (dibaca trigger catatan perubahan di Supabase). Gagal membaca = tetap kirim tanpa header. */
const fetchBertanda: typeof fetch = (input, init) => {
  try {
    const h = new Headers(init?.headers);
    const nama = namaUntukHeader();
    if (nama) h.set("x-ganen-siapa", encodeURIComponent(nama));
    const hp = kodeHp();
    if (hp) h.set("x-ganen-hp", hp);
    return fetch(input, { ...init, headers: h });
  } catch {
    return fetch(input, init);
  }
};

// Placeholder valid-format URL/key dipakai saat belum dikonfigurasi supaya
// createClient() tidak melempar error saat import (biar App.tsx yang
// menampilkan pesan, bukan layar putih Vite).
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder-anon-key",
  { global: { fetch: fetchBertanda } }
);
