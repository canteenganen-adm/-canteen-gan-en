-- migration_17_pengamanan.sql — PENGAMANAN DATA (tanpa login; mengurangi kerusakan bila kunci publik disalahgunakan)
-- JALANKAN SEKALI di Supabase → SQL Editor, SESUDAH migration_15 dan 16. Aman diulang (idempotent).
--
-- Yang dilakukan:
--  1. Mencabut hak TRUNCATE / REFERENCES / TRIGGER dari kunci publik (tidak dipakai aplikasi).
--  2. transaksi: HAPUS hanya boleh pada baris yang sudah di Tong Sampah (deleted_at terisi). Menghapus massal
--     transaksi aktif lewat kunci publik jadi ditolak. Alur aplikasi tidak berubah: Hapus → Tong Sampah → Hapus Sekarang.
--  3. Validasi di SERVER (bukan hanya di layar): transaksi baru harus bertotal > 0, harga item >= Rp1.000, jumlah 1..99,
--     paling banyak 60 item, nama pembeli <= 100 huruf. Hanya diperiksa saat baris BARU atau saat item/total/pembeli
--     BERUBAH, jadi data lama yang janggal tetap bisa ditandai Lunas dsb.
--  4. menu: harga dan harga ukuran >= Rp1.000 (hanya diperiksa saat harga/ukuran berubah).
--  5. Pembatas laju pesanan Pre-order: paling banyak 60 pesanan per menit di seluruh sistem (puncak nyata: 5 per menit),
--     supaya penyalahgunaan link /pesan tidak membanjiri database.
--
-- CARA MEMBATALKAN (bila ada masalah): jalankan blok "ROLLBACK" di paling bawah berkas ini.

-- 1. Cabut hak berbahaya
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- 2. transaksi: pisahkan aturan akses (hapus hanya dari Tong Sampah)
drop policy if exists "anon full access" on transaksi;
drop policy if exists "transaksi baca" on transaksi;
drop policy if exists "transaksi tambah" on transaksi;
drop policy if exists "transaksi ubah" on transaksi;
drop policy if exists "transaksi hapus dari tong sampah" on transaksi;
create policy "transaksi baca" on transaksi for select using (true);
create policy "transaksi tambah" on transaksi for insert with check (true);
create policy "transaksi ubah" on transaksi for update using (true) with check (true);
create policy "transaksi hapus dari tong sampah" on transaksi for delete using (deleted_at is not null);

-- 3. Validasi transaksi
create or replace function validasi_transaksi()
returns trigger
language plpgsql
as $$
declare
  it jsonb;
begin
  -- Isi pesanan: diperiksa saat baris BARU atau saat items/total BERUBAH (data lama yang janggal tidak ikut terhalang)
  if tg_op = 'INSERT'
     or new.items is distinct from old.items
     or new.total is distinct from old.total then
    if new.total is null or new.total <= 0 then
      raise exception 'Total pesanan harus lebih dari Rp0.' using errcode = 'P0001';
    end if;
    if new.total > 5000000 then
      raise exception 'Total pesanan terlalu besar.' using errcode = 'P0001';
    end if;
    if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) = 0 or jsonb_array_length(new.items) > 60 then
      raise exception 'Isi pesanan tidak valid.' using errcode = 'P0001';
    end if;
    for it in select * from jsonb_array_elements(new.items) loop
      if (it ->> 'price') is null or (it ->> 'price')::numeric < 1000 then
        raise exception 'Harga item minimal Rp1.000.' using errcode = 'P0001';
      end if;
      if (it ->> 'qty') is null or (it ->> 'qty')::numeric < 1 or (it ->> 'qty')::numeric > 99 then
        raise exception 'Jumlah item harus 1 sampai 99.' using errcode = 'P0001';
      end if;
    end loop;
  end if;

  -- Data pembeli: diperiksa saat baris BARU atau saat customer BERUBAH
  if tg_op = 'INSERT' or new.customer is distinct from old.customer then
    if length(coalesce(new.customer ->> 'nama', '')) > 100 then
      raise exception 'Nama terlalu panjang.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validasi_transaksi on transaksi;
create trigger trg_validasi_transaksi
before insert or update on transaksi
for each row
execute function validasi_transaksi();

-- 4. Validasi harga menu
create or replace function validasi_menu()
returns trigger
language plpgsql
as $$
declare
  v jsonb;
begin
  if tg_op = 'UPDATE'
     and new.price is not distinct from old.price
     and new.variants is not distinct from old.variants then
    return new;
  end if;

  if new.price is not null and new.price < 1000 then
    raise exception 'Harga menu minimal Rp1.000.' using errcode = 'P0001';
  end if;
  for v in select * from jsonb_array_elements(coalesce(new.variants, '[]'::jsonb)) loop
    if (v ->> 'price') is null or (v ->> 'price')::numeric < 1000 then
      raise exception 'Harga ukuran minimal Rp1.000.' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_validasi_menu on menu;
create trigger trg_validasi_menu
before insert or update on menu
for each row
execute function validasi_menu();

-- 5. Pembatas laju pesanan Pre-order
create or replace function batasi_laju_preorder()
returns trigger
language plpgsql
as $$
begin
  if new.source = 'preorder' then
    if (select count(*) from transaksi where source = 'preorder' and created_at > now() - interval '1 minute') >= 60 then
      raise exception 'Terlalu banyak pesanan sekaligus. Coba lagi sebentar.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_batasi_laju_preorder on transaksi;
create trigger trg_batasi_laju_preorder
before insert on transaksi
for each row
execute function batasi_laju_preorder();

-- PEMERIKSAAN (jalankan terpisah sesudahnya):
--   select tgname from pg_trigger where tgname in ('trg_validasi_transaksi','trg_validasi_menu','trg_batasi_laju_preorder') order by 1;   -- 3 baris
--   select policyname, cmd from pg_policies where tablename = 'transaksi' order by 1;                                                  -- 4 baris

-- ROLLBACK (hanya bila perlu; jalankan blok ini saja):
--   drop trigger if exists trg_validasi_transaksi on transaksi;
--   drop trigger if exists trg_validasi_menu on menu;
--   drop trigger if exists trg_batasi_laju_preorder on transaksi;
--   drop policy if exists "transaksi baca" on transaksi;
--   drop policy if exists "transaksi tambah" on transaksi;
--   drop policy if exists "transaksi ubah" on transaksi;
--   drop policy if exists "transaksi hapus dari tong sampah" on transaksi;
--   create policy "anon full access" on transaksi for all using (true) with check (true);
