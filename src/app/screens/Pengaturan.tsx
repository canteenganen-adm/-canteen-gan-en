import { useEffect, useState } from "react";
import {
  Store, Printer, MessageCircle, Database, Info, X, Check, Download,
} from "lucide-react";
import { t } from "../../lib/theme";
import type { CanteenSettings } from "../../types";

/* ============================================================
   PENGATURAN — Canteen Gan En  (dibuka dari ikon gear di header)
   Decision Lock §8: HANYA config jarang berubah —
   Nama Kantin, Printer, Nomor WhatsApp, Backup, Tentang.
   Status Pre-order & Tanggal Layanan TIDAK di sini (operasional,
   tempatnya di halaman Pre-order).
   ============================================================ */

export default function Pengaturan({
  settings,
  onChange,
  onClose,
}: {
  settings: CanteenSettings;
  onChange: (patch: Partial<CanteenSettings>) => void;
  onClose: () => void;
}) {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2200); return () => clearTimeout(id); }, [toast]);

  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 60px" }}>

        <div className="flex items-center justify-between" style={{ padding: "20px 20px 14px" }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>Pengaturan</div>
          <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: t.surface, color: t.text2, cursor: "pointer", display: "grid", placeItems: "center" }}><X size={20} /></button>
        </div>

        <div style={{ padding: "0 20px" }}>
          {/* Identitas */}
          <Group label="Kantin">
            <FieldRow icon={<Store size={20} />} label="Nama Kantin">
              <input value={settings.namaKantin} onChange={(e) => onChange({ namaKantin: e.target.value })} style={inp} />
            </FieldRow>
            <FieldRow icon={<MessageCircle size={20} />} label="Nomor WhatsApp">
              <input value={settings.whatsapp} onChange={(e) => onChange({ whatsapp: e.target.value })} placeholder="08…" style={inp} />
            </FieldRow>
          </Group>

          {/* Printer */}
          <Group label="Perangkat">
            <div className="flex items-center gap-3" style={{ padding: "14px 16px" }}>
              <span style={ic}><Printer size={20} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Printer</div>
                <div style={{ fontSize: 12.5, color: t.text2, marginTop: 2 }}>{settings.printerConnected ? "Terhubung" : "Belum terhubung"}</div>
              </div>
              <button onClick={() => { onChange({ printerConnected: !settings.printerConnected }); setToast(settings.printerConnected ? "Printer diputus" : "Printer terhubung"); }}
                className="flex items-center gap-1" style={{ height: 40, padding: "0 14px", borderRadius: 10, border: `1.5px solid ${settings.printerConnected ? "#D8E6D4" : t.border}`, background: settings.printerConnected ? t.successBg : t.surface, color: settings.printerConnected ? t.successText : t.text, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
                {settings.printerConnected ? <><Check size={16} /> Aktif</> : "Hubungkan"}
              </button>
            </div>
          </Group>

          {/* Data */}
          <Group label="Data">
            <button onClick={() => setToast("Backup data dibuat.")} className="flex items-center gap-3" style={rowBtn}>
              <span style={ic}><Database size={20} /></span>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Backup Data</div>
                <div style={{ fontSize: 12.5, color: t.text2, marginTop: 2 }}>Simpan salinan menu & transaksi</div>
              </div>
              <Download size={18} color={t.textDis} />
            </button>
          </Group>

          {/* Tentang */}
          <Group label="Lainnya">
            <div className="flex items-center gap-3" style={{ padding: "14px 16px" }}>
              <span style={ic}><Info size={20} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Tentang</div>
                <div style={{ fontSize: 12.5, color: t.text2, marginTop: 2 }}>Canteen Gan En · v1.0</div>
              </div>
            </div>
          </Group>

          <div style={{ textAlign: "center", fontSize: 12, color: t.textDis, marginTop: 24 }}>
            Status Pre-order & Tanggal Layanan ada di halaman Pre-order, bukan di sini.
          </div>
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", left: 20, right: 20, bottom: 24, display: "flex", justifyContent: "center" }}>
          <div className="flex items-center gap-2" style={{ maxWidth: 380, width: "100%", background: t.text, color: "#FBF7EF", borderRadius: 14, padding: "14px 18px", fontSize: 14.5, fontWeight: 600 }}>
            <Check size={18} color={t.success} /> {toast}
          </div>
        </div>
      )}
    </div>
  );
}

const ic: React.CSSProperties = { width: 42, height: 42, borderRadius: 11, background: t.primaryLight, color: t.amberText, display: "grid", placeItems: "center", flex: "none" };
const inp: React.CSSProperties = { width: "100%", height: 46, fontSize: 16, color: t.text, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 10, padding: "0 12px", outline: "none", fontFamily: "inherit" };
const rowBtn: React.CSSProperties = { width: "100%", padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", color: t.text };

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const kids = Array.isArray(children) ? children : [children];
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: t.text2, margin: "0 4px 8px" }}>{label}</div>
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 2px rgba(47,42,36,.04)" }}>
        {kids.map((c, i) => (
          <div key={i} style={i > 0 ? { borderTop: `1px solid ${t.divider}` } : undefined}>{c}</div>
        ))}
      </div>
    </div>
  );
}
function FieldRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3" style={{ padding: "12px 16px" }}>
      <span style={ic}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: t.text2, marginBottom: 6 }}>{label}</div>
        {children}
      </div>
    </div>
  );
}
