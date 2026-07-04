# Canteen Gan En — Perintah Perbaikan untuk Claude Code

Aplikasi sudah live. Ini paket revisi. **Jangan mendesain ulang** — terapkan perubahan di bawah.
Ganti 3 file layar ini di repo dengan versi baru (sudah kusiapkan): `PreOrderAdmin.jsx`, `PreOrderParent.jsx`, `Pengaturan.jsx`. Lalu terapkan aturan integrasi & server di bawah.

---

## 0. WAJIB — INTERAKSI PICKER (jangan sampai jadi tombol mati)

- **Semua pemilih TANGGAL dan JAM wajib bisa diketuk di SELURUH area** kartu/tombolnya, bukan hanya ikon/angka kecil. Pola: `<input type="date|time">` di-overlay `position:absolute; inset:0; width:100%; height:100%; opacity:0`.
- **"Pilih tanggal lain" di sheet Buka PO WAJIB AKTIF** — saat diketuk harus membuka kalender native. Ini tidak boleh jadi tombol mati.
- Berlaku juga untuk: **Ganti Tanggal / Tanggal Layanan**, dan **Jam Tutup Otomatis** (widget besar).
- **Uji manual di Safari iOS + Chrome Android** sebelum dianggap selesai.

---

## 1. PO ADMIN — Sesi PO tunggal

- Satu **sesi aktif** = **tanggal + status jadi satu** (bukan dua saklar terpisah).
- **Buka PO** menampilkan: tombol **“Hari Sekolah Berikutnya”** (otomatis lewati Sabtu/Minggu) + **“Pilih tanggal lain”** (kalender, wajib aktif — lihat bagian 0).
- Kartu sesi: tanggal (besar) + **toggle Dibuka/Ditutup** + baris **“Otomatis tutup jam 08:00”** (ketuk “Ubah” → **satu widget jam besar** yang seluruhnya bisa diketuk) + tombol **Ganti Tanggal**.
- Default sesi = hari sekolah berikutnya (bukan “besok” mentah yang bisa jatuh di weekend).
- Daftar pesanan: tanpa filter, hanya **Cari**; “Pesanan Hari Ini” (Istirahat 1 tanpa label) + “Ambil beda waktu”. Ketuk kartu = Sudah Dikemas.

## 2. ATURAN SERVER (WAJIB — bukan sekadar di layar)

Supaya pesanan mustahil nyasar ke tanggal yang salah:
1. **Hanya satu sesi PO aktif** pada satu waktu.
2. **Link orang tua membaca sesi aktif secara langsung** dari server — saat halaman dibuka **dan** saat kirim (cegah “link basah” dari HP ortu).
3. **Tanggal Layanan pada pesanan ditetapkan oleh SERVER** dari sesi aktif saat pesanan masuk — jangan percaya nilai tanggal yang dikirim klien.
4. **Auto-tutup jam 08:00 (atau jam yang di-set) & tutup manual = server MENOLAK pesanan baru.** Blokir nyata, bukan sekadar disembunyikan di layar. Skenario: buka malam untuk hari sekolah berikutnya → jam tutup pada hari layanan otomatis memblokir → malamnya buka lagi untuk hari sekolah berikutnya.

## 3. PO PARENT (halaman link orang tua)

- **Orang tua tidak pernah memilih tanggal** — hanya melihat Tanggal Layanan (teks, read-only) dari sesi aktif.
- **Checkout ala GrabFood/Shopee**: di halaman “Periksa Pesanan” ada daftar item yang bisa **+/-** (dan hapus) sebelum kirim, lalu data pemesan, total, Kirim.
- **Nama** (label “Nama”, placeholder “Nama lengkap”) — form juga dipakai Guru/Karyawan.
- **Tingkat**: TK A · TK B · SD · SMP · SMA · Guru/Karyawan. Guru/Karyawan → tanpa kelas.
- **Kelas = PICKER/dropdown** dari daftar yang **dikelola admin**. **Pemesan TIDAK bisa mengetik atau menambah kelas sendiri.** Kalau tidak ada → arahkan hubungi kantin (admin yang menambah).
- **Nomor WhatsApp**: wajib, **hanya angka, minimal 10 digit**. **Tanpa caption “minimal 10 angka sekarang X”.**
- **Waktu Ambil**: Istirahat 1 / 2 / 3 / Pulang Sekolah, default Istirahat 1.
- Kalau sesi ditutup → pemesanan diblokir (lihat aturan server).

## 4. PENGATURAN

- **Daftar Kelas** (grup “Pesanan”): kelola kelas **per Tingkat** (tambah/edit/hapus). Perubahan **langsung dipakai picker Kelas** di form ortu — simpan ke Supabase (bukan hardcode).
- Nomor WhatsApp: hanya angka.

## 5. PENJUALAN

- WhatsApp di popup **“Masuk Tagihan”**: hanya angka.

## 6. ISTILAH & DATA (brief = acuan istilah)

Samakan semua label ke istilah brief (perbaiki bila app sekarang berbeda):
- **Pre-order · Penjualan · Tagihan · Belum Dibayar** (bukan “Belum Bayar”) **· Lunas · Cetak** (bukan “Print”) **· Packing · Tanggal Pesan · Tanggal Layanan · Waktu Ambil**.
- Status kemasan tetap ditulis **“Sudah Dikemas / Belum Dikemas”** (lebih jelas untuk mama) — “Packing” hanya nama konsepnya.
- Setiap pesanan menyimpan: **Order Timestamp** format **jam:menit:detik** (audit/history) **+ Service Date (Tanggal Layanan)**.
- **Service Date = sumber kebenaran operasional**: packing, cetak, laporan, dan tagihan **dikelompokkan per Service Date**. Order Timestamp hanya untuk audit.

## 7. SUPABASE — tabel inti

- `po_session` (atau kolom pada tabel setting): `service_date`, `open` (bool), `auto_close_time` (default 08:00), constraint “satu aktif”.
- `menu` (seed dari menuSeed.js), `transaksi` (items snapshot, source preorder|penjualan, paid, customer, service_date server-assigned, order_timestamp), `kelas` (per tingkat).
- Tagihan = query `transaksi` `paid=false` dikelompok per murid (Nama + WhatsApp).

---

### Urutan kerja
1. Ganti 3 file + terapkan istilah “Cetak”.
2. Pastikan semua picker aktif (bagian 0) — uji HP.
3. Wiring sesi PO + Daftar Kelas ke Supabase.
4. Tegakkan 4 aturan server (bagian 2).
5. Deploy & uji dengan Papa/Mama.
