-- Tong Sampah 30 hari: soft-delete ke tong sampah, bisa dipulihkan
alter table transaksi add column if not exists deleted_at timestamptz;
