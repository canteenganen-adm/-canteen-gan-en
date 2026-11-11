/* Pembaruan aplikasi (untuk Mama/Papa/pemilik): daftar perubahan FITUR dalam bahasa sederhana, terbaru dulu.
   Teks statis (bukan log database). ATURAN: tiap perubahan perilaku yang terlihat pengguna → tambah satu butir di sini pada commit yang sama. */
export type Pembaruan = { tgl: string; butir: string[] };

export const PEMBARUAN: Pembaruan[] = [
  { tgl: "2026-11-11", butir: [
    "Pre-order: tombol Cetak sekarang membuat lembar A4 (rekap masak + daftar pesanan per Waktu Ambil dengan kotak centang) yang bisa dicetak ke printer mana pun atau disimpan sebagai PDF.",
  ] },
  { tgl: "2026-11-09", butir: [
    "Catatan: tab baru Pesanan (semua pesanan/penjualan yang masuk) dan Ubah (perubahan pada pesanan), serta tab Pembaruan ini.",
    "Halaman pesan orang tua: kategori di sisi kiri ikut bergeser saat menu digulir; huruf nama menu lebih besar dari harga; ada garis tipis antar menu.",
    "Pre-order admin: kartu tanggal kembali ringkas, ada ikon timer di kiri jam tutup.",
  ] },
  { tgl: "2026-11-07", butir: [
    "Tagih satu per satu: peringatan sebelum kirim bila ada pesanan kembar atau sudah ditagih minggu ini.",
    "Tagih satu per satu: tiap anak punya kotak centang, tombol Tambah saudara, dan Sertakan tagihan sebelumnya ada di dalam karcis dengan Total.",
    "Tagih satu per satu: bar di atas bisa digeret untuk loncat ke anak mana saja.",
    "Transaksi: tombol Tagih berbentuk gelembung WhatsApp, chip Semua minggu, tab menyatu dengan lembar, filter di kanan atas.",
    "Utang: baris transaksi di dalam kartu anak tidak bisa digeser lagi (centang atau ketuk saja).",
    "Penjualan: tidak bisa tercatat dua kali karena ketuk ganda; Kesehatan menandai tagihan Penjualan kembar.",
    "Menu: tab Buku Menu dan Preview PO menyatu dengan lembar; Atur Menu Tetap hanya menampilkan menu yang ditandai; bar Simpan lebih jelas.",
    "Minggu berjalan sekarang sampai hari Minggu. Huruf angka struk memakai Red Hat Mono.",
  ] },
  { tgl: "2026-11-06", butir: [
    "Detail transaksi berupa lembar dari bawah dengan rincian dan waktu masuk, ditagih, lunas.",
    "Geser baris: Utang (Tagih dan Lunas, tarik panjang = Lunas), Lunas dan Dibatalkan (Batalkan, Belum lunas, Pulihkan, Tong Sampah) dengan Urungkan.",
    "Tagih selalu bisa diulang untuk semua yang masih Utang. Huruf aplikasi Plus Jakarta Sans.",
    "Penjualan: bar ringkas di bawah, rincian dan tombol Tagihan/Tunai naik dari bawah.",
  ] },
  { tgl: "2026-11-05", butir: [
    "Halaman pesan orang tua dirombak: laman masuk dengan panda, menu langsung, keranjang, bukti pesanan.",
    "Log in ke dapur untuk kasir. Pre-order admin: kartu sesi dengan cincin jam tutup.",
    "Penjualan: menu 3 kolom, Tunai langsung Lunas dengan Urungkan, Tagihan tinggal ketuk nama.",
    "Transaksi: tab Utang, Lunas, Dibatalkan; Tagih satu per satu bergaya karcis dengan pesan otomatis tersalin.",
    "Tanda sudah ditagih berlaku seminggu; pesan WA tagihan tanpa jam, label PO dan Jajan.",
  ] },
  { tgl: "2026-11-04", butir: [
    "Laporan satu papan dengan deret tanggal; Kantin menampilkan Laporan dua blok.",
    "Kesehatan: pemeriksaan otomatis (harga janggal, pesanan ganda, utang lama) sebagai daftar periksa.",
    "Catatan Perubahan: siapa mengubah apa dan kapan, masuk dan keluar tercatat; hari bisa dilipat.",
    "Pesan WA tagihan selalu lengkap; terlalu panjang jadi Salin dan buka chat. Penjualan tunai disebut Cash.",
    "Tombol gulir naik dan turun; huruf tiga tingkat dan kartu tanpa garis diseragamkan.",
  ] },
];
