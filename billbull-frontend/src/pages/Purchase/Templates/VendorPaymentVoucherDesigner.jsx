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
    trn: "104186093100003"
  },
  voucher: {
    number: "PV-2025-007432",
    date: "13 Jun 2026",
    status: "Posted"
  },
  vendor: {
    name: "ABDULLA ALI AL SHARHAN AND SONS GEN. TRADING EST.",
    code: "CRS-442",
    address: "DEIRA DUBAI, DUBAI, DUBAI, UAE",
    phone: "042267276",
    email: "sales@alsharhannandsons.com",
    trn: "100319008700003"
  },
  session: { ref: "PVS-2025-000188", invoiceCount: "3 invoices · 1 partially settled" },
  account: { currency: "AED – Payables Control", bank: "ENBD Bank · Main account" },
  invoices: [
    { ref: "PINV-2025-005980", lpoRef: "LPO-2025-003641", date: "22 Apr 2025", total: 31200, outstanding: 31200, paid: 31200, balance: 0, status: "Fully paid" },
    { ref: "PINV-2025-006011", lpoRef: "LPO-2025-003680", date: "28 Apr 2025", total: 14750, outstanding: 14750, paid: 14750, balance: 0, status: "Fully paid" },
    { ref: "PINV-2025-006190", lpoRef: "LPO-2025-003798", date: "14 May 2025", total: 22500, outstanding: 22500, paid: 5150, balance: 17350, status: "Partial" }
  ],
  summary: { totalOutstanding: 68450, discount: 0, remaining: 17350, totalPaid: 51100 },
  payment: { method: "Cheque", depositedFrom: "FAB — A/C XXXX-2291", chequeRef: "CHQ-VN-00019284", chequeDate: "12 Jun 2026", clearing: "3 days" },
  note: "Note: PINV-2025-006190 partially paid — remaining AED 17,350.00 outstanding on vendor account.",
  footer: { generated: "13 Jun 2026 7:18 PM", user: "admin@hilitebm.ae" }
};

