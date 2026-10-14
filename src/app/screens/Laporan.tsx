import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { t, STRUK_MONO } from "../../lib/theme";
import { rupiah, toTitleCase } from "../../lib/format";
import { fetchTransactionsMonth } from "../../lib/canteenApi";
import type { Transaction } from "../../types";

/* ============================================================
   LAPORAN BULANAN — dibuka dari Pengaturan → Data.
   Hanya MEMBACA (tidak mengubah/menghapus apa pun). Per bulan:
   ringkasan, per hari, menu terlaris, + unduh Excel lengkap.
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

async function unduhExcel(txs: Transaction[], year: number, month: number) {
  const { default: writeExcelFile } = await import("write-excel-file/universal");
  const r = buildReport(txs);
  const H = (v: string) => ({ value: v, fontWeight: "bold" as const });
  const rp = (v: number) => ({ value: v, type: Number, format: "#,##0" });
  const judul = `${BULAN[month]} ${year}`;

  const ringkasan = [
    [H("Laporan Canteen Gan En"), { value: judul }],
    [],
    [H("Masuk (Lunas)"), rp(r.masuk)],
    [H("   dari Pre-order"), rp(r.masukPO)],
    [H("   dari Penjualan"), rp(r.masukPJ)],
    [H("Jumlah transaksi Lunas"), { value: r.nMasuk, type: Number }],
    [H("Belum Dibayar"), rp(r.belum)],
    [H("Jumlah transaksi Belum Dibayar"), { value: r.nBelum, type: Number }],
    [H("Dibatalkan (tidak dihitung)"), { value: r.nBatal, type: Number }],
  ];
  const perHari = [
    [H("Tanggal"), H("Transaksi"), H("Masuk (Lunas)"), H("Belum Dibayar")],
    ...r.hari.map(([d, v]) => [{ value: d }, { value: v.n, type: Number }, rp(v.masuk), rp(v.belum)]),
  ];
  const menu = [
    [H("Menu"), H("Terjual"), H("Nilai")],
    ...r.menuList.map(([k, v]) => [{ value: k }, { value: v.qty, type: Number }, rp(v.nilai)]),
  ];
  const detail = [
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
    { data: ringkasan, sheet: "Ringkasan", columns: [{ width: 32 }, { width: 18 }] },
    { data: perHari, sheet: "Per Hari", columns: [{ width: 14 }, { width: 11 }, { width: 16 }, { width: 16 }], stickyRowsCount: 1 },
    { data: menu, sheet: "Menu", columns: [{ width: 38 }, { width: 10 }, { width: 14 }], stickyRowsCount: 1 },
    { data: detail, sheet: "Transaksi", columns: [{ width: 12 }, { width: 7 }, { width: 12 }, { width: 11 }, { width: 24 }, { width: 9 }, { width: 8 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 70 }], stickyRowsCount: 1 },
  ]).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Laporan Gan En ${BULAN[month]} ${year}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const card: React.CSSProperties = { background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: "16px 16px" };
const sectionTitle: React.CSSProperties = { fontSize: 17, fontWeight: 800, marginBottom: 10 };

export default function Laporan({ onClose }: { onClose: () => void }) {
  const now = new Date(Date.now() + 7 * 3_600_000);
  const nowY = now.getUTCFullYear(), nowM = now.getUTCMonth();
  const [ym, setYm] = useState<{ y: number; m: number }>({ y: nowY, m: nowM });
  const [txs, setTxs] = useState<Transaction[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let batal = false;
    setTxs(null); setErr(null);
    fetchTransactionsMonth(ym.y, ym.m)
      .then((d) => { if (!batal) setTxs(d); })
      .catch(() => { if (!batal) setErr("Gagal memuat data. Periksa koneksi lalu coba lagi."); });
    return () => { batal = true; };
  }, [ym]);

  const r = useMemo(() => (txs ? buildReport(txs) : null), [txs]);
  const maxHari = r ? Math.max(0, ...r.hari.map(([, v]) => v.masuk)) : 0;
  const adaBerikut = ym.y * 12 + ym.m < nowY * 12 + nowM;
  const geser = (d: number) => setYm(({ y, m }) => { const v = y * 12 + m + d; return { y: Math.floor(v / 12), m: v % 12 }; });

  const download = async () => {
    if (!txs) return;
    setBusy(true);
    try { await unduhExcel(txs, ym.y, ym.m); } catch { setErr("Gagal membuat file Excel."); }
    setBusy(false);
  };

  const navBtn = (aktif: boolean): React.CSSProperties => ({
    width: 48, height: 48, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: aktif ? t.text : t.textDis,
    cursor: aktif ? "pointer" : "default", display: "grid", placeItems: "center", flex: "none",
  });

  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 70px" }}>
        <div className="flex items-center gap-3" style={{ padding: "20px 20px 16px" }}>
          <button onClick={onClose} aria-label="Kembali"
            style={{ width: 40, height: 40, borderRadius: 11, border: `1px solid ${t.border}`, background: t.surface, cursor: "pointer", display: "grid", placeItems: "center", color: t.text, flex: "none" }}>
            <ArrowLeft size={20} />
          </button>
          <div style={{ fontSize: 19, fontWeight: 800 }}>Laporan</div>
        </div>

        <div style={{ padding: "0 20px" }}>
          {/* Pilih bulan */}
          <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
            <button onClick={() => geser(-1)} aria-label="Bulan sebelumnya" style={navBtn(true)}><ChevronLeft size={22} /></button>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{BULAN[ym.m]} {ym.y}</div>
            <button onClick={() => adaBerikut && geser(1)} aria-label="Bulan berikutnya" disabled={!adaBerikut} style={navBtn(adaBerikut)}><ChevronRight size={22} /></button>
          </div>

          {err && <div style={{ ...card, background: t.errorBg, borderColor: t.errorBg, color: t.error, fontWeight: 700, fontSize: 14.5, marginBottom: 14 }}>{err}</div>}

          {!txs && !err && <div style={{ textAlign: "center", padding: "48px 0", color: t.text2, fontWeight: 600 }}>Memuat…</div>}

          {r && txs && (
            <>
              {/* Ringkasan */}
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text2 }}>Masuk (Lunas)</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: t.successText, marginTop: 2 }}>{rupiah(r.masuk)}</div>
                <div style={{ fontSize: 13.5, color: t.text2, fontWeight: 600, marginTop: 2 }}>{r.nMasuk} transaksi</div>

                <div style={{ height: 1, background: t.divider, margin: "14px 0" }} />

                <Baris label="Dari Pre-order" nilai={rupiah(r.masukPO)} />
                <Baris label="Dari Penjualan" nilai={rupiah(r.masukPJ)} />

                <div style={{ height: 1, background: t.divider, margin: "12px 0" }} />

                <Baris label={`Belum Dibayar (${r.nBelum})`} nilai={rupiah(r.belum)} warna={r.belum > 0 ? t.error : undefined} />
                <Baris label="Dibatalkan (tidak dihitung)" nilai={`${r.nBatal}`} />
              </div>

              {/* Unduh */}
              <button onClick={download} disabled={busy || txs.length === 0}
                className="flex items-center justify-center gap-2"
                style={{ width: "100%", height: 54, borderRadius: 14, border: "none", background: t.primary, color: t.onPrimary, fontSize: 16, fontWeight: 800, cursor: busy ? "default" : "pointer", opacity: txs.length === 0 ? 0.5 : 1, marginBottom: 6 }}>
                <Download size={20} /> {busy ? "Membuat file…" : "Unduh Excel"}
              </button>
              <div style={{ fontSize: 12.5, color: t.text2, textAlign: "center", marginBottom: 18 }}>
                Isi: ringkasan, per hari, menu terjual, dan semua transaksi bulan ini.
              </div>

              {txs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: t.text2, fontWeight: 600 }}>Tidak ada transaksi di bulan ini.</div>
              ) : (
                <>
                  {/* Per hari — satu baris: tanggal kiri, uang masuk kanan, batang tipis proporsional */}
                  <div style={{ ...card, marginBottom: 14 }}>
                    <div style={sectionTitle}>Per Hari</div>
                    {r.hari.map(([d, v]) => (
                      <div key={d} style={{ padding: "8px 0" }}>
                        <div className="flex items-baseline justify-between">
                          <div style={{ fontSize: 15, fontWeight: 700 }}>{labelHari(d)}</div>
                          <div style={{ fontSize: 15, fontWeight: 800, fontFamily: STRUK_MONO }}>{rupiah(v.masuk)}</div>
                        </div>
                        <div style={{ height: 6, borderRadius: 999, background: t.divider, marginTop: 6, overflow: "hidden" }}>
                          <div style={{ width: `${maxHari ? Math.round((v.masuk / maxHari) * 100) : 0}%`, height: "100%", borderRadius: 999, background: t.primary }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Menu terlaris — donat 5 teratas + Lainnya */}
                  <div style={{ ...card }}>
                    <div style={sectionTitle}>Menu Terlaris</div>
                    <Donat data={r.menuList} />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Baris({ label, nilai, warna }: { label: string; nilai: string; warna?: string }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: "5px 0" }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: t.text2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: warna ?? t.text }}>{nilai}</div>
    </div>
  );
}

