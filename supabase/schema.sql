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
  order_no text                                     -- PO-XXXXXX, hanya untuk source='preorder'
);

create index if not exists idx_transaksi_paid on transaksi (paid);
create index if not exists idx_transaksi_source_date on transaksi (source, service_date);

-- ============================================================
-- cancelled_transaksi — riwayat pembatalan, implementasi di
-- belakang layar (Decision Lock §7), tidak tampil di UI utama
-- ============================================================
create table if not exists cancelled_transaksi (
  id bigint generated always as identity primary key,
  tx jsonb not null,             -- salinan penuh transaksi yang dibatalkan
  cancelled_at timestamptz not null default now()
);

-- ============================================================
-- app_state — satu baris tunggal untuk status operasional harian
-- (Status Pre-order, Tanggal Layanan, preset Waktu Ambil) +
-- Pengaturan kantin (Nama Kantin, WhatsApp, Printer)
-- ============================================================
create table if not exists app_state (
  id smallint primary key default 1 check (id = 1),   -- kunci: cuma boleh 1 baris
  preorder_open boolean not null default true,
  service_date date not null default current_date,
  pickup_presets jsonb not null default '["Istirahat 1","Istirahat 2","Istirahat 3","Pulang Sekolah"]'::jsonb,
  nama_kantin text not null default 'Kantin Gan En',
  whatsapp text not null default '',
  printer_connected boolean not null default false
);

insert into app_state (id) values (1) on conflict (id) do nothing;

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
alter table cancelled_transaksi enable row level security;
alter table app_state enable row level security;

create policy "anon full access" on menu for all using (true) with check (true);
create policy "anon full access" on transaksi for all using (true) with check (true);
create policy "anon full access" on cancelled_transaksi for all using (true) with check (true);
create policy "anon full access" on app_state for all using (true) with check (true);

-- ============================================================
-- Realtime — supaya perubahan (pesanan baru dari /pesan, status
-- dibuka/ditutup, dst.) langsung terlihat di layar admin tanpa
-- refresh manual.
-- ============================================================
alter publication supabase_realtime add table menu;
alter publication supabase_realtime add table transaksi;
alter publication supabase_realtime add table app_state;
