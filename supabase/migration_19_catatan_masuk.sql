-- migration_19_catatan_masuk.sql — CATAT MASUK / KELUAR (login) di Catatan Perubahan
-- JALANKAN SEKALI di Supabase → SQL Editor. Aman diulang. Tidak mengubah data atau aturan akses yang ada.
--
-- Setiap kali seseorang berhasil masuk atau keluar dari aplikasi kasir, aplikasi memanggil fungsi catat_masuk:
-- tercatat NAMA (dari akun, tidak bisa dipalsukan), JAM (server), dan jenis perangkat ("Laptop Windows · Chrome").
-- Percobaan masuk yang GAGAL tidak tercatat di sini (pemanggilnya belum login); lihat Supabase → Logs → Auth.

alter table catatan drop constraint if exists catatan_aksi_check;
alter table catatan add constraint catatan_aksi_check check (aksi in ('tambah', 'ubah', 'hapus', 'masuk', 'keluar'));

create or replace function catat_masuk(p_aksi text, p_info text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h   jsonb;
  jwt jsonb;
begin
  begin jwt := current_setting('request.jwt.claims', true)::jsonb; exception when others then jwt := null; end;
  begin h   := current_setting('request.headers', true)::jsonb;    exception when others then h := null; end;
  -- Hanya akun yang sudah login, dan hanya dua jenis kejadian ini
  if (jwt ->> 'role') is distinct from 'authenticated' then return; end if;
  if p_aksi not in ('masuk', 'keluar') then return; end if;
  insert into catatan (tabel, aksi, ket, siapa, hp)
  values ('login', p_aksi, left(coalesce(p_info, ''), 80), left(initcap(split_part(coalesce(jwt ->> 'email', ''), '@', 1)), 80), left(h ->> 'x-ganen-hp', 20));
end;
$$;

revoke all on function catat_masuk(text, text) from public;
grant execute on function catat_masuk(text, text) to authenticated;

-- PEMERIKSAAN: select proname from pg_proc where proname = 'catat_masuk';   -- 1 baris
-- ROLLBACK: drop function if exists catat_masuk(text, text);
--           alter table catatan drop constraint if exists catatan_aksi_check;
--           alter table catatan add constraint catatan_aksi_check check (aksi in ('tambah', 'ubah', 'hapus'));
--           (hapus dulu baris login bila ada: delete from catatan where tabel = 'login';)
