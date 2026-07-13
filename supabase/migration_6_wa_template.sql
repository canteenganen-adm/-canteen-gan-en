-- Format pesan WA tagihan: simpan template pembuka/penutup + info rekening di app_state.
-- Jalankan di Supabase SQL Editor. Kolom null = code fallback ke teks default.

alter table app_state
  add column if not exists wa_opening text,
  add column if not exists wa_closing text,
  add column if not exists nama_bank text,
  add column if not exists no_rekening text,
  add column if not exists nama_rekening text;
