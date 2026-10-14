# CLAUDE.md — Canteen Gan En

Aplikasi kantin sekolah keluarga. **Kantin ini VEGAN** — seluruh menu nabati/olahan nabati (termasuk menu bernama "ayam", "bakso", dsb — itu mock meat, BUKAN daging asli). Pengguna utama: Mama & Papa (±50–60 th, non-teknis) dan orang tua murid. Live di canteen-gan-en.vercel.app (halaman ortu: /pesan). Stack: React + Supabase + Vercel.

## ATURAN EMAS (baca dulu)

1. **File dari pemilik = pakai APA ADANYA.** Jangan menulis ulang, meringkas, "memperbaiki", atau menambah konten/desain pada file .jsx/.html yang diberikan. Konten sudah final.
2. **Jangan mengarang kebijakan.** Dilarang menambah kalimat aturan/kebijakan apa pun di halaman yang dilihat orang tua (mis. syarat pembatalan, jam layanan) tanpa diminta eksplisit.
3. **Semua halaman/komponen BARU wajib memakai design tokens di bawah.** Jangan pakai styling default/bootstrap-ish/gradien ungu/font sistem.
4. **TIDAK ADA emoji/ikon daging atau seafood di mana pun** (🍗🍤🍖🥩🍣🐟 dsb) — kantin ini vegan. Untuk menu bernama seperti "ayam"/"bakso" (mock meat nabati), pakai ikon netral (mis. 🥘🧆🍚), bukan ikon hewan/daging asli.
5. Keputusan produk lengkap ada di `perintah-perbaikan-claude-code.md` — kalau ragu, rujuk ke sana, jangan menebak.
6. **Panduan wajib satu sumber.** Konten floating help button (?) di PreOrderParent HARUS sama persis dengan `panduan-pemesanan.html` — jangan duplikat/tulis ulang terpisah. Kalau modal butuh render beda (mis. bukan iframe), ambil isinya dari file yang sama, bukan salin-tempel manual yang bisa nyimpang seiring waktu.

## DESIGN TOKENS (wajib untuk semua UI)

- **Font:** 'Onest' untuk SEMUA teks, 'DM Mono' hanya untuk gaya struk/angka (import Google Fonts). Tanpa font display/kartun.
- **Warna:**
  - Palet referensi pemilik (kuning + hijau alami), versi TERPILIH — jangan tambah warna lain: Mama menolak warna penuh yang banyak, hitam, biru, dan hijau-di-mana-mana. Papa melihat dengan SATU mata → pemisahan antar kartu harus jelas lewat selisih terang-gelap. Sumber tunggal: `src/lib/theme.ts` (jangan hardcode hex baru).
  - Background `#FAF3DF` (kuning krem — permintaan Mama; sebelumnya `#FAF6EE` terasa putih; SAMA untuk dapur & halaman orang tua) · Surface (kartu) `#FFF9E9` — JANGAN putih murni `#FFFFFF` · Surface lembut `#FFF4D9`
  - Kartu pesanan: PITA ATAS kuning lemon terang `#FFF0A8` (abu ditolak Mama: "kurang bright clear"). SATU garis saja per kartu — bingkai luar. DILARANG garis di bawah pita dan garis vertikal di samping daftar ("kebanyakan garis"), SELURUH kartu SELANG-SELING, tapi HANYA SALAH SATU yang berwarna (permintaan Mama via WA): ganjil POLOS krem `t.surface`, genap hijau zaitun krem `#E4EEC9` (t.bandAlt; bingkai `#C3D8A0` t.bandAltLine, pemisah `#D3E4B7` t.bandAltDiv — pilihan D, tidak kontras dengan latar); alternatif yang Mama setujui = kuning krem `#FFF4BF` (t.primaryLight) — tinggal tukar satu baris. Hijau keabuan/sage DITOLAK. Isi atas tetap: centang + nama + kelas/waktu ambil + jam, dipisah dari daftar menu oleh SATU garis tipis `t.borderStrong` (karena tidak ada pita lagi). TANPA garis putus-putus (ditolak Mama).
  - Halaman Pre-order: SATU kartu utama (tanggal + status + angka sebagai teks + tiga bulatan ikon) TANPA garis/grid pemisah — bagian dibedakan lewat jarak dan bentuk (permintaan Mama). Jangan kembalikan kotak-kotak terpisah.
  - Hero (kuning) `#FFE66D` · hover `#F2D84F` · light `#FFF4BF` · garis = kuning yang SAMA `#FFE66D` (hanya SATU kuning, tidak ada kuning kedua yang lebih tua) · tulisan di atas hero GELAP `#2A2820` — chip/tab terpilih, tombol utama
  - Pil status sesi: Dibuka isi `#D6F2B0` + garis `#5DBB3F` + teks `#1E5E1A` · **Ditutup = MERAH SOLID** `#D9382A` teks putih · **Tutup Otomatis = merah lembut** isi `#FFDDD7` + garis tegas 2px `#E0392B` + teks `#B3261E` (permintaan Mama). Centang Sudah `#5BAF4E` · angka/tulisan Sudah `#1F7A2E` · garis kotak aktif `#FFE66D`
  - Kotak ringkasan NETRAL (krem terang) dan SEMUA angkanya SATU warna (teks gelap) — permintaan pemilik (tidak lagi hijau/merah); yang aktif berlatar kuning pucat. Judul kartu (Laporan) LEBIH TEGAS dari isinya
  - Peringatan: Telat/Ditutup `#A82F24` (bg `#FBE7E3`) · Tutup otomatis jingga `#8F4E08` (bg `#FFE9CC`)
  - Teks `#2A2820` · Teks redup `#5F5C4D` · Border `#E9DFC4` (tipis, hangat; JANGAN gelap/hitam) · Border tegas `#DDD1B0` · Divider `#F1E8CF` · Garis elemen terpilih `#F2B53C` (kuning madu)
  - Tulisan di atas tombol/chip hero SELALU gelap (`t.onPrimary`). Jangan pakai kuning untuk teks.
