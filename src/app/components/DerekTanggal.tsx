import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { t } from "../../lib/theme";
import { namaHari, isAkhirPekan } from "../../lib/pekan";

/* Deretan hari yang digeser kiri-kanan (gaya Flo): bulan di atas, tiap hari = singkatan + bulatan angka.
   Dipilih = bulatan kuning, hari ini = titik kecil, Sabtu/Minggu lebih redup. Ketuk ikon kalender = pemilih tanggal biasa
   untuk tanggal yang jauh. Dipakai di tab Menu (tanggal menu yang diatur). */

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const geser = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function DerekTanggal({ nilai, hariIni, awal, depan = 35, onPilih, kanan }: { nilai: string; hariIni: string; awal: string; depan?: number; onPilih: (iso: string) => void; kanan?: React.ReactNode }) {
  // Dari `awal` (hari pertama operasional) sampai `depan` hari setelah hari ini — digeser kiri-kanan.
  const akhir = geser(hariIni, depan);
  const daftar: string[] = [];
  for (let d = awal < nilai ? awal : nilai; d <= akhir && daftar.length < 1000; d = geser(d, 1)) daftar.push(d);
  if (!daftar.includes(nilai)) { daftar.push(nilai); daftar.sort(); }
  const barisRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Hari yang sedang ada di TENGAH layar → menentukan nama bulan di atas (berganti saat digeser ke bulan lain)
  const [tengah, setTengah] = useState(nilai);
  const rafRef = useRef(0);
  const saatGeser = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = barisRef.current;
      if (!el) return;
      const idx = Math.max(0, Math.min(daftar.length - 1, Math.floor((el.scrollLeft + el.clientWidth / 2) / 58)));
      setTengah(daftar[idx]);
    });
  };

  // Gulir ke hari terpilih (tengah) saat dibuka / tanggal berubah / tombol kembali ditekan
  const keHari = (iso: string, halus = false) => {
    const el = barisRef.current?.querySelector<HTMLElement>(`[data-hari="${iso}"]`);
    if (el && barisRef.current) barisRef.current.scrollTo({ left: el.offsetLeft - barisRef.current.clientWidth / 2 + el.clientWidth / 2, behavior: halus ? "smooth" : "auto" });
  };
  useEffect(() => {
    setTengah(nilai);
    keHari(nilai);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nilai]);
  // Petunjuk saat digeser jauh: hari ini keluar dari pandangan → tombol "Hari ini" (menggulir ke hari ini);
  // hari yang dipilih keluar dari pandangan → tombol "Kembali" (menggulir ke hari terpilih).
  const idxTengah = daftar.indexOf(tengah);
  const hariIniJauh = daftar.includes(hariIni) && Math.abs(idxTengah - daftar.indexOf(hariIni)) > 3;
  const terpilihJauh = Math.abs(idxTengah - daftar.indexOf(nilai)) > 3;
  const tujuanKembali = hariIniJauh ? hariIni : terpilihJauh ? nilai : null;

  const [y, m] = tengah.split("-").map(Number);
  return (
    <div>
      <div className="flex items-center justify-between" style={{ padding: "0 2px 6px" }}>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: t.text }}>{BULAN[m - 1]} {y}</span>
        <div className="flex items-center" style={{ gap: 4 }}>
        {kanan ?? (tujuanKembali ? (
          <button onClick={() => keHari(tujuanKembali, true)} aria-label={tujuanKembali === hariIni ? "Ke hari ini" : "Kembali ke tanggal terpilih"}
            style={{ flex: "none", height: 36, padding: "0 12px", borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}>
            {tujuanKembali === hariIni ? "Hari ini" : "Kembali"}
          </button>
        ) : null)}
        <div style={{ position: "relative", width: 44, height: 36, display: "grid", placeItems: "center", color: t.text2 }}>
          <Calendar size={19} />
          <input ref={inputRef} type="date" value={nilai} min={awal}
            onChange={(e) => e.target.value && onPilih(e.target.value)}
            onClick={() => { try { inputRef.current?.showPicker?.(); } catch { /* picker native */ } }}
            aria-label="Pilih tanggal lain"
            style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
        </div>
        </div>
      </div>
      <div ref={barisRef} className="hscroll" onScroll={saatGeser} style={{ position: "relative", display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", padding: "2px 0 6px", margin: "0 -4px" }}>
        {daftar.map((iso) => {
          const aktif = iso === nilai;
          const akhir = isAkhirPekan(iso);
          return (
            <button key={iso} data-hari={iso} onClick={() => onPilih(iso)} aria-pressed={aktif}
              aria-label={`${namaHari(iso)} ${Number(iso.slice(8))}`}
              style={{ flex: "none", width: 52, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "2px 0" }}>
              <span style={{ fontSize: 12.5, fontWeight: aktif ? 800 : 600, color: aktif ? t.text : t.text2 }}>{namaHari(iso).slice(0, 1).toUpperCase()}</span>
              <span style={{ position: "relative", width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 17, fontWeight: aktif ? 800 : 700,
                background: aktif ? t.primary : "transparent", border: `1.5px solid ${aktif ? t.primary : t.border}`, color: akhir && !aktif ? t.text2 : t.text }}>
                {Number(iso.slice(8))}
                {/* Titik hari ini: di KANAN ATAS bulatan, merapat ke garis (permintaan Mama/pemilik) */}
                {iso === hariIni && <i style={{ position: "absolute", top: 1, right: 1, width: 9, height: 9, borderRadius: "50%", background: t.text, display: "block" }} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
