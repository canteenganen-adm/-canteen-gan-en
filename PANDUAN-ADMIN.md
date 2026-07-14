# Panduan Penggunaan — Admin Canteen Gan En

Untuk Mama & Papa. Sesuai tampilan aplikasi per 14 Juli 2026.

## Alamat

- **Admin: `canteen-gan-en.vercel.app/dapur-gan-en`** — buka sekali, lalu simpan ke home screen / bookmark.
- Alamat tanpa embel-embel (`canteen-gan-en.vercel.app` saja) sekarang menampilkan **halaman pemesanan orang tua**, bukan admin — supaya ortu yang mengetik manual tidak nyasar ke dapur.
- Semua perubahan tersimpan otomatis dan langsung sinkron ke perangkat lain — tidak ada tombol Simpan.

---

## Tab Pre-order (halaman utama)

### Kartu Sesi
- **Badge status** (kanan atas kartu): Dibuka / Ditutup / Tutup Otomatis. Ketuk untuk buka-tutup manual.
- **Tanggal Layanan** (tulisan besar): ketuk untuk ganti tanggal — atau pakai tombol **Ganti Tanggal** → "Hari Sekolah Berikutnya" (otomatis lompati Sabtu-Minggu) atau pilih tanggal sendiri.
- **"Otomatis tutup jam 08:00" → Ubah**: ganti jam tutup standar. Penutupan ini dijaga server — pesanan yang masuk lewat jam ini DITOLAK walau halaman ortu masih terbuka di HP mereka.
- **Buka Lagi** (di dalam Ubah, hanya muncul saat status Tutup Otomatis): ketuk **+30 menit** atau **+1 jam** kalau ada ortu telat mau pesan. Jam standar 08:00 tidak berubah — besok kembali normal sendiri. Selama aktif, kartu menampilkan "dibuka lagi s/d HH:MM" dan di Ubah ada tombol **Tutup Sekarang**.

### Daftar Pesanan Hari Ini
- **Tiga kotak angka** (Pesanan / Sudah Dikemas / Belum Dikemas) bisa **diketuk sebagai filter** — ketuk lagi untuk kembali semua.
- **Ketuk kartu pesanan = tandai Sudah Dikemas** (nama tercoret). Ketuk lagi untuk batal.
- Pesanan atas nama+kelas sama otomatis digabung jadi satu kartu (ada badge "N pesanan").
- **Cari nama** dan **chip tingkat** (KB…Guru/Karyawan) untuk menyaring.
- Bagian **"Ambil beda waktu"** = pesanan yang waktu ambilnya bukan waktu utama.
- **Banner merah "N pesanan lewat waktu ambil"**: muncul kalau ada pesanan Belum Dikemas yang sudah lewat jamnya — ketuk untuk melihat hanya yang telat. *Syarat: jam per Waktu Ambil harus diisi dulu di Pengaturan → Waktu Ambil.*

### Tombol aksi
- **Bagikan Link**: salin link /pesan atau langsung kirim ke WhatsApp.
- **Rekap Masak**: total per menu untuk dapur (tanpa nama murid).
- **Cetak**: belum berfungsi (menyusul).

---

## Tab Penjualan (kasir)

- **Kategori di kolom kiri** (diam), daftar menu di kanan (bisa digulir sendiri). "Semua" = semua kelompok berurutan.
- Ketuk menu = masuk keranjang (menu bervarian akan minta pilih ukuran). Badge angka = jumlah di keranjang.
- Bar kuning bawah → **Ringkasan Pesanan**: ubah jumlah, hapus item, **Kosongkan Semua** (ada Urungkan).
- Selesaikan dengan **Dibayar** (langsung Lunas) atau **Masuk Tagihan** (isi Nama + Kelas, WA opsional → masuk Belum Dibayar).

---

## Tab Transaksi

- Dua tab: **Belum Dibayar** dan **Lunas**. Filter Semua / Pre-order / Penjualan + kotak cari.
- Transaksi dikelompokkan per nama — pesanan susulan otomatis bergabung dan disorot kuning sebentar.
- Per transaksi: **Tandai Lunas** atau batalkan (ikon tong sampah, ada Urungkan). Per grup: **Lunaskan Semua**.
- **Bagikan WA**: buka pratinjau pesan tagihan (format struk, bisa diedit) → Kirim ke WhatsApp.
- Di tab **Lunas**: transaksi Dibatalkan bisa **Pulihkan** (kembali ke Belum Dibayar) atau **Hapus** → masuk Tong Sampah.

---

## Tab Menu

- **Ketuk kartu = buka edit.** Dua ikon di kanan kartu = ketersediaan: garpu-sendok (Pre-order) dan keranjang (Penjualan) — kuning berarti tampil di kanal itu; ketuk untuk nyala/mati tanpa membuka edit. Badge angka kecil = jumlah varian.
- **Tambah** (kanan atas) = menu baru.
- Di editor: nama · kategori (chip, "+ Lainnya" untuk kategori baru) · **Kategori untuk Orang Tua** (wajib — menentukan kelompok di halaman ortu) · varian & harga · hapus menu.
- Banner **"N item belum dikategorikan"** muncul kalau ada menu tanpa kategori ortu — ketuk untuk mengisinya cepat; hilang sendiri saat beres.

---

## Pengaturan (ikon gear)

| Menu | Fungsi |
|---|---|
| Nama Kantin / WhatsApp | Identitas kantin |
| Edit Pesanan | Cari pesanan, koreksi Nama/Tingkat/Kelas/WA/Waktu Ambil |
| Waktu Ambil | Tambah/ubah/hapus pilihan waktu ambil + **jam default & jam per tingkat** (untuk deteksi telat; Guru/Karyawan hanya dicek kalau jamnya diisi) |
| Daftar Kelas | Kelas per tingkat — jadi pilihan di form ortu |
| Tong Sampah | Transaksi terhapus, tersimpan 30 hari — Pulihkan atau Hapus Sekarang |
| Template WA Tagihan | Kalimat pembuka/penutup + bank/rekening/atas nama untuk pesan tagihan |
| Backup Data | ⚠️ BELUM berfungsi — tombolnya ada tapi belum mem-backup apa pun |
| Printer | Belum berfungsi (menyusul bersama Cetak) |

---

## Kalau ada masalah

- Banner merah **"Gagal menyimpan… periksa koneksi"**: cek internet, lalu ulangi aksinya. Kalau terus muncul padahal sinyal bagus, hubungi pengelola.
- Data tidak muncul: tarik-refresh halaman. Semua perangkat membaca data yang sama.
