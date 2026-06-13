import React, { useState } from "react";
import { ArrowLeft, Save, Printer, Info } from "lucide-react";
import { Badge, Button } from "./PurchaseTemplateUI";
import toast from "react-hot-toast";
import { UAE_DIRHAM_SYMBOL_IMAGE } from "../../../utils/countryCurrencyOptions";

const MOCK = {
  company: {
    name: "HILITE BUILDING MATERIALS TRADING - L.L.C",
    address: "Al Reeman Walk, Al Shamkha, Abu Dhabi, United Arab Emirates",
    phone: "+971 566 098 787",
    email: "hilitebuildingmaterials2024@gmail.com",
    trn: "104186093100003",
    branchName: "BRANCH COMPANY"
  },
  voucher: {
    number: "PV-10007",
    date: "2026-06-13",
    status: "POSTED",
    currency: "AED"
  },
  vendor: {
    name: "ABDULLA ALI AL SHARHAN AND SONS GEN. TRADING EST.",
    code: "ABDULLA ALI",
    address: "DEIRA DUBAI, DUBAI, DUBAI, UAE",
    phone: "042267276",
    email: "sales@alsharhannandsons.com",
    trn: "100319008700003"
  },
  references: [
    { label: "Currency", value: "AED" },
    { label: "Invoice Ref", value: "PINV-1781285228959" },
    { label: "Voucher No", value: "PV-10007" }
  ],
  amount: 500,
  amountWords: "Five Hundred Dirhams Only",
  paymentDetails: [
    { label: "Payment Mode", value: "BANK_TRANSFER" },
    { label: "Bank Account", value: "1010" },
    { label: "Invoice Reference", value: "PINV-1781285228959" },
    { label: "Allocated", value: "500.00" }
  ],
  notes: ""
};

