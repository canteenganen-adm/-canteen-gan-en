import { useMemo, useState, useEffect } from "react";
import {
  Search, X, Check, Trash2, Share2, ShoppingCart, Utensils,
  Undo2, ChevronDown, ChevronUp, Wallet, Settings, History, Ban,
} from "lucide-react";
import { t, NAV_HEIGHT } from "../../lib/theme";
import { rupiah, itemsText, serviceDateLabel } from "../../lib/format";
import type { Transaction } from "../../types";

/* ============================================================
   TAGIHAN — Canteen Gan En
   Tagihan = SEMUA yang Belum Dibayar dari dua sumber (Pre-order +
   Penjualan "Masuk Tagihan"), dikelompokkan per murid (Nama+Kelas).
   Status Packing TIDAK berhubungan dengan Tagihan sama sekali.
   Pre-order = Belum Dibayar SEJAK pesanan masuk (Opsi A) — tidak
   menunggu dikemas.
   ------------------------------------------------------------
   Saklar [Belum Dibayar] [Riwayat]. Riwayat = Lunas & Dibatalkan
   (void tetap tersimpan untuk audit, bukan hard-delete — lihat
   `cancelledAt` di types.ts), dikelompokkan per Tanggal Layanan
   (preorder: serviceDate; penjualan: tanggal transaksi, karena
   sifatnya langsung/live) dengan total harian (Lunas saja, void
   tidak dihitung pemasukan).
   ============================================================ */

type Tab = "unpaid" | "riwayat";
type SourceFilter = "semua" | "preorder" | "penjualan";
type UndoAction = { type: "paid"; tx: Transaction } | { type: "cancel"; tx: Transaction };

/** Tanggal efektif untuk pengelompokan Riwayat: Tanggal Layanan untuk
 * preorder, tanggal transaksi untuk penjualan (tidak ada konsep Tanggal
 * Layanan pada penjualan langsung). */
