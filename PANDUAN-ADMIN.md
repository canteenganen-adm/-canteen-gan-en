# Panduan Lengkap Admin — Canteen Gan En

Untuk Mama & Papa. Sesuai tampilan aplikasi per **17 Juli 2026**.

---

## 1. Alamat & Hal Dasar

- **Halaman admin (dapur):** `canteen-gan-en.vercel.app/dapur-gan-en` — buka sekali, simpan ke home screen / bookmark.
- **Halaman orang tua:** `canteen-gan-en.vercel.app/pesan` — link ini yang dibagikan ke ortu. Mengetik alamat tanpa embel-embel juga masuk ke halaman ortu, bukan dapur.
- **Semua tersimpan otomatis** dan sinkron ke semua perangkat. Tidak ada tombol simpan — **kecuali satu: menu harian di tab Menu** (dijelaskan di bagian 6).
- **Ketuk 2× ikon tab yang sedang aktif** (di bar bawah) = naik ke paling atas + ambil data terbaru dari server. Muncul tulisan "Data diperbarui".
- **Setiap aplikasi dibuka lagi** (dari background), data otomatis diambil ulang. Jadi kalau dua HP menampilkan angka beda, cukup buka ulang aplikasinya — angkanya pasti menyamai server.
- Ada **4 tab** di bawah: Pre-order · Penjualan · Transaksi · Menu. Pengaturan lewat ikon **gear** di kanan atas.

---

## 2. Arti Ikon-Ikon

| Ikon | Arti |
|---|---|
| ⚙️ gear | Buka Pengaturan |
| ‹ dan › (di kartu sesi) | Lihat pesanan hari kemarin/besok — TIDAK mengubah sesi |
| 📅 kalender + tanggal besar | Ketuk = ganti Tanggal Layanan sesi (resmi) |
| Garpu-sendok | Menu dijual di **Pre-order** (di tab Menu = draft, wajib Simpan) |
| Keranjang belanja | Menu dijual di **Penjualan** (langsung berlaku) |
| Panah bercabang (share) | Kirim tagihan ke WhatsApp — berubah hijau "Ditagih dd/mm" setelah dikirim |
| Tong sampah | Batalkan / hapus (selalu ada jalan kembali — lihat bagian 8) |
| Lingkaran dicoret | Batalkan transaksi (di tab Lunas) |
| Panah memutar balik | Urungkan / Pulihkan |
| X bulat | Tutup / batal / buang perubahan (tergantung tempat, selalu = "tidak jadi") |
| Panah melingkar (refresh) | Ambil ulang data (di kertas PO tab Menu) |
| Mata | Lihat Menu (lompat ke pratinjau menu PO) |
| Panci | Rekap Masak (total per menu untuk dapur) |
| Printer | Cetak — **belum berfungsi** |
| Garis putus-putus di bawah tanggal transaksi | Bisa diketuk → popup rincian + ubah tanggal |

---

## 3. Tab Pre-order (halaman utama dapur)

### Kartu SESI PRE-ORDER
- **Badge kanan atas** = status sesi: **Dibuka** (hijau) / **Ditutup** (merah) / **Tutup Otomatis** (kuning). Ketuk untuk buka-tutup manual.
- **Tanggal besar di tengah**, diapit panah:
  - **Ketuk tanggalnya** → Ganti Tanggal sesi: "Hari Sekolah Berikutnya" (lompati Sabtu-Minggu) atau pilih tanggal sendiri. Ini yang resmi mengubah sesi.
  - **Ketuk panah ‹ ›** → cuma *melihat* pesanan hari lain. Sesi tidak tersentuh sama sekali — buka/tutup jalan terus. Tanggal berubah warna kuning dan muncul tulisan **"Kembali ke Hari Ini"** untuk pulang.
