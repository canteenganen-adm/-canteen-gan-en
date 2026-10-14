import { useEffect, useMemo, useState } from "react";
import { AlarmClock, Ban, Calendar, CalendarDays, ChevronLeft, ChevronRight, CircleCheck, CircleDashed, Clock, Ellipsis, FileSpreadsheet, FileText, Receipt, RotateCcw, Settings, ShoppingCart, Timer, TrendingDown, TrendingUp, User, Utensils, Wallet } from "lucide-react";
import { t, STRUK_MONO } from "../../lib/theme";
import { rupiah, toTitleCase } from "../../lib/format";
import { fetchTransactionsMonth, fetchMasukBulan } from "../../lib/canteenApi";
import PaperTabs from "../components/PaperTabs";
import type { Transaction, PickupSchedule } from "../../types";

/* ============================================================
   LAPORAN BULANAN — dibuka dari Pengaturan → Data.
   Hanya MEMBACA (tidak mengubah/menghapus apa pun). Per bulan:
   tab Pemasukan Harian (grafik batang + pilih tanggal) dan tab
   Ulasan (ringkasan, menu terlaris, per tingkat, waktu ambil,
   pemesan teratas), + unduh Excel lengkap.
   Data bulan dibaca dari database saat dibuka (tidak membebani
   pemuatan harian).
   ============================================================ */

const BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const HARI = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];
const BLN_PENDEK = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

