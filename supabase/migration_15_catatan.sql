-- migration_15_catatan.sql — CATATAN PERUBAHAN (audit log)
-- JALANKAN SEKALI di Supabase → SQL Editor. Aman diulang (idempotent).
--
-- Mencatat setiap tambah / ubah / hapus pada tabel transaksi, menu, app_state, kelas, menu_tetap:
-- kapan, siapa (nama yang dipilih di HP + kode HP), dan isi sebelum/sesudahnya.
-- Hapus permanen pun tercatat LENGKAP dengan isi barisnya, jadi bisa dikembalikan dari layar Catatan Perubahan.
-- (menu_stok dan menu_harian dicatat lewat migration_16_catatan_menu_harian.sql, JALANKAN setelah file ini.)
--
-- Nama & kode HP dikirim aplikasi lewat header HTTP x-ganen-siapa / x-ganen-hp dan dibaca trigger dari request.headers.
-- Catatan DILINDUNGI: kunci publik hanya boleh MEMBACA catatan; tidak bisa menambah, mengubah, atau menghapusnya
-- (hanya trigger di bawah, yang berjalan sebagai pemilik database, yang bisa menulis).

create table if not exists catatan (
  id       bigint generated always as identity primary key,
  waktu    timestamptz not null default now(),
  tabel    text not null,
  aksi     text not null check (aksi in ('tambah', 'ubah', 'hapus')),
  baris_id text,
  ket      text,          -- ringkasan baris: "Nama · Rp… · sumber" (transaksi) / nama menu
  siapa    text,          -- nama yang dipilih di HP (URL-encoded); null = tidak diketahui
  hp       text,          -- kode acak per HP
  sebelum  jsonb,         -- ubah: nilai lama kolom yang berubah · hapus: seluruh baris
  sesudah  jsonb          -- ubah: nilai baru kolom yang berubah · tambah: seluruh baris
);

create index if not exists catatan_waktu_idx on catatan (id desc);
create index if not exists catatan_tabel_idx on catatan (tabel, id desc);
create index if not exists catatan_baris_idx on catatan (tabel, baris_id);

alter table catatan enable row level security;
drop policy if exists "baca catatan" on catatan;
create policy "baca catatan" on catatan for select using (true);
revoke insert, update, delete, truncate on catatan from anon, authenticated;

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
    else null
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

  return null; -- trigger AFTER: nilai kembalian diabaikan
end;
$$;

drop trigger if exists trg_catat_transaksi on transaksi;
create trigger trg_catat_transaksi after insert or update or delete on transaksi
  for each row execute function catat_perubahan();

drop trigger if exists trg_catat_menu on menu;
create trigger trg_catat_menu after insert or update or delete on menu
  for each row execute function catat_perubahan();

drop trigger if exists trg_catat_app_state on app_state;
create trigger trg_catat_app_state after insert or update or delete on app_state
  for each row execute function catat_perubahan();

drop trigger if exists trg_catat_kelas on kelas;
create trigger trg_catat_kelas after insert or update or delete on kelas
  for each row execute function catat_perubahan();

drop trigger if exists trg_catat_menu_tetap on menu_tetap;
create trigger trg_catat_menu_tetap after insert or update or delete on menu_tetap
  for each row execute function catat_perubahan();
