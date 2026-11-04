import { useState } from "react";
import { FileSpreadsheet, Check, X } from "lucide-react";
import { t } from "../../lib/theme";
import { sudahDiunduh, tandaiSudahDiunduh } from "../../lib/cadangan";

/* Pengingat "Unduh laporan bulan lalu" di tab Kantin (baris pertama kartu Perhatian). Excel lengkap (semua transaksi bulan itu) = cadangan data.
   Tampil selama bulan lalu belum diunduh DI HP INI. Penanda terisi dari jalur unduh MANA PUN (lib/cadangan.ts), atau lewat tombol X; tidak menghapus apa pun. */

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export default function CadanganBulanLalu() {
  const now = new Date(Date.now() + 7 * 3_600_000); // WIB
  const m = (now.getUTCMonth() + 11) % 12;
  const y = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [selesai, setSelesai] = useState(() => sudahDiunduh(y, m));
  const [baruSaja, setBaruSaja] = useState(false);

  const unduh = async () => {
    setBusy(true); setErr(false);
    try {
      const { unduhExcelBulan } = await import("../screens/Laporan");
      await unduhExcelBulan(y, m); // menandai bulan ini selesai sendiri
      setBaruSaja(true);
      setTimeout(() => setSelesai(true), 4000);
    } catch { setErr(true); }
    setBusy(false);
  };
  const tutup = () => { tandaiSudahDiunduh(y, m); setSelesai(true); };

  if (selesai) return null;
  return (
    <div>
      <div className="flex items-center gap-3" style={{ minHeight: 60, padding: "0 4px" }}>
        <span style={{ color: baruSaja ? t.successText : t.text2, display: "grid", placeItems: "center", flex: "none", width: 24 }}>
          {baruSaja ? <Check size={20} /> : <FileSpreadsheet size={20} />}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14.5, fontWeight: 700 }}>{baruSaja ? "Excel tersimpan" : `Excel ${BULAN[m]}`}</span>
          <span style={{ display: "block", fontSize: 13, color: t.text2, marginTop: 1 }}>{baruSaja ? "Cek folder Unduhan" : "belum diunduh"}</span>
        </span>
        {!baruSaja && (
          <>
            <button onClick={unduh} disabled={busy}
              style={{ flex: "none", height: 40, padding: "0 16px", borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 800, fontSize: 14, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.7 : 1 }}>
              {busy ? "Membuat…" : "Unduh"}
            </button>
            <button onClick={tutup} aria-label="Sudah diunduh, tutup pengingat"
              style={{ flex: "none", width: 40, height: 40, border: "none", background: "transparent", color: t.text2, cursor: "pointer", display: "grid", placeItems: "center" }}>
              <X size={18} />
            </button>
          </>
        )}
      </div>
      {err && <div style={{ fontSize: 14, color: t.error, padding: "0 4px 10px" }}>Gagal. Periksa koneksi lalu coba lagi.</div>}
    </div>
  );
}
