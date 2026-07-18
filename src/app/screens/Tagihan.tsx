import { useMemo, useState, useEffect, useRef } from "react";
import {
  Search, X, Check, Trash2, Share2, ShoppingCart, Utensils,
  Undo2, Wallet, Settings, History, Ban, ChevronDown, ChevronUp, RotateCcw, Calendar, ArrowUpDown,
} from "lucide-react";
import { t, NAV_HEIGHT } from "../../lib/theme";
import { rupiah, fmtWaDate, todayISO, serviceDateLabel } from "../../lib/format";
import PaperTabs from "../components/PaperTabs";
import { tingkatColor } from "../../lib/constants";
import type { Transaction, CanteenSettings } from "../../types";

/* ============================================================
   TRANSAKSI — Canteen Gan En
   Belum Dibayar: dikelompokkan per Nama + WA (auto-merge).
   Lunas: dikelompokkan per Nama + WA (terbaru di atas).
   ============================================================ */

const BLN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
/** Rincian transaksi (tanggal · item · harga) pakai font thermal/mono
 * seperti struk PO — kontras dengan Jakarta Sans di kartu info anak,
 * supaya fokus tidak terbagi. */
const MONO = "'JetBrains Mono', ui-monospace, 'Cascadia Mono', 'SF Mono', 'Roboto Mono', 'Courier New', monospace";
/* Tepi zigzag struk thermal — dipakai popup rincian & konfirmasi Lunaskan */
const ZIGZAG = "polygon(0 4px, 4% 0, 8% 4px, 12% 0, 16% 4px, 20% 0, 24% 4px, 28% 0, 32% 4px, 36% 0, 40% 4px, 44% 0, 48% 4px, 52% 0, 56% 4px, 60% 0, 64% 4px, 68% 0, 72% 4px, 76% 0, 80% 4px, 84% 0, 88% 4px, 92% 0, 96% 4px, 100% 0, 100% calc(100% - 4px), 96% 100%, 92% calc(100% - 4px), 88% 100%, 84% calc(100% - 4px), 80% 100%, 76% calc(100% - 4px), 72% 100%, 68% calc(100% - 4px), 64% 100%, 60% calc(100% - 4px), 56% 100%, 52% calc(100% - 4px), 48% 100%, 44% calc(100% - 4px), 40% 100%, 36% calc(100% - 4px), 32% 100%, 28% calc(100% - 4px), 24% 100%, 20% calc(100% - 4px), 16% 100%, 12% calc(100% - 4px), 8% 100%, 4% calc(100% - 4px), 0 100%)";
/** Label transaksi memakai TANGGAL OPERASIONAL (Tanggal Layanan), bukan
 * tanggal input — transaksi susulan tgl 14 yang diketik tgl 16 tampil
 * "14 Jul · dicatat 16/07", bukan "16 Jul". */
const fmtTxOp = (tx: Transaction) => {
  const op = tx.serviceDate || tx.createdAt.slice(0, 10);
  const od = new Date(op + "T00:00:00");
  const base = `${od.getDate()} ${BLN[od.getMonth()]}`;
  const created = tx.createdAt.slice(0, 10);
  if (created === op) {
    const c = new Date(tx.createdAt);
    const hh = c.getHours().toString().padStart(2, "0");
    const mm = c.getMinutes().toString().padStart(2, "0");
    return `${base} · ${hh}:${mm}`;
  }
  return `${base} · dicatat ${created.slice(8, 10)}/${created.slice(5, 7)}`;
};
/** Nomor WA dinormalkan: hanya angka; "62…" dan "8…" (lupa 0) disamakan
 * jadi format "08…" — untuk deteksi kakak-adik satu nomor. */
const normWa = (wa?: string) => {
  let d = (wa || "").replace(/\D/g, "");
  if (d.startsWith("62")) d = "0" + d.slice(2);
  else if (d.startsWith("8")) d = "0" + d;
  return d;
};
/** Kunci grup = NAMA + KELAS (identitas anak), BUKAN nomor WA — ortu sering
 * salah ketik nomor (kurang 0, angka kebalik) dan itu sempat memecah anak
 * yang sama jadi beberapa kartu. Nama dinormalkan dari spasi ganda/ujung. */
const normNama = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const normKelas = (c: Transaction["customer"]) => (c.kelas || c.tingkat || "").replace(/\s+/g, "").toLowerCase();
const groupKey = (c: Transaction["customer"]) => `${normNama(c.nama)}|${normKelas(c)}`;

/** Gabungkan transaksi jadi kartu per ANAK dengan aturan ganda:
 * nama sama + (kelas cocok ATAU nomor WA cocok) = anak yang sama.
 * Menutup dua sumber dobel sekaligus: ortu salah ketik nomor (kurang 0,
 * angka kebalik) DAN ortu salah ketik kelas (6A vs "6 B") — selama salah
 * satunya masih cocok, kartu tetap SATU. Kartu memakai data ketikan terbaru. */
function unionGroups(txs: Transaction[]) {
  type G = { customer: Transaction["customer"]; txs: Transaction[]; newestAt: string; _nama: string; _kelas: Set<string>; _wa: Set<string> };
  const list: G[] = [];
  for (const tx of txs) {
    const c = tx.customer;
    const nn = normNama(c.nama); const kn = normKelas(c); const wn = normWa(c.wa);
    let g = list.find((x) => x._nama === nn && (x._kelas.has(kn) || (!!wn && x._wa.has(wn))));
    if (!g) { g = { customer: c, txs: [], newestAt: tx.createdAt, _nama: nn, _kelas: new Set(), _wa: new Set() }; list.push(g); }
    g.txs.push(tx);
    g._kelas.add(kn); if (wn) g._wa.add(wn);
    if (tx.createdAt >= g.newestAt) { g.newestAt = tx.createdAt; g.customer = c; }
  }
  return list;
}

type Tab = "unpaid" | "riwayat" | "batal";
type SourceFilter = "semua" | "preorder" | "penjualan";
type DateFilter = "semua" | "hari" | "7" | "tanggal";
type SortMode = "az" | "za" | "newest" | "oldest";
const SORT_LABEL: Record<SortMode, string> = { az: "A–Z", za: "Z–A", newest: "Terbaru", oldest: "Terlama" };
/** Satu fungsi urut dipakai kartu Belum Dibayar & Lunas/Dibatalkan supaya
 * konsisten — "Terbaru/Terlama" memakai transaksi paling akhir per kartu. */
