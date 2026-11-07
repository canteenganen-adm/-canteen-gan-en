# Arsip keputusan lama — Canteen Gan En

Jejak sejarah dari CLAUDE.md sebelum dirapikan (7 Nov). BUKAN aturan: semuanya sudah digantikan keputusan yang lebih baru di `CLAUDE.md` bagian "KEPUTUSAN TERBARU". Disimpan supaya alasan keputusan lama tidak hilang.

## Digantikan

### Baris 19 — Font Inter (diganti Plus Jakarta Sans 6 Nov; mono DM Mono diganti Red Hat Mono 7 Nov)

- **Font:** 'Inter' untuk SEMUA teks (DICOBA 4 Nov atas permintaan pemilik, menggantikan Onest; Plus Jakarta Sans, DM Sans, Figtree, Manrope sudah dibandingkan di mockup; ganti = `src/styles/fonts.css`, `src/styles/theme.css`, dua `fontFamily` kecil di MasterMenu/Tagihan, tiga halaman panduan), 'DM Mono' hanya untuk gaya struk/angka (import Google Fonts). Tanpa font display/kartun.

### Baris 41 — Filter Transaksi daftar vertikal ala Excel / tiga baris chip (sheet filter sekarang)

- **(DIGANTI 2 Nov: Filter Transaksi kini = TIGA BARIS CHIP — Sumber [Semua·Pre-order·Penjualan] / Urutan [A–Z·Terbaru] / Tanggal [Semua·Hari ini·Rentang…] (+ chip "Belum ditagih saja" di tab Belum Dibayar); tanpa gulir, langsung berlaku; Z–A & Terlama dulu dibuang. Pola chip ini yang dipakai bila ada pilihan serupa di tempat lain. Uraian di bawah = versi lama daftar vertikal.)** **Filter Transaksi = daftar ala Excel** (usul pemilik): tombol Filter membuka popover kecil mengalir di bawahnya (animasi sama dengan "+" di Menu), satu pilihan per baris urut ke bawah, centang di yang aktif, bisa digulir: Urutkan (A–Z, Z–A, Terbaru dulu, Terlama dulu) · Tanggal (Semua, Hari Ini, 7 Hari Terakhir, Pilih Tanggal…) · Hanya Belum Ditagih (tab Belum Dibayar). Langsung berlaku, tanpa tombol Terapkan; ketuk di luar = tutup. Bukan sheet bawah.

### Baris 46 — Tab Kantin: judul + Laporan dua blok (diganti susunan terbaru)

- **(DIGANTI 4 Nov, pilihan pemilik opsi F) Tab Kantin = NAMA KANTIN sebagai judul (22px w800, nomor WA kecil di bawahnya, pensil di kanan; tidak ada lagi tulisan "Kantin" + blok profil yang mengulang nama) → Laporan = DUA BLOK berdampingan (pemilik 4 Nov, susunan "nomor 2" dari mockup tiket tetapi TANPA gaya karcis/takik/perforasi: "karcis tidak cocok untuk kantin"): kiri kuning pucat `t.primaryLight` 56% ("MASUK · NOV", jumlah 26px, grafik mini 7 hari dari transaksi yang sudah dimuat, hari ini gelap), kanan krem bergaris (Pre-order dan Penjualan berikon dalam kotak lembut + panah); seluruhnya satu tombol = layar Laporan. Dicoba dan ditolak: kartu tiga angka sejajar, kartu Masuk + dua kolom + grafik besar, satu baris sederhana, struk bergerigi, donat, kapsul gelap, tiket berperforasi → kartu Perhatian (pengingat Excel + Kesehatan, baris dua susun judul/keterangan) → SATU kartu daftar 8 baris setinggi sama (Edit Pesanan, Tong Sampah [lencana merah], Catatan, Waktu Ambil, Tagihan, Printer, Panduan, Akun/Pengguna). Satu blok warna (Laporan kiri); kartu lain netral bergaris 1.5px, sudut 18–20. Ubin kuning/pink 3 kolom DIHAPUS (pemilik: "warnanya rebut-rebutan, besar kecil rebutan"). Uraian ubin di bawah = versi LAMA:** ~~Tab Kantin: delapan ubin (Panduan, Edit Pesanan, Waktu Ambil, Tagihan, Printer, Tong Sampah, Catatan, Pengguna) MENGISI kolom~~ (3 kolom sama lebar, jarak 12px, tepi kiri-kanan SEJAJAR kartu Laporan/Cadangan di atasnya; isi kuning pucat `t.primaryLight`, sudut 20 = kartu Laporan; ikon di atas, nama di bawah di dalam ubin; Tong Sampah merah muda + lencana di pojok kanan atas). Bukan kotak 76px mengambang dengan nama di luar (pemilik 30 Okt: "ga selaras sm card besar").

### Baris 86 — Kop tab Menu opsi B (diganti deretan hari mingguan)

