import { t } from "../../lib/theme";

/* Tab "kertas" ala Chrome — dipakai di tab Menu (Tampilan Ortu · Menu)
   dan Transaksi (Belum Dibayar · Lunas). Kertas aktif: sudut atas
   membulat, SEWARNA dengan latar di bawahnya (menyatu, bukan lebih terang) dan memutus garis di bawahnya. BUKAN pil segmen. */
export default function PaperTabs<T extends string>({ tabs, value, onChange, warna }: {
  tabs: { id: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  /** Warna kertas aktif — HARUS sama dengan blok tepat di bawah garisnya (default: latar halaman). */
  warna?: string;
}) {
  return (
    <div>
      <div className="flex" style={{ gap: 4, alignItems: "flex-end" }}>
        {tabs.map(({ id, label }) => {
          const on = id === value;
          return (
            <button key={id} onClick={() => onChange(id)}
              className="flex items-center gap-1.5"
              style={{ padding: "11px 20px 10px", fontSize: 14, fontWeight: on ? 800 : 600, cursor: "pointer",
                borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
                borderTop: `1px solid ${on ? t.border : "transparent"}`,
                borderLeft: `1px solid ${on ? t.border : "transparent"}`,
                borderRight: `1px solid ${on ? t.border : "transparent"}`,
                borderBottom: 0,
                background: on ? (warna ?? t.bg) : "transparent", // sewarna dengan blok di bawahnya
                color: on ? t.text : t.text2,
                position: "relative", top: 1, fontFamily: "inherit" }}>
              {label}
            </button>
          );
        })}
      </div>
      <div style={{ height: 1, background: t.border }} />
    </div>
  );
}
