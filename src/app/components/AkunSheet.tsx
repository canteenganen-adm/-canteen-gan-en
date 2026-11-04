import { X } from "lucide-react";
import { t } from "../../lib/theme";
import { keluar } from "../../lib/auth";
import { namaUntukHeader } from "../../lib/siapa";

/* Lembar akun (hanya bila login diwajibkan): "Masuk sebagai {nama}" + tombol Keluar. Keluar → halaman masuk. */
export default function AkunSheet({ onClose }: { onClose: () => void }) {
  const pergi = async () => { await keluar(); window.location.reload(); };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 120, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.45)" }} />
      <div role="dialog" aria-label="Akun" style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", padding: "20px 20px 28px", boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Masuk sebagai {namaUntukHeader() || "—"}</div>
          <button onClick={onClose} aria-label="Tutup" style={{ border: `1.5px solid ${t.border}`, background: t.surface, cursor: "pointer", color: t.text, width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center", flex: "none" }}><X size={17} /></button>
        </div>
        <div style={{ fontSize: 14.5, color: t.text2, marginBottom: 18 }}>Nama ini tercatat di Catatan Perubahan.</div>
        <button onClick={pergi}
          style={{ width: "100%", height: 54, borderRadius: 14, border: `1.5px solid ${t.border}`, background: t.surface, color: t.error, fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>
          Keluar
        </button>
      </div>
    </div>
  );
}
