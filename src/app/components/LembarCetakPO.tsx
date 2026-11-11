import { useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { t, STRUK_MONO } from "../../lib/theme";
import { toTitleCase } from "../../lib/format";
import type { Transaction } from "../../types";

/* ============================================================
   LEMBAR CETAK PRE-ORDER — cadangan kertas bila sinyal/layar bermasalah, dan supaya Papa tidak harus menatap HP.
   Memakai fitur cetak browser (window.print): printer apa pun yang muncul di menu Cetak HP
   (AirPrint di iPhone; di Android printer thermal lewat aplikasi "print service"), atau Simpan PDF.
   DUA UKURAN kertas (pemilik 11 Nov): "Struk 58 mm" (printer thermal murah) dan "A4".
   DUA URUTAN: "Nama A–Z" (bawaan: kotak bekal datang acak dan kadang hanya bertulis nama) atau "Per kelas".
   Tiap anak: kotak centang, NAMA, kelas, jam ambil, kode PO, isi pesanan. Tanggal cukup sekali di kop.
   Hanya membaca data yang sudah ada di layar. Tidak mengubah apa pun.
   ============================================================ */

export type GrupCetak = {
  nama: string;
  tingkat: string;
  kelas: string;
  ambil: string;
  allPacked: boolean;
  /** Semua item dari semua pesanan anak ini (untuk waktu ambil ini). */
  items: Transaction["items"];
  jumlahPesanan: number;
  /** Kode PO tiap pesanan (PO-XXXXXX). */
  kode?: string[];
  /** Tiap pesanan anak ini dengan jam masuknya: dipakai untuk cetak SUSULAN (hanya yang masuk setelah cetak terakhir). */
  pesanan?: { masuk: string; items: Transaction["items"]; kode?: string }[];
};

const URUT_GRUP = ["KB", "TK", "SD 1–2", "SD 3–6", "SMP", "SMA", "Guru/Karyawan", "Lainnya"];
function grupKelas(g: GrupCetak): string {
  const tg = (g.tingkat || "").trim();
  const k = (g.kelas || "").trim().toUpperCase();
  if (tg === "Guru/Karyawan") return "Guru/Karyawan";
  if (tg.startsWith("KB") || k.startsWith("KB")) return "KB";
  if (tg.startsWith("TK") || k.startsWith("TK")) return "TK";
  const n = parseInt(k, 10);
  if (tg === "SMP") return "SMP";
  if (tg === "SMA") return "SMA";
  if (tg === "SD") return n >= 1 && n <= 2 ? "SD 1–2" : "SD 3–6";
  if (n >= 1 && n <= 2) return "SD 1–2";
  if (n >= 3 && n <= 6) return "SD 3–6";
  if (n >= 7 && n <= 9) return "SMP";
  if (n >= 10 && n <= 12) return "SMA";
  return "Lainnya";
}
const waktuSingkat = (a: string) => (a || "").replace(/^istirahat\s*/i, "Ist. ").replace(/^pulang.*/i, "Pulang");
const labelItem = (it: Transaction["items"][number]) => `${toTitleCase(it.name)}${it.variant ? ` (${it.variant})` : ""}`;
const K_UKURAN = "ganen_cetak_ukuran", K_URUT = "ganen_cetak_urut";
const baca = (k: string, d: string) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const simpan = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* abaikan */ } };

