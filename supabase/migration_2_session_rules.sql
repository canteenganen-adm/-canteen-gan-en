-- Canteen Gan En — Migrasi #2: sesi PO tunggal + penegakan di server
-- Jalankan SETELAH schema.sql + seed.sql (yang sudah pernah dijalankan).
-- Aman dijalankan ulang (pakai IF NOT EXISTS / CREATE OR REPLACE / DROP...IF EXISTS).

-- ============================================================
-- app_state: tambah jam tutup otomatis
-- ============================================================
alter table app_state add column if not exists auto_close_time time not null default '08:00:00';

-- ============================================================
-- kelas — daftar kelas per Tingkat, dikelola admin di Pengaturan.
-- Dipakai sebagai sumber picker Kelas di form orang tua — orang tua
-- TIDAK BISA mengetik/menambah kelas sendiri.
-- ============================================================
create table if not exists kelas (
  id text primary key,
  tingkat text not null,
  nama text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_kelas_tingkat on kelas (tingkat);

alter table kelas enable row level security;
drop policy if exists "anon full access" on kelas;
create policy "anon full access" on kelas for all using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kelas'
  ) then
    alter publication supabase_realtime add table kelas;
  end if;
end $$;

-- ============================================================
-- Penegakan sesi PO di SERVER (bukan sekadar di layar).
-- Berlaku untuk transaksi source='preorder' — cakupan pemesanan
-- Pre-order lewat link orang tua. Ini adalah BEFORE INSERT TRIGGER
-- di level database: berlaku untuk SEMUA jalur insert (lewat app,
-- lewat REST langsung, dsb) — tidak bisa dilewati dari sisi klien.
--
-- Aturan:
--   1. Ditolak kalau sesi sedang preorder_open = false.
--   2. Ditolak kalau hari ini (WIB) = service_date sesi DAN jam
--      sekarang (WIB) sudah lewat auto_close_time (auto-tutup).
--   3. service_date pada baris transaksi SELALU ditimpa dengan
--      service_date sesi aktif di server — nilai yang dikirim
--      klien tidak pernah dipercaya.
-- ============================================================
create or replace function enforce_preorder_session()
returns trigger
language plpgsql
as $$
declare
  st app_state%rowtype;
  wib_now timestamp;
  wib_today date;
  wib_time time;
begin
  if new.source <> 'preorder' then
    return new;
  end if;

  select * into st from app_state where id = 1;

  if st.preorder_open is not true then
    raise exception 'Pre-order sedang ditutup.' using errcode = 'P0001';
  end if;

  wib_now := now() at time zone 'Asia/Jakarta';
  wib_today := wib_now::date;
  wib_time := wib_now::time;

  if wib_today = st.service_date and wib_time >= st.auto_close_time then
    raise exception 'Pre-order untuk tanggal ini sudah ditutup otomatis (lewat jam %).', to_char(st.auto_close_time, 'HH24:MI') using errcode = 'P0001';
  end if;

  new.service_date := st.service_date;

  return new;
end;
$$;

drop trigger if exists trg_enforce_preorder_session on transaksi;
create trigger trg_enforce_preorder_session
before insert on transaksi
for each row
execute function enforce_preorder_session();
