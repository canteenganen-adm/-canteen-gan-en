-- Canteen Gan En — Migrasi #11: jam kemas otomatis (bukti "jam berapa dikemas")
-- Jalankan di Supabase SQL Editor. Aman dijalankan ulang.
--
-- packed_at = jam SERVER (bukan diketik admin) saat pesanan ditandai
-- Sudah Dikemas. Dikosongkan lagi kalau ditandai ulang Belum Dikemas.
-- Dipakai sebagai bukti objektif kapan sebenarnya dikemas -- tidak bisa
-- diakali/diketik manual, murni tercatat otomatis oleh sistem.

alter table transaksi add column if not exists packed_at timestamptz;
