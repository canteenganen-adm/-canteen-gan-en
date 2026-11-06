import { useMemo, useState, useEffect, useRef } from "react";
import {
  Search, X, Plus, Minus, Check, Receipt,
  Layers, Wallet, Trash2, Undo2, Calendar,
} from "lucide-react";
import { t, NAV_HEIGHT, STRUK_MONO } from "../../lib/theme";
import { rupiah, uid, nowLabel, todayISO, serviceDateLabel, toTitleCase } from "../../lib/format";
import { TINGKAT_LIST, NO_KELAS_TINGKAT } from "../../lib/constants";
import { isAkhirPekan, namaHari, labelHariTgl, hariKerjaSebelum } from "../../lib/pekan";
import type { MenuItem, Transaction, Variant, Kelas } from "../../types";

/* ============================================================
   PENJUALAN — Canteen Gan En (Kasir Kilat, Buku Perintah bagian 3)
   Menu 3 kolom + panel struk yang SELALU terlihat (tanpa layar
   Ringkasan). Tunai = langsung tercatat Lunas, bisa diurungkan 5 detik
   (Urungkan = tandai Dibatalkan / soft-delete, TIDAK menghapus).
   Tagihan = pilih nama dari riwayat (satu ketukan) atau "Anak baru".
   Auto catat Tanggal+Waktu. Snapshot harga saat transaksi.
   ============================================================ */

interface CartLine {
  key: string;
  menuId: string;
  name: string;
  variant: string | null;
  price: number;
  qty: number;
}

