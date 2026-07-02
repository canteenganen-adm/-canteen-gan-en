import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** false jika .env belum diisi — dicek di App.tsx supaya bisa tampilkan
 * pesan yang jelas alih-alih layar putih kosong. */
export const isSupabaseConfigured = Boolean(url && anonKey);

// Placeholder valid-format URL/key dipakai saat belum dikonfigurasi supaya
// createClient() tidak melempar error saat import (biar App.tsx yang
// menampilkan pesan, bukan layar putih Vite).
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder-anon-key"
);
