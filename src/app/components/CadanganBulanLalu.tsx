import { useState } from "react";
import { FileSpreadsheet, Check } from "lucide-react";
import { t } from "../../lib/theme";

/* Pengingat "Unduh laporan bulan lalu" di tab Kantin. Excel lengkap (semua transaksi bulan itu) = cadangan data.
   Tampil selama bulan lalu belum diunduh DI HP INI (tanda disimpan di localStorage per bulan); tidak menghapus apa pun. */

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const kunci = (y: number, m: number) => `ganen_cadangan_${y}-${m + 1}`;
const sudah = (y: number, m: number) => { try { return localStorage.getItem(kunci(y, m)) === "1"; } catch { return false; } };

export default function CadanganBulanLalu() {
  const now = new Date(Date.now() + 7 * 3_600_000); // WIB
  const m = (now.getUTCMonth() + 11) % 12;
  const y = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [selesai, setSelesai] = useState(() => sudah(y, m));
  const [baruSaja, setBaruSaja] = useState(false);

  const unduh = async () => {
    setBusy(true); setErr(false);
    try {
      const { unduhExcelBulan } = await import("../screens/Laporan");
      await unduhExcelBulan(y, m);
      try { localStorage.setItem(kunci(y, m), "1"); } catch { /* tanpa penyimpanan: pengingat muncul lagi, tidak masalah */ }
      setBaruSaja(true);
      setTimeout(() => setSelesai(true), 4000);
    } catch { setErr(true); }
    setBusy(false);
  };

  if (selesai) return null;
  return (
    /* SATU baris tipis (bukan kartu besar): ikon · "Excel {bulan} belum diunduh" · tombol kecil Unduh */
    <div style={{ marginBottom: 12 }}>
      <div className="flex items-center gap-3" style={{ minHeight: 52, padding: "0 6px 0 4px" }}>
        <span style={{ color: baruSaja ? t.successText : t.text2, display: "grid", placeItems: "center", flex: "none" }}>
          {baruSaja ? <Check size={20} /> : <FileSpreadsheet size={20} />}
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700 }}>
          {baruSaja ? "Excel tersimpan. Cek folder Unduhan." : `Excel ${BULAN[m]} belum diunduh`}
        </span>
        {!baruSaja && (
          <button onClick={unduh} disabled={busy}
            style={{ flex: "none", height: 44, padding: "0 16px", borderRadius: 12, border: "none", background: t.primaryLight, color: t.onPrimary, fontWeight: 800, fontSize: 14.5, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.7 : 1 }}>
            {busy ? "Membuat…" : "Unduh"}
          </button>
        )}
      </div>
      {err && <div style={{ fontSize: 14, color: t.error, padding: "0 4px" }}>Gagal. Periksa koneksi lalu coba lagi.</div>}
    </div>
  );
}