- **Bentuk:** kartu radius 16–18px; tombol radius 12–14px; pil radius 999. Border 1–1.5px, bukan shadow berat.
- **Ukuran:** target sentuh ≥48px; teks penting besar & tebal (pengguna 50–60 th): judul 17–23px w800, isi ≥15px.
- **Ikon:** Lucide saja.
- **Emoji:** DILARANG di UI admin. Pengecualian: tile kategori halaman parent (map tetap di kode) + branding 🪷.
- **Rasa:** kalem ala Apple/Notion/Linear. Satu warna = satu tugas (lihat palet). Bukan dashboard POS ramai, bukan Material warna-warni.
- **Kolom ketik:** huruf WAJIB ≥16px (sudah dipaksa global di `theme.css`) — di bawah itu Safari iOS memperbesar layar dan terasa "susah mengetik".
- **Header halaman (4 tab + halaman baru):** SAMA PERSIS — padding atas 20px, baris `flex items-center justify-between`, judul 22px w800 `letter-spacing:-.02em` rata kiri 20px (hasilnya top ±26px di HP), tombol gear (Pengaturan) KOTAK 44×44 radius 12 border 1.5px `t.border` isi `t.surface` ikon Settings 19px, 20px dari tepi kanan. Info ringkas (mis. total) boleh di kiri gear, jangan mengubah tinggi/posisi baris judul. Jangan bikin variasi per halaman.
- **Tombol melayang "kembali ke atas":** bulat 48px, token `t.fab` (abu-kuning lembut `#D6D0B0`) + panah gelap, kanan bawah di ATAS nav (bukan menempel dasar). Bukan hitam (ditolak), bukan kuning (menyatu dengan pita kartu).
- **Grid dua kolom kartu:** pakai `repeat(2, minmax(0, 1fr))` + item `minWidth:0` — `1fr` biasa bisa jadi 6:4 di iOS.
- **Interaksi:** hindari dialog konfirmasi → pakai Undo. Picker tanggal/jam wajib bisa diketuk di SELURUH area (input overlay inset:0), uji di Safari iOS.

