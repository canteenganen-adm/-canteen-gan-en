import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import { t } from "../../lib/theme";
import { rupiah } from "../../lib/format";
import { bacaNamaCatatan } from "../../lib/siapa";
import { fetchCatatan, type Catatan, type FilterCatatan, type HasilCatatan } from "../../lib/catatan";

/* ============================================================
   CATATAN PERUBAHAN — dibuka dari Kantin → Catatan.
   Gaya LOG (permintaan pemilik 4 Nov): satu baris per kejadian, terbaru dulu:
     04/11 09:52:13 [Lunas] Budi · Rp12000 · preorder — Mama
   Ketuk satu baris = isi sebelum/sesudah. HANYA MEMBACA: log asli, tanpa tombol Kembalikan/ubah (pemilik 4 Nov).
   Sumber: tabel `catatan` (supabase/migration_15_catatan.sql + 16).
   ============================================================ */

const MONO = "'DM Mono', ui-monospace, 'Cascadia Mono', 'SF Mono', 'Roboto Mono', 'Courier New', monospace";
const p2 = (n: number) => String(n).padStart(2, "0");

const LABEL: Record<string, string> = {
  paid: "Lunas", paid_at: "Jam lunas", billed_at: "Ditagih", cancelled_at: "Dibatalkan", deleted_at: "Tong Sampah",
  service_date: "Tanggal layanan", customer: "Pembeli", items: "Isi pesanan", total: "Total", source: "Sumber",
  tanggal: "Tanggal", baris: "Jumlah baris", aktif_preorder: "Aktif Pre-order", stok: "Stok", name: "Nama", price: "Harga",
  variants: "Ukuran", category: "Kategori", channels: "Tampil di", kategori_ortu: "Kelompok ortu",
};
const tampil = (v: unknown): string => {
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v.length === 0 ? "kosong" : v.join(", ");
  if (v === null || v === undefined) return "kosong";
  if (typeof v === "boolean") return v ? "ya" : "tidak";
  if (typeof v === "number") return v >= 1000 ? rupiah(v) : String(v);
  if (typeof v === "string") return v.length > 40 ? v.slice(0, 40) + "…" : v;
  return JSON.stringify(v).slice(0, 60);
};

type Nada = "baik" | "buruk" | "biasa";
/** [jenis singkat, keterangan tambahan (boleh kosong), nada warna] */
function ringkas(c: Catatan): [string, string, Nada] {
  const s = c.sesudah ?? {};
  const b = c.sebelum ?? {};
  if (c.tabel === "menu_harian") return c.aksi === "hapus" ? ["Timpa", "", "biasa"] : ["Simpan", "", "baik"];
  if (c.tabel === "menu_stok") return ["Stok", c.aksi === "ubah" ? `${tampil(b.stok)} → ${tampil(s.stok)}` : c.aksi === "tambah" ? `diisi ${tampil(s.stok)}` : "dihapus", c.aksi === "hapus" ? "buruk" : "biasa"];
  if (c.tabel === "app_state") return ["Atur", Object.keys(s).map((k) => LABEL[k] ?? k).join(", "), "biasa"];
  if (c.tabel === "kelas") return ["Kelas", c.aksi, c.aksi === "hapus" ? "buruk" : "biasa"];
  if (c.tabel === "menu_tetap") return ["Tetap", c.aksi === "hapus" ? "dilepas" : "ditandai", "biasa"];
  if (c.tabel === "menu") {
    if (c.aksi === "tambah") return ["Menu+", "", "baik"];
    if (c.aksi === "hapus") return ["HAPUS", "menu", "buruk"];
    if ("price" in s) return ["Harga", `${tampil(b.price)} → ${tampil(s.price)}`, "biasa"];
    if ("variants" in s) return ["Ukuran", "harga/ukuran diubah", "biasa"];
    if ("name" in s) return ["Nama", `${tampil(b.name)} → ${tampil(s.name)}`, "biasa"];
    return ["Menu", Object.keys(s).map((k) => LABEL[k] ?? k).join(", "), "biasa"];
  }
  // transaksi
  if (c.aksi === "tambah") return [s.source === "preorder" ? "Pesan" : "Jual", "", "baik"];
  if (c.aksi === "hapus") return ["HAPUS", "permanen", "buruk"];
  if ("paid" in s) return s.paid ? ["Lunas", "", "baik"] : ["Batal Lunas", "", "buruk"];
  if ("cancelled_at" in s) return s.cancelled_at ? ["Batal", "", "buruk"] : ["Pulih", "", "baik"];
  if ("deleted_at" in s) return s.deleted_at ? ["Sampah", "", "buruk"] : ["Pulih", "", "baik"];
  if ("billed_at" in s) return ["Tagih", "", "biasa"];
  if ("service_date" in s) return ["Tanggal", `${tampil(b.service_date)} → ${tampil(s.service_date)}`, "biasa"];
  if ("customer" in s) return ["Pembeli", "data diubah", "biasa"];
  if ("items" in s) return ["Isi", "pesanan diubah", "biasa"];
  return ["Ubah", Object.keys(s).map((k) => LABEL[k] ?? k).join(", "), "biasa"];
}

