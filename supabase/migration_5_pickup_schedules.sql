-- FASE 2b: Lewat Waktu Ambil
-- Tambah kolom pickup_schedules ke app_state untuk menyimpan jam per waktu ambil + per tingkat.
-- Jalankan di Supabase SQL Editor sebelum fitur Lewat Waktu Ambil bisa disimpan.

alter table app_state add column if not exists pickup_schedules jsonb;
