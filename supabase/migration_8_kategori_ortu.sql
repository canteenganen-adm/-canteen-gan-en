-- Canteen Gan En — Migrasi #8: kategori menu versi orang tua (kategori_ortu)
-- Jalankan di Supabase SQL Editor. Aman dijalankan ulang, tidak menghapus data.
-- Catatan: tabel menu di skema ini bernama `menu` (bukan `menu_items`).

alter table menu add column if not exists kategori_ortu text;

-- Backfill item lama berdasarkan kategori admin yang sudah ada.
-- Kategori admin di LUAR daftar ini sengaja DIBIARKAN null:
--   * di halaman ortu tetap tampil (fallback "Lainnya"), tidak ada menu hilang
--   * di admin masuk banner "N item belum dikategorikan" supaya pemilik
--     bisa mengisinya cepat satu per satu
-- "Camilan Sehat" tidak di-backfill — kategori baru, diisi manual oleh pemilik.
update menu set kategori_ortu = case category
  when 'Bubur'       then 'Makanan Utama'
  when 'Mie'         then 'Makanan Utama'
  when 'Nasi Goreng' then 'Makanan Utama'
  when 'Lauk'        then 'Lauk'
  when 'Sayur'       then 'Lauk'
  when 'Sup'         then 'Lauk'
  when 'Tahu'        then 'Lauk'
  when 'Telur'       then 'Lauk'
  when 'Tempe'       then 'Lauk'
  when 'Gorengan'    then 'Gorengan'
  when 'Snack'       then 'Snack'
  when 'Roti'        then 'Snack'
  when 'Buah'        then 'Buah'
  when 'Puding'      then 'Dessert'
  when 'Paket'       then 'Paket'
end
where kategori_ortu is null
  and category in ('Bubur','Mie','Nasi Goreng','Lauk','Sayur','Sup','Tahu','Telur','Tempe','Gorengan','Snack','Roti','Buah','Puding','Paket');
