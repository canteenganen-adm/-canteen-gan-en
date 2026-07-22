import { useEffect, useMemo, useState } from "react";
import {
  Plus, Minus, ChevronRight, ChevronDown, ArrowLeft, Check, Clock, Trash2,
  Copy, Calendar, StickyNote, ShoppingBag, AlertCircle, X, Search, HelpCircle,
} from "lucide-react";
import { t } from "../../lib/theme";
import { rupiah, orderNo, serviceDateLabel, toTitleCase } from "../../lib/format";
import { fetchAppState, fetchMenuHarian } from "../../lib/canteenApi";
import { TINGKAT_LIST, NO_KELAS_TINGKAT, KATEGORI_ORTU_EMOJI, KATEGORI_ORTU_ORDER } from "../../lib/constants";
import type { MenuItem, Variant, Kelas, Transaction } from "../../types";

/* ============================================================
   PRE-ORDER (PARENT) — Canteen Gan En  ·  halaman link orang tua
   Landing: ikon teratai 🪷, slogan "Sehangat pelukan Ibu".
   Menu: kotak cari + chip 5 kelompok besar (sticky), tile emoji
   per kategori. Orang tua TIDAK PERNAH memilih tanggal.
   Checkout ("Konfirmasi Pesanan"): daftar item +/-, data pemesan.
   Done: satu tombol "Salin Bukti Pesanan" (copy teks clipboard,
   bukan foto).
   ============================================================ */

/* --- Taksonomi 8 kategori versi orang tua (kategori_ortu, vegan-safe) ---
   Emoji + urutan dari lib/constants (dipakai juga pratinjau tab Menu admin).
   "Lainnya" = fallback item yang belum dikategorikan (tidak pernah
   disembunyikan); "Paket" tampil sebagai banner khusus, bukan tile. */
const KAT_EMOJI = KATEGORI_ORTU_EMOJI;
const KAT_ORDER = KATEGORI_ORTU_ORDER;
const katOf = (m: MenuItem) => m.kategoriOrtu || "Lainnya";

/** Banner "Paket Spesial Hari Ini" — sedang DITUTUP atas permintaan pemilik.
 * Ubah ke true untuk menampilkan kembali (posisi: paling atas, di bawah Cari).
 * Item kategori Paket tetap tampil & bisa dipesan lewat section di daftar. */
const PAKET_BANNER_AKTIF = false;

const DEFAULT_PICKUP_FALLBACK = "Istirahat 1";
const MIN_WA_DIGITS = 10;

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

