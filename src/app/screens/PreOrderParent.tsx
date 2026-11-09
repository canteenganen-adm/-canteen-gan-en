import { useEffect, useMemo, useRef, useState } from "react";
import JamHitung from "../components/JamHitung";
import {
  Plus, Minus, ArrowLeft, Check, Trash2, Copy, AlertCircle, X, Search, HelpCircle, CircleHelp, ChevronLeft, Pencil,
} from "lucide-react";
import { t } from "../../lib/theme";
import { rupiah, orderNo, toTitleCase, wibClock } from "../../lib/format";
import { fetchAppState, fetchMenuHarian } from "../../lib/canteenApi";
import { TINGKAT_LIST, NO_KELAS_TINGKAT, KATEGORI_ORTU_EMOJI, KATEGORI_ORTU_ORDER } from "../../lib/constants";
import type { MenuItem, Variant, Kelas, Transaction } from "../../types";

/* ============================================================
   PRE-ORDER (PARENT) — Canteen Gan En  ·  halaman link orang tua
   Redesain final (perintah "REDESAIN HALAMAN PESAN ORTU"): tanpa landing,
   /pesan langsung Menu; rail kategori kiri; kartu tanpa border;
   keranjang = bar melayang + sheet Pesanan; Konfirmasi ringkas;
   data anak di sheet (savedAnak di HP). Logika submit/stok/keranjang TIDAK berubah.
   Orang tua TIDAK PERNAH memilih tanggal.
   ============================================================ */

const KAT_EMOJI = KATEGORI_ORTU_EMOJI;
const KAT_ORDER = KATEGORI_ORTU_ORDER;
const katOf = (m: MenuItem) => m.kategoriOrtu || "Lainnya";

const DEFAULT_PICKUP_FALLBACK = "Istirahat 1";
const MIN_WA_DIGITS = 10;
const HARI3 = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const HARI_P = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BLN3 = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "Jum, 6 Nov" dari tanggal ISO (tanpa zona waktu: tanggal kalender apa adanya). */
const tglSingkat = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? "" : `${HARI3[d.getDay()]}, ${d.getDate()} ${BLN3[d.getMonth()]}`;
};
/** "Kamis, 5 Nov 2026 · 20:14:32" (WIB) dari timestamp server. */
const stempelWib = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  const tgl = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
  return `${HARI_P[tgl.getUTCDay()]}, ${+p.day} ${BLN3[+p.month - 1]} ${p.year} · ${p.hour}:${p.minute}:${p.second}`;
};
const samarWa = (wa: string) => (wa.length > 8 ? `${wa.slice(0, 4)} •••• ${wa.slice(-4)}` : wa);
const hargaLine = (l: { menu: MenuItem; variant: Variant | null }) => (l.variant ? l.variant.price : l.menu.price ?? 0);

export interface PreOrderReceipt {
  no: string;
  nama: string;
  tingkat: string;
  kelas: string;
  kelasLabel: string;
  wa: string;
  ambil: string;
  serviceDate: string;
  submittedAt: string;
  items: { name: string; variant: string | null; price: number; qty: number; note: string }[];
  total: number;
}

interface CartLine {
  menu: MenuItem;
  variant: Variant | null;
  qty: number;
  note: string;
}
type SavedAnak = { nama: string; tingkat: string; kelas: string; wa: string };

