import { useMemo, useState, useEffect, useRef } from "react";
import {
  Search, X, Check, Trash2, Share2, ShoppingCart, Utensils,
  Undo2, Wallet, Settings, History, Ban, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, RotateCcw, Pencil, SlidersHorizontal, MessageCircle, Copy,
} from "lucide-react";
import { salinTeks, BATAS_LINK_WA } from "../../lib/salin";
import { t, NAV_HEIGHT } from "../../lib/theme";
import { rupiah, fmtWaDate, todayISO, serviceDateLabel } from "../../lib/format";
import { mondayOf, sudahDitagih, labelPekan, bulanPekan, labelBulan, pekanBerjalan, isAkhirPekan, namaHari, rentangPendek } from "../../lib/pekan";
import RailGeser from "../components/RailGeser";
import PaperTabs from "../components/PaperTabs";
import TagihSatuSatu from "../components/TagihSatuSatu";
import RailAbjad from "../components/RailAbjad";
import IkonDitagih from "../components/IkonDitagih";
import GeserBaris from "../components/GeserBaris";
import GeserTx from "../components/GeserTx";
import { useKunciGulir } from "../components/useKunciGulir";
import { isiTemplateTransfer } from "../../lib/waTemplate";
import type { Transaction, CanteenSettings } from "../../types";

/* ============================================================
   TRANSAKSI — Canteen Gan En
   Belum Dibayar: dikelompokkan per Nama + WA (auto-merge).
   Lunas: dikelompokkan per Nama + WA (terbaru di atas).
   ============================================================ */

const BLN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
/** Rincian transaksi (tanggal · item · harga) pakai font thermal/mono
 * seperti struk PO — kontras dengan Inter di kartu info anak,
 * supaya fokus tidak terbagi. */
const MONO = "'Red Hat Mono', ui-monospace, 'Cascadia Mono', 'SF Mono', 'Roboto Mono', 'Courier New', monospace";
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
const padat = (s: string) => s.replace(/s+/g, "");
/** Selisih satu huruf (ganti/tambah/kurang/tukar dua huruf bersebelahan): "luisas" vs "lusias". */
function mirip1(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return (a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i));
}
function unionGroups(txs: Transaction[]) {
  type G = { customer: Transaction["customer"]; txs: Transaction[]; newestAt: string; _nama: string; _kelas: Set<string>; _wa: Set<string> };
  const list: G[] = [];
  for (const tx of txs) {
    const c = tx.customer;
    const nn = normNama(c.nama); const kn = normKelas(c); const wn = normWa(c.wa);
    let g = list.find((x) => (padat(x._nama) === padat(nn) && (x._kelas.has(kn) || (!!wn && x._wa.has(wn))))
      || (!!wn && !!kn && x._kelas.has(kn) && x._wa.has(wn) && mirip1(padat(x._nama), padat(nn))));
    if (!g) { g = { customer: c, txs: [], newestAt: tx.createdAt, _nama: nn, _kelas: new Set(), _wa: new Set() }; list.push(g); }
    g.txs.push(tx);
    g._kelas.add(kn); if (wn) g._wa.add(wn);
    if (tx.createdAt >= g.newestAt) { g.newestAt = tx.createdAt; g.customer = c; }
  }
  return list;
}

type Tab = "unpaid" | "riwayat" | "batal";
type SourceFilter = "semua" | "preorder" | "penjualan";
type DateFilter = "semua" | "hari" | "tanggal";
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
/** Aksi di struk: ikon polos + tulisan kecil di bawahnya (tanpa garis/kotak), area ketuk ≥48px. */
function AksiStruk({ Ic, label, warna, onClick }: { Ic: React.ComponentType<{ size?: number }>; label: string; warna: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center justify-center"
      style={{ flex: 1, minHeight: 56, gap: 3, border: "none", background: "transparent", color: warna, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, padding: "4px 2px", whiteSpace: "nowrap" }}>
      <Ic size={22} />{label}
    </button>
  );
}
/** Kartu Belum Dibayar satu anak. */
type Grup = { customer: Transaction["customer"]; txs: Transaction[]; newestAt: string; total: number };
const buatGrup = (txs: Transaction[]): Grup[] =>
  unionGroups(txs).map((g) => ({ customer: g.customer, txs: g.txs, newestAt: g.newestAt, total: g.txs.reduce((s, tx) => s + tx.total, 0) }));
