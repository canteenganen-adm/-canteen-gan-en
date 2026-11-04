-- migration_18_login.sql — LOGIN KASIR + AKSES PER PERAN  (menutup pembacaan/penulisan data oleh kunci publik)
-- JALANKAN SEKALI di Supabase → SQL Editor, SESUDAH migration_15, 16, 17.
--
-- !!! URUTAN WAJIB — jangan melompat !!!
--   1. Buat akun kasir di Supabase (Authentication → Users → Add user, centang Auto Confirm User):
--        mama@kantin.gan-en.app · papa@kantin.gan-en.app · ching@kantin.gan-en.app  (masing-masing kata sandi sendiri)
--   2. Di Vercel tambahkan variabel VITE_WAJIB_LOGIN = 1 lalu Redeploy.
--   3. Buka /dapur-gan-en di SEMUA perangkat kasir, masuk dengan nama + kata sandi, pastikan semuanya normal.
--   4. BARU jalankan berkas ini. Bila ada yang rusak: jalankan blok ROLLBACK di paling bawah.
--
-- Hasilnya:
--   * Orang tua (/pesan, tanpa login, peran "anon") hanya boleh MEMBACA menu, menu harian, stok, kelas, pengaturan sesi,
--     dan MENGIRIM pesanan lewat fungsi kirim_preorder. TIDAK bisa membaca / mengubah / menghapus transaksi.
--   * Kasir (login, peran "authenticated") boleh semuanya. Hapus transaksi tetap hanya dari Tong Sampah.
--   * Catatan hanya terbaca kasir. Nama di Catatan untuk kasir diambil dari AKUN (tidak bisa dipalsukan).

-- ============ A. Fungsi aman: kirim pesanan Pre-order ============
create or replace function kirim_preorder(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r transaksi;
  hasil jsonb;
begin
  -- Hanya pesanan Pre-order baru, belum dibayar. Penanda lain dikosongkan. Penjaga sesi, stok, validasi, dan laju tetap berlaku (trigger).
  r := jsonb_populate_record(
         null::transaksi,
         (p - 'cancelled_at' - 'deleted_at' - 'billed_at' - 'paid_at' - 'packed_at')
         || jsonb_build_object('source', 'preorder', 'paid', false, 'packed', false)
       );
  insert into transaksi select (r).* returning to_jsonb(transaksi.*) into hasil;
  return hasil;
end;
$$;
revoke all on function kirim_preorder(jsonb) from public;
grant execute on function kirim_preorder(jsonb) to anon, authenticated;

-- ============ B. Aturan akses ============
do $$
declare
  tb text;
begin
  foreach tb in array array['menu', 'menu_harian', 'menu_stok', 'menu_tetap', 'kelas', 'app_state'] loop
    execute format('drop policy if exists "anon full access" on %I', tb);
    execute format('drop policy if exists "baca publik" on %I', tb);
    execute format('drop policy if exists "kasir tulis" on %I', tb);
    execute format('create policy "baca publik" on %I for select to anon, authenticated using (true)', tb);
    execute format('create policy "kasir tulis" on %I for all to authenticated using (true) with check (true)', tb);
  end loop;
end $$;

drop policy if exists "anon full access" on transaksi;
drop policy if exists "transaksi baca" on transaksi;
drop policy if exists "transaksi tambah" on transaksi;
drop policy if exists "transaksi ubah" on transaksi;
drop policy if exists "transaksi hapus dari tong sampah" on transaksi;
drop policy if exists "kasir baca transaksi" on transaksi;
drop policy if exists "kasir tambah transaksi" on transaksi;
drop policy if exists "kasir ubah transaksi" on transaksi;
drop policy if exists "kasir hapus dari tong sampah" on transaksi;
create policy "kasir baca transaksi" on transaksi for select to authenticated using (true);
create policy "kasir tambah transaksi" on transaksi for insert to authenticated with check (true);
create policy "kasir ubah transaksi" on transaksi for update to authenticated using (true) with check (true);
create policy "kasir hapus dari tong sampah" on transaksi for delete to authenticated using (deleted_at is not null);

drop policy if exists "baca catatan" on catatan;
drop policy if exists "kasir baca catatan" on catatan;
create policy "kasir baca catatan" on catatan for select to authenticated using (true);

-- ============ C. Nama di Catatan dari AKUN (bukan header yang bisa dipalsukan) ============
create or replace function ganen_siapa()
returns text
language plpgsql
stable
as $$
declare
  h jsonb;
  jwt jsonb;
  v_email text;
begin
  begin h := current_setting('request.headers', true)::jsonb; exception when others then h := null; end;
  begin jwt := current_setting('request.jwt.claims', true)::jsonb; exception when others then jwt := null; end;
  v_email := jwt ->> 'email';
  if v_email is not null and (jwt ->> 'role') = 'authenticated' then
    return left(initcap(split_part(v_email, '@', 1)), 80);
  end if;
  return left(h ->> 'x-ganen-siapa', 80);
end;
$$;

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
  begin h := current_setting('request.headers', true)::jsonb; exception when others then h := null; end;
  v_siapa := ganen_siapa();
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
  v_siapa := ganen_siapa();
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
  v_siapa := ganen_siapa();
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

-- PEMERIKSAAN (jalankan terpisah sesudahnya):
--   select tablename, policyname, roles from pg_policies where schemaname = 'public' order by 1, 2;
--   (tidak boleh ada lagi "anon full access"; transaksi hanya punya 4 aturan "kasir ...")

-- ROLLBACK (hanya bila perlu; jalankan blok ini saja — mengembalikan akses lama):
--   do $$ declare tb text; begin
--     foreach tb in array array['menu','menu_harian','menu_stok','menu_tetap','kelas','app_state'] loop
--       execute format('drop policy if exists "baca publik" on %I', tb);
--       execute format('drop policy if exists "kasir tulis" on %I', tb);
--       execute format('create policy "anon full access" on %I for all using (true) with check (true)', tb);
--     end loop; end $$;
--   drop policy if exists "kasir baca transaksi" on transaksi;
--   drop policy if exists "kasir tambah transaksi" on transaksi;
--   drop policy if exists "kasir ubah transaksi" on transaksi;
--   drop policy if exists "kasir hapus dari tong sampah" on transaksi;
--   create policy "transaksi baca" on transaksi for select using (true);
--   create policy "transaksi tambah" on transaksi for insert with check (true);
--   create policy "transaksi ubah" on transaksi for update using (true) with check (true);
--   create policy "transaksi hapus dari tong sampah" on transaksi for delete using (deleted_at is not null);
--   drop policy if exists "kasir baca catatan" on catatan;
--   create policy "baca catatan" on catatan for select using (true);