type Cust = { nama: string; tingkat: string; kelas: string; wa: string };
type Snack = { msg: string; ok: boolean; undo: () => void };

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export default function Penjualan({
  menus,
  transactions,
  kelasList,
  menuHarian,
  menuHarianReady,
  onLoadDate,
  onTransaction,
  onCancelTransaction,
}: {
  menus: MenuItem[];
  transactions: Transaction[];
  kelasList: Kelas[];
  menuHarian: Record<string, MenuItem[] | null>;
  menuHarianReady: boolean;
  onLoadDate: (tanggal: string) => void;
  onTransaction: (tx: Transaction) => void | Promise<void>;
  /** Urungkan = tandai Dibatalkan (soft-delete), bukan hapus permanen. */
  onCancelTransaction: (id: string) => void;
}) {
  /* Tanggal kerja Penjualan — TERPISAH dari sesi PO. Default hari ini;
     dipilih mundur untuk input OTS susulan. */
  const todayIso = todayISO();
  const kunciTgl = "ganen_tgl_penjualan";
  const tglTersimpan = (): string | null => {
    try {
      const v = JSON.parse(localStorage.getItem(kunciTgl) || "null");
      if (v && v.hari === todayIso && typeof v.tgl === "string" && v.tgl <= todayIso) return v.tgl;
    } catch { /* tanpa penyimpanan: kembali ke hari ini */ }
    return null;
  };
  const [txDate, setTxDateState] = useState(() => tglTersimpan() || todayIso);
  const setTxDate = (tgl: string) => {
    setTxDateState(tgl);
    try { localStorage.setItem(kunciTgl, JSON.stringify({ hari: todayIso, tgl })); } catch { /* abaikan */ }
  };
  const isBackdate = txDate !== todayIso;
  const perhatianTgl = isBackdate || isAkhirPekan(txDate);
  const kunciTanya = `ganen_tanya_tgl_${todayIso}`;
  const [tanyaTgl, setTanyaTgl] = useState(() => {
    if (!isAkhirPekan(todayIso) || tglTersimpan()) return false;
    try { return sessionStorage.getItem(kunciTanya) !== "1"; } catch { return true; }
  });
  const jawabTgl = (tgl: string) => {
    try { sessionStorage.setItem(kunciTanya, "1"); } catch { /* tanya lagi di muat ulang */ }
    setTxDate(tgl);
    setTanyaTgl(false);
  };
  const snapTx = menuHarian[txDate];
  useEffect(() => {
    if (isBackdate && menuHarianReady && snapTx === undefined) onLoadDate(txDate);
  }, [txDate, isBackdate, menuHarianReady, snapTx, onLoadDate]);
  const pakaiSnapshot = isBackdate && menuHarianReady && !!snapTx;
  const sourceMenus = pakaiSnapshot ? (snapTx as MenuItem[]) : menus;

  const sales = useMemo(() => sourceMenus.filter((m) => m.channels.sales), [sourceMenus]);
  const cats = useMemo(
    () => ["Semua", ...Array.from(new Set(sales.map((m) => m.category))).sort((a, b) => a.localeCompare(b, "id"))],
    [sales]
  );

  const [cat, setCat] = useState("Semua");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [variantFor, setVariantFor] = useState<MenuItem | null>(null);
  const [billing, setBilling] = useState<null | "baru">(null);
  const [saranTertutup, setSaranTertutup] = useState(false);
  const [form, setForm] = useState({ nama: "", tingkat: "", kelas: "", wa: "" });
  const [tried, setTried] = useState(false);
  const [snack, setSnack] = useState<Snack | null>(null);
  const [cartUndo, setCartUndo] = useState<{ type: "line"; line: CartLine } | { type: "all"; cart: CartLine[] } | null>(null);

  useEffect(() => {
    if (!snack) return;
    const id = setTimeout(() => setSnack(null), 5000);
    return () => clearTimeout(id);
  }, [snack]);
  useEffect(() => {
    if (!cartUndo) return;
    const id = setTimeout(() => setCartUndo(null), 5000);
    return () => clearTimeout(id);
  }, [cartUndo]);

  /* Tinggi panel struk diukur supaya petak menu terakhir tidak tertutup. */
  const kosong = cart.length === 0;
  const [panelH, setPanelH] = useState(150);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = panelRef.current;
    if (kosong || !el) { setPanelH(0); return; }
    const ro = new ResizeObserver(() => setPanelH(el.offsetHeight));
    ro.observe(el);
    setPanelH(el.offsetHeight);
    return () => ro.disconnect();
  }, [kosong]);

  const filtered = useMemo(
    () => sales.filter((m) => (cat === "Semua" || m.category === cat) && m.name.toLowerCase().includes(q.toLowerCase())),
    [sales, cat, q]
  );

  const count = cart.reduce((s, l) => s + l.qty, 0);
  const total = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const qtyOf = (menuId: string) => cart.filter((l) => l.menuId === menuId).reduce((s, l) => s + l.qty, 0);

  const addLine = (menu: MenuItem, variant?: Variant) => {
    const key = menu.id + (variant ? ":" + variant.id : "");
    const price = variant ? variant.price : (menu.price ?? 0);
    setCart((c) => {
      const i = c.findIndex((l) => l.key === key);
      if (i >= 0) { const n = [...c]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; }
      return [...c, { key, menuId: menu.id, name: menu.name, variant: variant?.name || null, price, qty: 1 }];
    });
  };
  const tapMenu = (menu: MenuItem) => (menu.variants.length ? setVariantFor(menu) : addLine(menu));
  /** Minus pada jumlah 1 = hapus baris LEWAT jalur Undo (bukan hilang senyap). */
  const changeQty = (key: string, d: number) => {
    const line = cart.find((l) => l.key === key);
    if (line && line.qty + d <= 0) { removeCartLine(key); return; }
    setCart((c) => c.map((l) => (l.key === key ? { ...l, qty: l.qty + d } : l)));
  };
  const removeCartLine = (key: string) => {
    const line = cart.find((l) => l.key === key);
    if (!line) return;
    setCart((c) => c.filter((l) => l.key !== key));
    setCartUndo({ type: "line", line });
  };
  const clearCart = () => {
    if (cart.length === 0) return;
    setCartUndo({ type: "all", cart });
    setCart([]);
  };
  const undoCart = () => {
    if (!cartUndo) return;
    if (cartUndo.type === "line") setCart((c) => [...c, cartUndo.line]);
    else setCart(cartUndo.cart);
    setCartUndo(null);
  };

  const kelasNeeded = form.tingkat !== "" && form.tingkat !== NO_KELAS_TINGKAT;
  const kelasOptions = kelasList.filter((k) => k.tingkat === form.tingkat);

  /* Pelanggan dikenal dari riwayat transaksi. Dedupe per (nama, kelas) — dua
     anak beda kelas dengan nama sama tampil TERPISAH. Utang = total transaksi
     belum lunas (tidak dibatalkan) milik pasangan itu. */
  const knownCustomers = useMemo(() => {
    const map = new Map<string, { nama: string; wa: string; tingkat: string; kelas: string; terakhir: string; utang: number }>();
    [...transactions]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .forEach((tx) => {
        const nama = tx.customer.nama.trim();
        if (!nama) return;
        const key = `${nama.toLowerCase()}|${(tx.customer.kelas || "").toLowerCase()}`;
        if (!map.has(key)) {
          map.set(key, {
            nama, wa: tx.customer.wa || "", tingkat: tx.customer.tingkat || "",
            kelas: tx.customer.kelas || "",
            terakhir: tx.serviceDate || tx.createdAt.slice(0, 10), utang: 0,
          });
        }
        if (!tx.paid && !tx.cancelledAt) map.get(key)!.utang += tx.total;
      });
    return Array.from(map.values());
  }, [transactions]);

  /* Alur lama: ketik nama, saran dari riwayat muncul; ketuk saran = isi nama, tingkat, kelas, WA sekaligus; lalu Simpan. */
  const namaQ = form.nama.trim().toLowerCase();
  const saranNama = useMemo(() => {
    if (saranTertutup || namaQ.length < 2) return [];
    return knownCustomers.filter((c) => c.nama.toLowerCase().includes(namaQ)).slice(0, 5);
  }, [knownCustomers, namaQ, saranTertutup]);
  const pilihSaran = (c: { nama: string; wa: string; tingkat: string; kelas: string }) => {
    setForm({ nama: c.nama, tingkat: c.tingkat, kelas: c.kelas, wa: c.wa });
    setSaranTertutup(true);
  };
  /** Isi otomatis kolom KOSONG hanya bila nama persis cocok dengan TEPAT SATU pelanggan; nama kembar beda kelas dipilih lewat saran. */
  const namaBerubah = (nama: string) => {
    setSaranTertutup(false);
    const m = knownCustomers.filter((c) => c.nama.toLowerCase() === nama.trim().toLowerCase());
    setForm((f) => m.length === 1
      ? { nama, tingkat: f.tingkat || m[0].tingkat, kelas: f.kelas || m[0].kelas, wa: f.wa || m[0].wa }
      : { ...f, nama });
  };

  const commit = (paid: boolean, customer?: Cust) => {
    if (cart.length === 0) return;
    const savedCart = cart;
    const tx: Transaction = {
      id: uid(),
      source: "penjualan",
      paid,
      customer: customer
        ? { nama: customer.nama, tingkat: customer.tingkat, kelas: customer.kelas, wa: customer.wa || undefined }
        : { nama: "", kelas: "" },
      createdAt: new Date().toISOString(),
      label: nowLabel(),
      serviceDate: txDate,
      items: cart.map((l) => ({ name: l.name, variant: l.variant, price: l.price, qty: l.qty })),
      total,
    };
    const inserted = Promise.resolve(onTransaction(tx)).catch(() => {});
    setCart([]); setBilling(null); setForm({ nama: "", tingkat: "", kelas: "", wa: "" }); setTried(false);
    const utk = isBackdate ? ` untuk ${serviceDateLabel(txDate)}` : "";
    /* Urungkan = tunggu simpan selesai, lalu tandai Dibatalkan (soft-delete) dan kembalikan keranjang. */
    const undo = () => {
      inserted.then(() => onCancelTransaction(tx.id));
      setCart(savedCart);
      setSnack(null);
    };
    setSnack(paid
      ? { ok: true, msg: `Lunas · ${rupiah(tx.total)}${utk}`, undo }
      : { ok: false, msg: `Tagihan${utk} · ${customer?.nama} (${customer?.kelas || customer?.tingkat})`, undo });
  };
  const submitBaru = () => {
    if (!form.nama.trim() || !form.tingkat || (kelasNeeded && !form.kelas)) { setTried(true); return; }
    commit(false, { ...form, kelas: kelasNeeded ? form.kelas : "" });
  };

  // Petak 3 kolom, tinggi tetap, TANPA border; harga singkat "12K" / "5K–15K".
  const hargaK = (n: number) => (n % 1000 === 0 ? `${n / 1000}K` : rupiah(n));
  const hargaSingkat = (m: MenuItem) => {
    const ps = (m.variants.length > 0 ? m.variants.map((v) => v.price) : [m.price]).filter((x): x is number => typeof x === "number");
    if (ps.length === 0) return m.variants.length > 0 ? `${m.variants.length} varian` : "—";
    const lo = Math.min(...ps), hi = Math.max(...ps);
    return lo === hi ? hargaK(lo) : `${hargaK(lo)}–${hargaK(hi)}`;
  };
  const menuCard = (m: MenuItem) => {
    const inCart = qtyOf(m.id);
    return (
      <button key={m.id} onClick={() => tapMenu(m)}
        className="flex flex-col justify-between"
        style={{ position: "relative", minWidth: 0, width: "100%", height: 74, boxSizing: "border-box", textAlign: "left", cursor: "pointer", background: inCart ? t.primaryLight : t.surface, border: "none", borderRadius: 14, padding: "8px 9px", fontFamily: "inherit", color: t.text }}>
        {inCart > 0 && (
          <span style={{ position: "absolute", top: -6, right: -4, minWidth: 22, height: 22, padding: "0 6px", borderRadius: 999, background: t.text, color: t.surface, fontSize: 13, fontWeight: 700, display: "grid", placeItems: "center" }}>{inCart}</span>
        )}
        <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" }}>{toTitleCase(m.name)}</div>
        <div className="flex items-center gap-1">
          {m.variants.length > 0 && <Layers size={12} color={t.text2} style={{ flex: "none" }} />}
          <span style={{ fontSize: 13, fontWeight: 500, color: t.text2, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{hargaSingkat(m)}</span>
        </div>
      </button>
    );
  };

  const byCat: Record<string, MenuItem[]> = {};
  filtered.forEach((m) => { (byCat[m.category] = byCat[m.category] || []).push(m); });
  const sectionCats = cats.filter((c) => c !== "Semua" && byCat[c]);
  const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 };
  const tglPil = `${namaHari(txDate).slice(0, 3)}, ${parseInt(txDate.slice(8, 10), 10)} ${["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][parseInt(txDate.slice(5, 7), 10) - 1]}`;
  void isToday;

  return (
    <div style={{ background: t.bg, color: t.text, height: "100%", position: "relative", display: "flex", flexDirection: "column" }}>
      <style>{`.pos-scroll::-webkit-scrollbar{display:none}`}</style>
      {tanyaTgl && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.4)" }} />
          <div role="dialog" aria-label="Tanggal penjualan" style={{ position: "relative", background: t.surface, borderRadius: 22, width: "100%", maxWidth: 340, padding: "22px 20px 18px", boxShadow: "0 18px 50px rgba(47,42,36,.3)" }}>
            <div style={{ fontSize: 14.5, color: t.text2, fontWeight: 500 }}>Hari ini {namaHari(todayIso)}</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.2, margin: "4px 0 18px" }}>Catat untuk<br />{labelHariTgl(hariKerjaSebelum(todayIso, 1)[0])}?</div>
            <div className="flex gap-2">
              <div style={{ position: "relative", flex: 1, minWidth: 0, height: 56, borderRadius: 14, background: t.divider, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: t.text, fontWeight: 700, fontSize: 15.5 }}>
                <Calendar size={18} /> Tanggal lain
                <input type="date" max={todayIso} aria-label="Pilih tanggal lain"
                  onChange={(e) => e.target.value && jawabTgl(e.target.value)}
                  onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* picker native */ } }}
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
              </div>
              <button onClick={() => jawabTgl(hariKerjaSebelum(todayIso, 1)[0])}
                style={{ flex: 1, minWidth: 0, height: 56, borderRadius: 14, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 18, cursor: "pointer", fontFamily: "inherit" }}>
                Ya
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ maxWidth: 460, margin: "0 auto", width: "100%", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>

        {/* Judul + pil tanggal */}
        <div style={{ padding: "20px 20px 10px", flex: "none" }}>
          <div className="flex items-center justify-between" style={{ minHeight: 44 }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>Penjualan</div>
            <div className="flex items-center" style={{ height: 44, background: perhatianTgl ? t.primaryLight : t.surface, borderRadius: 999 }}>
              <div className="flex items-center gap-2" style={{ position: "relative", height: "100%", padding: isBackdate ? "0 4px 0 14px" : "0 14px", cursor: "pointer" }}>
                <Calendar size={16} color={t.text2} />
                <span style={{ fontSize: 14, fontWeight: 600, color: t.text, whiteSpace: "nowrap" }}>{tglPil}</span>
                <input type="date" value={txDate} max={todayIso}
                  onChange={(e) => e.target.value && setTxDate(e.target.value)}
                  onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* sudah terbuka / tidak didukung */ } }}
                  aria-label="Tanggal transaksi"
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
              </div>
              {isBackdate && (
                <button onClick={() => setTxDate(todayIso)} aria-label="Kembali ke hari ini"
                  style={{ flex: "none", width: 40, height: "100%", border: "none", background: "transparent", color: t.text2, display: "grid", placeItems: "center", cursor: "pointer" }}>
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
          {isBackdate && !pakaiSnapshot && (
            <div style={{ marginTop: 4, fontSize: 13, color: t.amberText, fontWeight: 500 }}>Input susulan · memakai daftar saat ini</div>
          )}

          <div className="flex items-center gap-2" style={{ marginTop: 10, height: 44, background: t.surface, borderRadius: 12, padding: "0 12px", boxSizing: "border-box" }}>
            <Search size={18} color={t.text2} style={{ flex: "none" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari menu…" aria-label="Cari menu"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 16, width: "100%", minWidth: 0, color: t.text, fontFamily: "inherit" }} />
            {q && <X size={18} color={t.text2} style={{ cursor: "pointer", flex: "none" }} onClick={() => setQ("")} />}
          </div>

          {/* Chip kategori */}
          <div className="pos-scroll flex" style={{ gap: 8, marginTop: 10, overflowX: "auto", scrollbarWidth: "none", margin: "10px -20px 0", padding: "0 20px" }}>
            {cats.map((c) => {
              const on = c === cat;
              return (
                <button key={c} onClick={() => setCat(c)}
                  style={{ flex: "none", height: 40, padding: "0 16px", borderRadius: 999, border: "none", background: on ? t.primary : t.divider, color: t.text, fontWeight: on ? 700 : 500, fontSize: 14, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        {/* Petak menu */}
        <div className="pos-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "none", borderTop: `1px solid ${t.divider}`, padding: `14px 20px ${panelH + NAV_HEIGHT + 16}px` }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: t.text2 }}>Menu tidak ditemukan.</div>
          ) : cat === "Semua" ? (
            sectionCats.map((c) => (
              <div key={c} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.text2, margin: "2px 2px 8px" }}>{c}</div>
                <div style={grid3}>{byCat[c].map(menuCard)}</div>
              </div>
            ))
          ) : (
            <div style={grid3}>{filtered.map(menuCard)}</div>
          )}
        </div>
      </div>

      {/* Panel struk — menempel di atas bottom nav, selalu terlihat */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: NAV_HEIGHT, zIndex: 20, display: kosong ? "none" : "block", animation: "ganen-naik .2s ease-out" }}>
        <style>{`@keyframes ganen-naik{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}`}</style>
        <div ref={panelRef} style={{ maxWidth: 460, margin: "0 auto", background: t.surface, borderRadius: "24px 24px 0 0", boxShadow: "0 -4px 18px rgba(60,48,20,.10)", padding: "14px 20px 14px" }}>
          {kosong ? (
            <div className="flex items-center justify-between" style={{ minHeight: 40 }}>
              <span style={{ fontSize: 15, color: t.text2 }}>Ketuk menu untuk mulai</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between" style={{ minHeight: 36 }}>
                <span style={{ fontSize: 13, color: t.text2, fontWeight: 500 }}>{count} item</span>
                <button onClick={clearCart} aria-label="Kosongkan semua" className="flex items-center gap-1"
                  style={{ minHeight: 36, padding: "0 4px", background: "transparent", border: "none", color: t.text2, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                  <Trash2 size={15} /> Kosongkan
                </button>
              </div>
              <div className="pos-scroll" style={{ maxHeight: 156, overflowY: "auto", scrollbarWidth: "none" }}>
                {cart.map((l) => (
                  <div key={l.key} className="flex items-center gap-2" style={{ minHeight: 52 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, overflowWrap: "anywhere" }}>{toTitleCase(l.name)}{l.variant ? ` · ${l.variant}` : ""} <span style={{ color: t.text2, fontWeight: 500 }}>×{l.qty}</span></div>
                      <div style={{ fontSize: 13, color: t.text2, fontVariantNumeric: "tabular-nums" }}>{rupiah(l.price * l.qty)}</div>
                    </div>
                    <Stepper onMinus={() => changeQty(l.key, -1)} onPlus={() => changeQty(l.key, 1)} val={l.qty} />
                  </div>
                ))}
              </div>
              <div style={{ borderTop: `1px solid ${t.divider}`, margin: "6px 0 8px" }} />
            </>
          )}
          <div className="flex items-baseline justify-between" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 14, color: t.text2, fontWeight: 500 }}>Total</span>
            <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{rupiah(total)}</span>
          </div>
          <div className="flex gap-3">
            <button disabled={kosong} onClick={() => { setForm({ nama: "", tingkat: "", kelas: "", wa: "" }); setTried(false); setSaranTertutup(false); setBilling("baru"); }} className="flex items-center justify-center gap-2"
              style={{ flex: 1, height: 56, borderRadius: 14, border: "none", background: t.divider, color: t.text, fontWeight: 700, fontSize: 15, cursor: kosong ? "default" : "pointer", opacity: kosong ? 0.45 : 1, fontFamily: "inherit" }}>
              <Receipt size={20} /> Tagihan
            </button>
            <button disabled={kosong} onClick={() => commit(true)} className="flex items-center justify-center gap-2"
              style={{ flex: 1, height: 56, borderRadius: 14, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 16, cursor: kosong ? "default" : "pointer", opacity: kosong ? 0.45 : 1, fontFamily: "inherit" }}>
              <Wallet size={20} /> Tunai
            </button>
          </div>
        </div>
      </div>

      {/* Pilih ukuran */}
      {variantFor && (
        <Sheet onClose={() => setVariantFor(null)} title={variantFor.name}>
          <div style={{ fontSize: 13, color: t.text2, marginBottom: 12 }}>Pilih ukuran / jenis:</div>
          {variantFor.variants.map((v) => (
            <button key={v.id} onClick={() => { addLine(variantFor, v); setVariantFor(null); }} className="flex items-center justify-between" style={{ width: "100%", height: 56, marginBottom: 10, borderRadius: 14, border: "none", background: t.divider, padding: "0 16px", cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{v.name}</span>
              <span className="flex items-center gap-2" style={{ fontSize: 16, fontWeight: 600 }}>{rupiah(v.price)} <Plus size={18} color={t.text2} /></span>
            </button>
          ))}
        </Sheet>
      )}

      {/* Anak baru — form lama */}
      {billing === "baru" && (
        <Sheet onClose={() => setBilling(null)} title="Tagihan" sub={rupiah(total)}>
          <Field label="Nama Lengkap" req tried={tried} val={form.nama}>
            <input autoFocus value={form.nama} onChange={(e) => namaBerubah(e.target.value)} placeholder="Nama lengkap" style={inputStyle(tried && !form.nama.trim())} />
            {saranNama.length > 0 && (
              <div style={{ marginTop: 6, background: t.divider, borderRadius: 12, overflow: "hidden" }}>
                {saranNama.map((c) => (
                  <button key={`${c.nama.toLowerCase()}|${c.kelas.toLowerCase()}`} onClick={() => pilihSaran(c)} className="flex items-center gap-3"
                    style={{ width: "100%", minHeight: 56, padding: "6px 12px", background: "transparent", border: "none", borderBottom: `1px solid ${t.bg}`, cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: t.text }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 15.5, fontWeight: 700, overflowWrap: "anywhere" }}>{c.nama}</span>
                      <span style={{ display: "block", fontSize: 13, color: t.text2, fontFamily: STRUK_MONO }}>{c.kelas || c.tingkat || "—"}</span>
                    </span>
                    {c.utang > 0 && (
                      <span style={{ flex: "none", textAlign: "right", color: t.error, fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
                        Utang<br /><span style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(c.utang)}</span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Field>
          <Field label="Tingkat" req tried={tried} val={form.tingkat}>
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              {TINGKAT_LIST.map((tg) => {
                const on = tg === form.tingkat;
                return (
                  <button key={tg} onClick={() => setForm({ ...form, tingkat: tg, kelas: "" })}
                    style={{ height: 44, padding: "0 14px", borderRadius: 12, fontSize: 14, fontWeight: on ? 700 : 500, cursor: "pointer", border: "none", background: on ? t.primary : t.divider, color: t.text, fontFamily: "inherit" }}>
                    {tg}
                  </button>
                );
              })}
            </div>
          </Field>
          {kelasNeeded && (
            <Field label="Kelas" req tried={tried} val={form.kelas}>
              {kelasOptions.length === 0 ? (
                <div style={{ fontSize: 13, color: t.text2 }}>Belum ada kelas untuk {form.tingkat} — tambah dulu di Pengaturan → Daftar Kelas.</div>
              ) : (
                <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                  {kelasOptions.map((k) => {
                    const on = k.nama === form.kelas;
                    return (
                      <button key={k.id} onClick={() => setForm({ ...form, kelas: k.nama })}
                        style={{ height: 44, padding: "0 14px", borderRadius: 12, fontSize: 14, fontWeight: on ? 700 : 500, cursor: "pointer", border: "none", background: on ? t.primary : t.divider, color: t.text, fontFamily: "inherit" }}>
                        {k.nama}
                      </button>
                    );
                  })}
                </div>
              )}
            </Field>
          )}
          <Field label="WhatsApp">
            <input value={form.wa} onChange={(e) => setForm({ ...form, wa: e.target.value.replace(/\D/g, "") })} placeholder="08…" inputMode="numeric" style={inputStyle(false)} />
          </Field>
          <button onClick={submitBaru} className="flex items-center justify-center gap-2" style={{ width: "100%", height: 56, borderRadius: 14, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 16, cursor: "pointer", marginTop: 8, fontFamily: "inherit" }}>
            <Check size={20} /> Simpan ke Tagihan · {rupiah(total)}
          </button>
        </Sheet>
      )}

      {/* Toast gelap: Urungkan keranjang, atau hasil Tunai/Tagihan */}
      {(cartUndo || snack) && (
        <div style={{ position: "fixed", left: 20, right: 20, bottom: NAV_HEIGHT + panelH + 12, zIndex: 60, display: "flex", justifyContent: "center" }}>
          <div className="flex items-center gap-3" style={{ maxWidth: 420, width: "100%", background: t.toast, color: t.surface, borderRadius: 14, padding: "10px 10px 10px 16px", boxShadow: "0 6px 22px rgba(60,48,20,.18)" }}>
            {!cartUndo && snack && (
              <span style={{ width: 24, height: 24, borderRadius: "50%", background: snack.ok ? t.success : "rgba(255,252,247,.16)", display: "grid", placeItems: "center", flex: "none", color: "#fff" }}>
                {snack.ok ? <Check size={15} /> : <Receipt size={14} />}
              </span>
            )}
            <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, overflowWrap: "anywhere" }}>
              {cartUndo ? (cartUndo.type === "line" ? `${cartUndo.line.name} dihapus` : "Keranjang dikosongkan") : snack?.msg}
            </span>
            <button onClick={cartUndo ? undoCart : snack?.undo} className="flex items-center gap-1"
              style={{ flex: "none", minHeight: 44, padding: "0 14px", borderRadius: 10, border: "none", background: "transparent", color: t.primary, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              <Undo2 size={16} /> Urungkan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- shared bits ---- */
function Sheet({ title, sub, children, onClose }: { title: string; sub?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
      <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
        <div style={{ position: "sticky", top: 0, background: t.surface, padding: "16px 20px 12px", zIndex: 1 }} className="flex items-center gap-2">
          <div style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 800 }}>{title}</div>
          {sub && <div style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{sub}</div>}
          <button onClick={onClose} aria-label="Tutup" style={{ border: "none", background: t.divider, cursor: "pointer", color: t.text, width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center" }}><X size={18} /></button>
        </div>
        <div style={{ padding: "4px 20px 20px" }}>{children}</div>
      </div>
    </div>
  );
}
function Stepper({ onMinus, onPlus, val }: { onMinus: () => void; onPlus: () => void; val: number }) {
  const b = (bg: string): React.CSSProperties => ({ width: 40, height: 40, borderRadius: 999, border: "none", background: bg, color: t.text, cursor: "pointer", display: "grid", placeItems: "center" });
  return (
    <div className="flex items-center gap-1" style={{ flex: "none" }}>
      <button onClick={onMinus} aria-label="Kurangi" style={b(t.divider)}><Minus size={16} /></button>
      <span style={{ minWidth: 28, textAlign: "center", fontWeight: 700, fontSize: 16 }}>{val}</span>
      <button onClick={onPlus} aria-label="Tambah" style={b(t.primary)}><Plus size={16} /></button>
    </div>
  );
}
const inputStyle = (err: boolean): React.CSSProperties => ({
  width: "100%", height: 52, fontSize: 16, color: t.text, background: t.divider,
  border: err ? `1.5px solid ${t.error}` : "none", borderRadius: 12, padding: "0 14px", outline: "none", fontFamily: "inherit",
});
function Field({ label, children, req, tried, val }: { label: string; children: React.ReactNode; req?: boolean; tried?: boolean; val?: string }) {
  const err = req && tried && !String(val || "").trim();
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{label}{req && <span style={{ color: t.error }}> *</span>}</div>
      {children}
      {err && <div style={{ fontSize: 12.5, color: t.error, marginTop: 6 }}>Wajib diisi.</div>}
    </div>
  );
}
