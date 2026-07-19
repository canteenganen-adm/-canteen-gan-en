-- Canteen Gan En — skema Supabase
-- Jalankan di Supabase Dashboard: SQL Editor -> New query -> paste semua -> Run

-- ============================================================
-- menu — Master Menu (source of truth)
-- ============================================================
create table if not exists menu (
  id text primary key,
  name text not null,
  category text not null,
  price integer,                                  -- null jika menu ini pakai varian
  variants jsonb not null default '[]'::jsonb,     -- [{id,name,price}]
  channels jsonb not null default '{"preorder":true,"sales":true}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- transaksi — Penjualan + Pre-order (items = snapshot, tidak berubah
-- walau harga di tabel menu berubah kemudian)
-- ============================================================
create table if not exists transaksi (
  id text primary key,
  source text not null check (source in ('preorder', 'penjualan')),
  paid boolean not null default false,
  customer jsonb not null,                          -- {nama, kelas, wa?, tingkat?}
  items jsonb not null,                             -- [{name, variant?, price, qty, note?}] snapshot
  total integer not null,
  created_at timestamptz not null default now(),
  label text not null,                              -- label tanggal+waktu siap-tampil
  service_date date,                                -- hanya untuk source='preorder'
  waktu_ambil text,                                 -- hanya untuk source='preorder'
  packed boolean default false,                     -- hanya untuk source='preorder'
  order_no text,                                    -- PO-XXXXXX, hanya untuk source='preorder'
  cancelled_at timestamptz                          -- diisi saat "Batalkan Transaksi" (soft-delete, untuk Riwayat/audit)
);

create index if not exists idx_transaksi_paid on transaksi (paid);
create index if not exists idx_transaksi_source_date on transaksi (source, service_date);

-- ============================================================
-- app_state — satu baris tunggal = SATU SESI PO AKTIF (tanggal +
-- status jadi satu) + preset Waktu Ambil + Pengaturan kantin.
-- Constraint id=1 sekaligus menegakkan "hanya satu sesi aktif".
-- ============================================================
create table if not exists app_state (
  id smallint primary key default 1 check (id = 1),   -- kunci: cuma boleh 1 baris
  preorder_open boolean not null default true,
  service_date date not null default current_date,
  auto_close_time time not null default '08:00:00',   -- jam tutup otomatis pada hari layanan
  pickup_presets jsonb not null default '["Istirahat 1","Istirahat 2","Istirahat 3","Pulang Sekolah"]'::jsonb,
  nama_kantin text not null default 'Kantin Gan En',
  whatsapp text not null default '',
  printer_connected boolean not null default false,
  reopen_until timestamptz                             -- "Buka Lagi" sementara setelah tutup otomatis (migration_7)
);

insert into app_state (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- kelas — daftar kelas per Tingkat, dikelola admin (Pengaturan).
-- Sumber picker Kelas di form orang tua — orang tua tidak bisa
-- mengetik/menambah kelas sendiri.
-- ============================================================
create table if not exists kelas (
  id text primary key,
  tingkat text not null,
  nama text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_kelas_tingkat on kelas (tingkat);

-- ============================================================
-- Row Level Security
-- App ini TANPA sistem login (sesuai Decision Lock) — admin dan
-- orang tua (lewat link /pesan) sama-sama akses pakai anon key.
-- RLS diaktifkan (praktik baik) tapi policy dibuat permisif penuh
-- untuk role anon, supaya perilaku app tetap sama seperti sekarang.
-- Catatan: ini cocok untuk tool internal satu kantin: karena tidak
-- ada auth, siapa pun yang tahu Project URL + anon key bisa
-- baca/tulis data. Beri tahu pengguna jika butuh proteksi lebih.
-- ============================================================
alter table menu enable row level security;
alter table transaksi enable row level security;
alter table app_state enable row level security;
alter table kelas enable row level security;

create policy "anon full access" on menu for all using (true) with check (true);
create policy "anon full access" on transaksi for all using (true) with check (true);
create policy "anon full access" on app_state for all using (true) with check (true);
create policy "anon full access" on kelas for all using (true) with check (true);

-- ============================================================
-- Realtime — supaya perubahan (pesanan baru dari /pesan, status
-- dibuka/ditutup, dst.) langsung terlihat di layar admin tanpa
-- refresh manual.
-- ============================================================
alter publication supabase_realtime add table menu;
alter publication supabase_realtime add table transaksi;
alter publication supabase_realtime add table app_state;
alter publication supabase_realtime add table kelas;

-- ============================================================
-- Penegakan sesi PO di SERVER (bukan sekadar di layar). Lihat
-- supabase/migration_2_session_rules.sql untuk penjelasan lengkap.
-- BEFORE INSERT trigger di level database — berlaku untuk SEMUA
-- jalur insert ke transaksi (lewat app maupun REST langsung),
-- tidak bisa dilewati dari sisi klien.
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

  -- reopen_until (migration_7): "Buka Lagi" sementara mengabaikan tutup
  -- otomatis selama masih berlaku.
  if wib_today = st.service_date and wib_time >= st.auto_close_time
     and (st.reopen_until is null or now() >= st.reopen_until) then
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
