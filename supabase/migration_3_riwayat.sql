-- Canteen Gan En — Migrasi #3: Riwayat (Lunas & Dibatalkan)
-- Jalankan SETELAH migration_2_session_rules.sql.
-- Aman dijalankan ulang (IF NOT EXISTS).

-- ============================================================
-- transaksi: tambah cancelled_at — "Batalkan Transaksi" sekarang
-- soft-delete (UPDATE, set jam batal) alih-alih dihapus permanen.
-- Transaksi tetap ada untuk tab Riwayat (audit), tidak hard-delete.
-- ============================================================
alter table transaksi add column if not exists cancelled_at timestamptz;

-- Catatan: tabel `cancelled_transaksi` (dari migrasi sebelumnya) sudah
-- tidak dipakai kode aplikasi lagi — riwayat pembatalan sekarang cukup
-- lewat kolom cancelled_at di atas. Tabel lama dibiarkan apa adanya
-- (tidak dihapus) supaya tidak ada risiko kehilangan data lama.