function effectiveDate(tx: Transaction): string {
  if (tx.source === "preorder" && tx.serviceDate) return tx.serviceDate;
  return tx.createdAt.slice(0, 10);
}

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
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [waDraft, setWaDraft] = useState<{ wa: string; text: string } | null>(null);

  const WA_OPENING = "Selamat siang Ayah/Bunda. Berikut rincian transaksi di Canteen Gan En:";
  const WA_CLOSING = "Pembayaran dapat dititipkan melalui Ananda. Terima kasih.";

  useEffect(() => { if (!undo) return; const id = setTimeout(() => setUndo(null), 5000); return () => clearTimeout(id); }, [undo]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2200); return () => clearTimeout(id); }, [toast]);

  const bySource = (tx: Transaction) => sourceFilter === "semua" || tx.source === sourceFilter;
  const matchQuery = (nama: string, kelas: string, wa?: string) => {
    const ql = q.toLowerCase().trim();
    if (!ql) return true;
    return `${nama} ${kelas} ${wa || ""}`.toLowerCase().includes(ql);
  };

  // ---- Belum Dibayar: dikelompokkan per murid ----
  const unpaid = useMemo(
    () => transactions.filter((x) => !x.paid && !x.cancelledAt && bySource(x)),
    [transactions, sourceFilter]
  );

  const groups = useMemo(() => {
    const map = new Map<string, { customer: Transaction["customer"]; txs: Transaction[]; total: number }>();
    for (const tx of unpaid) {
      const c = tx.customer;
      if (!matchQuery(c.nama, c.kelas, c.wa)) continue;
      const key = `${c.nama.toLowerCase()}|${c.kelas.toLowerCase()}`;
      if (!map.has(key)) map.set(key, { customer: c, txs: [], total: 0 });
      const g = map.get(key)!; g.txs.push(tx); g.total += tx.total;
    }
    return Array.from(map.values());
  }, [unpaid, q]);

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);

  // ---- Riwayat: Lunas & Dibatalkan, dikelompokkan per Tanggal Layanan ----
  const riwayatGroups = useMemo(() => {
    const done = transactions.filter((x) => (x.paid || x.cancelledAt) && bySource(x) && matchQuery(x.customer.nama, x.customer.kelas, x.customer.wa));
    const map = new Map<string, { date: string; txs: Transaction[]; totalMasuk: number }>();
    for (const tx of done) {
      const d = effectiveDate(tx);
      if (!map.has(d)) map.set(d, { date: d, txs: [], totalMasuk: 0 });
      const g = map.get(d)!;
      g.txs.push(tx);
      if (tx.paid && !tx.cancelledAt) g.totalMasuk += tx.total;
    }
    for (const g of map.values()) g.txs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, sourceFilter, q]);

  const historyMasuk = riwayatGroups.reduce((s, g) => s + g.totalMasuk, 0);

  const markPaid = (tx: Transaction) => {
    onMarkPaid(tx.id);
    setUndo({ type: "paid", tx });
  };
  const cancel = (tx: Transaction) => {
    onCancel(tx.id);
    setUndo({ type: "cancel", tx });
  };
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
    const waFormatted = wa.startsWith("0") ? "62" + wa.slice(1) : wa;
    setWaDraft({ wa: waFormatted, text: buildWaMsg(g) });
  };
  const sendWA = () => {
    if (!waDraft) return;
    window.open(`https://wa.me/${waDraft.wa}?text=${encodeURIComponent(waDraft.text)}`, "_blank");
    setWaDraft(null);
  };

  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 90px" }}>

        {/* Header */}
        <div style={{ padding: "20px 20px 10px", position: "sticky", top: 0, background: t.bg, zIndex: 5 }}>
          <div className="flex items-end justify-between">
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>Transaksi</div>
            <div className="flex items-center gap-3">
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: t.text2, fontWeight: 600 }}>{tab === "unpaid" ? "Total Belum Dibayar" : "Masuk (Lunas)"}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: tab === "unpaid" ? t.amberText : t.successText }}>{rupiah(tab === "unpaid" ? grandTotal : historyMasuk)}</div>
              </div>
              <button
                onClick={onOpenSettings}
                aria-label="Pengaturan"
                style={{ width: 40, height: 40, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}
              >
                <Settings size={18} />
              </button>
            </div>
          </div>

          {/* Saklar Belum Dibayar / Riwayat */}
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

          {/* Pemilah sumber */}
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
            {groups.length === 0 ? (
              <Empty q={q} />
            ) : groups.map((g) => {
              const key = `${g.customer.nama}|${g.customer.kelas}`;
              const isOpen = open[key] ?? true;
              return (
                <div key={key} style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, marginBottom: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(47,42,36,.04)" }}>
                  <div className="flex items-center gap-3" style={{ padding: "14px 16px", cursor: "pointer" }} onClick={() => setOpen({ ...open, [key]: !isOpen })}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 16, fontWeight: 700 }}>{g.customer.nama}</span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: t.text2, background: t.surfaceSoft, border: `1px solid ${t.border}`, padding: "1px 8px", borderRadius: 999 }}>{g.customer.kelas}</span>
                      </div>
                      {g.customer.wa && <div style={{ fontSize: 12.5, color: t.text2, marginTop: 2 }}>{g.customer.wa}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: t.text2 }}>{g.txs.length} transaksi</div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{rupiah(g.total)}</div>
                    </div>
                    {isOpen ? <ChevronUp size={18} color={t.textDis} /> : <ChevronDown size={18} color={t.textDis} />}
                  </div>

                  {isOpen && (
                    <>
                      {g.txs.map((tx) => (
                        <div key={tx.id} style={{ padding: "12px 16px", borderTop: `1px solid ${t.divider}`, background: t.surfaceSoft }}>
                          <div className="flex items-start justify-between gap-2">
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                                <SourceTag source={tx.source} />
                                <span style={{ fontSize: 11.5, color: t.text2 }}>{tx.label}</span>
                              </div>
                              <div style={{ fontSize: 14, color: t.text }}>{itemsText(tx.items)}</div>
                            </div>
                            <div style={{ fontWeight: 800, fontSize: 15, whiteSpace: "nowrap" }}>{rupiah(tx.total)}</div>
                          </div>
                          <div className="flex gap-2" style={{ marginTop: 10 }}>
                            <button onClick={() => markPaid(tx)} className="flex items-center justify-center gap-1" style={{ flex: 1, height: 40, borderRadius: 10, border: "none", background: t.success, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
                              <Check size={16} /> Tandai Lunas
                            </button>
                            <button onClick={() => cancel(tx)} style={{ width: 44, height: 40, borderRadius: 10, border: `1.5px solid ${t.border}`, background: t.surface, color: t.error, cursor: "pointer", display: "grid", placeItems: "center" }} title="Batalkan Transaksi">
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2" style={{ padding: "12px 16px", borderTop: `1px solid ${t.divider}` }}>
                        <button onClick={() => shareWA(g)} className="flex items-center justify-center gap-2" style={{ flex: 1, height: 44, borderRadius: 11, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                          <Share2 size={17} /> Bagikan WA
                        </button>
                        <button onClick={() => g.txs.forEach(markPaid)} className="flex items-center justify-center gap-2" style={{ flex: 1, height: 44, borderRadius: 11, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                          <Wallet size={17} /> Lunaskan Semua
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ---- Tab: Riwayat ---- */}
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
              <div key={g.date} style={{ marginBottom: 8 }}>
                <div className="flex items-center justify-between" style={{ margin: "14px 2px 8px" }}>
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{serviceDateLabel(g.date)}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: t.successText }}>Masuk {rupiah(g.totalMasuk)}</span>
                </div>
                {g.txs.map((tx) => {
                  const cancelled = !!tx.cancelledAt;
                  return (
                    <div key={tx.id} style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 14, marginBottom: 9, opacity: cancelled ? 0.72 : 1 }}>
                      <div className="flex items-start justify-between gap-2">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="flex items-center gap-2" style={{ marginBottom: 5, flexWrap: "wrap" }}>
                            <StatusTag ok={!cancelled} />
                            <SourceTag source={tx.source} />
                            <span style={{ fontSize: 11.5, color: t.text2 }}>{tx.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span style={{ fontSize: 15, fontWeight: 700 }}>{tx.customer.nama}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: t.text2, background: t.surfaceSoft, border: `1px solid ${t.border}`, padding: "1px 7px", borderRadius: 999 }}>{tx.customer.kelas}</span>
                          </div>
                          <div style={{ fontSize: 13, color: t.text2, marginTop: 3 }}>{itemsText(tx.items)}</div>
                        </div>
                        <div style={{ fontWeight: 800, fontSize: 15, whiteSpace: "nowrap", textDecoration: cancelled ? "line-through" : "none", color: cancelled ? t.text2 : t.text }}>{rupiah(tx.total)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Undo */}
      {undo && (
        <div style={{ position: "fixed", left: 20, right: 20, bottom: 24 + NAV_HEIGHT, zIndex: 60, display: "flex", justifyContent: "center" }}>
          <div className="flex items-center gap-3" style={{ maxWidth: 420, width: "100%", background: t.text, color: "#FBF7EF", borderRadius: 14, padding: "12px 14px 12px 18px", boxShadow: "0 14px 34px rgba(47,42,36,.3)" }}>
            <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600 }}>
              {undo.type === "paid" ? `Ditandai Lunas — ${undo.tx.customer.nama}` : `Transaksi dibatalkan — ${undo.tx.customer.nama}`}
            </span>
            <button onClick={doUndo} className="flex items-center gap-1" style={{ background: "transparent", border: "none", color: t.primary, fontWeight: 800, fontSize: 14.5, cursor: "pointer", padding: "8px 10px" }}>
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
              <button onClick={() => setWaDraft(null)} style={{ flex: 1, height: 52, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={sendWA} className="flex items-center justify-center gap-2" style={{ flex: 2, height: 52, borderRadius: 12, border: "none", background: "#25D366", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                <Share2 size={18} /> Kirim ke WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SourceTag({ source }: { source: Transaction["source"] }) {
  const pre = source === "preorder";
  return (
    <span className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
      background: pre ? t.primaryLight : t.successBg, color: pre ? t.amberText : t.successText, border: `1px solid ${pre ? "#F1DFB0" : "#D8E6D4"}` }}>
      {pre ? <Utensils size={12} /> : <ShoppingCart size={12} />}{pre ? "Pre-order" : "Penjualan"}
    </span>
  );
}
function StatusTag({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: t.successBg, color: t.successText, border: "1px solid #D8E6D4" }}>
      <Check size={12} /> Lunas
    </span>
  ) : (
    <span className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: t.errorBg, color: t.error, border: "1px solid #F3C9C9" }}>
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