type UndoAction =
  | { type: "paid"; tx: Transaction }
  | { type: "paidMany"; txs: Transaction[] }
  | { type: "unpaid"; tx: Transaction }
  | { type: "cancel"; tx: Transaction }
  | { type: "cancelMany"; txs: Transaction[] };

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
  riwayatLamaStatus,
  onMuatRiwayatLama,
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
  riwayatLamaStatus: "idle" | "memuat" | "gagal" | "selesai";
  onMuatRiwayatLama: () => void;
  onOpenSettings?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("unpaid");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("semua");
  const [dateFilter, setDateFilter] = useState<DateFilter>("semua");
  /** Tab Dibatalkan berdiri sendiri; kode grup riwayat dipakai bersama. */
  const riwayatFilter: "lunas" | "batal" = tab === "batal" ? "batal" : "lunas";
  /** Rentang tanggal: pickDate = Dari, pickDateEnd = Sampai (satu hari = keduanya sama). */
  const [pickDate, setPickDate] = useState("");
  const [pickDateEnd, setPickDateEnd] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("az");
  /** Kartu yang SEMUA transaksinya sudah ditagih (hijau) disembunyikan —
   * hanya berlaku di tab Belum Dibayar, supaya yang belum dihubungi tidak
   * tenggelam di antara yang sudah beres. */
  const [onlyUnbilled, setOnlyUnbilled] = useState(false);
  /** Urutkan, Belum Ditagih, dan Tanggal digabung SATU sheet "Filter" —
   * baris chip tetap satu baris (tidak melebar jadi dua baris). */
  const [filterSheet, setFilterSheet] = useState(false);
  const [cariBuka, setCariBuka] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  useKunciGulir(filterSheet, filterRef);
  const filterActive = sortMode !== "az" || dateFilter !== "semua" || onlyUnbilled || sourceFilter !== "semua";

  const [q, setQ] = useState("");
  /** Kartu Lunas/Dibatalkan: ^ v untuk melipat. Bawaan: SEMUA TERLIPAT, terbuka hanya bila dibuka manual. */
  const [bukaLunas, setBukaLunas] = useState<Record<string, boolean>>({});
  /** Riwayat lama (> 30 hari) ditarik sekali per sesi, hanya saat tab Lunas/Dibatalkan dibuka atau saat mencari. */
  useEffect(() => {
    if (tab !== "unpaid" || q.trim()) onMuatRiwayatLama();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, q]);
  /** Belum Dibayar dibaca per PEKAN: daftar pekan → (ketuk) kartu anak di pekan itu.
   * pekanBuka = Senin pekan yang sedang dibuka (null = daftar pekan); bulanLihat = "YYYY-MM" (null = bulan pekan ini). */
  const [pekanBuka, setPekanBuka] = useState<string | null>(null);
  const [bulanLihat, setBulanLihat] = useState<string | null>(null);
  /** Satu minggu terbuka sekali; membuka yang lain menutup sebelumnya, jadi baris yang baru dibuka digulir ke bawah header. */
  useEffect(() => {
    if (!pekanBuka) return;
    const id = requestAnimationFrame(() => {
      document.getElementById(`chip-${pekanBuka}`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [pekanBuka]);
  /** Tagih satu per satu: antrean dibekukan saat mulai supaya urutan tidak bergeser. */
  const [tagih, setTagih] = useState<{ pekan: string[]; antrean: string[][][] } | null>(null);
  /** Berapa minggu sebelumnya (yang belum ditagih) digabung dengan minggu yang dibuka — satu pesan per anak. */
  /** Cakupan tagihan di Belum Dibayar: "ini" = minggu yang dibuka, "semua" = semua anak yang masih ada yang belum ditagih dari minggu mana pun. */
  const [cakupan, setCakupan] = useState<"ini" | "semua">("ini");
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tersalin, setTersalin] = useState(false);
  useEffect(() => { if (!tersalin) return; const id = setTimeout(() => setTersalin(false), 1800); return () => clearTimeout(id); }, [tersalin]);
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
  /** Lunas/Dibatalkan: hanya sebagian kartu digambar dulu (HP lemah: membuka tab ini dulu ±2 detik karena ratusan baris sekaligus). */
  const [batasRiwayat, setBatasRiwayat] = useState(30);
  useEffect(() => { setBatasRiwayat(30); }, [tab, q]);
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
      // Iterasi `transactions` (bukan cari per id): riwayat lama ribuan baris masuk sekaligus dan semuanya Lunas → langsung dilewati.
      for (const newTx of transactions) {
        const id = newTx.id;
        if (prevIds.has(id) || newTx.paid || newTx.cancelledAt) continue;
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
    return (!pickDate || d >= pickDate) && (!pickDateEnd || d <= pickDateEnd);
  };
  const matchQuery = (nama: string, kelas: string, wa?: string) => {
    const ql = q.toLowerCase().trim();
    if (!ql) return true;
    return `${nama} ${kelas} ${wa || ""}`.toLowerCase().includes(ql);
  };

  const unpaid = useMemo(
    () => transactions.filter((x) => !x.paid && !x.cancelledAt && bySource(x) && byDate(x)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, sourceFilter, dateFilter, pickDate, pickDateEnd]
  );

  /* Grupkan Belum Dibayar per ANAK (aturan ganda unionGroups), urut sesuai sortMode */
  const groups = useMemo(() => {
    const filtered = unpaid.filter((tx) => matchQuery(tx.customer.nama, tx.customer.kelas, tx.customer.wa));
    const built = unionGroups(filtered)
      .map((g) => ({ customer: g.customer, txs: g.txs, newestAt: g.newestAt, total: g.txs.reduce((s, tx) => s + tx.total, 0) }))
      .filter((g) => !onlyUnbilled || !g.txs.every((tx) => sudahDitagih(tx.billedAt)));
    return sortGroups(built, sortMode);
  }, [unpaid, q, sortMode, onlyUnbilled]);

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);
  /** Transaksi -> kartu anak (semua minggu). Dicari sekali di sini, bukan di tiap baris: dulu `groups.find(...)` per baris = ribuan x ribuan saat Semua dibuka (lambat di HP lemah). */
  const grupDariTx = useMemo(() => {
    const m = new Map<string, (typeof groups)[number]>();
    for (const x of groups) for (const tx of x.txs) m.set(tx.id, x);
    return m;
  }, [groups]);

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
      const belum = gs.filter((g) => g.txs.some((tx) => !sudahDitagih(tx.billedAt))).length;
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
    const bulanIniYm = bulanPekan(mondayOf(hariIni));
    for (const x of urutPekan.filter((y) => y.anak > 0 || bulanPekan(y.senin) === bulanIniYm || y.senin === pekanBuka)) {
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
  /** Arah masuk daftar saat minggu berganti (daftar meluncur masuk dari sisi yang searah gerakan, bukan loncat). */
  const [arahGeser, setArahGeser] = useState<"" | "kiri" | "kanan">("");
  const pilihPekan = (senin: string) => {
    const a = urutPekan.findIndex((x) => x.senin === pekanBuka);
    const b = urutPekan.findIndex((x) => x.senin === senin);
    setCakupan("ini");
    if (b === a) return;
    setArahGeser(b > a ? "kiri" : "kanan");
    setPekanBuka(senin);
  };
  /** Geser kanan = minggu sebelumnya, geser kiri = minggu berikutnya. */
  const geserPekan = (dx: number, dy: number) => {
    if (Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy)) return;
    const i = urutPekan.findIndex((x) => x.senin === pekanBuka);
    if (i < 0) return;
    if (dx > 0 && i > 0) pilihPekan(urutPekan[i - 1].senin);
    else if (dx < 0 && i < urutPekan.length - 1) pilihPekan(urutPekan[i + 1].senin);
  };
  const pekanDibuka = pekanBuka ? pekanList.find((p) => p.senin === pekanBuka) || null : null;
  const groupsPekan = useMemo(
    () => (cakupan === "semua"
      ? sortGroups(buatGrup(pekanList.filter((x) => x.belum > 0).flatMap((x) => x.txs)), sortMode)
      : pekanDibuka ? sortGroups(buatGrup(pekanDibuka.txs), sortMode) : []),
    [pekanDibuka, sortMode, cakupan, pekanList]
  );
  const byId = useMemo(() => new Map(transactions.map((x) => [x.id, x])), [transactions]);

  /** Antrean satu pekan: anak yang masih ada tagihan belum dikirim; kakak-adik satu nomor WA digabung jadi satu pesan. */
  const antreanMinggu = (daftar: string[]) => {
    const txs = pekanList.filter((x) => daftar.includes(x.senin)).flatMap((x) => x.txs);
    /* SELALU bisa tagih ulang (pemilik 6 Nov): semua anak yang masih Utang ikut antrean, tanpa menunggu minggu depan; yang belum ditagih di depan. */
    const urut = sortGroups(buatGrup(txs), sortMode);
    const gs = [...urut.filter((g) => g.txs.some((tx) => !sudahDitagih(tx.billedAt))), ...urut.filter((g) => !g.txs.some((tx) => !sudahDitagih(tx.billedAt)))];
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
  /** Senin semua minggu yang masih punya anak belum ditagih. */
  const semuaSenin = pekanList.filter((x) => x.belum > 0).map((x) => x.senin).sort();
  /** Pekan yang dibuka sudah habis (semua lunas/dipindah) → kembali ke daftar, jangan loncat sendiri saat ada tagihan baru. */
  /** Tab Transaksi tetap terpasang tetapi disembunyikan (display:none) saat tab lain aktif — gulir ke chip terpilih TIDAK jalan saat tersembunyi.
   * Maka begitu barisan chip benar-benar tampil (lebar 0 -> >0), gulir sekali ke minggu terpilih (minggu ini). */
  useEffect(() => {
    if (!pekanBuka) return;
    const chip = document.getElementById(`chip-${pekanBuka}`);
    const strip = chip?.closest(".hscroll") as HTMLElement | null;
    if (!chip || !strip) return;
    const gulir = () => {
      const a = strip.getBoundingClientRect(), b = chip.getBoundingClientRect();
      if (a.width === 0) return;
      strip.scrollLeft += b.left - a.left - (a.width - b.width) / 2;
    };
    const ulang = [120, 500, 1200].map((ms) => window.setTimeout(gulir, ms));
    let tampil = strip.clientWidth > 0;
    if (tampil) gulir();
    const ro = new ResizeObserver(() => {
      const kini = strip.clientWidth > 0;
      if (kini && !tampil) gulir();
      tampil = kini;
    });
    ro.observe(strip);
    return () => { ro.disconnect(); ulang.forEach((id) => window.clearTimeout(id)); };
  }, [pekanBuka]);
  /** Minggu terpilih awal = MINGGU INI (yang memuat hari ini), seperti kalender yang membuka di hari ini. */
  useEffect(() => {
    if (pekanBuka && pekanList.some((x) => x.senin === pekanBuka)) return;
    const asal = [...pekanList].sort((a, b) => a.senin.localeCompare(b.senin));
    const pilih = asal.find((x) => x.senin === mondayOf(todayISO())) || asal[asal.length - 1];
    setPekanBuka(pilih ? pilih.senin : null);
  }, [pekanList, pekanBuka]);
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
    // Tab kerja utama (Belum Dibayar) tidak perlu menghitung riwayat ribuan baris tiap data/ketikan berubah.
    if (tab === "unpaid") return [];
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
  }, [tab, transactions, sourceFilter, q, dateFilter, pickDate, pickDateEnd, riwayatFilter, sortMode]);

  // Total header tab Lunas: tanpa cari/filter = "Masuk bulan ini" (seluruh riwayat bisa ratusan juta dan membingungkan);
  // dengan cari/filter = jumlah Lunas dari hasil yang tampil.
  const lunasTanpaFilter = !q.trim() && dateFilter === "semua" && sourceFilter === "semua";
  const historyMasuk = useMemo(
    () => tab !== "riwayat" ? 0 : transactions
      .filter((x) => x.paid && !x.cancelledAt && bySource(x) && byDate(x) && matchQuery(x.customer.nama, x.customer.kelas, x.customer.wa)
        && (!lunasTanpaFilter || opDate(x).startsWith(todayISO().slice(0, 7))))
      .reduce((s, x) => s + x.total, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, transactions, sourceFilter, q, dateFilter, pickDate, pickDateEnd]
  );

  // Total tab Dibatalkan (abu-abu, sekadar informasi)
  const batalTotal = useMemo(
    () => (tab === "batal" ? riwayatGroups.reduce((s, g) => s + g.txs.reduce((s2, tx) => s2 + tx.total, 0), 0) : 0),
    [tab, riwayatGroups]
  );

  const markPaid = (tx: Transaction) => { onMarkPaid(tx.id); setUndo({ type: "paid", tx }); };
  /** Lunas satu anak sekaligus (geser baris): semua transaksinya, satu Urungkan membatalkan semuanya. */
  const markPaidMany = (txs: Transaction[]) => { if (!txs.length) return; txs.forEach((tx) => onMarkPaid(tx.id)); setUndo({ type: "paidMany", txs }); };
  /** Kebalikan Tandai Lunas — jalan keluar untuk salah pencet Lunas yang
   * baru ketahuan SETELAH jendela Urungkan lewat. Sebelumnya tidak ada
   * jalannya sama sekali: "Batalkan" di tab Lunas membatalkan TRANSAKSI
   * (soft-delete), dan Pulihkan mengembalikannya ke Lunas lagi (paid tak
   * pernah disentuh) — celah yang ditemukan Papa. */
  const unpay = (tx: Transaction) => { onUnmarkPaid(tx.id); setUndo({ type: "unpaid", tx }); };
  const cancel = (tx: Transaction) => { onCancel(tx.id); setUndo({ type: "cancel", tx }); };
  /** Batalkan semua transaksi satu anak (geser baris Utang); satu Urungkan memulihkan semuanya. */
  const cancelMany = (txs: Transaction[]) => { if (!txs.length) return; txs.forEach((tx) => onCancel(tx.id)); setUndo({ type: "cancelMany", txs }); };
  /** Dibatalkan -> Tong Sampah (geser kanan): lunak, bisa dipulihkan 30 hari. */
  const buangKeTong = (tx: Transaction) => { onMoveToTrash(tx.id); setToast(`${tx.customer.nama} dibuang ke Tong Sampah — bisa dipulihkan 30 hari`); };
  const pulihkan = (tx: Transaction) => {
    onRestore(tx);
    if (undo?.type === "cancel" && undo.tx.id === tx.id) setUndo(null);
    // Pulihkan TIDAK menyentuh status bayar: transaksi kembali ke tab
    // sesuai statusnya semula — jangan menjanjikan "Belum Dibayar" untuk
    // transaksi yang sebenarnya Lunas.
    setToast(`Dipulihkan — ${tx.customer.nama} kembali ke ${tx.paid ? "Lunas" : "Utang"}`);
  };
  const doUndo = () => {
    if (!undo) return;
    if (undo.type === "paid") onUnmarkPaid(undo.tx.id);
    else if (undo.type === "paidMany") undo.txs.forEach((x) => onUnmarkPaid(x.id));
    else if (undo.type === "unpaid") onMarkPaid(undo.tx.id);
    else if (undo.type === "cancelMany") undo.txs.forEach((x) => onRestore(x));
    else onRestore(undo.tx);
    setUndo(null);
  };

  /* Popup struk per transaksi: ketuk baris tanggal → rincian (untuk hari apa,
     dicatat kapan) + tombol Ubah Tanggal Layanan. detailTx menyimpan SNAPSHOT
     objek transaksi, jadi reload realtime tidak menutup picker (fix iOS). */
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [petunjukGeserTutup, setPetunjukGeserTutup] = useState(() => { try { return localStorage.getItem("ganen_hint_geser_tx") === "1"; } catch { return false; } });
  const [confirmLunas, setConfirmLunas] = useState<{ customer: Transaction["customer"]; txs: Transaction[]; total: number; sebagian?: boolean; minggu?: number } | null>(null);
  /** Tanggal (transaksi) yang dicentang untuk Lunas sebagian — satu ketukan melunaskan semua yang dicentang. */
  const [pilihTx, setPilihTx] = useState<Set<string>>(new Set());
  /** Lembar "Lunaskan N minggu": minggu yang dilepas centangnya (awalnya semua tercentang). */
  const [mingguLepas, setMingguLepas] = useState<Set<string>>(new Set());
  useEffect(() => { setMingguLepas(new Set()); }, [confirmLunas]);
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
  /* Pesan SELALU lengkap per item (pemilik 4 Nov: yang disalin harus rincian jelas, bukan ringkasan). Bila lebih panjang dari BATAS_LINK_WA,
     tombol kirim menyalin pesan lalu membuka chat kosong (lihat sendWA) — bukan memotong atau meringkas. */
  const buildWaMsg = (gs: { customer: Transaction["customer"]; txs: Transaction[]; total: number }[], label?: string, tunggakan?: { label: string; total: number }[]) =>
    rakitWaMsg(gs, label, tunggakan);
  const rakitWaMsg = (gs: { customer: Transaction["customer"]; txs: Transaction[]; total: number }[], label: string | undefined, tunggakan?: { label: string; total: number }[]) => {
    /* Blok per TANGGAL LAYANAN, tanpa jam (pemilik 4 Nov: "too much tulisan"): tanggal pendek "Senin, 12 Okt"; Pre-order diberi "· PO",
       jajan langsung di kantin (source bukan preorder) diberi "· Jajan"; beberapa transaksi sejenis di tanggal yang sama digabung satu blok. */
    const txBlocksOf = (g: (typeof gs)[number]) => {
      const BLN3p = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
      const urut = [...g.txs].sort((x, y) => opDate(x).localeCompare(opDate(y)) || (x.source === "preorder" ? 0 : 1) - (y.source === "preorder" ? 0 : 1) || x.createdAt.localeCompare(y.createdAt));
      const blok = new Map<string, { judul: string; baris: string[] }>();
      for (const tx of urut) {
        const op = opDate(tx);
        const jajan = tx.source !== "preorder";
        const kunci = op + "|" + (jajan ? "j" : "p");
        if (!blok.has(kunci)) blok.set(kunci, { judul: `[${namaHari(op)}, ${Number(op.slice(8, 10))} ${BLN3p[Number(op.slice(5, 7)) - 1]}${jajan ? " · Jajan" : " · PO"}]`, baris: [] });
        for (const it of tx.items) blok.get(kunci)!.baris.push(`• ${toTitleCase(it.name.trim())}${it.variant ? ` (${it.variant.trim()})` : ""} ×${it.qty} = ${rupiah(it.price * it.qty)}`);
      }
      return [...blok.values()].map((x) => `${x.judul}\n${x.baris.join("\n")}`).join("\n\n");
    };
    const bankLine = [settings.namaBank, settings.noRekening].filter(Boolean).join(" ");
    const bankSection = bankLine
      ? `\n\n${bankLine}${settings.namaRekening ? `\na.n. ${settings.namaRekening}` : ""}`
      : "";
    /* Berita transfer WAJIB diisi, SINGKAT (batas karakter bank pengirim ±18; pemilik 1 Nov: "wajib, jangan mohon"; kode acak dan "+1" ditolak):
       satu anak = nama depan + kelas + TANGGAL TAGIH (hari pesan dikirim; "Keola 3B 31Okt"); kakak-adik satu pesan = nama depan semuanya + tanggal tagih ("Acelynn Alice 31Okt"). Hanya bila ada rekening. */
    const BLN3 = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    /* Tanggal TAGIH = hari pesan ini dikirim (sama dengan tanggal di tombol "Ditagih"). */
    const tglTagih = (() => { const d = new Date(); return `${d.getDate()}${BLN3[d.getMonth()]}`; })();
    const depan = (nama: string) => toTitleCase(nama).replace(/\s+/g, " ").trim().split(" ")[0].slice(0, 8);
    /* Teks blok ini dari Pengaturan → Tagihan (settings.waTransfer, kata kunci {nama} {kelas} {tanggal}); kosong = tidak dipasang. */
    const isiBerita = isiTemplateTransfer(settings.waTransfer, {
      nama: gs.length > 1 ? gs.map((g) => depan(g.customer.nama)).join(" ") : depan(gs[0].customer.nama),
      kelas: gs.length > 1 ? "" : (gs[0].customer.kelas || gs[0].customer.tingkat || ""),
      tanggal: tglTagih,
    });
    const beritaSection = bankLine && isiBerita ? `\n\n${isiBerita}` : "";
    const akhir = settings.waAkhir.trim() ? `\n\n${settings.waAkhir.trim()}` : "";
    const sections = gs.map((g) =>
      `Nama: ${toTitleCase(g.customer.nama)}\nKelas: ${g.customer.kelas || g.customer.tingkat || "-"}\n\n${txBlocksOf(g)}${gs.length > 1 ? `\nSubtotal: ${rupiah(g.total)}` : ""}`
    ).join("\n\n--------------------\n\n");
    const totalTunggakan = (tunggakan ?? []).reduce((n, x) => n + x.total, 0);
    const total = gs.reduce((s, g) => s + g.total, 0) + totalTunggakan;
    const blokTunggakan = tunggakan && tunggakan.length ? `\n\nBelum dibayar sebelumnya:\n${tunggakan.map((x) => `${x.label} · ${rupiah(x.total)}`).join("\n")}` : "";
    // Baris kosong sebelum Total supaya berjarak dari rincian; *tebal* pakai
    // format WhatsApp (bintang) — rincian panjang jadi mudah menemukan totalnya
    const judulPekan = label ? `Tagihan minggu ${label}\n\n` : "";
    return `${settings.waOpening}\n\n${judulPekan}${sections}${blokTunggakan}\n\n*Total Pembayaran: ${rupiah(total)}*\n\n${settings.waClosing}${bankSection}${beritaSection}${akhir}`;
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
  const sendWA = async () => {
    if (!waDraft) return;
    if (waDraft.text.length > BATAS_LINK_WA) {
      // terlalu panjang untuk tautan: salin pesan LENGKAP, buka chat kosong, Mama menempel
      const ok = await salinTeks(waDraft.text);
      if (!ok) { setToast("Gagal menyalin. Tekan ikon Salin lalu buka WhatsApp."); return; }
      window.open(`https://wa.me/${waDraft.wa}`, "_blank");
    } else {
      window.open(`https://wa.me/${waDraft.wa}?text=${encodeURIComponent(waDraft.text)}`, "_blank");
    }
    onMarkBilled(waDraft.txIds); // penanda "sudah ditagih" — sinkron antar gadget
    setWaDraft(null);
  };

  /** Satu kartu Belum Dibayar (satu anak). ns = awalan kunci supaya anak yang sama di dua pekan tidak berbagi status buka-tutup. */
  const kartuBelum = (g: Grup, ns = "", pool: Grup[] = groups, label?: string) => {
    const key = ns + groupKey(g.customer);
    const expanded = expandedGroups.has(key);
    const terpilih = g.txs.filter((tx) => pilihTx.has(tx.id));
    /* Tagihan gabungan: tanggal anak ini yang ikut SATU pesan WhatsApp (cap waktu ditagih sama), termasuk dari minggu lain —
       dilunaskan sekali ketuk, tanpa pindah-pindah minggu. */
    const capTagih = g.txs.every((tx) => tx.billedAt) ? g.txs.reduce((m, tx) => (tx.billedAt! > m ? tx.billedAt! : m), "") : "";
    const semuaAnak = capTagih ? grupDariTx.get(g.txs[0].id) : undefined;
    const paket = semuaAnak ? semuaAnak.txs.filter((tx) => tx.billedAt === capTagih) : [];
    const lintas = paket.some((tx) => !g.txs.some((y) => y.id === tx.id));
    const jmlMinggu = new Set(paket.map((tx) => mondayOf(opDate(tx)))).size;
    return (
      <div key={key} style={expanded
        ? { background: t.surface, boxShadow: "0 1px 3px rgba(60,48,20,.08)", borderRadius: 16, margin: "6px 0 12px", overflow: "hidden" }
        : { borderBottom: `1px solid ${t.divider}` }}>

        {/* Header grup — klik untuk expand/collapse; saat tertutup bisa DIGESER ke kiri: Tagih + Lunas (geser penuh = Lunas) */}
        {(() => {
        const kepala = (
        <button onClick={() => toggleGroup(key)} style={{ width: "100%", minHeight: 66, padding: expanded ? "14px 16px" : "10px 2px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
          <div className="flex items-center justify-between" style={{ gap: 10 }}>
            <div style={{ minWidth: 0, flex: 1, lineHeight: 1.35 }}>
              <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.customer.nama}</div>
              <div className="flex items-center" style={{ fontSize: 13.5, color: "#756B5D", fontFamily: MONO, gap: 6 }}>
                <span>{g.customer.kelas || g.customer.tingkat}{expanded && g.customer.wa ? ` · ${g.customer.wa}` : ""}</span>
                {g.txs.every((tx) => tx.billedAt) && <span aria-label="Sudah ditagih" title="Sudah ditagih" style={{ display: "grid", placeItems: "center", color: "#4A8FC4" }}><IkonDitagih size={16} strokeWidth={2.4} /></span>}
              </div>
            </div>
            <div className="flex items-center gap-2" style={{ flex: "none" }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{rupiah(g.total)}</span>
            </div>
          </div>
        </button>
        );
        return expanded ? kepala : (
          <GeserBaris bg={t.surface} sudahTagih={capTagih ? `${capTagih.slice(8, 10)}/${capTagih.slice(5, 7)}` : undefined} onTagih={() => shareWA(g, pool, label)} onBatal={() => cancelMany(g.txs)} onLunas={() => (lintas ? setConfirmLunas({ customer: g.customer, txs: paket, total: paket.reduce((n, x) => n + x.total, 0), sebagian: true, minggu: jmlMinggu }) : markPaidMany(g.txs))}>{kepala}</GeserBaris>
        );
        })()}

        {/* Daftar transaksi (hanya kalau expanded) — SELURUH baris
            bisa diketuk untuk lihat detail, bukan cuma tanggalnya;
            biar ketukan tak sengaja tetap langsung kelihatan "ini
            transaksi apa" bukan cuma dead-tap. Tombol aksi pakai
            stopPropagation supaya tidak ikut membuka detail. */}
        {expanded && [...g.txs].sort((a, b) => opDate(a).localeCompare(opDate(b)) || a.createdAt.localeCompare(b.createdAt)).map((tx) => {
          const dipilih = pilihTx.has(tx.id);
          const tglTx = fmtTxOp(tx).split(" · ")[0];
          return (
            <div key={tx.id} style={{ borderTop: `1px solid ${t.divider}` }}>
            {/* Tanpa geser (pemilik 7 Nov): hanya centang Lunas atau ketuk baris untuk membuka struk rincian */}
            <div className="flex items-center" style={{ background: tx.id === highlightedTxId ? "#FFF4BF" : dipilih ? t.successBg : t.surface }}>
              <button onClick={() => togglePilihTx(tx.id)} role="checkbox" aria-checked={dipilih} aria-label={`Pilih ${tglTx}`}
                style={{ flex: "none", width: 54, height: 56, padding: 0, border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center" }}>
                <span style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", background: dipilih ? t.successBg : t.surface, border: `${dipilih ? 1.8 : 2}px solid ${dipilih ? t.success : t.borderStrong}`, color: t.successText }}>
                  {dipilih && <Check size={16} strokeWidth={3} />}
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
              </button>
            </div>
          </div>
          );
        })}

        {/* Tagih dan Lunaskan (Semua / N minggu) PINDAH ke geser baris (usul pemilik 1 Nov: "kalau udah ada swipe, yang ini gausah").
            Footer hanya muncul bila ada tanggal yang dicentang: bayar per hari tetap seperti biasa. */}
        {expanded && terpilih.length > 0 && (
          <div className="flex" style={{ padding: "12px 12px", borderTop: `1px solid ${t.divider}` }}>
            <button onClick={() => setConfirmLunas({ customer: g.customer, txs: terpilih, total: terpilih.reduce((n, x) => n + x.total, 0), sebagian: true })}
              style={{ flex: 1, minWidth: 0, padding: "0 12px", height: 48, borderRadius: 14, border: "none", background: t.primary, color: t.onPrimary, cursor: "pointer", fontWeight: 800, fontSize: 15, whiteSpace: "nowrap" }}>
              Lunaskan {terpilih.length} tanggal
            </button>
          </div>
        )}
      </div>
    );
  };

  const ixTab = tab === "unpaid" ? 0 : tab === "riwayat" ? 1 : 2;
  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 90px" }}>

        {/* Judul & total — ringan, IKUT SCROLL (bukan sticky): fokus halaman
            adalah memproses daftar transaksi, bukan dashboard keuangan */}
        <div className="flex items-center justify-between" style={{ padding: "20px 20px 0", minHeight: 52 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>Transaksi</div>
            {/* Total sesuai tab: Utang (merah-jingga) / Masuk (hijau) / Dibatalkan */}
            <div style={{ fontSize: 14, fontWeight: 500, color: t.text2, marginTop: 1 }}>
              {tab === "unpaid" ? "Utang" : tab === "riwayat" ? (lunasTanpaFilter ? "Masuk bulan ini" : "Masuk (Lunas)") : "Dibatalkan"}{" "}
              <span style={{ fontWeight: 700, color: tab === "unpaid" ? t.warnText : tab === "riwayat" ? t.successText : t.text2 }}>
                {rupiah(tab === "unpaid" ? grandTotal : tab === "riwayat" ? historyMasuk : batalTotal)}
              </span>
            </div>
          </div>
          <div ref={filterRef} style={{ position: "relative", flex: "none" }}>
            <button onClick={() => setFilterSheet((v) => !v)} aria-expanded={filterSheet} aria-label="Filter dan urutan"
              style={{ position: "relative", width: 44, height: 44, borderRadius: "50%", border: "none", background: filterActive ? t.primary : t.surface, color: t.text, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}>
              <SlidersHorizontal size={19} />
              {filterActive && (
                <span style={{ position: "absolute", top: -3, right: -3, width: 9, height: 9, borderRadius: "50%", background: t.error, border: `1.5px solid ${t.bg}` }} />
              )}
            </button>
            {filterSheet && (
              <>
                <style>{`@keyframes ganen-pop{from{opacity:0;transform:translateY(-8px) scale(.94)}to{opacity:1;transform:none}}`}</style>
                <div onClick={() => setFilterSheet(false)} style={{ position: "fixed", inset: 0, zIndex: 44, background: "rgba(47,42,36,.18)" }} />
                {/* Filter ringkas & mengalir: muncul tepat di bawah tombol, langsung berlaku (tanpa tombol Terapkan), ketuk di luar = tutup */}
                <div role="dialog" aria-label="Filter dan urutan" style={{ position: "absolute", top: 52, right: 0, zIndex: 45, width: "min(340px, calc(100vw - 40px))", maxHeight: "70vh", overflowY: "auto", overscrollBehavior: "contain", background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 16, boxShadow: "0 14px 34px rgba(60,48,20,.22)", padding: "6px 14px", transformOrigin: "top right", animation: "ganen-pop .16s ease-out" }}>
                  {/* Tiga baris CHIP (bukan daftar panjang): langsung berlaku, ketuk di luar = tutup */}
                  {([
                    ["Sumber", ([["semua", "Semua"], ["preorder", "Pre-order"], ["penjualan", "Penjualan"]] as const).map(([v, l]) => ({ key: v, label: l, on: sourceFilter === v, pilih: () => setSourceFilter(v) }))],
                    ["Urutan", ([["az", "A–Z"], ["newest", "Terbaru"]] as const).map(([v, l]) => ({ key: v, label: l, on: sortMode === v, pilih: () => setSortMode(v) }))],
                    ["Tanggal", ([["semua", "Semua"], ["hari", "Hari ini"], ["tanggal", "Rentang…"]] as const).map(([v, l]) => ({ key: v, label: l, on: dateFilter === v, pilih: () => setDateFilter(v) }))],
                  ] as const).map(([judul, baris], gi) => (
                    <div key={judul} style={{ borderTop: gi ? `1px solid ${t.divider}` : "none", padding: "10px 0" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: t.text2, marginBottom: 8 }}>{judul}</div>
                      <div className="flex" style={{ gap: 6, flexWrap: "wrap" }}>
                        {baris.map((o) => (
                          <button key={o.key} onClick={o.pilih} role="menuitemradio" aria-checked={o.on}
                            style={{ minHeight: 44, padding: "0 13px", borderRadius: 999, border: `1.5px solid ${o.on ? t.primaryLine : t.border}`, background: o.on ? t.primaryLight : "transparent", cursor: "pointer", fontFamily: "inherit", color: t.text, fontSize: 14.5, fontWeight: o.on ? 800 : 600 }}>
                            {o.label}
                          </button>
                        ))}
                      </div>
                      {judul === "Tanggal" && dateFilter === "tanggal" && (
                        <div style={{ margin: "4px 10px 6px" }}>
                          {([["Dari", pickDate, (v: string) => { setPickDate(v); if (!pickDateEnd || pickDateEnd < v) setPickDateEnd(v); }], ["Sampai", pickDateEnd, (v: string) => { setPickDateEnd(v); if (!pickDate || pickDate > v) setPickDate(v); }]] as const).map(([label, nilai, ubah]) => (
                            <label key={label} className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
                              <span style={{ width: 54, flex: "none", fontSize: 13.5, fontWeight: 700, color: t.text2 }}>{label}</span>
                              <input type="date" value={nilai} onChange={(e) => ubah(e.target.value)}
                                onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* picker native */ } }}
                                aria-label={label}
                                style={{ flex: 1, minWidth: 0, height: 44, fontSize: 15, fontWeight: 700, color: nilai ? t.text : t.textDis, background: t.surface, border: `1.5px solid ${t.primaryLine}`, borderRadius: 10, padding: "0 8px", fontFamily: "inherit", boxSizing: "border-box" }} />
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {tab === "unpaid" && (
                    <div style={{ borderTop: `1px solid ${t.divider}`, padding: "10px 0" }}>
                      <button onClick={() => setOnlyUnbilled((v) => !v)} role="menuitemcheckbox" aria-checked={onlyUnbilled}
                        style={{ minHeight: 44, padding: "0 16px", borderRadius: 999, border: `1.5px solid ${onlyUnbilled ? t.primaryLine : t.border}`, background: onlyUnbilled ? t.primaryLight : "transparent", cursor: "pointer", fontFamily: "inherit", color: t.text, fontSize: 15, fontWeight: onlyUnbilled ? 800 : 600 }}>
                        Belum ditagih saja
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tab menyatu dengan LEMBAR (pemilik 7 Nov: warna latar tab aktif tadi sudah bagus) */}
        <div style={{ padding: "12px 16px 0", position: "sticky", top: 0, background: t.bg, zIndex: 5 }}>
          <PaperTabs
            tabs={[
              { id: "unpaid", label: "Utang" },
              { id: "riwayat", label: "Lunas" },
              { id: "batal", label: "Dibatalkan" },
            ]}
            value={tab}
            onChange={setTab}
            warna={t.surface}
            lembar
          />
        </div>
        <div style={{ margin: "0 16px", background: t.surface, borderRadius: `${ixTab === 0 ? 0 : 22}px ${ixTab === 2 ? 0 : 22}px 22px 22px`, minHeight: "62vh", paddingBottom: 24 }}>
        <div style={{ padding: "10px 20px 0" }}>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2" style={{ flex: 1, minWidth: 0, background: t.bg, borderRadius: 12, padding: "0 12px", height: 44 }}>
              <Search size={18} color={t.text2} style={{ flex: "none" }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama…"
                style={{ border: "none", outline: "none", background: "transparent", fontSize: 16, width: "100%", minWidth: 0, color: t.text, fontFamily: "inherit" }} />
              {q && <X size={18} color={t.text2} style={{ cursor: "pointer", flex: "none" }} onClick={() => setQ("")} />}
            </div>
          </div>
        </div>

        {/* ---- Tab: Belum Dibayar ---- */}
        {tab === "unpaid" && (
          <div style={{ padding: "8px 20px 4px" }}>
            {modeDaftar ? (
              <>
                {/* Filter yang tersembunyi di popover dibuat kelihatan — dulu bikin "pesanan tidak ketemu" */}
                {(dateFilter !== "semua" || onlyUnbilled) && (
                  <div className="flex items-center justify-between" style={{ gap: 10, margin: "2px 0 12px", padding: "8px 8px 8px 14px", background: t.primaryLight, border: `1.5px solid ${t.primaryLine}`, borderRadius: 14 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700, minWidth: 0 }}>
                      Filter aktif: {[
                        dateFilter === "hari" ? "Hari Ini" : dateFilter === "tanggal" ? (pickDate ? (pickDateEnd && pickDateEnd !== pickDate ? `${pickDate.slice(8, 10)}/${pickDate.slice(5, 7)}–${pickDateEnd.slice(8, 10)}/${pickDateEnd.slice(5, 7)}` : `${pickDate.slice(8, 10)}/${pickDate.slice(5, 7)}`) : "Pilih Rentang") : "",
                        onlyUnbilled ? "Belum ditagih saja" : "",
                      ].filter(Boolean).join(" · ")}
                    </span>
                    <button onClick={() => { setDateFilter("semua"); setPickDate(""); setPickDateEnd(""); setOnlyUnbilled(false); }}
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
              <div onTouchStart={(e) => { sentuh.current = (e.target as HTMLElement).closest(".hscroll") ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
                onTouchEnd={(e) => { const m = sentuh.current; sentuh.current = null; if (m) geserPekan(e.changedTouches[0].clientX - m.x, e.changedTouches[0].clientY - m.y); }}>
                <div style={{ padding: "6px 0 4px", marginBottom: 8 }}>
                <div className="flex items-end" style={{ gap: 4 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                <RailGeser pudar style={{ gap: 6, padding: "0" }}>
                  {kelompokBulan.map((k, ki) => (
                    <div key={k.ym} id={`bulan-${k.ym}`} className="flex" style={{ flex: "none", gap: 6 }}>
                    {ki > 0 && <div aria-hidden="true" style={{ flex: "none", width: 1.5, height: 26, alignSelf: "flex-end", marginBottom: 9, background: t.divider }} />}
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: t.text2, margin: "0 0 4px" }}>
                        {k.label}
                      </div>
                      <div className="flex" style={{ gap: 0 }}>
                        {k.pekan.map((x) => {
                          const on = x.senin === pekanBuka && cakupan === "ini";
                          return (
                            <button key={x.senin} id={`chip-${x.senin}`} onClick={() => pilihPekan(x.senin)} aria-pressed={on} aria-label={`Minggu ${labelPekan(x.senin)}`}
                              style={{ flex: "none", position: "relative", minWidth: 0, minHeight: 44, minWidth: 62, padding: "0 7px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 12, background: on ? "#F0E5C9" : "transparent", color: t.text, fontFamily: "inherit", fontSize: 15, fontWeight: on ? 700 : 600, lineHeight: 1.1, whiteSpace: "nowrap", cursor: "pointer" }}>
                              {x.belum > 0 && <span aria-label="Masih ada yang belum ditagih" style={{ position: "absolute", top: 4, right: 3, width: 8, height: 8, borderRadius: "50%", background: t.error }} />}
                              <span>{rentangPendek(x.senin)}</span>
                              {x.berjalan && <span style={{ display: "block", fontSize: 10.5, lineHeight: 1, fontWeight: 600, color: t.text2, marginTop: 1 }}>berjalan</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    </div>
                  ))}
                  {semuaSenin.length > 1 && (
                    <div style={{ flex: "none", marginLeft: -6 }}>
                      <div style={{ fontSize: 11.5, margin: "0 0 4px" }}>&nbsp;</div>
                      <button onClick={() => setCakupan(cakupan === "semua" ? "ini" : "semua")} aria-pressed={cakupan === "semua"} aria-label="Semua minggu yang belum ditagih"
                        style={{ flex: "none", minHeight: 44, minWidth: 62, padding: "0 7px", borderRadius: 12, border: `1.5px solid ${cakupan === "semua" ? "#F0E5C9" : t.border}`, background: cakupan === "semua" ? "#F0E5C9" : "transparent", color: t.text, fontFamily: "inherit", fontSize: 15, fontWeight: cakupan === "semua" ? 700 : 600, whiteSpace: "nowrap", cursor: "pointer" }}>
                        Semua
                      </button>
                    </div>
                  )}
                </RailGeser>
                </div>
                {pekanDibuka && (
                  <>
                    <div aria-hidden="true" style={{ flex: "none", width: 1.5, height: 30, marginBottom: 7, background: t.border }} />
                    <button onClick={() => mulaiTagih(cakupan === "semua" ? pekanList.filter((x) => x.txs.length > 0).map((x) => x.senin).sort() : [pekanDibuka.senin])}
                      aria-label={cakupan === "semua" ? "Tagih semua yang belum ditagih" : `Tagih minggu ${labelPekan(pekanDibuka.senin)}`}
                      style={{ flex: "none", position: "relative", height: 44, padding: "0 13px", margin: "0 12px 0 2px", background: t.successBg, border: "none", borderRadius: 16, color: "#111B21", fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                      <span aria-hidden="true" style={{ position: "absolute", right: -6, bottom: 0, width: 14, height: 16, background: t.successBg, borderBottomLeftRadius: 14 }} />
                      <span aria-hidden="true" style={{ position: "absolute", right: -10, bottom: 0, width: 10, height: 18, background: t.surface, borderBottomLeftRadius: 10 }} />
                      Tagih
                    </button>
                  </>
                )}
                </div>
                <div style={{ height: 1, background: t.divider, margin: "10px 0 0" }} />
                </div>
                {pekanDibuka && ((p) => (
                        <div key={p.senin} style={{ padding: "2px 0 10px" }}>
                          <style>{`@keyframes ganen-geser-kiri{from{opacity:0;transform:translateX(32px)}to{opacity:1;transform:none}}@keyframes ganen-geser-kanan{from{opacity:0;transform:translateX(-32px)}to{opacity:1;transform:none}}`}</style>
                          {groupsPekan.length === 0
                            ? <div style={{ textAlign: "center", padding: "24px 20px", fontSize: 15, color: t.text2, fontWeight: 600 }}>Belum ada tagihan.</div>
                            : (
                                <div style={{ animation: arahGeser ? `ganen-geser-${arahGeser} .24s cubic-bezier(.22,.8,.3,1)` : undefined }}>
                                  {groupsPekan.map((g) => kartuBelum(g, `${p.senin}|`, groupsPekan, cakupan === "semua" ? undefined : labelPekan(p.senin)))}
                                </div>
                              )}
                        </div>
                ))(pekanDibuka)}
              </div>
            )}
          </div>
        )}

        {/* ---- Tab: Lunas & Dibatalkan (render sama, isi beda) ---- */}
        {tab !== "unpaid" && (
          <div style={{ padding: "10px 20px 4px" }}>
            {/* Riwayat lama ditarik saat tab dibuka (sekali per sesi): tampil semua, tanpa batas 30 hari. */}
            {riwayatLamaStatus === "memuat" && (
              <div style={{ fontSize: 13.5, color: t.text2, margin: "2px 2px 12px" }}>Memuat riwayat lama…</div>
            )}
            {riwayatLamaStatus === "gagal" && (
              <button onClick={onMuatRiwayatLama} style={{ width: "100%", minHeight: 48, margin: "2px 0 12px", borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.error, fontFamily: "inherit", fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>
                Riwayat lama belum termuat. Ketuk untuk coba lagi
              </button>
            )}
            {riwayatGroups.length === 0 ? (
              <div style={{ textAlign: "center", padding: "56px 20px" }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, background: t.surfaceSoft, color: t.text2, display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
                  {tab === "batal" ? <Ban size={28} /> : <History size={28} />}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{q ? "Tidak ditemukan" : tab === "batal" ? "Tidak ada yang dibatalkan" : "Belum ada riwayat"}</div>
                <div style={{ fontSize: 14, color: t.text2, marginTop: 6 }}>{q ? "Coba kata kunci lain." : tab === "batal" ? "Transaksi yang dibatalkan akan muncul di sini." : "Transaksi Lunas akan muncul di sini."}</div>
              </div>
            ) : (<>
              {/* Petunjuk geser: sekali, bisa ditutup (geser itu tersembunyi, jadi Mama/Papa perlu diberi tahu) */}
              {!petunjukGeserTutup && (
                <div className="flex items-center justify-between" style={{ background: t.primaryLight, borderRadius: 14, padding: "10px 6px 10px 14px", marginBottom: 12, gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: t.text }}>{riwayatFilter === "batal" ? "Geser ke kanan untuk memulihkan, ke kiri untuk membuang ke Tong Sampah." : "Geser baris ke kanan untuk membatalkan, ke kiri untuk mengembalikan ke Utang."}</span>
                  <button onClick={() => { setPetunjukGeserTutup(true); try { localStorage.setItem("ganen_hint_geser_tx", "1"); } catch { /* abaikan */ } }} aria-label="Tutup petunjuk"
                    style={{ flex: "none", width: 44, height: 44, border: "none", background: "transparent", color: t.text2, cursor: "pointer", display: "grid", placeItems: "center" }}><X size={18} /></button>
                </div>
              )}
              {riwayatGroups.slice(0, q ? Math.max(batasRiwayat, 60) : batasRiwayat).map((g) => {
                const kunciKartu = groupKey(g.customer);
                const buka = bukaLunas[kunciKartu] ?? false;
                const batalTab = riwayatFilter === "batal";
                const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
                const tglSingkat = (tx: Transaction) => { const o = opDate(tx); return `${parseInt(o.slice(8, 10), 10)} ${BLN[parseInt(o.slice(5, 7), 10) - 1] || ""}`; };
                return (
                  <div key={kunciKartu} style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 20, marginBottom: 14, overflow: "hidden" }}>
                    <div role="button" aria-expanded={buka} onClick={() => setBukaLunas((p) => ({ ...p, [kunciKartu]: !buka }))}
                      className="flex items-center justify-between" style={{ padding: "14px 16px", minHeight: 76, gap: 10, cursor: "pointer" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25, color: t.text }}>{g.customer.nama?.trim() ? g.customer.nama : "Cash"}</div>
                        <div style={{ marginTop: 2 }}>
                          {(g.customer.kelas || g.customer.tingkat) && <span style={{ fontFamily: MONO, fontSize: 12.5, color: t.text2 }}>{g.customer.kelas || g.customer.tingkat}{" · "}</span>}
                          <span style={{ fontSize: 12, color: t.textDis === "#B3AF9F" ? "#756B5D" : t.text2 }}>{g.txs.length} pesanan</span>
                        </div>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: batalTab ? t.text2 : t.successText, flex: "none" }}>
                        {rupiah(batalTab ? g.txs.reduce((s2, tx) => s2 + tx.total, 0) : g.totalMasuk)}
                      </span>
                      {buka ? <ChevronUp size={20} color={t.text2} style={{ flex: "none" }} /> : <ChevronDown size={20} color={t.text2} style={{ flex: "none" }} />}
                    </div>
                    {buka && g.txs.map((tx) => {
                      const cancelled = !!tx.cancelledAt;
                      return (
                        <div key={tx.id} style={{ borderTop: `1px solid ${t.divider}` }}>
                          <GeserTx
                            kanan={cancelled ? { label: "Pulihkan", ikon: <RotateCcw size={18} />, bg: t.successBg, warna: t.successText, onAksi: () => pulihkan(tx) } : { label: "Batalkan", ikon: <Ban size={18} />, bg: t.errorBg, warna: t.error, onAksi: () => cancel(tx) }}
                            kiri={cancelled ? { label: "Tong Sampah", ikon: <Trash2 size={18} />, bg: t.errorBg, warna: t.error, onAksi: () => buangKeTong(tx) } : { label: "Belum lunas", ikon: <Undo2 size={18} />, bg: t.primaryLight, warna: t.text, onAksi: () => unpay(tx) }}>
                            <button onClick={() => setDetailTx(tx)} className="flex items-center"
                              style={{ width: "100%", gap: 10, minHeight: 48, padding: "0 16px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: t.text }}>
                              {cancelled
                                ? <Ban size={24} strokeWidth={2} color={t.text2} style={{ flex: "none" }} />
                                : <span style={{ width: 24, height: 24, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", border: `2px solid ${t.success}`, background: t.successBg, color: t.successText }}><Check size={14} strokeWidth={3} /></span>}
                              {tx.source === "preorder" ? <Utensils size={15} color={t.text2} style={{ flex: "none" }} /> : <ShoppingCart size={15} color={t.text2} style={{ flex: "none" }} />}
                              <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: cancelled ? t.text2 : t.text }}>{tglSingkat(tx)}</span>
                              <span style={{ flex: "none", fontFamily: MONO, fontSize: 13.5, textDecoration: cancelled ? "line-through" : "none", color: cancelled ? t.text2 : t.text }}>{rupiah(tx.total)}</span>
                              <ChevronRight size={18} color={t.text2} style={{ flex: "none" }} />
                            </button>
                          </GeserTx>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>)}
            {riwayatGroups.length > (q ? Math.max(batasRiwayat, 60) : batasRiwayat) && (
              <button onClick={() => setBatasRiwayat((n) => n + 30)}
                style={{ width: "100%", height: 52, borderRadius: 14, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer", margin: "2px 0 12px" }}>
                Tampilkan lagi ({riwayatGroups.length - (q ? Math.max(batasRiwayat, 60) : batasRiwayat)})
              </button>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Tagih satu per satu (layar penuh); popup rincian/ubah tanggal (z 85) tetap di atasnya */}
      {tagih && (
        <TagihSatuSatu pekan={tagih.pekan} antrean={tagih.antrean} byId={byId}
          bangunPesan={buildWaMsg} onKirim={onMarkBilled} onUbahTanggal={setDetailTx} onTutup={() => setTagih(null)} />
      )}

      {/* Undo bar */}
      {undo && (
        <div style={{ position: "fixed", left: 20, right: 20, bottom: 24 + NAV_HEIGHT, zIndex: tagih ? 90 : 60, display: "flex", justifyContent: "center" }}>
          <div className="flex items-center gap-3" style={{ maxWidth: 420, width: "100%", background: t.toast, color: t.surface, borderRadius: 14, padding: "10px 10px 10px 16px", boxShadow: "0 6px 22px rgba(60,48,20,.18)" }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, overflowWrap: "anywhere" }}>
              {undo.type === "paidMany" ? `Lunas — ${undo.txs[0].customer.nama} · ${rupiah(undo.txs.reduce((a, x) => a + x.total, 0))}`
                : undo.type === "paid" ? `Ditandai Lunas — ${undo.tx.customer.nama}`
                : undo.type === "unpaid" ? `Dikembalikan ke Belum Dibayar — ${undo.tx.customer.nama}`
                : undo.type === "cancelMany" ? `Dibatalkan — ${undo.txs[0].customer.nama} · ${undo.txs.length} transaksi`
                : `Transaksi dibatalkan — ${undo.tx.customer.nama}`}
            </span>
            <button onClick={doUndo} className="flex items-center gap-1"
              style={{ flex: "none", minHeight: 44, padding: "0 14px", borderRadius: 10, border: "none", background: "transparent", color: t.primary, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              <Undo2 size={16} /> Urungkan
            </button>
          </div>
        </div>
      )}
      {toast && !undo && (
        <div style={{ position: "fixed", left: 20, right: 20, bottom: 24 + NAV_HEIGHT, zIndex: tagih ? 90 : 60, display: "flex", justifyContent: "center" }}>
          <div style={{ maxWidth: 420, width: "100%", background: t.toast, color: t.surface, borderRadius: 14, padding: "14px 18px", fontSize: 14.5, fontWeight: 500, boxShadow: "0 6px 22px rgba(60,48,20,.18)" }}>{toast}</div>
        </div>
      )}

      {/* Popup struk RINCIAN TRANSAKSI — ketuk tanggal di kartu. Menampilkan
          untuk hari apa & dicatat kapan; Ubah Tanggal Layanan pakai input
          overlay besar (pola wajib CLAUDE.md, andal di iOS). */}
      {detailTx && (() => {
        const x = detailTx;
        const batal = !!x.cancelledAt;
        const status = batal ? "Dibatalkan" : x.paid ? "Lunas" : "Belum dibayar";
        const warnaStatus = batal ? t.text2 : x.paid ? t.successText : t.error;
        const HARI3 = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"], BLN3 = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
        const dd = new Date(opDate(x) + "T00:00:00");
        const tglPendek = isNaN(dd.getTime()) ? "" : `${HARI3[dd.getDay()]}, ${dd.getDate()} ${BLN3[dd.getMonth()]}`;
        const ambil = x.waktuAmbil ? x.waktuAmbil.replace(/^istirahat\s*/i, "Ist. ").replace(/^pulang.*/i, "Pulang") : "";
        const baris = [x.customer.kelas || x.customer.tingkat || "", tglPendek, ambil].filter(Boolean).join(" · ");
        const fmt = (iso?: string | null) => { if (!iso) return "—"; const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
        const tutup = () => setDetailTx(null);
        const pre = x.source === "preorder";
        const kolom: [string, string, string?][] = batal
          ? [["Masuk Pesanan", fmt(x.createdAt)], ["Dibatalkan", fmt(x.cancelledAt), t.text2]]
          : x.paid
            ? [["Masuk Pesanan", fmt(x.createdAt)], ["Ditagih", fmt(x.billedAt)], ["Lunas", fmt(x.paidAt || (x.source !== "preorder" ? x.createdAt : null)), t.successText]]
            : [["Masuk Pesanan", fmt(x.createdAt)], ["Ditagih", fmt(x.billedAt)]];
        const tab44: React.CSSProperties = { flex: 1, minHeight: 44, borderRadius: 14, border: "none", background: t.divider, color: t.text, fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", position: "relative" };
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 85, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <style>{`@keyframes ganen-detail-naik{from{transform:translateY(100%)}to{transform:none}}`}</style>
            <div onClick={tutup} style={{ position: "absolute", inset: 0, background: "rgba(42,40,32,.45)" }} />
            <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxWidth: 460, width: "100%", margin: "0 auto", maxHeight: "92vh", overflowY: "auto", padding: "10px 20px calc(28px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 12, animation: "ganen-detail-naik .3s cubic-bezier(.22,.8,.3,1)" }}>
              <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 999, background: t.border, margin: "0 auto" }} />
              <button onClick={tutup} aria-label="Tutup rincian" style={{ position: "absolute", top: 10, right: 16, width: 44, height: 44, border: "none", background: "transparent", color: t.text2, cursor: "pointer", display: "grid", placeItems: "center" }}><X size={22} /></button>

              <div style={{ background: t.bg, borderRadius: 20, overflow: "hidden", marginTop: 18 }}>
                <div style={{ background: t.divider, padding: "14px 20px 10px", textAlign: "center", display: "flex", flexDirection: "column", gap: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: warnaStatus, lineHeight: 1.2 }}>{status}</div>
                  <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: t.text, lineHeight: 1.1 }}>{x.customer.nama}</div>
                  <div style={{ fontFamily: MONO, fontSize: 13.5, color: t.text2, lineHeight: 1.3 }}>{baris}</div>
                </div>
                <div style={{ position: "relative", height: 10, background: t.divider }}>
                  <div style={{ position: "absolute", left: 14, right: 14, top: 9, borderTop: `1.5px dashed ${t.border}` }} />
                  <span style={{ position: "absolute", top: 0, left: -10, width: 20, height: 20, borderRadius: "50%", background: t.surface }} />
                  <span style={{ position: "absolute", top: 0, right: -10, width: 20, height: 20, borderRadius: "50%", background: t.surface }} />
                </div>
                <div style={{ fontFamily: MONO, display: "flex", alignItems: "center", gap: 6, padding: "20px 20px 0", fontSize: 15, color: t.text2 }}>
                  {pre ? <Utensils size={15} /> : <ShoppingCart size={15} />}{x.orderNo || (pre ? "Pre-order" : "Penjualan")}
                </div>
                <div style={{ fontFamily: MONO, padding: "16px 20px 0", display: "flex", flexDirection: "column", gap: 12, fontSize: 15 }}>
                  {x.items.map((it, i) => (
                    <div key={i}>
                      <div className="flex justify-between" style={{ gap: 12 }}>
                        <span>{toTitleCase(it.name)}{it.variant ? ` · ${it.variant}` : ""} ×{it.qty}</span>
                        <span style={{ flex: "none" }}>{(it.price * it.qty).toLocaleString("id-ID")}</span>
                      </div>
                      {it.note && <div style={{ fontSize: 12.5, color: t.text2 }}>{it.note}</div>}
                    </div>
                  ))}
                </div>
                <div className="flex items-baseline justify-between" style={{ padding: "10px 20px 0" }}>
                  <span style={{ fontSize: 14, color: t.text2 }}>Total</span>
                  <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.5px", color: batal ? t.text2 : t.text, textDecoration: batal ? "line-through" : "none" }}>{rupiah(x.total)}</span>
                </div>
                <div style={{ margin: "10px 20px 0", borderTop: `1.5px dashed ${t.border}` }} />
                <div style={{ display: "grid", gridTemplateColumns: kolom.length === 3 ? "1.25fr 1fr 1fr" : "1fr 1fr", gap: 8, padding: "14px 20px" }}>
                  {kolom.map(([label, nilai, warna]) => (
                    <div key={label}>
                      <div style={{ fontSize: 13.5, color: t.text2 }}>{label}</div>
                      <div style={{ fontSize: 13.5, fontWeight: warna ? 600 : 500, color: warna || t.text, marginTop: 2 }}>{nilai}</div>
                    </div>
                  ))}
                </div>
              </div>

              {!x.paid && !batal && (
                <>
                  <button onClick={() => { setDetailTx(null); markPaid(x); }} className="flex items-center justify-center"
                    style={{ height: 56, borderRadius: 18, border: "none", background: t.primary, color: t.onPrimary, fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", gap: 8 }}>
                    <Check size={20} strokeWidth={2.2} /> Tandai Lunas
                  </button>
                  <div className="flex" style={{ gap: 8 }}>
                    <button onClick={() => { setDetailTx(null); shareWA({ customer: x.customer, txs: [x], total: x.total }, [], undefined); }} style={tab44}><MessageCircle size={16} /> Tagih</button>
                    <div style={tab44}>
                      <span className="flex items-center" style={{ gap: 6 }}><Pencil size={16} /> Ubah</span>
                      <input type="date" defaultValue={opDate(x)} max={todayISO()}
                        onChange={(e) => {
                          if (!e.target.value || e.target.value === opDate(x)) return;
                          onChangeDate(x.id, e.target.value);
                          setDetailTx(null);
                          setToast(`Tanggal Layanan diubah ke ${e.target.value.slice(8, 10)}/${e.target.value.slice(5, 7)}`);
                        }}
                        onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* picker native */ } }}
                        aria-label="Ubah Tanggal Layanan"
                        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
                    </div>
                    <button onClick={() => { setDetailTx(null); cancel(x); }} style={{ ...tab44, color: t.error }}><Ban size={16} /> Batalkan</button>
                  </div>
                </>
              )}
              {batal && (
                <div className="flex" style={{ gap: 8 }}>
                  <button onClick={() => { setDetailTx(null); pulihkan(x); }} style={tab44}><RotateCcw size={16} /> Pulihkan</button>
                  <button onClick={() => { setDetailTx(null); setTrashConfirmTx(x); }} style={{ ...tab44, color: t.error }}><Trash2 size={16} /> Buang ke Tong Sampah</button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Lembar LUNASKAN N MINGGU (tagihan gabungan): satu baris per minggu, awalnya tercentang semua; lepas centang = tidak dilunaskan */}
      {confirmLunas && (() => {
        const per = new Map<string, Transaction[]>();
        for (const tx of confirmLunas.txs) { const k = mondayOf(opDate(tx)); (per.get(k) || per.set(k, []).get(k)!).push(tx); }
        const minggu = [...per.entries()].sort((a, b) => b[0].localeCompare(a[0]));
        const dipilih = minggu.filter(([k]) => !mingguLepas.has(k));
        const txDipilih = dipilih.flatMap(([, v]) => v);
        const total = txDipilih.reduce((s, x) => s + x.total, 0);
        const tutup = () => setConfirmLunas(null);
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 85, display: "grid", placeItems: "center", padding: 20 }}>
            <div onClick={tutup} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.4)" }} />
            <div style={{ position: "relative", width: "100%", maxWidth: 360, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 18, padding: "16px 16px 16px", maxHeight: "90vh", overflowY: "auto" }}>
              <div className="flex items-center justify-between" style={{ gap: 10 }}>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-.01em" }}>{confirmLunas.customer.nama}</div>
                <button onClick={tutup} aria-label="Batal lunaskan" style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: "transparent", color: t.text2, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}><X size={20} /></button>
              </div>
              <div style={{ height: 1, background: t.divider, margin: "10px 0 2px" }} />
              {minggu.map(([k, v], i) => {
                const on = !mingguLepas.has(k);
                const sub = v.reduce((s, x) => s + x.total, 0);
                return (
                  <button key={k} role="checkbox" aria-checked={on} onClick={() => setMingguLepas((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; })}
                    className="flex items-center" style={{ width: "100%", gap: 12, padding: "12px 0", minHeight: 56, background: "transparent", border: "none", borderTop: i ? `1px solid ${t.divider}` : "none", textAlign: "left", cursor: "pointer", color: on ? t.text : t.text2 }}>
                    <span style={{ width: 28, height: 28, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: on ? t.successBg : "transparent", border: on ? `1.8px solid ${t.success}` : `2px solid ${t.borderStrong}`, color: t.successText }}>{on && <Check size={16} strokeWidth={3} />}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 16, fontWeight: 600 }}>{labelPekan(k)}</span>
                      <span style={{ display: "block", fontSize: 13, color: t.text2 }}>{v.length} transaksi</span>
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 600, flex: "none" }}>{rupiah(sub)}</span>
                  </button>
                );
              })}
              <button onClick={() => { if (!txDipilih.length) return; txDipilih.forEach(markPaid); setPilihTx((prev) => { const n = new Set(prev); txDipilih.forEach((x) => n.delete(x.id)); return n; }); tutup(); }}
                style={{ width: "100%", height: 52, marginTop: 12, borderRadius: 14, border: "none", background: txDipilih.length ? t.primary : t.divider, color: txDipilih.length ? t.onPrimary : t.text2, fontWeight: 800, fontSize: 16, cursor: "pointer" }}>
                {txDipilih.length ? `${dipilih.length > 1 ? `Lunaskan ${dipilih.length} minggu` : "Lunaskan"} · ${rupiah(total)}` : "Pilih minggu"}
              </button>
              <button onClick={tutup} style={{ width: "100%", height: 48, marginTop: 8, borderRadius: 14, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Batal</button>
            </div>
          </div>
        );
      })()}

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

      {/* WA Pratinjau: lembar bawah bergaya karcis (sama dengan rincian transaksi) */}
      {waDraft && (() => {
        const c = waDraft.base.customer;
        const gabung = waDraft.merged ? waDraft.siblings.reduce((n, x) => n + x.total, waDraft.base.total) : waDraft.base.total;
        const panjangWA = waDraft.text.length > BATAS_LINK_WA;
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <style>{`@keyframes ganen-wa-naik{from{transform:translateY(100%)}to{transform:none}}`}</style>
            <div onClick={() => setWaDraft(null)} style={{ position: "absolute", inset: 0, background: "rgba(42,40,32,.45)" }} />
            <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxWidth: 460, width: "100%", margin: "0 auto", maxHeight: "92vh", overflowY: "auto", padding: "10px 20px calc(28px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 12, animation: "ganen-wa-naik .3s cubic-bezier(.22,.8,.3,1)" }}>
              <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 999, background: t.border, margin: "0 auto" }} />
              <button onClick={() => setWaDraft(null)} aria-label="Tutup" style={{ position: "absolute", top: 10, right: 16, width: 44, height: 44, border: "none", background: "transparent", color: t.text2, cursor: "pointer", display: "grid", placeItems: "center" }}><X size={22} /></button>

              <div style={{ background: t.bg, borderRadius: 20, overflow: "hidden", marginTop: 18 }}>
                <div style={{ background: t.divider, padding: "20px 20px 14px", textAlign: "center", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text2 }}>Tagih via WhatsApp</div>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.5px", color: t.text, lineHeight: 1.2 }}>{waDraft.merged ? [c.nama, ...waDraft.siblings.map((x) => x.customer.nama)].join(" + ") : c.nama}</div>
                  {!waDraft.merged && <div style={{ fontFamily: MONO, fontSize: 13.5, color: t.text2 }}>{c.kelas || c.tingkat || ""}</div>}
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.5px", color: t.text, marginTop: 4 }}>{rupiah(gabung)}</div>
                </div>
                <div style={{ position: "relative", height: 10, background: t.divider }}>
                  <div style={{ position: "absolute", left: 14, right: 14, top: 9, borderTop: `2px dashed ${t.border}` }} />
                  <span style={{ position: "absolute", top: 0, left: -10, width: 20, height: 20, borderRadius: "50%", background: t.surface }} />
                  <span style={{ position: "absolute", top: 0, right: -10, width: 20, height: 20, borderRadius: "50%", background: t.surface }} />
                </div>
                <div className="flex items-center justify-between" style={{ padding: "12px 12px 4px 20px", minHeight: 52 }}>
                  <span style={{ fontSize: 13.5, color: t.text2, fontWeight: 500 }}>Periksa dan ubah pesan sebelum dikirim.</span>
                  <button onClick={async () => { if (await salinTeks(waDraft.text)) setTersalin(true); else setToast("Gagal menyalin. Tekan lama pada teks lalu pilih Salin."); }} aria-label={tersalin ? "Tersalin" : "Salin pesan"}
                    className="flex items-center gap-1" style={{ minHeight: 44, padding: "0 8px", border: "none", background: "transparent", color: tersalin ? t.successText : t.text2, fontWeight: 600, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit" }}>
                    {tersalin ? <Check size={17} /> : <Copy size={17} />} {tersalin ? "Tersalin" : "Salin"}
                  </button>
                </div>
                <div style={{ padding: "0 14px 14px" }}>
                  {waDraft.siblings.length > 0 && (
                    <button onClick={toggleMergeWa} className="flex items-center" role="checkbox" aria-checked={!!waDraft.merged}
                      style={{ gap: 10, width: "100%", minHeight: 44, marginBottom: 6, padding: "0 6px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: t.text }}>
                      <span style={{ width: 24, height: 24, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", border: `2px solid ${waDraft.merged ? t.success : t.borderStrong}`, background: waDraft.merged ? t.successBg : "transparent", color: t.successText }}>
                        {waDraft.merged && <Check size={14} strokeWidth={3} />}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, lineHeight: 1.3 }}>
                        {waDraft.merged ? `Digabung dengan ${waDraft.siblings.map((x) => toTitleCase(x.customer.nama)).join(", ")}` : `Gabung dengan ${waDraft.siblings.map((x) => toTitleCase(x.customer.nama)).join(", ")} (satu nomor WA)`}
                      </span>
                    </button>
                  )}
                  <div style={{ background: t.successBg, borderRadius: "14px 4px 14px 14px", padding: "10px 12px 8px" }}>
                    <textarea value={waDraft.text} onChange={(e) => setWaDraft({ ...waDraft, text: e.target.value })} rows={10} aria-label="Isi pesan"
                      style={{ width: "100%", fontSize: 16, color: t.text, background: "transparent", border: "none", padding: 0, outline: "none", fontFamily: "inherit", resize: "vertical", lineHeight: 1.5, boxSizing: "border-box" }} />
                    <div className="flex items-center justify-end" style={{ gap: 4, fontSize: 11.5, color: t.text2 }}>
                      {new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":")}
                      <span style={{ color: t.ditagih, display: "grid", placeItems: "center" }}><IkonDitagih size={16} strokeWidth={2.4} /></span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-stretch" style={{ gap: 12 }}>
                <button onClick={() => setWaDraft(null)}
                  style={{ flex: "none", width: 96, height: 56, borderRadius: 18, border: "none", background: t.divider, color: t.text, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                  Batal
                </button>
                <button onClick={sendWA} className="flex items-center justify-center gap-2"
                  style={{ flex: 1, minWidth: 0, height: 56, borderRadius: 18, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>
                  {panjangWA ? <Copy size={20} /> : <MessageCircle size={20} />} {panjangWA ? "Salin & buka chat" : "Kirim WA"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
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
    return <span aria-label="Utang" title="Utang" style={{ width: 26, height: 26, borderRadius: "50%", flex: "none", boxSizing: "border-box", border: "1.8px dashed #756B5D" }} />;
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
      <div style={{ fontSize: 17, fontWeight: 700 }}>{q ? "Tidak ada di Utang" : "Semua tagihan lunas"}</div>
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
