import { useMemo, useState, useEffect } from "react";
import {
  Search, X, Plus, Minus, ShoppingCart, Check, Receipt,
  Layers, ChevronRight, Wallet, Settings, Trash2, Undo2, Calendar,
} from "lucide-react";
import { t, NAV_HEIGHT } from "../../lib/theme";
import { rupiah, uid, nowLabel, priceLabel, todayISO, serviceDateLabel } from "../../lib/format";
import { TINGKAT_LIST, NO_KELAS_TINGKAT, tingkatColor } from "../../lib/constants";
import type { MenuItem, Transaction, Variant, Kelas } from "../../types";

/* ============================================================
   PENJUALAN — Canteen Gan En (POS tenang)
   Decision Lock §6: hanya menu channel Penjualan, alur
   Pilih Menu → Ringkasan → Dibayar / Masuk Tagihan.
   Popup Tagihan: Nama Siswa*, Kelas*, WhatsApp (opsional).
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
  onOpenSettings,
}: {
  menus: MenuItem[];
  transactions: Transaction[];
  kelasList: Kelas[];
  menuHarian: Record<string, MenuItem[] | null>;
  menuHarianReady: boolean;
  onLoadDate: (tanggal: string) => void;
  onTransaction: (tx: Transaction) => void;
  onOpenSettings: () => void;
}) {
  /* Tanggal kerja Penjualan — TERPISAH dari sesi PO. Default hari ini;
     dipilih mundur untuk input OTS susulan: daftar & harga memakai
     snapshot menu_harian tanggal itu, transaksi tercatat atas tanggal
     itu, dan sesi PO live tidak pernah tersentuh. */
  const todayIso = todayISO();
  const [txDate, setTxDate] = useState(todayIso);
  const isBackdate = txDate !== todayIso;
  const snapTx = menuHarian[txDate];
  useEffect(() => {
    if (isBackdate && menuHarianReady && snapTx === undefined) onLoadDate(txDate);
  }, [txDate, isBackdate, menuHarianReady, snapTx, onLoadDate]);
  const pakaiSnapshot = isBackdate && menuHarianReady && !!snapTx;
  const sourceMenus = pakaiSnapshot ? (snapTx as MenuItem[]) : menus;

  const sales = useMemo(() => sourceMenus.filter((m) => m.channels.sales), [sourceMenus]);
  // "Semua" tetap di atas; sisanya A-Z supaya gampang dicari di rail panjang
  const cats = useMemo(
    () => ["Semua", ...Array.from(new Set(sales.map((m) => m.category))).sort((a, b) => a.localeCompare(b, "id"))],
    [sales]
  );
  /** Label singkat KHUSUS tampilan rail (data kategori asli tidak berubah,
   * filter tetap mencocokkan m.category) — "Nasi Goreng" kepanjangan dan
   * jadi dua baris di kolom sempit. */
  const railLabel = (c: string) => (c === "Nasi Goreng" ? "Nasgor" : c);

  const [cat, setCat] = useState("Semua");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [view, setView] = useState<"shop" | "summary">("shop");
  const [variantFor, setVariantFor] = useState<MenuItem | null>(null);
  const [billing, setBilling] = useState(false);
  const [form, setForm] = useState({ nama: "", tingkat: "", kelas: "", wa: "" });
  const [tried, setTried] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [cartUndo, setCartUndo] = useState<{ type: "line"; line: CartLine } | { type: "all"; cart: CartLine[] } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!cartUndo) return;
    const id = setTimeout(() => setCartUndo(null), 5000);
    return () => clearTimeout(id);
  }, [cartUndo]);

  /* Statistik mengikuti tanggal OPERASIONAL (serviceDate jika ada,
     jatuh ke tanggal input untuk transaksi lama) — transaksi susulan
     masuk rekap tanggal operasionalnya, bukan tanggal diketiknya. */
  const { todayCount, todaySum } = useMemo(() => {
    const opMatch = (tx: Transaction) =>
      tx.serviceDate ? tx.serviceDate === txDate : (txDate === todayIso && isToday(tx.createdAt));
    const list = transactions.filter((tx) => tx.source === "penjualan" && opMatch(tx));
    return { todayCount: list.length, todaySum: list.reduce((s, tx) => s + tx.total, 0) };
  }, [transactions, txDate, todayIso]);

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

  /* Pelanggan dikenal dari riwayat transaksi (pre-order menyimpan nama+WA+
     tingkat+kelas). Dedupe per (nama, kelas) — dua anak beda kelas dengan
     nama sama muncul sebagai saran TERPISAH. Data terbaru per pasangan
     yang menang; tanggal transaksi terakhir ikut disimpan sebagai pembeda. */
  const knownCustomers = useMemo(() => {
    const map = new Map<string, { nama: string; wa: string; tingkat: string; kelas: string; terakhir: string }>();
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
            terakhir: tx.serviceDate || tx.createdAt.slice(0, 10),
          });
        }
      });
    return Array.from(map.values());
  }, [transactions]);

  const BLN_S = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const tglSingkat = (d: string) => `${parseInt(d.slice(8, 10), 10)} ${BLN_S[parseInt(d.slice(5, 7), 10) - 1]}`;

  const [saranTertutup, setSaranTertutup] = useState(false);
  const namaQ = form.nama.trim().toLowerCase();
  const saranNama = useMemo(() => {
    if (saranTertutup || namaQ.length < 2) return [];
    return knownCustomers.filter((c) => c.nama.toLowerCase().includes(namaQ)).slice(0, 5);
  }, [knownCustomers, namaQ, saranTertutup]);

  const pilihSaran = (c: { nama: string; wa: string; tingkat: string; kelas: string }) => {
    setForm({ nama: c.nama, tingkat: c.tingkat, kelas: c.kelas, wa: c.wa });
    setSaranTertutup(true);
  };

  /** Isi-otomatis kolom KOSONG hanya saat nama persis cocok dengan TEPAT SATU
   * pelanggan — nama kembar beda kelas dibiarkan dipilih lewat saran. */
  const namaBerubah = (nama: string) => {
    setSaranTertutup(false);
    const matches = knownCustomers.filter((c) => c.nama.toLowerCase() === nama.trim().toLowerCase());
    setForm((f) => matches.length === 1
      ? { nama, tingkat: f.tingkat || matches[0].tingkat, kelas: f.kelas || matches[0].kelas, wa: f.wa || matches[0].wa }
      : { ...f, nama });
  };

  const commit = (paid: boolean, customer?: { nama: string; tingkat: string; kelas: string; wa: string }) => {
    const tx: Transaction = {
      id: uid(),
      source: "penjualan",
      paid,
      customer: customer
        ? { nama: customer.nama, tingkat: customer.tingkat, kelas: customer.kelas, wa: customer.wa || undefined }
        : { nama: "", kelas: "" },
      createdAt: new Date().toISOString(),
      label: nowLabel(),
      // Tanggal operasional transaksi — untuk input susulan = tanggal lampau
      serviceDate: txDate,
      items: cart.map((l) => ({ name: l.name, variant: l.variant, price: l.price, qty: l.qty })),
      total,
    };
    onTransaction(tx);
    setCart([]); setView("shop"); setBilling(false); setForm({ nama: "", tingkat: "", kelas: "", wa: "" }); setTried(false);
    const utk = isBackdate ? ` untuk ${serviceDateLabel(txDate)}` : "";
    setToast(paid ? { ok: true, msg: `Penjualan dicatat${utk} — ${rupiah(total)} · Lunas` }
                   : { ok: false, msg: `Masuk Tagihan${utk} — ${customer?.nama} (${customer?.kelas || customer?.tingkat})` });
  };
  const submitTagihan = () => {
    if (!form.nama.trim() || !form.tingkat || (kelasNeeded && !form.kelas)) { setTried(true); return; }
    commit(false, { ...form, kelas: kelasNeeded ? form.kelas : "" });
  };

  // Kartu menu — tinggi TETAP (bukan persegi penuh; rata-rata nama menu
  // cuma 1-2 baris jadi persegi 1:1 kemarin kebanyakan ruang kosong).
  // Semua kartu tetap seragam karena height fixed, bukan lagi ikut
  // panjang nama seperti sebelumnya.
  const menuCard = (m: MenuItem) => {
    const inCart = qtyOf(m.id);
    return (
      <button key={m.id} onClick={() => tapMenu(m)}
        className="flex flex-col justify-between"
        style={{ position: "relative", textAlign: "left", cursor: "pointer", background: inCart ? t.surfaceSoft : t.surface, border: `1.5px solid ${inCart ? t.primary : t.border}`, borderRadius: 16, padding: 14, height: 110, gap: 6 }}>
        {inCart > 0 && (
          <span style={{ position: "absolute", top: -10, right: -8, minWidth: 30, height: 30, padding: "0 8px", borderRadius: 999, background: t.primary, color: t.text, fontSize: 15, fontWeight: 800, display: "grid", placeItems: "center", boxShadow: "0 1px 3px rgba(47,42,36,.2)" }}>{inCart}</span>
        )}
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.name}</div>
        <div className="flex items-center gap-1">
          {m.variants.length > 0 && <Layers size={13} color={t.amberText} />}
          <span style={{ fontSize: 13.5, fontWeight: 700, color: t.text2, fontVariantNumeric: "tabular-nums" }}>{priceLabel(m)}</span>
        </div>
      </button>
    );
  };

  // Kelompokkan hasil filter per kategori admin — untuk tampilan "Semua".
  const byCat: Record<string, MenuItem[]> = {};
  filtered.forEach((m) => { (byCat[m.category] = byCat[m.category] || []).push(m); });
  const sectionCats = cats.filter((c) => c !== "Semua" && byCat[c]);

  return (
    <div style={{ background: t.bg, color: t.text, height: "100%", position: "relative", display: "flex", flexDirection: "column" }}>
      <style>{`.pos-scroll::-webkit-scrollbar{display:none}`}</style>
      <div style={{ maxWidth: 460, margin: "0 auto", width: "100%", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>

        {/* Header — selalu terlihat; hanya dua kolom di bawah yang scroll */}
        <div style={{ padding: "20px 20px 0", flex: "none" }}>
          <div className="flex items-center justify-between">
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>Penjualan</div>
            <div className="flex items-center gap-2">
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10.5, color: t.text2, fontWeight: 600 }}>{isBackdate ? serviceDateLabel(txDate) : "Hari ini"}</div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{todayCount}× · {rupiah(todaySum)}</div>
              </div>
              <button
                onClick={onOpenSettings}
                aria-label="Pengaturan"
                style={{ width: 36, height: 36, borderRadius: 11, border: `1px solid ${t.border}`, background: t.surface, color: t.text2, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}
              >
                <Settings size={16} />
              </button>
            </div>
          </div>

          {/* Satu baris: tanggal transaksi (input OTS susulan) + cari.
              Chip tanggal MENTOK KIRI (margin negatif menutup padding header)
              supaya sejajar tepat dengan tepi kiri rail kategori di
              bawahnya — bukan dengan judul/pencarian di atasnya.
              Seluruh area tanggal diketuk via input date overlay inset:0 */}
          <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
            <div className="flex items-center gap-1"
              style={{ position: "relative", flex: "none", height: 42, marginLeft: -20, padding: "0 12px 0 20px", borderRadius: "0 11px 11px 0", cursor: "pointer",
                background: isBackdate ? "#FFF4DA" : t.surface, border: `1px solid ${isBackdate ? t.primary : t.border}`, borderLeft: "none" }}>
              <Calendar size={14} color={t.amberText} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: isBackdate ? t.amberText : t.text2, whiteSpace: "nowrap" }}>
                {isBackdate ? txDate.slice(8, 10) + "/" + txDate.slice(5, 7) : "Hari Ini"}
              </span>
              <input type="date" value={txDate} max={todayIso}
                onChange={(e) => e.target.value && setTxDate(e.target.value)}
                aria-label="Tanggal transaksi"
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
            </div>
            <div className="flex items-center gap-2" style={{ flex: 1, background: t.surfaceSoft, border: `1px solid ${t.divider}`, borderRadius: 11, padding: "0 12px", height: 42 }}>
              <Search size={16} color={t.textDis} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari menu…"
                style={{ border: "none", outline: "none", background: "transparent", fontSize: 14.5, width: "100%", color: t.text, fontFamily: "inherit" }} />
              {q && <X size={16} color={t.text2} style={{ cursor: "pointer" }} onClick={() => setQ("")} />}
            </div>
          </div>
          {isBackdate && (
            <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
              <span style={{ flex: 1, fontSize: 12, color: t.amberText, fontWeight: 600, lineHeight: 1.45 }}>
                Input susulan {serviceDateLabel(txDate)}{pakaiSnapshot ? " — menu & harga sesuai tanggal itu" : " — menu tanggal ini tidak tersimpan, memakai daftar saat ini"}
              </span>
              <button onClick={() => setTxDate(todayIso)}
                style={{ flex: "none", height: 34, padding: "0 11px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                Kembali ke Hari Ini
              </button>
            </div>
          )}
        </div>

        {/* Dua kolom: kategori kiri (diam) + grid kanan (scroll independen) */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", marginTop: 12 }}>
          <div className="pos-scroll" style={{ width: 100, flex: "none", overflowY: "auto", scrollbarWidth: "none", borderRight: `1px solid ${t.divider}`, paddingBottom: 110 }}>
            {cats.map((c) => {
              const on = c === cat;
              return (
                <button key={c} onClick={() => setCat(c)}
                  style={{ display: "block", width: "100%", padding: "14px 6px 14px 20px", background: on ? t.primaryLight : "transparent",
                    border: "none", borderLeft: `3px solid ${on ? t.primary : "transparent"}`,
                    color: on ? t.amberText : t.text2, fontWeight: on ? 800 : 600, fontSize: 12.5,
                    textAlign: "left", lineHeight: 1.25, cursor: "pointer", fontFamily: "inherit",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {railLabel(c)}
                </button>
              );
            })}
          </div>

          <div className="pos-scroll" style={{ flex: 1, minWidth: 0, overflowY: "auto", scrollbarWidth: "none", padding: "12px 20px 110px 12px" }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: t.text2 }}>Menu tidak ditemukan.</div>
            ) : cat === "Semua" ? (
              sectionCats.map((c) => (
                <div key={c} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: t.text2, margin: "2px 2px 8px" }}>{c}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {byCat[c].map(menuCard)}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {filtered.map(menuCard)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky total bar */}
      {count > 0 && view === "shop" && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: NAV_HEIGHT, padding: "12px 20px 18px", background: "linear-gradient(transparent, " + t.bg + " 22%)" }}>
          <div style={{ maxWidth: 460, margin: "0 auto" }} className="flex items-center gap-3">
            <button onClick={() => setView("summary")} className="flex items-center justify-between" style={{ flex: 1, height: 58, borderRadius: 16, border: "none", cursor: "pointer", background: t.primary, color: t.text, padding: "0 18px", boxShadow: "0 6px 20px rgba(253,184,51,.4)" }}>
              <span className="flex items-center gap-2" style={{ fontWeight: 700, fontSize: 15 }}><ShoppingCart size={20} /> {count} item</span>
              <span className="flex items-center gap-2" style={{ fontWeight: 800, fontSize: 18 }}>{rupiah(total)} <ChevronRight size={20} /></span>
            </button>
          </div>
        </div>
      )}

      {/* Variant picker */}
      {variantFor && (
        <Sheet onClose={() => setVariantFor(null)} title={variantFor.name}>
          <div style={{ fontSize: 13, color: t.text2, marginBottom: 12 }}>Pilih ukuran / jenis:</div>
          {variantFor.variants.map((v) => (
            <button key={v.id} onClick={() => { addLine(variantFor, v); setVariantFor(null); }} className="flex items-center justify-between" style={{ width: "100%", height: 56, marginBottom: 10, borderRadius: 14, border: `1.5px solid ${t.border}`, background: t.surface, padding: "0 16px", cursor: "pointer" }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{v.name}</span>
              <span className="flex items-center gap-2" style={{ fontSize: 16, fontWeight: 700 }}>{rupiah(v.price)} <Plus size={18} color={t.amberText} /></span>
            </button>
          ))}
        </Sheet>
      )}

      {/* Ringkasan */}
      {view === "summary" && (
        <Sheet onClose={() => setView("shop")} title="Ringkasan Pesanan">
          {cart.map((l) => (
            <div key={l.key} className="flex items-center gap-3" style={{ padding: "12px 0", borderBottom: `1px solid ${t.divider}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{l.name}{l.variant ? ` · ${l.variant}` : ""}</div>
                <div style={{ fontSize: 13, color: t.text2, marginTop: 2 }}>{rupiah(l.price)}</div>
              </div>
              {/* Minus di jumlah 1 = hapus (dengan Urungkan) — tanpa tombol sampah terpisah */}
              <Stepper onMinus={() => changeQty(l.key, -1)} onPlus={() => changeQty(l.key, 1)} val={l.qty} />
              <div style={{ width: 68, textAlign: "right", fontWeight: 800, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{rupiah(l.price * l.qty)}</div>
            </div>
          ))}

          {cart.length > 0 && (
            <button onClick={clearCart} className="flex items-center gap-1" style={{ marginTop: 10, background: "transparent", border: "none", color: t.error, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              <Trash2 size={14} /> Kosongkan Semua
            </button>
          )}

          <div className="flex items-center justify-between" style={{ padding: "16px 0 4px" }}>
            <span style={{ fontSize: 15, color: t.text2, fontWeight: 600 }}>Total</span>
            <span style={{ fontSize: 24, fontWeight: 800 }}>{rupiah(total)}</span>
          </div>

          <div className="flex gap-3" style={{ marginTop: 14 }}>
            <button onClick={() => setBilling(true)} className="flex items-center justify-center gap-2" style={{ flex: 1, height: 56, borderRadius: 14, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              <Receipt size={20} /> Masuk Tagihan
            </button>
            <button onClick={() => commit(true)} className="flex items-center justify-center gap-2" style={{ flex: 1, height: 56, borderRadius: 14, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 16, cursor: "pointer" }}>
              <Wallet size={20} /> Dibayar
            </button>
          </div>
        </Sheet>
      )}

      {/* Popup Tagihan */}
      {billing && (
        <Sheet onClose={() => setBilling(false)} title="Masuk Tagihan">
          <div style={{ fontSize: 13, color: t.text2, marginBottom: 14 }}>Catat atas nama siapa tagihannya:</div>
          <Field label="Nama Lengkap" req tried={tried} val={form.nama}>
            <input value={form.nama} onChange={(e) => namaBerubah(e.target.value)} placeholder="Nama lengkap" style={inputStyle(tried && !form.nama.trim())} />
            {/* Saran dari riwayat transaksi — satu ketuk mengisi nama, tingkat,
                kelas, dan nomor WA sekaligus (permintaan Mama: tidak perlu
                mengetik nomor WA satu per satu lagi) */}
            {saranNama.length > 0 && (
              <div style={{ marginTop: 6, background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden" }}>
                {saranNama.map((c) => (
                  <button key={`${c.nama.toLowerCase()}|${c.kelas.toLowerCase()}`} onClick={() => pilihSaran(c)}
                    className="flex items-center gap-2"
                    style={{ width: "100%", padding: "10px 12px", background: "transparent", border: "none", borderBottom: `1px solid ${t.divider}`, cursor: "pointer", textAlign: "left" }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: t.text }}>{c.nama}</span>
                    {c.kelas && (
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#FFFCF7", background: tingkatColor(c.tingkat, c.kelas), padding: "1px 8px", borderRadius: 999, flex: "none" }}>{c.kelas}</span>
                    )}
                    <span style={{ marginLeft: "auto", textAlign: "right", flex: "none" }}>
                      <span style={{ display: "block", fontSize: 12, color: t.text2 }}>{c.wa || "tanpa WA"}</span>
                      <span style={{ display: "block", fontSize: 10.5, color: t.textDis }}>terakhir {tglSingkat(c.terakhir)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Field>
          {/* Tingkat + Kelas pakai chip standar (bukan ketik bebas) — supaya
              pil kelas di Transaksi berwarna sesuai ketentuan per tingkat */}
          <Field label="Tingkat" req tried={tried} val={form.tingkat}>
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              {TINGKAT_LIST.map((tg) => {
                const on = tg === form.tingkat;
                return (
                  <button key={tg} onClick={() => setForm({ ...form, tingkat: tg, kelas: "" })}
                    style={{ height: 44, padding: "0 14px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer",
                      border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, color: on ? t.amberText : t.text2 }}>
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
                        style={{ height: 44, padding: "0 14px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer",
                          border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, color: on ? t.amberText : t.text2 }}>
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
          <button onClick={submitTagihan} className="flex items-center justify-center gap-2" style={{ width: "100%", height: 56, borderRadius: 14, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 16, cursor: "pointer", marginTop: 8 }}>
            <Check size={20} /> Simpan ke Tagihan · {rupiah(total)}
          </button>
        </Sheet>
      )}

      {/* Undo keranjang (hapus item / kosongkan semua) */}
      {cartUndo && (
        <div style={{ position: "fixed", left: 20, right: 20, bottom: 24 + NAV_HEIGHT, zIndex: 60, display: "flex", justifyContent: "center" }}>
          <div className="flex items-center gap-3" style={{ maxWidth: 420, width: "100%", background: t.text, color: "#FBF7EF", borderRadius: 14, padding: "12px 14px 12px 18px", boxShadow: "0 14px 34px rgba(47,42,36,.3)" }}>
            <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600 }}>
              {cartUndo.type === "line" ? `${cartUndo.line.name} dihapus` : "Keranjang dikosongkan"}
            </span>
            <button onClick={undoCart} className="flex items-center gap-1" style={{ background: "transparent", border: "none", color: t.primary, fontWeight: 800, fontSize: 14.5, cursor: "pointer", padding: "8px 10px" }}>
              <Undo2 size={16} /> Urungkan
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && !cartUndo && (
        <div style={{ position: "fixed", left: 20, right: 20, bottom: 24 + NAV_HEIGHT, zIndex: 60, display: "flex", justifyContent: "center" }}>
          <div className="flex items-center gap-3" style={{ maxWidth: 420, width: "100%", background: t.text, color: "#FBF7EF", borderRadius: 14, padding: "14px 18px", boxShadow: "0 14px 34px rgba(47,42,36,.3)" }}>
            <span style={{ width: 26, height: 26, borderRadius: "50%", background: toast.ok ? t.success : t.primary, display: "grid", placeItems: "center", flex: "none", color: toast.ok ? "#fff" : t.text }}>
              {toast.ok ? <Check size={16} /> : <Receipt size={15} />}
            </span>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- shared bits ---- */
function Sheet({ title, children, onClose, leftIcon, onLeft }: {
  title: string; children: React.ReactNode; onClose: () => void; leftIcon?: React.ReactNode; onLeft?: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
      <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
        <div style={{ position: "sticky", top: 0, background: t.surface, padding: "16px 20px 12px", borderBottom: `1px solid ${t.divider}` }} className="flex items-center gap-2">
          {leftIcon && <button onClick={onLeft} style={{ border: "none", background: "transparent", cursor: "pointer", color: t.text, display: "grid", placeItems: "center" }}>{leftIcon}</button>}
          <div style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>{title}</div>
          <button onClick={onClose} style={{ border: "none", background: t.surfaceSoft, cursor: "pointer", color: t.text2, width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}
function Stepper({ onMinus, onPlus, val }: { onMinus: () => void; onPlus: () => void; val: number }) {
  const b: React.CSSProperties = { width: 34, height: 34, borderRadius: 999, border: "none", background: t.primaryLight, color: t.text, cursor: "pointer", display: "grid", placeItems: "center" };
  return (
    <div className="flex items-center gap-1" style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 999, padding: 3, flex: "none" }}>
      <button onClick={onMinus} style={b}><Minus size={16} /></button>
      <span style={{ minWidth: 20, textAlign: "center", fontWeight: 800, fontSize: 15 }}>{val}</span>
      <button onClick={onPlus} style={b}><Plus size={16} /></button>
    </div>
  );
}
const inputStyle = (err: boolean): React.CSSProperties => ({
  width: "100%", height: 52, fontSize: 16, color: t.text, background: t.surface,
  border: `1.5px solid ${err ? t.error : t.border}`, borderRadius: 12, padding: "0 14px", outline: "none", fontFamily: "inherit",
});
function Field({ label, children, req, tried, val }: { label: string; children: React.ReactNode; req?: boolean; tried?: boolean; val?: string }) {
  const err = req && tried && !String(val || "").trim();
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{label}{req && <span style={{ color: t.error }}> *</span>}</div>
      {children}
      {err && <div style={{ fontSize: 12.5, color: t.error, marginTop: 6 }}>Wajib diisi.</div>}
    </div>
  );
}