/** Waktu WIB (UTC+7) dari ISO — tanggal "YYYY-MM-DD" dan jam "HH:MM". */
const wib = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString();
const wibTanggal = (iso: string) => wib(iso).slice(0, 10);
const wibJam = (iso: string) => wib(iso).slice(11, 16);
const labelHari = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${HARI[new Date(y, m - 1, d).getDay()]}, ${d} ${BLN_PENDEK[m - 1]}`;
};

type Status = "Lunas" | "Belum Dibayar" | "Dibatalkan";
const statusOf = (tx: Transaction): Status => (tx.cancelledAt ? "Dibatalkan" : tx.paid ? "Lunas" : "Belum Dibayar");
const itemLabel = (i: { name: string; variant?: string | null }) => toTitleCase((i.variant ? `${i.name} (${i.variant})` : i.name).trim().replace(/ +/g, " "));

function buildReport(txs: Transaction[]) {
  let masuk = 0, nMasuk = 0, belum = 0, nBelum = 0, nBatal = 0, masukPO = 0, masukPJ = 0;
  const perHari = new Map<string, { n: number; masuk: number; belum: number }>();
  const menu = new Map<string, { qty: number; nilai: number }>();
  for (const tx of txs) {
    const st = statusOf(tx);
    if (st === "Dibatalkan") { nBatal++; continue; }
    const day = perHari.get(wibTanggal(tx.createdAt)) ?? { n: 0, masuk: 0, belum: 0 };
    day.n++;
    if (st === "Lunas") {
      masuk += tx.total; nMasuk++; day.masuk += tx.total;
      if (tx.source === "preorder") masukPO += tx.total; else masukPJ += tx.total;
    } else { belum += tx.total; nBelum++; day.belum += tx.total; }
    perHari.set(wibTanggal(tx.createdAt), day);
    for (const it of tx.items) {
      const k = itemLabel(it);
      const m = menu.get(k) ?? { qty: 0, nilai: 0 };
      m.qty += it.qty; m.nilai += it.qty * it.price;
      menu.set(k, m);
    }
  }
  const hari = [...perHari.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const menuList = [...menu.entries()].sort((a, b) => b[1].qty - a[1].qty);
  return { masuk, nMasuk, belum, nBelum, nBatal, masukPO, masukPJ, hari, menuList };
}

/* ---------- Bahan laporan: SATU sumber untuk layar, Excel, dan PDF ---------- */

interface Banding { prevLabel: string; prevMasuk: number; berjalan: boolean }

function teksBanding(masuk: number, bd: Banding | null): string | null {
  if (!bd) return null;
  if (bd.prevMasuk <= 0) return `Belum ada data ${bd.prevLabel} untuk dibandingkan`;
  const pct = Math.round(((masuk - bd.prevMasuk) / bd.prevMasuk) * 100);
  const arah = pct === 0 ? "Sama dengan" : pct > 0 ? `Naik ${pct}% dibanding` : `Turun ${Math.abs(pct)}% dibanding`;
  return `${arah} ${bd.prevLabel} (${rupiah(bd.prevMasuk)})${bd.berjalan ? " · bulan ini belum penuh" : ""}`;
}

type Rep = ReturnType<typeof buildReport>;
/** Menu diurutkan menurut omzet (nilai), bukan jumlah. */
const menuOmzet = (r: Rep) => [...r.menuList].sort((x, y) => y[1].nilai - x[1].nilai);
/** Tanggal pemasukan tertinggi dan terendah (hanya hari yang ada uang masuk). */
function tinggiRendah(r: Rep) {
  const ada = r.hari.filter(([, v]) => v.masuk > 0);
  if (!ada.length) return { hi: null, lo: null };
  const hi = ada.reduce((m, x) => (x[1].masuk > m[1].masuk ? x : m));
  const lo = ada.reduce((m, x) => (x[1].masuk < m[1].masuk ? x : m));
  return { hi, lo };
}

function unduhBlob(blob: Blob, nama: string) {
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url;
  el.download = nama;
  document.body.appendChild(el);
  el.click();
  el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function unduhExcel(txs: Transaction[], year: number, month: number, banding: Banding | null) {
  const { default: writeExcelFile } = await import("write-excel-file/universal");
  const r = buildReport(txs);
  const { hi, lo } = tinggiRendah(r);
  const H = (v: string) => ({ value: v, fontWeight: "bold" as const, backgroundColor: "#FFE66D" });
  const B = (v: string) => ({ value: v, fontWeight: "bold" as const });
  const rp = (v: number) => ({ value: v, type: Number, format: '"Rp "#,##0' });
  const nm = (v: number) => ({ value: v, type: Number });
  const judul = `${BULAN[month]} ${year}`;
  const hariBaru = [...r.hari].reverse(); // terbaru dulu

  const ringkasan = [
    [{ value: "Laporan Kantin Gan En", fontWeight: "bold" as const, fontSize: 14 }],
    [B("Periode"), { value: judul }],
    [],
    [B("Masuk (Lunas)"), rp(r.masuk)],
    [{ value: "   dari Pre-order" }, rp(r.masukPO)],
    [{ value: "   dari Penjualan" }, rp(r.masukPJ)],
    [B("Jumlah transaksi Lunas"), nm(r.nMasuk)],
    [B("Belum Dibayar"), rp(r.belum)],
    [B("Jumlah transaksi Belum Dibayar"), nm(r.nBelum)],
    [B("Dibatalkan (tidak dihitung)"), nm(r.nBatal)],
    [],
    [B("Dibanding bulan lalu"), { value: teksBanding(r.masuk, banding) ?? "-" }],
    [B("Pemasukan tertinggi"), { value: hi ? labelHari(hi[0]) : "-" }, hi ? rp(hi[1].masuk) : { value: "" }],
    [B("Pemasukan terendah"), { value: lo ? labelHari(lo[0]) : "-" }, lo ? rp(lo[1].masuk) : { value: "" }],
    [],
    [{ value: "Catatan: pemasukan = uang masuk dari transaksi Lunas (omzet), bukan laba.", fontSize: 10 }],
  ];
  const perHari = [
    [H("Tanggal"), H("Transaksi"), H("Masuk (Lunas)"), H("Belum Dibayar")],
    ...hariBaru.map(([d, v]) => [{ value: labelHari(d) }, nm(v.n), rp(v.masuk), rp(v.belum)]),
    [B("Total"), { value: r.nMasuk + r.nBelum, type: Number, fontWeight: "bold" as const }, { value: r.masuk, type: Number, format: '"Rp "#,##0', fontWeight: "bold" as const }, { value: r.belum, type: Number, format: '"Rp "#,##0', fontWeight: "bold" as const }],
  ];
  const perMenu = [
    [H("Menu"), H("Terjual"), H("Omzet")],
    ...menuOmzet(r).map(([k, v]) => [{ value: k }, nm(v.qty), rp(v.nilai)]),
  ];
  const rincian = [
    [H("Tanggal"), H("Jam"), H("No. Pesanan"), H("Sumber"), H("Nama"), H("Tingkat"), H("Kelas"), H("Waktu Ambil"), H("Tanggal Layanan"), H("Status"), H("Total"), H("Isi Pesanan")],
    ...txs.map((tx) => [
      { value: wibTanggal(tx.createdAt) },
      { value: wibJam(tx.createdAt) },
      { value: tx.orderNo ?? "" },
      { value: tx.source === "preorder" ? "Pre-order" : "Penjualan" },
      { value: tx.customer.nama ?? "" },
      { value: tx.customer.tingkat ?? "" },
      { value: tx.customer.kelas ?? "" },
      { value: tx.waktuAmbil ?? "" },
      { value: tx.serviceDate ?? "" },
      { value: statusOf(tx) },
      rp(tx.total),
      { value: tx.items.map((i) => `${itemLabel(i)} x${i.qty}`).join(", ") },
    ]),
  ];

  const blob = await writeExcelFile([
    { data: ringkasan, sheet: "Ringkasan", columns: [{ width: 34 }, { width: 22 }, { width: 18 }] },
    { data: perHari, sheet: "Per Hari", columns: [{ width: 16 }, { width: 11 }, { width: 18 }, { width: 18 }], stickyRowsCount: 1 },
    { data: perMenu, sheet: "Per Menu", columns: [{ width: 38 }, { width: 10 }, { width: 18 }], stickyRowsCount: 1 },
    { data: rincian, sheet: "Rincian Transaksi", columns: [{ width: 12 }, { width: 7 }, { width: 12 }, { width: 11 }, { width: 24 }, { width: 9 }, { width: 8 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 70 }], stickyRowsCount: 1 },
  ]).toBlob();
  unduhBlob(blob, `Laporan Gan En ${BULAN[month]} ${year}.xlsx`);
}

async function unduhPdf(txs: Transaction[], year: number, month: number, banding: Banding | null) {
  const { jsPDF } = await import("jspdf");
  const r = buildReport(txs);
  const u = buildUlasan(txs);
  const { hi, lo } = tinggiRendah(r);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 16, W = 210 - M * 2;
  const GELAP: [number, number, number] = [42, 40, 32], REDUP: [number, number, number] = [95, 92, 77];
  const HIJAU: [number, number, number] = [31, 122, 46], MERAH: [number, number, number] = [168, 47, 36];
  const KUNING: [number, number, number] = [255, 230, 109], KHAKI: [number, number, number] = [214, 208, 176], MADU: [number, number, number] = [242, 181, 60];
  const GARIS: [number, number, number] = [232, 224, 210];
  const txt = (s: string, x: number, y: number, o?: { size?: number; bold?: boolean; color?: [number, number, number]; align?: "left" | "right" | "center" }) => {
    doc.setFont("helvetica", o?.bold ? "bold" : "normal");
    doc.setFontSize(o?.size ?? 10);
    doc.setTextColor(...(o?.color ?? GELAP));
    doc.text(s, x, y, { align: o?.align ?? "left" });
  };
  const judul = `${BULAN[month]} ${year}`;
  const dibuat = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const footer = (hal: number) => txt(`Canteen Gan En · dibuat ${dibuat} · hal. ${hal}`, M, 289, { size: 8, color: REDUP });

  /* Halaman 1 */
  txt("Laporan Kantin Gan En", M, 22, { size: 18, bold: true });
  txt(judul, M, 29, { size: 12, color: REDUP });
  doc.setFillColor(...KUNING); doc.rect(M, 32, W, 1.4, "F");

  const kotak = (x: number, w: number, label: string, nilai: string, warna: [number, number, number], sub: string) => {
    doc.setDrawColor(...GARIS); doc.setLineWidth(0.4); doc.roundedRect(x, 38, w, 24, 3, 3, "S");
    txt(label, x + 4, 45, { size: 9, color: REDUP });
    txt(nilai, x + 4, 54, { size: 15, bold: true, color: warna });
    txt(sub, x + 4, 59.5, { size: 8.5, color: REDUP });
  };
  kotak(M, (W - 4) / 2, "Masuk (Lunas)", rupiah(r.masuk), HIJAU, `${r.nMasuk} transaksi`);
  kotak(M + (W + 4) / 2, (W - 4) / 2, "Belum Dibayar", rupiah(r.belum), r.belum > 0 ? MERAH : GELAP, `${r.nBelum} transaksi`);

  let y = 70;
  const bandingTeks = teksBanding(r.masuk, banding);
  if (bandingTeks) { txt(bandingTeks, M, y, { size: 10 }); y += 5.5; }
  txt(`Dari Pre-order ${rupiah(r.masukPO)}  ·  Dari Penjualan ${rupiah(r.masukPJ)}  ·  Dibatalkan ${r.nBatal} (tidak dihitung)`, M, y, { size: 9, color: REDUP });
  y += 5.5;
  if (hi && lo) {
    txt(`Tertinggi ${labelHari(hi[0])} ${rupiah(hi[1].masuk)}  ·  Terendah ${labelHari(lo[0])} ${rupiah(lo[1].masuk)}`, M, y, { size: 9, color: REDUP });
    y += 5.5;
  }

  /* Grafik batang pemasukan per hari */
  y += 5;
  txt("Pemasukan per hari", M, y, { size: 12, bold: true });
  y += 4;
  const gTop = y, gH = 42, jumlahHari = new Date(year, month + 1, 0).getDate();
  const harian = new Map(r.hari);
  const maxMasuk = Math.max(1, ...r.hari.map(([, v]) => v.masuk));
  const slot = W / jumlahHari;
  for (let d = 1; d <= jumlahHari; d++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const v = harian.get(key)?.masuk ?? 0;
    const h = v > 0 ? Math.max(0.8, (v / maxMasuk) * gH) : 0.4;
    doc.setFillColor(...(hi && hi[0] === key ? MADU : KHAKI));
    doc.rect(M + (d - 1) * slot + 0.3, gTop + gH - h, slot - 0.6, h, "F");
    if (d === 1 || d % 5 === 0 || d === jumlahHari) txt(String(d), M + (d - 0.5) * slot, gTop + gH + 4.5, { size: 7.5, color: REDUP, align: "center" });
  }
  y = gTop + gH + 12;

  /* Menu teratas (omzet) */
  txt("Menu teratas (berdasarkan omzet)", M, y, { size: 12, bold: true });
  y += 6;
  doc.setFillColor(...KUNING); doc.rect(M, y - 4.2, W, 6, "F");
  txt("Menu", M + 2, y, { size: 9, bold: true }); txt("Terjual", M + W - 40, y, { size: 9, bold: true, align: "right" }); txt("Omzet", M + W - 2, y, { size: 9, bold: true, align: "right" });
  y += 6;
  menuOmzet(r).slice(0, 5).forEach(([k, v], i) => {
    txt(`${i + 1}. ${k}`, M + 2, y, { size: 9.5 }); txt(String(v.qty), M + W - 40, y, { size: 9.5, align: "right" }); txt(rupiah(v.nilai), M + W - 2, y, { size: 9.5, align: "right" });
    y += 5.8;
  });

  /* Per tingkat */
  y += 5;
  txt("Per tingkat (nilai pesanan)", M, y, { size: 12, bold: true });
  y += 6;
  u.tingkat.slice(0, 7).forEach(([k, v]) => {
    txt(k, M + 2, y, { size: 9.5 }); txt(`${v.n} pesanan`, M + W - 40, y, { size: 9.5, align: "right" }); txt(rupiah(v.nilai), M + W - 2, y, { size: 9.5, align: "right" });
    y += 5.8;
  });
  footer(1);

  /* Halaman 2: tabel per hari (terbaru dulu) */
  doc.addPage();
  txt(`Pemasukan per hari · ${judul}`, M, 22, { size: 14, bold: true });
  let ty = 32;
  const kolom = (yy: number, a: string, b: string, c: string, d: string, bold = false) => {
    txt(a, M + 2, yy, { size: 9.5, bold }); txt(b, M + 62, yy, { size: 9.5, bold, align: "right" }); txt(c, M + 112, yy, { size: 9.5, bold, align: "right" }); txt(d, M + W - 2, yy, { size: 9.5, bold, align: "right" });
  };
  doc.setFillColor(...KUNING); doc.rect(M, ty - 4.5, W, 6.5, "F");
  kolom(ty, "Tanggal", "Transaksi", "Masuk (Lunas)", "Belum Dibayar", true);
  ty += 7;
  for (const [d, v] of [...r.hari].reverse()) {
    if (ty > 278) { footer(2); doc.addPage(); ty = 22; }
    kolom(ty, labelHari(d), String(v.n), rupiah(v.masuk), rupiah(v.belum));
    doc.setDrawColor(...GARIS); doc.setLineWidth(0.2); doc.line(M, ty + 1.8, M + W, ty + 1.8);
    ty += 6.2;
  }
  doc.setDrawColor(...GELAP); doc.setLineWidth(0.4); doc.line(M, ty - 3.2, M + W, ty - 3.2);
  kolom(ty + 1, "Total", String(r.nMasuk + r.nBelum), rupiah(r.masuk), rupiah(r.belum), true);
  footer(doc.getNumberOfPages());

  unduhBlob(doc.output("blob"), `Laporan Gan En ${BULAN[month]} ${year}.pdf`);
}

/** Ulasan: per tingkat, waktu ambil, pemesan teratas (transaksi tidak dibatalkan). */
function buildUlasan(txs: Transaction[], urutAmbil: string[] = []) {
  const aktif = txs.filter((tx) => !tx.cancelledAt);
  const tingkat = new Map<string, { n: number; nilai: number }>();
  const ambil = new Map<string, number>();
  const tingkatAmbil = new Map<string, Map<string, number>>();
  const pemesan = new Map<string, { nama: string; kelas: string; n: number; nilai: number; hari: Set<string> }>();
  for (const tx of aktif) {
    const tk = tx.customer.tingkat || (tx.source === "penjualan" ? "Penjualan langsung" : "Lainnya");
    const a = tingkat.get(tk) ?? { n: 0, nilai: 0 };
    a.n++; a.nilai += tx.total; tingkat.set(tk, a);
    if (tx.source === "preorder" && tx.waktuAmbil) {
      ambil.set(tx.waktuAmbil, (ambil.get(tx.waktuAmbil) ?? 0) + 1);
      const tkPO = tx.customer.tingkat || "Lainnya";
      const m = tingkatAmbil.get(tkPO) ?? new Map<string, number>();
      m.set(tx.waktuAmbil, (m.get(tx.waktuAmbil) ?? 0) + 1);
      tingkatAmbil.set(tkPO, m);
    }
    if (tx.source === "preorder" && tx.customer.nama) {
      const key = tx.customer.nama.trim().toLowerCase() + "|" + (tx.customer.kelas ?? "");
      const pm = pemesan.get(key) ?? { nama: toTitleCase(tx.customer.nama.trim()), kelas: [tx.customer.tingkat, tx.customer.kelas].filter(Boolean).join(" "), n: 0, nilai: 0, hari: new Set<string>() };
      pm.n++; pm.nilai += tx.total; pm.hari.add(tx.serviceDate ?? wibTanggal(tx.createdAt)); pemesan.set(key, pm);
    }
  }
  return {
    tingkat: [...tingkat.entries()].sort((a, b) => b[1].nilai - a[1].nilai),
    ambil: [...ambil.entries()].sort((a, b) => b[1] - a[1]),
    // Pre-order per tingkat, dipecah menurut Waktu Ambil (urutan Waktu Ambil mengikuti Pengaturan)
    ambilUrut: [...ambil.keys()].sort((a, b) => {
      const ia = urutAmbil.indexOf(a), ib = urutAmbil.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || (ambil.get(b) ?? 0) - (ambil.get(a) ?? 0);
    }),
    tingkatAmbil: [...tingkatAmbil.entries()]
      .map(([k, m]) => ({ tingkat: k, per: m, total: [...m.values()].reduce((x, y) => x + y, 0) }))
      .sort((a, b) => b.total - a.total),
    pemesan: [...pemesan.values()].sort((a, b) => b.nilai - a.nilai).slice(0, 5),
    // Tingkat langganan: pemesan yang memesan di 2 hari berbeda atau lebih dalam bulan itu
    pemesanTotal: pemesan.size,
    pemesanKembali: [...pemesan.values()].filter((x) => x.hari.size >= 2).length,
  };
}

/** Packing Pre-order: tepat waktu vs telat dikemas. Aturan SAMA dengan halaman Pre-order: jam kemas = jam server
 * (packedAt) dibanding jam Waktu Ambil (Pengaturan, per tingkat); dikemas H-1 tidak telat; dikemas setelah hari
 * layanan = telat. Pesanan dihitung menurut TANGGAL LAYANAN yang jatuh di bulan itu. */
function hitungPacking(txs: Transaction[], schedules: PickupSchedule[], year: number, month: number) {
  const bulan = `${year}-${String(month + 1).padStart(2, "0")}`;
  const hariIniWib = wibTanggal(new Date().toISOString());
  const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  let dikemas = 0, tepat = 0, telat = 0, belum = 0, menitTotal = 0, nMenit = 0;
  for (const tx of txs) {
    if (tx.source !== "preorder" || tx.cancelledAt) continue;
    const sd = tx.serviceDate ?? wibTanggal(tx.createdAt);
    if (!sd.startsWith(bulan)) continue;
    if (!tx.packed) { if (sd < hariIniWib) belum++; continue; }
    if (!tx.packedAt) continue;
    const sched = schedules.find((x) => x.name === tx.waktuAmbil);
    const tk = tx.customer.tingkat ?? "";
    const jam = sched ? (tk === "Guru/Karyawan" ? sched.byTingkat?.[tk] : (sched.byTingkat?.[tk] || sched.defaultTime)) : undefined;
    if (!jam) continue;
    dikemas++;
    const pd = wibTanggal(tx.packedAt);
    let isLate: boolean;
    if (pd < sd) isLate = false;
    else if (pd > sd) isLate = true;
    else {
      const jamKemas = wibJam(tx.packedAt);
      isLate = jamKemas > jam;
      if (isLate) { menitTotal += toMin(jamKemas) - toMin(jam); nMenit++; }
    }
    if (isLate) telat++; else tepat++;
  }
  return { dikemas, tepat, telat, belum, rataMenit: nMenit ? Math.round(menitTotal / nMenit) : 0 };
}

const card: React.CSSProperties = { background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: "16px 16px" };
const sectionTitle: React.CSSProperties = { fontSize: 17, fontWeight: 800, marginBottom: 10 };
const pad2 = (n: number) => String(n).padStart(2, "0");

export default function Laporan({ onOpenSettings, pickupSchedules }: { onOpenSettings: () => void; pickupSchedules: PickupSchedule[] }) {
  const now = new Date(Date.now() + 7 * 3_600_000);
  const nowY = now.getUTCFullYear(), nowM = now.getUTCMonth();
  const todayYmd = `${nowY}-${pad2(nowM + 1)}-${pad2(now.getUTCDate())}`;
  const [ym, setYm] = useState<{ y: number; m: number }>({ y: nowY, m: nowM });
  const [txs, setTxs] = useState<Transaction[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"harian" | "ulasan">("ulasan");
  const [dipilih, setDipilih] = useState<string | null>(null);
  const [prev, setPrev] = useState<{ masuk: number; n: number } | null>(null);

  useEffect(() => {
    let batal = false;
    setTxs(null); setErr(null); setDipilih(null);
    fetchTransactionsMonth(ym.y, ym.m)
      .then((d) => { if (!batal) setTxs(d); })
      .catch(() => { if (!batal) setErr("Gagal memuat data. Periksa koneksi lalu coba lagi."); });
    return () => { batal = true; };
  }, [ym]);

  // Bulan lalu (hanya total Lunas) untuk perbandingan
  const prevM = ym.m === 0 ? 11 : ym.m - 1, prevY = ym.m === 0 ? ym.y - 1 : ym.y;
  useEffect(() => {
    let batal = false;
    setPrev(null);
    fetchMasukBulan(prevY, prevM).then((d) => { if (!batal) setPrev(d); }).catch(() => { /* perbandingan opsional */ });
    return () => { batal = true; };
  }, [prevY, prevM]);
  const banding: Banding | null = prev ? { prevLabel: "bulan lalu", prevMasuk: prev.masuk, berjalan: ym.y === nowY && ym.m === nowM } : null;

  const r = useMemo(() => (txs ? buildReport(txs) : null), [txs]);
  const u = useMemo(() => (txs ? buildUlasan(txs, pickupSchedules.map((x) => x.name)) : null), [txs, pickupSchedules]);
  const pk = useMemo(() => (txs ? hitungPacking(txs, pickupSchedules, ym.y, ym.m) : null), [txs, pickupSchedules, ym]);
  const perHariMap = useMemo(() => new Map(r ? r.hari : []), [r]);
  const txPerHari = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    (txs ?? []).forEach((tx) => {
      const k = wibTanggal(tx.createdAt);
      const arr = m.get(k);
      if (arr) arr.push(tx); else m.set(k, [tx]);
    });
    return m;
  }, [txs]);

  const jumlahHari = new Date(ym.y, ym.m + 1, 0).getDate();
  const ymd = (d: number) => `${ym.y}-${pad2(ym.m + 1)}-${pad2(d)}`;
  const awalBulan = ymd(1);
  const adaBerikut = ym.y * 12 + ym.m < nowY * 12 + nowM;
  const geser = (d: number) => setYm(({ y, m }) => { const v = y * 12 + m + d; return { y: Math.floor(v / 12), m: v % 12 }; });

  // Tanggal terpilih: hari ini kalau bulan berjalan; bulan lalu = hari terakhir yang ada transaksinya.
  const hariAktif = dipilih ?? (ym.y === nowY && ym.m === nowM ? todayYmd : r && r.hari.length ? r.hari[r.hari.length - 1][0] : awalBulan);
  const idxAktif = Number(hariAktif.slice(8, 10)) - 1;

  const [busy2, setBusy2] = useState(false);
  const [menuUnduh, setMenuUnduh] = useState(false);
  const download = async (jenis: "xlsx" | "pdf") => {
    if (!txs) return;
    (jenis === "pdf" ? setBusy2 : setBusy)(true);
    try {
      if (jenis === "pdf") await unduhPdf(txs, ym.y, ym.m, banding); else await unduhExcel(txs, ym.y, ym.m, banding);
    } catch { setErr(jenis === "pdf" ? "Gagal membuat file PDF." : "Gagal membuat file Excel."); }
    (jenis === "pdf" ? setBusy2 : setBusy)(false);
  };

  const navBtn = (aktif: boolean, ukuran = 48): React.CSSProperties => ({
    width: ukuran, height: ukuran, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: aktif ? t.text : t.textDis,
    cursor: aktif ? "pointer" : "default", display: "grid", placeItems: "center", flex: "none",
  });

  const siap = r && u && txs;
  const bandingPct = banding && r && banding.prevMasuk > 0 ? Math.round(((r.masuk - banding.prevMasuk) / banding.prevMasuk) * 100) : null;
  const hariIni = perHariMap.get(hariAktif);
  const rHari = useMemo(() => buildReport(txPerHari.get(hariAktif) ?? []), [txPerHari, hariAktif]);
  const maxHari = r ? Math.max(0, ...r.hari.map(([, v]) => v.masuk)) : 0;
  const hariBuka = r ? r.hari.length : 0;
  const { hi, lo } = r ? tinggiRendah(r) : { hi: null, lo: null };

  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 70px" }}>
        <div style={{ padding: "20px 20px 12px" }}>
          <div className="flex items-center justify-between">
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>Laporan</div>
            <button onClick={onOpenSettings} aria-label="Pengaturan"
              style={{ width: 44, height: 44, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}>
              <Settings size={19} />
            </button>
          </div>
        </div>

        <div style={{ padding: "0 20px" }}>
          {/* Pilih bulan */}
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <button onClick={() => geser(-1)} aria-label="Bulan sebelumnya" style={navBtn(true)}><ChevronLeft size={22} /></button>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{BULAN[ym.m]} {ym.y}</div>
            <button onClick={() => adaBerikut && geser(1)} aria-label="Bulan berikutnya" disabled={!adaBerikut} style={navBtn(adaBerikut)}><ChevronRight size={22} /></button>
          </div>

          <PaperTabs tabs={[{ id: "ulasan" as const, label: "Ulasan" }, { id: "harian" as const, label: "Pemasukan Harian" }]} value={tab} onChange={setTab} />

          {err && <div style={{ ...card, background: t.errorBg, borderColor: t.errorBg, color: t.error, fontWeight: 700, fontSize: 14.5, marginTop: 14 }}>{err}</div>}
          {!txs && !err && <div style={{ textAlign: "center", padding: "48px 0", color: t.text2, fontWeight: 600 }}>Memuat…</div>}

          {/* ===== TAB HARIAN: grafik batang sebulan + tanggal kuning + rincian hari itu ===== */}
          {siap && tab === "harian" && (
            <div style={{ paddingTop: 16 }}>
              {/* Kalender warna: makin tua kuning, makin besar uang masuk (Lunas) hari itu */}
              <div style={{ ...card, padding: "14px 12px 12px" }}>
                <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 5, textAlign: "center" }}>
                  {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((h) => (
                    <div key={h} style={{ fontSize: 12, fontWeight: 700, color: t.text2, paddingBottom: 2 }}>{h}</div>
                  ))}
                  {Array.from({ length: (new Date(ym.y, ym.m, 1).getDay() + 6) % 7 }, (_, i) => <div key={"k" + i} />)}
                  {Array.from({ length: jumlahHari }, (_, i) => {
                    const v = perHariMap.get(ymd(i + 1))?.masuk;
                    const ada = perHariMap.has(ymd(i + 1));
                    const on = i === idxAktif;
                    const bg = !ada ? "transparent" : !v ? t.divider : `rgba(255,201,51,${(0.25 + 0.75 * Math.sqrt(v / (maxHari || 1))).toFixed(2)})`;
                    return (
                      <button key={i} onClick={() => setDipilih(ymd(i + 1))} aria-label={`Pilih ${labelHari(ymd(i + 1))}`}
                        style={{ height: 46, borderRadius: 10, border: on ? `2.5px solid ${t.text}` : "none", background: bg, color: ada ? t.text : t.textDis, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-2" style={{ marginTop: 10, minHeight: 40, paddingLeft: 4 }}>
                  <div className="flex items-center gap-2" style={{ fontSize: 12.5, color: t.text2, fontWeight: 600 }}>
                    sedikit
                    <span style={{ width: 22, height: 10, borderRadius: 5, background: "rgba(255,201,51,.3)" }} />
                    <span style={{ width: 22, height: 10, borderRadius: 5, background: "rgba(255,201,51,.65)" }} />
                    <span style={{ width: 22, height: 10, borderRadius: 5, background: "rgb(255,201,51)" }} />
                    banyak
                  </div>
                  {ym.y === nowY && ym.m === nowM && hariAktif !== todayYmd && (
                    <button onClick={() => setDipilih(todayYmd)}
                      aria-label="Kembali ke hari ini" className="flex items-center gap-1.5" style={{ height: 40, padding: "0 14px", borderRadius: 999, border: `1.5px solid ${t.borderStrong}`, background: t.surface, color: t.text, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flex: "none" }}>
                      <RotateCcw size={15} /> Hari ini
                    </button>
                  )}
                </div>
              </div>

              {/* Satu kartu: tanggal terpilih (kuning) + rincian hari itu */}
              <div style={{ ...card, marginTop: 14 }}>
                {/* Kiri: label + tanggal kuning · Kanan: nominal besar + jumlah transaksi */}
                <div className="flex items-start justify-between gap-3">
                  <div style={{ flex: "none" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text2 }}>Masuk (Lunas)</div>
                    <div style={{ marginTop: 8, height: 34, padding: "0 11px", borderRadius: 10, background: t.primary, color: t.onPrimary, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 800, whiteSpace: "nowrap" }}>
                      <Calendar size={16} /> {labelHari(hariAktif)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 0 }}>
                    <div style={{ fontSize: rHari.masuk >= 10_000_000 ? 22 : 28, fontWeight: 800, color: t.text, lineHeight: 1.15, whiteSpace: "nowrap" }}>{rupiah(rHari.masuk)}</div>
                    <div style={{ fontSize: 13.5, color: t.text2, fontWeight: 600, marginTop: 6 }}>{rHari.nMasuk} transaksi Lunas</div>
                  </div>
                </div>
                <div style={{ height: 1, background: t.divider, margin: "14px 0 8px" }} />
                {!hariIni ? (
                  <div style={{ textAlign: "center", color: t.text2, fontWeight: 600, padding: "6px 0 4px" }}>Tidak ada transaksi di tanggal ini.</div>
                ) : (
                  <>
                    <Baris label="Dari Pre-order" nilai={rupiah(rHari.masukPO)} />
                    <Baris label="Dari Penjualan" nilai={rupiah(rHari.masukPJ)} />
                    <Baris label={`Belum Dibayar (${rHari.nBelum})`} nilai={rupiah(rHari.belum)} />
                    {rHari.nBatal > 0 && <Baris label="Dibatalkan (tidak dihitung)" nilai={String(rHari.nBatal)} />}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ===== TAB ULASAN: gambaran sebulan ===== */}
          {siap && tab === "ulasan" && (
            <div style={{ paddingTop: 16 }}>
              <div style={{ ...card, marginBottom: 14, position: "relative" }}>
                <button onClick={() => setMenuUnduh((v) => !v)} aria-label="Unduh laporan" aria-expanded={menuUnduh}
                  style={{ position: "absolute", top: 10, right: 10, width: 44, height: 44, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, cursor: "pointer", display: "grid", placeItems: "center" }}>
                  <Ellipsis size={22} />
                </button>
                {menuUnduh && (
                  <>
                    <style>{`@keyframes ganen-pop{from{opacity:0;transform:translateY(-8px) scale(.94)}to{opacity:1;transform:none}}`}</style>
                    <div onClick={() => setMenuUnduh(false)} style={{ position: "fixed", inset: 0, zIndex: 44, background: "rgba(47,42,36,.18)" }} />
                    <div role="menu" style={{ position: "absolute", top: 60, right: 10, zIndex: 45, width: "min(290px, calc(100% - 20px))", background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 16, boxShadow: "0 14px 34px rgba(60,48,20,.22)", padding: 6, transformOrigin: "top right", animation: "ganen-pop .16s ease-out" }}>
                      {([
                        { Ic: FileText, label: busy2 ? "Membuat PDF…" : "Unduh PDF", on: () => { setMenuUnduh(false); download("pdf"); } },
                        { Ic: FileSpreadsheet, label: busy ? "Membuat Excel…" : "Unduh Excel", on: () => { setMenuUnduh(false); download("xlsx"); } },
                      ]).map((o, i) => (
                        <button key={o.label} role="menuitem" onClick={o.on} disabled={txs.length === 0} className="flex items-center"
                          style={{ gap: 12, width: "100%", minHeight: 52, padding: "0 12px", border: "none", borderTop: i ? `1px solid ${t.divider}` : "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: t.text, opacity: txs.length === 0 ? 0.5 : 1 }}>
                          <o.Ic size={21} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 15.5, fontWeight: 700 }}>{o.label}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text2 }}>Masuk (Lunas)</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: t.text, marginTop: 2, lineHeight: 1.15 }}>{rupiah(r.masuk)}</div>
                {bandingPct !== null && banding && (
                  <div className="flex items-center gap-1.5" style={{ marginTop: 8, fontSize: 15, fontWeight: 800, color: t.text }}>
                    {bandingPct >= 0 ? <TrendingUp size={19} /> : <TrendingDown size={19} />} {Math.abs(bandingPct)}%
                    <span style={{ fontSize: 13, fontWeight: 600, color: t.text2 }}>dari bulan lalu{banding.berjalan ? " · belum penuh" : ""}</span>
                  </div>
                )}
                {/* Pre-order vs Penjualan */}
                <div style={{ display: "flex", height: 14, borderRadius: 999, overflow: "hidden", background: t.divider, margin: "16px 0 10px" }} role="img" aria-label="Pemasukan dari Pre-order dan Penjualan">
                  <div style={{ flex: r.masukPO, background: t.chart[0] }} />
                  <div style={{ flex: r.masukPJ, background: t.chart[1], borderLeft: `2px solid ${t.surface}` }} />
                </div>
                <div className="flex items-center justify-between" style={{ fontSize: 14, fontWeight: 800 }}>
                  <span className="flex items-center gap-2"><IkonKotak warna={t.chart[0]}><Utensils size={15} /></IkonKotak><span>{rpSingkat(r.masukPO)}<span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: t.text2 }}>Pre-order</span></span></span>
                  <span className="flex items-center gap-2" style={{ textAlign: "right" }}><span>{rpSingkat(r.masukPJ)}<span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: t.text2 }}>Penjualan</span></span><IkonKotak warna={t.chart[1]}><ShoppingCart size={15} /></IkonKotak></span>
                </div>
                <div className="flex gap-2" style={{ marginTop: 14 }}>
                  <div className="flex items-center gap-2" style={{ flex: 1, minWidth: 0, background: t.surfaceSoft, color: t.text, borderRadius: 12, padding: "9px 12px", fontSize: 14.5, fontWeight: 800 }}>
                    <Wallet size={18} style={{ flex: "none" }} />
                    <span style={{ minWidth: 0 }}>{rpSingkat(r.belum)}<span style={{ display: "block", fontSize: 11.5, fontWeight: 600 }}>belum dibayar · {r.nBelum}</span></span>
                  </div>
                  <div className="flex items-center gap-2" style={{ flex: "none", background: t.surfaceSoft, color: t.text2, borderRadius: 12, padding: "9px 12px", fontSize: 14.5, fontWeight: 800 }}>
                    <Ban size={18} />
                    <span>{r.nBatal}<span style={{ display: "block", fontSize: 11.5, fontWeight: 600 }}>dibatalkan</span></span>
                  </div>
                </div>
              </div>

              {txs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: t.text2, fontWeight: 600 }}>Tidak ada transaksi di bulan ini.</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
                    {hi && <Ubin Ic={TrendingUp} judul="Tertinggi" nilai={rpSingkat(hi[1].masuk)} cap={labelHari(hi[0])} />}
                    {lo && <Ubin Ic={TrendingDown} judul="Terendah" nilai={rpSingkat(lo[1].masuk)} cap={labelHari(lo[0])} />}
                    <Ubin Ic={CalendarDays} judul="Rata-rata per hari" nilai={rpSingkat(hariBuka ? Math.round(r.masuk / hariBuka) : 0)} cap={`dari ${hariBuka} hari ada transaksi`} />
                    <Ubin Ic={Receipt} judul="Rata-rata per transaksi" nilai={rpSingkat(r.nMasuk ? Math.round(r.masuk / r.nMasuk) : 0)} cap={`dari ${r.nMasuk.toLocaleString("id-ID")} transaksi Lunas`} />
                  </div>

                  {pk && pk.dikemas > 0 && (
                    <div className="flex items-center gap-4" style={{ ...card, marginBottom: 14 }}>
                      <Gauge pct={Math.round((pk.tepat / pk.dikemas) * 100)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Packing Pre-order</div>
                        <BarisPacking Ic={CircleCheck} warna={t.text} nilai={pk.tepat.toLocaleString("id-ID")} teks="pesanan dikemas tepat waktu" />
                        <BarisPacking Ic={AlarmClock} warna={t.text} nilai={pk.telat.toLocaleString("id-ID")} teks="pesanan telat dikemas" />
                        {pk.rataMenit > 0 && <BarisPacking Ic={Timer} warna={t.text} nilai={`${pk.rataMenit} mnt`} teks="rata-rata telatnya" />}
                        {pk.belum > 0 && <BarisPacking Ic={CircleDashed} warna={t.text2} nilai={pk.belum.toLocaleString("id-ID")} teks="belum ditandai dikemas" />}
                      </div>
                    </div>
                  )}

                  <div style={{ ...card, marginBottom: 14 }}>
                    <div style={sectionTitle}>Menu Terlaris · {BULAN[ym.m]} {ym.y}</div>
                    <Donat data={menuOmzet(r)} bulan={BLN_PENDEK[ym.m]} tahun={ym.y} />
                  </div>

                  {u.tingkatAmbil.length > 0 && (
                    <div style={{ ...card, marginBottom: 14 }}>
                      <div style={sectionTitle}>Pesanan per Tingkat</div>
                      <Treemap items={u.tingkatAmbil.map((x) => ({ nama: x.tingkat, n: x.total }))} />
                      <div className="flex flex-wrap" style={{ gap: 8, marginTop: 12 }}>
                        {u.ambilUrut.map((k) => (
                          <span key={k} className="flex items-center gap-1.5" style={{ border: `1.5px solid ${t.border}`, borderRadius: 999, padding: "5px 11px", fontSize: 13, fontWeight: 700 }}>
                            <Clock size={14} /> {k} <b style={{ fontWeight: 800 }}>{(u.ambil.find(([n]) => n === k)?.[1] ?? 0).toLocaleString("id-ID")}</b>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {u.pemesan.length > 0 && (
                    <div style={card}>
                      <div style={sectionTitle}>Langganan</div>
                      <Piktogram kembali={u.pemesanKembali} total={u.pemesanTotal} />
                      <Podium rows={u.pemesan} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Baris({ label, nilai, warna }: { label: string; nilai: string; warna?: string }) {
  return (
    <div className="flex items-center justify-between gap-3" style={{ padding: "5px 0" }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: t.text2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: warna ?? t.text, textAlign: "right" }}>{nilai}</div>
    </div>
  );
}

/** Daftar batang horizontal tipis: label kiri, nilai kanan, batang kuning proporsional. */
function Batang({ rows }: { rows: { label: string; nilai: number; teks: string }[] }) {
  const max = Math.max(1, ...rows.map((x) => x.nilai));
  return (
    <div>
      {rows.map((x) => (
        <div key={x.label} style={{ padding: "7px 0" }}>
          <div className="flex items-baseline justify-between gap-3">
            <div style={{ fontSize: 15, fontWeight: 700 }}>{x.label}</div>
            <div style={{ fontSize: 14.5, fontWeight: 800, fontFamily: STRUK_MONO, flex: "none" }}>{x.teks}</div>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: t.divider, marginTop: 6, overflow: "hidden" }}>
            <div style={{ width: `${Math.round((x.nilai / max) * 100)}%`, height: "100%", borderRadius: 999, background: t.primary }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Warna irisan donat = t.chart (palet E pilihan pemilik: kuning + hijau segar, selang terang/gelap
   supaya irisan bersebelahan tetap terpisah jelas). */
const IRIS = t.chart;

function Donat({ data, bulan, tahun }: { data: [string, { qty: number; nilai: number }][]; bulan: string; tahun: number }) {
  // Donat = 5 menu teratas menurut OMZET (persen terhadap kelima menu itu). Sisa menu satu baris catatan —
  // kalau digabung jadi irisan "Lainnya", irisan itu mendominasi dan donat tidak informatif.
  const top = data.slice(0, 5);
  const total = top.reduce((n, [, v]) => n + v.nilai, 0);
  if (!total) return null;
  const baris = top.map(([k, v], i) => ({ k, qty: v.qty, nilai: v.nilai, warna: IRIS[i] }));
  const R = 52, SW = 24, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div>
      <div style={{ display: "grid", placeItems: "center", margin: "4px 0 14px", position: "relative" }}>
        <svg width="170" height="170" viewBox="0 0 140 140" role="img" aria-label="Menu terlaris">
          <g transform="rotate(-90 70 70)">
            {baris.map((b) => {
              const len = (b.nilai / total) * C;
              const el = (
                <circle key={b.k} cx="70" cy="70" r={R} fill="none" stroke={b.warna} strokeWidth={SW}
                  strokeDasharray={`${Math.max(0, len - 1.5)} ${C - Math.max(0, len - 1.5)}`} strokeDashoffset={-acc} />
              );
              acc += len;
              return el;
            })}
          </g>
        </svg>
        <div style={{ position: "absolute", textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>{bulan}</div>
          <div style={{ fontSize: 14, color: t.text2, fontWeight: 700 }}>{tahun}</div>
        </div>
      </div>
      {baris.map((b) => (
        <div key={b.k} className="flex items-center gap-3" style={{ padding: "7px 0" }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: b.warna, flex: "none", border: `1px solid ${t.borderStrong}` }} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.k}</div>
          <div style={{ fontSize: 14, fontWeight: 800, fontFamily: STRUK_MONO, flex: "none" }}>×{b.qty.toLocaleString("id-ID")}</div>
          <div style={{ width: 40, textAlign: "right", fontSize: 13.5, fontWeight: 700, color: t.text2, flex: "none" }}>{Math.round((b.nilai / total) * 100)}%</div>
        </div>
      ))}
    </div>
  );
}

/** Peringkat langganan: nomor urut + batang tipis sesuai total belanja. */
function Balapan({ rows }: { rows: { nama: string; kelas: string; n: number; nilai: number }[] }) {
  const max = Math.max(1, ...rows.map((x) => x.nilai));
  return (
    <div>
      {rows.map((x, i) => {
        const pct = Math.max(4, Math.round((x.nilai / max) * 100));
        return (
          <div key={x.nama + x.kelas} style={{ padding: "10px 0", borderTop: i ? `1px solid ${t.divider}` : "none" }}>
            <div className="flex items-center gap-3">
              <div style={{ width: 36, height: 36, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", fontSize: 16, fontWeight: 800,
                background: i === 0 ? t.primary : "transparent", color: t.text, border: i === 0 ? "none" : `1.5px solid ${t.borderStrong}` }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.nama}</div>
                <div style={{ fontSize: 12.5, color: t.text2, fontWeight: 600 }}>{x.kelas ? `${x.kelas} · ` : ""}{x.n} pesanan</div>
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 800, fontFamily: STRUK_MONO, flex: "none" }}>{rupiah(x.nilai)}</div>
            </div>
            <div style={{ position: "relative", height: 8, borderRadius: 999, background: t.divider, margin: "10px 0 0 48px" }}>
              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: t.primary }} />
                          </div>
          </div>
        );
      })}
    </div>
  );
}

/** Treemap: luas kotak = jumlah pesanan Pre-order per tingkat. Tingkat kecil (<5%) digabung "Lainnya". */
function Treemap({ items }: { items: { nama: string; n: number }[] }) {
  const total = items.reduce((a, x) => a + x.n, 0);
  if (!total) return null;
  const besar = items.filter((x) => x.n / total >= 0.05).sort((a, b) => b.n - a.n);
  const kecil = items.filter((x) => x.n / total < 0.05);
  const blok = [...besar, ...(kecil.length ? [{ nama: "Lainnya", n: kecil.reduce((a, x) => a + x.n, 0), isi: kecil.map((x) => x.nama).join(", ") }] : [])] as { nama: string; n: number; isi?: string }[];
  // potong bergantian (kiri/atas) — kotak terbesar dulu
  const rects: { x: number; y: number; w: number; h: number; b: { nama: string; n: number; isi?: string } }[] = [];
  let x = 0, y = 0, w = 100, h = 62; // satuan relatif; tinggi 62% dari lebar
  let sisa = total;
  blok.forEach((b, i) => {
    if (i === blok.length - 1) { rects.push({ x, y, w, h, b }); return; }
    const frac = b.n / sisa;
    if (w >= h) { const fw = w * frac; rects.push({ x, y, w: fw, h, b }); x += fw; w -= fw; }
    else { const fh = h * frac; rects.push({ x, y, w, h: fh, b }); y += fh; h -= fh; }
    sisa -= b.n;
  });
  return (
    <div style={{ position: "relative", width: "100%", paddingTop: "62%" }} role="img" aria-label="Pesanan per tingkat">
      {rects.map((r, i) => (
        <div key={r.b.nama} title={r.b.isi ?? r.b.nama}
          style={{ position: "absolute", left: `${r.x}%`, top: `${(r.y / 62) * 100}%`, width: `${r.w}%`, height: `${(r.h / 62) * 100}%`, padding: 2, boxSizing: "border-box" }}>
          <div style={{ width: "100%", height: "100%", borderRadius: 10, background: t.chart[i % t.chart.length], color: t.text, padding: "8px 9px", boxSizing: "border-box", overflow: "hidden", lineHeight: 1.15 }}>
            <div style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.b.nama}</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{r.b.n.toLocaleString("id-ID")}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Rupiah ringkas untuk ubin/chip: Rp2,8 jt · Rp716 rb · Rp950 */
function rpSingkat(n: number): string {
  if (n >= 1_000_000) return `Rp${(n / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} jt`;
  if (n >= 1_000) return `Rp${Math.round(n / 1_000)} rb`;
  return `Rp${n}`;
}

function IkonKotak({ warna, children }: { warna: string; children: React.ReactNode }) {
  return <span style={{ width: 24, height: 24, borderRadius: 7, background: warna, color: t.onPrimary, display: "grid", placeItems: "center", flex: "none" }}>{children}</span>;
}

/** Ubin sorotan: ikon bulat + nilai besar + keterangan sangat singkat. */
function Ubin({ Ic, judul, nilai, cap }: { Ic: React.ComponentType<{ size?: number }>; judul: string; nilai: string; cap: string }) {
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: 12 }}>
      <div className="flex items-center gap-2">
        <div style={{ width: 32, height: 32, borderRadius: 10, background: t.primaryLight, color: t.text, display: "grid", placeItems: "center", flex: "none" }}><Ic size={18} /></div>
        <div style={{ fontSize: 13, fontWeight: 800, color: t.text2, lineHeight: 1.2 }}>{judul}</div>
      </div>
      <div style={{ fontSize: 21, fontWeight: 800, marginTop: 8, lineHeight: 1.15 }}>{nilai}</div>
      <div style={{ fontSize: 12.5, color: t.text2, fontWeight: 600, marginTop: 2, lineHeight: 1.25 }}>{cap}</div>
    </div>
  );
}

function BarisPacking({ Ic, warna, nilai, teks }: { Ic: React.ComponentType<{ size?: number }>; warna: string; nilai: string; teks: string }) {
  return (
    <div className="flex items-start gap-2" style={{ padding: "4px 0", color: warna }}>
      <span style={{ flex: "none", marginTop: 1 }}><Ic size={19} /></span>
      <span style={{ fontSize: 14, fontWeight: 600, color: t.text2, lineHeight: 1.3 }}><b style={{ fontSize: 16, fontWeight: 800, color: warna }}>{nilai}</b> {teks}</span>
    </div>
  );
}

/** Gauge setengah lingkaran: hijau = tepat waktu, kuning = telat. */
function Gauge({ pct }: { pct: number }) {
  const L = Math.PI * 50;
  const hijau = (pct / 100) * L;
  return (
    <div style={{ position: "relative", width: 124, height: 82, flex: "none" }}>
      <svg width="124" height="82" viewBox="0 0 120 80" role="img" aria-label={`${pct}% tepat waktu`}>
        <path d="M10,64 A50,50 0 0 1 110,64" fill="none" stroke={t.chart[0]} strokeWidth="14" />
        <path d="M10,64 A50,50 0 0 1 110,64" fill="none" stroke={t.chart[1]} strokeWidth="14" strokeDasharray={`${hijau} ${L}`} />
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 2, textAlign: "center", fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{pct}%</div>
    </div>
  );
}

/** Piktogram 10 orang: berisi = pemesan yang kembali memesan. */
function Piktogram({ kembali, total }: { kembali: number; total: number }) {
  const pct = Math.round((kembali / Math.max(1, total)) * 100);
  const isi = Math.round(pct / 10);
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="flex" style={{ justifyContent: "space-between" }} role="img" aria-label={`${pct}% pemesan kembali memesan`}>
        {Array.from({ length: 10 }, (_, i) => (
          <User key={i} size={27} strokeWidth={1.8} color={i < isi ? t.chart[1] : t.borderStrong} style={{ fill: i < isi ? t.chart[1] : "none" }} />
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800 }}>{pct}% pemesan kembali memesan</div>
      <div style={{ fontSize: 13, color: t.text2, fontWeight: 600 }}>{kembali.toLocaleString("id-ID")} dari {total.toLocaleString("id-ID")} pemesan memesan di 2 hari berbeda atau lebih</div>
    </div>
  );
}

/** Podium 3 pemesan teratas (menurut total belanja): tinggi kolom sesuai peringkat. */
function Podium({ rows }: { rows: { nama: string; kelas: string; n: number; nilai: number }[] }) {
  const tinggi = [112, 84, 64];
  const warna = [t.chart[0], t.chart[2], t.primaryLight];
  const urut = [1, 0, 2].filter((i) => rows[i]); // 2 - 1 - 3
  return (
    <div className="flex items-end" style={{ gap: 8, marginTop: 4 }}>
      {urut.map((i) => (
        <div key={i} style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: STRUK_MONO, marginBottom: 4 }}>{rpSingkat(rows[i].nilai)}</div>
          <div style={{ height: tinggi[i], borderRadius: "12px 12px 0 0", background: warna[i], border: i === 2 ? `1.5px solid ${t.chart[2]}` : "none", display: "grid", placeItems: "start center", paddingTop: 8, fontSize: 22, fontWeight: 800 }}>{i + 1}</div>
          <div style={{ height: 3, background: t.borderStrong }} />
          <div style={{ marginTop: 6, fontSize: 13.5, fontWeight: 800, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{rows[i].nama}</div>
          <div style={{ fontSize: 12, color: t.text2, fontWeight: 600 }}>{rows[i].kelas}</div>
        </div>
      ))}
    </div>
  );
}