function fmt(n) {
  return Number(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CurrSym({ size = "0.9em", red }) {
  return (
    <img
      src={UAE_DIRHAM_SYMBOL_IMAGE}
      alt="AED"
      style={{
        height: size,
        width: "auto",
        display: "inline-block",
        verticalAlign: "-0.07em",
        ...(red ? { filter: "invert(18%) sepia(96%) saturate(4967%) hue-rotate(338deg) brightness(88%) contrast(105%)" } : {})
      }}
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
    showVoucherNumber: true,
    showVoucherDate: true,
    showStatusBadge: true,
    showVoucherSession: true,
    showInvoiceCount: true,
    showAccountCurrency: true,
    showBankAccount: true,
    showVendorName: true,
    showVendorCode: true,
    showVendorAddress: true,
    showVendorPhone: true,
    showVendorEmail: false,
    showVendorTRN: true,
    showInvoiceDate: true,
    showInvoiceTotal: true,
    showOutstanding: true,
    showPaidNow: true,
    showBalanceAfter: true,
    showInvoiceStatus: true,
    showLinkedLPO: true,
    showTotalOutstanding: true,
    showDiscountTaken: true,
    showRemainingBalance: true,
    showTotalPaidBold: true,
    showAmountInWords: true,
    showPaymentMethod: true,
    showDepositedFrom: true,
    showChequeRef: true,
    showChequeDate: true,
    showNote: true,
    showCompanyStamp: true,
    stampUrl: "",
    showQRCode: false,
    showGeneratedBy: true,
    showAuthorisedByLine: true
  };
}

function VoucherPreview({ s }) {
  const f = s.fontSize;
  const gold = s.accentColor;

  const thStyle = {
    padding: "5px 8px",
    fontSize: `${f - 0.5}px`,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fafc",
    textAlign: "left",
    whiteSpace: "nowrap"
  };
  const tdStyle = (right = false) => ({
    padding: "6px 8px",
    fontSize: `${f}px`,
    color: "#374151",
    borderBottom: `1px solid ${gold}18`,
    textAlign: right ? "right" : "left",
    verticalAlign: right ? "middle" : "top",
    whiteSpace: right ? "nowrap" : "normal"
  });

  const metaItems = [
    s.showVoucherNumber && ["Voucher No.", MOCK.voucher.number],
    s.showVoucherDate && ["Date", MOCK.voucher.date],
    s.showVoucherSession && ["Payment Session", MOCK.session.ref],
    s.showInvoiceCount && ["Invoices", MOCK.session.invoiceCount],
    s.showAccountCurrency && ["Account", MOCK.account.currency],
    s.showBankAccount && ["Cash / Bank", MOCK.account.bank]
  ].filter(Boolean);

  return (
    <div style={{ fontFamily: s.fontFamily, fontSize: `${f}px`, background: "#fff", color: "#1a1a2e", padding: "28px 32px", position: "relative", minHeight: 1067, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1 }}>

        {/* HEADER: 3 columns — Vendor | Doc Info | Logo + Company */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 16 }}>

          {/* COL 1: Title + Vendor */}
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: `${f + 11}px`, fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px 0", letterSpacing: "-0.3px", whiteSpace: "nowrap" }}>
              Vendor Payment Voucher
            </h1>
            {s.showStatusBadge && (
              <div style={{ marginBottom: 12 }}>
                <span style={{
                  background: `${gold}22`,
                  color: "#92400e",
                  border: `1px solid ${gold}88`,
                  fontSize: `${f - 1}px`,
                  fontWeight: 600,
                  padding: "2px 10px",
                  borderRadius: 12
                }}>
                  {MOCK.voucher.status}
                </span>
              </div>
            )}
            {s.showVendorName && (
              <div>
                <p style={{ fontWeight: 700, fontSize: `${f - 0.5}px`, marginBottom: 4, color: "#888", letterSpacing: 0.5, textTransform: "uppercase" }}>Vendor</p>
                <p style={{ fontWeight: 700, fontSize: `${f + 1}px`, marginBottom: 2 }}>{MOCK.vendor.name}</p>
                {s.showVendorCode && <p style={{ color: "#64748b", fontSize: `${f - 0.5}px`, margin: "1px 0" }}>{MOCK.vendor.code}</p>}
                {s.showVendorAddress && <p style={{ whiteSpace: "pre-line", lineHeight: 1.65, color: "#444", margin: "2px 0 0" }}>{MOCK.vendor.address}</p>}
                {s.showVendorPhone && <p style={{ marginTop: 2, color: "#555" }}>{MOCK.vendor.phone}</p>}
                {s.showVendorEmail && <p style={{ marginTop: 1, color: "#555" }}>{MOCK.vendor.email}</p>}
                {s.showVendorTRN && <p style={{ marginTop: 1, color: "#64748b", fontSize: `${f - 0.5}px` }}>TRN: {MOCK.vendor.trn}</p>}
              </div>
            )}
          </div>

          {/* COL 2: Voucher meta — aligns to bottom of col1 (same as customer receipt) */}
          {metaItems.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", alignSelf: "flex-end", paddingBottom: 2 }}>
              {metaItems.map(([label, val], i) => (
                <div key={i}>
                  <p style={{ margin: 0, fontSize: `${f - 1}px`, color: "#999", fontWeight: 500 }}>{label}</p>
                  <p style={{ margin: "1px 0 0", fontSize: `${f}px`, fontWeight: 700, color: "#1a1a2e" }}>{val}</p>
                </div>
              ))}
            </div>
          )}

          {/* COL 3: Logo + Company */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
            {s.showLogo && (
              s.logoUrl
                ? <img src={s.logoUrl} alt="logo" style={{ height: 72, objectFit: "contain" }} />
                : <div style={{ width: 72, height: 72, borderRadius: "50%", background: `${gold}22`, border: `3px solid ${gold}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 32, fontWeight: 900, color: gold }}>G</span>
                  </div>
            )}
            {s.showCompanyName && (
              <div style={{ textAlign: "right", lineHeight: 1.55 }}>
                <p style={{ fontWeight: 700, fontSize: `${f - 1.5}px`, color: "#1a1a2e", margin: 0, whiteSpace: "nowrap" }}>{MOCK.company.name}</p>
                {s.showCompanyAddress && <p style={{ margin: 0, color: "#555", whiteSpace: "pre-line", fontSize: `${f - 1}px` }}>{MOCK.company.address}</p>}
                {s.showCompanyPhone && <p style={{ margin: 0, fontSize: `${f - 1}px` }}>{MOCK.company.phone}</p>}
                {s.showCompanyEmail && <p style={{ margin: 0, fontSize: `${f - 1}px` }}>{MOCK.company.email}</p>}
                {s.showTRN && <p style={{ margin: 0, color: "#666", fontSize: `${f - 1}px` }}>TRN · {MOCK.company.trn}</p>}
              </div>
            )}
          </div>
        </div>

        {/* INVOICES TABLE LABEL */}
        <div style={{ fontSize: `${f - 0.5}px`, fontWeight: 700, color: "#64748b", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
          Invoices included in this payment
        </div>

        {/* INVOICE TABLE */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={thStyle}>Invoice ref.</th>
              {s.showInvoiceDate && <th style={{ ...thStyle, textAlign: "right" }}>Invoice date</th>}
              {s.showInvoiceTotal && <th style={{ ...thStyle, textAlign: "right" }}>Invoice total</th>}
              {s.showOutstanding && <th style={{ ...thStyle, textAlign: "right" }}>Outstanding</th>}
              {s.showPaidNow && <th style={{ ...thStyle, textAlign: "right", color: "#92400e" }}>Paid now</th>}
              {s.showBalanceAfter && <th style={{ ...thStyle, textAlign: "right" }}>Balance after</th>}
            </tr>
          </thead>
          <tbody>
            {MOCK.invoices.map((inv, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={tdStyle()}>
                  {s.showInvoiceStatus && (
                    <span style={{
                      display: "inline-block",
                      marginBottom: 2,
                      fontSize: `${f - 1.5}px`,
                      fontWeight: 600,
                      color: inv.status === "Fully paid" ? "#059669" : "#d97706",
                      background: inv.status === "Fully paid" ? "#ecfdf5" : "#fffbeb",
                      border: `1px solid ${inv.status === "Fully paid" ? "#6ee7b7" : "#fcd34d"}`,
                      borderRadius: 10,
                      padding: "0 6px"
                    }}>
                      {inv.status}
                    </span>
                  )}
                  <div style={{ fontWeight: 600, color: "#1d4ed8", fontSize: `${f}px` }}>{inv.ref}</div>
                  {s.showLinkedLPO && <div style={{ color: "#94a3b8", fontSize: `${f - 1.5}px`, marginTop: 1 }}>LPO: {inv.lpoRef}</div>}
                </td>
                {s.showInvoiceDate && <td style={{ ...tdStyle(true), color: "#64748b" }}>{inv.date}</td>}
                {s.showInvoiceTotal && <td style={tdStyle(true)}><CurrSym /> {fmt(inv.total)}</td>}
                {s.showOutstanding && <td style={tdStyle(true)}><CurrSym /> {fmt(inv.outstanding)}</td>}
                {s.showPaidNow && <td style={{ ...tdStyle(true), fontWeight: 700, color: "#1a1a2e" }}><CurrSym /> {fmt(inv.paid)}</td>}
                {s.showBalanceAfter && (
                  <td style={tdStyle(true)}>
                    {inv.balance > 0
                      ? <span style={{ fontWeight: 600 }}><CurrSym /> {fmt(inv.balance)}</span>
                      : <span style={{ color: "#94a3b8" }}><CurrSym /> 0.00</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

      </div>

      {/* FOOTER GROUP */}
      <div style={{ marginTop: "auto" }}>

        {/* SUMMARY (right-aligned) */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <table style={{ width: "auto", borderCollapse: "collapse", fontSize: `${f}px` }}>
            <tbody>
              {s.showTotalOutstanding && (
                <tr>
                  <td style={{ padding: "3px 16px 3px 0", color: "#64748b", textAlign: "right", whiteSpace: "nowrap" }}>Total outstanding</td>
                  <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", minWidth: 100 }}><CurrSym /> <span style={{ display: "inline-block", minWidth: 70, textAlign: "right" }}>{fmt(MOCK.summary.totalOutstanding)}</span></td>
                </tr>
              )}
              {s.showDiscountTaken && (
                <tr>
                  <td style={{ padding: "3px 16px 3px 0", color: "#64748b", textAlign: "right", whiteSpace: "nowrap" }}>Discount taken</td>
                  <td style={{ padding: "3px 0", textAlign: "right", color: "#e11d48", whiteSpace: "nowrap", minWidth: 100 }}><CurrSym red /> <span style={{ display: "inline-block", minWidth: 70, textAlign: "right" }}>—{MOCK.summary.discount.toFixed(2)}</span></td>
                </tr>
              )}
              {s.showRemainingBalance && (
                <tr>
                  <td style={{ padding: "3px 16px 3px 0", color: "#64748b", textAlign: "right", whiteSpace: "nowrap" }}>Remaining balance</td>
                  <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", minWidth: 100 }}><CurrSym /> <span style={{ display: "inline-block", minWidth: 70, textAlign: "right" }}>{fmt(MOCK.summary.remaining)}</span></td>
                </tr>
              )}
              {s.showTotalPaidBold && (
                <tr style={{ background: `${gold}18` }}>
                  <td style={{ padding: "6px 16px 6px 0", fontWeight: 700, textAlign: "right", fontSize: `${f + 1}px`, whiteSpace: "nowrap" }}>Total paid now</td>
                  <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 800, fontSize: `${f + 2}px`, color: "#1a1a2e", whiteSpace: "nowrap", minWidth: 100 }}>
                    <CurrSym size="1em" /> <span style={{ display: "inline-block", minWidth: 70, textAlign: "right" }}>{fmt(MOCK.summary.totalPaid)}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* AMOUNT IN WORDS */}
        {s.showAmountInWords && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <div style={{ fontSize: `${f}px`, fontWeight: 600, color: "#1a1a2e", textAlign: "right", background: "#f8fafc", padding: "6px 12px", borderRadius: 4, border: "1px solid #e2e8f0" }}>
              <span style={{ color: "#64748b", marginRight: 4 }}>Amount in words:</span>
              <span style={{ fontWeight: 700, color: "#1a1a2e" }}>Fifty One Thousand One Hundred Dirhams Only</span>
            </div>
          </div>
        )}

        {/* PAYMENT DETAILS */}
        {s.showPaymentMethod && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 32px", marginBottom: 14, fontSize: `${f}px`, borderTop: `1px solid ${gold}30`, paddingTop: 10 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ color: "#94a3b8", minWidth: 90 }}>Payment method</span>
              <span style={{ fontWeight: 600 }}>{MOCK.payment.method}</span>
            </div>
            {s.showChequeRef && (
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ color: "#94a3b8", minWidth: 90 }}>Cheque no. / ref.</span>
                <span style={{ fontWeight: 600 }}>{MOCK.payment.chequeRef}</span>
              </div>
            )}
            {s.showDepositedFrom && (
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ color: "#94a3b8", minWidth: 90 }}>Paid from</span>
                <span style={{ fontWeight: 600 }}>{MOCK.payment.depositedFrom}</span>
              </div>
            )}
            {s.showChequeDate && (
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ color: "#94a3b8", minWidth: 90 }}>Cheque date</span>
                <span style={{ fontWeight: 600 }}>{MOCK.payment.chequeDate} &nbsp;·&nbsp; Clearing: {MOCK.payment.clearing}</span>
              </div>
            )}
          </div>
        )}

        {/* NOTE */}
        {s.showNote && (
          <div style={{ background: `${gold}14`, border: `1px solid ${gold}66`, borderRadius: 4, padding: "7px 12px", fontSize: `${f}px`, color: "#374151", marginBottom: 16 }}>
            {MOCK.note}
          </div>
        )}

        {/* STAMP + QR */}
        {(s.showCompanyStamp || s.showQRCode) && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginBottom: 14 }}>
            {s.showCompanyStamp && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                {s.stampUrl
                  ? <img src={s.stampUrl} alt="stamp" style={{ width: 88, height: 88, objectFit: "contain" }} />
                  : <div style={{ width: 88, height: 88, borderRadius: "50%", border: `2px dashed ${gold}`, background: `${gold}0d`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: `${f - 1}px`, color: "#92400e", fontWeight: 700, textAlign: "center", lineHeight: 1.4 }}>
                        Company<br />Stamp
                      </span>
                    </div>
                }
                <span style={{ fontSize: `${f - 2}px`, color: "#94a3b8" }}>Official Stamp</span>
              </div>
            )}
            {s.showQRCode && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: 52, height: 52, background: "#1a1a2e", borderRadius: 4 }} />
                <span style={{ fontSize: `${f - 2}px`, color: "#94a3b8" }}>Scan to verify</span>
              </div>
            )}
          </div>
        )}

        {/* FOOTER BAR */}
        {(s.showGeneratedBy || s.showAuthorisedByLine) && (
          <div style={{ borderTop: `2px solid ${gold}`, marginTop: 8, paddingTop: 7, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: `${f - 0.5}px`, color: "#64748b" }}>
            <div>
              {s.showGeneratedBy && <span>BillBull ERP · Generated: {MOCK.footer.generated} · User: {MOCK.footer.user}</span>}
            </div>
            {s.showAuthorisedByLine && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>Authorised by:</span>
                <span style={{ borderBottom: "1px solid #94a3b8", display: "inline-block", minWidth: 90 }}>&nbsp;</span>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

function SLabel({ label }) {
  return <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-4 mb-1.5 px-0.5">{label}</div>;
}
function Row({ label, children }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-1.5 pr-1 border-b border-slate-100 last:border-0">
      <span className="min-w-0 text-[11px] text-slate-700 leading-tight">{label}</span>
      <div className="flex shrink-0 items-center justify-end">{children}</div>
    </div>
  );
}
function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!value}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-4 w-8 shrink-0 items-center overflow-hidden rounded-full transition-colors ${value ? "bg-[#F5C742]" : "bg-slate-200"}`}
    >
      <span className={`block h-3 w-3 shrink-0 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}
function ColorPick({ value, onChange }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer">
      <span className="w-5 h-5 rounded border border-slate-200 block" style={{ background: value }} />
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="sr-only" />
      <span className="text-[10px] text-slate-500 font-mono">{value}</span>
    </label>
  );
}
function ImageUpload({ value, onChange, label, shape = "rect" }) {
  const id = React.useId();
  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target?.result);
    reader.readAsDataURL(file);
  }
  return (
    <div className="py-1.5 border-b border-slate-100">
      <p className="text-[10px] text-slate-500 mb-1.5">{label}</p>
      <div className="flex items-center gap-2">
        {value
          ? <div className={`shrink-0 overflow-hidden bg-slate-100 border border-slate-200 ${shape === "circle" ? "rounded-full w-10 h-10" : "rounded w-16 h-10"}`}>
              <img src={value} alt="preview" className="w-full h-full object-contain" />
            </div>
          : <div className={`shrink-0 bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-[9px] text-slate-400 ${shape === "circle" ? "rounded-full w-10 h-10" : "rounded w-16 h-10"}`}>
              {shape === "circle" ? "Stamp" : "Logo"}
            </div>
        }
        <div className="flex flex-col gap-1">
          <label htmlFor={id} className="cursor-pointer text-[10px] text-[#b08a00] font-medium hover:underline">{value ? "Change" : "Upload"} image</label>
          <input id={id} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          {value && <button onClick={() => onChange("")} className="text-[10px] text-slate-400 hover:text-red-500 text-left">Remove</button>}
        </div>
      </div>
    </div>
  );
}

export default function VendorPaymentVoucherDesigner({ templateName, initialSettings, onClose, onSave }) {
  const [s, setS] = useState({
    ...defaultSettings(),
    templateName: templateName ?? "Default Vendor Payment Voucher",
    ...initialSettings
  });
  const [tab, setTab] = useState("style");
  const [zoom, setZoom] = useState(0.6);
  const [saving, setSaving] = useState(false);

  function upd(key, val) {
    setS((prev) => ({ ...prev, [key]: val }));
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(s);
      toast.success("Template saved!");
    } catch {
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const TABS = [
    { id: "style", label: "Style" },
    { id: "header", label: "Header" },
    { id: "table", label: "Invoices" },
    { id: "footer", label: "Footer" }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#F0F0F3]">

      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center justify-between gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-xs transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <span className="text-slate-200">|</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: s.accentColor }} />
            <span className="text-xs font-semibold text-slate-800">{s.templateName}</span>
            <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4">Payment Voucher</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-2 py-1">
            <button onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.05).toFixed(2)))} className="text-slate-400 hover:text-slate-700 text-xs w-4">−</button>
            <span className="text-[10px] text-slate-600 w-9 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(1.2, +(z + 0.05).toFixed(2)))} className="text-slate-400 hover:text-slate-700 text-xs w-4">+</button>
          </div>
          <Button size="sm" variant="outline" className="text-[11px] h-7 gap-1.5 px-3" onClick={() => toast("Print preview ready")}>
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
          <Button
            size="sm"
            className="text-[11px] h-7 gap-1.5 px-3 bg-[#F5C742] text-slate-900 hover:bg-[#e8b830] border-0"
            onClick={handleSave}
            disabled={saving}
          >
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save Template"}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Settings panel */}
        <div className="w-67 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">

          <div className="px-3 py-2 border-b border-slate-100">
            <input
              value={s.templateName}
              onChange={(e) => upd("templateName", e.target.value)}
              className="w-full text-[11px] font-semibold border border-slate-200 rounded-md px-2 py-1.5 bg-slate-50 focus:outline-none focus:border-[#F5C742]"
              placeholder="Template name"
            />
          </div>

          <div className="flex border-b border-slate-200 shrink-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 px-2 py-2 text-[10px] font-medium border-b-2 transition-colors ${tab === t.id ? "border-[#F5C742] text-slate-900 bg-[#FFFBF0]" : "border-transparent text-slate-500 hover:text-slate-700"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-1.5">

            {/* STYLE */}
            {tab === "style" && <>
              <SLabel label="Colors" />
              <Row label="Accent Color"><ColorPick value={s.accentColor} onChange={(v) => upd("accentColor", v)} /></Row>
              <SLabel label="Typography" />
              <Row label="Font Family">
                <select value={s.fontFamily} onChange={(e) => upd("fontFamily", e.target.value)} className="text-[10px] border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none">
                  {[["Inter, sans-serif", "Inter"], ["Arial, sans-serif", "Arial"], ["Helvetica, sans-serif", "Helvetica"], ["Georgia, serif", "Georgia"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Row>
              <Row label="Font Size (px)">
                <input type="number" min={7} max={13} value={s.fontSize} onChange={(e) => upd("fontSize", +e.target.value)} className="w-12 text-[10px] border border-slate-200 rounded px-1.5 py-0.5 text-center focus:outline-none" />
              </Row>
              <SLabel label="Paper" />
              <Row label="Paper Size">
                <select value={s.paperSize} onChange={(e) => upd("paperSize", e.target.value)} className="text-[10px] border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none">
                  <option value="A4">A4</option>
                  <option value="Letter">Letter</option>
                </select>
              </Row>
            </>}

            {/* HEADER */}
            {tab === "header" && <>
              <SLabel label="Company (right column)" />
              <Row label="Logo"><Toggle value={s.showLogo} onChange={(v) => upd("showLogo", v)} /></Row>
              {s.showLogo && <ImageUpload value={s.logoUrl} onChange={(v) => upd("logoUrl", v)} label="Company Logo" shape="rect" />}
              <Row label="Company Name"><Toggle value={s.showCompanyName} onChange={(v) => upd("showCompanyName", v)} /></Row>
              <Row label="Address"><Toggle value={s.showCompanyAddress} onChange={(v) => upd("showCompanyAddress", v)} /></Row>
              <Row label="Phone"><Toggle value={s.showCompanyPhone} onChange={(v) => upd("showCompanyPhone", v)} /></Row>
              <Row label="Email"><Toggle value={s.showCompanyEmail} onChange={(v) => upd("showCompanyEmail", v)} /></Row>
              <Row label="TRN (VAT Number)"><Toggle value={s.showTRN} onChange={(v) => upd("showTRN", v)} /></Row>

              <SLabel label="Voucher Info (middle column)" />
              <Row label="Voucher Number"><Toggle value={s.showVoucherNumber} onChange={(v) => upd("showVoucherNumber", v)} /></Row>
              <Row label="Voucher Date"><Toggle value={s.showVoucherDate} onChange={(v) => upd("showVoucherDate", v)} /></Row>
              <Row label="Status Badge"><Toggle value={s.showStatusBadge} onChange={(v) => upd("showStatusBadge", v)} /></Row>
              <Row label="Payment Session"><Toggle value={s.showVoucherSession} onChange={(v) => upd("showVoucherSession", v)} /></Row>
              <Row label="Invoice Count"><Toggle value={s.showInvoiceCount} onChange={(v) => upd("showInvoiceCount", v)} /></Row>
              <Row label="Account / Currency"><Toggle value={s.showAccountCurrency} onChange={(v) => upd("showAccountCurrency", v)} /></Row>
              <Row label="Bank Account"><Toggle value={s.showBankAccount} onChange={(v) => upd("showBankAccount", v)} /></Row>

              <SLabel label="Vendor (left column)" />
              <Row label="Vendor Name"><Toggle value={s.showVendorName} onChange={(v) => upd("showVendorName", v)} /></Row>
              <Row label="Vendor Code"><Toggle value={s.showVendorCode} onChange={(v) => upd("showVendorCode", v)} /></Row>
              <Row label="Address"><Toggle value={s.showVendorAddress} onChange={(v) => upd("showVendorAddress", v)} /></Row>
              <Row label="Phone"><Toggle value={s.showVendorPhone} onChange={(v) => upd("showVendorPhone", v)} /></Row>
              <Row label="Email"><Toggle value={s.showVendorEmail} onChange={(v) => upd("showVendorEmail", v)} /></Row>
              <Row label="TRN (VAT Number)"><Toggle value={s.showVendorTRN} onChange={(v) => upd("showVendorTRN", v)} /></Row>
            </>}

            {/* INVOICES */}
            {tab === "table" && <>
              <SLabel label="Table Columns" />
              <Row label="Invoice Date"><Toggle value={s.showInvoiceDate} onChange={(v) => upd("showInvoiceDate", v)} /></Row>
              <Row label="Invoice Total"><Toggle value={s.showInvoiceTotal} onChange={(v) => upd("showInvoiceTotal", v)} /></Row>
              <Row label="Outstanding"><Toggle value={s.showOutstanding} onChange={(v) => upd("showOutstanding", v)} /></Row>
              <Row label="Paid Now"><Toggle value={s.showPaidNow} onChange={(v) => upd("showPaidNow", v)} /></Row>
              <Row label="Balance After"><Toggle value={s.showBalanceAfter} onChange={(v) => upd("showBalanceAfter", v)} /></Row>
              <Row label="Status Badge"><Toggle value={s.showInvoiceStatus} onChange={(v) => upd("showInvoiceStatus", v)} /></Row>
              <Row label="Linked LPO"><Toggle value={s.showLinkedLPO} onChange={(v) => upd("showLinkedLPO", v)} /></Row>

              <SLabel label="Summary Block" />
              <Row label="Total Outstanding"><Toggle value={s.showTotalOutstanding} onChange={(v) => upd("showTotalOutstanding", v)} /></Row>
              <Row label="Discount Taken"><Toggle value={s.showDiscountTaken} onChange={(v) => upd("showDiscountTaken", v)} /></Row>
              <Row label="Remaining Balance"><Toggle value={s.showRemainingBalance} onChange={(v) => upd("showRemainingBalance", v)} /></Row>
              <Row label="Total Paid (bold)"><Toggle value={s.showTotalPaidBold} onChange={(v) => upd("showTotalPaidBold", v)} /></Row>
              <Row label="Amount in Words"><Toggle value={s.showAmountInWords} onChange={(v) => upd("showAmountInWords", v)} /></Row>
            </>}

            {/* FOOTER */}
            {tab === "footer" && <>
              <SLabel label="Payment Details" />
              <Row label="Payment Method"><Toggle value={s.showPaymentMethod} onChange={(v) => upd("showPaymentMethod", v)} /></Row>
              <Row label="Paid From Account"><Toggle value={s.showDepositedFrom} onChange={(v) => upd("showDepositedFrom", v)} /></Row>
              <Row label="Cheque No. / Ref"><Toggle value={s.showChequeRef} onChange={(v) => upd("showChequeRef", v)} /></Row>
              <Row label="Cheque Date & Clearing"><Toggle value={s.showChequeDate} onChange={(v) => upd("showChequeDate", v)} /></Row>

              <SLabel label="Note" />
              <Row label="Note Bar"><Toggle value={s.showNote} onChange={(v) => upd("showNote", v)} /></Row>

              <SLabel label="Stamp & Verification" />
              <Row label="Company Stamp"><Toggle value={s.showCompanyStamp} onChange={(v) => upd("showCompanyStamp", v)} /></Row>
              {s.showCompanyStamp && <ImageUpload value={s.stampUrl} onChange={(v) => upd("stampUrl", v)} label="Stamp Image" shape="circle" />}
              <Row label="QR Code (verify)"><Toggle value={s.showQRCode} onChange={(v) => upd("showQRCode", v)} /></Row>

              <SLabel label="Footer Strip" />
              <Row label="Generated By"><Toggle value={s.showGeneratedBy} onChange={(v) => upd("showGeneratedBy", v)} /></Row>
              <Row label="Authorised By Line"><Toggle value={s.showAuthorisedByLine} onChange={(v) => upd("showAuthorisedByLine", v)} /></Row>
            </>}

          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-auto bg-slate-300 p-6">
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-white/70 px-3 py-1.5 rounded-full border border-slate-200">
              <Info className="h-3.5 w-3.5 text-slate-400" />
              Live preview — toggle settings on the left to update instantly
            </div>
            <Badge variant="outline" className="text-[10px] bg-white">{s.paperSize}</Badge>
          </div>

          <div style={{ transformOrigin: "top center", transform: `scale(${zoom})`, width: 794, marginLeft: "auto", marginRight: "auto", marginBottom: `${-(794 * (1 - zoom) * 1.414)}px` }}>
            <div style={{ width: 794, minHeight: 1123, background: "#fff", boxShadow: "0 4px 32px rgba(0,0,0,0.18)" }}>
              <VoucherPreview s={s} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
