-- Canteen Gan En — Migrasi #12: MENU TETAP
-- Jalankan di Supabase SQL Editor. Aman dijalankan ulang.
--
-- Daftar menu yang sering dipakai, supaya Mama tidak perlu mencentang menu
-- yang sama dari awal setiap hari. Tabel TERPISAH dari `menu` (tanpa mengubah
-- kolom menu), jadi kalau tabel ini belum ada, aplikasi tetap jalan normal
-- dan fitur Menu Tetap hanya tidak tampil.
--
-- Menu tetap TIDAK otomatis dijual: tombol "Pakai Menu Tetap" hanya mengisi
-- DRAFT di tab Menu; baru berlaku setelah Mama menekan Simpan.

create table if not exists menu_tetap (
  item_id text primary key references menu(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table menu_tetap enable row level security;
drop policy if exists "anon full access" on menu_tetap;
create policy "anon full access" on menu_tetap for all using (true) with check (true);
