import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { t } from "../../lib/theme";
import { masuk } from "../../lib/auth";

/* Halaman masuk kasir — BERSIH, tanpa logo/kartu, rata kiri (pemilik 4 Nov). Seperti Netflix: pengguna MENGETIK NAMANYA SENDIRI dan PIN angka;
   TIDAK ada daftar nama / tombol nama / ingatan nama terakhir (daftar nama = petunjuk gratis untuk penyerang).
   Pesan galat sengaja sama untuk nama salah maupun PIN salah. Peramban boleh mengisi otomatis (autoComplete) di perangkat pemilik sendiri.
   Berhasil → muat ulang halaman (sesi sudah tersimpan, jadi langsung masuk). */
const MIN_PIN = 6; // batas minimal kata sandi Supabase

export default function MasukKasir() {
  const [nama, setNama] = useState("");
  const [pin, setPin] = useState("");
  const [lihat, setLihat] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");
  const siap = nama.trim().length >= 2 && pin.length >= MIN_PIN;

  const kirim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sibuk || !siap) return;
    setSibuk(true); setGalat("");
    const r = await masuk(nama, pin);
    if (r.ok) { window.location.reload(); return; }
    setGalat(r.pesan); setSibuk(false);
  };

  const label: React.CSSProperties = { display: "block", fontSize: 13.5, fontWeight: 700, color: t.text2, marginBottom: 4 };
  const garisBawah: React.CSSProperties = { width: "100%", height: 52, fontSize: 20, color: t.text, background: "transparent", border: "none", borderBottom: `2px solid ${t.text}`, borderRadius: 0, padding: "0 0 2px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ minHeight: "100dvh", background: t.bg, color: t.text, display: "flex", justifyContent: "center", padding: "88px 28px 32px" }}>
      <form onSubmit={kirim} style={{ width: "100%", maxWidth: 380 }}>
        {/* Judul = nama kantin; kata "Masuk" hanya di tombol (pemilik 4 Nov: "kebanyakan masuk") */}
        <style>{`.masuk-isian:-webkit-autofill,.masuk-isian:-webkit-autofill:focus{-webkit-box-shadow:0 0 0 60px ${t.bg} inset;-webkit-text-fill-color:${t.text};caret-color:${t.text}}`}</style>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-.025em", lineHeight: 1.1 }}>Kantin Gan En</div>

        <div style={{ marginTop: 52 }}>
          <label htmlFor="masuk-nama" style={label}>Nama</label>
          <input id="masuk-nama" className="masuk-isian" value={nama} onChange={(e) => setNama(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" style={garisBawah} />
        </div>

        <div style={{ marginTop: 28 }}>
          <label htmlFor="masuk-pin" style={label}>PIN</label>
          <div style={{ position: "relative" }}>
            <input id="masuk-pin" className="masuk-isian" type={lihat ? "text" : "password"} inputMode="numeric" pattern="[0-9]*" maxLength={12} value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} autoComplete="current-password"
              style={{ ...garisBawah, paddingRight: 48, letterSpacing: lihat ? ".12em" : undefined }} />
            <button type="button" onClick={() => setLihat((v) => !v)} aria-label={lihat ? "Sembunyikan PIN" : "Lihat PIN"}
              style={{ position: "absolute", right: -6, top: 2, width: 48, height: 48, border: "none", background: "transparent", color: t.text2, cursor: "pointer", display: "grid", placeItems: "center" }}>
              {lihat ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        {galat && <div role="alert" style={{ marginTop: 16, color: t.error, fontWeight: 700, fontSize: 15 }}>{galat}</div>}

        <button type="submit" disabled={sibuk || !siap}
          style={{ width: "100%", height: 58, marginTop: 34, borderRadius: 15, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 18, cursor: sibuk || !siap ? "default" : "pointer", opacity: sibuk || !siap ? 0.55 : 1, fontFamily: "inherit" }}>
          {sibuk ? "Memeriksa…" : "Masuk"}
        </button>
        <div style={{ fontSize: 13.5, color: t.text2, marginTop: 16 }}>Cukup sekali per gadget. Muat ulang tidak meminta PIN lagi.</div>
      </form>
    </div>
  );
}
