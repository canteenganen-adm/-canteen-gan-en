import { useMemo, useState, useEffect, useRef } from "react";
import {
  Search, X, Check, Trash2, Share2, ShoppingCart, Utensils,
  Undo2, Wallet, Settings, History, Ban, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, RotateCcw, Calendar, SlidersHorizontal, MessageCircle,
} from "lucide-react";
import { t, NAV_HEIGHT } from "../../lib/theme";
import { rupiah, fmtWaDate, todayISO, serviceDateLabel } from "../../lib/format";
import { mondayOf, labelPekan, bulanPekan, labelBulan, pekanBerjalan, isAkhirPekan, namaHari, rentangPendek } from "../../lib/pekan";
import RailGeser from "../components/RailGeser";
import PaperTabs from "../components/PaperTabs";
import TagihSatuSatu from "../components/TagihSatuSatu";
import RailAbjad from "../components/RailAbjad";
import { useKunciGulir } from "../components/useKunciGulir";
import { LIVE_DAYS } from "../../lib/canteenApi";
import type { Transaction, CanteenSettings } from "../../types";

/* ============================================================
   TRANSAKSI — Canteen Gan En
   Belum Dibayar: dikelompokkan per Nama + WA (auto-merge).
   Lunas: dikelompokkan per Nama + WA (terbaru di atas).
   ============================================================ */

const BLN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
/** Rincian transaksi (tanggal · item · harga) pakai font thermal/mono
 * seperti struk PO — kontras dengan Onest di kartu info anak,
 * supaya fokus tidak terbagi. */
const MONO = "'DM Mono', ui-monospace, 'Cascadia Mono', 'SF Mono', 'Roboto Mono', 'Courier New', monospace";
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
/** Kartu Belum Dibayar satu anak. */
type Grup = { customer: Transaction["customer"]; txs: Transaction[]; newestAt: string; total: number };
const buatGrup = (txs: Transaction[]): Grup[] =>
  unionGroups(txs).map((g) => ({ customer: g.customer, txs: g.txs, newestAt: g.newestAt, total: g.txs.reduce((s, tx) => s + tx.total, 0) }));
