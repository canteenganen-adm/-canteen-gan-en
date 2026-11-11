import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { t } from "../../lib/theme";
import { toTitleCase } from "../../lib/format";
import type { Transaction } from "../../types";

/* ============================================================
   LEMBAR CETAK PRE-ORDER (A4) — cadangan kertas bila sinyal/layar bermasalah.
   Tanpa printer thermal: memakai fitur cetak browser (window.print) ke printer apa pun / AirPrint / "Simpan PDF".
   Ringkas (pemilik 11 Nov: "jangan too much"): satu baris kop kecil, REKAP MASAK, lalu pesanan DIKELOMPOKKAN PER KELAS
   (KB, TK, SD 1–2, SD 3–6, SMP, SMA, Guru) dengan kotak centang kemas dan penanda Waktu Ambil singkat di kanan.
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

export default function LembarCetakPO({ tanggal, grup, onClose }: { tanggal: string; grup: GrupCetak[]; onClose: () => void }) {
  const cetakJam = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).replace(".", ":");

  /* Rekap: total tiap menu (+ukuran) */
  const rekap = new Map<string, number>();
  for (const g of grup) for (const it of g.items) { const k = labelItem(it); rekap.set(k, (rekap.get(k) ?? 0) + it.qty); }
  const rekapList = [...rekap.entries()].sort((a, b) => a[0].localeCompare(b[0], "id"));
  const totalPorsi = rekapList.reduce((n, [, q]) => n + q, 0);

  /* Pesanan per kelompok kelas; di dalamnya urut kelas > nama */
  const perGrup = new Map<string, GrupCetak[]>();
  for (const g of grup) { const k = grupKelas(g); (perGrup.get(k) ?? perGrup.set(k, []).get(k)!).push(g); }
  const grupList = URUT_GRUP.filter((k) => perGrup.has(k)).map((k) => [k, perGrup.get(k)!] as const);
  for (const [, arr] of grupList) arr.sort((a, b) => a.kelas.localeCompare(b.kelas, "id", { numeric: true }) || a.nama.localeCompare(b.nama, "id"));

  const isi = (
    <div id="lembar-cetak-akar" style={{ position: "fixed", inset: 0, zIndex: 200, background: "#EDE7DA", overflowY: "auto", fontFamily: "inherit", color: "#000" }}>
      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          html, body { background: #fff !important; }
          body > *:not(#lembar-cetak-akar) { display: none !important; }
          #lembar-cetak-akar { position: static !important; inset: auto !important; overflow: visible !important; background: #fff !important; }
          .tanpa-cetak { display: none !important; }
          .kertas { box-shadow: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; width: 100% !important; }
          .jangan-pecah { break-inside: avoid; }
          .judul-grup { break-after: avoid; }
        }
      `}</style>

      <div className="tanpa-cetak" style={{ position: "sticky", top: 0, zIndex: 2, background: "#EDE7DA", padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={onClose} aria-label="Tutup" style={{ width: 48, height: 48, borderRadius: 14, border: "none", background: t.surface, color: t.text, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}><X size={22} /></button>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: t.text2, textAlign: "center", lineHeight: 1.3 }}>Pratinjau kertas A4</div>
        <button onClick={() => window.print()} style={{ height: 48, padding: "0 22px", borderRadius: 14, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit", flex: "none" }}>
          <Printer size={20} /> Cetak
        </button>
      </div>

      <div className="kertas" style={{ background: "#fff", maxWidth: 794, margin: "6px auto 40px", padding: "22px 22px 28px", boxShadow: "0 2px 14px rgba(60,48,20,.18)", color: "#000" }}>
        {/* Kop: satu baris kecil */}
        <div style={{ fontSize: 12.5, borderBottom: "1.5px solid #000", paddingBottom: 5 }}>
          <b>Pre-order {tanggal}</b> · {grup.length} anak · {totalPorsi} porsi · dicetak {cetakJam}
        </div>

        {/* Rekap masak */}
        <div style={{ fontSize: 14, fontWeight: 800, margin: "12px 0 4px" }}>REKAP MASAK</div>
        {rekapList.length === 0 && <div style={{ fontSize: 13 }}>Belum ada pesanan.</div>}
        <div style={{ columnCount: 2, columnGap: 24 }}>
          {rekapList.map(([nama, qty]) => (
            <div key={nama} className="jangan-pecah" style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "2px 0", borderBottom: "0.5px solid #aaa", fontSize: 13 }}>
              <span>{nama}</span><b>{qty}</b>
            </div>
          ))}
        </div>

        {/* Pesanan per kelas */}
        {grupList.map(([nama, arr]) => (
          <div key={nama} style={{ marginTop: 14 }}>
            <div className="judul-grup" style={{ fontSize: 14, fontWeight: 800, borderBottom: "1.5px solid #000", paddingBottom: 2, marginBottom: 2 }}>{nama} <span style={{ fontWeight: 500, fontSize: 12 }}>· {arr.length} anak</span></div>
            {arr.map((g, i) => {
              /* gabung item yang sama (nama+ukuran) */
              const m = new Map<string, number>();
              for (const it of g.items) { const k = labelItem(it); m.set(k, (m.get(k) ?? 0) + it.qty); }
              const catatan = g.items.filter((it) => it.note).map((it) => `${toTitleCase(it.name)}: ${it.note}`);
              return (
                <div key={i} className="jangan-pecah" style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: "0.5px solid #aaa" }}>
                  <span aria-hidden="true" style={{ flex: "none", width: 14, height: 14, border: "1.5px solid #000", marginTop: 2, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800 }}>{g.allPacked ? "✓" : ""}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13.5 }}>
                      <span><b>{g.nama}</b> · {g.kelas || g.tingkat}{g.jumlahPesanan > 1 && ` · ${g.jumlahPesanan} pesanan`}</span>
                      <span style={{ flex: "none", fontSize: 12 }}>{waktuSingkat(g.ambil)}</span>
                    </div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.35 }}>{[...m.entries()].map(([k, q]) => `${k} ×${q}`).join(", ")}</div>
                    {catatan.length > 0 && <div style={{ fontSize: 11.5, fontStyle: "italic" }}>Catatan: {catatan.join("; ")}</div>}
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
