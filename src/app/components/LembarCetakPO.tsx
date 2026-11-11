import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { t } from "../../lib/theme";
import { toTitleCase } from "../../lib/format";
import type { Transaction } from "../../types";

/* ============================================================
   LEMBAR CETAK PRE-ORDER (A4) — cadangan kertas bila sinyal/layar bermasalah.
   Tanpa printer thermal: memakai fitur cetak browser (window.print) ke printer apa pun / AirPrint / "Simpan PDF".
   Isi: 1) REKAP MASAK (total tiap menu)  2) PESANAN per Waktu Ambil, tiap anak punya kotak centang untuk dikemas.
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

const URUT_TINGKAT = ["KB", "TK", "SD", "SMP", "SMA", "GURU"];
const rankTingkat = (g: GrupCetak) => {
  const s = `${g.tingkat} ${g.kelas}`.toUpperCase();
  const i = URUT_TINGKAT.findIndex((x) => s.includes(x));
  if (i >= 0) return i;
  const n = parseInt(g.kelas, 10);
  if (n >= 1 && n <= 6) return 2;
  if (n >= 7 && n <= 9) return 3;
  if (n >= 10) return 4;
  return 9;
};

const labelItem = (it: Transaction["items"][number]) => `${toTitleCase(it.name)}${it.variant ? ` (${it.variant})` : ""}`;

export default function LembarCetakPO({ tanggal, grup, onClose }: { tanggal: string; grup: GrupCetak[]; onClose: () => void }) {
  const cetakJam = new Date().toLocaleString("id-ID", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).replace(".", ":").replace(",", "");

  /* Rekap: total tiap menu (+ukuran) */
  const rekap = new Map<string, number>();
  for (const g of grup) for (const it of g.items) { const k = labelItem(it); rekap.set(k, (rekap.get(k) ?? 0) + it.qty); }
  const rekapList = [...rekap.entries()].sort((a, b) => a[0].localeCompare(b[0], "id"));
  const totalPorsi = rekapList.reduce((n, [, q]) => n + q, 0);

  /* Pesanan per Waktu Ambil (urut abjad: Istirahat 1, 2, 3, Pulang Sekolah), di dalamnya urut tingkat > kelas > nama */
  const perWaktu = new Map<string, GrupCetak[]>();
  for (const g of grup) { const k = g.ambil || "—"; (perWaktu.get(k) ?? perWaktu.set(k, []).get(k)!).push(g); }
  const waktuList = [...perWaktu.entries()].sort((a, b) => a[0].localeCompare(b[0], "id"));
  for (const [, arr] of waktuList) arr.sort((a, b) => rankTingkat(a) - rankTingkat(b) || a.kelas.localeCompare(b.kelas, "id", { numeric: true }) || a.nama.localeCompare(b.nama, "id"));

  const isi = (
    <div id="lembar-cetak-akar" style={{ position: "fixed", inset: 0, zIndex: 200, background: "#EDE7DA", overflowY: "auto", fontFamily: "inherit", color: "#000" }}>
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          html, body { background: #fff !important; }
          body > *:not(#lembar-cetak-akar) { display: none !important; }
          #lembar-cetak-akar { position: static !important; inset: auto !important; overflow: visible !important; background: #fff !important; }
          .tanpa-cetak { display: none !important; }
          .kertas { box-shadow: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; width: 100% !important; }
          .halaman-baru { break-before: page; }
          .jangan-pecah { break-inside: avoid; }
        }
      `}</style>

      <div className="tanpa-cetak" style={{ position: "sticky", top: 0, zIndex: 2, background: "#EDE7DA", padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={onClose} aria-label="Tutup" style={{ width: 48, height: 48, borderRadius: 14, border: "none", background: t.surface, color: t.text, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}><X size={22} /></button>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: t.text2, textAlign: "center", lineHeight: 1.3 }}>Pratinjau kertas A4</div>
        <button onClick={() => window.print()} style={{ height: 48, padding: "0 22px", borderRadius: 14, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit", flex: "none" }}>
          <Printer size={20} /> Cetak
        </button>
      </div>

      <div className="kertas" style={{ background: "#fff", maxWidth: 794, margin: "6px auto 40px", padding: "28px 26px 36px", boxShadow: "0 2px 14px rgba(60,48,20,.18)", color: "#000" }}>
        {/* Kop */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2.5px solid #000", paddingBottom: 8, gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Pre-order</div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.3px", lineHeight: 1.15 }}>{tanggal}</div>
            <div style={{ fontSize: 14, marginTop: 2 }}>{grup.length} anak · {totalPorsi} porsi · dicetak {cetakJam}</div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, flex: "none" }}>Canteen Gan En</div>
        </div>

        {/* 1. Rekap masak */}
        <div style={{ fontSize: 20, fontWeight: 800, margin: "18px 0 8px" }}>REKAP MASAK</div>
        {rekapList.length === 0 && <div style={{ fontSize: 16 }}>Belum ada pesanan.</div>}
        <div style={{ columnCount: 2, columnGap: 28 }}>
          {rekapList.map(([nama, qty]) => (
            <div key={nama} className="jangan-pecah" style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", borderBottom: "1px solid #999", fontSize: 16 }}>
              <span>{nama}</span><b style={{ fontSize: 18 }}>{qty}</b>
            </div>
          ))}
        </div>

        {/* 2. Pesanan per Waktu Ambil */}
        {waktuList.map(([waktu, arr], wi) => (
          <div key={waktu} className={wi > 0 ? "halaman-baru" : undefined} style={{ marginTop: 26 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2.5px solid #000", paddingBottom: 6, marginBottom: 8 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{waktu}</div>
              <div style={{ fontSize: 14 }}>{arr.length} anak · {tanggal}</div>
            </div>
            {arr.map((g, i) => {
              /* gabung item yang sama (nama+ukuran) */
              const m = new Map<string, number>();
              for (const it of g.items) { const k = labelItem(it); m.set(k, (m.get(k) ?? 0) + it.qty); }
              const catatan = g.items.filter((it) => it.note).map((it) => `${toTitleCase(it.name)}: ${it.note}`);
              return (
                <div key={i} className="jangan-pecah" style={{ display: "flex", gap: 12, padding: "9px 0", borderBottom: "1px solid #999" }}>
                  <span aria-hidden="true" style={{ flex: "none", width: 20, height: 20, border: "2px solid #000", marginTop: 2, display: "grid", placeItems: "center", fontSize: 15, fontWeight: 800 }}>{g.allPacked ? "✓" : ""}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 800 }}>{g.nama} <span style={{ fontWeight: 600 }}>· {g.kelas || g.tingkat}</span>{g.jumlahPesanan > 1 && <span style={{ fontWeight: 600 }}> · {g.jumlahPesanan} pesanan</span>}</div>
                    <div style={{ fontSize: 15, lineHeight: 1.45 }}>{[...m.entries()].map(([k, q]) => `${k} ×${q}`).join(", ")}</div>
                    {catatan.length > 0 && <div style={{ fontSize: 13.5, fontStyle: "italic" }}>Catatan: {catatan.join("; ")}</div>}
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
