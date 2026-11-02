-- Canteen Gan En — Migrasi #14: kapan transaksi dicentang Lunas
-- Jalankan di Supabase SQL Editor. Aman dijalankan ulang.
--
-- paid_at = jam saat transaksi ditandai Lunas (dicatat otomatis oleh aplikasi).
-- Dikosongkan lagi kalau Lunas dibatalkan (Belum Dibayar). Transaksi yang sudah
-- Lunas SEBELUM migrasi ini tidak punya jam (kosong) -- tidak bisa ditebak.
-- Sebelum migrasi dijalankan, aplikasi tetap menandai Lunas seperti biasa,
-- hanya jamnya belum tersimpan.

alter table transaksi add column if not exists paid_at timestamptz;