- **"Otomatis tutup jam 08:00" → Ubah**: ganti jam tutup. Dijaga server — pesanan lewat jam ini DITOLAK walau halaman ortu masih terbuka di HP mereka.
- **Buka Lagi** (di dalam Ubah, muncul saat Tutup Otomatis): +30 menit atau +1 jam untuk ortu yang telat. Jam standar tidak berubah, besok normal sendiri. Ada tombol **Tutup Sekarang** untuk mengakhiri lebih cepat.

### Banner kuning "Menu … belum disimpan"
Muncul kalau menu untuk tanggal sesi **belum di-Simpan** — artinya ortu membuka /pesan tapi **tidak melihat menu apa pun**. Ketuk banner → langsung dibawa ke tempat mengatur & Simpan menu.

### Daftar pesanan
- **Tiga kotak angka** (Pesanan / Sudah Dikemas / Belum Dikemas) bisa diketuk sebagai filter; ketuk lagi untuk kembali.
- **Ketuk kartu pesanan = tandai Sudah Dikemas** (nama tercoret). Ketuk lagi untuk batal.
- Pesanan atas nama+kelas sama digabung satu kartu, dengan badge **"N pesanan"**. Isinya ditampilkan **terpisah: PESANAN 1, PESANAN 2** — supaya langsung ketahuan kalau ortu tak sengaja pesan dobel.
- **Cari nama** + **chip tingkat** (KB … Guru/Karyawan) untuk menyaring.
- **"Ambil beda waktu"** = pesanan yang waktu ambilnya bukan waktu utama.
- **Banner merah "N pesanan lewat waktu ambil"** — ketuk untuk melihat hanya yang telat. Syarat: jam per Waktu Ambil diisi di Pengaturan.

---

## 4. Tab Penjualan (kasir)

- **Chip "Tanggal Transaksi"** di atas: normalnya "Hari Ini". **Ketuk untuk memilih tanggal lampau** (input susulan) — chip jadi kuning + ada "Kembali ke Hari Ini". Harga otomatis mengikuti menu tanggal itu.
  - ⚠️ **PENTING:** kalau pindah tab lalu balik, tanggal **kembali sendiri ke Hari Ini**. Selalu lirik chip-nya dulu sebelum mencatat susulan.
- Kategori di kolom kiri, menu di kanan. Ketuk menu = masuk keranjang (yang bervarian minta pilih ukuran dulu). Badge angka = jumlah di keranjang.
- Bar kuning bawah → **Ringkasan Pesanan**: ubah jumlah (tombol − +), Kosongkan Semua (ada Urungkan).
- Selesaikan dengan:
  - **Dibayar** → langsung tercatat Lunas.
  - **Masuk Tagihan** → isi Nama Lengkap + Tingkat/Kelas (WA disarankan) → masuk Belum Dibayar di tab Transaksi.
- **Ketik nama** → muncul saran pelanggan lama (nama, kelas, tanggal transaksi terakhir). Ketuk saran = kelas & WA terisi otomatis. Anak kembar nama beda kelas tampil terpisah.

---

## 5. Tab Transaksi

Tiga tab kertas: **Belum Dibayar · Lunas · Dibatalkan**. Angka kanan atas mengikuti tab: total belum dibayar (kuning) / total masuk (hijau) / total dibatalkan (abu-abu).

### Menyaring
- Kotak **cari** nama / kelas / nomor WA.
- Chip **Semua / PO / Penjualan**.
- Tombol **Tanggal** → Semua Tanggal / Hari Ini / 7 Hari Terakhir / **Pilih Tanggal** (satu tanggal). Tanggal yang dipakai = **Tanggal Layanan** (bukan tanggal ngetik).

### Kartu pelanggan
- Satu kartu = satu anak (nama + nomor WA). Urut **A–Z nama**.
- Ketuk kartu = buka/tutup rincian transaksinya. Pesanan susulan yang masuk ke kartu lama otomatis terbuka dan disorot kuning sebentar.
- Rincian memakai **font struk** (beda dari nama anak) supaya mudah dibedakan.

