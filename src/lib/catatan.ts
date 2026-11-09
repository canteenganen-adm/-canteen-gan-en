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
}

export type FilterCatatan = "semua" | "pesanan" | "ubah" | "hapus" | "lunas" | "menu" | "pengaturan" | "masuk";
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
