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
  - Background `#FAF6EE` (versi lama, pilihan Mama) · Surface (kartu) `#FFFCF7` — JANGAN putih murni `#FFFFFF` · Surface lembut `#FFF8EE`
  - Kartu pesanan: PITA ATAS kuning lemon terang `#FFF0A8` (abu ditolak Mama: "kurang bright clear"). SATU garis saja per kartu — bingkai luar. DILARANG garis di bawah pita dan garis vertikal di samping daftar ("kebanyakan garis"), SAMA untuk semua kartu — memuat centang + nama + kelas/waktu ambil + jam. TANPA warna selang-seling dan TANPA garis putus-putus (semua sudah ditolak Mama).
  - Halaman Pre-order: SATU kartu utama (tanggal + status + angka sebagai teks + tiga bulatan ikon) TANPA garis/grid pemisah — bagian dibedakan lewat jarak dan bentuk (permintaan Mama). Jangan kembalikan kotak-kotak terpisah.
  - Hero (kuning) `#FFE66D` · hover `#F2D84F` · light `#FFF4BF` · garis `#E8C84C` (SATU keluarga kuning: jangan campur jingga/hijau-kekuningan) · tulisan di atas hero GELAP `#2A2820` — chip/tab terpilih, tombol utama
  - Pil status sesi: Dibuka isi `#D6F2B0` + garis `#5DBB3F` + teks `#1E5E1A` · **Ditutup = MERAH SOLID** `#D9382A` teks putih · **Tutup Otomatis = merah lembut** isi `#FFDDD7` + garis tegas 2px `#E0392B` + teks `#B3261E` (permintaan Mama). Centang Sudah `#5BAF4E` · angka/tulisan Sudah `#1F7A2E` · garis kotak aktif `#E8C84C`
  - Kotak ringkasan NETRAL (krem terang); hanya ANGKA berwarna: Sudah hijau olive, Belum merah `#A82F24`, Pesanan gelap
  - Peringatan: Telat/Ditutup `#A82F24` (bg `#FBE7E3`) · Tutup otomatis jingga `#8F4E08` (bg `#FFE9CC`)
  - Teks `#2A2820` · Teks redup `#5F5C4D` · Border `#E8E0D2` (tipis, seperti versi lama; JANGAN gelap/hitam) · Border tegas `#DDD4C0` · Divider `#F1EBE0` · Garis elemen terpilih `#F2B53C` (kuning madu)
  - Tulisan di atas tombol/chip hero SELALU gelap (`t.onPrimary`). Jangan pakai kuning untuk teks.
- **Bentuk:** kartu radius 16–18px; tombol radius 12–14px; pil radius 999. Border 1–1.5px, bukan shadow berat.
- **Ukuran:** target sentuh ≥48px; teks penting besar & tebal (pengguna 50–60 th): judul 17–23px w800, isi ≥15px.
- **Ikon:** Lucide saja.
- **Emoji:** DILARANG di UI admin. Pengecualian: tile kategori halaman parent (map tetap di kode) + branding 🪷.
- **Rasa:** kalem ala Apple/Notion/Linear. Satu warna = satu tugas (lihat palet). Bukan dashboard POS ramai, bukan Material warna-warni.
- **Kolom ketik:** huruf WAJIB ≥16px (sudah dipaksa global di `theme.css`) — di bawah itu Safari iOS memperbesar layar dan terasa "susah mengetik".
- **Interaksi:** hindari dialog konfirmasi → pakai Undo. Picker tanggal/jam wajib bisa diketuk di SELURUH area (input overlay inset:0), uji di Safari iOS.

## ISTILAH TERKUNCI

"Cetak" (bukan Print) · "Belum Dibayar" (bukan Belum Bayar) · "Lunas" · halaman & tab "Transaksi" (bukan Tagihan) · "Konfirmasi Pesanan" · "Tanggal Layanan" · "Waktu Ambil" · singkatan "Ist. 2" / "Pulang" · "Sudah/Belum Dikemas".

## KEPUTUSAN PRODUK TERKUNCI (ringkas)

- Satu sesi Pre-order aktif; ortu TIDAK pernah memilih tanggal; **Tanggal Layanan ditetapkan server** dari sesi aktif; auto-tutup (default 08:00) ditegakkan server (tolak pesanan).
- Pre-order langsung masuk Transaksi sebagai **Belum Dibayar sejak submit** (packing ≠ tagihan).
- Batalkan transaksi = **soft-delete** (tetap tampil di riwayat Lunas dengan badge).
- Nav 4 tab: Pre-order · Penjualan · Transaksi · Menu; Pengaturan via gear.
- Tingkat dinamis (KB, TK A, TK B, SD, SMP, SMA, Guru/Karyawan) dikelola dari Pengaturan.
- **Waktu Ambil dinamis** (default: "Istirahat 1", "Istirahat 2", "Istirahat 3", "Pulang Sekolah") dikelola dari Pengaturan → tambah/edit/hapus tanpa coding.
- Pil KELAS (grade): BORDER SAJA (`#A59B80`, tebal 1.5px), isi transparan, teks gelap — TANPA warna per tingkat (keputusan pemilik menggantikan aturan lama "pil berwarna solid"). Chip saringan kelas di Pre-order: terpilih = kuning hero, tidak terpilih = teks polos.
- WA tagihan gaya struk, **pratinjau & bisa diedit sebelum kirim**; pembuka/penutup dari Pengaturan; template tanpa emoji; encoding UTF-8 (jangan sampai `�`).
- Satu pesanan = satu anak + satu waktu ambil; layar sukses punya "Buat Pesanan Lagi" (data pemesan tetap terisi).
- **Drop-off**: kotak bekal dititipkan di **Pos Satpam** sebelum jam masuk sekolah, berlaku SEMUA tingkat.
- **Pickup (beda per tingkat, WAJIB tampil jelas)**: **KB/TK/SD kelas 1–2 → diantar ke kelas** oleh kantin; **SD kelas 3 ke atas → diambil sendiri di Lemari Pengambilan Bekal** (loker di lobby).