### Per transaksi (di dalam kartu)
- **Ketuk tanggalnya** (bergaris putus-putus) → **popup struk rincian**: daftar item + TOTAL, **Untuk** (tanggal layanan), **Dicatat** (kapan diketik), Sumber, Status, dan tombol **Ubah Tanggal Layanan** — untuk membetulkan transaksi yang tercatat di tanggal salah.
- **Tandai Lunas** (hijau) — ada **Urungkan** ±5 detik setelahnya.
- Ikon **tong sampah** = Batalkan transaksi (ada Urungkan juga).

### Tombol di bawah kartu
- **Ikon share** → pratinjau pesan WhatsApp (format struk, bisa diedit) → **Kirim ke WhatsApp**.
  - Kalau nomor WA yang sama juga punya tagihan anak lain (kakak-adik), muncul kotak: *"Nomor ini juga punya tagihan: … — ketuk untuk gabungkan"* → jadi **satu pesan** berisi bagian per anak + Subtotal + satu Total gabungan.
  - Setelah dikirim, tombol berubah **hijau "Ditagih 17/07"** — sekali lihat tahu sudah ditagih. Tetap bisa diketuk untuk kirim ulang.
- **Lunaskan** (kuning) = melunaskan SEMUA transaksi anak itu sekaligus — muncul struk konfirmasi **Ya / Tidak** dulu.

### Tab Lunas & Dibatalkan
- **Lunas**: bisa **Batalkan** (keluar dari total masuk, pindah ke tab Dibatalkan) atau **Hapus** (→ Tong Sampah).
- **Dibatalkan**: bisa **Pulihkan** (kembali seperti semula) atau **Hapus** (→ Tong Sampah).

---

## 6. Tab Menu

Dua kertas: **[Menu]** dan **[PO]**.

### Kertas Menu (daftar induk)
- **Ketuk kartu = buka edit.** Di editor: **X bulat kiri atas = keluar**, tombol **Selesai** = tutup. Nama, kategori (chip + "Lainnya" untuk kategori baru), **Kategori untuk Orang Tua** (menentukan kelompok di halaman ortu), varian & harga, hapus menu.
- **Tambah** = menu baru (belum tersimpan sampai tekan Simpan di editor; Batal = tidak jadi).
- Dua ikon di kanan tiap kartu:
  - **Keranjang** = dijual di Penjualan → langsung berlaku saat diketuk.
  - **Garpu-sendok** = dijual di **Pre-order tanggal terpilih** → ini **draft**: perubahan baru berlaku setelah **Simpan**.
- **Struk pengingat** (melayang di bawah) muncul saat ada perubahan PO yang belum disimpan, berisi tanggal + jumlah item + tombol **Simpan**:
  - **Simpan** → popup **KONFIRMASI PERUBAHAN MENU** (Batal / Simpan). Setelah Simpan, itulah yang dilihat ortu.
  - **X bulat** → buang perubahan, menu kembali seperti terakhir tersimpan (ada pemberitahuan).
- ⚠️ **Ortu hanya melihat menu SETELAH kamu menekan Simpan.** Mengubah toggle saja belum mengubah apa pun di halaman ortu.
- Banner "N item belum dikategorikan" → menu tanpa Kategori Orang Tua tampil sebagai "Lainnya" di halaman ortu; ketuk banner untuk membereskan cepat.

### Kertas PO (pratinjau)
- Murni **pratinjau** menu PO per Tanggal Layanan, bergaya struk (MENU PO). Harga singkat: `3k` = Rp3.000, varian dipisah `/` (mis. `3k/5k/10k`).
- Ganti tanggal lewat selektor di atas; tombol **refresh** memutar = ambil ulang data.
- Tanggal lampau = **terkunci** (riwayat — untuk menjawab "kemarin jual apa saja?").

---

## 7. Pengaturan (ikon gear)