- **(DIGANTI LAGI 3 Nov, pilihan pemilik opsi B)** Kop tab Menu = TANPA judul "Menu" (tab bawah sudah bertulisan Menu): tanggal terpilih ("3 Nov 2026", 17px w800) TEPAT DI TENGAH; ikon kalender tepat di tengah KOLOM KE-7 (segaris dengan hari Minggu; sebelumnya "off side"); tombol "Hari ini"/"Kembali" di kiri (kolom 1–2). Semua selaras ke grid 7 kolom hari di bawahnya.

### Baris 87 — Deretan hari mingguan gaya Flo (versi terdahulu)

- **(DIGANTI 2 Nov malam, dari rekaman layar referensi gaya Flo: DERETAN HARI MINGGUAN)** `DerekTanggal` kini = SATU MINGGU (Senin–Minggu, 7 kolom penuh, huruf S S R K J S M di atasnya, bulatan 38px — kecil, "kebesaran di Menu" sebelumnya); **judul "Menu" SEJAJAR dalam SATU BARIS dengan tanggal terpilih ("10 Nov 2026" rata kanan) + tombol "Kembali"/"Hari ini" + ikon kalender**; geser kiri/kanan = pindah SATU MINGGU per geseran (scroll-snap, tidak melompati minggu) dan tanggal terpilih ikut pindah ±7 hari di hari yang sama (judul langsung berganti = penanda bulan; tidak ada tulisan bulan lain); ketuk hari = bulatan kuning berpindah dengan memudar halus; lompatan jauh (tombol Hari ini/kalender) = langsung tanpa animasi; bila pindah ditolak (menu belum disimpan) deretan dikembalikan ke minggu yang masih terpilih. Tanpa titik-titik/border hiasan (hanya penempatan bulan/tanggal yang ditiru). Uraian deretan-hari-bergulir di bawah = versi lama.

### Baris 93 — Penjualan Sabtu/Minggu: pop-up tengah (versi terdahulu)

- **(DIGANTI 1 Nov) Penjualan di hari Sabtu/Minggu**: saat tab Penjualan dibuka muncul POP-UP MELAYANG di tengah (bukan lembar bawah; opsi A pilihan pemilik): "Hari ini Sabtu" kecil, "Catat untuk Jumat, 30 Okt?" besar, DUA tombol sama besar kiri-kanan: "Tanggal lain" (kiri, bergaris, ikon kalender, seluruh area diketuk) dan **Ya** (kanan, kuning) — hanya SATU saran (hari kerja terakhir), tanpa daftar pilihan dan tanpa "Memang hari ini" (tanggal lain mencakup hari ini). Aturan lama: lembar bawah bertanya "Hari ini Sabtu. Input untuk tanggal berapa?" — dua hari kerja terakhir + "Pilih tanggal lain" + "Memang hari ini" (tanpa jalan buntu). Ditanya SEKALI per hari per tab (`sessionStorage` `ganen_tanya_tgl_<tanggal>`). Hari kerja biasa tidak berubah. Hari libur sekolah selain Sabtu/Minggu tidak dikenali.

### Baris 97 — Toast krem seragam 5 Nov (diganti toast gelap 6 Nov)

- **Toast/bilah Urungkan SERAGAM (pemilik 5 Nov: "masih warna warni")**: SEMUA toast dan bilah Urungkan (Tagihan, Penjualan, Menu, Tagih satu per satu, notifikasi /pesan) = latar KREM `t.surface` + bayangan lembut, tulisan `t.text` w500, tombol Urungkan abu `t.divider` 44px (pemilik 5 Nov: "toast warna krem aja semuanya"; versi gelap dan kuning penuh DITOLAK). Chip minggu "berjalan" terpilih = BORDER kuning (bukan strip). Karcis Tagih satu per satu tanpa titik-penghubung; tebal hanya judul dan "Selesai". Chip minggu yang berlabel "berjalan" TANPA strip kuning (terpilih = label tebal). Bar keranjang /pesan = abu-krem transparan + blur (ala iOS, mengikuti bar Simpan Menu). Panel struk Penjualan DISEMBUNYIKAN saat keranjang kosong (menyimpang dari buku, atas pertimbangan pemilik). Alur Tagihan Penjualan = form lama (ketik nama, saran dari riwayat, Simpan), bukan daftar-ketuk.

### Baris 121 — Aturan 12 lama: "tanpa login, kunci publik baca-tulis"

12. KEAMANAN SAAT INI (jujur): tanpa login, kunci publik memegang akses baca-tulis. `migration_17_pengamanan.sql` mengurangi kerusakan (hapus massal, truncate, data janggal, banjir pesanan) tetapi TIDAK menutup pembacaan data oleh pemegang kunci. Penutup sebenarnya = login kasir (Supabase Auth) + RLS per peran; direncanakan, menunggu keputusan pemilik.