## ISTILAH TERKUNCI

"Cetak" (bukan Print) · "Belum Dibayar" (bukan Belum Bayar) · "Lunas" · halaman & tab "Transaksi" (bukan Tagihan) · "Konfirmasi Pesanan" · "Tanggal Layanan" · "Waktu Ambil" · singkatan "Ist. 2" / "Pulang" · "Sudah/Belum Dikemas".

## KEPUTUSAN PRODUK TERKUNCI (ringkas)

- **Tab Menu: tanggal bawaan otomatis** = tanggal sesi; setelah jam ambil TERAKHIR hari itu lewat (dari jadwal Waktu Ambil, cadangan 13:00) atau tanggal sesi sudah lewat → hari sekolah berikutnya (lewati Sabtu/Minggu). Jangan pindah di jam tutup 08:00 — orang tua kantin masih packing.
- Satu sesi Pre-order aktif; ortu TIDAK pernah memilih tanggal; **Tanggal Layanan ditetapkan server** dari sesi aktif; auto-tutup (default 08:00) ditegakkan server (tolak pesanan).
- Pre-order langsung masuk Transaksi sebagai **Belum Dibayar sejak submit** (packing ≠ tagihan).
- Batalkan transaksi = **soft-delete** (tetap tampil di riwayat Lunas dengan badge).
- Nav 5 tab: Pre-order · Penjualan · Transaksi · Menu · Laporan; Pengaturan via gear.
- Tingkat dinamis (KB, TK A, TK B, SD, SMP, SMA, Guru/Karyawan) dikelola dari Pengaturan.
- **Waktu Ambil dinamis** (default: "Istirahat 1", "Istirahat 2", "Istirahat 3", "Pulang Sekolah") dikelola dari Pengaturan → tambah/edit/hapus tanpa coding.
- Pil KELAS (grade): BORDER SAJA (`#A59B80`, tebal 1.5px), isi transparan, teks gelap — TANPA warna per tingkat (keputusan pemilik menggantikan aturan lama "pil berwarna solid"). Chip saringan kelas di Pre-order: SEMUA hanya GARIS tanpa isi — tidak dipilih = garis tipis 1px, dipilih = garis kuning 3px (bukan isi kuning, bukan warna per tingkat).
- WA tagihan gaya struk, **pratinjau & bisa diedit sebelum kirim**; pembuka/penutup dari Pengaturan; template tanpa emoji; encoding UTF-8 (jangan sampai `�`).
- Satu pesanan = satu anak + satu waktu ambil; layar sukses punya "Buat Pesanan Lagi" (data pemesan tetap terisi).
- **Laporan** (tab ke-5 di nav, BUKAN di Pengaturan; header standar + gear): HANYA membaca, per bulan WIB. Atas (selalu tampak): ‹ bulan tahun ›, Masuk (Lunas) + panah % dari bulan lalu, batang Pre-order(Utensils)/Penjualan(ShoppingCart). Di bawahnya DUA TAB: **Ulasan** (kalender warna harian + ikon Lunas/Belum, donat menu, 2 meter persen) | **Rincian** (tabel: ringkasan, per hari, per menu, per tingkat, packing — Mama tidak punya laptop, jadi rincian dilihat di app, bukan unduhan). Unduh PDF/Excel hanya lewat menu ... di kartu atas (untuk arsip). Gaya: SINGKAT, utamakan ikon/gambar, sedikit kata, huruf tidak "gundut" (tebal 600-700, bukan 800 kecuali judul tab), palet HANYA kuning+hijau+teks gelap, tanpa merah/piala/bendera. Istilah pemasukan/omzet, bukan laba. Belum ada rekap tunai/non-tunai.
- **Drop-off**: kotak bekal dititipkan di **Pos Satpam** sebelum jam masuk sekolah, berlaku SEMUA tingkat.
- **Pickup (beda per tingkat, WAJIB tampil jelas)**: **KB/TK/SD kelas 1–2 → diantar ke kelas** oleh kantin; **SD kelas 3 ke atas → diambil sendiri di Lemari Pengambilan Bekal** (loker di lobby).