/* Warna irisan: hanya dari palet (kuning madu, hijau, khaki, kuning, abu-kuning) — selang terang/gelap
   supaya irisan bersebelahan tetap terpisah jelas. "Lainnya" = warna garis. */
const IRIS = ["#F2B53C", "#5BAF4E", "#FFE66D", "#A59B80", "#D6D0B0"];

function Donat({ data }: { data: [string, { qty: number; nilai: number }][] }) {
  // Donat = 5 menu teratas saja (persen terhadap kelima menu itu). Sisa menu satu baris catatan —
  // kalau digabung jadi irisan "Lainnya", irisan itu mendominasi dan donat tidak informatif.
  const top = data.slice(0, 5);
  const total = top.reduce((n, [, v]) => n + v.qty, 0);
  if (!total) return null;
  const lain = data.slice(5).reduce((n, [, v]) => n + v.qty, 0);
  const baris = top.map(([k, v], i) => ({ k, qty: v.qty, warna: IRIS[i] }));
  const R = 52, SW = 24, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div>
      <div style={{ display: "grid", placeItems: "center", margin: "4px 0 14px", position: "relative" }}>
        <svg width="170" height="170" viewBox="0 0 140 140" role="img" aria-label="Menu terlaris">
          <g transform="rotate(-90 70 70)">
            {baris.map((b) => {
              const len = (b.qty / total) * C;
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
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>{total.toLocaleString("id-ID")}</div>
          <div style={{ fontSize: 12.5, color: t.text2, fontWeight: 600 }}>5 teratas</div>
        </div>
      </div>
      {baris.map((b) => (
        <div key={b.k} className="flex items-center gap-3" style={{ padding: "7px 0" }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: b.warna, flex: "none", border: `1px solid ${t.borderStrong}` }} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.k}</div>
          <div style={{ fontSize: 14, fontWeight: 800, fontFamily: STRUK_MONO, flex: "none" }}>×{b.qty.toLocaleString("id-ID")}</div>
          <div style={{ width: 40, textAlign: "right", fontSize: 13.5, fontWeight: 700, color: t.text2, flex: "none" }}>{Math.round((b.qty / total) * 100)}%</div>
        </div>
      ))}
      {lain > 0 && (
        <div style={{ fontSize: 13, color: t.text2, fontWeight: 600, marginTop: 8 }}>
          Menu lainnya ×{lain.toLocaleString("id-ID")} · daftar lengkap ada di file Excel
        </div>
      )}
    </div>
  );
}