const CHIP: { id: FilterCatatan; label: string }[] = [
  { id: "semua", label: "Semua" }, { id: "hapus", label: "Hapus" }, { id: "lunas", label: "Lunas" }, { id: "menu", label: "Menu" }, { id: "pengaturan", label: "Pengaturan" },
];

const hariWib = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const jamMenit = (iso: string) => { const d = new Date(new Date(iso).getTime() + 7 * 3_600_000); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };
const jamDetik = (iso: string) => { const d = new Date(new Date(iso).getTime() + 7 * 3_600_000); return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`; };
const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BLN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const judulHari = (h: string, hariIni: string) => {
  const d = new Date(h + "T00:00:00Z");
  const teks = `${NAMA_HARI[d.getUTCDay()]} ${d.getUTCDate()} ${BLN_PENDEK[d.getUTCMonth()]}`;
  return h === hariIni ? `Hari ini · ${teks}` : teks;
};
const JENIS_PANJANG: Record<string, string> = {
  Pesan: "Pesanan masuk", Jual: "Penjualan dicatat", HAPUS: "Dihapus permanen", "Batal Lunas": "Lunas dibatalkan", Batal: "Dibatalkan",
  Sampah: "Ke Tong Sampah", Pulih: "Dipulihkan", Tagih: "Ditagih", Tanggal: "Tanggal diubah", Pembeli: "Data pembeli diubah",
  Isi: "Isi pesanan diubah", Harga: "Harga diubah", Ukuran: "Ukuran diubah", Nama: "Nama diubah", "Menu+": "Menu baru",
  Simpan: "Menu disimpan", Timpa: "Menu ditimpa", Stok: "Stok", Atur: "Pengaturan diubah", Kelas: "Kelas", Tetap: "Menu Tetap", Menu: "Menu diubah", Ubah: "Diubah", Lunas: "Lunas",
};
const WARNA: Record<Nada, string> = { baik: t.successText, buruk: t.error, biasa: t.text };

export default function CatatanPerubahan({ onBack }: { onBack: () => void }) {
  const [filter, setFilter] = useState<FilterCatatan>("semua");
  const [q, setQ] = useState("");
  const [baris, setBaris] = useState<Catatan[]>([]);
  const [habis, setHabis] = useState(true);
  const [status, setStatus] = useState<"memuat" | "ok" | "belumAktif" | "galat">("memuat");
  const [pesan, setPesan] = useState("");
  const [buka, setBuka] = useState<number | null>(null);
  const seq = useRef(0);

  const muat = useCallback(async (tambah: boolean) => {
    const my = ++seq.current;
    if (!tambah) setStatus("memuat");
    const sebelumId = tambah ? baris[baris.length - 1]?.id : undefined;
    const r: HasilCatatan = await fetchCatatan({ filter, q, sebelumId });
    if (my !== seq.current) return;
    if (r.status === "ok") { setBaris((p) => (tambah ? [...p, ...r.baris] : r.baris)); setHabis(r.habis); setStatus("ok"); }
    else if (r.status === "belumAktif") setStatus("belumAktif");
    else { setPesan(r.pesan); setStatus("galat"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, q, baris]);

  // Muat ulang saat filter/cari berubah (cari ditunda sebentar supaya tidak satu permintaan per huruf)
  useEffect(() => {
    const id = setTimeout(() => { void muat(false); }, q ? 300 : 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, q]);



  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 80px" }}>
        <div className="flex items-center gap-3" style={{ padding: "20px 20px 12px" }}>
          <button onClick={onBack} aria-label="Kembali"
            style={{ width: 40, height: 40, borderRadius: 11, border: `1px solid ${t.border}`, background: t.surface, cursor: "pointer", display: "grid", placeItems: "center", color: t.text, flex: "none" }}>
            <ArrowLeft size={20} />
          </button>
          <div style={{ fontSize: 19, fontWeight: 800 }}>Catatan Perubahan</div>
        </div>

        <div style={{ padding: "0 20px" }}>
          <div className="flex items-center gap-2" style={{ height: 44, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "0 12px", boxSizing: "border-box" }}>
            <Search size={18} color={t.text2} style={{ flex: "none" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau menu…"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 16, width: "100%", minWidth: 0, color: t.text, fontFamily: "inherit" }} />
            {q && <X size={18} color={t.text2} style={{ cursor: "pointer", flex: "none" }} onClick={() => setQ("")} />}
          </div>
          <div className="hscroll" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "12px -20px 12px", padding: "0 20px", scrollbarWidth: "none" }}>
            {CHIP.map((c) => (
              <button key={c.id} onClick={() => setFilter(c.id)} aria-pressed={filter === c.id}
                style={{ flex: "none", height: 40, padding: "0 16px", borderRadius: 999, border: `1.5px solid ${filter === c.id ? t.primary : t.border}`, background: filter === c.id ? t.primary : t.surface, color: t.onPrimary, fontWeight: filter === c.id ? 800 : 600, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit" }}>
                {c.label}
              </button>
            ))}
          </div>

          {status === "memuat" && <div style={{ textAlign: "center", color: t.text2, padding: "40px 0" }}>Memuat…</div>}
          {status === "belumAktif" && (
            <div style={{ background: t.warnFill, borderRadius: 14, padding: "14px 16px", fontWeight: 600, lineHeight: 1.45 }}>
              Catatan belum diaktifkan. Jalankan <b>migration_15_catatan.sql</b> sekali di Supabase → SQL Editor.
            </div>
          )}
          {status === "galat" && <div style={{ background: t.errorBg, color: t.error, borderRadius: 14, padding: "14px 16px", fontWeight: 600 }}>{pesan}</div>}
          {status === "ok" && baris.length === 0 && <div style={{ textAlign: "center", color: t.text2, padding: "40px 0" }}>Belum ada catatan.</div>}

          {status === "ok" && baris.length > 0 && (() => {
            // Kelompok per hari (WIB), terbaru dulu — garis waktu: jam di kiri, titik berwarna di garis tipis, isi di kanan
            const kel: { hari: string; isi: Catatan[] }[] = [];
            for (const c of baris) {
              const h = hariWib(c.waktu);
              const g = kel[kel.length - 1];
              if (g && g.hari === h) g.isi.push(c); else kel.push({ hari: h, isi: [c] });
            }
            const hariIniWib = hariWib(new Date().toISOString());
            return kel.map((g) => (
              <div key={g.hari}>
                <div style={{ fontSize: 13, fontWeight: 800, color: t.text2, margin: "14px 2px 6px" }}>{judulHari(g.hari, hariIniWib)}</div>
                <div style={{ position: "relative" }}>
                  <div aria-hidden style={{ position: "absolute", left: 66, top: 12, bottom: 12, width: 2, background: t.border }} />
                  {g.isi.map((c) => {
                    const [jenis, ket, nada] = ringkas(c);
                    const terbuka = buka === c.id;
                    const nama = bacaNamaCatatan(c.siapa) || (c.aksi === "tambah" && c.tabel === "transaksi" ? "Pemesan" : "Tidak diketahui");
                    // Penjualan tanpa nama pembeli: ket dari server berawal "· Rp…" → beri judul "Penjualan tunai"
                    const ketDasar = (c.ket || c.tabel).trim();
                    const bagian = (ketDasar.startsWith("·") ? `Penjualan tunai ${ketDasar}` : ketDasar).replace(/Rp(\d+)/g, (_m, n: string) => rupiah(Number(n))).split(" · ");
                    const aktifMenu = (c.sesudah ?? c.sebelum)?.aktif_preorder;
                    const tglMenu = c.baris_id && /^\d{4}-\d{2}-\d{2}$/.test(c.baris_id) ? `${Number(c.baris_id.slice(8))} ${BLN_PENDEK[Number(c.baris_id.slice(5, 7)) - 1]} ${c.baris_id.slice(0, 4)}` : "";
                    const judul = c.tabel === "menu_harian" && tglMenu ? `Menu ${tglMenu}` : bagian[0];
                    const sisa = c.tabel === "menu_harian" && Array.isArray(aktifMenu) ? `${aktifMenu.length} aktif Pre-order` : [...bagian.slice(1), ket].filter(Boolean).join(" · ");
                    return (
                      <div key={c.id}>
                        <button onClick={() => setBuka(terbuka ? null : c.id)} aria-expanded={terbuka}
                          style={{ display: "flex", width: "100%", padding: "9px 0", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", color: t.text, fontFamily: "inherit" }}>
                          <span style={{ width: 52, flex: "none", fontFamily: MONO, fontSize: 13, color: t.text2, paddingTop: 2 }}>{jamMenit(c.waktu)}</span>
                          <span style={{ width: 12, height: 12, borderRadius: "50%", background: WARNA[nada], border: `2px solid ${t.bg}`, flex: "none", margin: "5px 14px 0 8px", position: "relative", zIndex: 1, boxSizing: "content-box" }} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: WARNA[nada] }}>{JENIS_PANJANG[jenis] ?? jenis}</span>
                            <span style={{ display: "block", fontSize: 16, fontWeight: 700, marginTop: 1, overflowWrap: "anywhere" }}>{judul}</span>
                            <span style={{ display: "block", fontSize: 13, color: t.text2, marginTop: 1, overflowWrap: "anywhere" }}>{[sisa, nama].filter(Boolean).join(" · ")}</span>
                          </span>
                        </button>
                        {terbuka && (
                          <div style={{ margin: "0 0 8px 74px", padding: "10px 12px", background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 14, fontSize: 13.5 }}>
                            {c.aksi === "ubah" && c.sesudah && Object.keys(c.sesudah).map((k) => (
                              <div key={k} style={{ padding: "3px 0", overflowWrap: "anywhere" }}>
                                <b>{LABEL[k] ?? k}</b>: <span style={{ color: t.text2 }}>{tampil(c.sebelum?.[k])}</span> → <b>{tampil(c.sesudah?.[k])}</b>
                              </div>
                            ))}
                            {c.aksi === "hapus" && c.sebelum && Object.entries(c.sebelum).filter(([k]) => ["customer", "items", "total", "service_date", "name", "price", "category", "tanggal", "baris", "aktif_preorder"].includes(k)).map(([k, v]) => (
                              <div key={k} style={{ padding: "3px 0", color: t.text2, overflowWrap: "anywhere" }}><b style={{ color: t.text }}>{LABEL[k] ?? k}</b>: {tampil(v)}</div>
                            ))}
                            {c.aksi === "tambah" && c.tabel === "menu_harian" && c.sesudah && ["tanggal", "aktif_preorder"].map((k) => (
                              <div key={k} style={{ padding: "3px 0", color: t.text2, overflowWrap: "anywhere" }}><b style={{ color: t.text }}>{LABEL[k]}</b>: {tampil(c.sesudah?.[k])}</div>
                            ))}
                            {c.aksi === "tambah" && c.tabel !== "menu_harian" && <div style={{ color: t.text2 }}>Baris baru dibuat.</div>}
                            <div style={{ fontSize: 12, color: t.text2, marginTop: 6, fontFamily: MONO }}>{jamDetik(c.waktu)} · HP {c.hp || "—"}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}

          {status === "ok" && !habis && baris.length > 0 && (
            <button onClick={() => muat(true)}
              style={{ width: "100%", height: 48, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit", marginTop: 12 }}>
              Tampilkan lagi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
