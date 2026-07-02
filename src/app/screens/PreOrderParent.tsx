import { useState } from "react";
import {
  Plus, Minus, ChevronRight, ArrowLeft, Check, Clock, Layers,
  Store, Calendar, StickyNote, ShoppingBag,
} from "lucide-react";
import { t } from "../../lib/theme";
import { rupiah, orderNo } from "../../lib/format";
import type { MenuItem, Variant } from "../../types";

/* ============================================================
   PRE-ORDER (PARENT) — Canteen Gan En  ·  halaman link orang tua
   Decision Lock §5: link-only, tanpa akun/dashboard/riwayat.
   Identitas: Nama Murid · Tingkat · Kelas(opsional) · WhatsApp(wajib).
   Layar akhir = Konfirmasi Pesanan ("Pesanan Berhasil Dikirim") + Bukti Pesanan.
   ============================================================ */

const TINGKAT = ["TK A", "TK B", "SD", "SMP", "SMA", "Guru/Karyawan"];
const NO_KELAS = "Guru/Karyawan";
const DEFAULT_PICKUP_FALLBACK = "Istirahat 1";

export interface PreOrderReceipt {
  no: string;
  nama: string;
  tingkat: string;
  kelas: string;
  kelasLabel: string;
  wa: string;
  ambil: string;
  serviceDate: string;
  submittedAt: string;
  items: { name: string; variant: string | null; price: number; qty: number; note: string }[];
  total: number;
}

interface CartLine {
  menu: MenuItem;
  variant: Variant | null;
  qty: number;
  note: string;
}

