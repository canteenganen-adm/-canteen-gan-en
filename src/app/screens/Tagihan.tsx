import { useMemo, useState, useEffect } from "react";
import {
  Search, X, Check, Trash2, Share2, ShoppingCart, Utensils,
  Undo2, ChevronDown, ChevronUp, Wallet, Settings,
} from "lucide-react";
import { t, NAV_HEIGHT } from "../../lib/theme";
import { rupiah, itemsText } from "../../lib/format";
import type { Transaction } from "../../types";

/* ============================================================
   TAGIHAN — Canteen Gan En
   Decision Lock §7: dua sumber → satu Tagihan (Pre-order belum bayar
   + Penjualan "Masuk Tagihan"). Dikelompokkan PER MURID (Nama+Kelas).
   Cari: Nama · Kelas · WhatsApp. Tandai Lunas (Undo).
   Bagikan WhatsApp. Batalkan Transaksi (riwayat disimpan di belakang layar).
   ------------------------------------------------------------
   `unpaid` diturunkan LANGSUNG dari prop `transactions` (bukan salinan
   state lokal) supaya selalu sinkron dengan Penjualan & Pre-order.
   ============================================================ */

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
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { if (!undo) return; const id = setTimeout(() => setUndo(null), 5000); return () => clearTimeout(id); }, [undo]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2200); return () => clearTimeout(id); }, [toast]);

  const unpaid = useMemo(() => transactions.filter((x) => !x.paid), [transactions]);

  // group per murid (Nama + Kelas)
  const groups = useMemo(() => {
    const ql = q.toLowerCase().trim();
    const map = new Map<string, { customer: Transaction["customer"]; txs: Transaction[]; total: number }>();
    for (const tx of unpaid) {
      const c = tx.customer;
      const hay = `${c.nama} ${c.kelas} ${c.wa || ""}`.toLowerCase();
      if (ql && !hay.includes(ql)) continue;
      const key = `${c.nama.toLowerCase()}|${c.kelas.toLowerCase()}`;
      if (!map.has(key)) map.set(key, { customer: c, txs: [], total: 0 });
      const g = map.get(key)!; g.txs.push(tx); g.total += tx.total;
    }
    return Array.from(map.values());
  }, [unpaid, q]);

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);

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
  const shareWA = (g: { customer: Transaction["customer"]; txs: Transaction[]; total: number }) => {
    const lines = g.txs.map((tx) => `• ${itemsText(tx.items)} — ${rupiah(tx.total)}`).join("\n");
    const msg = `Halo, berikut tagihan ${g.customer.nama} (${g.customer.kelas}):\n${lines}\n\nTotal: ${rupiah(g.total)}\nTerima kasih 🙏`;
    const wa = g.customer.wa?.replace(/\D/g, "");
    if (wa) window.open(`https://wa.me/${wa.startsWith("0") ? "62" + wa.slice(1) : wa}?text=${encodeURIComponent(msg)}`, "_blank");
    else setToast("Nomor WhatsApp belum ada untuk murid ini.");
  };

  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 90px" }}>

        {/* Header */}
        <div style={{ padding: "20px 20px 10px", position: "sticky", top: 0, background: t.bg, zIndex: 5 }}>
          <div className="flex items-end justify-between">
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>Tagihan</div>
            <div className="flex items-center gap-3">
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: t.text2, fontWeight: 600 }}>Total belum bayar</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: t.amberText }}>{rupiah(grandTotal)}</div>
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
          <div className="flex items-center gap-2" style={{ marginTop: 14, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "0 12px", height: 48 }}>
            <Search size={20} color={t.text2} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, kelas, atau WhatsApp…"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 15, width: "100%", color: t.text, fontFamily: "inherit" }} />
            {q && <X size={18} color={t.text2} style={{ cursor: "pointer" }} onClick={() => setQ("")} />}
          </div>
        </div>

        {/* Groups */}
        <div style={{ padding: "4px 20px" }}>
          {groups.length === 0 ? (
            <Empty q={q} />
          ) : groups.map((g) => {
            const key = `${g.customer.nama}|${g.customer.kelas}`;
            const isOpen = open[key] ?? true;
            return (
              <div key={key} style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, marginBottom: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(47,42,36,.04)" }}>
                {/* head */}
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
    </div>
  );
}

function SourceTag({ source }: { source: Transaction["source"] }) {
  const pre = source === "preorder";
  return (
    <span className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
      background: pre ? t.primaryLight : t.successBg, color: pre ? t.amberText : t.successText, border: `1px solid ${pre ? "#F1DFB0" : "#D8E6D4"}` }}>
      {pre ? <Utensils size={12} /> : <ShoppingCart size={12} />}{pre ? "PO" : "Penjualan"}
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
      <div style={{ fontSize: 14, color: t.text2, marginTop: 6 }}>{q ? "Coba kata kunci lain." : "Tidak ada yang belum bayar. Kerja bagus."}</div>
    </div>
  );
}