export default function LembarCetakPO({ tanggal, kunci, grup: grupSemua, onClose }: { tanggal: string; /** Tanggal ISO: kunci penanda "cetak terakhir" per hari. */ kunci: string; grup: GrupCetak[]; onClose: () => void }) {
  /* SUSULAN (pemilik 11 Nov: pesanan masih masuk setelah jam 7, pagi sudah repot): setelah cetak pertama, HP mengingat jamnya;
     cetak berikutnya bisa "Baru saja" = hanya pesanan yang masuk SETELAH cetak terakhir, jadi kertas kedua pendek. */
  const K_TERAKHIR = "ganen_cetak_terakhir_" + kunci;
  const [terakhir, setTerakhir] = useState<string>(() => baca(K_TERAKHIR, ""));
  const grupBaru: GrupCetak[] = terakhir
    ? grupSemua.map((g) => { const p = (g.pesanan ?? []).filter((x) => x.masuk > terakhir); return { ...g, items: p.flatMap((x) => x.items), jumlahPesanan: p.length, kode: p.map((x) => x.kode || ""), allPacked: false }; }).filter((g) => g.items.length > 0)
    : [];
  const [hanyaBaru, setHanyaBaru] = useState(() => !!baca(K_TERAKHIR, ""));
  const susulan = hanyaBaru && !!terakhir;
  const grup = susulan ? grupBaru : grupSemua;
  const jamTerakhir = terakhir ? new Date(terakhir).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).replace(".", ":") : "";
  const cetak = () => {
    window.print();
    const kini = new Date().toISOString();
    simpan(K_TERAKHIR, kini); setTerakhir(kini); setHanyaBaru(true);
  };
  const [ukuran, setUkuran] = useState<"struk" | "a4">(() => (baca(K_UKURAN, "struk") === "a4" ? "a4" : "struk"));
  const [urut, setUrut] = useState<"nama" | "kelas">(() => (baca(K_URUT, "nama") === "kelas" ? "kelas" : "nama"));
  const struk = ukuran === "struk";
  const cetakJam = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).replace(".", ":");

  /* Rekap: total tiap menu (+ukuran) */
  const rekap = new Map<string, number>();
  for (const g of grup) for (const it of g.items) { const k = labelItem(it); rekap.set(k, (rekap.get(k) ?? 0) + it.qty); }
  const rekapList = [...rekap.entries()].sort((a, b) => a[0].localeCompare(b[0], "id"));
  const totalPorsi = rekapList.reduce((n, [, q]) => n + q, 0);

  const menurutNama = (a: GrupCetak, b: GrupCetak) => a.nama.trim().localeCompare(b.nama.trim(), "id", { sensitivity: "base" }) || a.kelas.localeCompare(b.kelas, "id", { numeric: true });
  let bagian: (readonly [string, GrupCetak[]])[];
  if (urut === "nama") {
    /* Satu urutan A–Z; huruf awal jadi pembatas supaya cepat dicari */
    const m = new Map<string, GrupCetak[]>();
    for (const g of [...grup].sort(menurutNama)) { const h = (g.nama.trim()[0] || "#").toUpperCase(); const k = /[A-Z]/.test(h) ? h : "#"; (m.get(k) ?? m.set(k, []).get(k)!).push(g); }
    bagian = [...m.entries()];
  } else {
    const m = new Map<string, GrupCetak[]>();
    for (const g of grup) { const k = grupKelas(g); (m.get(k) ?? m.set(k, []).get(k)!).push(g); }
    bagian = URUT_GRUP.filter((k) => m.has(k)).map((k) => [k, m.get(k)!.sort((a, b) => a.kelas.localeCompare(b.kelas, "id", { numeric: true }) || menurutNama(a, b))] as const);
  }

  /* ukuran huruf: struk 58 mm sempit (±48 mm area cetak), A4 lega */
  const f = struk ? { kop: 11, judul: 12.5, nama: 14, isi: 12, kecil: 10.5, kotak: 13 } : { kop: 12.5, judul: 14, nama: 14.5, isi: 13, kecil: 11.5, kotak: 14 };
  const pil = (aktif: boolean): React.CSSProperties => ({ minHeight: 40, padding: "0 14px", borderRadius: 999, border: "none", background: aktif ? t.text : t.surface, color: aktif ? t.surface : t.text, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });

  const isi = (
    <div id="lembar-cetak-akar" style={{ position: "fixed", inset: 0, zIndex: 200, background: "#EDE7DA", overflowY: "auto", fontFamily: "inherit", color: "#000" }}>
      <style>{`
        @page { ${struk ? "size: 58mm auto; margin: 0 2mm;" : "size: A4; margin: 10mm;"} }
        @media print {
          html, body { background: #fff !important; }
          body > *:not(#lembar-cetak-akar) { display: none !important; }
          #lembar-cetak-akar { position: static !important; inset: auto !important; overflow: visible !important; background: #fff !important; }
          .tanpa-cetak { display: none !important; }
          .kertas { box-shadow: none !important; margin: 0 !important; padding: ${struk ? "2mm 0 8mm" : "0"} !important; max-width: none !important; width: 100% !important; }
          .jangan-pecah { break-inside: avoid; }
          .judul-grup { break-after: avoid; }
        }
      `}</style>

      <div className="tanpa-cetak" style={{ position: "sticky", top: 0, zIndex: 2, background: "#EDE7DA", padding: "12px 16px 10px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={onClose} aria-label="Tutup" style={{ width: 48, height: 48, borderRadius: 14, border: "none", background: t.surface, color: t.text, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}><X size={22} /></button>
          <button onClick={cetak} disabled={grup.length === 0} style={{ height: 48, padding: "0 22px", borderRadius: 14, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit", flex: "none" }}>
            <Printer size={20} /> Cetak
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <button style={pil(struk)} aria-pressed={struk} onClick={() => { setUkuran("struk"); simpan(K_UKURAN, "struk"); }}>Struk 58 mm</button>
          <button style={pil(!struk)} aria-pressed={!struk} onClick={() => { setUkuran("a4"); simpan(K_UKURAN, "a4"); }}>A4</button>
          <span style={{ width: 8 }} />
          {terakhir && (<>
            <button style={pil(susulan)} aria-pressed={susulan} onClick={() => setHanyaBaru(true)}>Baru saja ({grupBaru.length})</button>
            <button style={pil(!susulan)} aria-pressed={!susulan} onClick={() => setHanyaBaru(false)}>Semua</button>
            <span style={{ width: 8 }} />
          </>)}
          <button style={pil(urut === "nama")} aria-pressed={urut === "nama"} onClick={() => { setUrut("nama"); simpan(K_URUT, "nama"); }}>Nama A–Z</button>
          <button style={pil(urut === "kelas")} aria-pressed={urut === "kelas"} onClick={() => { setUrut("kelas"); simpan(K_URUT, "kelas"); }}>Per kelas</button>
        </div>
      </div>

      <div className="kertas" style={{ background: "#fff", maxWidth: struk ? 250 : 794, margin: "6px auto 40px", padding: struk ? "14px 12px 22px" : "22px 22px 28px", boxShadow: "0 2px 14px rgba(60,48,20,.18)", color: "#000", fontFamily: struk ? STRUK_MONO : "inherit" }}>
        {/* Kop: kecil, tanggal cukup sekali */}
        <div style={{ fontSize: f.kop, borderBottom: "1.5px solid #000", paddingBottom: 4, lineHeight: 1.35 }}>
          <b>{susulan ? `SUSULAN sejak ${jamTerakhir}` : "PO"} {tanggal}</b>{struk ? <br /> : " · "}{grup.length} anak · {totalPorsi} porsi · cetak {cetakJam}
        </div>

        {/* Rekap masak */}
        <div style={{ fontSize: f.judul, fontWeight: 800, margin: "10px 0 3px" }}>{susulan ? "TAMBAHAN MASAK" : "REKAP MASAK"}</div>
        {rekapList.length === 0 && <div style={{ fontSize: f.isi }}>{susulan ? `Tidak ada pesanan baru sejak ${jamTerakhir}.` : "Belum ada pesanan."}</div>}
        <div style={{ columnCount: struk ? 1 : 2, columnGap: 24 }}>
          {rekapList.map(([nama, qty]) => (
            <div key={nama} className="jangan-pecah" style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "2px 0", borderBottom: "0.5px solid #aaa", fontSize: f.isi }}>
              <span>{nama}</span><b>{qty}</b>
            </div>
          ))}
        </div>

        {/* Pesanan */}
        {bagian.map(([judul, arr]) => (
          <div key={judul} style={{ marginTop: 12 }}>
            <div className="judul-grup" style={{ fontSize: f.judul, fontWeight: 800, borderBottom: "1.5px solid #000", paddingBottom: 2, marginBottom: 2 }}>{judul}{urut === "kelas" && <span style={{ fontWeight: 500, fontSize: f.kecil }}> · {arr.length} anak</span>}</div>
            {arr.map((g, i) => {
              const m = new Map<string, number>();
              for (const it of g.items) { const k = labelItem(it); m.set(k, (m.get(k) ?? 0) + it.qty); }
              const catatan = g.items.filter((it) => it.note).map((it) => `${toTitleCase(it.name)}: ${it.note}`);
              const kode = (g.kode ?? []).filter(Boolean).join(" ");
              return (
                <div key={i} className="jangan-pecah" style={{ display: "flex", gap: 7, padding: "4px 0", borderBottom: "0.5px solid #aaa" }}>
                  <span aria-hidden="true" style={{ flex: "none", width: f.kotak, height: f.kotak, border: "1.5px solid #000", marginTop: 3, display: "grid", placeItems: "center", fontSize: f.kecil, fontWeight: 800 }}>{g.allPacked ? "✓" : ""}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: f.nama, fontWeight: 800, lineHeight: 1.25, overflowWrap: "anywhere" }}>{g.nama}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: f.kecil, lineHeight: 1.3 }}>
                      <span><b>{g.kelas || g.tingkat || "-"}</b> · {waktuSingkat(g.ambil)}</span>
                      {kode && <span style={{ flex: "none" }}>{kode}</span>}
                    </div>
                    <div style={{ fontSize: f.isi, lineHeight: 1.35, marginTop: 1 }}>{[...m.entries()].map(([k, q]) => `${k} ×${q}`).join(", ")}</div>
                    {catatan.length > 0 && <div style={{ fontSize: f.kecil, fontStyle: "italic" }}>* {catatan.join("; ")}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
  return createPortal(isi, document.body);
}
