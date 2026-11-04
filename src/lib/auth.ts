import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { setNamaSesi } from "./siapa";

/* LOGIN KASIR (pemilik 4 Nov): halaman kosong dengan kolom NAMA dan KATA SANDI (tanpa email di layar). Di balik layar tiap nama = satu akun
   Supabase Auth dengan email palsu `<nama>@kantin.gan-en.app` (tidak pernah dikirimi email; akun dibuat pemilik di dashboard dengan Auto Confirm).
   Sesi disimpan di browser dan diperbarui otomatis: muat ulang / tutup-buka TIDAK meminta kata sandi lagi.
   DIRILIS BERTAHAP: login hanya diwajibkan bila variabel Vercel VITE_WAJIB_LOGIN=1 (bawaan: mati → perilaku lama tidak berubah). */

export const WAJIB_LOGIN = import.meta.env.VITE_WAJIB_LOGIN === "1";
const DOMAIN = "kantin.gan-en.app";

export const emailDariNama = (nama: string) => `${nama.trim().toLowerCase().replace(/[^a-z0-9]+/g, "")}@${DOMAIN}`;

const namaDari = (s: Session | null): string | null => {
  if (!s) return null;
  const meta = (s.user.user_metadata as { nama?: string } | undefined)?.nama;
  if (meta) return meta;
  const lokal = (s.user.email ?? "").split("@")[0];
  return lokal ? lokal.charAt(0).toUpperCase() + lokal.slice(1) : null;
};

export async function masuk(nama: string, sandi: string): Promise<{ ok: true } | { ok: false; pesan: string }> {
  if (nama.trim().length < 2 || sandi.length < 1) return { ok: false, pesan: "Isi nama dan kata sandi." };
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: emailDariNama(nama), password: sandi });
    if (error) {
      if (/invalid login|credentials/i.test(error.message)) return { ok: false, pesan: "Nama atau kata sandi salah." };
      return { ok: false, pesan: "Gagal masuk. Periksa internet lalu coba lagi." };
    }
    return { ok: true };
  } catch {
    return { ok: false, pesan: "Gagal masuk. Periksa internet lalu coba lagi." };
  }
}

export async function keluar() {
  try { await supabase.auth.signOut(); } catch { /* tetap lanjut: sesi lokal dibersihkan di bawah */ }
  setNamaSesi("");
}

/** Status sesi: `siap` = pembacaan awal selesai; `nama` = nama pengguna bila sudah masuk. */
export function useSesi() {
  const [s, setS] = useState<{ siap: boolean; nama: string | null }>({ siap: false, nama: null });
  useEffect(() => {
    let hidup = true;
    const pakai = (sesi: Session | null) => {
      const n = namaDari(sesi);
      setNamaSesi(n ?? "");
      if (hidup) setS({ siap: true, nama: n });
    };
    supabase.auth.getSession().then(({ data }) => pakai(data.session)).catch(() => pakai(null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sesi) => pakai(sesi));
    return () => { hidup = false; sub.subscription.unsubscribe(); };
  }, []);
  return s;
}
