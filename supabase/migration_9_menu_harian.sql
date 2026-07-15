-- Canteen Gan En — Migrasi #9: MENU HARIAN + HISTORY
-- Jalankan di Supabase SQL Editor. Aman dijalankan ulang.
--
-- Setiap tanggal punya daftar menu SENDIRI yang tersimpan permanen
-- (snapshot nama/kategori/harga/varian) — history tetap akurat walau
-- item master diedit/dihapus belakangan. Disimpan lewat tombol
-- "Simpan" eksplisit di tab Menu (kertas PO), bukan auto-save.

create table if not exists menu_harian (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null,
  item_id text not null,                 -- id item di tabel menu (tanpa FK: snapshot harus awet)
  nama text not null,
  kategori text not null,                -- kategori admin saat disimpan
  kategori_ortu text,                    -- kategori versi ortu saat disimpan
  price integer,                         -- null jika pakai varian
  variants jsonb not null default '[]'::jsonb,
  tersedia_preorder boolean not null default false,
  tersedia_penjualan boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tanggal, item_id)
);
create index if not exists idx_menu_harian_tanggal on menu_harian (tanggal);

alter table menu_harian enable row level security;
drop policy if exists "anon full access" on menu_harian;
create policy "anon full access" on menu_harian for all using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'menu_harian'
  ) then
    alter publication supabase_realtime add table menu_harian;
  end if;
end $$;

-- ============================================================
-- Migrasi awal (sekali jalan): snapshot menu yang sedang aktif
-- ke HARI INI (WIB) dan tanggal sesi PO aktif — supaya operasional
-- tidak terputus begitu sistem baru berlaku.
-- ============================================================
insert into menu_harian (tanggal, item_id, nama, kategori, kategori_ortu, price, variants, tersedia_preorder, tersedia_penjualan)
select d.tanggal, m.id, m.name, m.category, m.kategori_ortu, m.price, m.variants,
       coalesce((m.channels->>'preorder')::boolean, false),
       coalesce((m.channels->>'sales')::boolean, false)
from menu m
cross join (
  select (now() at time zone 'Asia/Jakarta')::date as tanggal
  union
  select service_date from app_state where id = 1
) d
where coalesce((m.channels->>'preorder')::boolean, false)
   or coalesce((m.channels->>'sales')::boolean, false)
on conflict (tanggal, item_id) do nothing;
