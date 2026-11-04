import { useState } from "react";
import { X } from "lucide-react";
import { t } from "../../lib/theme";
import { bacaSiapa, simpanSiapa } from "../../lib/siapa";

/* Lembar "Siapa yang memakai HP ini?" — pilih sekali per HP, tanpa kata sandi.
   Nama ikut tercatat di Catatan Perubahan. Muncul otomatis di HP kasir yang belum punya nama (tidak bisa ditutup);
   dari Kantin → Pengguna bisa dibuka lagi untuk mengganti (bisa ditutup). */
const PILIHAN = ["Mama", "Papa", "Ching"];

export default function PilihNama({ onDone, bisaTutup }: { onDone: () => void; bisaTutup?: boolean }) {
  const [lain, setLain] = useState(() => { const n = bacaSiapa(); return n && !PILIHAN.includes(n) ? n : ""; });
  const pilih = (n: string) => { simpanSiapa(n); onDone(); };
  const lainOk = lain.trim().length >= 2;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 120, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={bisaTutup ? onDone : undefined} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.45)" }} />
      <div role="dialog" aria-label="Siapa yang memakai HP ini" style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", padding: "20px 20px 28px", boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.01em" }}>Siapa yang memakai HP ini?</div>
          {bisaTutup && (
            <button onClick={onDone} aria-label="Tutup" style={{ border: `1.5px solid ${t.border}`, background: t.surface, cursor: "pointer", color: t.text, width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center", flex: "none" }}><X size={17} /></button>
          )}
        </div>
        <div style={{ fontSize: 14.5, color: t.text2, marginBottom: 16 }}>Nama ini ikut tercatat di Catatan Perubahan.</div>
        <div className="flex gap-3" style={{ marginBottom: 14 }}>
          {PILIHAN.map((n) => (
            <button key={n} onClick={() => pilih(n)}
              style={{ flex: 1, height: 60, borderRadius: 14, border: "none", background: bacaSiapa() === n ? t.primary : t.primaryLight, color: t.onPrimary, fontWeight: 800, fontSize: 19, cursor: "pointer", fontFamily: "inherit" }}>
              {n}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.text2, marginBottom: 6 }}>Nama lain</div>
        <div className="flex gap-2">
          <input value={lain} onChange={(e) => setLain(e.target.value)} placeholder="Ketik nama" maxLength={30}
            style={{ flex: 1, minWidth: 0, height: 48, fontSize: 16, color: t.text, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "0 12px", fontFamily: "inherit", outline: "none" }} />
          <button onClick={() => lainOk && pilih(lain)} disabled={!lainOk}
            style={{ flex: "none", height: 48, padding: "0 20px", borderRadius: 12, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 15.5, cursor: lainOk ? "pointer" : "default", opacity: lainOk ? 1 : 0.45, fontFamily: "inherit" }}>
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
