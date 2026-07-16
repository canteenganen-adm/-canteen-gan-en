# Laporan Status Project — 16 Juli 2026

Semua status di bawah dari pembacaan kode langsung + query read-only ke database produksi + uji di preview — bukan asumsi. Menggantikan `LAPORAN-STATUS-13-JUL.md`.

## 1. Info Dasar

| Hal | Status |
|---|---|
| Commit HEAD | `cd4f713` — UX + bugfix batch (picker HP, sub-filter Dibatalkan, heading seragam) |
| Vercel production | **Sama dengan HEAD** — bundle live identik dengan build lokal |
| Working tree | Kode bersih; hanya 2 file perintah `.md` untracked (bukan kode) |
| Database | Migration 1–9 SEMUA sudah jalan & terverifikasi (query langsung 16 Jul) |

## 2. Fitur yang Kamu Tanyakan — Status Sebenarnya

### Menu Harian (Menu Operasional per tanggal) — ✅ ADA & SUDAH DIPAKAI
- Tabel `menu_harian` live; **snapshot 15 Jul (66 item) dan 16 Jul tersimpan** — artinya alur Simpan sudah dipakai nyata.
- Kertas PO: selector "Tanggal Layanan" + tombol ↻ Refresh (`MasterMenu.tsx` ~285), struk thermal "MENU PO" (hybrid: nama Jakarta Sans, kerangka mono), tanggal lampau terkunci "Mode Lihat Riwayat", tanggal tanpa data → "Belum ada data tersimpan".
- Kertas Menu: toggle Utensils = draft harian; bar Simpan muncul saat ada perubahan ATAU tanggal belum pernah disimpan; **tombol ✕ baru** untuk membatalkan perubahan tanpa menyimpan (permintaanmu hari ini).
- Halaman ortu & guard banner PO Admin membaca snapshot (`App.tsx` parentMenus / menuBelumDisimpan).

### Input penjualan tanggal lampau (OTS susulan) — ✅ ADA, live sejak 15 Jul
- `Penjualan.tsx` ~60–75: chip "📅 Hari Ini" di samping kotak cari → pilih tanggal mundur (maks. hari ini) → daftar & **harga dari snapshot tanggal itu** (fallback jujur bila tanggal tak tersimpan), transaksi tercatat `service_date` = tanggal operasional, statistik ikut tanggal itu, tombol "Kembali ke Hari Ini".
- **Sesi PO tidak tersentuh oleh fitur ini sama sekali.** Kalau tidak terlihat di HP: halaman versi lama — tutup tab browser & buka ulang.

### Filter tanggal Transaksi — ✅ ADA
- `Tagihan.tsx`: tombol "📅 Tanggal" membuka sheet Semua/Hari Ini/7 Hari/30 Hari/Rentang (dari–s/d); AND dengan cari + sumber; total header mengikuti. Teruji: Semua Rp4.036.000 → Hari Ini Rp907.000 (15 Jul).

### Layout Penjualan — ✅ dirapikan 16 Jul
- Header ringkas (judul 22px, statistik kecil), tanggal transaksi jadi chip sebaris dengan cari, kategori kolom kiri + grid kanan scroll independen. Form Masuk Tagihan pakai chip Tingkat+Kelas (pil kelas berwarna; data lama tanpa tingkat kini ditebak dari teks kelas — "2a"→SD merah).

## 3. Batch UX/Bug Hari Ini (perintah-ux-bugfix-batch.md) — semua selesai di `cd4f713`

1. **Sub-filter tab Lunas [Lunas|Dibatalkan]** ✅ — default Lunas murni, total header tak tercampur; view Dibatalkan berisi Pulihkan/Hapus.
2. **Subtitle Menu dihapus** ✅.
3. **Heading 4 tab seragam 22px** ✅ (diverifikasi computed style).
4. **BUG Ganti Tanggal di HP** ✅ diperbaiki dua lapis: (a) "Pilih tanggal lain" & "Jam Tutup" kini pola input-overlay `inset:0` yang menerima ketukan langsung (akar masalahnya: pola lama `pointerEvents:none` + skrip pembuka yang gagal senyap di mobile — persis bug "Menu untuk" kemarin); (b) pelindung ghost-tap 300ms di Sheet supaya ketukan pembuka tidak "menembus" ke tombol Hari Sekolah Berikutnya. ⚠️ **PERLU VERIFIKASI MANUAL di HP-mu** (Safari iOS & Chrome Android) — aku hanya bisa menguji di browser desktop; sesuai spec, anggap selesai hanya setelah lolos di HP asli.

## 4. Yang Belum Dikerjakan (tidak berubah dari laporan lalu)

- Mode offline · Backup Data sungguhan (tombol masih palsu) · Cetak thermal · Tingkat dinamis (masih hardcode) · Kelompok kategori /pesan hardcode.

## 5. Rekomendasi Berikutnya

1. **Tes Ganti Tanggal langsung di HP** (dua browser) — laporkan kalau masih bandel, ada satu lapisan perbaikan lagi yang bisa kupasang (konfirmasi sebelum ganti tanggal).
2. Pakai alur harian beberapa hari (sesuai kesepakatan evaluasi-dari-pengalaman) sebelum menambah fitur.
3. Backup Data sungguhan tetap kandidat teratas berikutnya.
