/* Salin teks ke papan klip (ikon Salin di pratinjau pesan WhatsApp; pemilik 4 Nov: pesan panjang bisa ditempel di chat pribadi tanpa batas tautan wa.me).
   Memakai Clipboard API; cadangan lama (textarea + execCommand) untuk Safari/HP yang menolak. Mengembalikan true bila berhasil. */
export async function salinTeks(teks: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(teks); return true; }
  } catch { /* lanjut ke cadangan */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = teks;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, teks.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/** Batas panjang pesan yang masih aman dikirim lewat tautan wa.me (lebih panjang dipotong WhatsApp/HP — kasus Richie 4 Nov).
    Lebih dari ini: pesan LENGKAP disalin ke papan klip dan chat dibuka kosong; Mama tinggal menempel. */
export const BATAS_LINK_WA = 1800;
