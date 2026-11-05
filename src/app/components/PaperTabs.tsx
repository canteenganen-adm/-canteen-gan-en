import { t } from "../../lib/theme";

/* Tab "kertas" ala Chrome — dipakai di tab Menu (Tampilan Ortu · Menu)
   dan Transaksi (Belum Dibayar · Lunas). Kertas aktif: sudut atas
   membulat, SEWARNA dengan latar di bawahnya (menyatu, bukan lebih terang) dan memutus garis di bawahnya. BUKAN pil segmen. */
export default function PaperTabs<T extends string>({ tabs, value, onChange, warna, sama }: {
  tabs: { id: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  /** Warna kertas aktif — HARUS sama dengan blok tepat di bawah garisnya (default: latar halaman). */
  warna?: string;
  /** Lebar tab SAMA + garis 1.5px (gaya Transaksi, Buku Perintah bagian 4). */
  sama?: boolean;
}) {
  const g = sama ? "1.5px" : "1px";
  return (
    <div>
      <div className="flex" style={{ gap: 4, alignItems: "flex-end" }}>
        {tabs.map(({ id, label }) => {
          const on = id === value;
          return (
            <button key={id} onClick={() => onChange(id)}
              className="flex items-center gap-1.5"
              style={{ padding: tabs.length > 2 ? "11px 12px 10px" : "11px 20px 10px", whiteSpace: "nowrap", fontSize: sama ? 15 : 14, fontWeight: on ? (sama ? 700 : 800) : 600, cursor: "pointer",
                ...(sama ? { flex: 1, justifyContent: "center", minHeight: 48 } : {}),
                borderTopLeftRadius: sama ? 12 : 14, borderTopRightRadius: sama ? 12 : 14, borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
                borderTop: `${g} solid ${on ? t.border : "transparent"}`,
                borderLeft: `${g} solid ${on ? t.border : "transparent"}`,
                borderRight: `${g} solid ${on ? t.border : "transparent"}`,
                borderBottom: 0,
                background: on ? (warna ?? t.bg) : "transparent", // sewarna dengan blok di bawahnya
                color: on ? t.text : t.text2,
                position: "relative", top: sama ? 1.5 : 1, fontFamily: "inherit" }}>
              {label}
            </button>
          );
        })}
      </div>
      <div style={{ height: g, background: t.border }} />
    </div>
  );
}
