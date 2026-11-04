import { supabase } from "./supabase";

/* Catatan Perubahan — dibaca dari tabel `catatan` (supabase/migration_15_catatan.sql). Hanya membaca; pemulihan menulis ke tabel aslinya. */

export interface Catatan {
  id: number;
  waktu: string;
  tabel: string;
  aksi: "tambah" | "ubah" | "hapus";
  baris_id: string | null;
  ket: string | null;
  siapa: string | null;
  hp: string | null;
  sebelum: Record<string, unknown> | null;
  sesudah: Record<string, unknown> | null;
}

export type FilterCatatan = "semua" | "hapus" | "lunas" | "menu" | "pengaturan";
export const UKURAN_HALAMAN = 60;

export type HasilCatatan =
  | { status: "ok"; baris: Catatan[]; habis: boolean }
  | { status: "belumAktif" }
  | { status: "galat"; pesan: string };

export async function fetchCatatan(opts: { filter: FilterCatatan; q: string; sebelumId?: number }): Promise<HasilCatatan> {
  let qb = supabase.from("catatan").select("*").order("id", { ascending: false }).limit(UKURAN_HALAMAN);
  if (opts.sebelumId) qb = qb.lt("id", opts.sebelumId);
  if (opts.filter === "hapus") qb = qb.eq("aksi", "hapus");
  else if (opts.filter === "lunas") qb = qb.eq("tabel", "transaksi").eq("aksi", "ubah").eq("sesudah->>paid", "true");
  else if (opts.filter === "menu") qb = qb.in("tabel", ["menu", "menu_harian", "menu_stok"]);
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

/** Kembalikan: hapus → tulis ulang barisnya; ubah → pulihkan nilai lama. Hanya transaksi dan menu. */
export async function pulihkanDariCatatan(c: Catatan): Promise<void> {
  if (c.tabel !== "transaksi" && c.tabel !== "menu") throw new Error("Hanya transaksi dan menu yang bisa dikembalikan dari sini.");
  if (c.aksi === "hapus" && c.sebelum) {
    const { error } = await supabase.from(c.tabel).insert(c.sebelum);
    if (error) throw new Error(error.message);
  } else if (c.aksi === "ubah" && c.sebelum && c.baris_id) {
    const { error } = await supabase.from(c.tabel).update(c.sebelum).eq("id", c.baris_id);
    if (error) throw new Error(error.message);
  } else {
    throw new Error("Catatan ini tidak bisa dikembalikan.");
  }
}
