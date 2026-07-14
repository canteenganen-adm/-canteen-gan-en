# LAPORAN STATUS PROJECT — Canteen Gan En

Dibuat: 14 Juli 2026. Semua status di bawah hasil membaca kode langsung + query read-only ke database produksi — bukan dari ingatan chat atau file perintah.

---

## 1. Info Dasar

| Hal | Status |
|---|---|
| Commit HEAD | `c61264c` — "Kotak ringkasan PO Admin jadi filter: Semua / Sudah / Belum Dikemas" |
| Working tree | Kode sumber bersih. Yang belum ter-commit hanya: `CLAUDE.md` (modifikasi) + ±18 file perintah/backup `.md`/`.jsx` di folder root (bukan bagian aplikasi) |
| Vercel production | **Sama dengan HEAD.** Bundle live `index-DRyQv0GJ.js` identik dengan hasil build lokal commit `c61264c` — semua perbaikan terbaru sudah live |

---

## 2. Status Tiap Fitur

### SUDAH ADA & BERFUNGSI

| Fitur | Bukti lokasi |
|---|---|
| Auto-merge pesanan susulan per Nama+WA di Transaksi | `Tagihan.tsx` ~31 (`groupKey`), ~119 (pengelompokan). Bonus: pesanan susulan otomatis expand + highlight kuning (~75–97) |
| Tombol "Pulihkan" transaksi Dibatalkan | `Tagihan.tsx` ~379 (tab Lunas). Juga ada Pulihkan di Tong Sampah (`Pengaturan.tsx` ~638) |
| "Buat Pesanan Lagi" dengan data pemesan tetap terisi | `PreOrderParent.tsx` ~248: hanya keranjang & struk yang di-reset, form nama/kelas/WA TIDAK di-reset |
| Floating help (?) + modal panduan di halaman parent | `PreOrderParent.tsx` ~535 (tombol bulat kanan atas), ~546 (`HelpModal`: 5 langkah + Hal Perlu Diketahui + FAQ) |
| Badge sumber ikon-saja di Transaksi | `Tagihan.tsx` ~478 (`SourceTag`): ikon Lucide Utensils/ShoppingCart murni — tidak ada teks rusak |
| Auto-close jam 08:00 ditegakkan SERVER | Trigger `enforce_preorder_session` (`schema.sql` ~108–146): tolak insert pre-order jika sesi tutup / lewat jam, timezone `Asia/Jakarta`, `service_date` selalu ditimpa server. Tampilan "Tutup Otomatis" di admin & /pesan refresh tiap 30 detik |
| Waktu Ambil dinamis + jam default + jam per tingkat | `Pengaturan.tsx` ~344–443 (CRUD preset, Jam default, "Atur per tingkat"). ⚠️ Lihat catatan A di bawah |
| Banner "lewat waktu ambil" di PO Admin | `PreOrderAdmin.tsx` ~309 (banner merah sticky, tap = filter), ~158 (deteksi telat; Guru/Karyawan hanya dicek jika diisi eksplisit). ⚠️ Catatan A |
| Tong Sampah 30 hari | Kolom `deleted_at` ADA di DB. Halaman di Pengaturan (~588–678), Pulihkan, Hapus Sekarang + konfirmasi, sisa hari, auto-purge >30 hari tiap buka Pengaturan (`canteenApi.ts` ~193). Sudah teruji nyata: 1 transaksi masuk tong sampah 13 Jul |
| Edit Pesanan oleh admin | `Pengaturan.tsx` ~224–341: cari pesanan, edit Nama/Tingkat/Kelas/WA/Waktu Ambil, tersimpan via `patchTransactionCustomer` |
| Filter Sudah/Belum Dikemas via kartu stat | `PreOrderAdmin.tsx` (commit `c61264c`): ketiga kotak angka bisa diketuk, aktif = border amber. Terverifikasi di preview |
| Format pesan WA tagihan versi terbaru | `Tagihan.tsx` ~170–182 (`buildWaMsg`): pembuka dari Pengaturan, Nama Title Case, "Kelas:", tanggal `[Senin, 13 Juli 2026 • 06.39 WIB]`, "Total Pembayaran:", info bank terpisah, footer `🪷 Gan En 🙏🏻✨`, baris kosong antar blok |
| Template WA editable dari Pengaturan → Supabase | `Pengaturan.tsx` ~770–793 (pembuka/penutup/bank/rekening/atas nama). Terbukti berfungsi: kolom `wa_closing` di DB sudah berisi teks editan pemilik |
| Halaman /panduan | ADA. `vercel.json` rewrite `/panduan` → `public/panduan-pemesanan.html` (ter-commit). Live: HTTP 200, judul "Panduan Pemesanan". ⚠️ Catatan B |

### SETENGAH JADI

| Fitur | Kondisi |
|---|---|
| Tingkat dinamis | **Tingkat masih HARDCODE** di `src/lib/constants.ts` baris 3 (KB, TK A, TK B, SD, SMP, SMA, Guru/Karyawan). Yang dinamis (CRUD dari Pengaturan) adalah **daftar Kelas per tingkat** (38 kelas di DB). Menambah TINGKAT baru masih perlu coding |

### BELUM ADA SAMA SEKALI