function sortGroups<G extends { customer: Transaction["customer"]; newestAt: string }>(list: G[], mode: SortMode): G[] {
  const byName = (a: G, b: G) => a.customer.nama.localeCompare(b.customer.nama, "id", { sensitivity: "base" });
  const sorted = [...list];
  if (mode === "az") sorted.sort(byName);
  else if (mode === "za") sorted.sort((a, b) => byName(b, a));
  else if (mode === "newest") sorted.sort((a, b) => b.newestAt.localeCompare(a.newestAt));
  else sorted.sort((a, b) => a.newestAt.localeCompare(b.newestAt));
  return sorted;
}

/** Tanggal operasional transaksi: Tanggal Layanan bila ada (pre-order &
 * penjualan susulan), jatuh ke tanggal input untuk transaksi lama. */
const opDate = (tx: Transaction) => tx.serviceDate || tx.createdAt.slice(0, 10);
const isoShift = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
type UndoAction = { type: "paid"; tx: Transaction } | { type: "cancel"; tx: Transaction };

export default function Tagihan({
  transactions,
  settings,
  onMarkPaid,
  onUnmarkPaid,
  onCancel,
  onRestore,
  onMoveToTrash,
  onChangeDate,
  onMarkBilled,
  onOpenSettings,
}: {
  transactions: Transaction[];
  settings: CanteenSettings;
  onMarkPaid: (id: string) => void;
  onUnmarkPaid: (id: string) => void;
  onCancel: (id: string) => void;
  onRestore: (tx: Transaction) => void;
  onMoveToTrash: (id: string) => void;
  onChangeDate: (id: string, date: string) => void;
  onMarkBilled: (ids: string[]) => void;
  onOpenSettings: () => void;
}) {
  const [tab, setTab] = useState<Tab>("unpaid");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("semua");
  const [dateFilter, setDateFilter] = useState<DateFilter>("semua");
  /** Tab Dibatalkan berdiri sendiri; kode grup riwayat dipakai bersama. */
  const riwayatFilter: "lunas" | "batal" = tab === "batal" ? "batal" : "lunas";
  const [pickDate, setPickDate] = useState("");
  const [dateSheet, setDateSheet] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("az");
  const [sortSheet, setSortSheet] = useState(false);
  /** Chip "Belum Ditagih" — hanya di tab Belum Dibayar; kartu yang SEMUA
   * transaksinya sudah ditagih (hijau) disembunyikan, supaya yang belum
   * dihubungi tidak tenggelam di antara yang sudah beres. */
  const [onlyUnbilled, setOnlyUnbilled] = useState(false);

  const fmtShort = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "…");
  const dateChipLabel =
    dateFilter === "semua" ? "Tanggal"
      : dateFilter === "hari" ? "Hari Ini"
      : dateFilter === "7" ? "7 Hari"
      : pickDate ? fmtShort(pickDate) : "Pilih Tanggal";
  const [q, setQ] = useState("");
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** Draf WA. `siblings` = grup lain (anak lain) dengan nomor WA sama —
   * ditawarkan digabung jadi SATU pesan supaya ortu tidak ditagih dua kali. */
  const [waDraft, setWaDraft] = useState<{
    wa: string; text: string; txIds: string[];
    base: { customer: Transaction["customer"]; txs: Transaction[]; total: number };
    siblings: { customer: Transaction["customer"]; txs: Transaction[]; total: number }[];
    merged: boolean;
  } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [highlightedTxId, setHighlightedTxId] = useState<string | null>(null);
  const [trashConfirmTx, setTrashConfirmTx] = useState<Transaction | null>(null);
  const prevTxIdsRef = useRef<Set<string>>(new Set());
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toTitleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

  useEffect(() => { if (!undo) return; const id = setTimeout(() => setUndo(null), 5000); return () => clearTimeout(id); }, [undo]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2200); return () => clearTimeout(id); }, [toast]);

  /* Deteksi pesanan baru masuk ke grup yang sudah ada → expand + highlight */
  useEffect(() => {
    const currentIds = new Set(transactions.map((tx) => tx.id));
    const prevIds = prevTxIdsRef.current;

    if (prevIds.size > 0) {
      for (const id of currentIds) {
        if (prevIds.has(id)) continue;
        const newTx = transactions.find((tx) => tx.id === id);
        if (!newTx || newTx.paid || newTx.cancelledAt) continue;
        const key = groupKey(newTx.customer);
        const hasExisting = transactions.some(
          (tx) => tx.id !== id && !tx.paid && !tx.cancelledAt && groupKey(tx.customer) === key
        );
        if (hasExisting) {
          if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
          setHighlightedTxId(id);
          setExpandedGroups((prev) => new Set([...prev, key]));
          highlightTimerRef.current = setTimeout(() => setHighlightedTxId(null), 2000);
        }
      }
    }
    prevTxIdsRef.current = currentIds;
  }, [transactions]);

  const toggleGroup = (key: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const bySource = (tx: Transaction) => sourceFilter === "semua" || tx.source === sourceFilter;

  /* Filter tanggal operasional — murni tampilan baca, tidak menyentuh
     sesi PO. */
  const byDate = (tx: Transaction) => {
    if (dateFilter === "semua") return true;
    const d = opDate(tx);
    if (dateFilter === "hari") return d === todayISO();
    if (dateFilter === "7") return d >= isoShift(6) && d <= todayISO();
    return !pickDate || d === pickDate;
  };
  const matchQuery = (nama: string, kelas: string, wa?: string) => {
    const ql = q.toLowerCase().trim();
    if (!ql) return true;
    return `${nama} ${kelas} ${wa || ""}`.toLowerCase().includes(ql);
  };

  const unpaid = useMemo(
    () => transactions.filter((x) => !x.paid && !x.cancelledAt && bySource(x) && byDate(x)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, sourceFilter, dateFilter, pickDate]
  );

  /* Grupkan Belum Dibayar per ANAK (aturan ganda unionGroups), urut sesuai sortMode */
  const groups = useMemo(() => {
    const filtered = unpaid.filter((tx) => matchQuery(tx.customer.nama, tx.customer.kelas, tx.customer.wa));
    const built = unionGroups(filtered)
      .map((g) => ({ customer: g.customer, txs: g.txs, newestAt: g.newestAt, total: g.txs.reduce((s, tx) => s + tx.total, 0) }))
      .filter((g) => !onlyUnbilled || !g.txs.every((tx) => tx.billedAt));
    return sortGroups(built, sortMode);
  }, [unpaid, q, sortMode, onlyUnbilled]);

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);

  /* Grupkan Lunas/Dibatalkan per ANAK (aturan ganda unionGroups), urut A–Z */
  const riwayatGroups = useMemo(() => {
    const done = transactions.filter(
      (x) => (riwayatFilter === "lunas" ? (x.paid && !x.cancelledAt) : !!x.cancelledAt)
        && bySource(x) && byDate(x) && matchQuery(x.customer.nama, x.customer.kelas, x.customer.wa)
    );
    const built = unionGroups(done).map((g) => ({
      customer: g.customer, newestAt: g.newestAt,
      txs: [...g.txs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      totalMasuk: g.txs.reduce((s, tx) => s + (tx.paid && !tx.cancelledAt ? tx.total : 0), 0),
    }));
    return sortGroups(built, sortMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, sourceFilter, q, dateFilter, pickDate, riwayatFilter, sortMode]);

  // Total header tab Lunas = SELALU murni Lunas (tak terpengaruh sub-filter)
  const historyMasuk = useMemo(
    () => transactions
      .filter((x) => x.paid && !x.cancelledAt && bySource(x) && byDate(x) && matchQuery(x.customer.nama, x.customer.kelas, x.customer.wa))
      .reduce((s, x) => s + x.total, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, sourceFilter, q, dateFilter, pickDate]
  );

  // Total tab Dibatalkan (abu-abu, sekadar informasi)
  const batalTotal = useMemo(
    () => (tab === "batal" ? riwayatGroups.reduce((s, g) => s + g.txs.reduce((s2, tx) => s2 + tx.total, 0), 0) : 0),
    [tab, riwayatGroups]
  );

  const markPaid = (tx: Transaction) => { onMarkPaid(tx.id); setUndo({ type: "paid", tx }); };
  const cancel = (tx: Transaction) => { onCancel(tx.id); setUndo({ type: "cancel", tx }); };
  const pulihkan = (tx: Transaction) => {
    onRestore(tx);
    if (undo?.type === "cancel" && undo.tx.id === tx.id) setUndo(null);
    setToast(`Dipulihkan — ${tx.customer.nama} kembali ke Belum Dibayar`);
  };
  const doUndo = () => {
    if (!undo) return;
    if (undo.type === "paid") onUnmarkPaid(undo.tx.id);
    else onRestore(undo.tx);
    setUndo(null);
  };

  /* Popup struk per transaksi: ketuk baris tanggal → rincian (untuk hari apa,
     dicatat kapan) + tombol Ubah Tanggal Layanan. detailTx menyimpan SNAPSHOT
     objek transaksi, jadi reload realtime tidak menutup picker (fix iOS). */
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [confirmLunas, setConfirmLunas] = useState<{ customer: Transaction["customer"]; txs: Transaction[]; total: number } | null>(null);

  const dateTap = (tx: Transaction) => (
    <button onClick={() => setDetailTx(tx)}
      style={{ background: "transparent", border: "none", padding: "10px 4px", margin: "-10px -4px", cursor: "pointer", minHeight: 44, display: "inline-flex", alignItems: "center" }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: t.text2, fontFamily: MONO, borderBottom: `1.5px dashed ${t.border}`, paddingBottom: 1 }}>
        {fmtTxOp(tx)}
      </span>
    </button>
  );

  /** Bangun pesan tagihan. 1 grup = format lama persis; >1 grup (kakak-adik
   * satu nomor WA) = satu pesan dengan bagian per anak + Subtotal, lalu
   * SATU Total Pembayaran gabungan. */
  const buildWaMsg = (gs: { customer: Transaction["customer"]; txs: Transaction[]; total: number }[]) => {
    const txBlocksOf = (g: (typeof gs)[number]) => g.txs.map((tx) => {
      const itemLines = tx.items
        .map((it) => `• ${it.name.trim()}${it.variant ? ` (${it.variant.trim()})` : ""} ×${it.qty} = ${rupiah(it.price * it.qty)}`)
        .join("\n");
      // Tanggal di tagihan = TANGGAL LAYANAN; entri susulan tanpa jam input
      const op = opDate(tx);
      const tgl = tx.createdAt.slice(0, 10) === op ? fmtWaDate(tx.createdAt) : serviceDateLabel(op);
      return `[${tgl}]\n${itemLines}`;
    }).join("\n\n");
    const bankLine = [settings.namaBank, settings.noRekening].filter(Boolean).join(" ");
    const bankSection = bankLine
      ? `\n\n${bankLine}${settings.namaRekening ? `\na.n. ${settings.namaRekening}` : ""}`
      : "";
    const sections = gs.map((g) =>
      `Nama: ${toTitleCase(g.customer.nama)}\nKelas: ${g.customer.kelas || g.customer.tingkat || "-"}\n\n${txBlocksOf(g)}${gs.length > 1 ? `\nSubtotal: ${rupiah(g.total)}` : ""}`
    ).join("\n\n--------------------\n\n");
    const total = gs.reduce((s, g) => s + g.total, 0);
    return `${settings.waOpening}\n\n${sections}\nTotal Pembayaran: ${rupiah(total)}\n\n${settings.waClosing}${bankSection}\n\nGan En 🙏🏻`;
  };
  const shareWA = (g: { customer: Transaction["customer"]; txs: Transaction[]; total: number }) => {
    const wa = g.customer.wa?.replace(/\D/g, "");
    if (!wa) { setToast("Nomor WhatsApp belum ada untuk murid ini."); return; }
    // Anak lain (nama beda) yang nomor WA-nya sama → tawarkan gabung tagihan
    const meNama = g.customer.nama.trim().replace(/\s+/g, " ").toLowerCase();
    const siblings = groups.filter(
      (o) => o.customer.nama.trim().replace(/\s+/g, " ").toLowerCase() !== meNama
        && normWa(o.customer.wa) === normWa(g.customer.wa)
    );
    setWaDraft({
      wa: wa.startsWith("0") ? "62" + wa.slice(1) : wa,
      text: buildWaMsg([g]),
      txIds: g.txs.map((tx) => tx.id),
      base: g, siblings, merged: false,
    });
  };
  const toggleMergeWa = () => {
    if (!waDraft) return;
    const merged = !waDraft.merged;
    const gs = merged ? [waDraft.base, ...waDraft.siblings] : [waDraft.base];
    setWaDraft({
      ...waDraft, merged,
      text: buildWaMsg(gs),
      txIds: gs.flatMap((g) => g.txs.map((tx) => tx.id)),
    });
  };
  const sendWA = () => {
    if (!waDraft) return;
    window.open(`https://wa.me/${waDraft.wa}?text=${encodeURIComponent(waDraft.text)}`, "_blank");
    onMarkBilled(waDraft.txIds); // penanda "sudah ditagih" — sinkron antar gadget
    setWaDraft(null);
  };

  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 90px" }}>

        {/* Judul & total — ringan, IKUT SCROLL (bukan sticky): fokus halaman
            adalah memproses daftar transaksi, bukan dashboard keuangan */}
        <div className="flex items-center justify-between" style={{ padding: "18px 20px 6px" }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>Transaksi</div>
          <div className="flex items-center gap-2">
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10.5, color: t.text2, fontWeight: 600 }}>
                {tab === "unpaid" ? "Total Belum Dibayar" : tab === "riwayat" ? "Masuk (Lunas)" : "Dibatalkan"}
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: tab === "unpaid" ? t.amberText : tab === "riwayat" ? t.successText : t.text2 }}>
                {rupiah(tab === "unpaid" ? grandTotal : tab === "riwayat" ? historyMasuk : batalTotal)}
              </div>
            </div>
            <button onClick={onOpenSettings} aria-label="Pengaturan"
              style={{ width: 36, height: 36, borderRadius: 11, border: `1px solid ${t.border}`, background: t.surface, color: t.text2, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}>
              <Settings size={16} />
            </button>
          </div>
        </div>

        {/* Sticky: hanya alat kerja — tab, cari, satu baris filter */}
        <div style={{ padding: "4px 20px 10px", position: "sticky", top: 0, background: t.bg, zIndex: 5 }}>
          <PaperTabs
            tabs={[
              { id: "unpaid", label: "Belum Dibayar" },
              { id: "riwayat", label: "Lunas" },
              { id: "batal", label: "Dibatalkan" },
            ]}
            value={tab}
            onChange={setTab}
          />

          {/* Cari — ramping, tanpa border berat */}
          <div className="flex items-center gap-2" style={{ marginTop: 10, background: t.surfaceSoft, border: `1px solid ${t.divider}`, borderRadius: 11, padding: "0 12px", height: 42 }}>
            <Search size={17} color={t.textDis} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, kelas, atau WhatsApp…"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 14.5, width: "100%", color: t.text, fontFamily: "inherit" }} />
            {q && <X size={17} color={t.text2} style={{ cursor: "pointer" }} onClick={() => setQ("")} />}
          </div>

          {/* SATU baris filter: chip sumber (senyap saat nonaktif) + satu
              tombol tanggal yang membuka sheet — bukan dua deret chip */}
          <div className="flex items-center gap-1" style={{ marginTop: 8, flexWrap: "wrap", rowGap: 6 }}>
            {([["semua", "Semua"], ["preorder", "PO"], ["penjualan", "Penjualan"]] as const).map(([val, label]) => {
              const on = sourceFilter === val;
              return (
                <button key={val} onClick={() => setSourceFilter(val)}
                  style={{ flex: "none", height: 32, padding: "0 11px", borderRadius: 999, fontSize: 12.5, fontWeight: on ? 700 : 600, cursor: "pointer",
                    border: `1px solid ${on ? t.primary : "transparent"}`, background: on ? t.primaryLight : "transparent", color: on ? t.amberText : t.text2 }}>
                  {label}
                </button>
              );
            })}
            {tab === "unpaid" && (
              <button onClick={() => setOnlyUnbilled((v) => !v)}
                style={{ flex: "none", height: 32, padding: "0 11px", borderRadius: 999, fontSize: 12.5, fontWeight: onlyUnbilled ? 700 : 600, cursor: "pointer",
                  border: `1px solid ${onlyUnbilled ? t.primary : "transparent"}`, background: onlyUnbilled ? t.primaryLight : "transparent", color: onlyUnbilled ? t.amberText : t.text2 }}>
                Belum Ditagih
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button onClick={() => setSortSheet(true)} aria-label="Urutkan"
              style={{ flex: "none", width: 32, height: 32, borderRadius: 999, cursor: "pointer",
                border: `1px solid ${sortMode !== "az" ? t.primary : t.border}`, background: sortMode !== "az" ? t.primaryLight : t.surface, color: sortMode !== "az" ? t.amberText : t.text2, display: "grid", placeItems: "center" }}>
              <ArrowUpDown size={14} />
            </button>
            <button onClick={() => setDateSheet(true)}
              className="flex items-center gap-1"
              style={{ flex: "none", height: 32, padding: "0 11px", borderRadius: 999, fontSize: 12.5, fontWeight: dateFilter !== "semua" ? 700 : 600, cursor: "pointer",
                border: `1px solid ${dateFilter !== "semua" ? t.primary : t.border}`, background: dateFilter !== "semua" ? t.primaryLight : t.surface, color: dateFilter !== "semua" ? t.amberText : t.text2 }}>
              <Calendar size={13} /> {dateChipLabel} <ChevronDown size={13} />
            </button>
          </div>
        </div>

        {/* ---- Tab: Belum Dibayar ---- */}
        {tab === "unpaid" && (
          <div style={{ padding: "4px 20px" }}>
            {groups.length === 0 ? <Empty q={q} /> : groups.map((g) => {
              const key = groupKey(g.customer);
              const expanded = expandedGroups.has(key);
              return (
                <div key={key} style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 16, marginBottom: 14, overflow: "hidden" }}>

                  {/* Header grup — klik untuk expand/collapse */}
                  <button onClick={() => toggleGroup(key)} style={{ width: "100%", padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                    <div className="flex items-center justify-between" style={{ gap: 10 }}>
                      <div className="flex items-center gap-2" style={{ minWidth: 0, flexWrap: "wrap", flex: 1 }}>
                        <span style={{ fontSize: 18, fontWeight: 800 }}>{g.customer.nama}</span>
                        <span style={{ background: tingkatColor(g.customer.tingkat, g.customer.kelas), color: "#FFFCF7", padding: "2px 10px", borderRadius: 999, fontSize: 13, fontWeight: 800, flex: "none" }}>
                          {g.customer.kelas || g.customer.tingkat}
                        </span>
                      </div>
                      <div className="flex items-center gap-2" style={{ flex: "none" }}>
                        <span style={{ fontSize: 20, fontWeight: 800 }}>{rupiah(g.total)}</span>
                        {expanded ? <ChevronUp size={18} color={t.text2} /> : <ChevronDown size={18} color={t.text2} />}
                      </div>
                    </div>
                    <div className="flex items-center gap-3" style={{ marginTop: 4 }}>
                      {g.customer.wa && <span style={{ fontSize: 13, color: t.text2 }}>{g.customer.wa}</span>}
                      <span style={{ fontSize: 13, color: t.text2 }}>{g.txs.length} transaksi</span>
                    </div>
                  </button>

                  {/* Daftar transaksi (hanya kalau expanded) */}
                  {expanded && g.txs.map((tx) => (
                    <div key={tx.id}
                      style={{ padding: "12px 16px 14px", borderTop: `1px solid ${t.divider}`,
                        background: tx.id === highlightedTxId ? "#FFF4DA" : t.surfaceSoft,
                        transition: "background 0.4s ease" }}>
                      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                        <div className="flex items-center gap-2">
                          <SourceTag source={tx.source} />
                          {dateTap(tx)}
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: t.text2, fontFamily: MONO }}>{rupiah(tx.total)}</span>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        {tx.items.map((it, i) => (
                          <div key={i} style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.8, fontFamily: MONO }}>
                            {it.name}{it.variant ? ` (${it.variant})` : ""} ×{it.qty}
                          </div>
                        ))}
                        {tx.waktuAmbil && (
                          <div style={{ fontSize: 12, color: t.text2, marginTop: 4, fontFamily: MONO }}>{tx.waktuAmbil}</div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => markPaid(tx)} className="flex items-center justify-center gap-1.5"
                          style={{ flex: 1, height: 44, borderRadius: 11, border: "none", background: t.success, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                          <Check size={17} /> Tandai Lunas
                        </button>
                        <button onClick={() => cancel(tx)}
                          style={{ width: 48, height: 44, borderRadius: 11, border: `1.5px solid ${t.border}`, background: t.surface, color: t.error, cursor: "pointer", display: "grid", placeItems: "center" }}
                          title="Batalkan">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Footer aksi — ikon kompak rata kanan, supaya deret kartu
                      tidak ramai oleh tombol besar yang berulang-ulang */}
                  <div className="flex items-center justify-end gap-2" style={{ padding: "10px 16px", borderTop: `1px solid ${t.divider}` }}>
                    {/* Tombol share BERUBAH HIJAU "Ditagih dd/mm" setelah tagihan
                        dikirim via WA — sekali lihat tahu belum/sudah ditagih.
                        Tetap bisa diketuk untuk mengirim ulang. */}
                    {g.txs.every((tx) => tx.billedAt) ? (() => {
                      const b = g.txs.reduce((m, tx) => (tx.billedAt! > m ? tx.billedAt! : m), g.txs[0].billedAt!);
                      return (
                        <button onClick={() => shareWA(g)} title="Sudah ditagih — ketuk untuk kirim ulang" aria-label="Bagikan WA"
                          className="flex items-center gap-1.5"
                          style={{ height: 44, padding: "0 14px", borderRadius: 12, border: "1.5px solid #D8E6D4", background: t.successBg, color: t.successText, cursor: "pointer", fontWeight: 800, fontSize: 13, flex: "none" }}>
                          <Share2 size={15} /> Ditagih {b.slice(8, 10)}/{b.slice(5, 7)}
                        </button>
                      );
                    })() : (
                      <button onClick={() => shareWA(g)} title="Bagikan WA" aria-label="Bagikan WA"
                        style={{ width: 44, height: 44, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}>
                        <Share2 size={18} />
                      </button>
                    )}
                    <button onClick={() => setConfirmLunas(g)}
                      style={{ height: 44, padding: "0 18px", borderRadius: 12, border: "none", background: t.primary, color: t.text, cursor: "pointer", fontWeight: 800, fontSize: 14, flex: "none" }}>
                      Lunaskan
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ---- Tab: Lunas & Dibatalkan (render sama, isi beda) ---- */}
        {tab !== "unpaid" && (
          <div style={{ padding: "4px 20px" }}>
            {riwayatGroups.length === 0 ? (
              <div style={{ textAlign: "center", padding: "56px 20px" }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, background: t.surfaceSoft, color: t.text2, display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
                  {tab === "batal" ? <Ban size={28} /> : <History size={28} />}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{q ? "Tidak ditemukan" : tab === "batal" ? "Tidak ada yang dibatalkan" : "Belum ada riwayat"}</div>
                <div style={{ fontSize: 14, color: t.text2, marginTop: 6 }}>{q ? "Coba kata kunci lain." : tab === "batal" ? "Transaksi yang dibatalkan akan muncul di sini." : "Transaksi Lunas akan muncul di sini."}</div>
              </div>
            ) : riwayatGroups.map((g) => (
              <div key={groupKey(g.customer)} style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 16, marginBottom: 14, overflow: "hidden" }}>
                {/* Header nama */}
                <div style={{ padding: "14px 16px 10px" }}>
                  <div className="flex items-center justify-between" style={{ gap: 10 }}>
                    <div className="flex items-center gap-2" style={{ flexWrap: "wrap", flex: 1 }}>
                      <span style={{ fontSize: 17, fontWeight: 800 }}>{g.customer.nama}</span>
                      <span style={{ background: tingkatColor(g.customer.tingkat, g.customer.kelas), color: "#FFFCF7", padding: "2px 10px", borderRadius: 999, fontSize: 13, fontWeight: 800, flex: "none" }}>
                        {g.customer.kelas || g.customer.tingkat}
                      </span>
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 800, color: riwayatFilter === "batal" ? t.text2 : t.successText, flex: "none" }}>
                      {rupiah(riwayatFilter === "batal" ? g.txs.reduce((s, tx) => s + tx.total, 0) : g.totalMasuk)}
                    </span>
                  </div>
                  {g.customer.wa && <div style={{ fontSize: 13, color: t.text2, marginTop: 3 }}>{g.customer.wa}</div>}
                </div>
                {/* Per transaksi */}
                {g.txs.map((tx) => {
                  const cancelled = !!tx.cancelledAt;
                  return (
                    <div key={tx.id} style={{ padding: "10px 16px 12px", borderTop: `1px solid ${t.divider}`, background: t.surfaceSoft, opacity: cancelled ? 0.82 : 1 }}>
                      <div className="flex items-center gap-2" style={{ marginBottom: 6, flexWrap: "wrap" }}>
                        <StatusTag ok={!cancelled} />
                        <SourceTag source={tx.source} />
                        {dateTap(tx)}
                        <span style={{ fontSize: 14, fontWeight: 700, marginLeft: "auto", textDecoration: cancelled ? "line-through" : "none", color: cancelled ? t.text2 : t.text, fontFamily: MONO }}>
                          {rupiah(tx.total)}
                        </span>
                      </div>
                      {tx.items.map((it, i) => (
                        <div key={i} style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.8, color: cancelled ? t.text2 : t.text, fontFamily: MONO }}>
                          {it.name}{it.variant ? ` (${it.variant})` : ""} ×{it.qty}
                        </div>
                      ))}
                      {cancelled ? (
                        <div className="flex gap-2" style={{ marginTop: 10 }}>
                          <button onClick={() => pulihkan(tx)}
                            className="flex items-center justify-center gap-1.5"
                            style={{ flex: 1, height: 36, borderRadius: 9, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                            <RotateCcw size={13} /> Pulihkan
                          </button>
                          <button onClick={() => setTrashConfirmTx(tx)}
                            className="flex items-center justify-center gap-1.5"
                            style={{ height: 36, padding: "0 12px", borderRadius: 9, border: `1.5px solid ${t.border}`, background: t.surface, color: t.error, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                            <Trash2 size={13} /> Hapus
                          </button>
                        </div>
                      ) : (
                        /* Transaksi Lunas: bisa Dibatalkan (dengan Urungkan) atau
                           langsung ke Tong Sampah. Batal = keluar dari total Masuk,
                           tetap tampil dengan badge Dibatalkan; Pulihkan mengembalikan
                           ke Lunas karena status paid tidak diubah. */
                        <div className="flex gap-2" style={{ marginTop: 10 }}>
                          <button onClick={() => cancel(tx)}
                            className="flex items-center justify-center gap-1.5"
                            style={{ flex: 1, height: 36, borderRadius: 9, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                            <Ban size={13} /> Batalkan
                          </button>
                          <button onClick={() => setTrashConfirmTx(tx)}
                            className="flex items-center justify-center gap-1.5"
                            style={{ height: 36, padding: "0 12px", borderRadius: 9, border: `1.5px solid ${t.border}`, background: t.surface, color: t.error, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                            <Trash2 size={13} /> Hapus
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Undo bar */}
      {undo && (
        <div style={{ position: "fixed", left: 20, right: 20, bottom: 24 + NAV_HEIGHT, zIndex: 60, display: "flex", justifyContent: "center" }}>
          <div className="flex items-center gap-3" style={{ maxWidth: 420, width: "100%", background: t.text, color: "#FBF7EF", borderRadius: 14, padding: "12px 14px 12px 18px", boxShadow: "0 14px 34px rgba(47,42,36,.3)" }}>
            <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600 }}>
              {undo.type === "paid" ? `Ditandai Lunas — ${undo.tx.customer.nama}` : `Transaksi dibatalkan — ${undo.tx.customer.nama}`}
            </span>
            <button onClick={doUndo} className="flex items-center gap-1"
              style={{ background: "transparent", border: "none", color: t.primary, fontWeight: 800, fontSize: 14.5, cursor: "pointer", padding: "8px 10px" }}>
              <Undo2 size={16} /> Urungkan
            </button>
          </div>
        </div>
      )}
      {toast && !undo && (
        <div style={{ position: "fixed", left: 20, right: 20, bottom: 24 + NAV_HEIGHT, zIndex: 60, display: "flex", justifyContent: "center" }}>
          <div style={{ maxWidth: 420, width: "100%", background: t.text, color: "#FBF7EF", borderRadius: 14, padding: "14px 18px", fontSize: 14.5, fontWeight: 600 }}>{toast}</div>
        </div>
      )}

      {/* Popup struk RINCIAN TRANSAKSI — ketuk tanggal di kartu. Menampilkan
          untuk hari apa & dicatat kapan; Ubah Tanggal Layanan pakai input
          overlay besar (pola wajib CLAUDE.md, andal di iOS). */}
      {detailTx && (
        <div style={{ position: "fixed", inset: 0, zIndex: 85, display: "grid", placeItems: "center", padding: 20 }}>
          <div onClick={() => setDetailTx(null)} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.4)" }} />
          <div style={{ position: "relative", width: "100%", maxWidth: 330, filter: "drop-shadow(0 12px 30px rgba(47,42,36,.32))" }}>
            <div style={{ background: t.surface, clipPath: ZIGZAG, padding: "20px 18px 18px", fontFamily: MONO, fontWeight: 600 }}>
              <div style={{ textAlign: "center", fontSize: 14.5, fontWeight: 800 }}>{detailTx.customer.nama.toUpperCase()}</div>
              <div style={{ textAlign: "center", fontSize: 12, color: t.text2, marginTop: 2 }}>
                {detailTx.customer.kelas || detailTx.customer.tingkat || ""}
              </div>
              <div style={{ borderTop: `1.5px dashed ${t.border}`, margin: "10px 0" }} />
              {detailTx.items.map((it, i) => (
                <div key={i} className="flex justify-between" style={{ fontSize: 13, lineHeight: 1.7, gap: 8 }}>
                  <span>{it.name}{it.variant ? ` (${it.variant})` : ""} ×{it.qty}</span>
                  <span style={{ flex: "none" }}>{rupiah(it.price * it.qty)}</span>
                </div>
              ))}
              <div className="flex justify-between" style={{ fontSize: 13.5, fontWeight: 800, marginTop: 6 }}>
                <span>TOTAL</span><span>{rupiah(detailTx.total)}</span>
              </div>
              <div style={{ borderTop: `1.5px dashed ${t.border}`, margin: "10px 0" }} />
              <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                <div className="flex justify-between"><span style={{ color: t.text2 }}>Untuk</span><span style={{ fontWeight: 700 }}>{serviceDateLabel(opDate(detailTx))}</span></div>
                <div className="flex justify-between"><span style={{ color: t.text2 }}>Dicatat</span><span>{detailTx.createdAt.slice(8, 10)}/{detailTx.createdAt.slice(5, 7)} · {new Date(detailTx.createdAt).getHours().toString().padStart(2, "0")}.{new Date(detailTx.createdAt).getMinutes().toString().padStart(2, "0")}</span></div>
                <div className="flex justify-between"><span style={{ color: t.text2 }}>Sumber</span><span>{detailTx.source === "preorder" ? "Pre-order" : "Penjualan"}</span></div>
                <div className="flex justify-between"><span style={{ color: t.text2 }}>Status</span><span style={{ fontWeight: 700, color: detailTx.cancelledAt ? t.error : detailTx.paid ? t.successText : t.amberText }}>{detailTx.cancelledAt ? "Dibatalkan" : detailTx.paid ? "Lunas" : "Belum Dibayar"}</span></div>
              </div>
              <div style={{ position: "relative", marginTop: 14, height: 52, borderRadius: 12, border: `1.5px solid ${t.primary}`, background: t.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 14.5, color: t.amberText }}>
                <Calendar size={16} /> Ubah Tanggal Layanan
                <input type="date" defaultValue={opDate(detailTx)} max={todayISO()}
                  onChange={(e) => {
                    if (!e.target.value || e.target.value === opDate(detailTx)) return;
                    onChangeDate(detailTx.id, e.target.value);
                    setDetailTx(null);
                    setToast(`Tanggal Layanan diubah ke ${e.target.value.slice(8, 10)}/${e.target.value.slice(5, 7)}`);
                  }}
                  onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* picker native */ } }}
                  aria-label="Ubah Tanggal Layanan"
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
              </div>
            </div>
            <button onClick={() => setDetailTx(null)} aria-label="Tutup rincian"
              style={{ position: "absolute", top: -12, right: -8, width: 42, height: 42, borderRadius: "50%", border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 4px 12px rgba(47,42,36,.2)" }}>
              <X size={19} />
            </button>
          </div>
        </div>
      )}

      {/* Popup struk KONFIRMASI LUNASKAN (Ya/Tidak) */}
      {confirmLunas && (
        <div style={{ position: "fixed", inset: 0, zIndex: 85, display: "grid", placeItems: "center", padding: 20 }}>
          <div onClick={() => setConfirmLunas(null)} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.4)" }} />
          <div style={{ position: "relative", width: "100%", maxWidth: 330, filter: "drop-shadow(0 12px 30px rgba(47,42,36,.32))" }}>
            <div style={{ background: t.surface, clipPath: ZIGZAG, padding: "20px 18px 18px", fontFamily: MONO, fontWeight: 600, textAlign: "center" }}>
              <div style={{ fontSize: 14.5, fontWeight: 800 }}>LUNASKAN SEMUA?</div>
              <div style={{ borderTop: `1.5px dashed ${t.border}`, margin: "10px 0" }} />
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>{confirmLunas.customer.nama}</div>
              <div style={{ fontSize: 12, color: t.text2 }}>{confirmLunas.txs.length} transaksi</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{rupiah(confirmLunas.total)}</div>
              <div className="flex gap-2" style={{ marginTop: 14, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                <button onClick={() => setConfirmLunas(null)}
                  style={{ flex: 1, height: 50, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                  Tidak
                </button>
                <button onClick={() => { confirmLunas.txs.forEach(markPaid); setConfirmLunas(null); }}
                  style={{ flex: 1, height: 50, borderRadius: 12, border: "none", background: t.success, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                  Ya
                </button>
              </div>
            </div>
            <button onClick={() => setConfirmLunas(null)} aria-label="Batal lunaskan"
              style={{ position: "absolute", top: -12, right: -8, width: 42, height: 42, borderRadius: "50%", border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 4px 12px rgba(47,42,36,.2)" }}>
              <X size={19} />
            </button>
          </div>
        </div>
      )}

      {/* Sheet Filter Tanggal — pilihan langsung berlaku; rentang custom
          punya dua picker di dalam sheet */}
      {dateSheet && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={() => setDateSheet(false)} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
          <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", padding: 20, boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Filter Tanggal</div>
              <button onClick={() => setDateSheet(false)} style={{ border: "none", background: t.surfaceSoft, cursor: "pointer", color: t.text2, width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center" }}><X size={17} /></button>
            </div>
            {([["semua", "Semua Tanggal"], ["hari", "Hari Ini"], ["7", "7 Hari Terakhir"], ["tanggal", "Pilih Tanggal"]] as const).map(([val, label]) => {
              const on = dateFilter === val;
              return (
                <button key={val}
                  onClick={() => { setDateFilter(val); if (val !== "tanggal") setDateSheet(false); }}
                  className="flex items-center justify-between"
                  style={{ width: "100%", height: 50, marginBottom: 8, borderRadius: 12, border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, padding: "0 16px", cursor: "pointer" }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: on ? t.amberText : t.text }}>{label}</span>
                  {on && <Check size={17} color={t.amberText} />}
                </button>
              );
            })}
            {dateFilter === "tanggal" && (
              <input type="date" value={pickDate}
                onChange={(e) => { setPickDate(e.target.value); if (e.target.value) setDateSheet(false); }}
                aria-label="Pilih tanggal"
                style={{ width: "100%", height: 50, marginTop: 4, fontSize: 15, fontWeight: 700, color: pickDate ? t.text : t.textDis, background: t.surface, border: `1.5px solid ${t.primary}`, borderRadius: 12, padding: "0 14px", fontFamily: "inherit" }} />
            )}
          </div>
        </div>
      )}

      {/* Sheet Urutkan — sama pola dengan Filter Tanggal */}
      {sortSheet && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={() => setSortSheet(false)} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
          <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", padding: 20, boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Urutkan</div>
              <button onClick={() => setSortSheet(false)} style={{ border: "none", background: t.surfaceSoft, cursor: "pointer", color: t.text2, width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center" }}><X size={17} /></button>
            </div>
            {(["az", "za", "newest", "oldest"] as const).map((val) => {
              const on = sortMode === val;
              return (
                <button key={val}
                  onClick={() => { setSortMode(val); setSortSheet(false); }}
                  className="flex items-center justify-between"
                  style={{ width: "100%", height: 50, marginBottom: 8, borderRadius: 12, border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, padding: "0 16px", cursor: "pointer" }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: on ? t.amberText : t.text }}>{SORT_LABEL[val]}</span>
                  {on && <Check size={17} color={t.amberText} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Konfirmasi pindah ke Tong Sampah */}
      {trashConfirmTx && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={() => setTrashConfirmTx(null)} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
          <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", padding: 24, boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Pindahkan ke Tong Sampah?</div>
            <div style={{ fontSize: 14.5, color: t.text2, lineHeight: 1.6 }}>
              Pesanan <b style={{ color: t.text }}>{trashConfirmTx.customer.nama}</b> akan disembunyikan dari semua halaman. Bisa dipulihkan di Pengaturan → Tong Sampah dalam 30 hari.
            </div>
            <div className="flex gap-2" style={{ marginTop: 20 }}>
              <button onClick={() => setTrashConfirmTx(null)}
                style={{ flex: 1, height: 52, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={() => { onMoveToTrash(trashConfirmTx.id); setTrashConfirmTx(null); }}
                className="flex items-center justify-center gap-2"
                style={{ flex: 1, height: 52, borderRadius: 12, border: "none", background: t.errorBg, color: t.error, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                <Trash2 size={17} /> Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WA Pratinjau sheet */}
      {waDraft && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={() => setWaDraft(null)} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
          <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", maxHeight: "80vh", overflowY: "auto", padding: 20, boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Pratinjau WhatsApp</div>
              <button onClick={() => setWaDraft(null)} style={{ border: "none", background: t.surfaceSoft, cursor: "pointer", color: t.text2, width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center" }}><X size={17} /></button>
            </div>
            <div style={{ fontSize: 12.5, color: t.text2, marginBottom: 10 }}>Periksa & edit sebelum dikirim.</div>
            {waDraft.siblings.length > 0 && (
              /* Kakak-adik satu nomor WA → tawarkan SATU pesan gabungan
                 supaya ortu tidak menerima tagihan dua kali */
              <button onClick={toggleMergeWa} className="flex items-center gap-3"
                style={{ width: "100%", marginBottom: 10, padding: "12px 14px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                  border: `1.5px solid ${waDraft.merged ? t.primary : t.border}`,
                  background: waDraft.merged ? t.primaryLight : t.surfaceSoft }}>
                <span style={{ width: 26, height: 26, borderRadius: 8, flex: "none", display: "grid", placeItems: "center",
                  background: waDraft.merged ? t.primary : t.surface, border: `2px solid ${waDraft.merged ? t.primary : t.border}`, color: t.text }}>
                  {waDraft.merged && <Check size={16} />}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: waDraft.merged ? t.amberText : t.text, lineHeight: 1.45 }}>
                  {waDraft.merged
                    ? `Tagihan digabung (${1 + waDraft.siblings.length} anak, satu pesan)`
                    : `Nomor ini juga punya tagihan: ${waDraft.siblings.map((s) => `${toTitleCase(s.customer.nama)} (${s.customer.kelas || s.customer.tingkat})`).join(", ")} — ketuk untuk gabungkan`}
                </span>
              </button>
            )}
            <textarea
              value={waDraft.text}
              onChange={(e) => setWaDraft({ ...waDraft, text: e.target.value })}
              rows={10}
              style={{ width: "100%", fontSize: 14, color: t.text, background: t.surfaceSoft, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: 12, outline: "none", fontFamily: "inherit", resize: "vertical", lineHeight: 1.6 }}
            />
            <div className="flex gap-2" style={{ marginTop: 14 }}>
              <button onClick={() => setWaDraft(null)}
                style={{ flex: 1, height: 52, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={sendWA} className="flex items-center justify-center gap-2"
                style={{ flex: 2, height: 52, borderRadius: 12, border: "none", background: "#25D366", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                <Share2 size={18} /> Kirim ke WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Tags ---- */
function SourceTag({ source }: { source: Transaction["source"] }) {
  const pre = source === "preorder";
  return (
    <span title={pre ? "Pre-order" : "Penjualan"}
      style={{ width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", flex: "none",
        background: pre ? t.primaryLight : t.successBg, color: pre ? t.amberText : t.successText,
        border: `1px solid ${pre ? "#F1DFB0" : "#D8E6D4"}` }}>
      {pre ? <Utensils size={14} /> : <ShoppingCart size={14} />}
    </span>
  );
}
function StatusTag({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="flex items-center gap-1" style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: t.successBg, color: t.successText, border: "1px solid #D8E6D4" }}>
      <Check size={12} /> Lunas
    </span>
  ) : (
    <span className="flex items-center gap-1" style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: t.errorBg, color: t.error, border: "1px solid #F3C9C9" }}>
      <Ban size={12} /> Dibatalkan
    </span>
  );
}
function Empty({ q }: { q: string }) {
  return (
    <div style={{ textAlign: "center", padding: "56px 20px" }}>
      <div style={{ width: 60, height: 60, borderRadius: 16, background: t.successBg, color: t.successText, display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
        <Check size={28} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{q ? "Tidak ditemukan" : "Semua tagihan lunas"}</div>
      <div style={{ fontSize: 14, color: t.text2, marginTop: 6 }}>{q ? "Coba kata kunci lain." : "Tidak ada yang belum dibayar. Kerja bagus."}</div>
    </div>
  );
}
