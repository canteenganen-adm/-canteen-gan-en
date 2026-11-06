import { useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Check, AlertTriangle, Calendar, MessageCircle, Search, Copy, GripVertical } from "lucide-react";
import { salinTeks, BATAS_LINK_WA } from "../../lib/salin";
import IkonDitagih from "./IkonDitagih";
import { t, STRUK_MONO } from "../../lib/theme";
import { rupiah } from "../../lib/format";
import { mondayOf, isAkhirPekan, namaHari, labelPekan, sudahDitagih } from "../../lib/pekan";
import type { Transaction } from "../../types";

/* ============================================================
   TAGIH SATU PER SATU — satu anak (atau kakak-adik satu nomor WA) per layar.
   Mama hanya mengulang satu gerakan: ketuk hijau → WhatsApp terbuka dengan
   pesan siap → kembali → anak berikutnya sudah menunggu.
   ============================================================ */

export type Tunggakan = { label: string; total: number };
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
  /** Senin tiap minggu yang ditagih (YYYY-MM-DD); lebih dari satu = minggu digabung jadi satu pesan per anak. */
  pekan: string[];
  /** Antrean dibekukan saat mulai: satu entri = satu pesan = satu atau lebih anak (daftar id transaksi per anak). */
  antrean: string[][][];
  byId: Map<string, Transaction>;
  bangunPesan: (gs: GrupTagih[], label: string, tunggakan?: Tunggakan[]) => string;
  onKirim: (ids: string[]) => void;
  onUbahTanggal: (tx: Transaction) => void;
  onTutup: () => void;
}) {
  const labels = [...pekan].sort().map(labelPekan);
  const label = labels.length > 3 ? `${labels[0]} ~ ${labels[labels.length - 1]}` : labels.length > 1 ? `${labels.slice(0, -1).join(", ")} dan ${labels[labels.length - 1]}` : labels[0];
  const judul = pekan.length > 1 ? `${pekan.length} minggu` : `Minggu ${label}`;
  const [i, setI] = useState(0);
  const [terkirim, setTerkirim] = useState(0);
  /** Indeks entri yang sudah dikirim (segmen bar progres). */
  const [kirimIdx, setKirimIdx] = useState<number[]>([]);
  const [toastSalin, setToastSalin] = useState(false);
  useEffect(() => { if (!toastSalin) return; const id = setTimeout(() => setToastSalin(false), 2600); return () => clearTimeout(id); }, [toastSalin]);
  const [lewat, setLewat] = useState(0);
  const [teks, setTeks] = useState<string | null>(null);
  const [lihat, setLihat] = useState(true);
  const [tersalin, setTersalin] = useState(false);
  useEffect(() => { if (!tersalin) return; const id = setTimeout(() => setTersalin(false), 1800); return () => clearTimeout(id); }, [tersalin]);
  /** Daftar nama: pilih siapa yang ditagih lebih dulu (cari nama, ketuk untuk loncat ke anak itu). */
  const [daftar, setDaftar] = useState(false);
  const [cariNama, setCariNama] = useState("");
  const gulirRef = useRef<HTMLDivElement>(null);

  /* Isi tiap entri dibaca ULANG dari data terbaru: yang sudah lunas, dibatalkan,
     atau dipindah ke pekan lain (ganti tanggal) gugur dari layar ini. */
  const entri = useMemo(() => antrean.map((anak) => anak
    .map((ids) => ids.map((id) => byId.get(id))
      .filter((x): x is Transaction => !!x && !x.paid && !x.cancelledAt && pekan.includes(mondayOf(opDate(x))))
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

  useEffect(() => { setTeks(null); gulirRef.current?.scrollTo({ top: 0 }); }, [i]);

  /* TUNGGAKAN SEBELUMNYA (pemilik 4 Nov: "yang baru dan yang lama belum lunas, mau ditambahkan?"): transaksi anak yang sama, belum lunas, belum dibatalkan,
     dari minggu LAIN di luar yang sedang ditagih. Bawaan DISERTAKAN (tercentang; pemilik 4 Nov: yes); Mama mencabut centangnya bila tidak mau (per anak, hanya muncul bila ada). */
  const [sertakan, setSertakan] = useState(true);
  useEffect(() => { setSertakan(true); }, [i]);
  const norm = (n: string) => n.trim().replace(/\s+/g, " ").toLowerCase();
  const tunggakan: Tunggakan[] = useMemo(() => {
    if (!gs.length) return [];
    const namaSet = new Set(gs.map((g) => norm(g.customer.nama)));
    const perMinggu = new Map<string, number>();
    for (const x of byId.values()) {
      if (x.paid || x.cancelledAt || x.deletedAt || !namaSet.has(norm(x.customer.nama))) continue;
      const senin = mondayOf(opDate(x));
      if (pekan.includes(senin)) continue;
      perMinggu.set(senin, (perMinggu.get(senin) ?? 0) + x.total);
    }
    return [...perMinggu].sort(([a], [b]) => a.localeCompare(b)).map(([senin, tot]) => ({ label: labelPekan(senin), total: tot }));
  }, [gs, byId, pekan]);
  const totalTunggakan = tunggakan.reduce((n, x) => n + x.total, 0);
  useEffect(() => { setTeks(null); }, [sertakan]);

  const wa = gs.length ? waIntl(gs[0].customer.wa) : "";
  const pesan = teks ?? (gs.length ? bangunPesan(gs, label, sertakan && tunggakan.length ? tunggakan : undefined) : "");
  const ids = gs.flatMap((g) => g.txs.map((x) => x.id));
  const maju = () => setI((n) => n + 1);

  const panjang = pesan.length > BATAS_LINK_WA;
  /** Kirim WA: pesan SELALU disalin diam-diam; pendek = wa.me dengan teks, panjang = chat kosong (tinggal tempel). */
  const kirim = async () => {
    if (!wa) return;
    const ok = await salinTeks(pesan);
    if (panjang) {
      if (!ok) return;
      window.open(`https://wa.me/${wa}`, "_blank");
      setToastSalin(true);
    } else {
      window.open(`https://wa.me/${wa}?text=${encodeURIComponent(pesan)}`, "_blank");
    }
    onKirim(ids);
    setTerkirim((n) => n + 1);
    setKirimIdx((a) => [...a, i]);
    maju();
  };

  const Pil = ({ k }: { k: string }) => (
    <span style={{ fontSize: 13, fontWeight: 700, border: "1.5px solid #A59B80", borderRadius: 999, padding: "1px 9px", lineHeight: 1.35, whiteSpace: "nowrap", verticalAlign: 3 }}>{k}</span>
  );

  return (
    <div role="dialog" aria-label={`Tagih ${judul}`} style={{ position: "fixed", inset: 0, zIndex: 75, background: t.bg, color: t.text, display: "flex", flexDirection: "column" }}>
      <div style={{ maxWidth: 460, width: "100%", margin: "0 auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>

        {/* Atas: X kiri, judul tengah, Cari kanan; lalu "n dari N terkirim" dan bar segmen per anak */}
        <div className="flex items-center" style={{ padding: "16px 20px 4px", minHeight: 64, gap: 8 }}>
          <button onClick={onTutup} aria-label="Tutup" title="Tutup" className="flex items-center justify-center"
            style={{ flex: "none", width: 44, height: 44, borderRadius: 12, border: "none", background: t.divider, color: t.text, cursor: "pointer" }}>
            <X size={20} />
          </button>
          <div style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 18, fontWeight: 800, letterSpacing: "-.02em" }}>{judul}</div>
          <button onClick={() => { setCariNama(""); setDaftar(true); }} aria-label="Cari anak" title="Cari anak" className="flex items-center justify-center"
            style={{ flex: "none", width: 44, height: 44, borderRadius: 12, border: "none", background: t.divider, color: t.text, cursor: "pointer" }}>
            <Search size={20} />
          </button>
        </div>
        {total > 0 && (
          <div style={{ padding: "0 20px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 14, color: t.text2, fontWeight: 500 }}>{terkirim} dari {total} terkirim</div>
            <div className="flex" style={{ gap: 4, marginTop: 8 }}>
              {entri.map((_, n) => (
                <span key={n} style={{ flex: 1, height: 6, borderRadius: 3, background: kirimIdx.includes(n) ? t.garisKelompok : n === i && !selesai ? t.text : t.border }} />
              ))}
            </div>
          </div>
        )}

        {!selesai && gs.length > 0 && (
          <>
            <div ref={gulirRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 20px 16px" }}>
              {/* Sertakan tagihan sebelumnya: DI ATAS karcis (sketsa pemilik 6 Nov) */}
              {tunggakan.length > 0 && (
                <button onClick={() => setSertakan((v) => !v)} role="checkbox" aria-checked={sertakan} className="flex items-center"
                  style={{ gap: 10, width: "100%", minHeight: 44, marginBottom: 8, padding: "0 4px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: t.text }}>
                  <span style={{ width: 24, height: 24, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", border: `2px solid ${sertakan ? t.success : t.borderStrong}`, background: sertakan ? t.successBg : "transparent", color: t.successText }}>
                    {sertakan && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, lineHeight: 1.3 }}>Sertakan tagihan sebelumnya {rupiah(totalTunggakan)}</span>
                </button>
              )}
              {/* Karcis: jumlah TIAP ORANG sendiri-sendiri (tidak digabung), jahitan bisa digeret, rincian tanggal ditiadakan dulu */}
              <div style={{ background: t.surface, borderRadius: 20, overflow: "hidden", position: "relative" }}>
                <div style={{ background: t.divider, padding: "16px 16px 14px" }}>
                  {gs.map((g, gi) => (
                    <div key={gi} style={{ marginTop: gi ? 12 : 0 }}>
                      <div>
                        <span style={{ fontSize: 18, fontWeight: 700 }}>{g.customer.nama}</span>{" "}
                        <span style={{ fontSize: 14, color: t.text2, fontFamily: STRUK_MONO }}>{g.customer.kelas || g.customer.tingkat || "-"}</span>
                      </div>
                      <div style={{ fontSize: gs.length > 1 ? 24 : 30, fontWeight: 800, letterSpacing: "-.02em", marginTop: 2 }}>{rupiah(g.total)}</div>
                    </div>
                  ))}
                </div>
                <JahitanGeret bisa={tunggakan.length > 0} aktif={sertakan} onUbah={setSertakan} />
                <div style={{ padding: "14px 16px", fontSize: 13, color: t.text2 }}>
                  Tagihan {label} · {new Set(gs.flatMap((g) => g.txs.map(opDate))).size} tanggal
                </div>
                {gs.flatMap((g) => g.txs.filter((x) => isAkhirPekan(opDate(x)))).map((x) => (
                  <div key={x.id} className="flex items-center gap-2"
                    style={{ margin: "0 12px 12px", padding: "8px 10px", background: t.warnFill, borderRadius: 12, color: t.warnText, fontSize: 14.5, fontWeight: 600 }}>
                    <AlertTriangle size={17} style={{ flex: "none" }} />
                    <span style={{ flex: 1, minWidth: 0 }}>{tglPendek(opDate(x))} itu {namaHari(opDate(x))}. Benar?</span>
                    <button onClick={() => onUbahTanggal(x)} className="flex items-center gap-1"
                      style={{ flex: "none", height: 44, padding: "0 12px", borderRadius: 10, border: "none", background: t.surface, color: t.warnText, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                      <Calendar size={15} /> Ubah tanggal
                    </button>
                  </div>
                ))}
              </div>
              {gs.length > 1 && (
                <div style={{ fontSize: 13.5, color: t.text2, margin: "8px 4px 0", fontWeight: 500 }}>Satu nomor WA, digabung jadi satu pesan.</div>
              )}

              {/* Pratinjau pesan: baris tombol + gelembung (bisa diubah; teks = yang dikirim) */}
              <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
                <button onClick={() => setLihat((v) => !v)} aria-expanded={lihat} className="flex items-center gap-1"
                  style={{ background: "transparent", border: "none", color: t.text2, fontWeight: 600, fontSize: 14.5, minHeight: 44, padding: "0 4px", cursor: "pointer", fontFamily: "inherit" }}>
                  Pratinjau pesan {lihat ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                </button>
                <button onClick={async () => { if (await salinTeks(pesan)) setTersalin(true); }} aria-label={tersalin ? "Tersalin" : "Salin pesan"} className="flex items-center gap-1"
                  style={{ minHeight: 44, padding: "0 8px", border: "none", background: "transparent", color: tersalin ? t.successText : t.text2, fontWeight: 600, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit" }}>
                  {tersalin ? <Check size={17} /> : <Copy size={17} />} {tersalin ? "Tersalin" : "Salin"}
                </button>
              </div>
              {lihat && (
                <div style={{ background: t.successBg, borderRadius: "14px 4px 14px 14px", padding: "10px 12px 8px" }}>
                  <textarea value={pesan} onChange={(e) => setTeks(e.target.value)} rows={10} aria-label="Isi pesan"
                    style={{ width: "100%", fontSize: 16, color: t.text, background: "transparent", border: "none", padding: 0, outline: "none", fontFamily: "inherit", resize: "vertical", lineHeight: 1.5, boxSizing: "border-box" }} />
                  <div className="flex items-center justify-end" style={{ gap: 4, fontSize: 11.5, color: t.text2 }}>
                    {new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":")}
                    <span style={{ color: t.ditagih, display: "grid", placeItems: "center" }}><IkonDitagih size={16} strokeWidth={2.4} /></span>
                  </div>
                </div>
              )}
            </div>

            {toastSalin && (
              <div style={{ position: "absolute", left: 20, right: 20, bottom: 130, display: "flex", justifyContent: "center", zIndex: 6 }}>
                <div style={{ background: t.toast, color: t.surface, borderRadius: 14, padding: "12px 16px", fontSize: 14.5, fontWeight: 500, boxShadow: "0 6px 22px rgba(60,48,20,.18)" }}>Pesan tersalin — tempel di WhatsApp</div>
              </div>
            )}

            {/* Bawah: [‹ Kembali] [Kirim WA] [Lewati ›] satu baris, jarak 12px */}
            <div style={{ padding: "10px 20px calc(32px + env(safe-area-inset-bottom, 0px))", background: t.bg }}>
              <div className="flex items-stretch" style={{ gap: 12 }}>
                <button onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0} aria-label="Kembali"
                  style={{ flex: "none", width: 72, height: 60, borderRadius: 14, border: "none", background: t.divider, color: t.text, cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.45 : 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, fontFamily: "inherit", fontSize: 11.5, fontWeight: 600 }}>
                  <ChevronLeft size={20} />Kembali
                </button>
                {wa ? (
                  <button onClick={kirim} className="flex items-center justify-center gap-2"
                    style={{ flex: 1, minWidth: 0, height: 60, borderRadius: 14, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>
                    {panjang ? <Copy size={20} /> : <MessageCircle size={20} />} {panjang ? "Salin & buka chat" : i === total - 1 ? "Kirim & Selesai" : "Kirim WA"}
                  </button>
                ) : (
                  <div className="flex items-center justify-center" style={{ flex: 1, minWidth: 0, height: 60, fontSize: 14, fontWeight: 700, color: t.error, textAlign: "center" }}>Nomor WA belum ada</div>
                )}
                <button onClick={() => { setLewat((n) => n + gs.length); maju(); }} aria-label="Lewati"
                  style={{ flex: "none", width: 72, height: 60, borderRadius: 14, border: "none", background: t.divider, color: t.text, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, fontFamily: "inherit", fontSize: 11.5, fontWeight: 600 }}>
                  <ChevronRight size={20} />Lewati
                </button>
              </div>
            </div>
          </>
        )}

        {daftar && (
          <div style={{ position: "absolute", inset: 0, zIndex: 5, background: t.bg, display: "flex", flexDirection: "column" }}>
            <div style={{ maxWidth: 460, width: "100%", margin: "0 auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <div className="flex items-center justify-between" style={{ padding: "20px 20px 8px", minHeight: 70 }}>
                <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.02em" }}>Siapa dulu?</div>
                <button onClick={() => setDaftar(false)} aria-label="Tutup daftar" className="flex items-center gap-1"
                  style={{ height: 44, padding: "0 14px", borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text2, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                  <X size={17} /> Tutup
                </button>
              </div>
              <div className="flex items-center gap-2" style={{ margin: "0 20px 8px", background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "0 12px", height: 44 }}>
                <Search size={18} color={t.text2} style={{ flex: "none" }} />
                <input value={cariNama} onChange={(e) => setCariNama(e.target.value)} placeholder="Cari nama…"
                  style={{ border: "none", outline: "none", background: "transparent", fontSize: 16, width: "100%", minWidth: 0, color: t.text, fontFamily: "inherit" }} />
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 20px 24px" }}>
                {entri.map((gsx, idx) => ({ gsx, idx })).filter(({ gsx }) => {
                  const q = cariNama.trim().toLowerCase();
                  return gsx.length > 0 && (!q || gsx.some((g) => `${g.customer.nama} ${g.customer.kelas || ""}`.toLowerCase().includes(q)));
                }).map(({ gsx, idx }) => {
                  const sudah = gsx.every((g) => g.txs.every((x) => sudahDitagih(x.billedAt)));
                  return (
                    <button key={idx} onClick={() => { setI(idx); setDaftar(false); }} className="flex items-center justify-between"
                      style={{ width: "100%", minHeight: 58, padding: "6px 2px", gap: 10, background: "transparent", border: "none", borderBottom: `1px solid ${t.divider}`, textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: t.text }}>
                      <span style={{ minWidth: 0, fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>
                        {gsx.map((g) => g.customer.nama).join(" + ")}
                        <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 700, border: "1.5px solid #A59B80", borderRadius: 999, padding: "1px 9px", whiteSpace: "nowrap", verticalAlign: 2 }}>{gsx[0].customer.kelas || gsx[0].customer.tingkat || "-"}</span>
                      </span>
                      <span className="flex items-center gap-2" style={{ flex: "none" }}>
                        <span style={{ fontSize: 15, fontWeight: 700 }}>{rupiah(gsx.reduce((s, g) => s + g.total, 0))}</span>
                        {sudah && <span aria-label="Sudah ditagih" style={{ display: "grid", placeItems: "center", color: t.ditagih }}><IkonDitagih size={18} strokeWidth={2.4} /></span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {selesai && (
          <div style={{ flex: 1, padding: "10px 20px 24px", display: "flex", flexDirection: "column" }}>
            <div style={{ background: t.successBg, borderRadius: 18, padding: "36px 16px", textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: t.success, color: "#fff", display: "grid", placeItems: "center", margin: "0 auto 12px" }}><Check size={30} strokeWidth={3} /></div>
              <div style={{ fontSize: 26, fontWeight: 800, color: t.successText }}>Selesai</div>
              <div style={{ fontSize: 16, color: t.text2, marginTop: 6, fontWeight: 500 }}>
                {terkirim > 0 ? `${terkirim} anak sudah ditagih.` : "Belum ada yang ditagih."}
                {lewat > 0 ? ` ${lewat} dilewati, masih Belum Ditagih.` : ""}
              </div>
            </div>
            <button onClick={onTutup}
              style={{ marginTop: 16, width: "100%", height: 54, borderRadius: 14, border: "none", background: t.primary, color: t.onPrimary, fontWeight: 600, fontSize: 17, cursor: "pointer" }}>
              Kembali ke daftar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Jahitan karcis: sama seperti karcis lain (putus-putus, warna garis biasa, coakan di tepi). Bila ada tunggakan, jahitan itu sendiri bisa digeret ke kanan (Sertakan aktif) atau ke kiri (mati), atau diketuk. Tanpa gagang, tanpa warna hijau. */
function JahitanGeret({ bisa, aktif, onUbah }: { bisa: boolean; aktif: boolean; onUbah: (v: boolean) => void }) {
  const awal = useRef(0);
  const [tarik, setTarik] = useState(false);
  const tebal = tarik ? 4 : 2;
  return (
    <div style={{ position: "relative", height: 2, margin: "0" }}>
      <div aria-hidden="true" style={{ position: "absolute", left: 14, right: 14, top: 0, height: tebal, backgroundImage: `repeating-linear-gradient(to right, ${t.border} 0, ${t.border} 7px, transparent 7px, transparent 12px)` }} />
      <span aria-hidden="true" style={{ position: "absolute", left: -9, top: -8, width: 18, height: 18, borderRadius: "50%", background: t.bg }} />
      <span aria-hidden="true" style={{ position: "absolute", right: -9, top: -8, width: 18, height: 18, borderRadius: "50%", background: t.bg }} />
      {bisa && (
        <div role="switch" aria-checked={aktif} aria-label="Geret jahitan untuk menyertakan tagihan sebelumnya"
          style={{ position: "absolute", left: 0, right: 0, top: -21, height: 44, touchAction: "none", cursor: "grab" }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); awal.current = e.clientX; setTarik(true); }}
          onPointerUp={(e) => { setTarik(false); const dx = e.clientX - awal.current; onUbah(Math.abs(dx) > 24 ? dx > 0 : !aktif); }}
          onPointerCancel={() => setTarik(false)} />
      )}
    </div>
  );
}
