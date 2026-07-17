-- Canteen Gan En — Migrasi #10: penanda "sudah ditagih via WhatsApp"
-- Jalankan di Supabase SQL Editor. Aman dijalankan ulang.
--
-- billed_at = kapan tombol "Kirim ke WhatsApp" ditekan untuk transaksi ini.
-- Dipakai halaman Transaksi untuk menampilkan badge "Ditagih dd/mm" di kartu
-- pelanggan, supaya tidak dobel menagih. Kolom baru saja, tanpa trigger.

alter table transaksi add column if not exists billed_at timestamptz;