export default function PreOrderParent({
  kantin,
  serviceDate,
  serviceISO,
  autoCloseTime,
  reopenUntil,
  open,
  menus,
  kelasList,
  pickupOptions,
  onSubmit,
  stokMap,
  onStokRefresh,
}: {
  kantin: string;
  /** Label panjang Tanggal Layanan, mis. "Jumat, 6 November 2026". */
  serviceDate: string;
  /** Tanggal Layanan ISO (YYYY-MM-DD) — untuk "Jum, 6 Nov" dan hitung mundur. */
  serviceISO?: string;
  /** Jam tutup otomatis "HH:MM:SS" (app_state). */
  autoCloseTime?: string;
  /** Bila pembukaan sementara aktif, dipakai sebagai jam tutup. */
  reopenUntil?: string | null;
  open: boolean;
  menus: MenuItem[];
  kelasList: Kelas[];
  pickupOptions: string[];
  onSubmit: (r: PreOrderReceipt) => Promise<Transaction>;
  /** Sisa stok per id menu (hanya menu yang diberi stok). undefined = fitur
   * stok belum aktif. Server tetap yang menegakkan; ini untuk tampilan. */
  stokMap?: Record<string, { stok: number; terpakai: number; sisa: number }>;
  onStokRefresh?: () => void;
}) {
  const defaultPickup = pickupOptions[0] || DEFAULT_PICKUP_FALLBACK;
  const [step, setStep] = useState<"masuk" | "menu" | "checkout" | "done">("masuk");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [ambil, setAmbil] = useState(defaultPickup);
  const [popup, setPopup] = useState<{ menu: MenuItem; varId: string; qty: number; note: string } | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [noteLine, setNoteLine] = useState<string | null>(null);
  const [katAktif, setKatAktif] = useState<string | null>(null);
  /** Ketukan kategori memegang sorotan sebentar (halaman bisa mentok sebelum kategori itu sampai di atas). */
  const kunciKat = useRef<{ k: string; sampai: number } | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let rafId = 0;
    const hitung = () => {
      rafId = 0;
      const kunci = kunciKat.current;
      if (kunci && Date.now() < kunci.sampai) return;
      const els = Array.from(document.querySelectorAll<HTMLElement>('[id^="kat-"]'));
      if (!els.length) return;
      const sisaBawah = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      let cur = els[0].id.slice(4);
      if (sisaBawah <= 6 && window.scrollY > 0) cur = els[els.length - 1].id.slice(4);
      else {
        /* aktif = kategori terakhir yang judulnya sudah naik melewati ±sepertiga layar (bukan menunggu mentok di atas) */
        const batas = window.innerHeight * 0.33;
        for (const el of els) { if (el.getBoundingClientRect().top <= batas) cur = el.id.slice(4); }
      }
      setKatAktif((p) => (p === cur ? p : cur));
    };
    const onScroll = () => { if (!rafId) rafId = requestAnimationFrame(hitung); };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll);
    hitung();
    return () => { window.removeEventListener("scroll", onScroll); document.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", onScroll); if (rafId) cancelAnimationFrame(rafId); };
  }, [step]);
  /* Rel kategori ikut bergerak: tombol aktif digulir ke tampilan di dalam rel itu sendiri */
  useEffect(() => {
    const rel = railRef.current;
    if (!rel || !katAktif) return;
    const btn = rel.querySelector<HTMLElement>(`[data-kat="${CSS.escape(katAktif)}"]`);
    if (!btn) return;
    const atas = btn.offsetTop, bawah = atas + btn.offsetHeight;
    if (atas < rel.scrollTop + 8) rel.scrollTo({ top: Math.max(0, atas - 8), behavior: "smooth" });
    else if (bawah > rel.scrollTop + rel.clientHeight - 8) rel.scrollTo({ top: bawah - rel.clientHeight + 8, behavior: "smooth" });
  }, [katAktif]);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [menuQ, setMenuQ] = useState("");
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [receipt, setReceipt] = useState<PreOrderReceipt | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /* "Akun" tanpa akun: data anak yang dipakai DISIMPAN DI HP INI (localStorage).
     Urutan = terakhir dipakai paling depan. Tidak membaca data keluarga lain. */
  const [savedAnak, setSavedAnak] = useState<SavedAnak[]>(() => {
    try { return JSON.parse(localStorage.getItem("ganen_anak") || "[]"); } catch { return []; }
  });
  const [anak, setAnak] = useState<SavedAnak | null>(() => savedAnak[0] ?? null);
  const [sheetAnak, setSheetAnak] = useState<null | "pilih" | "isi">(null);
  const simpanAnak = (a: SavedAnak) => {
    const key = (x: SavedAnak) => `${x.nama.trim().toLowerCase()}|${x.kelas.trim().toLowerCase()}`;
    const next = [a, ...savedAnak.filter((x) => key(x) !== key(a))].slice(0, 4);
    setSavedAnak(next);
    try { localStorage.setItem("ganen_anak", JSON.stringify(next)); } catch { /* penuh/di-blok: abaikan */ }
  };

  const pre = menus.filter((m) => m.channels.preorder);
  const lines = Object.values(cart);
  const total = lines.reduce((s, l) => s + hargaLine(l) * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const closed = !open || sessionClosed;
  const anakKelasNeeded = !!anak && anak.tingkat !== "" && anak.tingkat !== NO_KELAS_TINGKAT;
  const anakLengkap = !!anak && !!anak.nama.trim() && !!anak.tingkat && anak.wa.replace(/\D/g, "").length >= MIN_WA_DIGITS && (!anakKelasNeeded || !!anak.kelas);

  /* Hitung mundur ke jam tutup (WIB), diperbarui tiap 30 detik. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  const tutupMs = useMemo(() => {
    if (reopenUntil && new Date(reopenUntil).getTime() > Date.now()) return new Date(reopenUntil).getTime();
    if (!serviceISO || !autoCloseTime) return null;
    const ms = new Date(`${serviceISO}T${autoCloseTime.length === 5 ? autoCloseTime + ":00" : autoCloseTime}+07:00`).getTime();
    return isNaN(ms) ? null : ms;
  }, [serviceISO, autoCloseTime, reopenUntil]);
  const sisaMs = tutupMs == null ? null : tutupMs - now;
  const jamTutup = reopenUntil && tutupMs === new Date(reopenUntil).getTime() ? wibClock(reopenUntil) : (autoCloseTime || "").slice(0, 5);

  /** Keranjang WAJIB dibersihkan otomatis begitu suatu menu tidak lagi
   * tersedia (admin mematikan Pre-order-nya) — kalau tidak, HP orang tua
   * yang tab-nya lama tidak aktif bisa terus menampilkan item yang sudah
   * dimatikan, lalu tetap terkirim. submit() memeriksa ulang ke server. */
  const [unavailNotice, setUnavailNotice] = useState<string[] | null>(null);
  useEffect(() => {
    const availIds = new Set(pre.map((m) => m.id));
    setCart((c) => {
      const dropped: string[] = [];
      const next: Record<string, CartLine> = {};
      for (const [key, line] of Object.entries(c)) {
        const menu = pre.find((m) => m.id === line.menu.id);
        const variantStillThere = !line.variant || menu?.variants.some((v) => v.id === line.variant!.id);
        if (availIds.has(line.menu.id) && variantStillThere) next[key] = line;
        else dropped.push(line.menu.name + (line.variant ? ` (${line.variant.name})` : ""));
      }
      if (dropped.length) setUnavailNotice(dropped);
      return dropped.length ? next : c;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pre]);
  useEffect(() => {
    if (!unavailNotice) return;
    const id = setTimeout(() => setUnavailNotice(null), 5000);
    return () => clearTimeout(id);
  }, [unavailNotice]);

  const keyOf = (l: CartLine) => l.menu.id + (l.variant ? ":" + l.variant.id : "");
  const qtyOf = (id: string) => Object.values(cart).filter((l) => l.menu.id === id).reduce((s, l) => s + l.qty, 0);
  const add = (menu: MenuItem, variant?: Variant, n = 1, note?: string) => {
    if (closed) return;
    const key = menu.id + (variant ? ":" + variant.id : "");
    const batas = stokMap?.[menu.id]?.sisa;
    const sudah = Object.values(cart).filter((l) => l.menu.id === menu.id).reduce((s, l) => s + l.qty, 0);
    const boleh = batas === undefined ? n : Math.max(0, Math.min(n, batas - sudah));
    if (boleh <= 0) return;
    setCart((c) => ({ ...c, [key]: { menu, variant: variant || null, qty: (c[key]?.qty || 0) + boleh, note: note?.trim() ? note.trim() : c[key]?.note || "" } }));
  };
  const dec = (key: string) => setCart((c) => {
    const n = { ...c };
    if (!n[key]) return n;
    if (n[key].qty <= 1) delete n[key]; else n[key] = { ...n[key], qty: n[key].qty - 1 };
    return n;
  });
  const tap = (m: MenuItem) => (m.variants.length ? setPopup({ menu: m, varId: m.variants[0].id, qty: 1, note: "" }) : add(m));

  const copyReceipt = () => {
    if (!receipt) return;
    const items = receipt.items
      .map((i) => `- ${toTitleCase(i.name)}${i.variant ? " · " + i.variant : ""} ×${i.qty} = ${rupiah(i.price * i.qty)}${i.note ? ` (${i.note})` : ""}`)
      .join("\n");
    const txt = `BUKTI PESANAN ${receipt.no}\nNama: ${receipt.nama}\nTingkat/Kelas: ${receipt.kelasLabel}\nTanggal Layanan: ${receipt.serviceDate}\nWaktu Ambil: ${receipt.ambil}\n\n${items}\n\nTotal: ${rupiah(receipt.total)}\n${receipt.submittedAt}`;
    navigator.clipboard?.writeText(txt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const submit = async () => {
    if (count === 0) { setStep("menu"); return; }
    if (!anak || !anakLengkap) { setSheetAnak(anak ? "isi" : savedAnak.length ? "pilih" : "isi"); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const fresh = await fetchAppState();
      if (!fresh.preorderOpen) {
        setSessionClosed(true);
        setSubmitError("Pre-order sudah ditutup. Silakan hubungi kantin.");
        setSubmitting(false);
        return;
      }
      // Jaring pengaman TERAKHIR: snapshot menu tersimpan untuk tanggal sesi dari server.
      try {
        const snap = await fetchMenuHarian([fresh.serviceDate]);
        const freshMenus = snap[fresh.serviceDate];
        if (freshMenus) {
          const freshAvail = new Map(freshMenus.filter((m) => m.channels.preorder).map((m) => [m.id, m]));
          const stale = lines.filter((l) => {
            const m = freshAvail.get(l.menu.id);
            return !m || (l.variant && !m.variants.some((v) => v.id === l.variant!.id));
          });
          if (stale.length) {
            setCart((c) => {
              const next = { ...c };
              stale.forEach((l) => { delete next[keyOf(l)]; });
              return next;
            });
            setUnavailNotice(stale.map((l) => l.menu.name + (l.variant ? ` (${l.variant.name})` : "")));
            setSubmitError("Sebagian menu di keranjang sudah tidak tersedia — sudah dihapus otomatis. Silakan periksa keranjang lagi.");
            setSubmitting(false);
            return;
          }
        }
      } catch {
        // Snapshot gagal diambil — jangan blokir pemesanan hanya karena pemeriksaan ekstra ini gagal.
      }
      const waDigits = anak.wa.replace(/\D/g, "");
      const kelasLbl = anakKelasNeeded ? `${anak.tingkat} · ${anak.kelas}` : anak.tingkat;
      const r: PreOrderReceipt = {
        no: orderNo(), nama: anak.nama.trim(), tingkat: anak.tingkat, kelas: anakKelasNeeded ? anak.kelas : "",
        kelasLabel: kelasLbl, wa: waDigits, ambil, serviceDate,
        submittedAt: "",
        items: lines.map((l) => ({ name: l.menu.name, variant: l.variant?.name || null, price: hargaLine(l), qty: l.qty, note: l.note || "" })),
        total,
      };
      const confirmed = await onSubmit(r);
      simpanAnak({ nama: anak.nama.trim(), tingkat: anak.tingkat, kelas: anakKelasNeeded ? anak.kelas : "", wa: waDigits });
      /* Jam di bukti = createdAt dari server (bukan jam HP orang tua). */
      setReceipt({
        ...r,
        no: confirmed.orderNo || r.no,
        serviceDate: confirmed.serviceDate ? labelPanjangISO(confirmed.serviceDate) : serviceDate,
        submittedAt: stempelWib(confirmed.createdAt) || stempelWib(new Date().toISOString()),
      });
      setStep("done");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Gagal mengirim pesanan. Coba lagi.");
      onStokRefresh?.();
    } finally {
      setSubmitting(false);
    }
  };

  const pesanLagi = () => { setCart({}); setReceipt(null); setSubmitError(null); setStep("menu"); window.scrollTo?.({ top: 0 }); };

  /* ---------- BERHASIL DIKIRIM ---------- */
  if (step === "done" && receipt) {
    const Coakan = ({ sisi }: { sisi: "kiri" | "kanan" }) => (
      <span style={{ position: "absolute", top: 0, [sisi === "kiri" ? "left" : "right"]: -10, width: 20, height: 20, borderRadius: "50%", background: t.bg }} />
    );
    return (
      <Screen unavailNotice={unavailNotice} footerSpace={0}>
        <div style={{ minHeight: "100dvh", boxSizing: "border-box", padding: "40px 16px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
          <section style={{ background: t.surface, borderRadius: 20, position: "relative" }}>
            <div style={{ background: t.successBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "18px 20px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
              <span style={{ width: 36, height: 36, borderRadius: "50%", background: "#5BAF4E", display: "grid", placeItems: "center", color: t.surface }}><Check size={18} strokeWidth={3} /></span>
              <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: t.successText }}>Pesanan Berhasil Dikirim</h1>
              <span style={{ fontSize: 12.5, color: t.text2 }}>{receipt.no} · {receipt.submittedAt}</span>
            </div>
            <div style={{ position: "relative", height: 20 }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 10, background: t.successBg }} />
              <Coakan sisi="kiri" /><Coakan sisi="kanan" />
              <div style={{ position: "absolute", left: 18, right: 18, top: 9, borderTop: `2px dashed ${t.border}` }} />
            </div>
            <div style={{ padding: "14px 20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              {([["Nama", receipt.nama], ["Tanggal Layanan", receipt.serviceDate], ["Waktu Ambil", receipt.ambil]] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between" style={{ fontSize: 14, gap: 12 }}>
                  <span style={{ color: t.text2 }}>{k}</span><span style={{ fontWeight: 700, textAlign: "right" }}>{v}</span>
                </div>
              ))}
              <div style={{ height: 1, background: t.divider }} />
              {receipt.items.map((it, i) => (
                <div key={i}>
                  <div className="flex justify-between" style={{ fontSize: 14, gap: 12 }}>
                    <span>{toTitleCase(it.name)} <span style={{ color: t.text2 }}>{it.variant ? `· ${it.variant} ` : ""}×{it.qty}</span></span>
                    <span style={{ flex: "none" }}>{rupiah(it.price * it.qty)}</span>
                  </div>
                  {it.note && <div style={{ fontSize: 13, color: t.text2 }}>{it.note}</div>}
                </div>
              ))}
              <div style={{ height: 1, background: t.divider }} />
              <div className="flex items-baseline justify-between">
                <span style={{ fontSize: 14, color: t.text2 }}>Total</span>
                <span style={{ fontSize: 20, fontWeight: 800 }}>{rupiah(receipt.total)}</span>
              </div>
            </div>
          </section>

          <section style={{ padding: "4px 10px 0", display: "flex", flexDirection: "column", gap: 10, fontSize: 13, color: t.text2, lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>
              Mohon menitipkan kotak bekal Ananda <span style={{ fontSize: 12, color: t.textDis }}>(beserta wadah tambahan untuk menu berkuah bila diperlukan)</span>{" "}
              <span style={{ color: t.text }}>di pos satpam sebelum jam masuk sekolah.</span>
            </p>
            <p style={{ margin: 0 }}>Untuk KB, TK, dan SD Kelas 1–2, pesanan akan <span style={{ color: t.text }}>diantarkan ke kelas.</span></p>
            <p style={{ margin: 0 }}>Untuk SD Kelas 3 ke atas hingga SMA, pesanan dapat diambil <span style={{ color: t.text }}>di lemari pengambilan bekal di lobby.</span></p>
            <p style={{ margin: 0 }}>Kantin tidak menyediakan wadah maupun alat makan.</p>
            <p style={{ margin: "12px 0 0", textAlign: "center", fontSize: 14, fontWeight: 600, color: t.text, lineHeight: 1.6 }}>🪷 感恩 Gan En 🙏🏻✨</p>
          </section>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto", paddingTop: 12 }}>
            <button onClick={copyReceipt} className="flex items-center justify-center gap-2"
              style={{ height: 52, borderRadius: 999, border: "none", background: t.divider, color: copied ? t.successText : t.text, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
              {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? "Tersalin" : "Salin Bukti Pesanan"}
            </button>
            <button onClick={pesanLagi}
              style={{ height: 52, borderRadius: 999, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
              Pesan Lagi
            </button>
          </div>
        </div>
      </Screen>
    );
  }

  /* ---------- KONFIRMASI PESANAN ---------- */
  if (step === "checkout") {
    const kartu: React.CSSProperties = { background: t.surface, borderRadius: 20, padding: "16px 18px", marginBottom: 12 };
    const judulKartu: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: t.text, marginBottom: 12 };
    return (
      <Screen unavailNotice={unavailNotice} footerSpace={110}>
        <Top title="Konfirmasi Pesanan" onBack={() => setStep("menu")} />
        <div style={{ padding: "6px 16px 20px" }}>
          <div style={kartu}>
            <div style={{ fontSize: 12, color: t.text2, marginBottom: 2 }}>Pesan untuk</div>
            <div className="flex items-center justify-between" style={{ gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                {anak ? (
                  <>
                    <div style={{ fontSize: 17, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {toTitleCase(anak.nama)}{anak.kelas ? ` · ${anak.kelas}` : anak.tingkat ? ` · ${anak.tingkat}` : ""}
                    </div>
                    <div style={{ fontSize: 12.5, color: t.text2, marginTop: 2 }}>{samarWa(anak.wa)}</div>
                  </>
                ) : (
                  <div style={{ fontSize: 17, fontWeight: 800 }}>Isi data anak</div>
                )}
              </div>
              <PilGanti label={anak ? "Ganti" : "Isi"} onClick={() => setSheetAnak(!anak && !savedAnak.length ? "isi" : "pilih")} />
            </div>
            <div style={{ borderTop: `1px solid ${t.divider}`, margin: "14px 0" }} />
            <div className="flex items-center justify-between" style={{ gap: 10, fontSize: 14 }}>
              <span style={{ color: t.text2 }}>Tanggal Layanan</span>
              <span style={{ fontWeight: 700, textAlign: "right" }}>{serviceDate}</span>
            </div>
          </div>

          <div style={kartu}>
            <div style={judulKartu}>Waktu Ambil</div>
            <div className="flex" style={{ gap: 8, flexWrap: "wrap" }}>
              {pickupOptions.map((p) => {
                const on = p === ambil;
                return (
                  <button key={p} onClick={() => setAmbil(p)}
                    style={{ minHeight: 44, padding: "0 16px", borderRadius: 14, border: "none", fontSize: 14, fontWeight: on ? 700 : 500, cursor: "pointer", fontFamily: "inherit", background: on ? t.primary : t.divider, color: t.onPrimary }}>
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={kartu}>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>Pesanan</span>
              <button onClick={() => setShowCart(true)} aria-label="Ubah pesanan"
                style={{ width: 44, height: 44, margin: "-10px -10px -10px 0", border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center", color: t.warnText }}>
                <Pencil size={18} />
              </button>
            </div>
            {lines.map((l) => (
              <div key={keyOf(l)} style={{ padding: "5px 0" }}>
                <div className="flex items-start justify-between" style={{ gap: 12 }}>
                  <span style={{ fontSize: 14 }}>{toTitleCase(l.menu.name)} <span style={{ color: t.text2 }}>{l.variant ? `· ${l.variant.name} ` : ""}×{l.qty}</span></span>
                  <span style={{ fontSize: 14, fontWeight: 700, flex: "none" }}>{rupiah(hargaLine(l) * l.qty)}</span>
                </div>
                {l.note && <div style={{ fontSize: 13, color: t.text2 }}>{l.note}</div>}
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${t.divider}`, margin: "10px 0" }} />
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 14, color: t.text2 }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{rupiah(total)}</span>
            </div>
          </div>

          {submitError && (
            <div className="flex items-center gap-2" style={{ background: t.errorBg, borderRadius: 14, padding: "12px 14px", color: t.error, fontSize: 14, fontWeight: 500, marginBottom: 12 }}>
              <AlertCircle size={17} style={{ flex: "none" }} /> {submitError}
            </div>
          )}
        </div>

        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, background: t.surface, boxShadow: "0 -1px 3px rgba(60,48,20,.08)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="flex items-center justify-between" style={{ maxWidth: 460, margin: "0 auto", padding: "12px 16px", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: t.text2 }}>{count} item</div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{rupiah(total)}</div>
            </div>
            <button onClick={submit} disabled={submitting}
              style={{ flex: 1, maxWidth: 220, height: 52, padding: "0 28px", borderRadius: 999, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 15, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.6 : 1, fontFamily: "inherit" }}>
              {submitting ? "Mengirim…" : "Kirim Pesanan"}
            </button>
          </div>
        </div>

        {showCart && SheetPesanan()}
        {sheetAnak && <SheetDataAnak mulai={sheetAnak} anak={anak} anakLengkap={anakLengkap} savedAnak={savedAnak} kelasList={kelasList}
        onPilih={(a) => { setAnak(a); setSheetAnak(null); }} onSimpan={(a) => { simpanAnak(a); setAnak(a); setSheetAnak(null); }} onClose={() => setSheetAnak(null)} />}
      </Screen>
    );
  }

  /* ---------- LAMAN MASUK (J1) ---------- */
  if (step === "masuk") {
    const tglTeks = serviceISO ? tglSingkat(serviceISO) : serviceDate;
    return (
      <Screen showHelp={showHelp} onCloseHelp={() => setShowHelp(false)} footerSpace={0}>
        <div style={{ minHeight: "100dvh", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "min(150px, 18vh)", paddingBottom: 130, boxSizing: "border-box", textAlign: "center", WebkitFontSmoothing: "antialiased" }}>
          <div style={{ width: 250, height: 250, borderRadius: 999, background: t.primaryLight, overflow: "hidden", display: "flex", alignItems: "flex-end", justifyContent: "center", filter: closed ? "grayscale(.6)" : undefined, opacity: closed ? 0.7 : 1 }}>
            <img src="/brand/panda.webp" alt="" width={232} height={232} loading="eager" decoding="async" style={{ height: 232, width: "auto", marginBottom: -6 }} />
          </div>
          <div style={{ marginTop: 26, fontSize: 26, fontWeight: 800, letterSpacing: "-.5px", color: t.text }}>Canteen Gan En</div>
          <div style={{ marginTop: 4, fontSize: 15, fontWeight: 400, color: t.text2 }}>Masakan sehangat pelukan Ibu</div>
          <div style={{ marginTop: 26, width: 40, height: 2, background: closed ? t.borderStrong : t.primary }} />
          <div style={{ marginTop: 22, fontSize: 16, color: t.text }}>
            {closed ? <>Mohon maaf, Pre-order <b style={{ fontWeight: 700 }}>sudah ditutup</b></> : <>Pre-order <b style={{ fontWeight: 700 }}>{tglTeks}</b></>}
          </div>
          <div style={{ marginTop: 4, fontSize: 14.5, color: t.text2 }}>
            {closed ? "Sampai jumpa lagi \u{1F64F}\u{1F3FB}" : `sedang dibuka sampai jam ${jamTutup || "08:00"}\u{1F60A}`}
          </div>
        </div>
        {!closed && (
          <button onClick={() => setStep("menu")}
            style={{ position: "fixed", left: 20, right: 20, bottom: "calc(43px + env(safe-area-inset-bottom))", maxWidth: 420, margin: "0 auto", height: 58, borderRadius: 18, border: "none", background: t.primary, color: t.onPrimary, fontSize: 17, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            Mulai Pesan
          </button>
        )}
      </Screen>
    );
  }

  /* ---------- MENU ---------- */
  const q = menuQ.toLowerCase().trim();
  const filteredPre = pre.filter((m) => !q || m.name.toLowerCase().includes(q));
  const byCatMap: Record<string, MenuItem[]> = {};
  filteredPre.forEach((m) => { const k = katOf(m); (byCatMap[k] ||= []).push(m); });
  const railCats = KAT_ORDER.filter((k) => byCatMap[k]);
  const warn = sisaMs != null && sisaMs <= 60 * 60 * 1000;
  const sisaTeks = sisaMs == null || sisaMs <= 0 ? "" : (() => {
    const mnt = Math.floor(sisaMs / 60000);
    return mnt < 60 ? `${mnt}m lagi` : `${Math.floor(mnt / 60)}j ${mnt % 60}m lagi`;
  })();
  const gulirKe = (k: string) => {
    kunciKat.current = { k, sampai: Date.now() + 1100 };
    setKatAktif(k);
    document.getElementById("kat-" + k)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const qtyKat = (k: string) => pre.filter((m) => katOf(m) === k).reduce((s, m) => s + qtyOf(m.id), 0);
  const bulatBtn = (extra?: React.CSSProperties): React.CSSProperties => ({ width: 44, height: 44, borderRadius: "50%", border: "none", background: t.divider, color: t.text, cursor: "pointer", display: "grid", placeItems: "center", flex: "none", ...extra });

  return (
    <Screen unavailNotice={unavailNotice} footerSpace={count > 0 ? 110 : 24} showHelp={showHelp} onCloseHelp={() => setShowHelp(false)}>
      <style>{`.railscroll::-webkit-scrollbar{display:none}`}</style>

      <div style={{ padding: "24px 20px 14px" }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.3px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🪷 {kantin} 🙏🏻✨</div>
        <div className="flex items-center" style={{ gap: 6, marginTop: 6, fontSize: 13.5, color: t.text2, whiteSpace: "nowrap", overflow: "hidden" }}>
          {serviceISO && <JamHitung beku={closed} frac={sisaMs == null ? 1 : Math.max(0, Math.min(1, sisaMs / 86400000))} warn={warn} />}
          <span style={{ fontWeight: 700, color: t.text }}>{serviceISO ? tglSingkat(serviceISO) : serviceDate}</span>
          {closed ? <span style={{ color: t.error, fontWeight: 700 }}>· ditutup</span> : (
            <>
              {jamTutup && <span>· tutup {jamTutup}</span>}
              {sisaTeks && <span style={{ fontWeight: 700, color: warn ? t.warnText : t.text }}>· {sisaTeks}</span>}
            </>
          )}
        </div>
      </div>

      {closed && (
        <div style={{ margin: "0 16px 10px", background: t.surface, borderRadius: 16, padding: "16px 18px", color: t.text2, fontSize: 14.5 }}>
          Maaf, periode Pre-order untuk tanggal ini sudah ditutup.
        </div>
      )}

      <div className="flex items-center justify-between" style={{ margin: "0 16px 10px", background: t.surface, borderRadius: 16, padding: "12px 16px", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: t.text2 }}>Pesan untuk</div>
          <div style={{ fontSize: 16, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {anak ? `${toTitleCase(anak.nama)}${anak.kelas ? ` · ${anak.kelas}` : anak.tingkat ? ` · ${anak.tingkat}` : ""}` : "Isi nama"}
          </div>
        </div>
        <PilGanti label={anak ? "Ganti" : "Isi"} onClick={() => setSheetAnak(!anak && !savedAnak.length ? "isi" : "pilih")} />
      </div>

      <label className="flex items-center" style={{ gap: 10, margin: "0 16px 14px", background: t.surface, borderRadius: 14, padding: "0 14px", height: 44 }}>
        <Search size={18} color={t.text2} />
        <input value={menuQ} onChange={(e) => setMenuQ(e.target.value)} placeholder="Cari menu…"
          style={{ border: "none", outline: "none", background: "transparent", fontSize: 16, flex: 1, minWidth: 0, color: t.text, fontFamily: "inherit" }} />
        {menuQ && <X size={18} color={t.text2} style={{ cursor: "pointer" }} onClick={() => setMenuQ("")} />}
      </label>

      <div className="flex" style={{ alignItems: "flex-start", background: t.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <div ref={railRef} className="railscroll" style={{ position: "sticky", top: 0, flex: "none", width: 104, background: t.divider, borderTopLeftRadius: 20, maxHeight: "100vh", overflowY: "auto", scrollbarWidth: "none", paddingBottom: 24 }}>
          {railCats.map((k) => {
            const n = qtyKat(k);
            const on = (katAktif ?? railCats[0]) === k;
            return (
              <button key={k} data-kat={k} onClick={() => gulirKe(k)}
                style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", border: "none", background: on ? t.surface : "transparent", borderTopLeftRadius: on ? 20 : 0, cursor: "pointer", fontFamily: "inherit", padding: "0 14px", minHeight: 56, color: on ? t.text : t.text2, fontSize: 13, fontWeight: on ? 800 : 500, lineHeight: 1.25 }}>
                <span>{k}</span>
                {n > 0 && <span style={{ flex: "none", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: t.primary, color: t.onPrimary, fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center" }}>{n}</span>}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, minWidth: 0, minHeight: "70vh", padding: "16px 16px 120px" }}>
          {filteredPre.length === 0 && (
            <div style={{ textAlign: "center", color: t.text2, fontSize: 14.5, padding: "36px 0" }}>{q ? "Tidak ada menu yang cocok." : "Belum ada menu untuk tanggal ini."}</div>
          )}
          {railCats.map((k, ki) => (
            <div key={k} id={"kat-" + k} style={{ scrollMarginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text2, margin: ki ? "14px 0 6px" : "0 0 6px" }}>{k}</div>
              {byCatMap[k].map((m, mi) => {
                const inCart = qtyOf(m.id);
                const sisa = stokMap?.[m.id]?.sisa;
                const habis = sisa !== undefined && sisa <= 0;
                const penuh = sisa !== undefined && !habis && inCart >= sisa;
                const nonaktif = closed || penuh;
                const adaVarian = m.variants.length > 0;
                const hrg = adaVarian
                  ? (() => { const ps = m.variants.map((v) => v.price); const lo = Math.min(...ps), hi = Math.max(...ps); return lo === hi ? rupiah(lo) : `${rupiah(lo)} – ${hi.toLocaleString("id-ID")}`; })()
                  : rupiah(m.price);
                const ket = adaVarian ? m.variants.map((v) => v.name).join(" · ") : "";
                return (
                  <div key={m.id} className="flex items-center justify-between" style={{ gap: 10, padding: "12px 0", borderTop: mi ? `1px solid ${t.divider}` : "none" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3, color: habis ? t.textDis : t.text }}>{toTitleCase(m.name)}</div>
                      {(ket || (sisa !== undefined && !habis)) && (
                        <div style={{ fontSize: 13, fontWeight: 500, color: t.text2, marginTop: 2 }}>
                          {ket}{ket && sisa !== undefined ? " · " : ""}
                          {sisa !== undefined ? <span style={{ color: sisa <= 5 ? t.warnText : t.text2, fontWeight: sisa <= 5 ? 700 : 500 }}>Sisa {sisa}</span> : null}
                        </div>
                      )}
                      {habis
                        ? <div style={{ fontSize: 13, fontWeight: 700, color: t.error, marginTop: 3 }}>Habis</div>
                        : <div style={{ fontSize: 13.5, fontWeight: 500, marginTop: 2, color: t.text2 }}>{hrg}</div>}
                    </div>
                    {habis ? null : inCart > 0 && !adaVarian ? (
                      <div className="flex items-center" style={{ gap: 4, flex: "none" }}>
                        <button onClick={() => dec(m.id)} aria-label="Kurangi" style={{ ...kecil, background: t.divider }}><Minus size={17} /></button>
                        <span style={{ minWidth: 22, textAlign: "center", fontWeight: 800, fontSize: 16 }}>{inCart}</span>
                        <button onClick={() => add(m)} disabled={nonaktif} aria-label="Tambah" style={{ ...kecil, background: nonaktif ? t.divider : t.primary, color: nonaktif ? t.textDis : t.onPrimary }}><Plus size={18} /></button>
                      </div>
                    ) : (
                      <button onClick={() => tap(m)} disabled={nonaktif} aria-label={`Tambah ${m.name}`}
                        style={{ position: "relative", flex: "none", width: 44, height: 44, border: "none", background: "transparent", cursor: nonaktif ? "default" : "pointer", padding: 0, display: "grid", placeItems: "center" }}>
                        <span style={{ ...kecil, width: 40, height: 40, background: nonaktif ? t.divider : t.primary, color: nonaktif ? t.textDis : t.onPrimary }}><Plus size={20} /></span>
                        {adaVarian && inCart > 0 && (
                          <span style={{ position: "absolute", top: 0, right: 0, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: t.text, color: "#fff", fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center" }}>{inCart}</span>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {popup && SheetUkuran()}
      {count > 0 && !popup && !showCart && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, padding: "0 16px calc(14px + env(safe-area-inset-bottom, 0px))", pointerEvents: "none" }}>
          <div className="flex items-center justify-between" style={{ maxWidth: 428, margin: "0 auto", background: "rgba(221,212,192,.86)", WebkitBackdropFilter: "blur(14px)", backdropFilter: "blur(14px)", borderRadius: 999, padding: "8px 8px 8px 22px", pointerEvents: "auto", boxShadow: "0 6px 20px rgba(60,48,20,.14)" }}>
            <div>
              <div style={{ fontSize: 12.5, color: t.text2 }}>{count} item</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: t.text }}>{rupiah(total)}</div>
            </div>
            <button onClick={() => setShowCart(true)}
              style={{ height: 48, padding: "0 22px", borderRadius: 999, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
              Lihat Pesanan
            </button>
          </div>
        </div>
      )}

      {showCart && SheetPesanan()}
      {sheetAnak && <SheetDataAnak mulai={sheetAnak} anak={anak} anakLengkap={anakLengkap} savedAnak={savedAnak} kelasList={kelasList}
        onPilih={(a) => { setAnak(a); setSheetAnak(null); }} onSimpan={(a) => { simpanAnak(a); setAnak(a); setSheetAnak(null); }} onClose={() => setSheetAnak(null)} />}
    </Screen>
  );

  /* ================= sheet: Pilih Ukuran ================= */
  function SheetUkuran() {
    const p = popup!;
    const v = p.menu.variants.find((x) => x.id === p.varId) || p.menu.variants[0];
    const sisa = stokMap?.[p.menu.id]?.sisa;
    const sudah = qtyOf(p.menu.id);
    const maks = sisa === undefined ? 99 : Math.max(0, sisa - sudah);
    const qty = Math.min(p.qty, Math.max(1, maks));
    return (
      <Sheet onClose={() => setPopup(null)}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 19, fontWeight: 800, minWidth: 0 }}>{toTitleCase(p.menu.name)}</div>
          <button onClick={() => setPopup(null)} aria-label="Tutup" style={{ ...bulatBtn(), width: 40, height: 40 }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.text2, marginBottom: 8 }}>Ukuran</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 16 }}>
          {p.menu.variants.map((x) => {
            const on = x.id === v.id;
            return (
              <button key={x.id} onClick={() => setPopup({ ...p, varId: x.id })}
                style={{ minHeight: 64, borderRadius: 14, border: "none", background: on ? t.primary : t.divider, color: t.onPrimary, cursor: "pointer", fontFamily: "inherit", padding: "6px 4px" }}>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{x.name}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{rupiah(x.price)}</div>
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.text2, marginBottom: 8 }}>Catatan</div>
        <input value={p.note} onChange={(e) => setPopup({ ...p, note: e.target.value })} placeholder="cth. tidak pedas"
          style={{ width: "100%", height: 48, borderRadius: 12, border: "none", background: t.divider, padding: "0 14px", fontSize: 16, color: t.text, outline: "none", fontFamily: "inherit", marginBottom: 18 }} />
        <div className="flex items-center" style={{ gap: 12 }}>
          <div className="flex items-center" style={{ gap: 4, flex: "none" }}>
            <button onClick={() => setPopup({ ...p, qty: Math.max(1, qty - 1) })} aria-label="Kurangi" style={{ ...kecil, width: 44, height: 44, background: t.divider }}><Minus size={18} /></button>
            <span style={{ minWidth: 28, textAlign: "center", fontWeight: 800, fontSize: 17 }}>{qty}</span>
            <button onClick={() => setPopup({ ...p, qty: Math.min(Math.max(1, maks), qty + 1) })} aria-label="Tambah" style={{ ...kecil, width: 44, height: 44, background: t.primary }}><Plus size={18} /></button>
          </div>
          <button disabled={maks <= 0} onClick={() => { add(p.menu, v, qty, p.note); setPopup(null); }}
            style={{ flex: 1, height: 52, borderRadius: 14, border: "none", background: maks <= 0 ? t.divider : t.primary, color: maks <= 0 ? t.textDis : t.onPrimary, fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>
            Tambah · {rupiah(v.price * qty)}
          </button>
        </div>
      </Sheet>
    );
  }

  /* ================= sheet: Pesanan ================= */
  function SheetPesanan() {
    return (
      <Sheet onClose={() => setShowCart(false)}>
        <div className="flex items-start justify-between" style={{ marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Pesanan</div>
            <div style={{ fontSize: 13, color: t.text2, marginTop: 2 }}>{serviceDate}</div>
          </div>
          {count > 0 && (
            <button onClick={() => { setCart({}); setShowCart(false); if (step === "checkout") setStep("menu"); }}
              className="flex items-center" style={{ gap: 5, minHeight: 44, padding: "0 4px", border: "none", background: "transparent", color: t.text2, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              <Trash2 size={16} /> Kosongkan
            </button>
          )}
        </div>
        {count === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: t.text2 }}>Belum ada item.</div>
        ) : lines.map((l, idx) => {
          const kk = keyOf(l);
          const sisa = stokMap?.[l.menu.id]?.sisa;
          const penuh = sisa !== undefined && qtyOf(l.menu.id) >= sisa;
          return (
            <div key={kk} style={{ padding: "12px 0", borderTop: idx ? `1px solid ${t.divider}` : "none" }}>
              <div className="flex items-center" style={{ gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{toTitleCase(l.menu.name)}</div>
                  {l.variant && <div style={{ fontSize: 13, color: t.text2 }}>{l.variant.name}</div>}
                  <div style={{ fontSize: 15, fontWeight: 500, marginTop: 2 }}>{rupiah(hargaLine(l) * l.qty)}</div>
                  {l.note && <div style={{ fontSize: 13, color: t.text2 }}>{l.note}</div>}
                </div>
                <div className="flex items-center" style={{ gap: 4, flex: "none" }}>
                  <button onClick={() => dec(kk)} aria-label={l.qty <= 1 ? "Hapus" : "Kurangi"} style={{ ...kecil, width: 44, height: 44, background: t.divider }}>{l.qty <= 1 ? <Trash2 size={16} color={t.error} /> : <Minus size={17} />}</button>
                  <span style={{ minWidth: 22, textAlign: "center", fontWeight: 800, fontSize: 16 }}>{l.qty}</span>
                  <button onClick={() => add(l.menu, l.variant || undefined)} disabled={penuh} aria-label="Tambah" style={{ ...kecil, width: 44, height: 44, background: penuh ? t.divider : t.primary, color: penuh ? t.textDis : t.onPrimary }}><Plus size={18} /></button>
                </div>
              </div>
            </div>
          );
        })}
        <button onClick={() => setShowCart(false)} style={{ minHeight: 44, padding: 0, border: "none", background: "transparent", color: t.warnText, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          + Tambah menu lain
        </button>
        <div className="flex items-center justify-between" style={{ marginTop: 10, paddingTop: 14, borderTop: `1px solid ${t.divider}`, gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: t.text2 }}>Total</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{rupiah(total)}</div>
          </div>
          <button disabled={count === 0} onClick={() => { setShowCart(false); setStep("checkout"); }}
            style={{ height: 52, padding: "0 36px", borderRadius: 14, border: "none", background: count === 0 ? t.divider : t.primary, color: count === 0 ? t.textDis : t.onPrimary, fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>
            Lanjut
          </button>
        </div>
      </Sheet>
    );
  }

}

/* ---- komponen kecil ---- */
const kecil: React.CSSProperties = { width: 40, height: 40, borderRadius: "50%", border: "none", color: t.text, cursor: "pointer", display: "grid", placeItems: "center", padding: 0, fontFamily: "inherit" };

/** "Jumat, 6 November 2026" dari tanggal ISO — sama dengan label Tanggal Layanan di tempat lain. */
function labelPanjangISO(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const bln = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return isNaN(d.getTime()) ? iso : `${HARI_P[d.getDay()]}, ${d.getDate()} ${bln[d.getMonth()]} ${d.getFullYear()}`;
}

/** Ikon hitung mundur: lingkaran titik-titik (waktu terlewat) + busur tegas (sisa) + jarum kecil. */
function PilGanti({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ flex: "none", minHeight: 44, padding: "0 18px", borderRadius: 999, border: "none", background: t.primaryLight, color: t.onPrimary, fontWeight: 700, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
  );
}
function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <style>{`@keyframes ganen-sheet-naik{from{transform:translateY(100%)}to{transform:none}}@keyframes ganen-sheet-gelap{from{opacity:0}to{opacity:1}}`}</style>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(42,40,32,.45)", animation: "ganen-sheet-gelap .25s ease-out" }} />
      <div style={{ position: "relative", animation: "ganen-sheet-naik .3s cubic-bezier(.22,.8,.3,1)", background: t.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxWidth: 460, width: "100%", margin: "0 auto", maxHeight: "88vh", overflowY: "auto", padding: "20px 20px calc(22px + env(safe-area-inset-bottom, 0px))" }}>
        {children}
      </div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between" style={{ padding: "4px 0", fontSize: 14.5, gap: 12 }}>
      <span style={{ color: t.text2 }}>{k}</span><span style={{ fontWeight: 700, textAlign: "right" }}>{v}</span>
    </div>
  );
}
function Top({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{ padding: "20px 16px 10px", position: "sticky", top: 0, background: t.bg, zIndex: 5, display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center" }}>
      <button onClick={onBack} aria-label="Kembali" style={{ width: 44, height: 44, marginLeft: -8, border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center", color: t.text }}>
        <ChevronLeft size={24} />
      </button>
      <div style={{ fontSize: 17, fontWeight: 800, textAlign: "center" }}>{title}</div>
      <span />
    </div>
  );
}
function Screen({ children, onCloseHelp, showHelp, unavailNotice, footerSpace = 24 }: {
  children: React.ReactNode;
  showHelp?: boolean;
  onCloseHelp?: () => void;
  /** Nama menu yang baru saja dihapus otomatis dari keranjang karena sudah tidak tersedia. */
  unavailNotice?: string[] | null;
  footerSpace?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={ref} style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
        <div style={{ maxWidth: 460, margin: "0 auto", paddingBottom: footerSpace, position: "relative" }}>{children}</div>
      </div>
      {unavailNotice && unavailNotice.length > 0 && (
        <div style={{ position: "fixed", left: 16, right: 16, top: 74, zIndex: 60, display: "flex", justifyContent: "center" }}>
          <div className="flex items-start gap-2" style={{ maxWidth: 420, width: "100%", background: t.toast, color: t.surface, borderRadius: 14, padding: "13px 16px", fontSize: 13.5, fontWeight: 500, lineHeight: 1.5, boxShadow: "0 6px 22px rgba(60,48,20,.18)" }}>
            <AlertCircle size={17} style={{ flex: "none", marginTop: 1 }} />
            <span>{unavailNotice.join(", ")} sudah tidak tersedia dan dihapus dari keranjang.</span>
          </div>
        </div>
      )}
      {showHelp && onCloseHelp && <HelpModal onClose={onCloseHelp} />}
    </>
  );
}

/* ================= sheet: Data anak ================= */
function SheetDataAnak({ mulai, anak, anakLengkap, savedAnak, kelasList, onPilih, onSimpan, onClose }: {
  mulai: "pilih" | "isi"; anak: SavedAnak | null; anakLengkap: boolean; savedAnak: SavedAnak[]; kelasList: Kelas[];
  onPilih: (a: SavedAnak) => void; onSimpan: (a: SavedAnak) => void; onClose: () => void;
}) {
  const [mode, setMode] = useState<"pilih" | "isi">(mulai);
  const awal = anak && anakLengkap ? null : anak;
  const [f, setF] = useState<SavedAnak>(awal ?? { nama: "", tingkat: "", kelas: "", wa: savedAnak[0]?.wa ?? "" });
  const [tried, setTried] = useState(false);
  const needKelas = f.tingkat !== "" && f.tingkat !== NO_KELAS_TINGKAT;
  const kelasTersedia = kelasList.filter((k) => k.tingkat === f.tingkat);
  const wa = f.wa.replace(/\D/g, "");
  const salah = { nama: !f.nama.trim(), tingkat: !f.tingkat, kelas: needKelas && !f.kelas, wa: wa.length < MIN_WA_DIGITS };
  const simpan = () => {
    if (salah.nama || salah.tingkat || salah.kelas || salah.wa) { setTried(true); return; }
    const a = { nama: f.nama.trim(), tingkat: f.tingkat, kelas: needKelas ? f.kelas : "", wa };
    onSimpan(a);
  };
  const isian = (err: boolean): React.CSSProperties => ({ width: "100%", height: 50, borderRadius: 12, border: err ? `1.5px solid ${t.error}` : "none", background: t.divider, padding: "0 14px", fontSize: 16, color: t.text, outline: "none", fontFamily: "inherit" });
  const lbl = (s: string, err?: boolean) => <div style={{ fontSize: 13, fontWeight: 600, color: err ? t.error : t.text2, margin: "14px 0 6px" }}>{s}{err ? " — wajib diisi" : ""}</div>;
  const chip = (on: boolean): React.CSSProperties => ({ minHeight: 44, padding: "0 16px", borderRadius: 999, border: "none", fontSize: 14.5, fontWeight: on ? 700 : 500, cursor: "pointer", fontFamily: "inherit", background: on ? t.primary : t.divider, color: t.onPrimary });

  if (mode === "pilih") {
    return (
      <Sheet onClose={onClose}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>Pesan untuk</div>
        {savedAnak.map((a) => {
          const on = !!anak && anak.nama === a.nama && anak.kelas === a.kelas;
          return (
            <button key={`${a.nama}|${a.kelas}`} onClick={() => onPilih(a)} className="flex items-center justify-between"
              style={{ width: "100%", minHeight: 58, padding: "0 4px", border: "none", borderTop: `1px solid ${t.divider}`, background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: t.text, gap: 10 }}>
              <span style={{ minWidth: 0, fontSize: 16, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{toTitleCase(a.nama)}{a.kelas ? ` · ${a.kelas}` : a.tingkat ? ` · ${a.tingkat}` : ""}</span>
              {on && <Check size={20} color={t.successText} />}
            </button>
          );
        })}
        <button onClick={() => { setF({ nama: "", tingkat: "", kelas: "", wa: savedAnak[0]?.wa ?? "" }); setMode("isi"); }}
          style={{ width: "100%", minHeight: 52, marginTop: 6, borderRadius: 14, border: "none", background: t.divider, color: t.text, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
          + Tambah anak
        </button>
      </Sheet>
    );
  }
  return (
    <Sheet onClose={onClose}>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{savedAnak.length || anak ? "Tambah anak" : "Isi nama"}</div>
      {lbl("Nama", tried && salah.nama)}
      <input value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} placeholder="Nama lengkap" style={isian(tried && salah.nama)} />
      {lbl("Tingkat", tried && salah.tingkat)}
      <div className="flex" style={{ gap: 8, flexWrap: "wrap" }}>
        {TINGKAT_LIST.map((tg) => <button key={tg} onClick={() => setF({ ...f, tingkat: tg, kelas: "" })} style={chip(tg === f.tingkat)}>{tg}</button>)}
      </div>
      {needKelas && (
        <>
          {lbl("Kelas", tried && salah.kelas)}
          {kelasTersedia.length === 0 ? <div style={{ fontSize: 14, color: t.text2 }}>Belum ada kelas untuk tingkat ini. Hubungi kantin.</div> : (
            <div className="flex" style={{ gap: 8, flexWrap: "wrap" }}>
              {kelasTersedia.map((k) => <button key={k.id} onClick={() => setF({ ...f, kelas: k.nama })} style={chip(k.nama === f.kelas)}>{k.nama}</button>)}
            </div>
          )}
        </>
      )}
      {lbl("Nomor WhatsApp", tried && salah.wa)}
      <input value={f.wa} onChange={(e) => setF({ ...f, wa: e.target.value.replace(/\D/g, "") })} placeholder="08…" inputMode="numeric" style={isian(tried && salah.wa)} />
      <button onClick={simpan}
        style={{ width: "100%", height: 54, marginTop: 20, borderRadius: 14, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>
        Simpan
      </button>
    </Sheet>
  );
}


function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.4)" }} />
      <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
        <div style={{ position: "sticky", top: 0, background: t.surface, padding: "16px 20px 12px", borderBottom: `1px solid ${t.divider}` }} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 20 }}>🪷</span>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Panduan Pemesanan</div>
          </div>
          <button onClick={onClose} aria-label="Tutup" style={{ border: `1.5px solid ${t.border}`, background: t.surface, cursor: "pointer", color: t.text, width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center" }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: "20px 20px 32px" }}>
          <div style={{ fontSize: 13.5, color: t.text2, marginBottom: 20 }}>Cara memesan makanan untuk Ananda sangat mudah dan hanya membutuhkan waktu sekitar 2 menit.</div>

          {/* 5 Langkah */}
          {[
            ["Buka halaman pemesanan", "Masuk ke tautan canteen-gan-en.vercel.app/pesan, lalu tekan Mulai Memesan. Tanggal pemesanan sudah disiapkan secara otomatis."],
            ["Pilih menu yang diinginkan", "Jelajahi menu lewat deretan kategori (Makanan Utama, Lauk, Gorengan, Camilan Sehat, Snack, Buah, Dessert) atau gunakan kolom Cari. Tekan + Tambah pada setiap menu yang ingin dipesan; menu dengan pilihan ukuran menampilkan tombol Pilih."],
            ["Lanjut ke konfirmasi", "Setelah selesai memilih menu, tekan tombol kuning di bagian bawah layar, kemudian pilih Lanjut."],
            ["Lengkapi data Ananda", "Isi nama, tingkat, kelas, nomor WhatsApp, dan waktu pengambilan. Papa/Mama masih dapat mengubah jumlah pesanan di halaman ini."],
            ["Kirim pesanan", "Setelah semua data benar, tekan Kirim Pesanan. Jika muncul halaman hijau \"Pesanan Berhasil Dikirim\", pesanan telah kami terima. Tekan Salin Bukti Pesanan untuk menyimpan arsip."],
          ].map(([judul, isi], i) => (
            <div key={i} className="flex gap-3" style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: t.primary, color: t.onPrimary, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 16, flex: "none" }}>{i + 1}</div>
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 4 }}>{judul}</div>
                <div style={{ fontSize: 14.5, color: t.text2, lineHeight: 1.55 }}>{isi}</div>
              </div>
            </div>
          ))}

          {/* Hal yang Perlu Diketahui */}
          <div style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>📌 Hal yang Perlu Diketahui</div>
            {[
              ["Pemesanan ditutup otomatis pukul 08.00 pada hari makan.", "Agar tidak terlewat, kami menyarankan melakukan pemesanan pada malam sebelumnya."],
              ["Pesanan yang sudah dikirim tidak dapat diubah melalui aplikasi.", "Mohon pastikan kembali menu dan jumlah pesanan sebelum menekan Kirim Pesanan."],
              ["Mohon menitipkan kotak bekal Ananda (beserta wadah tambahan untuk menu berkuah bila diperlukan) di pos satpam sebelum jam masuk sekolah.", "Untuk KB, TK, dan SD Kelas 1–2, pesanan akan diantarkan ke kelas. Untuk SD Kelas 3 ke atas hingga SMA, pesanan dapat diambil di lemari pengambilan bekal di lobby. Kantin tidak menyediakan wadah maupun alat makan."],
              ["Pembayaran dapat dilakukan secara tunai atau transfer ke rekening berikut.", ""],
            ].map(([bold, rest], i) => (
              <div key={i} style={{ fontSize: 14.5, lineHeight: 1.55, marginBottom: 10, paddingLeft: 14, borderLeft: `3px solid ${t.border}` }}>
                <span style={{ fontWeight: 700, color: t.text }}>{bold}</span>{rest && " "}
                <span style={{ color: t.text2 }}>{rest}</span>
              </div>
            ))}
            {/* Rekening — frame TERPISAH dari bullet supaya tidak "kayak
                list", langsung kebaca sebagai satu kartu pembayaran */}
            <div style={{ background: t.surface, border: `1.5px solid ${t.primaryLine}`, borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: t.amberText, marginBottom: 5 }}>Transfer ke</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>BCA 7347028990</div>
              <div style={{ fontSize: 15, color: t.text2, marginTop: 2 }}>a.n. Roswinarti</div>
            </div>
            <div style={{ fontSize: 14, color: t.text2, marginTop: 14 }}>Apabila ada pertanyaan, Papa/Mama dapat menghubungi kantin melalui WhatsApp.</div>
          </div>

          {/* FAQ */}
          <div style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, marginTop: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>❓ Pertanyaan Umum</div>
            {[
              ["Apakah link pemesanan berbeda setiap hari?", "Tidak. Link selalu sama. Tanggal layanan ditentukan otomatis oleh kantin."],
              ["Memesan untuk 2 anak atau 2 waktu istirahat?", "Buat pesanan terpisah. Setelah pesanan pertama terkirim, tekan Buat Pesanan Lagi — data tidak perlu diisi ulang."],
              ["Bolehkah memesan lebih dari satu menu?", "Boleh. Papa/Mama dapat memilih beberapa menu sekaligus dalam satu pesanan."],
              ["Tombol \"Salin Bukti Pesanan\" menyalin apa?", "Menyalin teks bukti pesanan — bisa langsung ditempel (paste) ke chat WhatsApp, atau ke aplikasi Catatan/Notes di HP Papa/Mama untuk disimpan."],
            ].map(([q, a], i) => (
              <div key={i} style={{ marginBottom: i < 3 ? 12 : 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: t.text, marginBottom: 3 }}>{q}</div>
                <div style={{ fontSize: 14, color: t.text2, lineHeight: 1.55 }}>{a}</div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", color: t.text2, fontSize: 13, marginTop: 22 }}>🪷 感恩 Gan En 🙏🏻✨</div>
        </div>
      </div>
    </div>
  );
}
