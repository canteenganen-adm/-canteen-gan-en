import { useEffect, useRef } from "react";
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

  // Gulir ke hari terpilih (tengah) saat dibuka / tanggal berubah
  useEffect(() => {
    const el = barisRef.current?.querySelector<HTMLElement>(`[data-hari="${nilai}"]`);
    if (el && barisRef.current) barisRef.current.scrollTo({ left: el.offsetLeft - barisRef.current.clientWidth / 2 + el.clientWidth / 2, behavior: "auto" });
  }, [nilai]);

  const [y, m] = nilai.split("-").map(Number);
  return (
    <div>
      <div className="flex items-center justify-between" style={{ padding: "0 2px 6px" }}>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: t.text2 }}>{BULAN[m - 1]} {y}</span>
        <div className="flex items-center" style={{ gap: 4 }}>
        {kanan}
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
      <div ref={barisRef} className="hscroll" style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", padding: "2px 0 6px", margin: "0 -4px" }}>
        {daftar.map((iso) => {
          const aktif = iso === nilai;
          const akhir = isAkhirPekan(iso);
          return (
            <button key={iso} data-hari={iso} onClick={() => onPilih(iso)} aria-pressed={aktif}
              aria-label={`${namaHari(iso)} ${Number(iso.slice(8))}`}
              style={{ flex: "none", width: 52, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "2px 0" }}>
              {/* Titik hari ini DI ATAS huruf hari (sesuai contoh Mama) */}
              <i style={{ width: 6, height: 6, borderRadius: "50%", background: iso === hariIni ? t.text : "transparent", display: "block" }} />
              <span style={{ fontSize: 12.5, fontWeight: aktif ? 800 : 600, color: aktif ? t.text : t.text2 }}>{namaHari(iso).slice(0, 1).toUpperCase()}</span>
              <span style={{ width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 17, fontWeight: aktif ? 800 : 700,
                background: aktif ? t.primary : "transparent", border: `1.5px solid ${aktif ? t.primary : t.border}`, color: akhir && !aktif ? t.text2 : t.text }}>
                {Number(iso.slice(8))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