export default function PreOrderParent({
  kantin,
  serviceDate,
  open,
  menus,
  pickupOptions,
  onSubmit,
}: {
  kantin: string;
  /** Label tampil, cth. "Jumat, 27 Juni 2026" (bukan ISO). */
  serviceDate: string;
  open: boolean;
  menus: MenuItem[];
  pickupOptions: string[];
  onSubmit: (r: PreOrderReceipt) => void;
}) {
  const defaultPickup = pickupOptions[0] || DEFAULT_PICKUP_FALLBACK;
  const [step, setStep] = useState<"landing" | "menu" | "form" | "done">("landing");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [variantFor, setVariantFor] = useState<MenuItem | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [form, setForm] = useState({ nama: "", tingkat: "", kelas: "", wa: "", ambil: defaultPickup });
  const [tried, setTried] = useState(false);
  const [receipt, setReceipt] = useState<PreOrderReceipt | null>(null);

  const kelasNeeded = form.tingkat !== "" && form.tingkat !== NO_KELAS;
  const pre = menus.filter((m) => m.channels.preorder);
  const lines = Object.values(cart);
  const total = lines.reduce((s, l) => s + (l.variant ? l.variant.price : l.menu.price ?? 0) * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  const add = (menu: MenuItem, variant?: Variant) => {
    const key = menu.id + (variant ? ":" + variant.id : "");
    setCart((c) => ({ ...c, [key]: { menu, variant: variant || null, qty: (c[key]?.qty || 0) + 1, note: c[key]?.note || "" } }));
  };
  const dec = (key: string) => setCart((c) => {
    const n = { ...c };
    if (!n[key]) return n;
    if (n[key].qty <= 1) delete n[key]; else n[key] = { ...n[key], qty: n[key].qty - 1 };
    return n;
  });
  const tap = (m: MenuItem) => (m.variants.length ? setVariantFor(m) : add(m));
  const qtyOf = (id: string) => Object.values(cart).filter((l) => l.menu.id === id).reduce((s, l) => s + l.qty, 0);

  const invalid = () => !form.nama.trim() || !form.tingkat || !form.wa.trim() || (kelasNeeded && !form.kelas.trim());

  const submit = () => {
    if (invalid()) { setTried(true); return; }
    const kelasLbl = kelasNeeded ? `${form.tingkat} · ${form.kelas}` : form.tingkat;
    const r: PreOrderReceipt = {
      no: orderNo(), nama: form.nama, tingkat: form.tingkat, kelas: kelasNeeded ? form.kelas : "",
      kelasLabel: kelasLbl, wa: form.wa, ambil: form.ambil, serviceDate, submittedAt: new Date().toLocaleString("id-ID"),
      items: lines.map((l) => ({ name: l.menu.name, variant: l.variant?.name || null, price: l.variant ? l.variant.price : l.menu.price ?? 0, qty: l.qty, note: l.note || "" })),
      total,
    };
    onSubmit(r); setReceipt(r); setStep("done");
  };

  if (step === "landing") {
    return (
      <Screen>
        <div style={{ padding: "40px 24px", textAlign: "center" }}>
          <div style={{ width: 76, height: 76, borderRadius: 22, background: t.primary, color: t.text, display: "grid", placeItems: "center", margin: "0 auto 18px" }}><Store size={38} /></div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{kantin}</div>
          <div className="flex items-center justify-center gap-2" style={{ marginTop: 10, color: t.text2, fontSize: 14.5 }}><Calendar size={16} /> {serviceDate}</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14, padding: "6px 14px", borderRadius: 999, fontWeight: 700, fontSize: 13.5, background: open ? t.successBg : t.errorBg, color: open ? t.successText : t.error }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: open ? t.success : t.error }} /> Pre-order {open ? "Dibuka" : "Ditutup"}
          </div>
          <div style={{ marginTop: 36 }}>
            {open ? (
              <button onClick={() => setStep("menu")} className="flex items-center justify-center gap-2" style={{ width: "100%", height: 58, borderRadius: 16, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 17, cursor: "pointer" }}>
                <ShoppingBag size={22} /> Mulai Memesan
              </button>
            ) : (
              <div style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 14, padding: 18, color: t.text2, fontSize: 14.5 }}>
                Maaf, periode Pre-order untuk tanggal ini sudah ditutup.
              </div>
            )}
          </div>
        </div>
      </Screen>
    );
  }

  if (step === "done" && receipt) {
    return (
      <Screen>
        <div style={{ padding: "32px 20px" }}>
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: t.successBg, color: t.success, display: "grid", placeItems: "center", margin: "0 auto 14px" }}><Check size={40} /></div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Pesanan Berhasil Dikirim</div>
          </div>
          <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: t.amberText, marginBottom: 12 }}>Bukti Pesanan</div>
            <Row k="No. Pesanan" v={receipt.no} />
            <Row k="Nama Murid" v={receipt.nama} />
            <Row k="Tingkat / Kelas" v={receipt.kelasLabel} />
            <Row k="Tanggal Layanan" v={receipt.serviceDate} />
            <Row k="Waktu Ambil" v={receipt.ambil} />
            <div style={{ borderTop: `1px solid ${t.divider}`, margin: "12px 0", paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.text2, marginBottom: 8 }}>Rincian Pesanan</div>
              {receipt.items.map((it, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 14.5 }}>{it.name}{it.variant ? ` (${it.variant})` : ""} ×{it.qty}</span>
                    <span style={{ fontSize: 14.5, fontWeight: 700 }}>{rupiah(it.price * it.qty)}</span>
                  </div>
                  {it.note && <div style={{ fontSize: 12, color: t.text2, fontStyle: "italic" }}>&ldquo;{it.note}&rdquo;</div>}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between" style={{ borderTop: `1px solid ${t.divider}`, paddingTop: 12 }}>
              <span style={{ fontWeight: 700 }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{rupiah(receipt.total)}</span>
            </div>
            <div style={{ fontSize: 11.5, color: t.textDis, marginTop: 10 }}>{receipt.submittedAt}</div>
          </div>
          <div style={{ textAlign: "center", fontSize: 14, color: t.text2, margin: "18px 8px", lineHeight: 1.6 }}>
            Mohon menyiapkan kotak bekal makan Ananda dan meletakkannya di kantin sebelum jam masuk sekolah.
            <div style={{ marginTop: 10, fontWeight: 600, color: t.text }}>🪷 感恩 Gan En 🙏🏻✨</div>
          </div>
          <button onClick={() => { setCart({}); setForm({ nama: "", tingkat: "", kelas: "", wa: "", ambil: defaultPickup }); setTried(false); setStep("landing"); }}
            style={{ width: "100%", height: 54, borderRadius: 14, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 16, cursor: "pointer" }}>
            Selesai
          </button>
        </div>
      </Screen>
    );
  }

  if (step === "form") {
    return (
      <Screen>
        <Top title="Data Pemesan" onBack={() => setStep("menu")} />
        <div style={{ padding: 20 }}>
          <Field label="Nama Murid" req err={tried && !form.nama.trim()}>
            <input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="cth. Aisyah Putri" style={inp(tried && !form.nama.trim())} />
          </Field>

          <Field label="Tingkat" req err={tried && !form.tingkat}>
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              {TINGKAT.map((tg) => {
                const on = tg === form.tingkat;
                return (
                  <button key={tg} onClick={() => setForm({ ...form, tingkat: tg, kelas: tg === NO_KELAS ? "" : form.kelas })}
                    style={{ height: 44, padding: "0 14px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer",
                      border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, color: on ? t.amberText : t.text2 }}>
                    {tg}
                  </button>
                );
              })}
            </div>
          </Field>

          {kelasNeeded && (
            <Field label="Kelas" req err={tried && !form.kelas.trim()}>
              <input value={form.kelas}
                onChange={(e) => setForm({ ...form, kelas: e.target.value })}
                placeholder="cth. 3B"
                style={inp(tried && !form.kelas.trim())} />
            </Field>
          )}

          <Field label="Nomor WhatsApp" req err={tried && !form.wa.trim()}>
            <input value={form.wa} onChange={(e) => setForm({ ...form, wa: e.target.value })} placeholder="08…" inputMode="numeric" style={inp(tried && !form.wa.trim())} />
          </Field>

          <Field label="Waktu Ambil">
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              {pickupOptions.map((p) => {
                const on = p === form.ambil;
                return (
                  <button key={p} onClick={() => setForm({ ...form, ambil: p })} className="flex items-center gap-1"
                    style={{ height: 46, padding: "0 14px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer",
                      border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, color: on ? t.amberText : t.text2 }}>
                    <Clock size={14} /> {p}
                  </button>
                );
              })}
            </div>
          </Field>

          <div style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 14, padding: 14, margin: "8px 0 16px" }}>
            <div className="flex items-center justify-between"><span style={{ color: t.text2, fontSize: 14 }}>{count} item</span><span style={{ fontWeight: 800, fontSize: 18 }}>{rupiah(total)}</span></div>
          </div>
          <button onClick={submit} className="flex items-center justify-center gap-2" style={{ width: "100%", height: 56, borderRadius: 14, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 16, cursor: "pointer" }}>
            <Check size={20} /> Kirim Pesanan
          </button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <Top title="Pilih Menu" subtitle={serviceDate} onBack={() => setStep("landing")} />
      <div style={{ padding: "4px 20px 20px" }}>
        {pre.map((m) => {
          const inCart = qtyOf(m.id);
          return (
            <div key={m.id} style={{ background: t.surface, border: `1.5px solid ${inCart ? t.primary : t.border}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
              <div className="flex items-start justify-between gap-3">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{m.name}</div>
                  <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
                    {m.variants.length > 0 && <Layers size={13} color={t.amberText} />}
                    <span style={{ fontSize: 14, fontWeight: 700, color: t.text2 }}>
                      {m.variants.length ? `${rupiah(Math.min(...m.variants.map((v) => v.price)))}–${rupiah(Math.max(...m.variants.map((v) => v.price)))}` : rupiah(m.price)}
                    </span>
                  </div>
                </div>
                {inCart > 0 && !m.variants.length ? (
                  <Stepper val={inCart} onMinus={() => dec(m.id)} onPlus={() => add(m)} />
                ) : (
                  <button onClick={() => tap(m)} className="flex items-center gap-1" style={{ height: 44, padding: "0 16px", borderRadius: 12, border: "none", background: t.primary, color: t.text, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                    <Plus size={18} /> {m.variants.length ? "Pilih" : "Tambah"}
                  </button>
                )}
              </div>
              {Object.values(cart).filter((l) => l.menu.id === m.id && l.variant).map((l) => (
                <div key={l.variant!.id} className="flex items-center justify-between" style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.divider}` }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{l.variant!.name} · {rupiah(l.variant!.price)}</span>
                  <Stepper val={l.qty} onMinus={() => dec(m.id + ":" + l.variant!.id)} onPlus={() => add(m, l.variant!)} />
                </div>
              ))}
              {inCart > 0 && (
                noteFor === m.id ? (
                  <input autoFocus placeholder="Catatan (cth. tidak pedas)" onBlur={() => setNoteFor(null)}
                    onChange={(e) => setCart((c) => { const n = { ...c }; Object.keys(n).forEach((k) => { if (n[k].menu.id === m.id) n[k] = { ...n[k], note: e.target.value }; }); return n; })}
                    style={{ ...inp(false), marginTop: 10, height: 44, fontSize: 14 }} />
                ) : (
                  <button onClick={() => setNoteFor(m.id)} className="flex items-center gap-1" style={{ marginTop: 10, background: "transparent", border: "none", color: t.amberText, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    <StickyNote size={14} /> {Object.values(cart).find((l) => l.menu.id === m.id)?.note ? "Edit catatan" : "Tambah catatan"}
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>

      {variantFor && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={() => setVariantFor(null)} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
          <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", padding: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>{variantFor.name}</div>
            {variantFor.variants.map((v) => (
              <button key={v.id} onClick={() => { add(variantFor, v); setVariantFor(null); }} className="flex items-center justify-between"
                style={{ width: "100%", height: 56, marginBottom: 10, borderRadius: 14, border: `1.5px solid ${t.border}`, background: t.surface, padding: "0 16px", cursor: "pointer" }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{v.name}</span>
                <span className="flex items-center gap-2" style={{ fontWeight: 700 }}>{rupiah(v.price)} <Plus size={18} color={t.amberText} /></span>
              </button>
            ))}
          </div>
        </div>
      )}

      {count > 0 && !variantFor && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 20px 18px", background: "linear-gradient(transparent," + t.bg + " 22%)" }}>
          <div style={{ maxWidth: 460, margin: "0 auto" }}>
            <button onClick={() => setStep("form")} className="flex items-center justify-between" style={{ width: "100%", height: 58, borderRadius: 16, border: "none", background: t.primary, color: t.text, padding: "0 18px", cursor: "pointer", boxShadow: "0 6px 20px rgba(253,184,51,.4)" }}>
              <span style={{ fontWeight: 700 }}>{count} item · {rupiah(total)}</span>
              <span className="flex items-center gap-1" style={{ fontWeight: 800 }}>Lanjut <ChevronRight size={20} /></span>
            </button>
          </div>
        </div>
      )}
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", paddingBottom: 96, position: "relative" }}>{children}</div>
    </div>
  );
}
function Top({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3" style={{ padding: "18px 20px 10px", position: "sticky", top: 0, background: t.bg, zIndex: 5 }}>
      <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: 11, border: `1px solid ${t.border}`, background: t.surface, cursor: "pointer", display: "grid", placeItems: "center", color: t.text }}><ArrowLeft size={20} /></button>
      <div><div style={{ fontSize: 19, fontWeight: 800 }}>{title}</div>{subtitle && <div style={{ fontSize: 12.5, color: t.text2 }}>{subtitle}</div>}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: "5px 0", fontSize: 14 }}>
      <span style={{ color: t.text2 }}>{k}</span><span style={{ fontWeight: 700, textAlign: "right" }}>{v}</span>
    </div>
  );
}
function Stepper({ val, onMinus, onPlus }: { val: number; onMinus: () => void; onPlus: () => void }) {
  const b: React.CSSProperties = { width: 40, height: 40, borderRadius: 999, border: "none", background: t.primaryLight, color: t.text, cursor: "pointer", display: "grid", placeItems: "center" };
  return (
    <div className="flex items-center gap-2" style={{ background: t.surfaceSoft, border: `1px solid ${t.border}`, borderRadius: 999, padding: 3 }}>
      <button onClick={onMinus} style={b}><Minus size={18} /></button>
      <span style={{ minWidth: 22, textAlign: "center", fontWeight: 800, fontSize: 16 }}>{val}</span>
      <button onClick={onPlus} style={b}><Plus size={18} /></button>
    </div>
  );
}
const inp = (err: boolean): React.CSSProperties => ({ width: "100%", height: 52, fontSize: 16, color: t.text, background: t.surface, border: `1.5px solid ${err ? t.error : t.border}`, borderRadius: 12, padding: "0 14px", outline: "none", fontFamily: "inherit" });
function Field({ label, children, req, err }: { label: string; children: React.ReactNode; req?: boolean; err?: boolean }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{label}{req && <span style={{ color: t.error }}> *</span>}</div>
      {children}{err && <div style={{ fontSize: 12.5, color: t.error, marginTop: 6 }}>Wajib diisi.</div>}
    </div>
  );
}
