/* Bagian bawah pesan WA tagihan yang bisa diubah dari Pengaturan → Tagihan
   (pemilik 1 Nov: berita transfer & penutup tidak perlu minta ke developer tiap kali).
   Blok Berita Transfer disimpan sebagai SATU teks (kolom wa_transfer) berbentuk:
     <judul>\n<kata kunci terpilih, mis. {nama} {kelas} {tanggal}>\n\n<kalimat bukti transfer>
   dan hanya diubah lewat layar Pengaturan (judul & kalimat bukti diketik, kata kunci dipilih dengan diketuk). */

export type BeritaKunci = "nama" | "kelas" | "tanggal";
export const BERITA_KUNCI: { kunci: BeritaKunci; label: string }[] = [
  { kunci: "nama", label: "Nama" },
  { kunci: "kelas", label: "Kelas" },
  { kunci: "tanggal", label: "Tanggal" },
];

export interface BeritaTransfer {
  judul: string;
  kunci: BeritaKunci[];
  bukti: string;
}

export const BERITA_STANDAR: BeritaTransfer = {
  judul: "Berita transfer (wajib diisi):",
  kunci: ["nama", "kelas", "tanggal"],
  bukti: "Setelah transfer, wajib kirim bukti transfer ke WhatsApp ini.",
};

export const WA_AKHIR_STANDAR = "Gan En";

/** Susun teks tersimpan dari bagian-bagiannya. */
export function rakitBerita(b: BeritaTransfer): string {
  return `${b.judul}\n${b.kunci.map((k) => `{${k}}`).join(" ")}\n\n${b.bukti}`;
}

export const WA_TRANSFER_STANDAR = rakitBerita(BERITA_STANDAR);

/** Pecah teks tersimpan jadi bagian-bagiannya (kebalikan rakitBerita). */
export function uraiBerita(tpl: string): BeritaTransfer {
  const baris = tpl.split("\n");
  const kunci = BERITA_KUNCI.map((k) => k.kunci).filter((k) => (baris[1] ?? "").includes(`{${k}}`));
  return { judul: baris[0] ?? "", kunci, bukti: baris.slice(2).join("\n").replace(/^\n+/, "") };
}

/** Isi blok berita transfer untuk satu pesan. Tidak ada kata kunci terpilih → hanya kalimat bukti
 * (tanpa judul dan baris berita kosong). Kata kunci yang kosong (mis. kelas untuk kakak-adik) dilewati. */
export function isiTemplateTransfer(tpl: string, v: { nama: string; kelas: string; tanggal: string }): string {
  const b = uraiBerita(tpl);
  const isi = b.kunci.map((k) => v[k]).filter(Boolean).join(" ");
  return [isi ? `${b.judul}\n${isi}`.trim() : "", b.bukti.trim()].filter(Boolean).join("\n\n");
}