type UndoAction =
  | { type: "paid"; tx: Transaction }
  | { type: "unpaid"; tx: Transaction }
  | { type: "cancel"; tx: Transaction };

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
  onOpenSettings?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("unpaid");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("semua");
  const [dateFilter, setDateFilter] = useState<DateFilter>("semua");
  /** Tab Dibatalkan berdiri sendiri; kode grup riwayat dipakai bersama. */
  const riwayatFilter: "lunas" | "batal" = tab === "batal" ? "batal" : "lunas";
  const [pickDate, setPickDate] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("az");
  /** Kartu yang SEMUA transaksinya sudah ditagih (hijau) disembunyikan —
   * hanya berlaku di tab Belum Dibayar, supaya yang belum dihubungi tidak
   * tenggelam di antara yang sudah beres. */
  const [onlyUnbilled, setOnlyUnbilled] = useState(false);
  /** Urutkan, Belum Ditagih, dan Tanggal digabung SATU sheet "Filter" —
   * baris chip tetap satu baris (tidak melebar jadi dua baris). */
  const [filterSheet, setFilterSheet] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  useKunciGulir(filterSheet, filterRef);
  const filterActive = sortMode !== "az" || dateFilter !== "semua" || onlyUnbilled || sourceFilter !== "semua";

  const [q, setQ] = useState("");
  /** Belum Dibayar dibaca per PEKAN: daftar pekan → (ketuk) kartu anak di pekan itu.
   * pekanBuka = Senin pekan yang sedang dibuka (null = daftar pekan); bulanLihat = "YYYY-MM" (null = bulan pekan ini). */
  const [pekanBuka, setPekanBuka] = useState<string | null>(null);
  const [bulanLihat, setBulanLihat] = useState<string | null>(null);
  /** Satu minggu terbuka sekali; membuka yang lain menutup sebelumnya, jadi baris yang baru dibuka digulir ke bawah header. */
  useEffect(() => {
    if (!pekanBuka) return;
    const id = requestAnimationFrame(() => document.getElementById(`chip-${pekanBuka}`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }));
    return () => cancelAnimationFrame(id);
  }, [pekanBuka]);
  /** Tagih satu per satu: antrean dibekukan saat mulai supaya urutan tidak bergeser. */
  const [tagih, setTagih] = useState<{ pekan: string[]; antrean: string[][][] } | null>(null);
  /** Berapa minggu sebelumnya (yang belum ditagih) digabung dengan minggu yang dibuka — satu pesan per anak. */
  const [gabungN, setGabungN] = useState(0);
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** Draf WA. `siblings` = grup lain (anak lain) dengan nomor WA sama —
   * ditawarkan digabung jadi SATU pesan supaya ortu tidak ditagih dua kali. */
  const [waDraft, setWaDraft] = useState<{
    wa: string; text: string; txIds: string[];
    base: { customer: Transaction["customer"]; txs: Transaction[]; total: number };
    siblings: { customer: Transaction["customer"]; txs: Transaction[]; total: number }[];
    merged: boolean;
    /** "12–16 Okt" bila dikirim dari satu pekan — dicantumkan di pesan. */
    label?: string;
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

  /* ---- Per pekan ---- */
  const hariIni = todayISO();
  /** Cari/filter tanggal/Hanya Belum Ditagih aktif → daftar biasa lintas pekan (tempat mencari anak). */
  const modeDaftar = !!q.trim() || dateFilter !== "semua" || onlyUnbilled;
  const pekanList = useMemo(() => {
    const per = new Map<string, Transaction[]>();
    for (const tx of unpaid) {
      const k = mondayOf(opDate(tx));
      const arr = per.get(k);
      if (arr) arr.push(tx); else per.set(k, [tx]);
    }
    const senin = mondayOf(hariIni);
    if (!per.has(senin)) per.set(senin, []); // pekan ini selalu tampil
    return [...per.entries()].map(([k, txs]) => {
      const gs = buatGrup(txs);
      const belum = gs.filter((g) => g.txs.some((tx) => !tx.billedAt)).length;
      return { senin: k, txs, anak: gs.length, belum, sudah: gs.length - belum, berjalan: pekanBerjalan(k, hariIni) };
    }).sort((a, b) => b.senin.localeCompare(a.senin));
  }, [unpaid, hariIni]);
  const bulanDefault = bulanPekan(mondayOf(hariIni));
  const bulanAda = useMemo(
    () => [...new Set([...pekanList.map((p) => bulanPekan(p.senin)), bulanDefault])].sort(),
    [pekanList, bulanDefault]
  );
  const bulanAktif = bulanLihat && bulanAda.includes(bulanLihat) ? bulanLihat : bulanDefault;
  const bulanIdx = bulanAda.indexOf(bulanAktif);
  const pekanBulanIni = pekanList.filter((p) => bulanPekan(p.senin) === bulanAktif);
  const bulanAdaBelum = (ym: string) => pekanList.some((p) => bulanPekan(p.senin) === ym && !p.berjalan && p.belum > 0);
  const adaBelumSebelum = bulanAda.slice(0, Math.max(bulanIdx, 0)).some(bulanAdaBelum);
  const adaBelumSesudah = bulanAda.slice(bulanIdx + 1).some(bulanAdaBelum);
  /** Geser kiri/kanan = pindah bulan (sama seperti Laporan). */
  const sentuh = useRef<{ x: number; y: number } | null>(null);
  const urutPekan = [...pekanList].sort((a, b) => a.senin.localeCompare(b.senin));
  /** Minggu dikelompokkan per bulan (menurut Jumat); nama bulan ditulis SEKALI di judul kelompok. */
  const kelompokBulan = (() => {
    const out: { ym: string; label: string; pekan: typeof urutPekan }[] = [];
    for (const x of urutPekan) {
      const ym = bulanPekan(x.senin);
      let k = out.find((o) => o.ym === ym);
      if (!k) {
        const nama = labelBulan(ym).split(" ")[0];
        k = { ym, label: ym.slice(0, 4) === hariIni.slice(0, 4) ? nama : `${nama} ${ym.slice(0, 4)}`, pekan: [] };
        out.push(k);
      }
      k.pekan.push(x);
    }
    return out;
  })();
  /** Geser kanan = minggu sebelumnya, geser kiri = minggu berikutnya. */
  const geserPekan = (dx: number, dy: number) => {
    if (Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy)) return;
    const i = urutPekan.findIndex((x) => x.senin === pekanBuka);
    if (i < 0) return;
    if (dx > 0 && i > 0) setPekanBuka(urutPekan[i - 1].senin);
    else if (dx < 0 && i < urutPekan.length - 1) setPekanBuka(urutPekan[i + 1].senin);
  };
  const pekanDibuka = pekanBuka ? pekanList.find((p) => p.senin === pekanBuka) || null : null;
  const groupsPekan = useMemo(
    () => (pekanDibuka ? sortGroups(buatGrup(pekanDibuka.txs), sortMode) : []),
    [pekanDibuka, sortMode]
  );
  const byId = useMemo(() => new Map(transactions.map((x) => [x.id, x])), [transactions]);

  /** Antrean satu pekan: anak yang masih ada tagihan belum dikirim; kakak-adik satu nomor WA digabung jadi satu pesan. */
  const antreanMinggu = (daftar: string[]) => {
    const txs = pekanList.filter((x) => daftar.includes(x.senin)).flatMap((x) => x.txs);
    const gs = sortGroups(buatGrup(txs).filter((g) => g.txs.some((tx) => !tx.billedAt)), sortMode);
    const antrean: string[][][] = [];
    const perWa = new Map<string, string[][]>();
    for (const g of gs) {
      const ids = g.txs.map((tx) => tx.id);
      const w = normWa(g.customer.wa);
      const ada = w ? perWa.get(w) : undefined;
      if (ada) { ada.push(ids); continue; }
      const entri = [ids];
      antrean.push(entri);
      if (w) perWa.set(w, entri);
    }
    return antrean;
  };
  const mulaiTagih = (daftar: string[]) => {
    const antrean = antreanMinggu(daftar);
    if (antrean.length) setTagih({ pekan: daftar, antrean });
  };
  /** Minggu sebelum yang dibuka yang sudah lewat dan masih ada yang belum ditagih, terdekat dulu. */
  const calonGabung = pekanDibuka
    ? pekanList.filter((x) => !x.berjalan && x.belum > 0 && x.senin < pekanDibuka.senin).sort((a, b) => b.senin.localeCompare(a.senin))
    : [];
  const gabungDipilih = calonGabung.slice(0, gabungN).map((x) => x.senin);
  /** Pekan yang dibuka sudah habis (semua lunas/dipindah) → kembali ke daftar, jangan loncat sendiri saat ada tagihan baru. */
  /** Minggu terpilih: awalnya yang TERLAMA yang masih ada yang belum ditagih (supaya tidak ada yang terlupa); kalau tidak ada, yang terbaru. */
  useEffect(() => {
    if (pekanBuka && pekanList.some((x) => x.senin === pekanBuka)) return;
    const asal = [...pekanList].sort((a, b) => a.senin.localeCompare(b.senin));
    const pilih = asal.find((x) => x.belum > 0 && !x.berjalan) || asal.find((x) => x.belum > 0) || asal[asal.length - 1];
    setPekanBuka(pilih ? pilih.senin : null);
  }, [pekanList, pekanBuka]);
  useEffect(() => { setGabungN(0); }, [pekanBuka]);
  /** Pencarian kosong di Belum Dibayar: beri tahu kalau anaknya ada di Lunas/Dibatalkan. */
  const cariLain = useMemo(() => {
    if (!q.trim()) return null;
    const cocok = (x: Transaction) => bySource(x) && matchQuery(x.customer.nama, x.customer.kelas, x.customer.wa);
    return {
      lunas: unionGroups(transactions.filter((x) => x.paid && !x.cancelledAt && cocok(x))).length,
      batal: unionGroups(transactions.filter((x) => !!x.cancelledAt && cocok(x))).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, q, sourceFilter]);
  const panahBulan: React.CSSProperties = { position: "relative", width: 44, height: 44, flex: "none", display: "grid", placeItems: "center", background: "transparent", border: "none", color: t.text2, cursor: "pointer" };

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
  /** Kebalikan Tandai Lunas — jalan keluar untuk salah pencet Lunas yang
   * baru ketahuan SETELAH jendela Urungkan lewat. Sebelumnya tidak ada
   * jalannya sama sekali: "Batalkan" di tab Lunas membatalkan TRANSAKSI
   * (soft-delete), dan Pulihkan mengembalikannya ke Lunas lagi (paid tak
   * pernah disentuh) — celah yang ditemukan Papa. */
  const unpay = (tx: Transaction) => { onUnmarkPaid(tx.id); setUndo({ type: "unpaid", tx }); };
  const cancel = (tx: Transaction) => { onCancel(tx.id); setUndo({ type: "cancel", tx }); };
  const pulihkan = (tx: Transaction) => {
    onRestore(tx);
    if (undo?.type === "cancel" && undo.tx.id === tx.id) setUndo(null);
    // Pulihkan TIDAK menyentuh status bayar: transaksi kembali ke tab
    // sesuai statusnya semula — jangan menjanjikan "Belum Dibayar" untuk
    // transaksi yang sebenarnya Lunas.
    setToast(`Dipulihkan — ${tx.customer.nama} kembali ke ${tx.paid ? "Lunas" : "Belum Dibayar"}`);
  };
  const doUndo = () => {
    if (!undo) return;
    if (undo.type === "paid") onUnmarkPaid(undo.tx.id);
    else if (undo.type === "unpaid") onMarkPaid(undo.tx.id);
    else onRestore(undo.tx);
    setUndo(null);
  };

  /* Popup struk per transaksi: ketuk baris tanggal → rincian (untuk hari apa,
     dicatat kapan) + tombol Ubah Tanggal Layanan. detailTx menyimpan SNAPSHOT
     objek transaksi, jadi reload realtime tidak menutup picker (fix iOS). */
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [confirmLunas, setConfirmLunas] = useState<{ customer: Transaction["customer"]; txs: Transaction[]; total: number; sebagian?: boolean } | null>(null);
  /** Tanggal (transaksi) yang dicentang untuk Lunas sebagian — satu ketukan melunaskan semua yang dicentang. */
  const [pilihTx, setPilihTx] = useState<Set<string>>(new Set());
  const togglePilihTx = (id: string) => setPilihTx((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  /** Anak satu nomor WhatsApp dikelompokkan (kakak-adik) supaya terlihat satu keluarga. */
  const bundelWa = (list: Grup[]) => {
    const bundel: Grup[][] = [];
    const perWa = new Map<string, Grup[]>();
    for (const g of list) {
      const w = normWa(g.customer.wa);
      const ada = w ? perWa.get(w) : undefined;
      if (ada) { ada.push(g); continue; }
      const b = [g];
      bundel.push(b);
      if (w) perWa.set(w, b);
    }
    return bundel;
  };

  const dateTap = (tx: Transaction) => (
    <button onClick={() => setDetailTx(tx)}
      style={{ background: "transparent", border: "none", padding: "10px 4px", margin: "-10px -4px", cursor: "pointer", minHeight: 44, display: "inline-flex", alignItems: "center" }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: t.text2, fontFamily: MONO, borderBottom: `1.5px dashed ${t.border}`, paddingBottom: 1 }}>
        {fmtTxOp(tx).split(" · ")[0]}
      </span>
    </button>
  );

  /** Bangun pesan tagihan. 1 grup = format lama persis; >1 grup (kakak-adik
   * satu nomor WA) = satu pesan dengan bagian per anak + Subtotal, lalu
   * SATU Total Pembayaran gabungan. */
  const buildWaMsg = (gs: { customer: Transaction["customer"]; txs: Transaction[]; total: number }[], label?: string) => {
    const txBlocksOf = (g: (typeof gs)[number]) => g.txs.map((tx) => {
      const itemLines = tx.items
        .map((it) => `• ${toTitleCase(it.name.trim())}${it.variant ? ` (${it.variant.trim()})` : ""} ×${it.qty} = ${rupiah(it.price * it.qty)}`)
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
    // Baris kosong sebelum Total supaya berjarak dari rincian; *tebal* pakai
    // format WhatsApp (bintang) — rincian panjang jadi mudah menemukan totalnya
    const judulPekan = label ? `Tagihan minggu ${label}\n\n` : "";
    return `${settings.waOpening}\n\n${judulPekan}${sections}\n\n*Total Pembayaran: ${rupiah(total)}*\n\n${settings.waClosing}${bankSection}\n\nGan En`;
  };
  /** pool = kartu yang dicari "saudara"-nya (satu nomor WA) — di dalam satu pekan hanya kartu pekan itu. */
  const shareWA = (g: { customer: Transaction["customer"]; txs: Transaction[]; total: number }, pool: Grup[] = groups, label?: string) => {
    const wa = g.customer.wa?.replace(/\D/g, "");
    if (!wa) { setToast("Nomor WhatsApp belum ada untuk pemesan ini."); return; }
    // Anak lain (nama beda) yang nomor WA-nya sama → tawarkan gabung tagihan
    const meNama = g.customer.nama.trim().replace(/\s+/g, " ").toLowerCase();
    const siblings = pool.filter(
      (o) => o.customer.nama.trim().replace(/\s+/g, " ").toLowerCase() !== meNama
        && normWa(o.customer.wa) === normWa(g.customer.wa)
    );
    setWaDraft({
      wa: wa.startsWith("0") ? "62" + wa.slice(1) : wa,
      text: buildWaMsg([g], label),
      txIds: g.txs.map((tx) => tx.id),
      base: g, siblings, merged: false, label,
    });
  };
  const toggleMergeWa = () => {
    if (!waDraft) return;
    const merged = !waDraft.merged;
    const gs = merged ? [waDraft.base, ...waDraft.siblings] : [waDraft.base];
    setWaDraft({
      ...waDraft, merged,
      text: buildWaMsg(gs, waDraft.label),
      txIds: gs.flatMap((g) => g.txs.map((tx) => tx.id)),
    });
  };
  const sendWA = () => {
    if (!waDraft) return;
    window.open(`https://wa.me/${waDraft.wa}?text=${encodeURIComponent(waDraft.text)}`, "_blank");
    onMarkBilled(waDraft.txIds); // penanda "sudah ditagih" — sinkron antar gadget
    setWaDraft(null);
  };

  /** Satu kartu Belum Dibayar (satu anak). ns = awalan kunci supaya anak yang sama di dua pekan tidak berbagi status buka-tutup. */
  const kartuBelum = (g: Grup, ns = "", pool: Grup[] = groups, label?: string) => {
    const key = ns + groupKey(g.customer);
    const expanded = expandedGroups.has(key);
    const terpilih = g.txs.filter((tx) => pilihTx.has(tx.id));
    return (
      <div key={key} style={expanded
        ? { background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 16, margin: "6px 0 12px", overflow: "hidden" }
        : { borderBottom: `1px solid ${t.divider}` }}>

        {/* Header grup — klik untuk expand/collapse */}
        <button onClick={() => toggleGroup(key)} style={{ width: "100%", padding: expanded ? "14px 16px" : "14px 2px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
          <div className="flex items-center justify-between" style={{ gap: 10 }}>
            <div style={{ minWidth: 0, flex: 1, lineHeight: 1.35 }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{g.customer.nama}</span>
              <span style={{ marginLeft: 8, fontSize: 12.5, fontWeight: 700, color: t.text2, border: "1.5px solid #CFC6AE", borderRadius: 999, padding: "0 8px", whiteSpace: "nowrap", verticalAlign: 1 }}>
                {g.customer.kelas || g.customer.tingkat}
              </span>
            </div>
            <div className="flex items-center gap-2" style={{ flex: "none" }}>
              {g.txs.every((tx) => tx.billedAt) && (
                <span aria-label="Sudah ditagih" title="Sudah ditagih" style={{ width: 20, height: 20, borderRadius: "50%", display: "grid", placeItems: "center", background: t.successBg, border: `1.8px solid ${t.success}`, color: t.successText }}><Check size={12} strokeWidth={3} /></span>
              )}
              <span style={{ fontSize: 17, fontWeight: 600 }}>{rupiah(g.total)}</span>
              {expanded ? <ChevronUp size={18} color={t.text2} /> : <ChevronDown size={18} color="#B3AF9F" />}
            </div>
          </div>
          {expanded && (
            <div className="flex items-center gap-3" style={{ marginTop: 4 }}>
              {g.customer.wa && <span style={{ fontSize: 13, color: t.text2 }}>{g.customer.wa}</span>}
              <span style={{ fontSize: 13, color: t.text2 }}>{g.txs.length} transaksi</span>
            </div>
          )}
        </button>

        {/* Daftar transaksi (hanya kalau expanded) — SELURUH baris
            bisa diketuk untuk lihat detail, bukan cuma tanggalnya;
            biar ketukan tak sengaja tetap langsung kelihatan "ini
            transaksi apa" bukan cuma dead-tap. Tombol aksi pakai
            stopPropagation supaya tidak ikut membuka detail. */}
        {expanded && [...g.txs].sort((a, b) => opDate(a).localeCompare(opDate(b)) || a.createdAt.localeCompare(b.createdAt)).map((tx) => {
          const dipilih = pilihTx.has(tx.id);
          const tglTx = fmtTxOp(tx).split(" · ")[0];
          return (
            <div key={tx.id} className="flex items-center"
              style={{ borderTop: `1px solid ${t.divider}`, background: tx.id === highlightedTxId ? "#FFF4BF" : dipilih ? t.primaryLight : "transparent", transition: "background 0.4s ease" }}>
              <button onClick={() => togglePilihTx(tx.id)} role="checkbox" aria-checked={dipilih} aria-label={`Pilih ${tglTx}`}
                style={{ flex: "none", width: 54, height: 56, padding: 0, border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center" }}>
                <span style={{ width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", background: dipilih ? t.primary : t.surface, border: `2px solid ${dipilih ? t.primaryLine : t.borderStrong}`, color: t.onPrimary }}>
                  {dipilih && <Check size={17} strokeWidth={3} />}
                </span>
              </button>
              <button onClick={() => setDetailTx(tx)} className="flex items-center"
                style={{ flex: 1, minWidth: 0, gap: 10, minHeight: 56, padding: "0 16px 0 0", border: "none", background: "transparent", textAlign: "left", fontFamily: "inherit", cursor: "pointer" }}>
                <SourceTag source={tx.source} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {tglTx}
                  {isAkhirPekan(opDate(tx)) && (
                    <span style={{ marginLeft: 8, fontSize: 12.5, fontWeight: 700, color: t.warnText, background: t.warnFill, borderRadius: 999, padding: "1px 8px" }}>{namaHari(opDate(tx))}</span>
                  )}
                </span>
                <span style={{ flex: "none", fontSize: 15, fontWeight: 700, fontFamily: MONO }}>{rupiah(tx.total)}</span>
                <span style={{ flex: "none", fontSize: 14, fontWeight: 600, color: t.text2 }}>Rincian ›</span>
              </button>
            </div>
          );
        })}

        {/* Footer: dua tombol berlabel, sama besar (pemilik memilih opsi 2; ikon polos susah ditebak Papa/Mama).
            "Tagih via WA" BERUBAH HIJAU "Ditagih dd/mm" setelah tagihan dikirim; tetap bisa diketuk untuk kirim ulang. */}
        {expanded && <div className="flex gap-2" style={{ padding: "12px 16px", borderTop: `1px solid ${t.divider}` }}>
          {g.txs.every((tx) => tx.billedAt) ? (() => {
            const b = g.txs.reduce((m, tx) => (tx.billedAt! > m ? tx.billedAt! : m), g.txs[0].billedAt!);
            return (
              <button onClick={() => shareWA(g, pool, label)} title="Sudah ditagih — ketuk untuk kirim ulang" aria-label="Kirim ulang tagihan WA"
                className="flex items-center justify-center gap-2"
                style={{ flex: 1, minWidth: 0, height: 48, borderRadius: 14, border: "1.5px solid #D8E6D4", background: t.successBg, color: t.successText, cursor: "pointer", fontWeight: 800, fontSize: 14.5 }}>
                <Share2 size={17} /> Ditagih {b.slice(8, 10)}/{b.slice(5, 7)}
              </button>
            );
          })() : (
            <button onClick={() => shareWA(g, pool, label)} aria-label="Tagih via WA" className="flex items-center justify-center gap-2"
              style={{ flex: 1, minWidth: 0, height: 48, borderRadius: 14, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, cursor: "pointer", fontWeight: 700, fontSize: 14.5 }}>
              <Share2 size={17} /> Tagih via WA
            </button>
          )}
          <button onClick={() => (terpilih.length ? setConfirmLunas({ customer: g.customer, txs: terpilih, total: terpilih.reduce((s, x) => s + x.total, 0), sebagian: true }) : setConfirmLunas(g))}
            style={{ flex: 1, minWidth: 0, height: 48, borderRadius: 14, border: "none", background: t.primary, color: t.onPrimary, cursor: "pointer", fontWeight: 800, fontSize: 14.5 }}>
            {terpilih.length ? `Lunaskan ${terpilih.length} tanggal` : "Lunaskan Semua"}
          </button>
        </div>}
      </div>
    );
  };

  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 90px" }}>

        {/* Judul & total — ringan, IKUT SCROLL (bukan sticky): fokus halaman
            adalah memproses daftar transaksi, bukan dashboard keuangan */}
        <div className="flex items-center justify-between" style={{ padding: "20px 20px 6px", minHeight: 44 + 26 }}>
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

          <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
            {/* Cari — SAMA dengan Pre-order/Menu: tinggi 44, sudut 12, garis 1.5px, latar kartu */}
            <div className="flex items-center gap-2" style={{ flex: 1, minWidth: 0, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "0 12px", height: 44, boxSizing: "border-box" }}>
              <Search size={18} color={t.text2} style={{ flex: "none" }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama…"
                style={{ border: "none", outline: "none", background: "transparent", fontSize: 16, width: "100%", minWidth: 0, color: t.text, fontFamily: "inherit" }} />
              {q && <X size={18} color={t.text2} style={{ cursor: "pointer", flex: "none" }} onClick={() => setQ("")} />}
            </div>
  
              <div ref={filterRef} style={{ position: "relative", flex: "none" }}>
            <button onClick={() => setFilterSheet((v) => !v)} aria-expanded={filterSheet} aria-label="Filter dan urutan"
              className="flex items-center gap-1"
              style={{ position: "relative", flex: "none", height: 44, padding: "0 14px", borderRadius: 12, fontSize: 14.5, fontWeight: filterActive ? 700 : 600, cursor: "pointer",
                border: `1px solid ${filterActive ? t.primaryLine : t.border}`, background: filterActive ? t.primary : t.surface, color: filterActive ? t.onPrimary : t.text2 }}>
              <SlidersHorizontal size={16} /> Filter
              {filterActive && (
                <span style={{ position: "absolute", top: -3, right: -3, width: 9, height: 9, borderRadius: "50%", background: t.primary, border: `1.5px solid ${t.bg}` }} />
              )}
            </button>
            {filterSheet && (
              <>
                <style>{`@keyframes ganen-pop{from{opacity:0;transform:translateY(-8px) scale(.94)}to{opacity:1;transform:none}}`}</style>
                <div onClick={() => setFilterSheet(false)} style={{ position: "fixed", inset: 0, zIndex: 44, background: "rgba(47,42,36,.18)" }} />
                {/* Filter ringkas & mengalir: muncul tepat di bawah tombol, langsung berlaku (tanpa tombol Terapkan), ketuk di luar = tutup */}
                <div role="dialog" aria-label="Filter dan urutan" style={{ position: "absolute", top: 52, right: 0, zIndex: 45, width: "min(260px, calc(100vw - 40px))", maxHeight: "60vh", overflowY: "auto", overscrollBehavior: "contain", background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 16, boxShadow: "0 14px 34px rgba(60,48,20,.22)", padding: 6, transformOrigin: "top right", animation: "ganen-pop .16s ease-out" }}>
                  {/* Daftar seperti filter Excel: urut ke bawah, satu pilihan per baris, centang di yang aktif; bisa digulir */}
                  {([
                    ["Sumber", ([["semua", "Semua"], ["preorder", "Pre-order"], ["penjualan", "Penjualan"]] as const).map(([v, l]) => ({ key: v, label: l, on: sourceFilter === v, pilih: () => setSourceFilter(v) }))],
                    ["Urutkan", (["az", "za", "newest", "oldest"] as const).map((v) => ({ key: v, label: v === "az" ? "A–Z" : v === "za" ? "Z–A" : v === "newest" ? "Terbaru dulu" : "Terlama dulu", on: sortMode === v, pilih: () => setSortMode(v) }))],
                    ["Tanggal", ([["semua", "Semua Tanggal"], ["hari", "Hari Ini"], ["7", "7 Hari Terakhir"], ["tanggal", "Pilih Tanggal…"]] as const).map(([v, l]) => ({ key: v, label: l, on: dateFilter === v, pilih: () => setDateFilter(v) }))],
                  ] as const).map(([judul, baris], gi) => (
                    <div key={judul} style={{ borderTop: gi ? `1px solid ${t.divider}` : "none", paddingTop: gi ? 4 : 0, marginTop: gi ? 4 : 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: t.text2, padding: "8px 10px 4px" }}>{judul}</div>
                      {baris.map((o) => (
                        <button key={o.key} onClick={o.pilih} role="menuitemradio" aria-checked={o.on} className="flex items-center justify-between"
                          style={{ width: "100%", minHeight: 44, padding: "0 10px", border: "none", borderRadius: 10, background: o.on ? t.primaryLight : "transparent", cursor: "pointer", fontFamily: "inherit", color: t.text, textAlign: "left" }}>
                          <span style={{ fontSize: 15, fontWeight: o.on ? 800 : 600 }}>{o.label}</span>
                          {o.on && <Check size={18} color={t.amberText} />}
                        </button>
                      ))}
                      {judul === "Tanggal" && dateFilter === "tanggal" && (
                        <input type="date" value={pickDate} onChange={(e) => setPickDate(e.target.value)}
                          onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* picker native */ } }}
                          aria-label="Pilih tanggal"
                          style={{ width: "calc(100% - 20px)", height: 44, margin: "4px 10px 6px", fontSize: 15, fontWeight: 700, color: pickDate ? t.text : t.textDis, background: t.surface, border: `1.5px solid ${t.primaryLine}`, borderRadius: 10, padding: "0 10px", fontFamily: "inherit", boxSizing: "border-box" }} />
                      )}
                    </div>
                  ))}
                  {tab === "unpaid" && (
                    <div style={{ borderTop: `1px solid ${t.divider}`, marginTop: 4, paddingTop: 4 }}>
                      <button onClick={() => setOnlyUnbilled((v) => !v)} role="menuitemcheckbox" aria-checked={onlyUnbilled} className="flex items-center justify-between"
                        style={{ width: "100%", minHeight: 44, padding: "0 10px", border: "none", borderRadius: 10, background: onlyUnbilled ? t.primaryLight : "transparent", cursor: "pointer", fontFamily: "inherit", color: t.text, textAlign: "left" }}>
                        <span style={{ fontSize: 15, fontWeight: onlyUnbilled ? 800 : 600 }}>Hanya Belum Ditagih</span>
                        {onlyUnbilled && <Check size={18} color={t.amberText} />}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
            </div>
          </div>
        </div>

        {/* ---- Tab: Belum Dibayar ---- */}
        {tab === "unpaid" && (
          <div style={{ padding: "4px 20px" }}>
            {modeDaftar ? (
              <>
                {/* Filter yang tersembunyi di popover dibuat kelihatan — dulu bikin "pesanan tidak ketemu" */}
                {(dateFilter !== "semua" || onlyUnbilled) && (
                  <div className="flex items-center justify-between" style={{ gap: 10, margin: "2px 0 12px", padding: "8px 8px 8px 14px", background: t.primaryLight, border: `1.5px solid ${t.primaryLine}`, borderRadius: 14 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700, minWidth: 0 }}>
                      Filter aktif: {[
                        dateFilter === "hari" ? "Hari Ini" : dateFilter === "7" ? "7 Hari Terakhir" : dateFilter === "tanggal" ? (pickDate ? `${pickDate.slice(8, 10)}/${pickDate.slice(5, 7)}` : "Pilih Tanggal") : "",
                        onlyUnbilled ? "Hanya Belum Ditagih" : "",
                      ].filter(Boolean).join(" · ")}
                    </span>
                    <button onClick={() => { setDateFilter("semua"); setPickDate(""); setOnlyUnbilled(false); }}
                      style={{ flex: "none", height: 44, padding: "0 14px", borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 800, fontSize: 14.5, cursor: "pointer" }}>
                      Hapus filter
                    </button>
                  </div>
                )}
                {groups.length === 0
                  ? <Empty q={q} lain={cariLain} bukaTab={setTab} />
                  : groups.map((g) => kartuBelum(g))}
              </>
            ) : pekanList.every((p) => p.anak === 0) ? (
              <Empty q="" />
            ) : (
              <div onTouchStart={(e) => { sentuh.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
                onTouchEnd={(e) => { const m = sentuh.current; sentuh.current = null; if (m) geserPekan(e.changedTouches[0].clientX - m.x, e.changedTouches[0].clientY - m.y); }}>
                {/* Barisan minggu: digeser kanan-kiri; bulan = judul kelompok (ditulis sekali); garis di dasar chip = status (merah ada yang belum ditagih, hijau beres, abu kosong) */}
                <RailGeser style={{ gap: 14, padding: "2px 2px 10px" }}>
                  {kelompokBulan.map((k) => (
                    <div key={k.ym} style={{ flex: "none" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.text2, borderBottom: "1.5px solid #CFC6AE", padding: "0 3px 2px", margin: "0 2px 6px" }}>{k.label}</div>
                      <div className="flex" style={{ gap: 6 }}>
                        {k.pekan.map((x) => {
                          const on = x.senin === pekanBuka;
                          const warna = x.belum > 0 ? "#D95D5D" : x.anak > 0 ? t.success : "#DDD4C0";
                          return (
                            <button key={x.senin} id={`chip-${x.senin}`} onClick={() => setPekanBuka(x.senin)} aria-pressed={on} aria-label={`Minggu ${labelPekan(x.senin)}`}
                              style={{ flex: "none", minWidth: 68, padding: "9px 8px 8px", borderRadius: 13, border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primary : t.surface, color: t.text, fontFamily: "inherit", fontSize: 16, fontWeight: 600, lineHeight: 1.1, whiteSpace: "nowrap", cursor: "pointer" }}>
                              {rentangPendek(x.senin)}
                              <span style={{ display: "block", height: 3, borderRadius: 2, margin: "7px 4px 0", background: warna }} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </RailGeser>
                {pekanDibuka && ((p) => (
                        <div style={{ padding: "2px 0 10px" }}>
                          {p.belum > 0 && (
                            <>
                              <button onClick={() => mulaiTagih([p.senin, ...gabungDipilih])} className="flex items-center justify-center gap-2"
                                style={{ width: "100%", height: 56, marginBottom: calonGabung.length ? 6 : 14, borderRadius: 14, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 17, cursor: "pointer" }}>
                                <MessageCircle size={20} />
                                {gabungN > 0 ? `Tagih ${1 + gabungDipilih.length} minggu (${antreanMinggu([p.senin, ...gabungDipilih]).reduce((s, e) => s + e.length, 0)})` : `Tagih satu per satu (${p.belum})`}
                              </button>
                              {/* Gabung dengan minggu sebelumnya: satu pesan per anak, bukan dua WhatsApp. Baris berikutnya muncul setelah yang ini dicentang. */}
                              {calonGabung.slice(0, gabungN + 1).map((c, i) => {
                                const on = i < gabungN;
                                return (
                                  <button key={c.senin} onClick={() => setGabungN(on ? i : i + 1)} role="checkbox" aria-checked={on} className="flex items-center gap-3"
                                    style={{ width: "100%", minHeight: 48, padding: "0 4px", marginBottom: i === Math.min(gabungN, calonGabung.length - 1) ? 12 : 0, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", color: t.text, textAlign: "left" }}>
                                    <span style={{ width: 26, height: 26, borderRadius: 8, flex: "none", display: "grid", placeItems: "center", background: on ? t.primary : t.surface, border: `2px solid ${on ? t.primaryLine : t.borderStrong}`, color: t.onPrimary }}>
                                      {on && <Check size={17} strokeWidth={3} />}
                                    </span>
                                    <span style={{ fontSize: 15.5, fontWeight: 700 }}>Gabung dengan {labelPekan(c.senin)} <span style={{ color: t.text2, fontWeight: 600 }}>({c.belum})</span></span>
                                  </button>
                                );
                              })}
                            </>
                          )}
                          {groupsPekan.length === 0
                            ? <div style={{ textAlign: "center", padding: "24px 20px", fontSize: 15, color: t.text2, fontWeight: 600 }}>Belum ada tagihan.</div>
                            : (() => {
                                /* Daftar A–Z: huruf besar sebagai pemisah + indeks huruf di tepi kanan (pilihan pemilik 31 Okt). */
                                const bundel = bundelWa(groupsPekan);
                                const abjad = sortMode === "az" || sortMode === "za";
                                const hurufDari = (b: Grup[]) => { const h = (b[0].customer.nama.trim()[0] || "#").toUpperCase(); return /[A-Z]/.test(h) ? h : "#"; };
                                const ada = abjad ? [...new Set(bundel.map(hurufDari))] : [];
                                let prev = "";
                                return (
                                  <>
                                    {bundel.map((b) => {
                                      const h = abjad ? hurufDari(b) : "";
                                      const kepala = abjad && h !== prev;
                                      if (abjad) prev = h;
                                      const isi = (
                                        <div key={`${p.senin}|${normWa(b[0].customer.wa)}`} style={{ paddingLeft: 12, marginBottom: 6, borderLeft: `3px solid ${t.primaryLine}`, borderRadius: 1 }}>
                                          {b.map((g) => kartuBelum(g, `${p.senin}|`, groupsPekan, labelPekan(p.senin)))}
                                        </div>
                                      );
                                      return (
                                        <div key={`${p.senin}|b|${groupKey(b[0].customer)}`} style={{ paddingRight: ada.length > 3 ? 22 : 0 }}>
                                          {kepala && (
                                            <div id={`abj-${p.senin}-${h}`} style={{ margin: "24px 0 6px 2px", scrollMarginTop: 176, fontSize: 16, fontWeight: 800, color: t.text2, letterSpacing: ".04em" }}>{h}</div>
                                          )}
                                          {isi}
                                        </div>
                                      );
                                    })}
                                    {abjad && ada.length > 3 && (
                                      <RailAbjad huruf={ada} bawah={NAV_HEIGHT + 16}
                                        onPilih={(h) => document.getElementById(`abj-${p.senin}-${h}`)?.scrollIntoView({ block: "start" })} />
                                    )}
                                  </>
                                );
                              })()}
                        </div>
                ))(pekanDibuka)}
              </div>
            )}
          </div>
        )}

        {/* ---- Tab: Lunas & Dibatalkan (render sama, isi beda) ---- */}
        {tab !== "unpaid" && (
          <div style={{ padding: "4px 20px" }}>
            {/* Aplikasi harian hanya memuat 30 hari terakhir (supaya cepat dan
                hemat kuota). Yang lebih lama TIDAK hilang — disebut jelas agar
                tidak disangka transaksi lenyap. */}
            <div style={{ fontSize: 13.5, lineHeight: 1.5, color: t.text2, margin: "2px 2px 12px" }}>
              Menampilkan {LIVE_DAYS} hari terakhir. Transaksi yang lebih lama tetap tersimpan aman di database.
            </div>
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
                      <span style={{ fontSize: 13, fontWeight: 700, color: t.text, background: "transparent", border: "1.5px solid #A59B80", borderRadius: 999, padding: "1px 9px", flex: "none", lineHeight: 1.35 }}>
                        {g.customer.kelas || g.customer.tingkat}
                      </span>
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 800, color: riwayatFilter === "batal" ? t.text2 : t.successText, flex: "none" }}>
                      {rupiah(riwayatFilter === "batal" ? g.txs.reduce((s, tx) => s + tx.total, 0) : g.totalMasuk)}
                    </span>
                  </div>
                  {g.customer.wa && <div style={{ fontSize: 13, color: t.text2, marginTop: 3 }}>{g.customer.wa}</div>}
                </div>
                {/* Per transaksi: SATU baris ringkas. Ketuk = struk (isi pesanan + aksi). */}
                {g.txs.map((tx) => {
                  const cancelled = !!tx.cancelledAt;
                  return (
                    <button key={tx.id} onClick={() => setDetailTx(tx)} className="flex items-center"
                      style={{ width: "100%", gap: 10, minHeight: 54, padding: "0 16px", border: "none", borderTop: `1px solid ${t.divider}`, background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                      <StatusDot cancelled={cancelled} />
                      <SourceTag source={tx.source} muted={cancelled} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, color: cancelled ? t.text2 : t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmtTxOp(tx).split(" · ")[0]}</span>
                      <span style={{ flex: "none", fontSize: 15, fontWeight: 700, textDecoration: cancelled ? "line-through" : "none", color: cancelled ? t.text2 : t.text, fontFamily: MONO }}>
                        {rupiah(tx.total)}
                      </span>
                      <ChevronRight size={16} color={t.text2} style={{ flex: "none" }} />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tagih satu per satu (layar penuh); popup rincian/ubah tanggal (z 85) tetap di atasnya */}
      {tagih && (
        <TagihSatuSatu pekan={tagih.pekan} antrean={tagih.antrean} byId={byId}
          bangunPesan={buildWaMsg} onKirim={onMarkBilled} onUbahTanggal={setDetailTx} onTutup={() => setTagih(null)} />
      )}

      {/* Undo bar */}
      {undo && (
        <div style={{ position: "fixed", left: 20, right: 20, bottom: 24 + NAV_HEIGHT, zIndex: tagih ? 90 : 60, display: "flex", justifyContent: "center" }}>
          <div className="flex items-center gap-3" style={{ maxWidth: 420, width: "100%", background: t.primary, color: t.onPrimary, borderRadius: 14, padding: "12px 14px 12px 18px", boxShadow: "0 14px 34px rgba(47,42,36,.3)" }}>
            <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600 }}>
              {undo.type === "paid" ? `Ditandai Lunas — ${undo.tx.customer.nama}`
                : undo.type === "unpaid" ? `Dikembalikan ke Belum Dibayar — ${undo.tx.customer.nama}`
                : `Transaksi dibatalkan — ${undo.tx.customer.nama}`}
            </span>
            <button onClick={doUndo} className="flex items-center gap-1"
              style={{ background: "transparent", border: "none", color: t.onPrimary, textDecoration: "underline", fontWeight: 800, fontSize: 14.5, cursor: "pointer", padding: "8px 10px" }}>
              <Undo2 size={16} /> Urungkan
            </button>
          </div>
        </div>
      )}
      {toast && !undo && (
        <div style={{ position: "fixed", left: 20, right: 20, bottom: 24 + NAV_HEIGHT, zIndex: tagih ? 90 : 60, display: "flex", justifyContent: "center" }}>
          <div style={{ maxWidth: 420, width: "100%", background: t.primary, color: t.onPrimary, borderRadius: 14, padding: "14px 18px", fontSize: 14.5, fontWeight: 600 }}>{toast}</div>
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
                  <span>{toTitleCase(it.name)}{it.variant ? ` (${it.variant})` : ""} ×{it.qty}</span>
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
              {tab === "unpaid" && (
                <div className="flex gap-2" style={{ marginTop: 14, fontFamily: "'Onest', sans-serif" }}>
                  <button onClick={() => { const x = detailTx; setDetailTx(null); markPaid(x); }} className="flex items-center justify-center gap-1.5"
                    style={{ flex: 2, height: 48, borderRadius: 12, border: "none", background: t.success, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
                    <Check size={18} /> Tandai Lunas
                  </button>
                  <button onClick={() => { const x = detailTx; setDetailTx(null); cancel(x); }} className="flex items-center justify-center gap-1"
                    style={{ flex: 1.2, height: 48, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.error, fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "0 4px" }}>
                    <Trash2 size={16} style={{ flex: "none" }} /> Batalkan
                  </button>
                </div>
              )}
              {tab !== "unpaid" && (
                <div className="flex gap-2" style={{ marginTop: 14, fontFamily: "'Onest', sans-serif" }}>
                  {detailTx.cancelledAt ? (
                    <button onClick={() => { const x = detailTx; setDetailTx(null); pulihkan(x); }} className="flex items-center justify-center gap-1.5"
                      style={{ flex: 1.4, height: 46, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                      <RotateCcw size={15} /> Pulihkan
                    </button>
                  ) : (
                    <>
                      <button onClick={() => { const x = detailTx; setDetailTx(null); unpay(x); }} className="flex items-center justify-center gap-1"
                        style={{ flex: 2.1, height: 46, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "0 2px", whiteSpace: "nowrap" }}>
                        <Undo2 size={15} style={{ flex: "none" }} /> Belum Dibayar
                      </button>
                      <button onClick={() => { const x = detailTx; setDetailTx(null); cancel(x); }} className="flex items-center justify-center gap-1"
                        style={{ flex: 1, height: 46, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, fontSize: 13.5, fontWeight: 700, cursor: "pointer", padding: "0 4px" }}>
                        <Ban size={15} style={{ flex: "none" }} /> Batalkan
                      </button>
                    </>
                  )}
                  <button onClick={() => { const x = detailTx; setDetailTx(null); setTrashConfirmTx(x); }} className="flex items-center justify-center gap-1"
                    style={{ flex: 1, height: 46, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.error, fontSize: 13.5, fontWeight: 700, cursor: "pointer", padding: "0 4px" }}>
                    <Trash2 size={15} style={{ flex: "none" }} /> Hapus
                  </button>
                </div>
              )}
              <div style={{ position: "relative", marginTop: 14, height: 52, borderRadius: 12, border: `1.5px solid ${t.primaryLine}`, background: t.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Onest', sans-serif", fontWeight: 800, fontSize: 14.5, color: t.amberText }}>
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
              <div style={{ fontSize: 14.5, fontWeight: 800 }}>{confirmLunas.sebagian ? `LUNASKAN ${confirmLunas.txs.length} TANGGAL?` : "LUNASKAN SEMUA?"}</div>
              <div style={{ borderTop: `1.5px dashed ${t.border}`, margin: "10px 0" }} />
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>{confirmLunas.customer.nama}</div>
              <div style={{ fontSize: 12, color: t.text2 }}>{confirmLunas.txs.length} transaksi</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{rupiah(confirmLunas.total)}</div>
              <div className="flex gap-2" style={{ marginTop: 14, fontFamily: "'Onest', sans-serif" }}>
                <button onClick={() => setConfirmLunas(null)}
                  style={{ flex: 1, height: 50, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                  Tidak
                </button>
                <button onClick={() => { confirmLunas.txs.forEach(markPaid); setPilihTx((prev) => { const n = new Set(prev); confirmLunas.txs.forEach((x) => n.delete(x.id)); return n; }); setConfirmLunas(null); }}
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
              <button onClick={() => setWaDraft(null)} aria-label="Tutup" style={{ border: `1.5px solid ${t.border}`, background: t.surface, cursor: "pointer", color: t.text, width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center" }}><X size={17} /></button>
            </div>
            <div style={{ fontSize: 12.5, color: t.text2, marginBottom: 10 }}>Periksa & edit sebelum dikirim.</div>
            {waDraft.siblings.length > 0 && (
              /* Kakak-adik satu nomor WA → tawarkan SATU pesan gabungan
                 supaya ortu tidak menerima tagihan dua kali */
              <button onClick={toggleMergeWa} className="flex items-center gap-3"
                style={{ width: "100%", marginBottom: 10, padding: "12px 14px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                  border: `1.5px solid ${t.primaryLine}`, background: t.primaryLight }}>
                <span style={{ width: 26, height: 26, borderRadius: 8, flex: "none", display: "grid", placeItems: "center",
                  background: waDraft.merged ? t.primary : t.surface, border: `2px solid ${t.primaryLine}`, color: t.onPrimary }}>
                  {waDraft.merged && <Check size={16} />}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: t.amberText, lineHeight: 1.45 }}>
                  {waDraft.merged
                    ? `Tagihan digabung (${1 + waDraft.siblings.length} anak, satu pesan)`
                    : `Nomor ini juga punya tagihan lain: ${waDraft.siblings.map((s) => `${toTitleCase(s.customer.nama)} (${s.customer.kelas || s.customer.tingkat})`).join(", ")} — ketuk untuk gabungkan`}
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
function SourceTag({ source, muted }: { source: Transaction["source"]; muted?: boolean }) {
  const pre = source === "preorder";
  return (
    <span title={pre ? "Pre-order" : "Penjualan"} aria-label={pre ? "Pre-order" : "Penjualan"}
      style={{ width: 22, height: 22, display: "grid", placeItems: "center", flex: "none", color: muted ? "#8A8579" : t.text2 }}>
      {pre ? <Utensils size={17} /> : <ShoppingCart size={17} />}
    </span>
  );
}
/** Ikon status baris: Lunas = lingkaran hijau berbingkai + latar hijau tipis + centang; Dibatalkan = lingkaran abu dicoret. */
function StatusDot({ cancelled, unpaid }: { cancelled?: boolean; unpaid?: boolean }) {
  if (unpaid) {
    return <span aria-label="Belum Dibayar" title="Belum Dibayar" style={{ width: 26, height: 26, borderRadius: "50%", flex: "none", boxSizing: "border-box", border: "1.8px dashed #756B5D" }} />;
  }
  return cancelled ? (
    <span aria-label="Dibatalkan" title="Dibatalkan" style={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", flex: "none", background: "#F1EFE8", border: "1.8px solid #8A8579", color: "#8A8579" }}>
      <Ban size={14} strokeWidth={2.4} />
    </span>
  ) : (
    <span aria-label="Lunas" title="Lunas" style={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", flex: "none", background: t.successBg, border: `1.8px solid ${t.success}`, color: t.successText }}>
      <Check size={15} strokeWidth={3} />
    </span>
  );
}
function Empty({ q, lain, bukaTab }: { q: string; lain?: { lunas: number; batal: number } | null; bukaTab?: (tab: Tab) => void }) {
  const tombol: React.CSSProperties = { height: 48, padding: "0 16px", borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, fontSize: 15, cursor: "pointer" };
  return (
    <div style={{ textAlign: "center", padding: "56px 20px" }}>
      <div style={{ width: 60, height: 60, borderRadius: 16, background: t.successBg, color: t.successText, display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
        <Check size={28} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{q ? "Tidak ada di Belum Dibayar" : "Semua tagihan lunas"}</div>
      <div style={{ fontSize: 14, color: t.text2, marginTop: 6 }}>{q ? "Coba kata kunci lain." : "Tidak ada yang belum dibayar. Kerja bagus."}</div>
      {q && lain && (lain.lunas > 0 || lain.batal > 0) && bukaTab && (
        <div className="flex items-center justify-center gap-2" style={{ marginTop: 16, flexWrap: "wrap" }}>
          {lain.lunas > 0 && <button onClick={() => bukaTab("riwayat")} style={tombol}>Ada {lain.lunas} di Lunas</button>}
          {lain.batal > 0 && <button onClick={() => bukaTab("batal")} style={tombol}>Ada {lain.batal} di Dibatalkan</button>}
        </div>
      )}
    </div>
  );
}
/** Titik merah di panah bulan: ada yang belum ditagih di bulan lain. */
function TitikMerah() {
  return <span aria-hidden style={{ position: "absolute", top: 7, right: 6, width: 10, height: 10, borderRadius: "50%", background: t.error, border: `1.5px solid ${t.bg}` }} />;
}
/** Penanda minggu yang belum selesai. */
function PilBerjalan() {
  return <span style={{ flex: "none", fontSize: 13, fontWeight: 700, color: t.text, background: t.primaryLight, border: `1.5px solid ${t.primaryLine}`, borderRadius: 999, padding: "2px 11px" }}>Berjalan</span>;
}