| Menu | Fungsi |
|---|---|
| Nama Kantin / WhatsApp | Identitas kantin |
| Edit Pesanan | Cari pesanan, koreksi Nama/Tingkat/Kelas/WA/Waktu Ambil |
| Waktu Ambil | Tambah/ubah/hapus pilihan waktu ambil + jam default & jam per tingkat (untuk deteksi telat) |
| Daftar Kelas | Kelas per tingkat — jadi pilihan di form ortu & Penjualan |
| Tong Sampah | Transaksi terhapus, tersimpan 30 hari — Pulihkan atau Hapus Permanen |
| Template WA Tagihan | Kalimat pembuka/penutup + bank/rekening/atas nama untuk pesan tagihan |
| Backup Data | ⚠️ **BELUM berfungsi** |
| Printer | ⚠️ Belum berfungsi (menyusul bersama Cetak) |

---

## 8. Kasus-Kasus & Cara Menanganinya

**Ortu tak sengaja pesan 2× (dobel):**
Di Pre-order kartunya berbadge "2 pesanan" dan isinya terpisah PESANAN 1 / PESANAN 2 — packing cukup satu. Lalu buka **Transaksi → cari namanya → transaksi kembarannya → ikon tong sampah (Batalkan)** supaya tagihannya juga benar.

**Transaksi tercatat di tanggal salah** (lupa backdate / salah pilih):
**Transaksi → ketuk tanggal transaksinya → Ubah Tanggal Layanan** → pilih tanggal benar. Selesai — tampilan, filter, dan pesan WA ikut benar.

**Kakak-adik satu nomor WA:**
Tekan share dari anak mana pun — aplikasi sendiri yang menawarkan *"ketuk untuk gabungkan"*. Satu pesan, ortu tidak ditagih dua kali. Status "Ditagih" tercatat untuk semua anak yang digabung.

**Lupa sudah menagih siapa saja:**
Lihat tombol share tiap kartu: masih ikon = **belum**; hijau "Ditagih 17/07" = **sudah**, lengkap dengan tanggal kirim.

**Salah Tandai Lunas:**
Langsung: tekan **Urungkan** di bar hitam bawah (±5 detik). Kelewat: tab **Lunas → Batalkan** → lalu di tab Dibatalkan tekan **Pulihkan** → kembali ke Belum Dibayar.

**Terhapus tak sengaja:**
**Pengaturan → Tong Sampah** — semua yang dihapus tersimpan 30 hari, tinggal Pulihkan.

**Dua HP menampilkan angka beda:**
Bukan bentrok — HP yang lama tidak dibuka menampilkan data basi. Buka ulang aplikasinya (otomatis refresh) atau ketuk 2× ikon tab. Dipakai 2–3 gadget bersamaan aman: setiap pesanan tersimpan terpisah, tidak saling menimpa.

**Ortu telat, PO sudah tutup otomatis:**
Kartu sesi → **Ubah → Buka Lagi** (+30 menit / +1 jam). Atau catat manual lewat **Penjualan → Masuk Tagihan**.

**Ortu bilang "menunya kosong":**
Menu tanggal itu belum di-**Simpan**. Lihat banner kuning di Pre-order atau struk pengingat di tab Menu → Simpan.

**Pesan WA muncul tanda tanya (?):**
Sudah diperbaiki — emoji yang tidak didukung HP lama sudah diganti. Kalimat pembuka/penutup bisa diatur sendiri di Pengaturan → Template WA.

**Banner merah "Gagal menyimpan… periksa koneksi":**
Cek internet, lalu ulangi aksinya. Datanya tidak hilang — hanya belum terkirim.

**Mau lihat pesanan/menu hari kemarin:**
Pesanan: panah **‹** di kartu sesi Pre-order. Menu: tab **Menu → kertas PO** → pilih tanggalnya (riwayat terkunci, aman).

---

## 9. Yang BELUM Berfungsi (jangan diandalkan dulu)

- **Cetak** (Pre-order) dan **Printer** (Pengaturan) — menyusul.
- **Backup Data** (Pengaturan) — tombolnya ada, tapi belum mem-backup apa pun.