export default function PreOrderParent({
  kantin,
  serviceDate,
  open,
  menus,
  kelasList,
  pickupOptions,
  onSubmit,
}: {
  kantin: string;
  serviceDate: string;
  open: boolean;
  menus: MenuItem[];
  kelasList: Kelas[];
  pickupOptions: string[];
  onSubmit: (r: PreOrderReceipt) => Promise<Transaction>;
}) {
  const defaultPickup = pickupOptions[0] || DEFAULT_PICKUP_FALLBACK;
  const [step, setStep] = useState<"landing" | "menu" | "checkout" | "done">("landing");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [variantFor, setVariantFor] = useState<MenuItem | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [showKelasSheet, setShowKelasSheet] = useState(false);
  const [form, setForm] = useState({ nama: "", tingkat: "", kelas: "", wa: "", ambil: defaultPickup });
  const [tried, setTried] = useState(false);

  /* "Akun" tanpa akun: data pemesan yang berhasil dipakai DISIMPAN DI HP INI
     (localStorage) — kunjungan berikutnya form terisi otomatis, dan kalau
     satu HP dipakai untuk beberapa anak (kakak-adik) muncul pilihan cepat.
     Tidak membaca data keluarga lain sama sekali → tanpa risiko salah tempel
     nomor orang, tanpa akun, tanpa biaya. */
  type SavedAnak = { nama: string; tingkat: string; kelas: string; wa: string };
  const [savedAnak, setSavedAnak] = useState<SavedAnak[]>(() => {
    try { return JSON.parse(localStorage.getItem("ganen_anak") || "[]"); } catch { return []; }
  });
  useEffect(() => {
    // Prefill sekali dengan anak terakhir yang dipakai di HP ini
    setForm((f) => {
      if (f.nama || savedAnak.length === 0) return f;
      const a = savedAnak[0];
      return { ...f, nama: a.nama, tingkat: a.tingkat, kelas: a.kelas, wa: a.wa };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pilihAnak = (a: SavedAnak) => setForm((f) => ({ ...f, nama: a.nama, tingkat: a.tingkat, kelas: a.kelas, wa: a.wa }));
  const simpanAnak = (a: SavedAnak) => {
    const key = (x: SavedAnak) => `${x.nama.trim().toLowerCase()}|${x.kelas.trim().toLowerCase()}`;
    const next = [a, ...savedAnak.filter((x) => key(x) !== key(a))].slice(0, 4);
    setSavedAnak(next);
    try { localStorage.setItem("ganen_anak", JSON.stringify(next)); } catch { /* penuh/di-blok: abaikan */ }
  };
  const [receipt, setReceipt] = useState<PreOrderReceipt | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [menuQ, setMenuQ] = useState("");
  const [menuCat, setMenuCat] = useState("Semua");
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const kelasNeeded = form.tingkat !== "" && form.tingkat !== NO_KELAS_TINGKAT;
  const availableKelas = kelasList.filter((k) => k.tingkat === form.tingkat);
  const pre = menus.filter((m) => m.channels.preorder);
  const lines = Object.values(cart);
  const total = lines.reduce((s, l) => s + (l.variant ? l.variant.price : l.menu.price ?? 0) * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const waDigits = form.wa.replace(/\D/g, "");

  // Tile kategori: tanpa "Paket" (banner khusus) dan tanpa "Lainnya" (hanya
  // section terakhir di tampilan Semua). Kategori kosong tidak diberi tile.
  const tileCats = useMemo(
    () => KAT_ORDER.filter((k) => k !== "Paket" && k !== "Lainnya" && pre.some((m) => katOf(m) === k)),
    [pre]
  );
  const paketItems = useMemo(() => pre.filter((m) => katOf(m) === "Paket"), [pre]);

  /** Keranjang WAJIB dibersihkan otomatis begitu suatu menu tidak lagi
   * tersedia (admin mematikan Pre-order-nya) — kalau tidak, HP orang tua
   * yang tab-nya lama tidak aktif (koneksi realtime tertunda) bisa terus
   * menampilkan item yang sudah dimatikan, lalu tetap terkirim. `pre`
   * mengikuti `menus` yang disegarkan realtime, jadi ini sudah menutup
   * celah untuk kasus umum; submit() masih memeriksa ulang sekali lagi
   * langsung ke server sebagai jaring pengaman terakhir. */
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
  const add = (menu: MenuItem, variant?: Variant) => {
    const key = menu.id + (variant ? ":" + variant.id : "");
    setCart((c) => ({ ...c, [key]: { menu, variant: variant || null, qty: (c[key]?.qty || 0) + 1, note: c[key]?.note || "" } }));
  };
  const dec = (key: string) => setCart((c) => {
    const n = { ...c };
    if (!n[key]) return n;
    if (n[key].qty <= 1) delete n[key]; else n[key] = { ...n[key], qty: n[key].qty - 1 };
    return n;
  });
  const tap = (m: MenuItem) => (m.variants.length ? setVariantFor(m) : add(m));
  const qtyOf = (id: string) => Object.values(cart).filter((l) => l.menu.id === id).reduce((s, l) => s + l.qty, 0);
  const pickTingkat = (tg: string) => setForm({ ...form, tingkat: tg, kelas: "" });
  const invalid = () =>
    !form.nama.trim() || !form.tingkat || waDigits.length < MIN_WA_DIGITS || (kelasNeeded && !form.kelas) || count === 0;

  const copyReceipt = () => {
    if (!receipt) return;
    const items = receipt.items
      .map((i) => `- ${i.name}${i.variant ? " (" + i.variant + ")" : ""} ×${i.qty} = ${rupiah(i.price * i.qty)}`)
      .join("\n");
    const txt = `BUKTI PESANAN ${receipt.no}\nNama: ${receipt.nama}\nTingkat/Kelas: ${receipt.kelasLabel}\nTanggal Layanan: ${receipt.serviceDate}\nWaktu Ambil: ${receipt.ambil}\n\n${items}\n\nTotal: ${rupiah(receipt.total)}\n${receipt.submittedAt}`;
    navigator.clipboard?.writeText(txt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const submit = async () => {
    if (invalid()) { setTried(true); return; }
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
      // Jaring pengaman TERAKHIR: ambil langsung snapshot menu tersimpan
      // untuk tanggal sesi dari server (bukan state lokal yang bisa basi
      // kalau realtime sempat putus/tab lama tidak aktif) — tolak kirim
      // kalau ternyata ada item di keranjang yang sudah tidak tersedia.
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
        // Snapshot gagal diambil (migration_9 belum jalan / jaringan) —
        // jangan blokir pemesanan hanya karena pemeriksaan ekstra ini gagal.
      }
      const kelasLbl = kelasNeeded ? `${form.tingkat} · ${form.kelas}` : form.tingkat;
      const r: PreOrderReceipt = {
        no: orderNo(), nama: form.nama, tingkat: form.tingkat, kelas: kelasNeeded ? form.kelas : "",
        kelasLabel: kelasLbl, wa: waDigits, ambil: form.ambil, serviceDate,
        submittedAt: new Date().toLocaleString("id-ID"),
        items: lines.map((l) => ({ name: l.menu.name, variant: l.variant?.name || null, price: l.variant ? l.variant.price : l.menu.price ?? 0, qty: l.qty, note: l.note || "" })),
        total,
      };
      const confirmed = await onSubmit(r);
      simpanAnak({ nama: form.nama.trim(), tingkat: form.tingkat, kelas: kelasNeeded ? form.kelas : "", wa: waDigits });
      setReceipt({ ...r, serviceDate: confirmed.serviceDate ? serviceDateLabel(confirmed.serviceDate) : serviceDate });
      setStep("done");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Gagal mengirim pesanan. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setCart({}); setForm({ nama: "", tingkat: "", kelas: "", wa: "", ambil: defaultPickup });
    setTried(false); setSubmitError(null); setMenuQ(""); setMenuCat("Semua"); setStep("landing");
  };

  /* ---------- LANDING ---------- */
  if (step === "landing") {
    const closed = !open || sessionClosed;
    return (
      <Screen onHelp={() => setShowHelp(true)} showHelp={showHelp} onCloseHelp={() => setShowHelp(false)}>
        <div style={{ padding: "40px 24px", textAlign: "center" }}>
          <div style={{ width: 84, height: 84, borderRadius: 24, background: t.primaryLight, display: "grid", placeItems: "center", margin: "0 auto 18px", fontSize: 46 }}>🪷</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{kantin}</div>
          <div style={{ fontSize: 13.5, color: t.text2, marginTop: 4, fontStyle: "italic" }}>Masakan sehangat pelukan Ibu</div>
          <div className="flex items-center justify-center gap-2" style={{ marginTop: 12, color: t.text2, fontSize: 14.5 }}><Calendar size={16} /> {serviceDate}</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14, padding: "6px 14px", borderRadius: 999, fontWeight: 700, fontSize: 13.5, background: closed ? t.errorBg : t.successBg, color: closed ? t.error : t.successText }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: closed ? t.error : t.success }} /> Pre-order {closed ? "Ditutup" : "Dibuka"}
          </div>
          <div style={{ marginTop: 36 }}>
            {!closed ? (
              <button onClick={() => setStep("menu")} className="flex items-center justify-center gap-2" style={{ width: "100%", height: 58, borderRadius: 16, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 17, cursor: "pointer" }}>
                <ShoppingBag size={22} /> Mulai Memesan
              </button>
            ) : (
              <div style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 14, padding: 18, color: t.text2, fontSize: 14.5 }}>
                Maaf, periode Pre-order untuk tanggal ini sudah ditutup.
              </div>
            )}
          </div>
        </div>
      </Screen>
    );
  }

  /* ---------- DONE ---------- */
  if (step === "done" && receipt) {
    return (
      <Screen>
        <div style={{ padding: "32px 20px" }}>
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: t.successBg, color: t.success, display: "grid", placeItems: "center", margin: "0 auto 14px" }}><Check size={40} /></div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Pesanan Berhasil Dikirim</div>
          </div>
          <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: t.amberText, marginBottom: 12 }}>Bukti Pesanan</div>
            <Row k="No. Pesanan" v={receipt.no} />
            <Row k="Nama" v={receipt.nama} />
            <Row k="Tingkat / Kelas" v={receipt.kelasLabel} />
            <Row k="Tanggal Layanan" v={receipt.serviceDate} />
            <Row k="Waktu Ambil" v={receipt.ambil} />
            <div style={{ borderTop: `1px solid ${t.divider}`, margin: "12px 0", paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.text2, marginBottom: 8 }}>Rincian Pesanan</div>
              {receipt.items.map((it, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 14.5 }}>{toTitleCase(it.name)}{it.variant ? ` (${it.variant})` : ""} ×{it.qty}</span>
                    <span style={{ fontSize: 14.5, fontWeight: 700 }}>{rupiah(it.price * it.qty)}</span>
                  </div>
                  {it.note && <div style={{ fontSize: 12, color: t.text2, fontStyle: "italic" }}>&ldquo;{it.note}&rdquo;</div>}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between" style={{ borderTop: `1px solid ${t.divider}`, paddingTop: 12 }}>
              <span style={{ fontWeight: 700 }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{rupiah(receipt.total)}</span>
            </div>
            <div style={{ fontSize: 11.5, color: t.textDis, marginTop: 10 }}>{receipt.submittedAt}</div>
          </div>

          {/* Satu tombol Salin — menyalin TEKS ke clipboard, bukan foto */}
          <button onClick={copyReceipt} className="flex items-center justify-center gap-2"
            style={{ width: "100%", height: 48, marginTop: 14, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: copied ? t.successText : t.text, fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}>
            {copied ? <Check size={17} /> : <Copy size={17} />} {copied ? "Tersalin!" : "Salin Bukti Pesanan"}
          </button>

          {/* Pesan lagi untuk anak lain / waktu ambil lain — data pemesan TETAP terisi */}
          <button onClick={() => { setCart({}); setTried(false); setReceipt(null); setStep("menu"); }}
            className="flex items-center justify-center gap-2"
            style={{ width: "100%", height: 52, marginTop: 10, borderRadius: 14, border: `1.5px solid ${t.primary}`, background: t.primaryLight, color: t.amberText, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
            <Plus size={18} /> Buat Pesanan Lagi
          </button>

          <div style={{ textAlign: "center", fontSize: 14, color: t.text2, margin: "18px 8px", lineHeight: 1.6 }}>
            Mohon menitipkan kotak bekal Ananda di pos satpam sebelum jam masuk sekolah. Untuk KB, TK, dan SD Kelas 1–2, pesanan akan diantarkan ke kelas. Untuk SD Kelas 3 ke atas hingga SMA, pesanan dapat diambil di lemari pengambilan bekal di lobby.
            <div style={{ marginTop: 10, fontWeight: 600, color: t.text }}>🪷 感恩 Gan En 🙏🏻✨</div>
          </div>
          <button onClick={resetAll} style={{ width: "100%", height: 54, borderRadius: 14, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 16, cursor: "pointer" }}>
            Selesai
          </button>
        </div>
      </Screen>
    );
  }

  /* ---------- KONFIRMASI PESANAN (checkout) ---------- */
  if (step === "checkout") {
    return (
      <Screen onHelp={() => setShowHelp(true)} showHelp={showHelp} onCloseHelp={() => setShowHelp(false)} unavailNotice={unavailNotice}>
        <Top title="Konfirmasi Pesanan" onBack={() => setStep("menu")} />
        <div style={{ padding: "4px 20px 20px" }}>
          <SectionLabel>Pesanan</SectionLabel>
          {count === 0 ? (
            <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20, textAlign: "center", color: t.text2, marginBottom: 18 }}>
              Belum ada item. <button onClick={() => setStep("menu")} style={{ border: "none", background: "transparent", color: t.amberText, fontWeight: 700, cursor: "pointer" }}>Tambah menu</button>
            </div>
          ) : (
            <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: "4px 14px", marginBottom: 18 }}>
              {lines.map((l) => (
                <div key={keyOf(l)} className="flex items-center gap-3" style={{ padding: "12px 0", borderBottom: `1px solid ${t.divider}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{toTitleCase(l.menu.name)}{l.variant ? ` (${l.variant.name})` : ""}</div>
                    <div style={{ fontSize: 13, color: t.text2, marginTop: 2 }}>{rupiah((l.variant ? l.variant.price : l.menu.price ?? 0) * l.qty)}</div>
                  </div>
                  <div className="flex items-center gap-2" style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 999, padding: 3 }}>
                    <button onClick={() => dec(keyOf(l))} style={stepBtn} aria-label={l.qty <= 1 ? "Hapus" : "Kurangi"}>
                      {l.qty <= 1 ? <Trash2 size={16} color={t.error} /> : <Minus size={18} />}
                    </button>
                    <span style={{ minWidth: 20, textAlign: "center", fontWeight: 800, fontSize: 15 }}>{l.qty}</span>
                    <button onClick={() => add(l.menu, l.variant || undefined)} style={stepBtn} aria-label="Tambah"><Plus size={18} /></button>
                  </div>
                </div>
              ))}
              <button onClick={() => setStep("menu")} className="flex items-center gap-1" style={{ padding: "12px 0", background: "transparent", border: "none", color: t.amberText, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
                <Plus size={16} /> Tambah menu lain
              </button>
            </div>
          )}

          <SectionLabel>Data Pemesan</SectionLabel>
          {savedAnak.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: t.text2, marginBottom: 6 }}>
                Pernah pesan di HP ini — ketuk untuk isi otomatis:
              </div>
              <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                {savedAnak.map((a) => {
                  const on = form.nama === a.nama && form.kelas === a.kelas;
                  return (
                    <button key={`${a.nama}|${a.kelas}`} onClick={() => pilihAnak(a)}
                      style={{ height: 44, padding: "0 16px", borderRadius: 999, fontSize: 14, fontWeight: 700, cursor: "pointer",
                        border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, color: on ? t.amberText : t.text }}>
                      {a.nama}{a.kelas ? ` · ${a.kelas}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <Field label="Nama" req err={tried && !form.nama.trim()}>
            <input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="Nama lengkap" style={inp(tried && !form.nama.trim())} />
          </Field>

          <Field label="Tingkat" req err={tried && !form.tingkat}>
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              {TINGKAT_LIST.map((tg) => {
                const on = tg === form.tingkat;
                return (
                  <button key={tg} onClick={() => pickTingkat(tg)}
                    style={{ height: 44, padding: "0 14px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer",
                      border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, color: on ? t.amberText : t.text2 }}>
                    {tg}
                  </button>
                );
              })}
            </div>
          </Field>

          {kelasNeeded && (
            <Field label="Kelas" req err={tried && !form.kelas}>
              <button onClick={() => setShowKelasSheet(true)} className="flex items-center justify-between"
                style={{ ...inp(tried && !form.kelas), cursor: "pointer", textAlign: "left" }}>
                <span style={{ color: form.kelas ? t.text : t.textDis }}>{form.kelas || "Pilih kelas"}</span>
                <ChevronDown size={18} color={t.text2} />
              </button>
            </Field>
          )}

          <Field label="Nomor WhatsApp" req err={tried && waDigits.length < MIN_WA_DIGITS}>
            <input value={form.wa} onChange={(e) => setForm({ ...form, wa: e.target.value.replace(/\D/g, "") })}
              placeholder="08…" inputMode="numeric" style={inp(tried && waDigits.length < MIN_WA_DIGITS)} />
          </Field>

          <Field label="Waktu Ambil">
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              {pickupOptions.map((p) => {
                const on = p === form.ambil;
                return (
                  <button key={p} onClick={() => setForm({ ...form, ambil: p })} className="flex items-center gap-1"
                    style={{ height: 46, padding: "0 14px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer",
                      border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, color: on ? t.amberText : t.text2 }}>
                    <Clock size={14} /> {p}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="flex items-center justify-between" style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 14, padding: "14px 16px", margin: "8px 0 16px" }}>
            <span style={{ color: t.text2, fontSize: 14 }}>{count} item</span>
            <span style={{ fontWeight: 800, fontSize: 20 }}>{rupiah(total)}</span>
          </div>

          {submitError && (
            <div className="flex items-center gap-2" style={{ background: t.errorBg, border: `1.5px solid #F3C9C9`, borderRadius: 12, padding: "12px 14px", color: t.error, fontSize: 13.5, marginBottom: 14 }}>
              <AlertCircle size={16} style={{ flex: "none" }} /> {submitError}
            </div>
          )}

          <button onClick={submit} disabled={submitting} className="flex items-center justify-center gap-2"
            style={{ width: "100%", height: 56, borderRadius: 14, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 16, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.6 : 1 }}>
            <Check size={20} /> {submitting ? "Mengirim…" : "Kirim Pesanan"}
          </button>
        </div>

        {showKelasSheet && (
          <BottomSheet title={`Pilih Kelas · ${form.tingkat}`} onClose={() => setShowKelasSheet(false)}>
            {availableKelas.length === 0 ? (
              <div style={{ color: t.text2, fontSize: 14, padding: "8px 0" }}>Belum ada kelas untuk tingkat ini. Hubungi kantin.</div>
            ) : availableKelas.map((k) => {
              const on = k.nama === form.kelas;
              return (
                <button key={k.id} onClick={() => { setForm({ ...form, kelas: k.nama }); setShowKelasSheet(false); }} className="flex items-center justify-between"
                  style={{ width: "100%", height: 54, marginBottom: 8, borderRadius: 12, border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, padding: "0 16px", cursor: "pointer" }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: on ? t.amberText : t.text }}>{k.nama}</span>
                  {on && <Check size={18} color={t.amberText} />}
                </button>
              );
            })}
          </BottomSheet>
        )}
      </Screen>
    );
  }

  /* ---------- MENU (redesign sesuai prototipe-redesign-parent.html) ---------- */
  const filteredPre = pre.filter(
    (m) => (menuCat === "Semua" || katOf(m) === menuCat) &&
      m.name.toLowerCase().includes(menuQ.toLowerCase().trim())
  );
  const byCatMap: Record<string, MenuItem[]> = {};
  filteredPre.forEach((m) => {
    const k = katOf(m);
    if (!byCatMap[k]) byCatMap[k] = [];
    byCatMap[k].push(m);
  });

  return (
    <Screen showHelp={showHelp} onCloseHelp={() => setShowHelp(false)} unavailNotice={unavailNotice}>
      <style>{`.catscroll::-webkit-scrollbar{display:none}`}</style>

      {/* Header sticky: brand + tombol bantuan; tanggal teks polos tanpa chip */}
      <div style={{ position: "sticky", top: 0, background: t.bg, zIndex: 5, padding: "18px 16px 14px", borderBottom: `1px solid ${t.border}` }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            <button onClick={() => setStep("landing")} aria-label="Kembali"
              style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${t.border}`, background: t.surface, cursor: "pointer", display: "grid", placeItems: "center", color: t.text, flex: "none" }}>
              <ArrowLeft size={17} />
            </button>
            <span style={{ fontSize: 22 }}>🪷</span>
            <span style={{ fontSize: 16, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{kantin}</span>
          </div>
          <button onClick={() => setShowHelp(true)} aria-label="Panduan pemesanan"
            style={{ width: 34, height: 34, borderRadius: "50%", background: t.primary, border: "none", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14, color: t.text, cursor: "pointer", flex: "none" }}>
            ?
          </button>
        </div>
        <div style={{ fontSize: 12.5, color: t.text2, paddingLeft: 2 }}>{serviceDate}</div>
      </div>

      {/* Cari — full width, di luar kategori */}
      <div style={{ padding: "14px 16px 0" }}>
        <div className="flex items-center gap-2" style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: "0 14px", height: 46 }}>
          <Search size={18} color={t.text2} />
          <input value={menuQ} onChange={(e) => setMenuQ(e.target.value)} placeholder="Cari menu…"
            style={{ border: "none", outline: "none", background: "transparent", fontSize: 14.5, width: "100%", color: t.text, fontFamily: "inherit" }} />
          {menuQ && <X size={17} color={t.text2} style={{ cursor: "pointer" }} onClick={() => setMenuQ("")} />}
        </div>
      </div>

      {/* Banner Paket — PALING ATAS saat aktif; hanya saat ada item Paket */}
      {PAKET_BANNER_AKTIF && paketItems.length > 0 && (
        <button onClick={() => setMenuCat(menuCat === "Paket" ? "Semua" : "Paket")}
          className="flex items-center gap-3"
          style={{ margin: "14px 16px 0", width: "calc(100% - 32px)", textAlign: "left", cursor: "pointer",
            background: `linear-gradient(135deg, ${t.primaryLight}, ${t.surfaceSoft})`,
            border: `1px solid ${t.primary}`, borderRadius: 16, padding: 14 }}>
          <span style={{ fontSize: 28, flex: "none" }}>🍱</span>
          <span>
            <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: t.amberText }}>Paket Spesial Hari Ini</span>
            <span style={{ display: "block", fontSize: 11.5, color: t.text2 }}>{paketItems.length} pilihan tersedia</span>
          </span>
        </button>
      )}

      {/* Tile kategori — scroll-snap horizontal, scrollbar tersembunyi.
          Ketuk tile aktif sekali lagi = kembali ke Semua. */}
      <div className="catscroll" style={{ display: "flex", gap: 10, overflowX: "auto", padding: "14px 16px 4px", scrollSnapType: "x mandatory", scrollbarWidth: "none" }}>
        {tileCats.map((c) => {
          const on = c === menuCat;
          return (
            <button key={c} onClick={() => setMenuCat(on ? "Semua" : c)}
              className="flex flex-col items-center"
              style={{ flex: "none", scrollSnapAlign: "start", width: 64, gap: 5, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
              <span style={{ width: 52, height: 52, borderRadius: 16, background: on ? t.primaryLight : t.surface, border: `1.5px solid ${on ? t.primary : t.border}`, display: "grid", placeItems: "center", fontSize: 24 }}>
                {KAT_EMOJI[c]}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: on ? t.amberText : t.text2, textAlign: "center", lineHeight: 1.2 }}>{c}</span>
            </button>
          );
        })}
      </div>

      {filteredPre.length === 0 && (
        <div style={{ textAlign: "center", color: t.text2, fontSize: 14.5, padding: "36px 16px" }}>Tidak ada menu yang cocok.</div>
      )}

      {/* Section per kategori — judul emoji + nama uppercase, grid 2 kolom */}
      {KAT_ORDER.filter((k) => byCatMap[k]).map((k) => (
        <div key={k} style={{ padding: "18px 16px 4px" }}>
          <div className="flex items-center" style={{ gap: 6, fontSize: 13, fontWeight: 800, color: t.amberText, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 10 }}>
            {KAT_EMOJI[k]} {k}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {byCatMap[k].map((m) => {
              const inCart = qtyOf(m.id);
              return (
                <div key={m.id} style={{ background: t.surface, border: `1px solid ${inCart ? t.primary : t.border}`, borderRadius: 16, padding: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, marginBottom: 5, minHeight: 34 }}>{toTitleCase(m.name)}</div>
                  <div style={{ fontSize: 12, color: t.text2, marginBottom: 10 }}>
                    {m.variants.length
                      ? `mulai ${rupiah(Math.min(...m.variants.map((v) => v.price)))}`
                      : rupiah(m.price)}
                  </div>
                  {inCart > 0 && !m.variants.length ? (
                    <div className="flex" style={{ justifyContent: "center" }}>
                      <Stepper val={inCart} onMinus={() => dec(m.id)} onPlus={() => add(m)} />
                    </div>
                  ) : (
                    <button onClick={() => tap(m)}
                      style={{ width: "100%", height: 34, borderRadius: 9, background: t.primary, border: "none", fontWeight: 800, fontSize: 12, color: t.text, cursor: "pointer" }}>
                      {m.variants.length ? "Pilih" : "+ Tambah"}
                    </button>
                  )}
                  {Object.values(cart).filter((l) => l.menu.id === m.id && l.variant).map((l) => (
                    <div key={l.variant!.id} style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.divider}` }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{l.variant!.name} · {rupiah(l.variant!.price)}</div>
                      <div className="flex" style={{ justifyContent: "center" }}>
                        <Stepper val={l.qty} onMinus={() => dec(m.id + ":" + l.variant!.id)} onPlus={() => add(m, l.variant!)} />
                      </div>
                    </div>
                  ))}
                  {inCart > 0 && (
                    noteFor === m.id ? (
                      <input autoFocus placeholder="Catatan (cth. tidak pedas)" onBlur={() => setNoteFor(null)}
                        onChange={(e) => setCart((c) => { const n = { ...c }; Object.keys(n).forEach((key) => { if (n[key].menu.id === m.id) n[key] = { ...n[key], note: e.target.value }; }); return n; })}
                        style={{ ...inp(false), marginTop: 10, height: 40, fontSize: 13 }} />
                    ) : (
                      <button onClick={() => setNoteFor(m.id)} className="flex items-center gap-1"
                        style={{ marginTop: 10, background: "transparent", border: "none", color: t.amberText, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                        <StickyNote size={13} /> {Object.values(cart).find((l) => l.menu.id === m.id)?.note ? "Edit catatan" : "Catatan"}
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ height: 16 }} />

      {variantFor && (
        <BottomSheet title={variantFor.name} onClose={() => setVariantFor(null)}>
          {variantFor.variants.map((v) => (
            <button key={v.id} onClick={() => { add(variantFor, v); setVariantFor(null); }} className="flex items-center justify-between"
              style={{ width: "100%", height: 56, marginBottom: 10, borderRadius: 14, border: `1.5px solid ${t.border}`, background: t.surface, padding: "0 16px", cursor: "pointer" }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{v.name}</span>
              <span className="flex items-center gap-2" style={{ fontWeight: 700 }}>{rupiah(v.price)} <Plus size={18} color={t.amberText} /></span>
            </button>
          ))}
        </BottomSheet>
      )}

      {count > 0 && !variantFor && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 20px 18px", background: `linear-gradient(transparent,${t.bg} 22%)` }}>
          <div style={{ maxWidth: 460, margin: "0 auto" }}>
            <button onClick={() => setStep("checkout")} className="flex items-center justify-between"
              style={{ width: "100%", height: 58, borderRadius: 16, border: "none", background: t.primary, color: t.text, padding: "0 18px", cursor: "pointer", boxShadow: "0 6px 20px rgba(253,184,51,.4)" }}>
              <span style={{ fontWeight: 700 }}>{count} item · {rupiah(total)}</span>
              <span className="flex items-center gap-1" style={{ fontWeight: 800 }}>Lanjut <ChevronRight size={20} /></span>
            </button>
          </div>
        </div>
      )}
    </Screen>
  );
}

/* ---- shared sub-components ---- */
function Screen({ children, onHelp, showHelp, onCloseHelp, unavailNotice }: {
  children: React.ReactNode;
  onHelp?: () => void;
  showHelp?: boolean;
  onCloseHelp?: () => void;
  /** Nama menu yang baru saja dihapus otomatis dari keranjang karena sudah
   * tidak tersedia (admin mematikan/menghabiskannya). */
  unavailNotice?: string[] | null;
}) {
  return (
    <>
      <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
        <div style={{ maxWidth: 460, margin: "0 auto", paddingBottom: 96, position: "relative" }}>{children}</div>
      </div>
      {unavailNotice && unavailNotice.length > 0 && (
        /* Di ATAS, bukan bawah — laman ini punya kolom isian (Nama/WA);
           toast bawah bisa ketutup keyboard pas orang tua sedang mengetik.
           top:74 memberi jarak dari tombol bantuan (?) di pojok kanan atas. */
        <div style={{ position: "fixed", left: 16, right: 16, top: 74, zIndex: 60, display: "flex", justifyContent: "center" }}>
          <div className="flex items-start gap-2" style={{ maxWidth: 420, width: "100%", background: t.text, color: "#FBF7EF", borderRadius: 14, padding: "13px 16px", fontSize: 13.5, fontWeight: 600, lineHeight: 1.5, boxShadow: "0 14px 34px rgba(47,42,36,.3)" }}>
            <AlertCircle size={17} style={{ flex: "none", marginTop: 1 }} />
            <span>{unavailNotice.join(", ")} sudah tidak tersedia dan dihapus dari keranjang.</span>
          </div>
        </div>
      )}
      {onHelp && (
        <button onClick={onHelp} aria-label="Panduan pemesanan"
          style={{ position: "fixed", right: 16, top: 16, zIndex: 10, width: 48, height: 48, borderRadius: "50%", border: "none", background: t.primary, color: t.text, cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 2px 8px rgba(47,42,36,.16)", flexShrink: 0 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#F9A03F")}
          onMouseLeave={(e) => (e.currentTarget.style.background = t.primary)}>
          <HelpCircle size={24} strokeWidth={2.2} />
        </button>
      )}
      {showHelp && onCloseHelp && <HelpModal onClose={onCloseHelp} />}
    </>
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
          <button onClick={onClose} style={{ border: "none", background: t.surfaceSoft, cursor: "pointer", color: t.text2, width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center" }}>
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
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: t.primary, color: t.text, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 16, flex: "none" }}>{i + 1}</div>
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
            <div style={{ background: t.surface, border: `1.5px solid ${t.primary}`, borderRadius: 14, padding: "14px 16px" }}>
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
function Top({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3" style={{ padding: "18px 20px 10px", position: "sticky", top: 0, background: t.bg, zIndex: 5 }}>
      <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: 11, border: `1px solid ${t.border}`, background: t.surface, cursor: "pointer", display: "grid", placeItems: "center", color: t.text }}>
        <ArrowLeft size={20} />
      </button>
      <div style={{ fontSize: 19, fontWeight: 800 }}>{title}</div>
    </div>
  );
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: t.text2, margin: "4px 2px 10px" }}>{children}</div>;
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: "5px 0", fontSize: 14 }}>
      <span style={{ color: t.text2 }}>{k}</span><span style={{ fontWeight: 700, textAlign: "right" }}>{v}</span>
    </div>
  );
}
function Stepper({ val, onMinus, onPlus }: { val: number; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="flex items-center gap-2" style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 999, padding: 3 }}>
      <button onClick={onMinus} style={stepBtn}><Minus size={18} /></button>
      <span style={{ minWidth: 22, textAlign: "center", fontWeight: 800, fontSize: 16 }}>{val}</span>
      <button onClick={onPlus} style={stepBtn}><Plus size={18} /></button>
    </div>
  );
}
function BottomSheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
      <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", maxHeight: "80vh", overflowY: "auto", padding: 20 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
          <button onClick={onClose} style={{ border: "none", background: t.surfaceSoft, cursor: "pointer", color: t.text2, width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center" }}><X size={17} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
const stepBtn: React.CSSProperties = { width: 40, height: 40, borderRadius: 999, border: "none", background: t.primaryLight, color: t.text, cursor: "pointer", display: "grid", placeItems: "center" };
const inp = (err: boolean): React.CSSProperties => ({ width: "100%", height: 52, fontSize: 16, color: t.text, background: t.surface, border: `1.5px solid ${err ? t.error : t.border}`, borderRadius: 12, padding: "0 14px", outline: "none", fontFamily: "inherit" });
function Field({ label, children, req, err }: { label: string; children: React.ReactNode; req?: boolean; err?: boolean }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{label}{req && <span style={{ color: t.error }}> *</span>}</div>
      {children}{err && <div style={{ fontSize: 12.5, color: t.error, marginTop: 6 }}>Wajib diisi.</div>}
    </div>
  );
}
