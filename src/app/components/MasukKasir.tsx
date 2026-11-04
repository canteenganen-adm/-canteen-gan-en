import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { t } from "../../lib/theme";
import { masuk } from "../../lib/auth";

/* Halaman masuk kasir: halaman KOSONG, hanya nama + kata sandi (pilihan pemilik 4 Nov). Nama bisa diketik atau diketuk dari tombol Mama / Papa / Ching.
   Berhasil → muat ulang halaman (sesi sudah tersimpan, jadi langsung masuk dan data dimuat dengan hak kasir). */
const NAMA = ["Mama", "Papa", "Ching"];

export default function MasukKasir() {
  const [nama, setNama] = useState("");
  const [sandi, setSandi] = useState("");
  const [lihat, setLihat] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");

  const kirim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sibuk) return;
    setSibuk(true); setGalat("");
    const r = await masuk(nama, sandi);
    if (r.ok) { window.location.reload(); return; }
    setGalat(r.pesan); setSibuk(false);
  };
  const isian: React.CSSProperties = { width: "100%", height: 54, fontSize: 17, color: t.text, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 14, padding: "0 14px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ minHeight: "100dvh", background: t.bg, color: t.text, display: "flex", justifyContent: "center", padding: "56px 24px 32px" }}>
      <form onSubmit={kirim} style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em" }}>Masuk</div>
        <div style={{ fontSize: 16, color: t.text2, margin: "6px 0 28px" }}>Kantin Gan En</div>

        <div className="flex gap-2" style={{ marginBottom: 12 }}>
          {NAMA.map((n) => (
            <button key={n} type="button" onClick={() => setNama(n)} aria-pressed={nama === n}
              style={{ flex: 1, height: 48, borderRadius: 12, border: "none", background: nama === n ? t.primary : t.primaryLight, color: t.onPrimary, fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>
              {n}
            </button>
          ))}
        </div>

        <label htmlFor="masuk-nama" style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: t.text2, margin: "6px 0" }}>Nama</label>
        <input id="masuk-nama" value={nama} onChange={(e) => setNama(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" style={isian} />

        <label htmlFor="masuk-sandi" style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: t.text2, margin: "16px 0 6px" }}>Kata sandi</label>
        <div style={{ position: "relative" }}>
          <input id="masuk-sandi" type={lihat ? "text" : "password"} value={sandi} onChange={(e) => setSandi(e.target.value)} autoComplete="current-password" style={{ ...isian, paddingRight: 52 }} />
          <button type="button" onClick={() => setLihat((v) => !v)} aria-label={lihat ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
            style={{ position: "absolute", right: 4, top: 3, width: 48, height: 48, border: "none", background: "transparent", color: t.text2, cursor: "pointer", display: "grid", placeItems: "center" }}>
            {lihat ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>

        {galat && <div role="alert" style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, background: t.errorBg, color: t.error, fontWeight: 700, fontSize: 15 }}>{galat}</div>}

        <button type="submit" disabled={sibuk}
          style={{ width: "100%", height: 58, marginTop: 24, borderRadius: 14, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 18, cursor: sibuk ? "default" : "pointer", opacity: sibuk ? 0.7 : 1, fontFamily: "inherit" }}>
          {sibuk ? "Memeriksa…" : "Masuk"}
        </button>
      </form>
    </div>
  );
}
