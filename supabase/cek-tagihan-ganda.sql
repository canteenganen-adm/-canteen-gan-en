-- HANYA MEMBACA (SELECT). Tidak mengubah data.
-- Jalankan di Supabase → SQL Editor. Mencari tagihan PENJUALAN yang tampak ganda:
-- nama anak, kelas, tanggal, isi, dan total SAMA, belum dibatalkan.
-- Hasilnya hanya DAFTAR CURIGA: bisa saja anak itu memang jajan dua kali. Cek dulu sebelum membatalkan.
select
  customer->>'nama'  as nama,
  customer->>'kelas' as kelas,
  coalesce(service_date, (created_at at time zone 'Asia/Jakarta')::date) as tanggal,
  total,
  paid,
  count(*)           as jumlah,
  array_agg(id order by created_at) as id_transaksi,
  array_agg(to_char(created_at at time zone 'Asia/Jakarta', 'DD/MM HH24:MI:SS') order by created_at) as jam_masuk
from transaksi
where source = 'penjualan'
  and cancelled_at is null
  and deleted_at is null
  and coalesce(customer->>'nama', '') <> ''
group by 1, 2, 3, 4, 5, items::text
having count(*) > 1
order by tanggal desc, nama;
