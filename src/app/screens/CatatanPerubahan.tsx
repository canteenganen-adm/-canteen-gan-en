import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, RotateCcw, Search, X } from "lucide-react";
import { t } from "../../lib/theme";
import { rupiah } from "../../lib/format";
import { bacaNamaCatatan } from "../../lib/siapa";
import { fetchCatatan, pulihkanDariCatatan, type Catatan, type FilterCatatan, type HasilCatatan } from "../../lib/catatan";

/* ============================================================
   CATATAN PERUBAHAN — dibuka dari Kantin → Catatan.
   Daftar semua tambah / ubah / hapus (terbaru dulu): kapan, siapa, apa.
   Ketuk satu baris = lihat isi sebelum/sesudah dan, untuk transaksi & menu,
   "Kembalikan" (hapus → ditulis ulang; ubah → nilai lama dipulihkan).
   Sumber: tabel `catatan` (supabase/migration_15_catatan.sql).
   ============================================================ */

const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const waktuWib = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return `${d.getUTCDate()} ${BLN[d.getUTCMonth()]} · ${String(d.getUTCHours()).padStart(2, "0")}.${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

const LABEL: Record<string, string> = {
  paid: "Lunas", paid_at: "Jam lunas", billed_at: "Ditagih", cancelled_at: "Dibatalkan", deleted_at: "Tong Sampah",
  service_date: "Tanggal layanan", customer: "Pembeli", items: "Isi pesanan", total: "Total", source: "Sumber",
  name: "Nama", price: "Harga", variants: "Ukuran", category: "Kategori", channels: "Tampil di", kategori_ortu: "Kelompok ortu",
};
const tampil = (v: unknown): string => {
  if (v === null || v === undefined) return "kosong";
  if (typeof v === "boolean") return v ? "ya" : "tidak";
  if (typeof v === "number") return v >= 1000 ? rupiah(v) : String(v);
  if (typeof v === "string") return v.length > 40 ? v.slice(0, 40) + "…" : v;
  return JSON.stringify(v).slice(0, 60);
};

function uraian(c: Catatan): string {
  if (c.aksi === "tambah") {
    if (c.tabel === "transaksi") return c.sesudah?.source === "preorder" ? "Pesanan Pre-order masuk" : "Penjualan dicatat";
    return c.tabel === "menu" ? "Menu baru" : "Ditambah";
  }
  if (c.aksi === "hapus") return "Dihapus permanen";
  const s = c.sesudah ?? {};
  const b = c.sebelum ?? {};
  const out: string[] = [];
  if (c.tabel === "transaksi") {
    if ("paid" in s) out.push(s.paid ? "Ditandai Lunas" : "Lunas dibatalkan");
    if ("cancelled_at" in s) out.push(s.cancelled_at ? "Dibatalkan" : "Pembatalan dipulihkan");
    if ("deleted_at" in s) out.push(s.deleted_at ? "Ke Tong Sampah" : "Dipulihkan dari Tong Sampah");
    if ("billed_at" in s) out.push("Ditagih");
    if ("service_date" in s) out.push(`Tanggal layanan ${tampil(b.service_date)} → ${tampil(s.service_date)}`);
    if ("customer" in s) out.push("Data pembeli diubah");
    if ("items" in s) out.push("Isi pesanan diubah");
    if (out.length === 0) out.push(Object.keys(s).map((k) => LABEL[k] ?? k).join(", ") + " diubah");
    return out.join(" · ");
  }
  if (c.tabel === "menu") {
    if ("price" in s) out.push(`Harga ${tampil(b.price)} → ${tampil(s.price)}`);
    if ("variants" in s) out.push("Ukuran/harga diubah");
    if ("name" in s) out.push(`Nama: ${tampil(b.name)} → ${tampil(s.name)}`);
    if ("category" in s) out.push("Kategori diubah");
    if ("channels" in s) out.push("Tampil di diubah");
    if (out.length === 0) out.push(Object.keys(s).map((k) => LABEL[k] ?? k).join(", ") + " diubah");
    return out.join(" · ");
  }
  return "Pengaturan diubah";
}

const CHIP: { id: FilterCatatan; label: string }[] = [
  { id: "semua", label: "Semua" }, { id: "hapus", label: "Hapus" }, { id: "lunas", label: "Lunas" }, { id: "menu", label: "Menu" }, { id: "pengaturan", label: "Pengaturan" },
];
const AKSI_STYLE: Record<Catatan["aksi"], { bg: string; fg: string; label: string }> = {
  tambah: { bg: t.successBg, fg: t.successText, label: "Tambah" },
  ubah: { bg: t.primaryLight, fg: t.amberText, label: "Ubah" },
  hapus: { bg: t.errorBg, fg: t.error, label: "Hapus" },
};

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

          {status === "ok" && baris.map((c) => {
            const a = AKSI_STYLE[c.aksi];
            const terbuka = buka === c.id;
            const bisaPulih = (c.tabel === "transaksi" || c.tabel === "menu") && ((c.aksi === "hapus" && c.sebelum) || (c.aksi === "ubah" && c.sebelum && c.baris_id));
            const nama = bacaNamaCatatan(c.siapa) || (c.aksi === "tambah" && c.tabel === "transaksi" ? "Pemesan" : "Tidak diketahui");
            return (
              <div key={c.id} style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 16, marginBottom: 10, overflow: "hidden" }}>
                <button onClick={() => setBuka(terbuka ? null : c.id)} aria-expanded={terbuka}
                  style={{ display: "flex", width: "100%", gap: 10, alignItems: "flex-start", padding: "12px 14px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: t.text }}>
                  <span style={{ flex: "none", marginTop: 2, background: a.bg, color: a.fg, borderRadius: 999, padding: "0 10px", fontSize: 12.5, fontWeight: 800, lineHeight: "22px" }}>{a.label}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 800, overflowWrap: "anywhere" }}>{c.ket || c.tabel}</div>
                    <div style={{ fontSize: 14, color: t.text2, marginTop: 2 }}>{uraian(c)}</div>
                    <div style={{ fontSize: 12.5, color: t.text2, marginTop: 4 }}>{waktuWib(c.waktu)} · {nama}</div>
                  </div>
                  {terbuka ? <ChevronUp size={18} color={t.text2} style={{ flex: "none", marginTop: 3 }} /> : <ChevronDown size={18} color={t.text2} style={{ flex: "none", marginTop: 3 }} />}
                </button>
                {terbuka && (
                  <div style={{ borderTop: `1px solid ${t.divider}`, padding: "10px 14px 14px", fontSize: 13.5 }}>
                    {c.aksi === "ubah" && c.sesudah && Object.keys(c.sesudah).map((k) => (
                      <div key={k} style={{ padding: "4px 0" }}>
                        <b>{LABEL[k] ?? k}</b>: <span style={{ color: t.text2 }}>{tampil(c.sebelum?.[k])}</span> → <b>{tampil(c.sesudah?.[k])}</b>
                      </div>
                    ))}
                    {c.aksi === "hapus" && c.sebelum && (
                      <div style={{ color: t.text2, overflowWrap: "anywhere" }}>
                        {Object.entries(c.sebelum).filter(([k]) => ["customer", "items", "total", "service_date", "name", "price", "category"].includes(k)).map(([k, v]) => (
                          <div key={k} style={{ padding: "3px 0" }}><b style={{ color: t.text }}>{LABEL[k] ?? k}</b>: {tampil(v)}</div>
                        ))}
                      </div>
                    )}
                    {c.aksi === "tambah" && <div style={{ color: t.text2 }}>Baris baru dibuat.</div>}
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

          {status === "ok" && !habis && baris.length > 0 && (
            <button onClick={() => muat(true)}
              style={{ width: "100%", height: 48, borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
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