| Fitur | Kondisi |
|---|---|
| Mode offline (cache + banner) | Tidak ada satu pun kode offline/localStorage/service-worker di `src/` |
| Cetak thermal | Tombol Cetak di PO Admin hanya placeholder "Cetak thermal — segera hadir" (`PreOrderAdmin.tsx` ~427) |
| Backup Data | ⚠️ Tombol di Pengaturan (~797) hanya menampilkan toast "Backup data dibuat." — **TIDAK benar-benar mem-backup apa pun** |
| Printer "Hubungkan" | Hanya saklar kosmetik (flag di DB), tidak terhubung printer sungguhan |

### Catatan penting

- **A — Jam Waktu Ambil belum diisi:** fiturnya sudah jadi, tapi kolom `pickup_schedules` di DB masih kosong (null). Deteksi "lewat waktu ambil" **belum aktif** sampai Mama/Papa mengisi jam di Pengaturan → Waktu Ambil. Tanpa coding, tinggal isi.
- **B — Dua versi teks panduan sedikit beda:** file `panduan-pemesanan.html` milik pemilik (di Downloads) vs yang ter-deploy di `public/` beda di 1 hal berarti: slogan **"Sehangat Masakan Ibu"** (file pemilik) vs **"Sehangat Pelukan Ibu"** (yang live, sama dengan halaman /pesan). Perlu keputusan pemilik mana yang benar — belum kuubah apa pun.
- **C — 1 item lama di Tong Sampah:** transaksi yang dihapus sebelum migration `cancelled_at` jalan akan kembali sebagai "Belum Dibayar" (bukan "Dibatalkan") kalau dipulihkan. Hanya berlaku untuk 1 item lama itu; item baru normal.

---

## 3. Database — Kolom & Migration

Dicek langsung ke Supabase production (query read-only, 14 Jul):

| Kolom | Tabel | Status |
|---|---|---|
| `cancelled_at` | transaksi | ✅ ADA (migration 3 — dijalankan 13 Jul setelah ketahuan terlewat) |
| `deleted_at` | transaksi | ✅ ADA (migration 4) |
| `auto_close_time` | app_state | ✅ ADA (migration 2 — berarti trigger server juga ikut terpasang) |
| `pickup_schedules` | app_state | ✅ ADA (migration 5) — isinya masih null, lihat Catatan A |
| `wa_opening`, `wa_closing`, `nama_bank`, `no_rekening`, `nama_rekening` | app_state | ✅ SEMUA ADA (migration 6) — yang null otomatis pakai teks default dari kode |
| tabel `kelas` | — | ✅ ADA, 38 baris |

**Kesimpulan: tidak ada migration yang tertinggal.** Kode dan skema DB sudah cocok.

---

## 4. Bug yang Pernah Terjadi — Status

**a) Produksi gagal load data (sekitar commit `02722d2`)** — ✅ SUDAH BERES.
Penyebab sebenarnya bukan commit itu, tapi commit Tong Sampah (`8457d8d`) yang menambahkan query filter `deleted_at` padahal kolomnya belum ada di DB → seluruh pengambilan transaksi error → app gagal load. Diperbaiki di `eb1656f`: filter dipindah ke JavaScript sehingga tahan terhadap kolom yang belum ada. Sekarang kolomnya juga sudah ada, jadi aman ganda.

**b) Banner "Gagal menyimpan… periksa koneksi" terus-menerus** — ✅ SUDAH BERES.
Penyebab: kolom `cancelled_at` tidak pernah ada di DB karena file `migration_3_riwayat.sql` dulu tidak ikut ter-commit ke repo, jadi terlewat saat migration 4–6 dijalankan. Setiap "Batalkan Transaksi" gagal tersimpan → banner error → Tong Sampah tidak sinkron. Beres 13 Jul: migration dijalankan (kolom terverifikasi ada), file migration sudah di-commit (`2561379`). Alur Batalkan → Hapus → Tong Sampah sudah teruji jalan.

**c) Mengetik nama menu susah / teks mundur sendiri** — ✅ SUDAH BERES (commit `b0bb5e1`): simpan di-debounce, data server tidak lagi menimpa ketikan.

Build produksi lolos tanpa error. Tidak ada bug aktif yang kuketahui saat ini — yang tersisa adalah catatan A–C di atas dan tombol placeholder (Backup, Cetak, Printer).

---

## 5. Yang Belum Dikerjakan Sama Sekali

1. Mode offline (cache data terakhir + banner "sedang offline")
2. Backup Data sungguhan (tombol sekarang menyesatkan — seolah backup padahal tidak)
3. Cetak thermal (Rekap per Kelas / per Menu / Label)
4. Tingkat dinamis (menambah tingkat baru masih perlu coding)
5. Kelompok kategori di /pesan masih hardcode — kategori baru buatan admin otomatis masuk "Makanan Berat"

---

## 6. Rekomendasi Urutan Kerja Berikutnya

1. **(Tanpa coding, 5 menit)** Isi jam di Pengaturan → Waktu Ambil supaya deteksi "lewat waktu ambil" mulai bekerja — fiturnya sudah menunggu datanya saja.
2. **(Keputusan pemilik)** Slogan panduan: "Sehangat Pelukan Ibu" atau "Sehangat Masakan Ibu"? Satu kalimat jawaban, langsung kusinkronkan.
3. **Perbaiki tombol Backup Data** — sekarang berbohong. Minimal: unduh file JSON/Excel berisi menu + transaksi. Ini penting sebelum makin banyak data produksi.
4. **Mode offline** — kantin bergantung sinyal; cache terakhir + banner akan sangat membantu saat internet sekolah lambat.
5. Cetak thermal & Tingkat dinamis — sesuai kebutuhan nyata, tidak mendesak.
