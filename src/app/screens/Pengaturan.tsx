import { useEffect, useMemo, useRef, useState } from "react";
import {
  Store, Printer, MessageCircle, Database, Info, X, Check, Download, Plus, Trash2, Pencil,
  Search, ArrowLeft, ChevronRight, Clock, GraduationCap,
} from "lucide-react";
import { t } from "../../lib/theme";
import { uid } from "../../lib/format";
import { TINGKAT_LIST, NO_KELAS_TINGKAT } from "../../lib/constants";
import type { CanteenSettings, Kelas, Transaction, TransactionCustomer } from "../../types";

/* ============================================================
   PENGATURAN — Canteen Gan En  (dibuka dari ikon gear di header)
   HANYA config jarang berubah — Nama Kantin, Printer, WhatsApp,
   Daftar Kelas (per Tingkat), Edit Pesanan, Backup, Tentang.
   ============================================================ */

const KELAS_TINGKAT = TINGKAT_LIST.filter((tg) => tg !== NO_KELAS_TINGKAT);
const MIN_WA = 10;

export default function Pengaturan({
  settings,
  onChange,
  kelasList,
  onAddKelas,
  onPatchKelas,
  onRemoveKelas,
  onClose,
  transactions,
  pickupPresets,
  onSetPickupPresets,
  onEditCustomer,
}: {
  settings: CanteenSettings;
  onChange: (patch: Partial<CanteenSettings>) => void;
  kelasList: Kelas[];
  onAddKelas: (k: Kelas) => void;
  onPatchKelas: (id: string, fields: Partial<Kelas>) => void;
  onRemoveKelas: (id: string) => void;
  onClose: () => void;
  transactions: Transaction[];
  pickupPresets: string[];
  onSetPickupPresets: (presets: string[]) => void;
  onEditCustomer: (id: string, customer: TransactionCustomer, waktuAmbil?: string) => void;
}) {
  const [toast, setToast] = useState<string | null>(null);

  // --- Daftar Kelas state ---
  const [tingkatFilter, setTingkatFilter] = useState(KELAS_TINGKAT[0]);
  const [newNama, setNewNama] = useState("");
  const [editingKelasId, setEditingKelasId] = useState<string | null>(null);
  const [editKelasNama, setEditKelasNama] = useState("");

  // --- Waktu Ambil state ---
  const [waktuAmbilOpen, setWaktuAmbilOpen] = useState(false);
  const [daftarKelasOpen, setDaftarKelasOpen] = useState(false);
  const [newPreset, setNewPreset] = useState("");
  const [editingPresetIdx, setEditingPresetIdx] = useState<number | null>(null);
  const [editPresetVal, setEditPresetVal] = useState("");

  const addPreset = () => {
    const val = newPreset.trim();
    if (!val) return;
    if (pickupPresets.some((p) => p.toLowerCase() === val.toLowerCase())) { setToast("Waktu ambil sudah ada."); return; }
    onSetPickupPresets([...pickupPresets, val]);
    setNewPreset("");
  };
  const removePreset = (idx: number) => {
    if (pickupPresets.length <= 1) { setToast("Minimal 1 waktu ambil harus ada."); return; }
    onSetPickupPresets(pickupPresets.filter((_, i) => i !== idx));
  };
  const startPresetEdit = (idx: number) => { setEditingPresetIdx(idx); setEditPresetVal(pickupPresets[idx]); };
  const savePresetEdit = () => {
    const val = editPresetVal.trim();
    if (!val || editingPresetIdx === null) { setEditingPresetIdx(null); return; }
    if (pickupPresets.some((p, i) => i !== editingPresetIdx && p.toLowerCase() === val.toLowerCase())) {
      setToast("Waktu ambil sudah ada."); return;
    }
    const next = [...pickupPresets];
    next[editingPresetIdx] = val;
    onSetPickupPresets(next);
    setEditingPresetIdx(null);
  };

  // --- Edit Pesanan state ---
  const [editPesananOpen, setEditPesananOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [eNama, setENama] = useState("");
  const [eTingkat, setETingkat] = useState("");
  const [eKelas, setEKelas] = useState("");
  const [eWa, setEWa] = useState("");
  const [eAmbil, setEAmbil] = useState("");
  const [eTried, setETried] = useState(false);
  const [showKelasSheet, setShowKelasSheet] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (editPesananOpen && !editingTx) searchRef.current?.focus();
  }, [editPesananOpen, editingTx]);

  // Daftar Kelas helpers
  const kelasForTingkat = kelasList.filter((k) => k.tingkat === tingkatFilter);
  const addKelas = () => {
    const nama = newNama.trim();
    if (!nama) return;
    onAddKelas({ id: uid(), tingkat: tingkatFilter, nama });
    setNewNama("");
  };
  const startKelasEdit = (k: Kelas) => { setEditingKelasId(k.id); setEditKelasNama(k.nama); };
  const saveKelasEdit = () => {
    if (editingKelasId && editKelasNama.trim()) onPatchKelas(editingKelasId, { nama: editKelasNama.trim() });
    setEditingKelasId(null);
  };

  // Edit Pesanan search
  const searchResults = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return [];
    return [...transactions]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter((tx) => {
        const nama = tx.customer.nama.toLowerCase();
        const wa = (tx.customer.wa || "").toLowerCase();
        return nama.includes(q) || wa.includes(q);
      });
  }, [transactions, searchQ]);

  // Edit Pesanan form
  const eWaDigits = eWa.replace(/\D/g, "");
  const eKelasNeeded = eTingkat !== "" && eTingkat !== NO_KELAS_TINGKAT;
  const eKelasOptions = kelasList.filter((k) => k.tingkat === eTingkat);
  const needsAmbil = editingTx?.source === "preorder";
  const eInvalid =
    eNama.trim().length < 2 ||
    !eTingkat ||
    (eKelasNeeded && !eKelas) ||
    eWaDigits.length < MIN_WA ||
    (needsAmbil && !eAmbil);

  const openEditTx = (tx: Transaction) => {
    setEditingTx(tx);
    setENama(tx.customer.nama);
    setETingkat(tx.customer.tingkat || "");
    setEKelas(tx.customer.kelas || "");
    setEWa(tx.customer.wa || "");
    setEAmbil(tx.waktuAmbil || "");
    setETried(false);
    setShowKelasSheet(false);
  };

  const saveEdit = () => {
    if (eInvalid) { setETried(true); return; }
    const customer: TransactionCustomer = {
      nama: eNama.trim(),
      tingkat: eTingkat,
      kelas: eKelasNeeded ? eKelas : "",
      wa: eWaDigits,
    };
    onEditCustomer(editingTx!.id, customer, needsAmbil ? eAmbil : undefined);
    setToast(`Pesanan ${eNama.trim()} berhasil diperbarui.`);
    setEditingTx(null);
  };

  /* ===== VIEW: Edit Form ===== */
  if (editPesananOpen && editingTx) {
    return (
      <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
        <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 60px" }}>
          <div className="flex items-center gap-3" style={{ padding: "20px 20px 16px" }}>
            <button onClick={() => setEditingTx(null)}
              style={{ width: 40, height: 40, borderRadius: 11, border: `1px solid ${t.border}`, background: t.surface, cursor: "pointer", display: "grid", placeItems: "center", color: t.text, flex: "none" }}>
              <ArrowLeft size={20} />
            </button>
            <div>
              <div style={{ fontSize: 19, fontWeight: 800 }}>Edit Pesanan</div>
              <div style={{ fontSize: 12.5, color: t.text2 }}>
                {editingTx.orderNo || editingTx.id.slice(0, 8).toUpperCase()}
              </div>
            </div>
          </div>

          <div style={{ padding: "0 20px" }}>
            {/* Nama */}
            <EField label="Nama" req err={eTried && eNama.trim().length < 2}>
              <input value={eNama} onChange={(e) => setENama(e.target.value)}
                placeholder="Nama lengkap" style={eInp(eTried && eNama.trim().length < 2)} />
            </EField>

            {/* Tingkat */}
            <EField label="Tingkat" req err={eTried && !eTingkat}>
              <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                {TINGKAT_LIST.map((tg) => {
                  const on = tg === eTingkat;
                  return (
                    <button key={tg} onClick={() => { setETingkat(tg); setEKelas(""); }}
                      style={{ height: 44, padding: "0 14px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer",
                        border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, color: on ? t.amberText : t.text2 }}>
                      {tg}
                    </button>
                  );
                })}
              </div>
            </EField>

            {/* Kelas */}
            {eKelasNeeded && (
              <EField label="Kelas" req err={eTried && !eKelas}>
                <button onClick={() => setShowKelasSheet(true)}
                  className="flex items-center justify-between"
                  style={{ ...eInp(eTried && !eKelas), cursor: "pointer", textAlign: "left" }}>
                  <span style={{ color: eKelas ? t.text : t.textDis }}>{eKelas || "Pilih kelas…"}</span>
                  <ChevronRight size={18} color={t.text2} />
                </button>
              </EField>
            )}

            {/* WhatsApp */}
            <EField label="Nomor WhatsApp" req err={eTried && eWaDigits.length < MIN_WA}>
              <input value={eWa} onChange={(e) => setEWa(e.target.value.replace(/\D/g, ""))}
                placeholder="08…" inputMode="numeric"
                style={eInp(eTried && eWaDigits.length < MIN_WA)} />
            </EField>

            {/* Waktu Ambil — hanya Pre-order */}
            {needsAmbil && (
              <EField label="Waktu Ambil" req err={eTried && !eAmbil}>
                <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                  {pickupPresets.map((p) => {
                    const on = p === eAmbil;
                    return (
                      <button key={p} onClick={() => setEAmbil(p)}
                        className="flex items-center gap-1"
                        style={{ height: 46, padding: "0 14px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer",
                          border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, color: on ? t.amberText : t.text2 }}>
                        <Clock size={14} /> {p}
                      </button>
                    );
                  })}
                </div>
              </EField>
            )}

            <button onClick={saveEdit}
              style={{ width: "100%", height: 54, borderRadius: 14, border: "none", background: t.primary, color: t.text, fontWeight: 800, fontSize: 16, cursor: "pointer", marginTop: 8 }}>
              Simpan Perubahan
            </button>
          </div>
        </div>

        {/* Kelas bottom sheet */}
        {showKelasSheet && (
          <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div onClick={() => setShowKelasSheet(false)} style={{ position: "absolute", inset: 0, background: "rgba(47,42,36,.35)" }} />
            <div style={{ position: "relative", background: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 460, width: "100%", margin: "0 auto", maxHeight: "70vh", overflowY: "auto", padding: 20 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Pilih Kelas · {eTingkat}</div>
                <button onClick={() => setShowKelasSheet(false)}
                  style={{ border: "none", background: t.surfaceSoft, cursor: "pointer", color: t.text2, width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center" }}>
                  ×
                </button>
              </div>
              {eKelasOptions.length === 0 ? (
                <div style={{ color: t.text2, fontSize: 14, padding: "8px 0" }}>Belum ada kelas untuk {eTingkat}.</div>
              ) : eKelasOptions.map((k) => {
                const on = k.nama === eKelas;
                return (
                  <button key={k.id} onClick={() => { setEKelas(k.nama); setShowKelasSheet(false); }}
                    className="flex items-center justify-between"
                    style={{ width: "100%", height: 52, marginBottom: 8, borderRadius: 12, border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, padding: "0 16px", cursor: "pointer" }}>
                    <span style={{ fontSize: 15.5, fontWeight: 700, color: on ? t.amberText : t.text }}>{k.nama}</span>
                    {on && <Check size={18} color={t.amberText} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {toast && <Toast msg={toast} />}
      </div>
    );
  }

  /* ===== VIEW: Waktu Ambil ===== */
  if (waktuAmbilOpen) {
    return (
      <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
        <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 60px" }}>
          <div className="flex items-center gap-3" style={{ padding: "20px 20px 16px" }}>
            <button onClick={() => { setWaktuAmbilOpen(false); setEditingPresetIdx(null); setNewPreset(""); }}
              style={{ width: 40, height: 40, borderRadius: 11, border: `1px solid ${t.border}`, background: t.surface, cursor: "pointer", display: "grid", placeItems: "center", color: t.text, flex: "none" }}>
              <ArrowLeft size={20} />
            </button>
            <div style={{ fontSize: 19, fontWeight: 800 }}>Waktu Ambil</div>
          </div>

          <div style={{ padding: "0 20px" }}>
            <div style={{ fontSize: 13, color: t.text2, marginBottom: 16 }}>
              Dipakai sebagai pilihan Waktu Ambil saat ortu pesan. Perubahan berlaku langsung.
            </div>

            {pickupPresets.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                {editingPresetIdx === idx ? (
                  <>
                    <input value={editPresetVal} onChange={(e) => setEditPresetVal(e.target.value)} autoFocus
                      onKeyDown={(e) => e.key === "Enter" && savePresetEdit()}
                      style={{ ...inp, flex: 1, height: 48 }} />
                    <button onClick={savePresetEdit} style={iconBtn(t.successBg, t.successText)}>
                      <Check size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2" style={{ flex: 1, height: 48, borderRadius: 10, border: `1.5px solid ${t.border}`, background: t.surfaceSoft, padding: "0 14px" }}>
                      <Clock size={15} color={t.amberText} />
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{p}</span>
                    </div>
                    <button onClick={() => startPresetEdit(idx)} style={iconBtn(t.surface, t.text)}><Pencil size={15} /></button>
                    <button onClick={() => removePreset(idx)} style={iconBtn(t.errorBg, t.error)}
                      title={pickupPresets.length <= 1 ? "Minimal 1 waktu ambil" : "Hapus"}>
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            ))}

            <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
              <input value={newPreset} onChange={(e) => setNewPreset(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPreset()}
                placeholder="Tambah waktu ambil baru…"
                style={{ ...inp, flex: 1, height: 48 }} />
              <button onClick={addPreset} style={iconBtn(t.primary, t.text)}><Plus size={17} /></button>
            </div>
          </div>
        </div>
        {toast && <Toast msg={toast} />}
      </div>
    );
  }

  /* ===== VIEW: Cari Pesanan ===== */
  if (editPesananOpen) {
    return (
      <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
        <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 60px" }}>
          {/* Sticky header */}
          <div style={{ padding: "20px 20px 12px", position: "sticky", top: 0, background: t.bg, zIndex: 5 }}>
            <div className="flex items-center gap-3" style={{ marginBottom: 14 }}>
              <button onClick={() => setEditPesananOpen(false)}
                style={{ width: 40, height: 40, borderRadius: 11, border: `1px solid ${t.border}`, background: t.surface, cursor: "pointer", display: "grid", placeItems: "center", color: t.text, flex: "none" }}>
                <ArrowLeft size={20} />
              </button>
              <div style={{ fontSize: 19, fontWeight: 800 }}>Edit Pesanan</div>
            </div>
            <div className="flex items-center gap-2"
              style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 14, padding: "0 14px", height: 48 }}>
              <Search size={18} color={t.text2} />
              <input ref={searchRef} value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Cari nama atau nomor WA…"
                style={{ border: "none", outline: "none", background: "transparent", fontSize: 15.5, width: "100%", color: t.text, fontFamily: "inherit" }} />
              {searchQ && (
                <X size={17} color={t.text2} style={{ cursor: "pointer" }} onClick={() => setSearchQ("")} />
              )}
            </div>
          </div>

          <div style={{ padding: "0 20px" }}>
            {!searchQ.trim() && (
              <div style={{ textAlign: "center", color: t.text2, fontSize: 14.5, padding: "48px 10px" }}>
                Ketik nama murid atau nomor WA untuk mencari pesanan.
              </div>
            )}
            {searchQ.trim() && searchResults.length === 0 && (
              <div style={{ textAlign: "center", color: t.text2, fontSize: 14.5, padding: "48px 10px" }}>
                Tidak ada pesanan yang cocok.
              </div>
            )}
            {searchResults.map((tx) => {
              const isCancelled = !!tx.cancelledAt;
              const statusLabel = isCancelled ? "Dibatalkan" : tx.paid ? "Lunas" : "Belum Dibayar";
              const statusColor = isCancelled ? t.text2 : tx.paid ? t.successText : t.amberText;
              const statusBg = isCancelled ? t.surfaceSoft : tx.paid ? t.successBg : t.primaryLight;
              const kelasParts = [tx.customer.tingkat, tx.customer.kelas].filter(Boolean).join(" · ");
              return (
                <button key={tx.id} onClick={() => openEditTx(tx)}
                  style={{ width: "100%", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 10, cursor: "pointer", textAlign: "left" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div style={{ fontSize: 16, fontWeight: 700, color: t.text }}>{tx.customer.nama}</div>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: statusBg, color: statusColor, whiteSpace: "nowrap", flex: "none" }}>
                      {statusLabel}
                    </span>
                  </div>
                  {kelasParts && (
                    <div style={{ fontSize: 13.5, color: t.text2, marginTop: 4 }}>
                      {kelasParts}
                      {tx.customer.wa && <span> · {tx.customer.wa}</span>}
                    </div>
                  )}
                  <div style={{ fontSize: 12.5, color: t.textDis, marginTop: 3 }}>
                    {tx.source === "preorder" ? "Pre-order" : "Penjualan"} · {tx.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        {toast && <Toast msg={toast} />}
      </div>
    );
  }

  /* ===== VIEW: Daftar Kelas ===== */
  if (daftarKelasOpen) {
    return (
      <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
        <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 60px" }}>
          <div className="flex items-center gap-3" style={{ padding: "20px 20px 16px" }}>
            <button onClick={() => { setDaftarKelasOpen(false); setEditingKelasId(null); setNewNama(""); }}
              style={{ width: 40, height: 40, borderRadius: 11, border: `1px solid ${t.border}`, background: t.surface, cursor: "pointer", display: "grid", placeItems: "center", color: t.text, flex: "none" }}>
              <ArrowLeft size={20} />
            </button>
            <div style={{ fontSize: 19, fontWeight: 800 }}>Daftar Kelas</div>
          </div>

          <div style={{ padding: "0 20px" }}>
            <div style={{ fontSize: 13, color: t.text2, marginBottom: 16 }}>
              Dipakai sebagai pilihan Kelas di form orang tua — orang tua tidak bisa mengetik sendiri.
            </div>

            <div className="flex gap-2" style={{ overflowX: "auto", paddingBottom: 4, marginBottom: 12 }}>
              {KELAS_TINGKAT.map((tg) => {
                const on = tg === tingkatFilter;
                return (
                  <button key={tg} onClick={() => setTingkatFilter(tg)}
                    style={{ flex: "none", height: 36, padding: "0 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
                      border: `1.5px solid ${on ? t.primary : t.border}`, background: on ? t.primaryLight : t.surface, color: on ? t.amberText : t.text2 }}>
                    {tg}
                  </button>
                );
              })}
            </div>

            {kelasForTingkat.length === 0 && (
              <div style={{ fontSize: 13, color: t.textDis, padding: "8px 0" }}>Belum ada kelas untuk {tingkatFilter}.</div>
            )}
            {kelasForTingkat.map((k) => (
              <div key={k.id} className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                {editingKelasId === k.id ? (
                  <>
                    <input value={editKelasNama} onChange={(e) => setEditKelasNama(e.target.value)} autoFocus
                      onKeyDown={(e) => e.key === "Enter" && saveKelasEdit()}
                      style={{ ...inp, flex: 1, height: 48 }} />
                    <button onClick={saveKelasEdit} style={iconBtn(t.successBg, t.successText)}>
                      <Check size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center" style={{ flex: 1, height: 48, borderRadius: 10, border: `1.5px solid ${t.border}`, background: t.surfaceSoft, padding: "0 12px", fontSize: 14.5, fontWeight: 600 }}>
                      {k.nama}
                    </div>
                    <button onClick={() => startKelasEdit(k)} style={iconBtn(t.surface, t.text)}><Pencil size={15} /></button>
                    <button onClick={() => onRemoveKelas(k.id)} style={iconBtn(t.errorBg, t.error)}><Trash2 size={15} /></button>
                  </>
                )}
              </div>
            ))}

            <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
              <input value={newNama} onChange={(e) => setNewNama(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addKelas()}
                placeholder={`Kelas baru untuk ${tingkatFilter}…`}
                style={{ ...inp, flex: 1, height: 48 }} />
              <button onClick={addKelas} style={iconBtn(t.primary, t.text)}><Plus size={17} /></button>
            </div>
          </div>
        </div>
        {toast && <Toast msg={toast} />}
      </div>
    );
  }

  /* ===== VIEW: Main Pengaturan ===== */
  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100%" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 0 60px" }}>

        <div className="flex items-center justify-between" style={{ padding: "20px 20px 14px" }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>Pengaturan</div>
          <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: t.surface, color: t.text2, cursor: "pointer", display: "grid", placeItems: "center" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: "0 20px" }}>
          {/* Identitas */}
          <Group label="Kantin">
            <FieldRow icon={<Store size={20} />} label="Nama Kantin">
              <input value={settings.namaKantin} onChange={(e) => onChange({ namaKantin: e.target.value })} style={inp} />
            </FieldRow>
            <FieldRow icon={<MessageCircle size={20} />} label="Nomor WhatsApp">
              <input value={settings.whatsapp} onChange={(e) => onChange({ whatsapp: e.target.value.replace(/\D/g, "") })} placeholder="08…" inputMode="numeric" style={inp} />
            </FieldRow>
          </Group>

          {/* Pesanan — Edit Pesanan + Daftar Kelas */}
          <Group label="Pesanan">
            <button
              onClick={() => { setEditPesananOpen(true); setSearchQ(""); setEditingTx(null); }}
              className="flex items-center gap-3" style={rowBtn}>
              <span style={ic}><Pencil size={20} /></span>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Edit Pesanan</div>
                <div style={{ fontSize: 12.5, color: t.text2, marginTop: 2 }}>Koreksi nama, kelas, atau nomor WA</div>
              </div>
              <ChevronRight size={18} color={t.textDis} />
            </button>

            <button
              onClick={() => { setWaktuAmbilOpen(true); setEditingPresetIdx(null); setNewPreset(""); }}
              className="flex items-center gap-3" style={rowBtn}>
              <span style={ic}><Clock size={20} /></span>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Waktu Ambil</div>
                <div style={{ fontSize: 12.5, color: t.text2, marginTop: 2 }}>{pickupPresets.length} waktu · {pickupPresets.join(", ")}</div>
              </div>
              <ChevronRight size={18} color={t.textDis} />
            </button>

            <button
              onClick={() => setDaftarKelasOpen(true)}
              className="flex items-center gap-3" style={rowBtn}>
              <span style={ic}><GraduationCap size={20} /></span>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Daftar Kelas</div>
                <div style={{ fontSize: 12.5, color: t.text2, marginTop: 2 }}>{kelasList.length} kelas · {KELAS_TINGKAT.join(", ")}</div>
              </div>
              <ChevronRight size={18} color={t.textDis} />
            </button>
          </Group>

          {/* Printer */}
          <Group label="Perangkat">
            <div className="flex items-center gap-3" style={{ padding: "14px 16px" }}>
              <span style={ic}><Printer size={20} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Printer</div>
                <div style={{ fontSize: 12.5, color: t.text2, marginTop: 2 }}>{settings.printerConnected ? "Terhubung" : "Belum terhubung"}</div>
              </div>
              <button
                onClick={() => { onChange({ printerConnected: !settings.printerConnected }); setToast(settings.printerConnected ? "Printer diputus" : "Printer terhubung"); }}
                className="flex items-center gap-1"
                style={{ height: 40, padding: "0 14px", borderRadius: 10, border: `1.5px solid ${settings.printerConnected ? "#D8E6D4" : t.border}`, background: settings.printerConnected ? t.successBg : t.surface, color: settings.printerConnected ? t.successText : t.text, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
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

      {toast && <Toast msg={toast} />}
    </div>
  );
}

/* ---- styles ---- */
const ic: React.CSSProperties = {
  width: 42, height: 42, borderRadius: 11, background: t.primaryLight, color: t.amberText,
  display: "grid", placeItems: "center", flex: "none",
};
const inp: React.CSSProperties = {
  width: "100%", height: 46, fontSize: 16, color: t.text, background: t.surface,
  border: `1.5px solid ${t.border}`, borderRadius: 10, padding: "0 12px", outline: "none", fontFamily: "inherit",
};
const eInp = (err: boolean): React.CSSProperties => ({
  width: "100%", height: 52, fontSize: 16, color: t.text, background: t.surface,
  border: `1.5px solid ${err ? t.error : t.border}`, borderRadius: 12, padding: "0 14px", outline: "none", fontFamily: "inherit",
  display: "flex", alignItems: "center",
});
const rowBtn: React.CSSProperties = {
  width: "100%", padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", color: t.text,
};
const iconBtn = (bg: string, color: string): React.CSSProperties => ({
  width: 42, height: 42, borderRadius: 10, border: "none", background: bg, color,
  cursor: "pointer", display: "grid", placeItems: "center", flex: "none",
});

/* ---- sub-components ---- */
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

function EField({ label, children, req, err }: { label: string; children: React.ReactNode; req?: boolean; err?: boolean }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
        {label}{req && <span style={{ color: t.error }}> *</span>}
      </div>
      {children}
      {err && <div style={{ fontSize: 12.5, color: t.error, marginTop: 6 }}>Wajib diisi.</div>}
    </div>
  );
}

function Toast({ msg }: { msg: string }) {
  return (
    <div style={{ position: "fixed", left: 20, right: 20, bottom: 24, display: "flex", justifyContent: "center", zIndex: 90 }}>
      <div className="flex items-center gap-2" style={{ maxWidth: 380, width: "100%", background: t.text, color: "#FBF7EF", borderRadius: 14, padding: "14px 18px", fontSize: 14.5, fontWeight: 600 }}>
        <Check size={18} color={t.success} /> {msg}
      </div>
    </div>
  );
}
