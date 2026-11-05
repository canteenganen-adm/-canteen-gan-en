import { useState } from "react";
import { Eye, EyeOff, CircleAlert } from "lucide-react";
import { t } from "../../lib/theme";
import { masuk } from "../../lib/auth";

/* Laman masuk kasir "Log in ke dapur" (pemilik 5 Nov, perintah-laman-masuk.md bagian 3). Semua akun sama, tanpa daftar nama.
   Kata sandi = huruf + angka (akun lama dengan sandi angka tetap bisa masuk). Galat sengaja sama untuk nama salah dan sandi salah.
   Berhasil → muat ulang halaman (sesi sudah tersimpan). */
const MIN_PIN = 6; // batas minimal kata sandi Supabase

export default function MasukKasir() {
  const [nama, setNama] = useState("");
  const [sandi, setSandi] = useState("");
  const [lihat, setLihat] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");
  const siap = nama.trim().length >= 2 && sandi.length >= MIN_PIN;

  const kirim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sibuk || !siap) return;
    setSibuk(true); setGalat("");
    const r = await masuk(nama, sandi);
    if (r.ok) { window.location.reload(); return; }
    setGalat(r.pesan); setSibuk(false);
  };

  const label: React.CSSProperties = { display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8 };
  const kotak: React.CSSProperties = { width: "100%", height: 54, fontSize: 16.5, color: t.text, background: t.surface, border: "none", borderRadius: 14, padding: "0 16px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ minHeight: "100dvh", background: t.bg, color: t.text, display: "flex", justifyContent: "center", padding: "72px 24px 70px", boxSizing: "border-box", position: "relative", WebkitFontSmoothing: "antialiased" }}>
      <form onSubmit={kirim} style={{ width: "100%", maxWidth: 380 }}>
        <style>{`.masuk-isian::placeholder{color:${t.textDis}}.masuk-isian:-webkit-autofill,.masuk-isian:-webkit-autofill:focus{-webkit-box-shadow:0 0 0 60px ${t.surface} inset;-webkit-text-fill-color:${t.text};caret-color:${t.text}}`}</style>
        <div style={{ width: 76, height: 76, borderRadius: 999, background: t.primaryLight, overflow: "hidden", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <img src="/brand/panda.webp" alt="" width={80} height={80} loading="eager" decoding="async" style={{ height: 80, width: "auto" }} />
        </div>
        <div style={{ marginTop: 14, fontSize: 14, color: t.text2 }}>Canteen Gan En</div>
        <div style={{ marginTop: 10, fontSize: 30, fontWeight: 800, letterSpacing: "-.6px", lineHeight: 1.1 }}>Log in ke dapur</div>
        <div style={{ marginTop: 6, fontSize: 14, color: t.text2 }}>Masakan sehangat pelukan Ibu</div>

        <div style={{ marginTop: 40 }}>
          <label htmlFor="masuk-nama" style={label}>Nama</label>
          <input id="masuk-nama" className="masuk-isian" value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Nama akun" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" style={kotak} />
        </div>

        <div style={{ marginTop: 20 }}>
          <label htmlFor="masuk-sandi" style={{ ...label, color: galat ? t.error : t.text }}>Kata sandi</label>
          <div style={{ position: "relative" }}>
            <input id="masuk-sandi" className="masuk-isian" type={lihat ? "text" : "password"} value={sandi}
              onChange={(e) => { setSandi(e.target.value); if (galat) setGalat(""); }} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              style={{ ...kotak, paddingRight: 52, letterSpacing: lihat ? undefined : ".22em", ...(galat ? { background: t.errorBg, boxShadow: `inset 0 0 0 1.5px ${t.error}`, color: t.error } : null) }} />
            <button type="button" onClick={() => setLihat((v) => !v)} aria-label={lihat ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
              style={{ position: "absolute", right: 2, top: 5, width: 44, height: 44, border: "none", background: "transparent", color: galat ? t.error : t.text2, cursor: "pointer", display: "grid", placeItems: "center" }}>
              {lihat ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {galat && (
            <div role="alert" className="flex items-center" style={{ gap: 6, marginTop: 8, color: t.error, fontWeight: 600, fontSize: 14 }}>
              <CircleAlert size={17} style={{ flex: "none" }} /> Nama atau kata sandi salah. Coba lagi.
            </div>
          )}
        </div>

        <button type="submit" disabled={sibuk || !siap}
          style={{ width: "100%", height: 56, marginTop: 30, borderRadius: 16, border: "none", background: siap ? t.primary : t.primaryLight, color: siap ? t.onPrimary : t.textDis, fontWeight: 800, fontSize: 16.5, cursor: sibuk || !siap ? "default" : "pointer", fontFamily: "inherit" }}>
          {sibuk ? "Memeriksa…" : "Masuk"}
        </button>
      </form>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 34, textAlign: "center", fontSize: 13, color: t.textDis }}>Selamat datang!</div>
    </div>
  );
}
