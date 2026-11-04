-- migration_16_catatan_menu_harian.sql — melengkapi CATATAN PERUBAHAN (setelah migration_15)
-- JALANKAN SEKALI di Supabase → SQL Editor. Aman diulang.
--
-- 1) Menyempurnakan fungsi catat_perubahan: ringkasan ("ket") yang terbaca untuk menu_stok, menu_tetap, kelas.
-- 2) Mencatat menu_stok (stok per menu per tanggal) per baris.
-- 3) Mencatat menu_harian (menu yang disimpan untuk satu tanggal) SATU catatan per Simpan, bukan ratusan baris:
--    Simpan menu = hapus isi tanggal itu lalu tulis ulang, jadi tercatat "ditimpa" (isi lama) dan "disimpan" (isi baru),
--    masing-masing berisi daftar menu Pre-order yang aktif.

create or replace function catat_perubahan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  h       jsonb;
  v_siapa text;
  v_hp    text;
  o       jsonb;
  n       jsonb;
  r       jsonb;
  d_old   jsonb := '{}'::jsonb;
  d_new   jsonb := '{}'::jsonb;
  k       text;
  v_id    text;
  v_ket   text;
begin
  begin
    h := current_setting('request.headers', true)::jsonb;
  exception when others then
    h := null;
  end;
  v_siapa := left(h ->> 'x-ganen-siapa', 80);
  v_hp    := left(h ->> 'x-ganen-hp', 20);

  if tg_op = 'INSERT' then
    n := to_jsonb(new); r := n;
  elsif tg_op = 'DELETE' then
    o := to_jsonb(old); r := o;
  else
    o := to_jsonb(old); n := to_jsonb(new); r := n;
  end if;

  v_id := coalesce(r ->> 'id', r ->> 'item_id', r ->> 'tanggal');
  v_ket := case tg_table_name
    when 'transaksi' then trim(coalesce(r -> 'customer' ->> 'nama', '') || ' · Rp' || coalesce(r ->> 'total', '0') || ' · ' || coalesce(r ->> 'source', ''))
    when 'menu'      then r ->> 'name'
    when 'menu_stok' then 'Stok ' || coalesce(r ->> 'tanggal', '') || ' · ' || coalesce((select m.name from menu m where m.id = r ->> 'item_id'), r ->> 'item_id')
    when 'menu_tetap' then 'Menu Tetap · ' || coalesce((select m.name from menu m where m.id = r ->> 'item_id'), r ->> 'item_id')
    when 'app_state' then 'Pengaturan'
    else left(r::text, 80)
  end;

  if tg_op = 'INSERT' then
    insert into catatan (tabel, aksi, baris_id, ket, siapa, hp, sesudah)
    values (tg_table_name, 'tambah', v_id, v_ket, v_siapa, v_hp, n);
  elsif tg_op = 'DELETE' then
    insert into catatan (tabel, aksi, baris_id, ket, siapa, hp, sebelum)
    values (tg_table_name, 'hapus', v_id, v_ket, v_siapa, v_hp, o);
  else
    for k in select jsonb_object_keys(n) loop
      if k <> 'updated_at' and (o -> k) is distinct from (n -> k) then
        d_old := d_old || jsonb_build_object(k, o -> k);
        d_new := d_new || jsonb_build_object(k, n -> k);
      end if;
    end loop;
    if d_new <> '{}'::jsonb then
      insert into catatan (tabel, aksi, baris_id, ket, siapa, hp, sebelum, sesudah)
      values (tg_table_name, 'ubah', v_id, v_ket, v_siapa, v_hp, d_old, d_new);
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_catat_menu_stok on menu_stok;
create trigger trg_catat_menu_stok after insert or update or delete on menu_stok
  for each row execute function catat_perubahan();

-- menu_harian: satu catatan per perintah (bukan per baris)
create or replace function catat_menu_harian_lama()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  h jsonb; v_siapa text; v_hp text; v_tgl text; v_n int; v_aktif jsonb;
begin
  begin h := current_setting('request.headers', true)::jsonb; exception when others then h := null; end;
  v_siapa := left(h ->> 'x-ganen-siapa', 80);
  v_hp    := left(h ->> 'x-ganen-hp', 20);
  select string_agg(distinct tanggal::text, ', '), count(*), coalesce(jsonb_agg(nama order by nama) filter (where tersedia_preorder), '[]'::jsonb)
    into v_tgl, v_n, v_aktif from lama;
  if v_n > 0 then
    insert into catatan (tabel, aksi, baris_id, ket, siapa, hp, sebelum)
    values ('menu_harian', 'hapus', v_tgl, 'Menu ' || v_tgl || ' ditimpa (isi lama: ' || jsonb_array_length(v_aktif) || ' aktif Pre-order)', v_siapa, v_hp,
            jsonb_build_object('tanggal', v_tgl, 'baris', v_n, 'aktif_preorder', v_aktif));
  end if;
  return null;
end;
$$;

create or replace function catat_menu_harian_baru()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  h jsonb; v_siapa text; v_hp text; v_tgl text; v_n int; v_aktif jsonb;
begin
  begin h := current_setting('request.headers', true)::jsonb; exception when others then h := null; end;
  v_siapa := left(h ->> 'x-ganen-siapa', 80);
  v_hp    := left(h ->> 'x-ganen-hp', 20);
  select string_agg(distinct tanggal::text, ', '), count(*), coalesce(jsonb_agg(nama order by nama) filter (where tersedia_preorder), '[]'::jsonb)
    into v_tgl, v_n, v_aktif from baru;
  if v_n > 0 then
    insert into catatan (tabel, aksi, baris_id, ket, siapa, hp, sesudah)
    values ('menu_harian', 'tambah', v_tgl, 'Menu ' || v_tgl || ' disimpan (' || jsonb_array_length(v_aktif) || ' aktif Pre-order)', v_siapa, v_hp,
            jsonb_build_object('tanggal', v_tgl, 'baris', v_n, 'aktif_preorder', v_aktif));
  end if;
  return null;
end;
$$;

drop trigger if exists trg_catat_menu_harian_hapus on menu_harian;
create trigger trg_catat_menu_harian_hapus after delete on menu_harian
  referencing old table as lama for each statement execute function catat_menu_harian_lama();

drop trigger if exists trg_catat_menu_harian_tambah on menu_harian;
create trigger trg_catat_menu_harian_tambah after insert on menu_harian
  referencing new table as baru for each statement execute function catat_menu_harian_baru();

-- PEMERIKSAAN (jalankan terpisah sesudahnya; harus menampilkan 8 baris):
-- select tgname, tgrelid::regclass as tabel from pg_trigger where tgname like 'trg_catat%' order by 2, 1;
