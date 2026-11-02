import { useEffect, useRef } from "react";
import { Calendar } from "lucide-react";
import { t } from "../../lib/theme";
import { mondayOf } from "../../lib/pekan";

/* Deretan hari MINGGUAN (meniru gaya Flo): tampil SATU minggu (Senin–Minggu, 7 kolom penuh), judul di tengah = tanggal yang dipilih
   ("2 Nov 2026"). Ketuk hari = pilih (bulatan kuning berpindah halus). Geser kiri/kanan = pindah
   SATU MINGGU per geseran (snap) dan tanggal terpilih ikut pindah ±7 hari di hari yang sama (Senin tetap Senin). Ikon kalender di kanan
   = pemilih tanggal biasa untuk tanggal yang jauh. Dipakai di tab Menu. */

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const HURUF = ["S", "S", "R", "K", "J", "S", "M"]; // Senin … Minggu
const geser = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function DerekTanggal({ nilai, hariIni, awal, depan = 35, onPilih, kanan, kiri }: { nilai: string; hariIni: string; awal: string; depan?: number; onPilih: (iso: string) => void; kanan?: React.ReactNode; kiri?: React.ReactNode }) {
  // Daftar minggu: dari minggu `awal` (hari pertama operasional) sampai `depan` hari setelah hari ini
  const minggu: string[] = [];
  const awalSenin = mondayOf(awal < nilai ? awal : nilai);
  const akhirSenin = mondayOf(geser(hariIni, depan) > nilai ? geser(hariIni, depan) : nilai);
  for (let s = awalSenin; s <= akhirSenin && minggu.length < 400; s = geser(s, 7)) minggu.push(s);

  const idxMinggu = (iso: string) => minggu.indexOf(mondayOf(iso));
  const offset = (iso: string) => Math.round((new Date(iso + "T00:00:00").getTime() - new Date(mondayOf(iso) + "T00:00:00").getTime()) / 86_400_000);

  const barisRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nilaiRef = useRef(nilai);
  nilaiRef.current = nilai;
  const programatik = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const keMinggu = (i: number, halus: boolean) => {
    const el = barisRef.current;
    if (!el) return;
    programatik.current = true;
    // Gulir halus hanya untuk 1 minggu; lompatan jauh langsung (snap-stop "always" menghentikan gulir halus di minggu pertama yang dilewati)
    const dekat = Math.abs(i - Math.round(el.scrollLeft / (el.clientWidth || 1))) <= 1;
    el.scrollTo({ left: i * el.clientWidth, behavior: halus && dekat ? "smooth" : "auto" });
    setTimeout(() => { programatik.current = false; }, halus ? 450 : 80);
  };

  // Tanggal terpilih berubah (ketuk / tombol Hari ini / dibuka pertama kali) → gulir ke minggunya
  useEffect(() => {
    const i = idxMinggu(nilai);
    const el = barisRef.current;
    if (i >= 0 && el && Math.round(el.scrollLeft / (el.clientWidth || 1)) !== i) keMinggu(i, el.scrollLeft > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nilai]);

  // Geseran selesai → tanggal terpilih ikut pindah ke minggu yang tampil (hari yang sama)
  const saatGeser = () => {
    if (programatik.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = barisRef.current;
      if (!el || programatik.current) return;
      const i = Math.max(0, Math.min(minggu.length - 1, Math.round(el.scrollLeft / el.clientWidth)));
      if (i === idxMinggu(nilaiRef.current)) return;
      const tujuan = geser(minggu[i], offset(nilaiRef.current));
      onPilih(tujuan);
      // Bila pindah ditolak (mis. menu belum disimpan → muncul pertanyaan), kembalikan deretan ke minggu yang masih terpilih
      setTimeout(() => {
        const j = idxMinggu(nilaiRef.current);
        const e2 = barisRef.current;
        if (e2 && j >= 0 && Math.round(e2.scrollLeft / e2.clientWidth) !== j) keMinggu(j, true);
      }, 350);
    }, 120);
  };

  const [y, m, d] = nilai.split("-").map(Number);
  return (
    <div>
      <div className="flex items-center" style={{ height: 44, gap: 8 }}>
        {kiri}
        <div style={{ flex: 1, textAlign: kiri ? "right" : "center", fontSize: 16, fontWeight: 800, letterSpacing: "-.01em", whiteSpace: "nowrap" }}>
          {d} {BULAN[m - 1].slice(0, 3)} {y}
        </div>
        <div className="flex items-center" style={{ gap: 2 }}>
          {kanan}
          <div style={{ position: "relative", width: 40, height: 36, display: "grid", placeItems: "center", color: t.text2 }}>
            <Calendar size={19} />
            <input ref={inputRef} type="date" value={nilai} min={awal}
              onChange={(e) => e.target.value && onPilih(e.target.value)}
              onClick={() => { try { inputRef.current?.showPicker?.(); } catch { /* picker native */ } }}
              aria-label="Pilih tanggal lain"
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
          </div>
        </div>
      </div>
      {/* Huruf hari (tetap, 7 kolom) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", marginTop: 2 }}>
        {HURUF.map((h, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11.5, fontWeight: 600, color: t.text2 }}>{h}</div>
        ))}
      </div>
      <div ref={barisRef} onScroll={saatGeser} className="hscroll"
        style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", overscrollBehaviorX: "contain", position: "relative" }}>
        {minggu.map((senin) => (
          <div key={senin} style={{ flex: "0 0 100%", scrollSnapAlign: "start", scrollSnapStop: "always", display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", padding: "3px 0 4px" }}>
            {Array.from({ length: 7 }, (_, i) => {
              const iso = geser(senin, i);
              const aktif = iso === nilai;
              return (
                <button key={iso} data-hari={iso} onClick={() => onPilih(iso)} aria-pressed={aktif} aria-label={`${Number(iso.slice(8))} ${BULAN[Number(iso.slice(5, 7)) - 1]}`}
                  style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", display: "grid", placeItems: "center", padding: 0, minHeight: 44 }}>
                  <span style={{ position: "relative", width: 38, height: 38, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 16, fontWeight: aktif ? 800 : 600,
                    background: aktif ? t.primary : "transparent", color: i >= 5 && !aktif ? t.text2 : t.text, transition: "background .2s ease" }}>
                    {Number(iso.slice(8))}
                    {iso === hariIni && <i style={{ position: "absolute", top: 3, right: 3, width: 7, height: 7, borderRadius: "50%", background: t.text, display: "block" }} />}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
