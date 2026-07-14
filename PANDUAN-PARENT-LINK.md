# Panduan Penggunaan — Link Orang Tua (/pesan)

Alur yang dilihat orang tua murid. Sesuai tampilan per 14 Juli 2026.

## Dasar

- **Link selalu sama:** `canteen-gan-en.vercel.app/pesan` — juga bisa buka `canteen-gan-en.vercel.app` saja (jatuh ke halaman yang sama). Tidak perlu kirim link baru tiap hari.
- **Tanggal Layanan otomatis** dari sesi yang dibuka admin — ortu tidak pernah memilih tanggal.
- **Tutup otomatis jam 08:00** (atau jam yang di-set admin) pada hari layanan — setelah itu tombol kirim ditolak server, kecuali admin menekan "Buka Lagi".
- **Bantuan:** tombol **?** di kanan atas = panduan lengkap (5 langkah + FAQ). Ada juga halaman mandiri `canteen-gan-en.vercel.app/panduan` yang bisa dibagikan/dicetak.

## Alur pemesanan

**1. Halaman awal** — logo 🪷, tanggal layanan, tombol **Mulai Memesan**. Kalau sesi tutup: pesan "Pre-order Ditutup" dan tidak bisa lanjut.

**2. Pilih menu**
- Header: nama kantin + tombol ?, tanggal sebagai teks polos.
- **Kolom Cari** di atas, lalu **deretan tile kategori** yang digeser ke samping: 🍚 Makanan Utama · 🥘 Lauk · 🥗 Camilan Sehat · 🍪 Snack · 🍎 Buah · 🧁 Dessert (hanya kategori yang ada isinya yang tampil; susunan bisa berubah sesuai isi menu).
- Ketuk tile = saring kategori itu; ketuk lagi = kembali tampil semua (semua kelompok berurutan, item belum terkategori masuk "Lainnya" paling bawah).
- Kartu menu: nama + harga ("mulai RpX" untuk menu bervarian). **+ Tambah** langsung masuk keranjang; **Pilih** membuka pilihan ukuran/jenis.
- Setelah item masuk: muncul pengatur jumlah (– / +) dan tombol **Catatan** (mis. "tidak pedas").
- *Banner "Paket Spesial Hari Ini" saat ini dinonaktifkan; bila diaktifkan lagi akan tampil paling atas.*

**3. Lanjut** — bar kuning bawah menampilkan "N item · RpXX" → ketuk **Lanjut**.

**4. Konfirmasi Pesanan** — satu halaman berisi:
- Daftar item (masih bisa ubah jumlah; minus di jumlah 1 = ikon hapus)
- Data Pemesan: Nama · Tingkat (KB–SMA, Guru/Karyawan) · Kelas (pilihan dari daftar admin, tidak bisa ketik bebas) · Nomor WhatsApp (minimal 10 digit angka) · Waktu Ambil (pilihan dari Pengaturan admin)
- **Kirim Pesanan** — aplikasi mengecek ulang ke server: kalau sesi keburu ditutup, muncul pesan ramah dan pesanan tidak terkirim.

**5. Berhasil** — layar hijau "Pesanan Berhasil Dikirim" berisi:
- Nomor pesanan (PO-XXXXXX) + rincian
- **Salin Bukti Pesanan** (teks, bisa ditempel ke WA/catatan)
- **Buat Pesanan Lagi** — untuk anak kedua / waktu ambil lain; data pemesan tetap terisi, tinggal ganti yang perlu
- Pengingat: titipkan kotak bekal di **pos satpam** sebelum jam masuk; bekal yang telah diproses diambil di **lemari pengambilan bekal di lobby**

## Satu pesanan = satu anak + satu waktu ambil

Untuk 2 anak atau 2 waktu istirahat → buat 2 pesanan (pakai "Buat Pesanan Lagi", cepat karena data tidak diisi ulang). Pesanan susulan otomatis digabung dalam satu tagihan di sisi admin.

## Catatan untuk pemilik (bukan bagian panduan ortu)

- Teks panduan di /panduan dan modal ? **masih menyebut kategori lama** ("Makanan Berat, Buah, Snack, Paket, Puding") — usulan teks baru sudah kuserahkan, menunggu persetujuan (termasuk aturan pengambilan per tingkat: KB/TK/SD 1–2 diantar ke kelas vs SD 3+ ambil sendiri).
- Setelah disetujui, modal ? akan disamakan persis dengan /panduan (aturan satu sumber di CLAUDE.md).
