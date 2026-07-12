import { useMemo, useState, useEffect, useRef } from "react";
import {
  Search, X, Check, Trash2, Share2, ShoppingCart, Utensils,
  Undo2, Wallet, Settings, History, Ban, ChevronDown, ChevronUp,
} from "lucide-react";
import { t, NAV_HEIGHT } from "../../lib/theme";
import { rupiah } from "../../lib/format";
import type { Transaction } from "../../types";

/* ============================================================
   TRANSAKSI — Canteen Gan En
   Belum Dibayar: dikelompokkan per Nama + WA (auto-merge).
   Lunas: dikelompokkan per Nama + WA (terbaru di atas).
   ============================================================ */

const TINGKAT_WARNA: Record<string, string> = {
  "KB": "#D6608A", "TK A": "#7C6BAF", "TK B": "#7C6BAF",
  "SD": "#C94F4F", "SMP": "#4A7BA6", "SMA": "#6E6E6E",
  "Guru/Karyawan": "#2F2A24",
};
const tingkatColor = (tg: string) => TINGKAT_WARNA[tg] || "#2F2A24";
const BLN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const fmtTx = (iso: string) => {
  const d = new Date(iso);
  const date = `${d.getDate()} ${BLN[d.getMonth()]}`;
  const hh = d.getHours().toString().padStart(2,"0");
  const mm = d.getMinutes().toString().padStart(2,"0");
  const ss = d.getSeconds().toString().padStart(2,"0");
  return `${date} · ${hh}:${mm}:${ss}`;
};
const groupKey = (c: Transaction["customer"]) =>
  `${c.nama.toLowerCase()}|${(c.wa || "").toLowerCase()}`;

type Tab = "unpaid" | "riwayat";
type SourceFilter = "semua" | "preorder" | "penjualan";
type UndoAction = { type: "paid"; tx: Transaction } | { type: "cancel"; tx: Transaction };

