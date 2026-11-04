import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { t } from "../../lib/theme";
import { masuk } from "../../lib/auth";

/* Halaman masuk kasir — BERSIH (pemilik 4 Nov: "gamau logo, buat jadi clean"): tanpa logo, tanpa kartu, rata kiri.
   Judul · nama kantin kecil · saklar nama (Mama / Papa / Ching / Lain) · kata sandi bergaris bawah · satu tombol kuning.
   Nama terakhir diingat per HP (bukan rahasia). Berhasil → muat ulang halaman (sesi sudah tersimpan, jadi langsung masuk). */
const NAMA = ["Mama", "Papa", "Ching"];
const KUNCI = "ganen_masuk_nama";
const bacaTerakhir = (): string => { try { return localStorage.getItem(KUNCI) || ""; } catch { return ""; } };

export default function MasukKasir() {
  const terakhir = bacaTerakhir();
  const [pilih, setPilih] = useState<string>(NAMA.includes(terakhir) ? terakhir : terakhir ? "Lain" : "");
  const [lain, setLain] = useState(terakhir && !NAMA.includes(terakhir) ? terakhir : "");
  const [sandi, setSandi] = useState("");
  const [lihat, setLihat] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");
  const nama = pilih === "Lain" ? lain : pilih;

  const kirim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sibuk) return;
    setSibuk(true); setGalat("");
    const r = await masuk(nama, sandi);
    if (r.ok) {
      try { localStorage.setItem(KUNCI, nama.trim()); } catch { /* tanpa penyimpanan: tidak masalah */ }
      window.location.reload();
      return;
    }
    setGalat(r.pesan); setSibuk(false);
  };

  const label: React.CSSProperties = { display: "block", fontSize: 13.5, fontWeight: 700, color: t.text2, marginBottom: 4 };
  const garisBawah: React.CSSProperties = { width: "100%", height: 52, fontSize: 20, color: t.text, background: "transparent", border: "none", borderBottom: `2px solid ${t.text}`, borderRadius: 0, padding: "0 0 2px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ minHeight: "100dvh", background: t.bg, color: t.text, display: "flex", justifyContent: "center", padding: "88px 28px 32px" }}>
      <form onSubmit={kirim} style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-.025em", lineHeight: 1.1 }}>Masuk</div>
        <div style={{ fontSize: 16, color: t.text2, marginTop: 6 }}>Kantin Gan En</div>

        <div role="radiogroup" aria-label="Nama" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 14, background: t.divider, marginTop: 40 }}>
          {[...NAMA, "Lain"].map((n) => {
            const aktif = pilih === n;
            return (
              <button key={n} type="button" role="radio" aria-checked={aktif} onClick={() => setPilih(n)}
                style={{ flex: 1, height: 46, borderRadius: 11, border: aktif ? `1.5px solid ${t.border}` : "1.5px solid transparent", background: aktif ? t.surface : "transparent", color: aktif ? t.text : t.text2, fontWeight: aktif ? 800 : 600, fontSize: 15.5, cursor: "pointer", fontFamily: "inherit" }}>
                {n}
              </button>
            );
          })}
        </div>

        {pilih === "Lain" && (
          <div style={{ marginTop: 26 }}>
            <label htmlFor="masuk-nama" style={label}>Nama</label>
            <input id="masuk-nama" value={lain} onChange={(e) => setLain(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" style={garisBawah} />
          </div>
        )}

        <div style={{ marginTop: 26 }}>
          <label htmlFor="masuk-sandi" style={label}>Kata sandi</label>
          <div style={{ position: "relative" }}>
            <input id="masuk-sandi" type={lihat ? "text" : "password"} value={sandi} onChange={(e) => setSandi(e.target.value)} autoComplete="current-password" style={{ ...garisBawah, paddingRight: 48 }} />
            <button type="button" onClick={() => setLihat((v) => !v)} aria-label={lihat ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
              style={{ position: "absolute", right: -6, top: 2, width: 48, height: 48, border: "none", background: "transparent", color: t.text2, cursor: "pointer", display: "grid", placeItems: "center" }}>
              {lihat ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        {galat && <div role="alert" style={{ marginTop: 16, color: t.error, fontWeight: 700, fontSize: 15 }}>{galat}</div>}

        <button type="submit" disabled={sibuk || !nama.trim() || !sandi}
          style={{ width: "100%", height: 58, marginTop: 34, borderRadius: 15, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 18, cursor: sibuk ? "default" : "pointer", opacity: sibuk || !nama.trim() || !sandi ? 0.55 : 1, fontFamily: "inherit" }}>
          {sibuk ? "Memeriksa…" : "Masuk"}
        </button>
        <div style={{ fontSize: 13.5, color: t.text2, marginTop: 16 }}>Cukup sekali per HP. Muat ulang tidak meminta kata sandi lagi.</div>
      </form>
    </div>
  );
}
