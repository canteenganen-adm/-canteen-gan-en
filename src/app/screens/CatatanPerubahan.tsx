import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, RotateCcw, Search, X } from "lucide-react";
import { t } from "../../lib/theme";
import { rupiah } from "../../lib/format";
import { bacaNamaCatatan } from "../../lib/siapa";
import { fetchCatatan, pulihkanDariCatatan, type Catatan, type FilterCatatan, type HasilCatatan } from "../../lib/catatan";

/* ============================================================
   CATATAN PERUBAHAN — dibuka dari Kantin → Catatan.
   Gaya LOG (permintaan pemilik 4 Nov): satu baris per kejadian, terbaru dulu:
     04/11 09:52:13 [Lunas] Budi · Rp12000 · preorder — Mama
   Ketuk satu baris = isi sebelum/sesudah dan, untuk transaksi & menu, "Kembalikan".
   Sumber: tabel `catatan` (supabase/migration_15_catatan.sql + 16).
   ============================================================ */

const MONO = "'DM Mono', ui-monospace, 'Cascadia Mono', 'SF Mono', 'Roboto Mono', 'Courier New', monospace";
const p2 = (n: number) => String(n).padStart(2, "0");
const waktuLog = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
};

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
  if ("cancelled_at" in s) return s.cancelled_at ? ["Batal", "", "buruk"] : ["Pulih", "pembatalan", "baik"];
  if ("deleted_at" in s) return s.deleted_at ? ["Sampah", "ke Tong Sampah", "buruk"] : ["Pulih", "dari Tong Sampah", "baik"];
  if ("billed_at" in s) return ["Tagih", "", "biasa"];
  if ("service_date" in s) return ["Tanggal", `${tampil(b.service_date)} → ${tampil(s.service_date)}`, "biasa"];
  if ("customer" in s) return ["Pembeli", "data diubah", "biasa"];
  if ("items" in s) return ["Isi", "pesanan diubah", "biasa"];
  return ["Ubah", Object.keys(s).map((k) => LABEL[k] ?? k).join(", "), "biasa"];
}

const CHIP: { id: FilterCatatan; label: string }[] = [
  { id: "semua", label: "Semua" }, { id: "hapus", label: "Hapus" }, { id: "lunas", label: "Lunas" }, { id: "menu", label: "Menu" }, { id: "pengaturan", label: "Pengaturan" },
];
const WARNA: Record<Nada, string> = { baik: t.successText, buruk: t.error, biasa: t.text };

export default function CatatanPerubahan({ onBack }: { onBack: () => void }) {
  const [filter, setFilter] = useState<FilterCatatan>("semua");
  const [q, setQ] = useState("");
  const [baris, setBaris] = useState<Catatan[]>([]);
  const [habis, setHabis] = useState(true);
  const [status, setStatus] = useState<"memuat" | "ok" | "belumAktif" | "galat">("memuat");
  const [pesan, setPesan] = useState("");
  const [buka, setBuka] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2600); return () => clearTimeout(id); }, [toast]);

  const kembalikan = async (c: Catatan) => {
    try { await pulihkanDariCatatan(c); setToast("Dikembalikan"); void muat(false); }
    catch (e) { setToast(e instanceof Error ? e.message : "Gagal mengembalikan"); }
  };

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

          {status === "ok" && baris.length > 0 && (
            <div style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 16, overflow: "hidden" }}>
              {baris.map((c, i) => {
                const [jenis, ket, nada] = ringkas(c);
                const terbuka = buka === c.id;
                const bisaPulih = (c.tabel === "transaksi" || c.tabel === "menu") && ((c.aksi === "hapus" && c.sebelum) || (c.aksi === "ubah" && c.sebelum && c.baris_id));
                const nama = bacaNamaCatatan(c.siapa) || (c.aksi === "tambah" && c.tabel === "transaksi" ? "Pemesan" : "?");
                const apa = [c.ket, ket].filter(Boolean).join(" · ");
                return (
                  <div key={c.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${t.divider}`, background: terbuka ? t.surfaceSoft : "transparent" }}>
                    <button onClick={() => setBuka(terbuka ? null : c.id)} aria-expanded={terbuka}
                      style={{ display: "block", width: "100%", padding: "9px 12px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", color: t.text, fontFamily: MONO, fontSize: 13, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                      <span style={{ color: t.text2 }}>{waktuLog(c.waktu)}</span>{" "}
                      <b style={{ color: WARNA[nada], fontWeight: 600 }}>[{jenis}]</b>{" "}
                      <span>{apa}</span>{" "}
                      <span style={{ color: t.text2 }}>· {nama}</span>
                    </button>
                    {terbuka && (
                      <div style={{ padding: "2px 12px 12px", fontSize: 13.5, fontFamily: "inherit" }}>
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
                        <div style={{ fontSize: 12, color: t.text2, marginTop: 6 }}>Kode HP: {c.hp || "—"}</div>
                        {bisaPulih && (
                          <button onClick={() => kembalikan(c)} className="flex items-center justify-center gap-2"
                            style={{ marginTop: 10, width: "100%", height: 46, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 800, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit" }}>
                            <RotateCcw size={16} /> {c.aksi === "hapus" ? "Kembalikan data ini" : "Kembalikan ke nilai lama"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {status === "ok" && !habis && baris.length > 0 && (
            <button onClick={() => muat(true)}
              style={{ width: "100%", height: 48, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit", marginTop: 12 }}>
              Tampilkan lagi
            </button>
          )}
        </div>
      </div>
      {toast && (
        <div role="status" style={{ position: "fixed", left: 0, right: 0, bottom: 96, display: "grid", placeItems: "center", pointerEvents: "none", zIndex: 60 }}>
          <div style={{ background: t.text, color: "#fff", borderRadius: 12, padding: "10px 16px", fontWeight: 700, fontSize: 14.5 }}>{toast}</div>
        </div>
      )}
    </div>
  );
}
