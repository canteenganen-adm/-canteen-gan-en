import { useMemo, useState } from "react";
import { ChevronRight, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { t } from "../../lib/theme";
import { hitungKesehatan, jumlahPerlu, type Masalah } from "../../lib/kesehatan";
import type { MenuItem, Transaction } from "../../types";

/* Baris "Kesehatan" di tab Kantin (kartu Kesehatan, permintaan pemilik 4 Nov): satu baris tipis — hijau "Semua baik" atau kuning "N perlu dicek";
   ketuk = daftar masalah dengan langkah singkat. Hanya MEMBACA data yang sudah dimuat (tanpa permintaan baru, tanpa menulis). */
const KUNCI = "ganen_kesehatan_ok";
const bacaOk = (): string[] => { try { return JSON.parse(localStorage.getItem(KUNCI) || "[]"); } catch { return []; } };
const simpanOk = (a: string[]) => { try { localStorage.setItem(KUNCI, JSON.stringify(a.slice(-60))); } catch { /* tanpa penyimpanan: muncul lagi, tidak masalah */ } };
/** Kunci berubah bila jumlahnya berubah, jadi masalah BARU yang sejenis muncul lagi. */
const kunciMasalah = (m: Masalah) => `${m.id}:${m.jumlah}`;

export default function KesehatanBaris({ transactions, menus }: { transactions: Transaction[]; menus: MenuItem[] }) {
  const [buka, setBuka] = useState(false);
  const [rinci, setRinci] = useState<string | null>(null);
  const [ok, setOk] = useState<string[]>(bacaOk);
  const semua = useMemo(() => hitungKesehatan(transactions, menus), [transactions, menus]);
  const masalah = semua.filter((m) => !ok.includes(kunciMasalah(m)));
  const sudahDicek = semua.length - masalah.length;
  const perlu = jumlahPerlu(masalah);
  const tandaiCek = (m: Masalah) => setOk((prev) => { const n = [...prev, kunciMasalah(m)]; simpanOk(n); return n; });
  const tampilkanLagi = () => { setOk([]); simpanOk([]); };
  const baik = perlu === 0;

  return (
    <>
      <button onClick={() => setBuka(true)} aria-label="Kesehatan sistem"
        className="flex items-center gap-3"
        style={{ width: "100%", minHeight: 52, padding: "0 6px 0 4px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: t.text, marginBottom: 4 }}>
        <span style={{ display: "grid", placeItems: "center", flex: "none", color: baik ? t.successText : t.amberText }}>
          {baik ? <ShieldCheck size={20} /> : <TriangleAlert size={20} />}
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700 }}>
          Kesehatan · <span style={{ color: baik ? t.successText : t.warnText }}>{baik ? "Semua baik" : `${perlu} perlu dicek`}</span>
        </span>
        <ChevronRight size={18} color={t.text2} />
      </button>

      {buka && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={() => setBuka(false)} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
          <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
            <div className="flex items-center justify-between" style={{ padding: "18px 20px 12px", position: "sticky", top: 0, background: t.surface, borderBottom: `1px solid ${t.divider}` }}>
              <div style={{ fontSize: 19, fontWeight: 800 }}>Kesehatan</div>
              <button onClick={() => setBuka(false)} aria-label="Tutup" style={{ border: `1.5px solid ${t.border}`, background: t.surface, cursor: "pointer", color: t.text, width: 40, height: 40, borderRadius: "50%", display: "grid", placeItems: "center" }}><X size={18} /></button>
            </div>
            <div style={{ padding: "14px 20px 28px" }}>
              {masalah.length === 0 ? (
                <div className="flex items-center gap-3" style={{ padding: "18px 14px", background: t.successBg, borderRadius: 16, color: t.successText, fontWeight: 800, fontSize: 16 }}>
                  <ShieldCheck size={24} /> Semua baik. Tidak ada yang perlu dicek.
                </div>
              ) : masalah.map((m) => (
                <div key={m.id} style={{ border: `1.5px solid ${t.border}`, borderRadius: 16, padding: "12px 14px", marginBottom: 10, background: m.perlu ? t.surface : t.surfaceSoft }}>
                  <div className="flex items-start justify-between gap-3">
                    <div style={{ fontSize: 15.5, fontWeight: 800 }}>{m.judul}</div>
                    <span style={{ flex: "none", minWidth: 28, height: 26, padding: "0 8px", borderRadius: 999, background: m.perlu ? t.warnFill : t.divider, color: m.perlu ? t.warnText : t.text2, fontWeight: 800, fontSize: 13.5, display: "grid", placeItems: "center" }}>{m.jumlah}</span>
                  </div>
                  <div style={{ fontSize: 14, marginTop: 6, color: t.text2 }}>{m.langkah}</div>
                  <button onClick={() => setRinci(rinci === m.id ? null : m.id)} aria-expanded={rinci === m.id}
                    style={{ marginTop: 8, height: 44, padding: 0, border: "none", background: "transparent", color: t.amberText, fontWeight: 800, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
                    {rinci === m.id ? "Sembunyikan rincian" : "Lihat siapa, kapan, apa"}
                  </button>
                  {rinci === m.id && (
                    <div style={{ borderTop: `1px solid ${t.divider}`, marginTop: 2 }}>
                      {m.rincian.map((r, i) => (
                        <div key={i} style={{ padding: "10px 0", borderBottom: i === m.rincian.length - 1 ? "none" : `1px solid ${t.divider}` }}>
                          <div style={{ fontSize: 15, fontWeight: 800, overflowWrap: "anywhere" }}>{r.judul}</div>
                          {r.garis.map((g, j) => <div key={j} style={{ fontSize: 13.5, color: t.text2, marginTop: 2, overflowWrap: "anywhere" }}>{g}</div>)}
                        </div>
                      ))}
                      {m.jumlah > m.rincian.length && <div style={{ fontSize: 13, color: t.text2, padding: "8px 0" }}>…dan {m.jumlah - m.rincian.length} lainnya</div>}
                    </div>
                  )}
                  <button onClick={() => tandaiCek(m)}
                    style={{ marginTop: 10, height: 44, padding: "0 16px", borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                    Sudah saya cek
                  </button>
                </div>
              ))}
              {sudahDicek > 0 && (
                <button onClick={tampilkanLagi} style={{ border: "none", background: "transparent", color: t.amberText, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", padding: "8px 0", textDecoration: "underline" }}>
                  Tampilkan {sudahDicek} yang sudah dicek
                </button>
              )}
              <div style={{ fontSize: 12.5, color: t.text2, marginTop: 8 }}>Diperiksa dari pesanan 14 hari terakhir dan semua menu. Hanya membaca, tidak mengubah apa pun.</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
