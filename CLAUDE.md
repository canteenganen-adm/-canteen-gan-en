# CLAUDE.md — Canteen Gan En

Aplikasi kantin sekolah keluarga. Pengguna utama: Mama & Papa (±50–60 th, non-teknis) dan orang tua murid. Live di canteen-gan-en.vercel.app (halaman ortu: /pesan). Stack: React + Supabase + Vercel.

## ATURAN EMAS (baca dulu)

1. **File dari pemilik = pakai APA ADANYA.** Jangan menulis ulang, meringkas, "memperbaiki", atau menambah konten/desain pada file .jsx/.html yang diberikan. Konten sudah final.
2. **Jangan mengarang kebijakan.** Dilarang menambah kalimat aturan/kebijakan apa pun di halaman yang dilihat orang tua (mis. syarat pembatalan, jam layanan) tanpa diminta eksplisit.
3. **Semua halaman/komponen BARU wajib memakai design tokens di bawah.** Jangan pakai styling default/bootstrap-ish/gradien ungu/font sistem.
4. Keputusan produk lengkap ada di `perintah-perbaikan-claude-code.md` — kalau ragu, rujuk ke sana, jangan menebak.

## DESIGN TOKENS (wajib untuk semua UI)

- **Font:** 'Plus Jakarta Sans' untuk SEMUA teks (import Google Fonts). Tanpa font display/kartun.
- **Warna:**
  - Background `#FAF6EE` · Surface `#FFFCF7` · Surface lembut `#FFF8EE`
  - Primary `#FDB833` · Primary hover `#F9A03F` · Primary light `#FFF1CC` · Teks amber `#8a5c00`
  - Success `#6FA76D` / bg `#EAF5E6` / teks `#3F6B43`
  - Error `#D95D5D` / bg `#FBEAEA` · Warning bg `#FFF4DA`
  - Teks `#2F2A24` · Teks redup `#756B5D` · Border `#E8E0D2` · Divider `#F1EBE0`
- **Bentuk:** kartu radius 16–18px; tombol radius 12–14px; pil radius 999. Border 1–1.5px, bukan shadow berat.
- **Ukuran:** target sentuh ≥48px; teks penting besar & tebal (pengguna 50–60 th): judul 17–23px w800, isi ≥15px.
- **Ikon:** Lucide saja.
- **Emoji:** DILARANG di UI admin. Pengecualian: tile kategori halaman parent (map tetap di kode) + branding 🪷.
- **Rasa:** kalem ala Apple/Notion/Linear. Satu aksen amber. Bukan dashboard POS ramai, bukan Material warna-warni.
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
- Pil kelas berwarna per tingkat (solid, teks putih): KB `#D6608A` · TK `#7C6BAF` · SD `#C94F4F` · SMP `#4A7BA6` · SMA `#6E6E6E` · Guru/Karyawan `#2F2A24`.
- WA tagihan gaya struk, **pratinjau & bisa diedit sebelum kirim**; pembuka/penutup dari Pengaturan; template tanpa emoji; encoding UTF-8 (jangan sampai `�`).
- Satu pesanan = satu anak + satu waktu ambil; layar sukses punya "Buat Pesanan Lagi" (data pemesan tetap terisi).