function fmt(n) {
  return Number(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CurrSym({ size = "0.85em" }) {
  return (
    <img
      src={UAE_DIRHAM_SYMBOL_IMAGE}
      alt="AED"
      style={{ height: size, width: "auto", display: "inline-block", verticalAlign: "-0.07em" }}
    />
  );
}

function defaultSettings() {
  return {
    templateName: "Default Vendor Payment Voucher",
    accentColor: "#F5C742",
    fontFamily: "Inter, sans-serif",
    fontSize: 9,
    paperSize: "A4",
    showLogo: true,
    logoUrl: "",
    showCompanyName: true,
    showCompanyAddress: true,
    showCompanyPhone: true,
    showCompanyEmail: true,
    showTRN: true,
    showStatusBadge: true,
    showReceiptNumber: true,
    showReceiptDate: true,
    showCurrencyField: true,
    showCustomerName: true,
    showCustomerCode: true,
    showCustomerAddress: true,
    showCustomerPhone: true,
    showCustomerEmail: false,
    showCustomerTRN: true,
    showAmountInWords: true,
    showPaymentDetails: true,
    showNote: true,
    showCompanyStamp: true,
    stampUrl: "",
    showQRCode: false,
    showGeneratedBy: true,
    showReceivedByLine: true
  };
}

function VoucherPreview({ s }) {
  const f = s.fontSize;
  const gold = s.accentColor;

  const metaItems = [
    s.showReceiptNumber && { label: "Voucher Number", value: MOCK.voucher.number },
    s.showReceiptDate && { label: "Date", value: MOCK.voucher.date },
    s.showCurrencyField && { label: "Currency", value: MOCK.voucher.currency },
    { label: "Voucher No", value: MOCK.voucher.number },
    { label: "Invoice Ref", value: MOCK.references[1].value }
  ].filter(Boolean);

  return (
    <div
      style={{
        fontFamily: s.fontFamily,
        fontSize: `${f}px`,
        background: "#fff",
        color: "#111827",
        padding: "28px 32px",
        minHeight: 1067,
        display: "flex",
        flexDirection: "column"
      }}
    >
      <div style={{ flex: 1 }}>
        {/* HEADER: 3 columns */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: "0 16px",
            alignItems: "flex-start",
            paddingBottom: 14,
            borderBottom: `3px solid ${gold}`,
            marginBottom: 14
          }}
        >
          {/* LEFT: title + vendor */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <div style={{ fontSize: `${f + 11}px`, fontWeight: 700, color: "#111827", letterSpacing: "-0.3px", lineHeight: 1.1, marginBottom: 4 }}>
                Payment Voucher
              </div>
              {s.showStatusBadge && (
                <span style={{
                  display: "inline-block",
                  background: `${gold}33`, color: "#92400e",
                  border: `1px solid ${gold}99`, fontSize: `${f - 1}px`, fontWeight: 600,
                  padding: "2px 10px", borderRadius: 12, marginBottom: 10
                }}>
                  {MOCK.voucher.status}
                </span>
              )}
            </div>
            {s.showCustomerName && (
              <div>
                <div style={{ fontSize: `${f - 1}px`, fontWeight: 600, color: "#9ca3af", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 }}>
                  PAID TO,
                </div>
                <div style={{ fontWeight: 700, fontSize: `${f + 1}px`, color: "#111827", marginBottom: 2 }}>
                  {MOCK.vendor.name}
                </div>
                {s.showCustomerCode && <div style={{ fontSize: `${f}px`, color: "#4b5563" }}>{MOCK.vendor.code}</div>}
                {s.showCustomerAddress && <div style={{ fontSize: `${f}px`, color: "#4b5563", lineHeight: 1.55 }}>{MOCK.vendor.address}</div>}
                {s.showCustomerPhone && <div style={{ fontSize: `${f}px`, color: "#4b5563" }}>{MOCK.vendor.phone}</div>}
                {s.showCustomerEmail && <div style={{ fontSize: `${f}px`, color: "#4b5563" }}>{MOCK.vendor.email}</div>}
                {s.showCustomerTRN && <div style={{ fontSize: `${f}px`, color: "#4b5563" }}>TRN: {MOCK.vendor.trn}</div>}
              </div>
            )}
          </div>

          {/* CENTER: meta grid */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            {metaItems.map(({ label, value }, i) => (
              <div key={i} style={{ textAlign: "right" }}>
                <div style={{ fontSize: `${f - 1}px`, color: "#9ca3af", fontWeight: 500, lineHeight: 1.3 }}>{label}</div>
                <div style={{ fontSize: `${f}px`, fontWeight: 700, color: "#111827" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* RIGHT: logo + company */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
            {s.showLogo && (
              s.logoUrl
                ? <img src={s.logoUrl} alt="logo" style={{ height: 72, objectFit: "contain" }} />
                : <div style={{
                    width: 72, height: 72, borderRadius: "50%",
                    background: `${gold}22`, border: `3px solid ${gold}`,
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    <span style={{ fontSize: 32, fontWeight: 900, color: gold }}>G</span>
                  </div>
            )}
            {s.showCompanyName && (
              <div style={{ textAlign: "right", lineHeight: 1.55 }}>
                <div style={{ fontWeight: 700, fontSize: `${f + 1}px`, color: "#111827" }}>{MOCK.company.name}</div>
                {MOCK.company.branchName && <div style={{ fontSize: `${f - 0.5}px`, color: "#4b5563", fontWeight: 500 }}>{MOCK.company.branchName}</div>}
                {s.showCompanyAddress && <div style={{ fontSize: `${f - 0.5}px`, color: "#4b5563" }}>{MOCK.company.address}</div>}
                {s.showCompanyEmail && <div style={{ fontSize: `${f - 0.5}px`, color: "#4b5563" }}>{MOCK.company.email}</div>}
                {s.showCompanyPhone && <div style={{ fontSize: `${f - 0.5}px`, color: "#4b5563" }}>{MOCK.company.phone}</div>}
                {s.showTRN && <div style={{ fontSize: `${f - 0.5}px`, color: "#4b5563" }}>TRN . {MOCK.company.trn}</div>}
              </div>
            )}
          </div>
        </div>

        {/* Amount Paid highlight */}
        <div style={{
          display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: 12,
          background: `${gold}18`, border: `1px solid ${gold}55`,
          borderRadius: 4, padding: "8px 14px", marginBottom: 10
        }}>
          <span style={{ fontSize: `${f + 1}px`, fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>Amount Paid</span>
          <span style={{ fontSize: `${f + 4}px`, fontWeight: 800, color: "#111827", whiteSpace: "nowrap" }}>
            <CurrSym size={`${f + 2}px`} /> {fmt(MOCK.amount)}
          </span>
        </div>

        {/* Amount in words */}
        {s.showAmountInWords && (
          <div style={{
            display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6,
            fontSize: `${f}px`, background: "#f8fafc", border: "1px solid #e2e8f0",
            borderRadius: 4, padding: "5px 12px", marginBottom: 14
          }}>
            <span style={{ color: "#64748b" }}>Amount in words:</span>
            <span style={{ fontWeight: 700, color: "#111827" }}>{MOCK.amountWords}</span>
          </div>
        )}

        {/* Payment details grid */}
        {s.showPaymentDetails && (
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 32px",
            borderTop: `1px solid ${gold}44`, paddingTop: 10, marginBottom: 14
          }}>
            {MOCK.paymentDetails.map(({ label, value }, i) => (
              <div key={i} style={{ display: "flex", gap: 10, fontSize: `${f}px`, alignItems: "baseline" }}>
                <span style={{ color: "#94a3b8", minWidth: 110, flexShrink: 0 }}>{label}</span>
                <span style={{ fontWeight: 600, color: "#111827" }}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Notes */}
        {s.showNote && MOCK.notes && (
          <div style={{
            background: `${gold}14`, border: `1px solid ${gold}66`, borderRadius: 4,
            padding: "7px 12px", fontSize: `${f}px`, color: "#374151", marginBottom: 14
          }}>
            {MOCK.notes}
          </div>
        )}
      </div>

      {/* FOOTER GROUP */}
      <div>
        {/* Stamp */}
        {s.showCompanyStamp && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginBottom: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {s.stampUrl
                ? <img src={s.stampUrl} alt="Stamp" style={{ width: 88, height: 88, objectFit: "contain" }} />
                : <div style={{
                    width: 88, height: 88, borderRadius: "50%",
                    border: `2px dashed ${gold}`, background: `${gold}0d`,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    fontSize: `${f - 1}px`, color: "#92400e", fontWeight: 700, textAlign: "center", lineHeight: 1.4
                  }}>
                    Company<br />Stamp
                  </div>
              }
              <div style={{ fontSize: `${f - 2}px`, color: "#94a3b8" }}>Official Stamp</div>
            </div>
          </div>
        )}

        {/* Footer bar */}
        {(s.showGeneratedBy || s.showReceivedByLine) && (
          <div style={{
            borderTop: `2px solid ${gold}`, paddingTop: 7,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: `${f - 0.5}px`, color: "#64748b"
          }}>
            <div>{s.showGeneratedBy ? `BillBull ERP · Generated: 13/06/2026 · User: ${MOCK.company.email}` : ""}</div>
            {s.showReceivedByLine && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Received by: <span style={{ borderBottom: "1px solid #94a3b8", display: "inline-block", minWidth: 90 }}>&nbsp;</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const SECTION_STYLE = "mb-6";
const LABEL_STYLE = "text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2";
const TOGGLE_ROW = "flex items-center justify-between py-1.5";
const TOGGLE_LABEL = "text-xs text-slate-700";

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? "bg-[#F5C742]" : "bg-slate-200"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-1"}`} />
    </button>
  );
}

export default function VendorPaymentVoucherDesigner({ templateName, initialSettings, onClose, onSave }) {
  const [s, setS] = useState({ ...defaultSettings(), ...(initialSettings || {}), templateName: templateName || defaultSettings().templateName });
  const [activeTab, setActiveTab] = useState("style");
  const [zoom, setZoom] = useState(0.6);
  const [saving, setSaving] = useState(false);

  const set = (key, val) => setS(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(s);
      toast.success("Template saved");
    } catch {
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const tabs = ["Style", "Header", "Payment", "Footer"];

  return (
    <div className="flex h-screen bg-[#F7F7FA]">
      {/* LEFT: controls */}
      <div className="w-[340px] min-w-[300px] flex flex-col bg-white border-r border-slate-200 shadow-sm">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100 text-slate-500">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="font-bold text-slate-800 text-sm">{s.templateName || "Vendor Payment Voucher"}</div>
              <Badge className="text-[10px]">Payment Voucher</Badge>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} size="sm" className="text-xs px-3 py-1.5">
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving…" : "Save Template"}
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-2">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab.toLowerCase())}
              className={`px-3 py-2.5 text-xs font-medium transition-colors relative ${activeTab === tab.toLowerCase() ? "text-slate-900" : "text-slate-400 hover:text-slate-600"}`}
            >
              {tab}
              {activeTab === tab.toLowerCase() && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#F5C742]" />}
            </button>
          ))}
        </div>

        {/* Panels */}
        <div className="flex-1 overflow-y-auto px-4 py-4">

          {activeTab === "style" && (
            <>
              <div className={SECTION_STYLE}>
                <div className={LABEL_STYLE}>Colors</div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-slate-700">Accent Color</span>
                  <input type="color" value={s.accentColor} onChange={e => set("accentColor", e.target.value)}
                    className="w-8 h-7 rounded border border-slate-200 cursor-pointer" />
                </div>
              </div>
              <div className={SECTION_STYLE}>
                <div className={LABEL_STYLE}>Typography</div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-slate-700">Font Family</span>
                  <select value={s.fontFamily} onChange={e => set("fontFamily", e.target.value)}
                    className="text-xs border border-slate-200 rounded px-2 py-1 bg-white">
                    <option value="Inter, sans-serif">Inter</option>
                    <option value="Arial, sans-serif">Arial</option>
                    <option value="'Times New Roman', serif">Times New Roman</option>
                    <option value="'Courier New', monospace">Courier New</option>
                  </select>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-slate-700">Font Size (px)</span>
                  <input type="number" min="8" max="13" value={s.fontSize} onChange={e => set("fontSize", Number(e.target.value))}
                    className="w-16 text-xs border border-slate-200 rounded px-2 py-1 text-right" />
                </div>
              </div>
              <div className={SECTION_STYLE}>
                <div className={LABEL_STYLE}>Paper</div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-slate-700">Paper Size</span>
                  <select value={s.paperSize} onChange={e => set("paperSize", e.target.value)}
                    className="text-xs border border-slate-200 rounded px-2 py-1 bg-white">
                    <option>A4</option>
                    <option>A5</option>
                    <option>Letter</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {activeTab === "header" && (
            <>
              <div className={SECTION_STYLE}>
                <div className={LABEL_STYLE}>Company (Right Column)</div>
                {[
                  ["showLogo", "Logo"],
                  ["showCompanyName", "Company Name"],
                  ["showCompanyAddress", "Address"],
                  ["showCompanyPhone", "Phone"],
                  ["showCompanyEmail", "Email"],
                  ["showTRN", "TRN (VAT Number)"],
                ].map(([key, label]) => (
                  <div key={key} className={TOGGLE_ROW}>
                    <span className={TOGGLE_LABEL}>{label}</span>
                    <Toggle checked={!!s[key]} onChange={v => set(key, v)} />
                  </div>
                ))}
              </div>
              <div className={SECTION_STYLE}>
                <div className={LABEL_STYLE}>Voucher Info (Center Column)</div>
                {[
                  ["showReceiptNumber", "Voucher Number"],
                  ["showReceiptDate", "Date"],
                  ["showCurrencyField", "Currency"],
                  ["showStatusBadge", "Status Badge"],
                ].map(([key, label]) => (
                  <div key={key} className={TOGGLE_ROW}>
                    <span className={TOGGLE_LABEL}>{label}</span>
                    <Toggle checked={!!s[key]} onChange={v => set(key, v)} />
                  </div>
                ))}
              </div>
              <div className={SECTION_STYLE}>
                <div className={LABEL_STYLE}>Vendor (Left Column)</div>
                {[
                  ["showCustomerName", "Vendor Name"],
                  ["showCustomerCode", "Vendor Code"],
                  ["showCustomerAddress", "Address"],
                  ["showCustomerPhone", "Phone"],
                  ["showCustomerEmail", "Email"],
                  ["showCustomerTRN", "TRN (VAT Number)"],
                ].map(([key, label]) => (
                  <div key={key} className={TOGGLE_ROW}>
                    <span className={TOGGLE_LABEL}>{label}</span>
                    <Toggle checked={!!s[key]} onChange={v => set(key, v)} />
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "payment" && (
            <>
              <div className={SECTION_STYLE}>
                <div className={LABEL_STYLE}>Amount</div>
                {[
                  ["showAmountInWords", "Amount in Words"],
                ].map(([key, label]) => (
                  <div key={key} className={TOGGLE_ROW}>
                    <span className={TOGGLE_LABEL}>{label}</span>
                    <Toggle checked={!!s[key]} onChange={v => set(key, v)} />
                  </div>
                ))}
              </div>
              <div className={SECTION_STYLE}>
                <div className={LABEL_STYLE}>Payment Details</div>
                {[
                  ["showPaymentDetails", "Payment Details Grid"],
                  ["showNote", "Note Bar"],
                ].map(([key, label]) => (
                  <div key={key} className={TOGGLE_ROW}>
                    <span className={TOGGLE_LABEL}>{label}</span>
                    <Toggle checked={!!s[key]} onChange={v => set(key, v)} />
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "footer" && (
            <>
              <div className={SECTION_STYLE}>
                <div className={LABEL_STYLE}>Stamp & Verification</div>
                {[
                  ["showCompanyStamp", "Company Stamp"],
                  ["showQRCode", "QR Code (verify)"],
                ].map(([key, label]) => (
                  <div key={key} className={TOGGLE_ROW}>
                    <span className={TOGGLE_LABEL}>{label}</span>
                    <Toggle checked={!!s[key]} onChange={v => set(key, v)} />
                  </div>
                ))}
              </div>
              <div className={SECTION_STYLE}>
                <div className={LABEL_STYLE}>Footer Strip</div>
                {[
                  ["showGeneratedBy", "Generated By"],
                  ["showReceivedByLine", "Received By Line"],
                ].map(([key, label]) => (
                  <div key={key} className={TOGGLE_ROW}>
                    <span className={TOGGLE_LABEL}>{label}</span>
                    <Toggle checked={!!s[key]} onChange={v => set(key, v)} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* RIGHT: preview */}
      <div className="flex-1 overflow-auto bg-[#F0F2F5] flex flex-col">
        {/* Preview toolbar */}
        <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Info className="w-4 h-4 text-blue-400" />
            Live preview — toggle settings on the left to update instantly
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100">−</button>
              <span className="text-xs text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(1.2, z + 0.1))} className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100">+</button>
            </div>
            <span className="text-xs font-medium text-slate-400 border border-slate-200 rounded px-2 py-0.5">A4</span>
          </div>
        </div>

        {/* A4 canvas */}
        <div className="flex-1 overflow-auto p-8 flex justify-center">
          <div
            style={{
              transformOrigin: "top center",
              transform: `scale(${zoom})`,
              width: 794,
              marginLeft: "auto",
              marginRight: "auto",
              marginBottom: `${-(794 * (1 - zoom) * 1.414)}px`
            }}
          >
            <div style={{ width: 794, minHeight: 1123, background: "#fff", boxShadow: "0 4px 32px rgba(0,0,0,0.18)" }}>
              <VoucherPreview s={s} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