export default function Tagihan({
  transactions,
  onMarkPaid,
  onUnmarkPaid,
  onCancel,
  onRestore,
  onOpenSettings,
}: {
  transactions: Transaction[];
  onMarkPaid: (id: string) => void;
  onUnmarkPaid: (id: string) => void;
  onCancel: (id: string) => void;
  onRestore: (tx: Transaction) => void;
  onOpenSettings: () => void;
}) {
  const [tab, setTab] = useState<Tab>("unpaid");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("semua");
  const [q, setQ] = useState("");
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [waDraft, setWaDraft] = useState<{ wa: string; text: string } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [highlightedTxId, setHighlightedTxId] = useState<string | null>(null);
  const prevTxIdsRef = useRef<Set<string>>(new Set());
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const WA_OPENING = "Selamat siang Ayah/Bunda. Berikut rincian transaksi di Canteen Gan En:";
  const WA_CLOSING = "Pembayaran dapat dititipkan melalui Ananda. Terima kasih.";

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
  const matchQuery = (nama: string, kelas: string, wa?: string) => {
    const ql = q.toLowerCase().trim();
    if (!ql) return true;
    return `${nama} ${kelas} ${wa || ""}`.toLowerCase().includes(ql);
  };

  const unpaid = useMemo(
    () => transactions.filter((x) => !x.paid && !x.cancelledAt && bySource(x)),
    [transactions, sourceFilter]
  );

  /* Grupkan Belum Dibayar per Nama + WA, urutkan grup: terbaru di atas */
  const groups = useMemo(() => {
    const map = new Map<string, { customer: Transaction["customer"]; txs: Transaction[]; total: number; newestAt: string }>();
    for (const tx of unpaid) {
      const c = tx.customer;
      if (!matchQuery(c.nama, c.kelas, c.wa)) continue;
      const key = groupKey(c);
      if (!map.has(key)) map.set(key, { customer: c, txs: [], total: 0, newestAt: tx.createdAt });
      const g = map.get(key)!;
      g.txs.push(tx);
      g.total += tx.total;
      if (tx.createdAt > g.newestAt) { g.newestAt = tx.createdAt; g.customer = c; }
    }
    return Array.from(map.values()).sort((a, b) => b.newestAt.localeCompare(a.newestAt));
  }, [unpaid, q]);

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);

  /* Grupkan Lunas per Nama + WA */
  const riwayatGroups = useMemo(() => {
    const done = transactions.filter(
      (x) => (x.paid || x.cancelledAt) && bySource(x) && matchQuery(x.customer.nama, x.customer.kelas, x.customer.wa)
    );
    const map = new Map<string, { customer: Transaction["customer"]; txs: Transaction[]; totalMasuk: number; newestAt: string }>();
    for (const tx of done) {
      const key = groupKey(tx.customer);
      if (!map.has(key)) map.set(key, { customer: tx.customer, txs: [], totalMasuk: 0, newestAt: tx.createdAt });
      const g = map.get(key)!;
      g.txs.push(tx);
      if (tx.paid && !tx.cancelledAt) g.totalMasuk += tx.total;
      if (tx.createdAt > g.newestAt) g.newestAt = tx.createdAt;
    }
    for (const g of map.values()) g.txs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return Array.from(map.values()).sort((a, b) => b.newestAt.localeCompare(a.newestAt));
  }, [transactions, sourceFilter, q]);

  const historyMasuk = riwayatGroups.reduce((s, g) => s + g.totalMasuk, 0);

  const markPaid = (tx: Transaction) => { onMarkPaid(tx.id); setUndo({ type: "paid", tx }); };
  const cancel = (tx: Transaction) => { onCancel(tx.id); setUndo({ type: "cancel", tx }); };
  const doUndo = () => {
    if (!undo) return;
    if (undo.type === "paid") onUnmarkPaid(undo.tx.id);
    else onRestore(undo.tx);
    setUndo(null);
  };

  const buildWaMsg = (g: { customer: Transaction["customer"]; txs: Transaction[]; total: number }) => {
    const lines = g.txs.map((tx) => {
      const itemLine = tx.items.map((it) => `  • ${it.name}${it.variant ? ` (${it.variant})` : ""} ×${it.qty} = ${rupiah(it.price * it.qty)}`).join("\n");
      const label = tx.label ? `[${tx.label}]\n` : "";
      return `${label}${itemLine}`;
    }).join("\n\n");
    return `${WA_OPENING}\n\nNama: ${g.customer.nama}\nTingkat/Kelas: ${g.customer.kelas}\n\n${lines}\n\nTotal: ${rupiah(g.total)}\n\n${WA_CLOSING}`;
  };
  const shareWA = (g: { customer: Transaction["customer"]; txs: Transaction[]; total: number }) => {
    const wa = g.customer.wa?.replace(/\D/g, "");
    if (!wa) { setToast("Nomor WhatsApp belum ada untuk murid ini."); return; }
    setWaDraft({ wa: wa.startsWith("0") ? "62" + wa.slice(1) : wa, text: buildWaMsg(g) });
  };
  const sendWA = () => {
    if (!waDraft) return;
    window.open(`https://wa.me/${waDraft.wa}?text=${encodeURIComponent(waDraft.text)}`, "_blank");
    setWaDraft(null);
  };

  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 90px" }}>

        {/* Header sticky */}
        <div style={{ padding: "20px 20px 10px", position: "sticky", top: 0, background: t.bg, zIndex: 5 }}>
          <div className="flex items-end justify-between">
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>Transaksi</div>
            <div className="flex items-center gap-3">
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: t.text2, fontWeight: 600 }}>{tab === "unpaid" ? "Total Belum Dibayar" : "Masuk (Lunas)"}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: tab === "unpaid" ? t.amberText : t.successText }}>
                  {rupiah(tab === "unpaid" ? grandTotal : historyMasuk)}
                </div>
              </div>
              <button onClick={onOpenSettings} aria-label="Pengaturan"
                style={{ width: 40, height: 40, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}>
                <Settings size={18} />
              </button>
            </div>
          </div>

          <div className="flex" style={{ marginTop: 14, background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 12, padding: 3 }}>
            <button onClick={() => setTab("unpaid")} className="flex items-center justify-center gap-1.5"
              style={{ flex: 1, height: 38, borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13.5,
                background: tab === "unpaid" ? t.primary : "transparent", color: tab === "unpaid" ? t.text : t.text2 }}>
              <Wallet size={14} /> Belum Dibayar
            </button>
            <button onClick={() => setTab("riwayat")} className="flex items-center justify-center gap-1.5"
              style={{ flex: 1, height: 38, borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13.5,
                background: tab === "riwayat" ? t.primary : "transparent", color: tab === "riwayat" ? t.text : t.text2 }}>
              <History size={14} /> Lunas
            </button>
          </div>

          <div className="flex items-center gap-2" style={{ marginTop: 10, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "0 12px", height: 48 }}>
            <Search size={20} color={t.text2} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, kelas, atau WhatsApp…"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 15, width: "100%", color: t.text, fontFamily: "inherit" }} />
            {q && <X size={18} color={t.text2} style={{ cursor: "pointer" }} onClick={() => setQ("")} />}
          </div>

          <div className="flex gap-2" style={{ marginTop: 10 }}>
            {([["semua", "Semua"], ["preorder", "Pre-order"], ["penjualan", "Penjualan"]] as const).map(([val, label]) => {
              const on = sourceFilter === val;
              return (
                <button key={val} onClick={() => setSourceFilter(val)}
                  style={{ flex: 1, height: 36, borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
                    border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, color: on ? t.amberText : t.text2 }}>
                  {label}
                </button>
              );
            })}
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
                        <span style={{ background: tingkatColor(g.customer.tingkat || ""), color: "#FFFCF7", padding: "2px 10px", borderRadius: 999, fontSize: 13, fontWeight: 800, flex: "none" }}>
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
                          <span style={{ fontSize: 12, fontWeight: 600, color: t.text2 }}>{fmtTx(tx.createdAt)}</span>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: t.text2 }}>{rupiah(tx.total)}</span>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        {tx.items.map((it, i) => (
                          <div key={i} style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.65 }}>
                            {it.name}{it.variant ? ` (${it.variant})` : ""} ×{it.qty}
                          </div>
                        ))}
                        {tx.waktuAmbil && (
                          <div style={{ fontSize: 13, color: t.text2, marginTop: 4 }}>{tx.waktuAmbil}</div>
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

                  {/* Footer aksi */}
                  <div className="flex gap-2" style={{ padding: "12px 16px", borderTop: `1px solid ${t.divider}` }}>
                    <button onClick={() => shareWA(g)} className="flex items-center justify-center gap-2"
                      style={{ flex: 1, height: 48, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                      <Share2 size={17} /> Bagikan WA
                    </button>
                    <button onClick={() => g.txs.forEach(markPaid)} className="flex items-center justify-center gap-2"
                      style={{ flex: 1, height: 48, borderRadius: 12, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                      <Wallet size={17} /> Lunaskan Semua
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ---- Tab: Lunas ---- */}
        {tab === "riwayat" && (
          <div style={{ padding: "4px 20px" }}>
            {riwayatGroups.length === 0 ? (
              <div style={{ textAlign: "center", padding: "56px 20px" }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, background: t.surfaceSoft, color: t.text2, display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
                  <History size={28} />
                </div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{q ? "Tidak ditemukan" : "Belum ada riwayat"}</div>
                <div style={{ fontSize: 14, color: t.text2, marginTop: 6 }}>{q ? "Coba kata kunci lain." : "Transaksi Lunas & Dibatalkan akan muncul di sini."}</div>
              </div>
            ) : riwayatGroups.map((g) => (
              <div key={groupKey(g.customer)} style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 16, marginBottom: 14, overflow: "hidden" }}>
                {/* Header nama */}
                <div style={{ padding: "14px 16px 10px" }}>
                  <div className="flex items-center justify-between" style={{ gap: 10 }}>
                    <div className="flex items-center gap-2" style={{ flexWrap: "wrap", flex: 1 }}>
                      <span style={{ fontSize: 17, fontWeight: 800 }}>{g.customer.nama}</span>
                      <span style={{ background: tingkatColor(g.customer.tingkat || ""), color: "#FFFCF7", padding: "2px 10px", borderRadius: 999, fontSize: 13, fontWeight: 800, flex: "none" }}>
                        {g.customer.kelas || g.customer.tingkat}
                      </span>
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 800, color: t.successText, flex: "none" }}>{rupiah(g.totalMasuk)}</span>
                  </div>
                  {g.customer.wa && <div style={{ fontSize: 13, color: t.text2, marginTop: 3 }}>{g.customer.wa}</div>}
                </div>
                {/* Per transaksi */}
                {g.txs.map((tx) => {
                  const cancelled = !!tx.cancelledAt;
                  return (
                    <div key={tx.id} style={{ padding: "10px 16px 12px", borderTop: `1px solid ${t.divider}`, background: t.surfaceSoft, opacity: cancelled ? 0.68 : 1 }}>
                      <div className="flex items-center gap-2" style={{ marginBottom: 6, flexWrap: "wrap" }}>
                        <StatusTag ok={!cancelled} />
                        <SourceTag source={tx.source} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: t.text2 }}>{fmtTx(tx.createdAt)}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, marginLeft: "auto", textDecoration: cancelled ? "line-through" : "none", color: cancelled ? t.text2 : t.text }}>
                          {rupiah(tx.total)}
                        </span>
                      </div>
                      {tx.items.map((it, i) => (
                        <div key={i} style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.65, color: cancelled ? t.text2 : t.text }}>
                          {it.name}{it.variant ? ` (${it.variant})` : ""} ×{it.qty}
                        </div>
                      ))}
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
