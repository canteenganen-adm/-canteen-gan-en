# FORMAT PESAN WA TAGIHAN — Perintah untuk Claude Code

Ubah fungsi `buildWaMsg` (dan tempat lain yang menghasilkan teks pesan WA tagihan/struk pre-order) di Tagihan.jsx agar formatnya PERSIS seperti contoh di bawah — bukan mendekati, PERSIS.

## SEBELUM (salah — format lama)
```
Selamat siang Ayah/Bunda. Berikut rincian transaksi di Canteen Gan En:
Nama: Jovinco golix
Tingkat/Kelas: 1B
[Sen, 13 Jul 2026 · 06:39:09 WIB]
  • Capcay  (S) ×1 = Rp3.000
  • Nasi putih (S) ×1 = Rp3.000
  • Telur Dadar Kecap Manis ×1 = Rp4.000
  • Puding Coklat + Vla ×1 = Rp5.000
Total: Rp15.000
Pembayaran dapat dititipkan melalui Ananda. Terima kasih.
```

## SESUDAH (target — pakai persis ini)
```
Halo Papa/Mama,
Terima kasih telah melakukan pemesanan di Canteen Gan En. Berikut rincian pesanan Ananda:
Nama: Jovinco Golix
Kelas: 1B
Senin, 13 Juli 2026 • 06.39 WIB
• Capcay (S) ×1 = Rp3.000
• Nasi Putih (S) ×1 = Rp3.000
• Telur Dadar Kecap Manis ×1 = Rp4.000
• Puding Coklat + Vla ×1 = Rp5.000
Total Pembayaran: Rp15.000
Pembayaran dapat dilakukan secara tunai dengan menitipkan kepada Ananda, atau melalui transfer ke rekening berikut:
BCA 7347028990
a.n. Roswinarti

🪷 Gan En 🙏🏻✨
```

## Rincian perubahan (checklist implementasi)

1. **Sapaan pembuka** — ganti "Selamat siang Ayah/Bunda. Berikut rincian transaksi di Canteen Gan En:" menjadi dua baris: "Halo Papa/Mama," lalu "Terima kasih telah melakukan pemesanan di Canteen Gan En. Berikut rincian pesanan Ananda:". Ini tetap harus dibaca dari **Pengaturan → Template WhatsApp Tagihan → Kalimat Pembuka** (bukan hardcode) — update NILAI DEFAULT di Pengaturan/Supabase menjadi teks ini, bukan menempelnya langsung di kode.

2. **Label "Nama"** — nilai nama harus **Title Case** (huruf awal tiap kata besar): "Jovinco golix" → "Jovinco Golix". Terapkan fungsi capitalize di titik render nama untuk pesan WA (item menu JANGAN ikut di-capitalize kalau sudah benar, cek dulu — "Nasi putih" di data asli harusnya sudah "Nasi Putih", kalau data mentahnya lowercase, capitalize juga saat ditampilkan di sini).

3. **Label kelas** — "Tingkat/Kelas: 1B" → "Kelas: 1B" (hapus "Tingkat/").

4. **Format tanggal-jam** — "[Sen, 13 Jul 2026 · 06:39:09 WIB]" → "Senin, 13 Juli 2026 • 06.39 WIB":
   - Nama hari & bulan LENGKAP (bukan singkatan): Senin bukan Sen, Juli bukan Jul.
   - TANPA tanda kurung siku `[ ]`.
   - Waktu tanpa detik, format jam.menit dengan TITIK bukan titik dua: "06.39" bukan "06:39:09".
   - Pemisah tanggal dan jam pakai `•` bukan `·`.
   - TANPA "WIB" di akhir (sudah jelas dari konteks).
   - Buat helper function terpisah `fmtWaDate(date)` kalau belum ada, reuse di semua tempat yang butuh format ini.

5. **Baris item** — hilangkan indentasi spasi ganda sebelum `•` (row lama ada `  • Capcay`, harusnya rata kiri `• Capcay`). Hilangkan double-space pada nama item ("Capcay  (S)" → "Capcay (S)" — cek sumber data, kemungkinan ada trailing space).

6. **Label Total** — "Total: Rp15.000" → "Total Pembayaran: Rp15.000".

7. **Kalimat penutup + info bank** — ganti "Pembayaran dapat dititipkan melalui Ananda. Terima kasih." menjadi:
   ```
   Pembayaran dapat dilakukan secara tunai dengan menitipkan kepada Ananda, atau melalui transfer ke rekening berikut:
   BCA 7347028990
   a.n. Roswinarti
   ```
   Ini juga harus dibaca dari **Pengaturan → Template WhatsApp Tagihan → Kalimat Penutup** (bukan hardcode) — update nilai default-nya. Nomor rekening & nama pemilik SEBAIKNYA jadi field terpisah di Pengaturan (bukan ditulis manual dalam textarea kalimat penutup), supaya kalau nomor rekening berubah suatu saat, tidak perlu edit teks panjang.

8. **Footer** — tambah baris kosong lalu "🪷 Gan En 🙏🏻✨" di paling akhir pesan. Ini boleh hardcode (bukan dari Pengaturan) karena identitas brand tetap.

## Constraint
- Tetap tanpa emoji di badan pesan (item/total/pembuka/penutup) — HANYA footer yang pakai emoji, sesuai keputusan terkunci "template WA tanpa emoji, hindari bug encoding".
- Pastikan encoding UTF-8 tetap benar (jangan sampai 🪷 jadi `�` seperti bug lama).
- Pesan tetap muncul di sheet pratinjau **bisa diedit sebelum kirim** (fitur existing) — perubahan ini hanya mengubah teks default yang di-generate, bukan menghapus kemampuan edit manual.

## Testing
- Generate pesan untuk transaksi contoh (nama lowercase di database, kelas apa saja, beberapa item) → hasilnya harus cocok 1:1 dengan blok "SESUDAH" di atas (sesuaikan data).
- Cek tanggal Minggu, Senin, dst semua muncul lengkap dalam Bahasa Indonesia (bukan format locale Inggris "Mon, Jul").
