import { useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronDown, ChevronUp, Check, AlertTriangle, Calendar, MessageCircle } from "lucide-react";
import { t } from "../../lib/theme";
import { rupiah } from "../../lib/format";
import { mondayOf, isAkhirPekan, namaHari, labelPekan } from "../../lib/pekan";
import type { Transaction } from "../../types";

/* ============================================================
   TAGIH SATU PER SATU — satu anak (atau kakak-adik satu nomor WA) per layar.
   Mama hanya mengulang satu gerakan: ketuk hijau → WhatsApp terbuka dengan
   pesan siap → kembali → anak berikutnya sudah menunggu.
   ============================================================ */

export type GrupTagih = { customer: Transaction["customer"]; txs: Transaction[]; total: number };

const opDate = (tx: Transaction) => tx.serviceDate || tx.createdAt.slice(0, 10);
const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tglPendek = (iso: string) => `${Number(iso.slice(8, 10))} ${BLN[Number(iso.slice(5, 7)) - 1]}`;
const waIntl = (wa?: string) => {
  const d = (wa || "").replace(/\D/g, "");
  return d.startsWith("0") ? "62" + d.slice(1) : d;
};

export default function TagihSatuSatu({
  pekan, antrean, byId, bangunPesan, onKirim, onUbahTanggal, onTutup,
}: {
  /** Senin pekan yang ditagih (YYYY-MM-DD). */
  pekan: string;
  /** Antrean dibekukan saat mulai: satu entri = satu pesan = satu atau lebih anak (daftar id transaksi per anak). */
  antrean: string[][][];
  byId: Map<string, Transaction>;
  bangunPesan: (gs: GrupTagih[], label: string) => string;
  onKirim: (ids: string[]) => void;
  onUbahTanggal: (tx: Transaction) => void;
  onTutup: () => void;
}) {
  const label = labelPekan(pekan);
  const [i, setI] = useState(0);
  const [terkirim, setTerkirim] = useState(0);
  const [lewat, setLewat] = useState(0);
  const [teks, setTeks] = useState<string | null>(null);
  const [lihat, setLihat] = useState(false);
  const gulirRef = useRef<HTMLDivElement>(null);

  /* Isi tiap entri dibaca ULANG dari data terbaru: yang sudah lunas, dibatalkan,
     atau dipindah ke pekan lain (ganti tanggal) gugur dari layar ini. */
  const entri = useMemo(() => antrean.map((anak) => anak
    .map((ids) => ids.map((id) => byId.get(id))
      .filter((x): x is Transaction => !!x && !x.paid && !x.cancelledAt && mondayOf(opDate(x)) === pekan)
      .sort((a, b) => opDate(a).localeCompare(opDate(b)) || a.createdAt.localeCompare(b.createdAt)))
    .filter((txs) => txs.length > 0)
    .map((txs) => {
      const baru = txs.reduce((m, x) => (x.createdAt >= m.createdAt ? x : m), txs[0]);
      return { customer: baru.customer, txs, total: txs.reduce((s, x) => s + x.total, 0) } as GrupTagih;
    })), [antrean, byId, pekan]);

  const total = entri.length;
  const selesai = i >= total;
  const gs = selesai ? [] : entri[i];

  /* Entri yang isinya habis (sudah lunas/pindah pekan) dilompati otomatis */
  useEffect(() => {
    if (!selesai && gs.length === 0) setI((n) => n + 1);
  }, [selesai, gs.length]);

  useEffect(() => { setTeks(null); setLihat(false); gulirRef.current?.scrollTo({ top: 0 }); }, [i]);

  const wa = gs.length ? waIntl(gs[0].customer.wa) : "";
  const pesan = teks ?? (gs.length ? bangunPesan(gs, label) : "");
  const ids = gs.flatMap((g) => g.txs.map((x) => x.id));
  const maju = () => setI((n) => n + 1);

  const kirim = () => {
    if (!wa) return;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(pesan)}`, "_blank");
    onKirim(ids);
    setTerkirim((n) => n + gs.length);
    maju();
  };

  const Pil = ({ k }: { k: string }) => (
    <span style={{ fontSize: 13, fontWeight: 700, border: "1.5px solid #A59B80", borderRadius: 999, padding: "1px 9px", lineHeight: 1.35, whiteSpace: "nowrap", verticalAlign: 3 }}>{k}</span>
  );

  return (
    <div role="dialog" aria-label={`Tagih minggu ${label}`} style={{ position: "fixed", inset: 0, zIndex: 75, background: t.bg, color: t.text, display: "flex", flexDirection: "column" }}>
      <div style={{ maxWidth: 460, width: "100%", margin: "0 auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>

        <div className="flex items-center justify-between" style={{ padding: "20px 20px 8px", minHeight: 70 }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.02em" }}>Minggu {label}</div>
          <button onClick={onTutup} aria-label="Tutup" className="flex items-center gap-1"
            style={{ height: 44, padding: "0 14px", borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            <X size={17} /> Tutup
          </button>
        </div>

        {!selesai && gs.length > 0 && (
          <>
            <div style={{ padding: "0 20px" }}>
              <div className="flex items-baseline justify-between">
                <span style={{ fontSize: 17, fontWeight: 800 }}>{i + 1} dari {total}</span>
                <span style={{ fontSize: 14, color: t.text2, fontWeight: 600 }}>{total - i - 1} lagi</span>
              </div>
              <div style={{ height: 8, borderRadius: 6, background: t.border, overflow: "hidden", marginTop: 8 }}>
                <div style={{ height: "100%", width: `${Math.round((i / total) * 100)}%`, background: t.success, transition: "width .25s ease" }} />
              </div>
            </div>

            <div ref={gulirRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 20px 16px" }}>
              {gs.map((g, gi) => {
                const akhirPekan = g.txs.filter((x) => isAkhirPekan(opDate(x)));
                return (
                  <div key={gi} style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 18, padding: "18px 16px 18px", marginBottom: 12 }}>
                    <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.15 }}>
                      {g.customer.nama} <Pil k={g.customer.kelas || g.customer.tingkat || "-"} />
                    </div>
                    <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-.03em", marginTop: 8 }}>{rupiah(g.total)}</div>
                    <div style={{ fontSize: 15, color: t.text2, fontWeight: 600, marginTop: 2 }}>
                      {g.txs.map((x) => tglPendek(opDate(x))).join(", ")}
                    </div>
                    {akhirPekan.map((x) => (
                      <div key={x.id} className="flex items-center gap-2"
                        style={{ marginTop: 10, padding: "8px 10px", background: t.warnFill, border: `1.5px solid ${t.warnText}33`, borderRadius: 12, color: t.warnText, fontSize: 14.5, fontWeight: 700 }}>
                        <AlertTriangle size={17} style={{ flex: "none" }} />
                        <span style={{ flex: 1, minWidth: 0 }}>{tglPendek(opDate(x))} itu {namaHari(opDate(x))}. Benar?</span>
                        <button onClick={() => onUbahTanggal(x)} className="flex items-center gap-1"
                          style={{ flex: "none", height: 44, padding: "0 12px", borderRadius: 10, border: `1.5px solid ${t.warnText}55`, background: t.surface, color: t.warnText, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                          <Calendar size={15} /> Ubah tanggal
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
              {gs.length > 1 && (
                <div style={{ fontSize: 13.5, color: t.text2, margin: "0 4px 10px", fontWeight: 600 }}>
                  Satu nomor WhatsApp, jadi digabung dalam satu pesan.
                </div>
              )}

              <button onClick={() => setLihat((v) => !v)} aria-expanded={lihat} className="flex items-center gap-1"
                style={{ background: "transparent", border: "none", color: t.text2, fontWeight: 700, fontSize: 14.5, minHeight: 44, padding: "0 4px", cursor: "pointer", fontFamily: "inherit" }}>
                {lihat ? <ChevronUp size={17} /> : <ChevronDown size={17} />} Lihat dan ubah pesan
              </button>
              {lihat && (
                <textarea value={pesan} onChange={(e) => setTeks(e.target.value)} rows={10}
                  style={{ width: "100%", fontSize: 16, color: t.text, background: t.surfaceSoft, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: 12, outline: "none", fontFamily: "inherit", resize: "vertical", lineHeight: 1.55, boxSizing: "border-box" }} />
              )}
            </div>

            <div style={{ padding: "10px 20px calc(18px + env(safe-area-inset-bottom, 0px))", borderTop: `1px solid ${t.divider}`, background: t.bg }}>
              {wa ? (
                <button onClick={kirim} className="flex items-center justify-center gap-2"
                  style={{ width: "100%", height: 60, borderRadius: 14, border: "none", background: "#25D366", color: "#fff", fontWeight: 800, fontSize: 18, cursor: "pointer" }}>
                  <MessageCircle size={22} /> Kirim ke WhatsApp
                </button>
              ) : (
                <div style={{ textAlign: "center", fontSize: 15, fontWeight: 700, color: t.error, padding: "6px 0 2px" }}>Nomor WhatsApp belum ada.</div>
              )}
              <div className="flex gap-2" style={{ marginTop: 10 }}>
                <button onClick={() => { setLewat((n) => n + gs.length); maju(); }}
                  style={{ flex: 1, height: 48, borderRadius: 12, border: wa ? `1.5px solid ${t.border}` : "none", background: wa ? t.surface : t.primary, color: t.text, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                  Lewati
                </button>
                <button onClick={() => setI((n) => Math.max(0, n - 1))}
                  style={{ flex: 1, height: 48, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                  Kembali
                </button>
              </div>
            </div>
          </>
        )}

        {selesai && (
          <div style={{ flex: 1, padding: "10px 20px 24px", display: "flex", flexDirection: "column" }}>
            <div style={{ background: t.successBg, borderRadius: 18, padding: "36px 16px", textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: t.success, color: "#fff", display: "grid", placeItems: "center", margin: "0 auto 12px" }}><Check size={30} strokeWidth={3} /></div>
              <div style={{ fontSize: 26, fontWeight: 800, color: t.successText }}>Selesai</div>
              <div style={{ fontSize: 16, color: t.text2, marginTop: 6, fontWeight: 600 }}>
                {terkirim > 0 ? `${terkirim} anak sudah ditagih.` : "Belum ada yang ditagih."}
                {lewat > 0 ? ` ${lewat} dilewati, masih Belum Ditagih.` : ""}
              </div>
            </div>
            <button onClick={onTutup}
              style={{ marginTop: 16, width: "100%", height: 54, borderRadius: 14, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 17, cursor: "pointer" }}>
              Kembali ke daftar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
