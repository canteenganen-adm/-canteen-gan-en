import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, ChevronUp, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { t } from "../../lib/theme";
import { hitungKesehatan, jumlahPerlu, type Masalah } from "../../lib/kesehatan";
import type { MenuItem, Transaction } from "../../types";

/* Baris "Kesehatan" di tab Kantin: satu baris tipis — hijau "Semua baik" atau kuning "N perlu dicek"; ketuk = DAFTAR PERIKSA
   (pemilik 4 Nov: "buat aja kaya checklist [v] gitu"; kartu bergaris dan tulisan panjang dianggap berantakan/mepet):
   satu baris per temuan = lingkaran centang + judul + jumlah; ketuk lingkaran = tandai "sudah saya cek" (tetap tampil, tercentang);
   ketuk baris = buka keterangan + rincian siapa/kapan/apa. Hanya MEMBACA data yang sudah dimuat (tanpa permintaan baru, tanpa menulis). */
const KUNCI = "ganen_kesehatan_ok";
const bacaOk = (): string[] => { try { return JSON.parse(localStorage.getItem(KUNCI) || "[]"); } catch { return []; } };
const simpanOk = (a: string[]) => { try { localStorage.setItem(KUNCI, JSON.stringify(a.slice(-60))); } catch { /* tanpa penyimpanan: muncul lagi, tidak masalah */ } };
/** Kunci berubah bila jumlahnya berubah, jadi masalah BARU yang sejenis muncul lagi sebagai belum dicek. */
const kunciMasalah = (m: Masalah) => `${m.id}:${m.jumlah}`;

export default function KesehatanBaris({ transactions, menus }: { transactions: Transaction[]; menus: MenuItem[] }) {
  const [buka, setBuka] = useState(false);
  const [rinci, setRinci] = useState<string | null>(null);
  const [ok, setOk] = useState<string[]>(bacaOk);
  const semua = useMemo(() => hitungKesehatan(transactions, menus), [transactions, menus]);
  const belumDicek = semua.filter((m) => !ok.includes(kunciMasalah(m)));
  const perlu = jumlahPerlu(belumDicek);
  const sudahDicek = (m: Masalah) => ok.includes(kunciMasalah(m));
  const ganti = (m: Masalah) => setOk((prev) => { const k = kunciMasalah(m); const n = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]; simpanOk(n); return n; });
  const baik = perlu === 0;

  return (
    <>
      <button onClick={() => setBuka(true)} aria-label="Kesehatan sistem"
        className="flex items-center gap-3"
        style={{ width: "100%", minHeight: 60, padding: "0 4px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: t.text }}>
        <span style={{ display: "grid", placeItems: "center", flex: "none", width: 24, color: baik ? t.successText : t.amberText }}>
          {baik ? <ShieldCheck size={20} /> : <TriangleAlert size={20} />}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 16, fontWeight: 600 }}>Kesehatan</span>
          <span style={{ display: "block", fontSize: 13.5, fontWeight: 500, marginTop: 1, color: baik ? t.successText : t.warnText }}>{baik ? "Semua baik" : `${perlu} perlu dicek`}</span>
        </span>
        <ChevronRight size={18} color={t.text2} />
      </button>

      {buka && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={() => setBuka(false)} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
          <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 -10px 40px rgba(47,42,36,.18)" }}>
            <div className="flex items-center justify-between" style={{ padding: "18px 20px 12px", position: "sticky", top: 0, background: t.surface, zIndex: 1 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>Kesehatan</div>
                {semua.length > 0 && <div style={{ fontSize: 13.5, fontWeight: 500, color: t.text2, marginTop: 2 }}>{semua.length - belumDicek.length} dari {semua.length} sudah dicek</div>}
              </div>
              <button onClick={() => setBuka(false)} aria-label="Tutup" style={{ border: "none", background: t.surfaceSoft, cursor: "pointer", color: t.text, width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center" }}><X size={20} /></button>
            </div>
            <div style={{ padding: "0 20px 28px" }}>
              {semua.length === 0 ? (
                <div className="flex items-center gap-3" style={{ padding: "18px 14px", background: t.successBg, borderRadius: 16, color: t.successText, fontWeight: 600, fontSize: 16 }}>
                  <ShieldCheck size={24} /> Semua baik.
                </div>
              ) : semua.map((m, idx) => {
                const dicek = sudahDicek(m);
                const terbuka = rinci === m.id;
                return (
                  <div key={m.id} style={{ borderTop: idx ? `1px solid ${t.divider}` : "none" }}>
                    <div className="flex items-center" style={{ gap: 4, minHeight: 64 }}>
                      <button onClick={() => ganti(m)} role="checkbox" aria-checked={dicek} aria-label={dicek ? `${m.judul}: sudah dicek` : `${m.judul}: tandai sudah dicek`}
                        style={{ flex: "none", width: 48, height: 48, border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center", padding: 0 }}>
                        <span style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", border: `2px solid ${dicek ? t.success : t.borderStrong}`, background: dicek ? t.successBg : "transparent", color: t.successText }}>
                          {dicek && <Check size={16} strokeWidth={3} />}
                        </span>
                      </button>
                      <button onClick={() => setRinci(terbuka ? null : m.id)} aria-expanded={terbuka}
                        className="flex items-center" style={{ flex: 1, minWidth: 0, gap: 10, minHeight: 64, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: dicek ? t.text2 : t.text, padding: 0 }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{m.judul}</span>
                        <span style={{ flex: "none", fontSize: 14, fontWeight: 600, color: m.perlu && !dicek ? t.warnText : t.text2 }}>{m.jumlah}</span>
                        {terbuka ? <ChevronUp size={18} color={t.text2} /> : <ChevronDown size={18} color={t.text2} />}
                      </button>
                    </div>
                    {terbuka && (
                      <div style={{ padding: "0 4px 14px 52px" }}>
                        <div style={{ fontSize: 14, color: t.text2, lineHeight: 1.45 }}>{m.langkah}</div>
                        {m.rincian.map((r, i) => (
                          <div key={i} style={{ padding: "10px 0 0" }}>
                            <div style={{ fontSize: 15, fontWeight: 600, overflowWrap: "anywhere" }}>{r.judul}</div>
                            {r.garis.map((g, j) => <div key={j} style={{ fontSize: 13.5, color: t.text2, marginTop: 2, overflowWrap: "anywhere" }}>{g}</div>)}
                          </div>
                        ))}
                        {m.jumlah > m.rincian.length && <div style={{ fontSize: 13.5, color: t.text2, paddingTop: 10 }}>…dan {m.jumlah - m.rincian.length} lainnya</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
