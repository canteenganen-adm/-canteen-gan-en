-- Template berita transfer + kalimat akhir pesan WA tagihan bisa diubah dari Pengaturan → Tagihan.
-- Jalankan di Supabase SQL Editor. Kolom null = kode memakai teks standar.

alter table app_state
  add column if not exists wa_transfer text,
  add column if not exists wa_akhir text;
