import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar, CookingPot, Printer, Box, Check, X, Search, AlertCircle, Settings,
  ChevronDown, ChevronRight, ChevronLeft, Smile, Frown, RotateCcw,
} from "lucide-react";
import { t, STRUK_MONO, STRUK_ZIGZAG, NAV_HEIGHT } from "../../lib/theme";
import { rupiah, serviceDateLabel, nextSchoolDayISO, hhmm, autoClosedNow, wibTimeHHMM, wibTodayISO, reopenActiveNow, wibClock, toTitleCase } from "../../lib/format";
import PaperTabs from "../components/PaperTabs";
import type { Transaction, PickupSchedule } from "../../types";


/* ============================================================
   PRE-ORDER (ADMIN) — tampilan baru "daftar kerja".
   Susunan dari atas: judul + ikon (cari, cetak, pengaturan) →
   tanggal + tombol sesi → tab Semua | Sudah | Belum (komponen
   PaperTabs yang SAMA dengan Menu & Transaksi) → baris kelas yang
   digeser → daftar pesanan. Tab + kelas menempel (sticky) supaya
   status & total selalu terlihat tanpa menggulir.
   Ketuk KOTAK CENTANG = tandai dikemas (dengan Urungkan 5 detik).
   Ketuk BADAN kartu = buka struk rincian pesanan.
   Aturan sebenarnya (buka/tutup/jam tutup/tanggal) ditegakkan di
   SERVER (trigger DB) — lihat supabase/migration_2_session_rules.sql.
   Widget di sini hanya kontrol; kebenaran datanya di server.
   ============================================================ */

const LATE = "#B8372D";

type AdminOrder = {
  id: string;
  nama: string;
  tingkat: string;
  kelas: string;
  ambil: string;
  packed: boolean;
  packedAt: string | null;
  items: Transaction["items"];
  total: number;
};

type MergedGroup = {
  key: string;
  ids: string[];
  nama: string;
  tingkat: string;
  kelas: string;
  ambil: string;
  allPacked: boolean;
  somePacked: boolean;
  /** Jam kemas TERBARU di antara pesanan dalam grup ini — tercatat otomatis
   * oleh sistem, bukan diketik admin, jadi jadi bukti objektif jam berapa
   * sebenarnya dikemas (mis. Papa/Mama bisa saling cek siapa lambat). */
  packedAt: string | null;
  flatItems: Transaction["items"];
  /** Daftar item PER PESANAN — pesanan dobel tampil sebagai 2 daftar
   * terpisah (bukan digabung), supaya ketahuan kalau ortu tak sengaja
   * memesan dua kali. */
  perOrder: Transaction["items"][];
  total: number;
};

function mergeOrders(list: AdminOrder[]): MergedGroup[] {
  const map = new Map<string, MergedGroup & { _orders: AdminOrder[] }>();
  for (const o of list) {
    // Nama dinormalkan (spasi ganda/ujung) supaya pesanan anak yang sama
    // tidak pecah jadi dua kartu hanya karena beda ketikan spasi
    const key = `${o.nama.trim().replace(/\s+/g, " ").toLowerCase()}|${o.kelas.trim().toLowerCase()}`;
    if (!map.has(key)) map.set(key, { key, ids: [], nama: o.nama, tingkat: o.tingkat, kelas: o.kelas, ambil: o.ambil, allPacked: true, somePacked: false, packedAt: null, flatItems: [], perOrder: [], total: 0, _orders: [] });
    const g = map.get(key)!;
    g.ids.push(o.id);
    g.allPacked = g.allPacked && o.packed;
    g.somePacked = g.somePacked || o.packed;
    if (o.packedAt && (!g.packedAt || o.packedAt > g.packedAt)) g.packedAt = o.packedAt;
    g.flatItems = [...g.flatItems, ...o.items];
    g.perOrder.push(o.items);
    g.total += o.total;
    g._orders.push(o);
  }
  return Array.from(map.values());
}

/* ---- Kelompok kelas untuk baris geser ---- */
type KelasGroup = "all" | "kb" | "tk" | "sd12" | "sd36" | "smp" | "sma" | "guru";
const KELAS_TABS: { id: KelasGroup; label: string }[] = [
  { id: "all", label: "Semua kelas" }, { id: "kb", label: "KB" }, { id: "tk", label: "TK" },
  { id: "sd12", label: "SD 1–2" }, { id: "sd36", label: "SD 3–6" }, { id: "smp", label: "SMP" },
  { id: "sma", label: "SMA" }, { id: "guru", label: "Guru/Karyawan" },
];
/** Kelompok dari data TERSIMPAN (tingkat + kode kelas, mis. "1A", "TK B1",
 * "KB AI"). Data lama tanpa tingkat ditebak dari angka kelas. */
function kelasGroupOf(tingkat: string, kelas: string): Exclude<KelasGroup, "all"> | null {
  const tg = (tingkat || "").trim();
  const k = (kelas || "").trim().toUpperCase();
  if (tg === "Guru/Karyawan") return "guru";
  if (tg.startsWith("KB") || k.startsWith("KB")) return "kb";
  if (tg.startsWith("TK") || k.startsWith("TK")) return "tk";
  const n = parseInt(k, 10);
  if (tg === "SMP") return "smp";
  if (tg === "SMA") return "sma";
  if (tg === "SD") return n >= 1 && n <= 2 ? "sd12" : "sd36";
  if (n >= 1 && n <= 2) return "sd12";
  if (n >= 3 && n <= 6) return "sd36";
  if (n >= 7 && n <= 9) return "smp";
  if (n >= 10 && n <= 12) return "sma";
  return null;
}

const dayShort = (iso: string) => serviceDateLabel(iso).replace(/\s\d{4}$/, "");

