-- rollback_18_login.sql — KEMBALIKAN akses lama (sebelum login). Jalankan SEKALI di Supabase → SQL Editor. Aman diulang.
-- Dipakai bila migration_18_login.sql dijalankan SEBELUM login diaktifkan di perangkat kasir (layar kasir kosong / "Gagal menyimpan").
-- Sesudah ini aplikasi kembali normal seperti sebelum migration 18. Fungsi kirim_preorder dan penjaga lain tidak diubah.

do $$
declare
  tb text;
begin
  foreach tb in array array['menu', 'menu_harian', 'menu_stok', 'menu_tetap', 'kelas', 'app_state'] loop
    execute format('drop policy if exists "baca publik" on %I', tb);
    execute format('drop policy if exists "kasir tulis" on %I', tb);
    execute format('drop policy if exists "anon full access" on %I', tb);
    execute format('create policy "anon full access" on %I for all using (true) with check (true)', tb);
  end loop;
end $$;

drop policy if exists "kasir baca transaksi" on transaksi;
drop policy if exists "kasir tambah transaksi" on transaksi;
drop policy if exists "kasir ubah transaksi" on transaksi;
drop policy if exists "kasir hapus dari tong sampah" on transaksi;
drop policy if exists "transaksi baca" on transaksi;
drop policy if exists "transaksi tambah" on transaksi;
drop policy if exists "transaksi ubah" on transaksi;
drop policy if exists "transaksi hapus dari tong sampah" on transaksi;
create policy "transaksi baca" on transaksi for select using (true);
create policy "transaksi tambah" on transaksi for insert with check (true);
create policy "transaksi ubah" on transaksi for update using (true) with check (true);
create policy "transaksi hapus dari tong sampah" on transaksi for delete using (deleted_at is not null);

drop policy if exists "kasir baca catatan" on catatan;
drop policy if exists "baca catatan" on catatan;
create policy "baca catatan" on catatan for select using (true);

-- PEMERIKSAAN: harus 4 aturan di transaksi, dan tidak ada lagi "kasir ..." / "baca publik":
--   select tablename, policyname from pg_policies where schemaname = 'public' order by 1, 2;
