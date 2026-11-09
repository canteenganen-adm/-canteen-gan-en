import { supabase } from "./supabase";

/* Catatan Perubahan — dibaca dari tabel `catatan` (supabase/migration_15_catatan.sql). HANYA membaca (log asli, tanpa pemulihan dari layar). */

export interface Catatan {
  id: number;
  waktu: string;
  tabel: string;
  aksi: "tambah" | "ubah" | "hapus" | "masuk" | "keluar";
  baris_id: string | null;
  ket: string | null;
  siapa: string | null;
  hp: string | null;
  sebelum: Record<string, unknown> | null;
  sesudah: Record<string, unknown> | null;
  /** Baris sintetis dari tabel transaksi untuk pesanan SEBELUM catatan aktif (tidak ada siapa/HP). */
  lama?: boolean;
}

export type FilterCatatan = "semua" | "pesanan" | "ubah" | "hapus" | "lunas" | "menu" | "pengaturan" | "masuk" | "pembaruan";
export const UKURAN_HALAMAN = 60;

export type HasilCatatan =
  | { status: "ok"; baris: Catatan[]; habis: boolean }
  | { status: "belumAktif" }
  | { status: "galat"; pesan: string };

export async function fetchCatatan(opts: { filter: FilterCatatan; q: string; sebelumId?: number }): Promise<HasilCatatan> {
  let qb = supabase.from("catatan").select("*").order("id", { ascending: false }).limit(UKURAN_HALAMAN);
  if (opts.sebelumId) qb = qb.lt("id", opts.sebelumId);
  if (opts.filter === "hapus") qb = qb.eq("aksi", "hapus");
  /* Pesanan = setiap pesanan/penjualan yang MASUK (Pre-order dan Penjualan): siapa, jam, dari HP mana — bukti saat ada tagihan ganda. */
  else if (opts.filter === "pesanan") qb = qb.eq("tabel", "transaksi").eq("aksi", "tambah");
  /* Ubah = perubahan pada pesanan yang sudah ada (tanggal, isi, pembeli, batal, tagih, lunas, dst). */
  else if (opts.filter === "ubah") qb = qb.eq("tabel", "transaksi").eq("aksi", "ubah");
  else if (opts.filter === "lunas") qb = qb.eq("tabel", "transaksi").eq("aksi", "ubah").eq("sesudah->>paid", "true");
  else if (opts.filter === "menu") qb = qb.in("tabel", ["menu", "menu_harian", "menu_stok"]);
  else if (opts.filter === "masuk") qb = qb.eq("tabel", "login");
  else if (opts.filter === "pengaturan") qb = qb.in("tabel", ["app_state", "kelas", "menu_tetap"]);
  const q = opts.q.trim();
  if (q) qb = qb.ilike("ket", `%${q.replace(/[%,()]/g, " ")}%`);
  const { data, error } = await qb;
  if (error) {
    const m = `${error.code ?? ""} ${error.message ?? ""}`;
    if (/PGRST205|42P01|does not exist|schema cache/i.test(m)) return { status: "belumAktif" };
    return { status: "galat", pesan: error.message || "Gagal memuat catatan." };
  }
  const baris = (data ?? []) as Catatan[];
  return { status: "ok", baris, habis: baris.length < UKURAN_HALAMAN };
}

/** Pesanan yang masuk SEBELUM catatan aktif (4 Nov): dibaca langsung dari tabel transaksi, tanpa tahu siapa yang memasukkan. Hanya membaca. */
export async function fetchPesananLama(opts: { q: string; sebelumWaktu?: string }): Promise<{ status: "ok"; baris: Catatan[]; habis: boolean; kursor: string } | { status: "galat"; pesan: string }> {
  let batas = opts.sebelumWaktu;
  if (!batas) {
    const { data, error } = await supabase.from("catatan").select("waktu").eq("tabel", "transaksi").eq("aksi", "tambah").order("id", { ascending: true }).limit(1);
    if (error) return { status: "galat", pesan: error.message || "Gagal memuat pesanan lama." };
    batas = data?.[0]?.waktu ?? new Date().toISOString();
  }
  let qb = supabase.from("transaksi").select("id,source,customer,total,created_at").lt("created_at", batas).order("created_at", { ascending: false }).limit(UKURAN_HALAMAN);
  const q = opts.q.trim();
  if (q) qb = qb.ilike("customer->>nama", `%${q.replace(/[%,()]/g, " ")}%`);
  const { data, error } = await qb;
  if (error) return { status: "galat", pesan: error.message || "Gagal memuat pesanan lama." };
  const rows = (data ?? []) as { id: string; source: string; customer: { nama?: string; kelas?: string }; total: number; created_at: string }[];
  const baris: Catatan[] = rows.map((r, i) => ({
    id: -1 - i - Math.floor(Math.random() * 1e6) * 100, waktu: r.created_at, tabel: "transaksi", aksi: "tambah", baris_id: r.id,
    ket: `${(r.customer?.nama ?? "").trim()}${r.customer?.kelas ? ` ${r.customer.kelas}` : ""} · Rp${r.total} · ${r.source}`,
    siapa: null, hp: null, sebelum: null, sesudah: { source: r.source }, lama: true,
  }));
  return { status: "ok", baris, habis: rows.length < UKURAN_HALAMAN, kursor: rows.length ? rows[rows.length - 1].created_at : batas };
}