export default function PreOrderAdmin({
  serviceDate,
  onServiceDateChange,
  open,
  onToggleOpen,
  autoCloseTime,
  onAutoCloseTimeChange,
  reopenUntil,
  onReopenUntilChange,
  presets,
  schedules,
  transactions,
  onTogglePacked,
  onLihatMenu,
  menuBelumDisimpan,
  onOpenSettings,
}: {
  serviceDate: string;
  onServiceDateChange: (d: string) => void;
  open: boolean;
  onToggleOpen: () => void;
  autoCloseTime: string;
  onAutoCloseTimeChange: (t: string) => void;
  reopenUntil: string | null;
  onReopenUntilChange: (iso: string | null) => void;
  presets: string[];
  schedules: PickupSchedule[];
  transactions: Transaction[];
  onTogglePacked: (id: string) => void;
  onLihatMenu: () => void;
  /** true = tanggal sesi belum punya snapshot menu_harian — halaman ortu
   * kosong sampai admin menekan Simpan di tab Menu (kertas PO). */
  menuBelumDisimpan: boolean;
  onOpenSettings: () => void;
}) {
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [kelasFilter, setKelasFilter] = useState<KelasGroup>("all");
  // Tab terbuka lebih dulu = Belum: yang perlu dikerjakan.
  const [packedFilter, setPackedFilter] = useState<"semua" | "sudah" | "belum">("belum");
  const [showLateOnly, setShowLateOnly] = useState(false);
  const [sheet, setSheet] = useState<null | "rekap" | "cetak" | "hari" | "gantiTanggal" | "jamTutup" | "bukaLagi">(null);
  /** Tanggal yang DIPILIH tapi belum dikonfirmasi — pindah sesi PO adalah
   * aksi nyata (ortu langsung bisa pesan di tanggal baru), jadi wajib
   * konfirmasi jelas dulu, tidak langsung commit begitu tanggal diketuk. */
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  /** Struk rincian satu pesanan (ketuk badan kartu). Disimpan sebagai KUNCI
   * grup supaya isinya selalu mengikuti data terbaru. */
  const [detailKey, setDetailKey] = useState<string | null>(null);
  /** Struk rincian per-item Rekap Masak: ketuk nama menu -> siapa saja yang
   * pesan + jumlahnya. Digabung per anak (nama+kelas) supaya pesanan
   * susulan/dobel tidak tampil sebagai baris terpisah. */
  const [menuDetail, setMenuDetail] = useState<{ name: string; buyers: { nama: string; kelas: string; qty: number }[]; total: number } | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showToast = (msg: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, undo });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const [nowTick, setNowTick] = useState(0);
  const gantiTanggalRef = useRef<HTMLInputElement>(null);
  const jamTutupRef = useRef<HTMLInputElement>(null);
  const hariLainRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // "Buka Lagi" sementara masih berlaku? (re-evaluate tiap 30 detik)
  const reopenNow = useMemo(() => {
    void nowTick;
    return reopenActiveNow(reopenUntil);
  }, [reopenUntil, nowTick]);

  // true jika sesi dibuka tapi jam WIB sudah lewat auto_close_time pada hari
  // serviceDate — dan tidak sedang "Buka Lagi"
  const isAutoClosed = useMemo(() => {
    void nowTick; // re-evaluate tiap 30 detik
    return open && autoClosedNow(serviceDate, autoCloseTime) && !reopenNow;
  }, [open, serviceDate, autoCloseTime, nowTick, reopenNow]);

  const reopenFor = (minutes: number) =>
    onReopenUntilChange(new Date(Date.now() + minutes * 60_000).toISOString());

  // Jam WIB sekarang (HH:MM) — di-refresh tiap 30 detik oleh nowTick
  const currentWIBTime = useMemo(() => {
    void nowTick;
    return wibTimeHHMM();
  }, [nowTick]);

  const defaultAmbil = presets[0] || "Istirahat 1";

  /* Tanggal yang DILIHAT di daftar pesanan — terpisah dari sesi live.
     Memilih hari lain tidak pernah menyentuh buka/tutup/tanggal sesi PO. */
  const [viewDate, setViewDate] = useState(serviceDate);
  useEffect(() => { setViewDate(serviceDate); }, [serviceDate]);
  const lihatSesi = viewDate === serviceDate;

  const orders: AdminOrder[] = useMemo(
    () =>
      transactions
        .filter((tx) => tx.source === "preorder" && tx.serviceDate === viewDate && !tx.cancelledAt)
        .map((tx) => ({
          id: tx.id,
          nama: tx.customer.nama,
          tingkat: tx.customer.tingkat || "",
          kelas: tx.customer.kelas,
          ambil: tx.waktuAmbil || defaultAmbil,
          packed: !!tx.packed,
          packedAt: tx.packedAt ?? null,
          items: tx.items,
          total: tx.total,
        })),
    [transactions, viewDate, defaultAmbil]
  );

  const openMenuDetail = (itemKey: string) => {
    const map = new Map<string, { nama: string; kelas: string; qty: number }>();
    orders.forEach((o) => {
      o.items.forEach((it) => {
        const key = it.name + (it.variant ? " " + it.variant : "");
        if (key !== itemKey) return;
        const buyerKey = `${o.nama.trim().toLowerCase()}|${o.kelas.trim().toLowerCase()}`;
        const existing = map.get(buyerKey);
        if (existing) existing.qty += it.qty;
        else map.set(buyerKey, { nama: o.nama, kelas: o.kelas || o.tingkat, qty: it.qty });
      });
    });
    const buyers = Array.from(map.values()).sort((a, b) => a.nama.localeCompare(b.nama, "id"));
    setMenuDetail({ name: itemKey, buyers, total: buyers.reduce((s, b) => s + b.qty, 0) });
  };

  const ql = q.toLowerCase().trim();
  const filterOk = (o: AdminOrder) =>
    `${o.nama} ${o.tingkat} ${o.kelas}`.toLowerCase().includes(ql) &&
    (kelasFilter === "all" || kelasGroupOf(o.tingkat, o.kelas) === kelasFilter);

  // Satu baris = satu ANAK (pesanan dobel digabung). Angka tab mengikuti
  // kelas yang dipilih; "Semua kelas" = total satu hari penuh.
  const groups = useMemo(() => mergeOrders(orders.filter(filterOk)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, ql, kelasFilter]);
  const nBelum = groups.filter((g) => !g.allPacked).length;
  const nSudah = groups.length - nBelum;

  // Jam waktu ambil (HH:MM) untuk grup ini — Guru/Karyawan hanya dicek
  // jika byTingkat diisi eksplisit.
  const jamAmbilFor = (g: MergedGroup): string | null => {
    if (!schedules.length) return null;
    const sched = schedules.find(s => s.name === g.ambil);
    if (!sched) return null;
    const time = g.tingkat === "Guru/Karyawan"
      ? sched.byTingkat?.[g.tingkat]
      : (sched.byTingkat?.[g.tingkat] || sched.defaultTime);
    return time || null;
  };
  // Deteksi telat (BELUM dikemas): berdasarkan TANGGAL LAYANAN yang sedang
  // dilihat. Sesi BESOK (viewDate > hari ini) belum bisa telat. Tanggal yang
  // sudah LEWAT otomatis telat kalau belum dikemas. HARI INI dibandingkan
  // jam WIB sekarang vs jam waktu ambil.
  const isGroupLate = (g: MergedGroup): boolean => {
    if (g.allPacked) return false;
    const time = jamAmbilFor(g);
    if (!time) return false;
    const today = wibTodayISO();
    if (viewDate > today) return false;
    if (viewDate < today) return true;
    return currentWIBTime > time;
  };
  /** Telat tetap telat: SUDAH dikemas tapi jam kemasnya (jam server, tak
   * bisa diubah) lewat dari jam ambil pada tanggal layanannya. Dikemas H-1
   * (disiapkan lebih awal) TIDAK dihitung telat. */
  const isPackedLate = (g: MergedGroup): boolean => {
    if (!g.allPacked || !g.packedAt) return false;
    const time = jamAmbilFor(g);
    if (!time) return false;
    const packedDateWib = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(g.packedAt));
    if (packedDateWib < viewDate) return false;
    if (packedDateWib > viewDate) return true;
    return wibClock(g.packedAt) > time;
  };

  const lateCount = groups.filter(isGroupLate).length;
  const ambilIdx = (g: MergedGroup) => { const i = presets.indexOf(g.ambil); return i < 0 ? 999 : i; };
  const pool = showLateOnly ? groups.filter(isGroupLate) : groups;
  const belumList = pool.filter((g) => !g.allPacked)
    .sort((a, b) => (Number(isGroupLate(b)) - Number(isGroupLate(a))) || (ambilIdx(a) - ambilIdx(b)));
  const sudahList = pool.filter((g) => g.allPacked)
    .sort((a, b) => (b.packedAt || "").localeCompare(a.packedAt || ""));
  const visBelum = packedFilter === "sudah" ? [] : belumList;
  const visSudah = packedFilter === "belum" ? [] : sudahList;

  /** Tandai dikemas / kembalikan. Satu ketukan, dengan Urungkan (tanpa
   * dialog konfirmasi). Hanya pesanan yang benar-benar berubah yang ikut
   * dibalik saat Urungkan. */
  const togglePack = (g: MergedGroup) => {
    const shouldBePacked = !g.allPacked;
    const changed = g.ids.filter((id) => {
      const o = orders.find((x) => x.id === id);
      return !!o && o.packed !== shouldBePacked;
    });
    changed.forEach((id) => onTogglePacked(id));
    showToast(
      shouldBePacked ? `${g.nama} dikemas` : `${g.nama} dikembalikan ke Belum Dikemas`,
      () => changed.forEach((id) => onTogglePacked(id)),
    );
  };

  const dateLabel = useMemo(() => serviceDateLabel(serviceDate), [serviceDate]);

  const pickNextSchoolDay = () => setPendingDate(nextSchoolDayISO());

  /** Pindah tanggal TIDAK PERNAH ikut membuka sesi — buka/tutup murni
   * manual, terpisah dari tanggal. Kalau sesi sedang Dibuka, paksa Tutup
   * dulu saat tanggal pindah; admin wajib ketuk "Buka" sendiri lagi untuk
   * tanggal barunya. Mencegah sesi "kebuka sendiri" tanpa disadari. */
  const confirmPendingDate = () => {
    if (!pendingDate) return;
    if (open) onToggleOpen();
    onServiceDateChange(pendingDate);
    setPendingDate(null);
    setSheet(null);
  };

  /* ---- Saklar sesi: dua sisi Tutup | Buka. Sisi yang AKTIF terisi warna
     (status), mengetuk sisi satunya = mengganti. Tidak ada tombol yang
     menulis aksi sehingga tidak terbaca ganda sebagai status. ---- */
  const reopenActive = open && reopenNow && !!reopenUntil && autoClosedNow(serviceDate, autoCloseTime);
  const isOpenNow = open && !isAutoClosed;
  const goOpen = () => {
    if (isAutoClosed) { setSheet("bukaLagi"); return; }
    onToggleOpen(); showToast("Sesi dibuka", () => onToggleOpen());
  };
  const goClose = () => {
    if (reopenActive) { const prev = reopenUntil; onReopenUntilChange(null); showToast("Sesi ditutup", () => onReopenUntilChange(prev)); return; }
    onToggleOpen(); showToast("Sesi ditutup", () => onToggleOpen());
  };

  /* ---- Hari lain yang pernah ada pesanannya (untuk lembar "Pilih hari") ---- */
  const recentDays = useMemo(() => {
    const m = new Map<string, number>();
    transactions.forEach((tx) => {
      if (tx.source === "preorder" && tx.serviceDate && !tx.cancelledAt) m.set(tx.serviceDate, (m.get(tx.serviceDate) || 0) + 1);
    });
    return Array.from(m.entries()).filter(([d]) => d !== serviceDate).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  }, [transactions, serviceDate]);

  /* ---- Struk rincian satu pesanan ---- */
  const detailG = detailKey ? groups.find((g) => g.key === detailKey) ?? null : null;
  const detailTxs = detailG ? transactions.filter((tx) => detailG.ids.includes(tx.id)) : [];

  /* ---- Geser daftar ke kiri/kanan = pindah satu kelas ---- */
  const [slide, setSlide] = useState<"l" | "r" | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const stepKelas = (dir: 1 | -1) => {
    const i = KELAS_TABS.findIndex((k) => k.id === kelasFilter);
    const n = Math.max(0, Math.min(KELAS_TABS.length - 1, i + dir));
    if (n === i) return;
    setKelasFilter(KELAS_TABS[n].id);
    setSlide(dir === 1 ? "l" : "r");
    setTimeout(() => setSlide(null), 220);
  };

  const hdrGhost: React.CSSProperties = { width: 44, height: 44, border: "none", background: "transparent", color: t.text, cursor: "pointer", display: "grid", placeItems: "center", padding: 0 };

  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
      <style>{`
        @keyframes ganen-in-l{from{transform:translateX(28px);opacity:.25}to{transform:none;opacity:1}}
        @keyframes ganen-in-r{from{transform:translateX(-28px);opacity:.25}to{transform:none;opacity:1}}
        @media (prefers-reduced-motion: reduce){.ganen-slide{animation:none !important}}
      `}</style>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: `0 0 ${NAV_HEIGHT + 24}px` }}>

        {/* Judul + ikon — atau kotak cari */}
        {searchOpen ? (
          <div className="flex items-center gap-2" style={{ padding: "18px 14px 2px 10px" }}>
            <button onClick={() => { setSearchOpen(false); setQ(""); }} aria-label="Tutup pencarian" style={{ ...hdrGhost, color: t.text2 }}>
              <ChevronLeft size={22} />
            </button>
            <div className="flex items-center gap-2" style={{ flex: 1, height: 48, borderBottom: `2px solid ${t.text}` }}>
              <Search size={20} color={t.text2} />
              <input ref={searchRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama murid…"
                style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 18, fontWeight: 600, color: t.text, fontFamily: "inherit", height: 46 }} />
              {q && <button onClick={() => { setQ(""); searchRef.current?.focus(); }} aria-label="Hapus pencarian" style={{ ...hdrGhost, width: 36, height: 36, color: t.text2 }}><X size={18} /></button>}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between" style={{ padding: "20px 20px 2px" }}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.035em", lineHeight: 1.1 }}>Pre-order</div>
            <div className="flex" style={{ marginRight: -10 }}>
              <button onClick={() => setSearchOpen(true)} aria-label="Cari pesanan" style={hdrGhost}><Search size={22} /></button>
              <button onClick={() => setSheet("cetak")} aria-label="Cetak" style={hdrGhost}><Printer size={22} /></button>
              <button onClick={onOpenSettings} aria-label="Pengaturan" style={hdrGhost}><Settings size={22} /></button>
            </div>
          </div>
        )}

        {/* Tanggal + tombol sesi */}
        <div className="flex items-center" style={{ gap: 12, padding: "4px 20px 12px" }}>
          <button onClick={() => setSheet("hari")} className="flex items-center"
            style={{ gap: 6, minHeight: 44, border: "none", background: "none", padding: 0, cursor: "pointer", fontSize: 18, fontWeight: 800, color: lihatSesi ? t.text : t.amberText, whiteSpace: "nowrap", fontFamily: "inherit" }}>
            {dayShort(viewDate)} <ChevronDown size={18} color={t.text2} />
          </button>
          {lihatSesi ? (
            <div role="group" aria-label="Status sesi Pre-order"
              style={{ marginLeft: "auto", flex: "none", display: "flex", height: 46, padding: 3, borderRadius: 12, background: t.surface, border: `1.5px solid ${t.border}` }}>
              {([["Tutup", false, LATE, goClose], ["Buka", true, t.successText, goOpen]] as const).map(([label, val, color, fn]) => {
                const on = isOpenNow === val;
                return (
                  <button key={label} onClick={on ? undefined : fn} aria-pressed={on}
                    style={{ minWidth: 68, padding: "0 14px", border: "none", borderRadius: 9, fontWeight: 800, fontSize: 15, fontFamily: "inherit",
                      background: on ? color : "transparent", color: on ? "#fff" : t.text2, cursor: on ? "default" : "pointer" }}>
                    {label}
                  </button>
                );
              })}
            </div>
          ) : (
            <button onClick={() => setViewDate(serviceDate)}
              style={{ marginLeft: "auto", flex: "none", height: 44, padding: "0 18px", borderRadius: 8, background: t.surface, border: `1.5px solid ${t.text}`, color: t.text, fontWeight: 800, fontSize: 15, whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit" }}>
              Hari ini
            </button>
          )}
        </div>

        {/* Guard: menu tanggal sesi belum disimpan → halaman ortu kosong */}
        {menuBelumDisimpan && lihatSesi && (
          <button onClick={onLihatMenu} className="flex items-center gap-2"
            style={{ width: "calc(100% - 40px)", margin: "0 20px 12px", padding: "11px 14px", background: "#FFF4DA", border: "1.5px solid #F1DFB0", borderRadius: 12, color: t.amberText, fontWeight: 700, fontSize: 14, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
            <AlertCircle size={16} style={{ flex: "none" }} />
            <span style={{ flex: 1 }}>Menu untuk {dateLabel} belum disimpan, ortu belum bisa melihat menu. Ketuk untuk mengatur dan Simpan.</span>
          </button>
        )}

        {/* Tab status + baris kelas — MENEMPEL di atas saat daftar digulir,
            jadi Belum/Sudah/Semua dan jumlahnya selalu terlihat. */}
        <div style={{ position: "sticky", top: 0, zIndex: 20, background: t.bg }}>
          <div style={{ padding: "8px 20px 0" }}>
            <PaperTabs
              tabs={[
                { id: "semua" as const, label: <>Semua <Count n={groups.length} /></> },
                { id: "sudah" as const, label: <>Sudah <Count n={nSudah} /></> },
                { id: "belum" as const, label: <>Belum <Count n={nBelum} /></> },
              ]}
              value={packedFilter}
              onChange={(v) => { setPackedFilter(v); setShowLateOnly(false); }}
            />
          </div>
          <KelasRow value={kelasFilter} onChange={setKelasFilter} />
        </div>

        {/* Kepala daftar: nama status + Telat + Rekap Masak */}
        <div className="flex items-center justify-between" style={{ padding: "8px 20px 0" }}>
          <div className="flex items-center" style={{ gap: 12 }}>
            {lateCount > 0 && packedFilter !== "sudah" && (
              <button onClick={() => setShowLateOnly((v) => !v)} aria-pressed={showLateOnly}
                className="flex items-center"
                style={{ gap: 5, height: 44, padding: "0 4px", whiteSpace: "nowrap", border: "none", background: "none", color: LATE, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit", textDecoration: showLateOnly ? "underline" : "none", textUnderlineOffset: 4 }}>
                <Frown size={15} /> Telat {lateCount}{showLateOnly ? " ✕" : ""}
              </button>
            )}
          </div>
          <button onClick={() => setSheet("rekap")} className="flex items-center"
            style={{ gap: 7, height: 44, padding: "0 4px 0 8px", marginRight: -4, border: "none", background: "none", fontWeight: 700, fontSize: 15, color: t.text, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", marginLeft: "auto" }}>
            <CookingPot size={19} color={t.amberText} /> Rekap Masak <ChevronRight size={17} color={t.text2} style={{ marginLeft: -3 }} />
          </button>
        </div>

        {/* Daftar — geser kiri/kanan = pindah kelas */}
        <div
          className={slide ? "ganen-slide" : undefined}
          style={{ padding: "0 20px", minHeight: 260, animation: slide ? `ganen-in-${slide} .2s ease` : undefined }}
          onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
          onTouchEnd={(e) => {
            const s = touch.current; touch.current = null;
            if (!s) return;
            const dx = e.changedTouches[0].clientX - s.x;
            const dy = e.changedTouches[0].clientY - s.y;
            if (Math.abs(dx) > 70 && Math.abs(dy) < 40) stepKelas(dx < 0 ? 1 : -1);
          }}>
          {visBelum.length === 0 && visSudah.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: t.text2, fontSize: 15.5, fontWeight: 600, lineHeight: 1.5 }}>
              {q ? "Tidak ada nama yang cocok."
                : orders.length === 0 ? "Belum ada pesanan."
                : packedFilter === "belum" && !showLateOnly ? "Semua sudah dikemas. Kerja bagus!"
                : showLateOnly ? "Tidak ada yang telat." : "Tidak ada pesanan di sini."}
            </div>
          )}

          {visBelum.map((g) => (
            <OrderRow key={g.key} g={g} late={isGroupLate(g)} lateTime={jamAmbilFor(g)} defaultAmbil={defaultAmbil}
              onToggle={() => togglePack(g)} onOpen={() => setDetailKey(g.key)} />
          ))}

          {packedFilter === "semua" && visBelum.length > 0 && visSudah.length > 0 && (
            <div style={{ margin: "18px 0 0", fontFamily: STRUK_MONO, fontWeight: 500, fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", color: t.text2 }}>
              Sudah dikemas
            </div>
          )}

          {visSudah.map((g) => (
            <DoneRow key={g.key} g={g} packedLate={isPackedLate(g)}
              onToggle={() => togglePack(g)} onOpen={() => setDetailKey(g.key)} />
          ))}
        </div>
      </div>

      {/* Toast Urungkan */}
      {toast && (
        <div style={{ position: "fixed", left: 14, right: 14, bottom: NAV_HEIGHT + 12, zIndex: 60, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div className="flex items-center" style={{ gap: 12, maxWidth: 432, width: "100%", background: t.text, color: "#FBF7EF", borderRadius: 12, padding: "10px 14px", fontSize: 15, fontWeight: 600, boxShadow: "0 14px 34px rgba(47,42,36,.3)", pointerEvents: "auto" }}>
            <span style={{ flex: 1, minWidth: 0 }}>{toast.msg}</span>
            {toast.undo && (
              <button onClick={() => { toast.undo?.(); setToast(null); }} className="flex items-center"
                style={{ gap: 6, flex: "none", height: 36, padding: "0 4px", border: "none", background: "none", color: t.primary, fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                <RotateCcw size={16} /> Urungkan
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sheets */}
      {sheet === "hari" && (
        <Sheet title="Pilih hari" onClose={() => setSheet(null)}>
          <div style={{ fontFamily: STRUK_MONO, fontWeight: 500, fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", color: t.text2, marginBottom: 4 }}>Lihat pesanan hari lain</div>
          <div style={{ fontSize: 14.5, color: t.text2, marginBottom: 6, lineHeight: 1.5 }}>Hanya melihat. Sesi yang sedang berjalan tidak berubah.</div>
          <DayRow label={`${dayShort(serviceDate)} · sesi hari ini`} right={lihatSesi ? <Check size={18} color={t.successText} /> : null}
            onClick={() => { setViewDate(serviceDate); setSheet(null); }} />
          {recentDays.map(([d, n]) => (
            <DayRow key={d} label={dayShort(d)} right={<span style={{ fontFamily: STRUK_MONO, fontWeight: 500, fontSize: 15, color: t.text2 }}>{n} pesanan</span>}
              onClick={() => { setViewDate(d); setSheet(null); }} />
          ))}
          <div style={{ position: "relative" }}>
            <DayRow label="Pilih tanggal lain" icon={<Calendar size={20} color={t.text2} />} right={<ChevronRight size={18} color={t.text2} />} onClick={() => { /* input overlay menerima ketukan */ }} />
            <input ref={hariLainRef} type="date" aria-label="Pilih tanggal lain" value={viewDate}
              onChange={(e) => { if (e.target.value) { setViewDate(e.target.value); setSheet(null); } }}
              onClick={() => { try { hariLainRef.current?.showPicker?.(); } catch { /* native fallback */ } }}
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
          </div>

          <div style={{ fontFamily: STRUK_MONO, fontWeight: 500, fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", color: t.text2, margin: "22px 0 4px" }}>Sesi Pre-order</div>
          <DayRow label="Ganti tanggal sesi" icon={<Calendar size={20} color={t.amberText} />} right={<ChevronRight size={18} color={t.text2} />} onClick={() => setSheet("gantiTanggal")} />
          <DayRow label="Jam tutup otomatis" right={<span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: STRUK_MONO, fontWeight: 500, fontSize: 15, color: t.text2 }}>{hhmm(autoCloseTime)} <ChevronRight size={18} /></span>} onClick={() => setSheet("jamTutup")} />
        </Sheet>
      )}

      {sheet === "bukaLagi" && (
        <Sheet title="Buka lagi sementara" onClose={() => setSheet(null)}>
          <div style={{ fontSize: 15, color: t.text2, lineHeight: 1.55, marginBottom: 14 }}>
            Ada yang masih mau pesan? Sesi dibuka sementara lalu tutup sendiri. Jam tutup standar {hhmm(autoCloseTime)} tidak berubah.
          </div>
          <div className="flex gap-2">
            <button onClick={() => { reopenFor(30); setSheet(null); showToast("Dibuka lagi 30 menit", () => onReopenUntilChange(null)); }}
              style={{ flex: 1, height: 52, borderRadius: 8, border: `1.5px solid #F0D58F`, background: t.primaryLight, color: t.text, fontWeight: 800, fontSize: 15.5, cursor: "pointer", fontFamily: "inherit" }}>
              +30 menit
            </button>
            <button onClick={() => { reopenFor(60); setSheet(null); showToast("Dibuka lagi 1 jam", () => onReopenUntilChange(null)); }}
              style={{ flex: 1, height: 52, borderRadius: 8, border: `1.5px solid #F0D58F`, background: t.primaryLight, color: t.text, fontWeight: 800, fontSize: 15.5, cursor: "pointer", fontFamily: "inherit" }}>
              +1 jam
            </button>
          </div>
        </Sheet>
      )}

      {sheet === "gantiTanggal" && (
        <Sheet title="Ganti tanggal sesi" onClose={() => { setSheet(null); setPendingDate(null); }}>
          {pendingDate ? (
            /* Konfirmasi wajib: pindah sesi = aksi nyata, ortu bisa langsung
               pesan di tanggal baru. Sesi dipaksa Tertutup supaya tidak
               "kebuka sendiri" tanpa disadari. */
            <div>
              <div style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 4 }}>
                Pindahkan sesi Pre-order ke
              </div>
              <div style={{ fontSize: 21, fontWeight: 800, color: t.amberText, marginBottom: 12 }}>
                {serviceDateLabel(pendingDate)}?
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: t.text2, background: t.surfaceSoft, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: 12, marginBottom: 16 }}>
                Sesi akan tetap <b style={{ color: t.text }}>Tertutup</b>. Buka dan tutup selalu manual, tidak pernah ikut pindah tanggal. Ketuk "Buka" sendiri kalau sudah siap menerima pesanan untuk tanggal ini.
              </div>
              <div className="flex gap-2">
                <button onClick={() => setPendingDate(null)}
                  style={{ flex: 1, height: 52, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                  Batal
                </button>
                <button onClick={confirmPendingDate}
                  style={{ flex: 1, height: 52, borderRadius: 12, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                  Ya, Pindahkan
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 14, color: t.text2, marginBottom: 14 }}>Pilih tanggal untuk sesi Pre-order berikutnya.</div>
              <button onClick={pickNextSchoolDay} className="flex items-center justify-center gap-2"
                style={{ width: "100%", height: 56, borderRadius: 14, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                <Calendar size={18} /> Hari Sekolah Berikutnya
              </button>
              <div style={{ textAlign: "center", fontSize: 12, color: t.textDis, margin: "12px 0" }}>atau</div>
              {/* Pola wajib CLAUDE.md: input date overlay inset:0 MENERIMA ketukan
                  langsung. Memilih tanggal di sini TIDAK langsung commit —
                  lihat langkah konfirmasi di atas. */}
              <div className="flex items-center gap-3"
                style={{ position: "relative", height: 56, borderRadius: 14, border: `1.5px solid ${t.border}`, background: t.surface, padding: "0 16px", cursor: "pointer" }}>
                <Calendar size={18} color={t.amberText} />
                <span style={{ fontWeight: 700, fontSize: 15 }}>Pilih tanggal lain</span>
                <input
                  ref={gantiTanggalRef}
                  type="date"
                  value={serviceDate}
                  onChange={(e) => { if (e.target.value) setPendingDate(e.target.value); }}
                  onClick={() => { try { gantiTanggalRef.current?.showPicker?.(); } catch { /* native fallback */ } }}
                  aria-label="Pilih tanggal lain"
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
                />
              </div>
            </>
          )}
        </Sheet>
      )}

      {sheet === "jamTutup" && (
        <Sheet title="Jam Tutup Otomatis" onClose={() => setSheet(null)}>
          <div style={{ fontSize: 14, color: t.text2, marginBottom: 14 }}>Pre-order otomatis ditutup pada jam ini di hari layanan. Ditegakkan di server, bukan cuma tampilan.</div>
          <div style={{ position: "relative", height: 84, borderRadius: 16, border: `1.5px solid ${t.border}`, background: t.surfaceSoft, cursor: "pointer", display: "grid", placeItems: "center" }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: t.amberText, fontVariantNumeric: "tabular-nums" }}>{hhmm(autoCloseTime)}</span>
            <input
              ref={jamTutupRef}
              type="time"
              value={hhmm(autoCloseTime)}
              onChange={(e) => e.target.value && onAutoCloseTimeChange(e.target.value + ":00")}
              onClick={() => { try { jamTutupRef.current?.showPicker?.(); } catch { /* native fallback */ } }}
              aria-label="Jam Tutup Otomatis"
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
            />
          </div>

          {reopenActive && reopenUntil && (
            <div className="flex items-center justify-between" style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${t.divider}` }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: t.successText }}>
                Dibuka lagi sampai {wibClock(reopenUntil)}
              </span>
              <button onClick={() => { onReopenUntilChange(null); setSheet(null); }}
                style={{ height: 40, padding: "0 14px", borderRadius: 10, border: `1.5px solid ${t.border}`, background: t.surface, color: t.error, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Tutup Sekarang
              </button>
            </div>
          )}
        </Sheet>
      )}

      {sheet === "rekap" && (
        <Sheet title="Rekap Masak" onClose={() => setSheet(null)}>
          <div style={{ fontSize: 14, color: t.text2, marginBottom: 6 }}>{serviceDateLabel(viewDate)} · semua pesanan</div>
          {Object.entries(
            orders.reduce<Record<string, number>>((acc, o) => {
              o.items.forEach((it) => { const k = it.name + (it.variant ? " " + it.variant : ""); acc[k] = (acc[k] || 0) + it.qty; });
              return acc;
            }, {})
          ).sort((a, b) => a[0].localeCompare(b[0], "id")).map(([name, qty]) => (
            <button key={name} onClick={() => openMenuDetail(name)}
              className="flex items-center justify-between" style={{ width: "100%", padding: "13px 0", background: "transparent", border: "none", borderBottom: `1px solid ${t.divider}`, cursor: "pointer", textAlign: "left", fontFamily: "inherit", gap: 8 }}>
              <span style={{ fontSize: 15.5, fontWeight: 600 }}>{toTitleCase(name)}</span>
              <span style={{ fontSize: 20, fontWeight: 500, fontFamily: STRUK_MONO }}>{qty}</span>
            </button>
          ))}
          {orders.length === 0 && <div style={{ textAlign: "center", padding: "24px 0", color: t.text2, fontSize: 14 }}>Belum ada pesanan.</div>}
          <div style={{ fontSize: 13.5, color: t.text2, marginTop: 14 }}>Ketuk nama menu untuk melihat siapa saja yang pesan.</div>
        </Sheet>
      )}

      {sheet === "cetak" && (
        <Sheet title="Cetak" onClose={() => setSheet(null)}>
          {([["Rekap per Kelas", Box], ["Rekap per Menu", CookingPot], ["Label Pesanan", Box]] as const).map(([label, Ic]) => (
            <button key={label} className="flex items-center gap-3" style={{ width: "100%", height: 56, marginBottom: 10, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, cursor: "pointer", padding: "0 16px", color: t.text, fontFamily: "inherit" }}>
              <Ic size={20} color={t.amberText} /><span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: 700 }}>{label}</span><Printer size={18} color={t.textDis} />
            </button>
          ))}
          <div style={{ fontSize: 13, color: t.text2, textAlign: "center", marginTop: 6 }}>Cetak thermal, segera hadir.</div>
        </Sheet>
      )}

      {/* Struk RINCIAN SATU PESANAN — ketuk badan kartu. Isinya rincian +
          jam kemas (jam server). Tombol di bawah = tandai / kembalikan. */}
      {detailG && (
        <StrukPopup onClose={() => setDetailKey(null)} label="Tutup rincian pesanan">
          <div style={{ textAlign: "center", fontSize: 14.5, fontWeight: 800 }}>{detailG.nama.toUpperCase()}</div>
          <div style={{ textAlign: "center", fontSize: 12.5, color: t.text2, marginTop: 2 }}>
            {detailG.kelas || detailG.tingkat} · {detailG.ambil}
          </div>
          {(detailTxs.length ? detailTxs : []).map((tx, ti) => (
            <div key={tx.id}>
              <div style={{ borderTop: `1.5px dashed ${t.border}`, margin: "10px 0" }} />
              {detailTxs.length > 1 && <div style={{ fontSize: 11.5, fontWeight: 800, color: t.amberText, letterSpacing: ".06em", marginBottom: 2 }}>PESANAN {ti + 1}</div>}
              {tx.items.map((it, i) => (
                <div key={i} className="flex justify-between" style={{ fontSize: 13, lineHeight: 1.7, gap: 8 }}>
                  <span>{toTitleCase(it.name)}{it.variant ? ` (${it.variant})` : ""} ×{it.qty}</span>
                  <span style={{ flex: "none" }}>{rupiah(it.price * it.qty)}</span>
                </div>
              ))}
              <div className="flex justify-between" style={{ fontSize: 13.5, fontWeight: 800, marginTop: 6 }}>
                <span>{detailTxs.length > 1 ? "SUBTOTAL" : "TOTAL"}</span><span>{rupiah(tx.total)}</span>
              </div>
            </div>
          ))}
          {detailTxs.length > 1 && (
            <div className="flex justify-between" style={{ fontSize: 14, fontWeight: 800, marginTop: 6 }}>
              <span>TOTAL</span><span>{rupiah(detailTxs.reduce((s, tx) => s + tx.total, 0))}</span>
            </div>
          )}
          <div style={{ borderTop: `1.5px dashed ${t.border}`, margin: "10px 0" }} />
          <div style={{ fontSize: 12.5, lineHeight: 1.85 }}>
            <div className="flex justify-between"><span style={{ color: t.text2 }}>Untuk</span><span style={{ fontWeight: 700 }}>{serviceDateLabel(viewDate)}</span></div>
            {detailTxs[0] && (
              <div className="flex justify-between"><span style={{ color: t.text2 }}>Dicatat</span>
                <span>{detailTxs[0].createdAt.slice(8, 10)}/{detailTxs[0].createdAt.slice(5, 7)} · {new Date(detailTxs[0].createdAt).getHours().toString().padStart(2, "0")}.{new Date(detailTxs[0].createdAt).getMinutes().toString().padStart(2, "0")}</span></div>
            )}
            <div className="flex justify-between" style={{ alignItems: "center" }}><span style={{ color: t.text2 }}>Dikemas</span>
              <span style={{ fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5, color: detailG.allPacked ? (isPackedLate(detailG) ? LATE : t.successText) : isGroupLate(detailG) ? LATE : t.amberText }}>
                {detailG.allPacked && detailG.packedAt
                  ? <>{isPackedLate(detailG) ? <Frown size={14} /> : <Smile size={14} />} {wibClock(detailG.packedAt)}{isPackedLate(detailG) ? " (telat)" : " (tepat waktu)"}</>
                  : isGroupLate(detailG) ? <><Frown size={14} /> Belum, telat</> : "Belum"}
              </span></div>
            {detailTxs[0] && (
              <div className="flex justify-between"><span style={{ color: t.text2 }}>Bayar</span>
                <span style={{ fontWeight: 700, color: detailTxs.every((x) => x.paid) ? t.successText : t.amberText }}>{detailTxs.every((x) => x.paid) ? "Lunas" : "Belum Dibayar"}</span></div>
            )}
          </div>
          <button onClick={() => togglePack(detailG)}
            style={{ marginTop: 14, width: "100%", height: 52, borderRadius: 12, cursor: "pointer", fontFamily: "'Onest', sans-serif", fontWeight: 800, fontSize: 15,
              border: detailG.allPacked ? `1.5px solid ${t.border}` : "none",
              background: detailG.allPacked ? t.surface : t.primary, color: detailG.allPacked ? t.text2 : t.text }}>
            {detailG.allPacked ? "Kembalikan ke Belum Dikemas" : "Tandai Sudah Dikemas"}
          </button>
        </StrukPopup>
      )}

      {/* Popup struk RINCIAN PER-MENU (dari Rekap Masak) — siapa saja yang
          pesan menu ini + jumlahnya. */}
      {menuDetail && (
        <StrukPopup onClose={() => setMenuDetail(null)} label="Tutup rincian menu">
          <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800 }}>{toTitleCase(menuDetail.name)}</div>
          <div style={{ borderTop: `1.5px dashed ${t.border}`, margin: "10px 0" }} />
          {menuDetail.buyers.length === 0 ? (
            <div style={{ textAlign: "center", fontSize: 13, color: t.text2, padding: "8px 0" }}>Belum ada yang pesan.</div>
          ) : menuDetail.buyers.map((b, i) => (
            <div key={i} className="flex justify-between" style={{ fontSize: 13, lineHeight: 1.85, gap: 8 }}>
              <span>{b.nama} {b.kelas}</span>
              <span style={{ flex: "none" }}>({b.qty})</span>
            </div>
          ))}
          <div style={{ borderTop: `1.5px dashed ${t.border}`, margin: "10px 0" }} />
          <div className="flex justify-between" style={{ fontSize: 14, fontWeight: 800 }}>
            <span>TOTAL</span><span>{menuDetail.total}</span>
          </div>
        </StrukPopup>
      )}
    </div>
  );
}

/* ---- bits ---- */

/** Jumlah di dalam tab — huruf struk, ikut warna tab. */
function Count({ n }: { n: number }) {
  return <span style={{ fontFamily: STRUK_MONO, fontWeight: 500, fontSize: 14, letterSpacing: "-.02em" }}>{n}</span>;
}

/** Baris kelas yang digeser. Berhenti TEPAT di tengah satu kelas (scroll-snap
 * mandatory), ketuk = pindah ke tengah, bayangan tepi hanya bila memang
 * masih ada kelas di sisi itu. */
function KelasRow({ value, onChange }: { value: KelasGroup; onChange: (v: KelasGroup) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: true });
  const update = () => {
    const el = ref.current; if (!el) return;
    setEdge({ l: el.scrollLeft > 4, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => { update(); }, []);
  // Saat kelas berganti (ketuk ATAU geser daftar), pusatkan tab aktifnya.
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const b = el.querySelector<HTMLElement>(`[data-id="${value}"]`);
    if (b) el.scrollTo({ left: Math.max(0, b.offsetLeft - (el.clientWidth - b.offsetWidth) / 2), behavior: "smooth" });
  }, [value]);
  const mask = `linear-gradient(90deg, ${edge.l ? "transparent 0, #000 30px" : "#000 0"}, ${edge.r ? "#000 calc(100% - 30px), transparent 100%" : "#000 100%"})`;
  return (
    <div ref={ref} onScroll={update} className="hscroll"
      style={{ position: "relative", display: "flex", gap: 4, overflowX: "auto", scrollSnapType: "x mandatory", scrollPaddingInline: 20, padding: "4px 20px 0", borderBottom: `1.5px solid ${t.border}`,
        WebkitMaskImage: mask, maskImage: mask }}>
      {KELAS_TABS.map((k, i) => {
        const on = k.id === value;
        return (
          <button key={k.id} data-id={k.id} onClick={() => onChange(k.id)}
            style={{ flex: "none", scrollSnapAlign: "center", scrollSnapStop: "always", minHeight: 44, padding: i === 0 ? "11px 14px 10px 0" : "11px 14px 10px",
              fontSize: 15, fontWeight: on ? 800 : 600, color: on ? t.text : t.text2, whiteSpace: "nowrap", cursor: "pointer",
              border: "none", background: "none", borderBottom: `3px solid ${on ? t.primary : "transparent"}`, marginBottom: -1.5, fontFamily: "inherit" }}>
            {k.label}
          </button>
        );
      })}
    </div>
  );
}

/** Kotak centang 30px dengan area ketuk 44px (aman untuk jempol). */
function Check30({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={label} aria-pressed={on}
      style={{ width: 44, height: 44, margin: "-7px -7px -7px -7px", border: "none", background: "none", display: "grid", placeItems: "center", padding: 0, flex: "none", cursor: "pointer" }}>
      <span style={{ width: 30, height: 30, borderRadius: 6, display: "grid", placeItems: "center", color: "#fff",
        border: `2px solid ${on ? t.successText : t.text}`, background: on ? t.successText : "transparent" }}>
        {on && <Check size={18} strokeWidth={3} />}
      </span>
    </button>
  );
}

/** Rincian item dengan titik penuntun dan jumlah di kanan (gaya struk). */
function ItemLines({ items }: { items: Transaction["items"] }) {
  return (
    <>
      {items.map((it, i) => (
        <div key={i} className="flex items-baseline" style={{ gap: 6, fontFamily: STRUK_MONO, fontSize: 15, lineHeight: 1.95, color: "#3A352C" }}>
          <span>{toTitleCase(it.name)}{it.variant ? ` (${it.variant})` : ""}</span>
          <i style={{ flex: 1, borderBottom: "1.5px dotted #BDB6A6", transform: "translateY(-4px)" }} />
          <b style={{ fontWeight: 500, color: t.text }}>×{it.qty}</b>
        </div>
      ))}
    </>
  );
}

function OrderRow({ g, late, lateTime, defaultAmbil, onToggle, onOpen }: {
  g: MergedGroup; late: boolean; lateTime: string | null; defaultAmbil: string; onToggle: () => void; onOpen: () => void;
}) {
  const partial = g.somePacked && !g.allPacked;
  return (
    <div className="flex" style={{ gap: 14, padding: "18px 0", borderBottom: `1px solid ${t.divider}` }}>
      <Check30 on={false} onClick={onToggle} label={`Tandai ${g.nama} sudah dikemas`} />
      <div onClick={onOpen} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
        {late && (
          <div className="flex items-center" style={{ gap: 6, marginBottom: 7, fontFamily: STRUK_MONO, fontWeight: 500, fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase", color: LATE, lineHeight: 1 }}>
            <Frown size={15} strokeWidth={2.2} /> Telat{lateTime ? ` · lewat ${lateTime}` : ""}
          </div>
        )}
        <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.25, letterSpacing: "-.005em" }}>{g.nama}</div>
        <div className="flex items-center" style={{ gap: 8, marginTop: 5, fontSize: 15, color: t.text2, lineHeight: 1.4, flexWrap: "wrap" }}>
          <span style={{ fontFamily: STRUK_MONO, fontWeight: 500, color: t.text }}>{g.kelas || g.tingkat}</span>
          <span style={g.ambil !== defaultAmbil ? { color: t.amberText, fontWeight: 700 } : undefined}>· {g.ambil}</span>
          {g.ids.length > 1 && <span style={{ fontWeight: 700 }}>· {g.ids.length} pesanan</span>}
          {partial && <span style={{ fontWeight: 700, color: t.amberText }}>· sebagian sudah</span>}
        </div>
        <div style={{ marginTop: 13, paddingLeft: 14, borderLeft: `2px solid ${g.perOrder.length > 1 ? t.primary : t.border}` }}>
          {g.perOrder.length <= 1 ? (
            <ItemLines items={g.flatItems} />
          ) : (
            /* Pesanan dobel/tripel: daftar per pesanan DIPISAH, tidak digabung —
               supaya langsung kelihatan kalau ortu tak sengaja pesan 2× */
            g.perOrder.map((items, oi) => (
              <div key={oi} style={{ marginBottom: oi < g.perOrder.length - 1 ? 8 : 0 }}>
                <div style={{ fontFamily: STRUK_MONO, fontWeight: 500, fontSize: 12.5, color: t.amberText, letterSpacing: ".06em", marginTop: oi ? 4 : 0 }}>PESANAN {oi + 1}</div>
                <ItemLines items={items} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DoneRow({ g, packedLate, onToggle, onOpen }: { g: MergedGroup; packedLate: boolean; onToggle: () => void; onOpen: () => void }) {
  return (
    <div className="flex" style={{ gap: 14, padding: "14px 0", borderBottom: `1px solid ${t.divider}` }}>
      <Check30 on onClick={onToggle} label={`Kembalikan ${g.nama} ke belum dikemas`} />
      <div onClick={onOpen} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
        <div className="flex items-baseline justify-between" style={{ gap: 10 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: t.text2, lineHeight: 1.25 }}>{g.nama}</span>
          <span style={{ fontFamily: STRUK_MONO, fontWeight: 500, fontSize: 15, color: t.text2, flex: "none" }}>{g.kelas || g.tingkat}</span>
        </div>
        {/* Wajah senyum = dikemas tepat waktu, cemberut = telat. Jam = jam
            server saat dikemas (tidak bisa diketik/diubah). */}
        <div className="flex items-center" style={{ gap: 6, marginTop: 3, fontFamily: STRUK_MONO, fontWeight: 500, fontSize: 15, color: packedLate ? LATE : t.successText }}>
          {packedLate ? <Frown size={16} /> : <Smile size={16} />}
          Dikemas {g.packedAt ? wibClock(g.packedAt) : ""}
        </div>
      </div>
    </div>
  );
}

function DayRow({ label, right, icon, onClick }: { label: string; right?: React.ReactNode; icon?: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center"
      style={{ gap: 14, width: "100%", minHeight: 56, padding: "0 4px", border: "none", borderBottom: `1px solid ${t.divider}`, background: "none", textAlign: "left", cursor: "pointer", fontSize: 16, fontWeight: 700, fontFamily: "inherit", color: t.text }}>
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {right}
    </button>
  );
}

/** Popup bergaya struk (zigzag + huruf struk), melayang di tengah. */
function StrukPopup({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 85, display: "grid", placeItems: "center", padding: 20 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.4)" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: 330, maxHeight: "86vh", filter: "drop-shadow(0 12px 30px rgba(47,42,36,.32))" }}>
        <div style={{ background: t.surface, clipPath: STRUK_ZIGZAG, padding: "20px 18px 18px", fontFamily: STRUK_MONO, fontWeight: 500, maxHeight: "86vh", overflowY: "auto" }}>
          {children}
        </div>
        <button onClick={onClose} aria-label={label}
          style={{ position: "absolute", top: -12, right: -8, width: 42, height: 42, borderRadius: "50%", border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 4px 12px rgba(47,42,36,.2)" }}>
          <X size={19} />
        </button>
      </div>
    </div>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  // Pelindung ghost-tap di HP: ketukan yang membuka sheet tidak boleh ikut
  // menekan tombol yang muncul di posisi jari (mis. "Hari Sekolah Berikutnya").
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(id);
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end", pointerEvents: ready ? "auto" : "none" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
      <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
        <div style={{ position: "sticky", top: 0, background: t.surface, padding: "16px 20px 12px", borderBottom: `1px solid ${t.divider}`, zIndex: 1 }} className="flex items-center justify-between">
          <div style={{ fontSize: 20, fontWeight: 800 }}>{title}</div>
          <button onClick={onClose} aria-label="Tutup"
            style={{ border: `1.5px solid ${t.border}`, background: t.surface, cursor: "pointer", color: t.text, width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center" }}><X size={19} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}
