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
  const nama = `${BULAN[m]} ${y}`;
  return (
    <div style={{ border: `1.5px solid ${t.border}`, borderRadius: 18, padding: "14px 16px", marginBottom: 12, background: t.surface }}>
      <div className="flex items-center gap-3">
        <span style={{ width: 40, height: 40, borderRadius: "50%", background: baruSaja ? t.successBg : t.primaryLight, display: "grid", placeItems: "center", flex: "none", color: baruSaja ? t.successText : t.text }}>
          {baruSaja ? <Check size={20} /> : <FileSpreadsheet size={20} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{baruSaja ? "Laporan tersimpan" : `Laporan ${nama}`}</div>
          <div style={{ fontSize: 14, color: t.text2, marginTop: 1 }}>{baruSaja ? "Cek folder Unduhan." : "Belum diunduh. Simpan sebagai cadangan."}</div>
        </div>
      </div>
      {!baruSaja && (
        <>
          <button onClick={unduh} disabled={busy}
            style={{ width: "100%", height: 48, marginTop: 12, borderRadius: 12, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 15.5, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.7 : 1 }}>
            {busy ? "Membuat file…" : "Unduh Excel"}
          </button>
          {err && <div style={{ fontSize: 14, color: t.error, marginTop: 8 }}>Gagal. Periksa koneksi lalu coba lagi.</div>}
        </>
      )}
    </div>
  );
}
