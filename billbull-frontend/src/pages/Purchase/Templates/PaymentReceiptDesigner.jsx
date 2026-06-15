import React, { useState } from "react";
import { ArrowLeft, Save, Printer, Info } from "lucide-react";
import { Badge, Button } from "./PurchaseTemplateUI";
import toast from "react-hot-toast";
import { UAE_DIRHAM_SYMBOL_IMAGE } from "../../../utils/countryCurrencyOptions";
const MOCK = {
  company: {
    name: "GEEBU Enterprise Platforms LLC",
    address: "Suite No. 103 \xB7 Office No. 33\nAl Mamkhool \xB7 Dubai \xB7 U.A.E",
    phone: "+971 529 125 865",
    email: "crteam@geebu.io",
    trn: "100047547540457"
  },
  receipt: { number: "CPR-2025-007432", date: "23 May 2025", status: "Partial receipt" },
  customer: {
    name: "Prestige Trading Co.",
    code: "CRS-005",
    address: "Advent Complex \xB7 3rd Floor \xB7 Suite No. 307\nPinnacle Business Park \xB7 P.O. Box 670525\nDubai \xB7 U.A.E",
    phone: "+971 4 321 9876",
    email: "accounts@prestige-trading.ae",
    trn: "100123456700003",
    crn: "10054321856000Z"
  },
  session: { ref: "CRS-2025-000188", invoiceCount: "4 invoices \xB7 1 partially settled" },
  account: { currency: "AED \u2013 Receivables Control", bank: "ENBD Bank \xB7 Main account" },
  invoices: [
    { ref: "SI-2025-005980", soRef: "SO-2025-003641", date: "22 Apr 2025", total: 31200, outstanding: 31200, received: 31200, balance: 0, status: "Fully paid", mode: "Cheque" },
    { ref: "SI-2025-006011", soRef: "SO-2025-003680", date: "28 Apr 2025", total: 14750, outstanding: 14750, received: 14750, balance: 0, status: "Fully paid", mode: "Cheque" },
    { ref: "SI-2025-006088", soRef: "SO-2025-003710", date: "05 May 2025", total: 8900, outstanding: 8900, received: 8900, balance: 0, status: "Fully paid", mode: "Cheque" },
    { ref: "SI-2025-006190", soRef: "SO-2025-003798", date: "14 May 2025", total: 22500, outstanding: 22500, received: 5150, balance: 17350, status: "Partial", mode: "Cheque" }
  ],
  summary: { totalOutstanding: 77350, discount: 0, remaining: 17350, totalReceived: 6e4 },
  payment: { method: "Cheque", depositedTo: "FAB \u2014 A/C XXXX-2291", chequeRef: "CHQ-CU-00019284", chequeDate: "22 May 2025", clearing: "3 days" },
  note: "Note: SI-2025-006190 partially received \u2014 remaining AED 17,350.00 outstanding on customer account.",
  footer: { generated: "23 May 2025 3:40 PM", user: "sales@company.ae" }
};
function fmt(n) {
  return n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Dirham symbol as an inline img for the React preview (mirrors the print renderer)
// red=true applies a CSS filter to tint the image red (can't use color on <img>)
function CurrSym({ size = "0.9em", red }) {
  return <img src={UAE_DIRHAM_SYMBOL_IMAGE} alt="AED" style={{ height: size, width: "auto", display: "inline-block", verticalAlign: "-0.07em", ...(red ? { filter: "invert(18%) sepia(96%) saturate(4967%) hue-rotate(338deg) brightness(88%) contrast(105%)" } : {}) }} />;
}
function defaultSettings() {
  return {
    templateName: "Default Payment Receipt",
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
    showReceiptNumber: true,
    showReceiptDate: true,
    showStatusBadge: true,
    showReceiptSession: true,
    showInvoiceCount: true,
    showAccountCurrency: true,
    showBankAccount: true,
    showCustomerName: true,
    showCustomerCode: true,
    showCustomerAddress: true,
    showCustomerPhone: true,
    showCustomerEmail: false,
    showCustomerTRN: false,
    showVATNumber: true,
    showInvoiceDate: true,
    showInvoiceTotal: true,
    showOutstanding: true,
    showReceivedNow: true,
    showBalanceAfter: true,
    showInvoiceStatus: true,
    showLinkedSO: true,
    showPayMode: true,
    showTotalOutstanding: true,
    showDiscountAllowed: true,
    showRemainingBalance: true,
    showTotalReceivedBold: true,
    showAmountInWords: true,
    showPaymentMethod: true,
    showDepositedTo: true,
    showChequeRef: true,
    showChequeDate: true,
    showNote: true,
    showCompanyStamp: true,
    stampUrl: "",
    showQRCode: false,
    showGeneratedBy: true,
    showReceivedByLine: true
  };
}
function ReceiptPreview({ s }) {
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
    s.showReceiptNumber && ["Receipt No.", MOCK.receipt.number],
    s.showReceiptDate && ["Date", MOCK.receipt.date],
    s.showReceiptSession && ["Receipt Session", MOCK.session.ref],
    s.showInvoiceCount && ["Invoices", MOCK.session.invoiceCount],
    s.showAccountCurrency && ["Account", MOCK.account.currency],
    s.showBankAccount && ["Cash / Bank", MOCK.account.bank]
  ].filter(Boolean);
  return <div style={{ fontFamily: s.fontFamily, fontSize: `${f}px`, background: "#fff", color: "#1a1a2e", padding: "28px 32px", position: "relative", minHeight: 1067, display: "flex", flexDirection: "column" }}>
      {/* ── BODY: grows to fill page ── */}
      <div style={{ flex: 1 }}>

      {
    /* ── HEADER: 3 columns — Customer | Doc Info | Logo + Company ── */
  }
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 16 }}>

        {
    /* COL 1: Title + Customer (Bill To style) */
  }
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: `${f + 11}px`, fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px 0", letterSpacing: "-0.3px", whiteSpace: "nowrap" }}>
            Customer Payment Receipt
          </h1>
          {s.showStatusBadge && <div style={{ marginBottom: 12 }}>
              <span style={{
    background: `${gold}22`,
    color: "#92400e",
    border: `1px solid ${gold}88`,
    fontSize: `${f - 1}px`,
    fontWeight: 600,
    padding: "2px 10px",
    borderRadius: 12
  }}>
                {MOCK.receipt.status}
              </span>
            </div>}
          {s.showCustomerName && <div>
              <p style={{ fontWeight: 700, fontSize: `${f - 0.5}px`, marginBottom: 4, color: "#888", letterSpacing: 0.5, textTransform: "uppercase" }}>Customer</p>
              <p style={{ fontWeight: 700, fontSize: `${f + 1}px`, marginBottom: 2 }}>{MOCK.customer.name}</p>
              {s.showCustomerCode && <p style={{ color: "#64748b", fontSize: `${f - 0.5}px`, margin: "1px 0" }}>{MOCK.customer.code}</p>}
              {s.showCustomerAddress && <p style={{ whiteSpace: "pre-line", lineHeight: 1.65, color: "#444", margin: "2px 0 0" }}>{MOCK.customer.address}</p>}
              {s.showCustomerPhone && <p style={{ marginTop: 2, color: "#555" }}>{MOCK.customer.phone}</p>}
              {s.showCustomerEmail && <p style={{ marginTop: 1, color: "#555" }}>{MOCK.customer.email}</p>}
              {s.showCustomerTRN && <p style={{ marginTop: 1, color: "#64748b", fontSize: `${f - 0.5}px` }}>TRN: {MOCK.customer.trn}</p>}
              {s.showVATNumber && <p style={{ marginTop: 1, color: "#64748b", fontSize: `${f - 0.5}px` }}>CR: {MOCK.customer.crn}</p>}
            </div>}
        </div>

        {
    /* COL 2: Receipt meta — label on top, value below */
  }
        {metaItems.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", alignSelf: "flex-end", paddingBottom: 2 }}>
            {metaItems.map(([label, val], i) => <div key={i}>
                <p style={{ margin: 0, fontSize: `${f - 1}px`, color: "#999", fontWeight: 500 }}>{label}</p>
                <p style={{ margin: "1px 0 0", fontSize: `${f}px`, fontWeight: 700, color: "#1a1a2e" }}>{val}</p>
              </div>)}
          </div>}

        {
    /* COL 3: Logo + Company (right-aligned, same as quotation) */
  }
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
          {s.showLogo && (s.logoUrl ? <img src={s.logoUrl} alt="logo" style={{ height: 72, objectFit: "contain" }} /> : <div style={{ width: 72, height: 72, borderRadius: "50%", background: `${gold}22`, border: `3px solid ${gold}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 32, fontWeight: 900, color: gold }}>G</span>
                </div>)}
          {s.showCompanyName && <div style={{ textAlign: "right", lineHeight: 1.55 }}>
              <p style={{ fontWeight: 700, fontSize: `${f + 1}px`, color: "#1a1a2e", margin: 0, whiteSpace: "nowrap" }}>{MOCK.company.name}</p>
              {s.showCompanyAddress && <p style={{ margin: 0, color: "#555", whiteSpace: "pre-line" }}>{MOCK.company.address}</p>}
              {s.showCompanyPhone && <p style={{ margin: 0 }}>{MOCK.company.phone}</p>}
              {s.showCompanyEmail && <p style={{ margin: 0 }}>{MOCK.company.email}</p>}
              {s.showTRN && <p style={{ margin: 0, color: "#666" }}>TRN · {MOCK.company.trn}</p>}
            </div>}
        </div>
      </div>

      {
    /* ── INVOICES TABLE LABEL ── */
  }
      <div style={{ fontSize: `${f - 0.5}px`, fontWeight: 700, color: "#64748b", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
        Invoices included in this receipt
      </div>

      {
    /* ── INVOICE TABLE ── */
  }
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <thead>
          <tr>
            <th style={thStyle}>Invoice ref.</th>
            {s.showInvoiceDate && <th style={{ ...thStyle, textAlign: "right" }}>Invoice date</th>}
            {s.showInvoiceTotal && <th style={{ ...thStyle, textAlign: "right" }}>Invoice total</th>}
            {s.showOutstanding && <th style={{ ...thStyle, textAlign: "right" }}>Outstanding</th>}
            {s.showReceivedNow && <th style={{ ...thStyle, textAlign: "right", color: "#92400e" }}>Received now</th>}
            {s.showBalanceAfter && <th style={{ ...thStyle, textAlign: "right" }}>Balance after</th>}
            {s.showPayMode && <th style={{ ...thStyle, textAlign: "center" }}>Pay mode</th>}
          </tr>
        </thead>
        <tbody>
          {MOCK.invoices.map((inv, i) => <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
              <td style={tdStyle()}>
                {s.showInvoiceStatus && <span style={{
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
                  </span>}
                <div style={{ fontWeight: 600, color: "#1d4ed8", fontSize: `${f}px` }}>{inv.ref}</div>
                {s.showLinkedSO && <div style={{ color: "#94a3b8", fontSize: `${f - 1.5}px`, marginTop: 1 }}>SO: {inv.soRef}</div>}
              </td>
              {s.showInvoiceDate && <td style={{ ...tdStyle(true), color: "#64748b" }}>{inv.date}</td>}
              {s.showInvoiceTotal && <td style={tdStyle(true)}><CurrSym /> {fmt(inv.total)}</td>}
              {s.showOutstanding && <td style={tdStyle(true)}><CurrSym /> {fmt(inv.outstanding)}</td>}
              {s.showReceivedNow && <td style={{ ...tdStyle(true), fontWeight: 700, color: "#1a1a2e" }}><CurrSym /> {fmt(inv.received)}</td>}
              {s.showBalanceAfter && <td style={tdStyle(true)}>
                  {inv.balance > 0 ? <span style={{ fontWeight: 600 }}><CurrSym /> {fmt(inv.balance)}</span> : <span style={{ color: "#94a3b8" }}><CurrSym /> 0.00</span>}
                </td>}
              {s.showPayMode && <td style={{ ...tdStyle(true), textAlign: "center" }}>
                  <span style={{ fontSize: `${f - 1}px`, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "1px 7px", whiteSpace: "nowrap" }}>{inv.mode || '—'}</span>
                </td>}
            </tr>)}
        </tbody>
      </table>

      </div>{/* end flex:1 body */}

      {/* ── FOOTER GROUP: pinned to bottom ── */}
      <div style={{ marginTop: "auto" }}>

      {
    /* ── SUMMARY (right-aligned) ── */
  }
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <table style={{ width: "auto", borderCollapse: "collapse", fontSize: `${f}px` }}>
          <tbody>
            {s.showTotalOutstanding && <tr>
                <td style={{ padding: "3px 16px 3px 0", color: "#64748b", textAlign: "right", whiteSpace: "nowrap" }}>Total outstanding</td>
                <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", minWidth: 100 }}><CurrSym /> <span style={{ display: "inline-block", minWidth: 70, textAlign: "right" }}>{fmt(MOCK.summary.totalOutstanding)}</span></td>
              </tr>}
            {s.showDiscountAllowed && <tr>
                <td style={{ padding: "3px 16px 3px 0", color: "#64748b", textAlign: "right", whiteSpace: "nowrap" }}>Discount allowed</td>
                <td style={{ padding: "3px 0", textAlign: "right", color: "#e11d48", whiteSpace: "nowrap", minWidth: 100 }}><CurrSym red /> <span style={{ display: "inline-block", minWidth: 70, textAlign: "right" }}>—{MOCK.summary.discount.toFixed(2)}</span></td>
              </tr>}
            {s.showRemainingBalance && <tr>
                <td style={{ padding: "3px 16px 3px 0", color: "#64748b", textAlign: "right", whiteSpace: "nowrap" }}>Remaining balance</td>
                <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", minWidth: 100 }}><CurrSym /> <span style={{ display: "inline-block", minWidth: 70, textAlign: "right" }}>{fmt(MOCK.summary.remaining)}</span></td>
              </tr>}
            {s.showTotalReceivedBold && <tr style={{ background: `${gold}18` }}>
                <td style={{ padding: "6px 16px 6px 0", fontWeight: 700, textAlign: "right", fontSize: `${f + 1}px`, whiteSpace: "nowrap" }}>Total received now</td>
                <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 800, fontSize: `${f + 2}px`, color: "#1a1a2e", whiteSpace: "nowrap", minWidth: 100 }}>
                  <CurrSym size="1em" /> <span style={{ display: "inline-block", minWidth: 70, textAlign: "right" }}>{fmt(MOCK.summary.totalReceived)}</span>
                </td>
              </tr>}
          </tbody>
        </table>
      </div>

      {
    /* ── AMOUNT IN WORDS ── */
  }
      {s.showAmountInWords && <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <div style={{ fontSize: `${f}px`, fontWeight: 600, color: "#1a1a2e", textAlign: "right", background: "#f8fafc", padding: "6px 12px", borderRadius: 4, border: "1px solid #e2e8f0" }}>
            <span style={{ color: "#64748b", marginRight: 4 }}>Amount in words:</span> <span style={{ fontWeight: 700, color: "#1a1a2e" }}>Sixty Thousand Dirhams Only</span>
          </div>
        </div>}

      {
    /* ── PAYMENT DETAILS ── */
  }
      {s.showPaymentMethod && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 32px", marginBottom: 14, fontSize: `${f}px`, borderTop: `1px solid ${gold}30`, paddingTop: 10 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <span style={{ color: "#94a3b8", minWidth: 90 }}>Payment method</span>
            <span style={{ fontWeight: 600 }}>{MOCK.payment.method}</span>
          </div>
          {s.showChequeRef && <div style={{ display: "flex", gap: 10 }}>
              <span style={{ color: "#94a3b8", minWidth: 90 }}>Cheque no. / ref.</span>
              <span style={{ fontWeight: 600 }}>{MOCK.payment.chequeRef}</span>
            </div>}
          {s.showDepositedTo && <div style={{ display: "flex", gap: 10 }}>
              <span style={{ color: "#94a3b8", minWidth: 90 }}>Deposited to</span>
              <span style={{ fontWeight: 600 }}>{MOCK.payment.depositedTo}</span>
            </div>}
          {s.showChequeDate && <div style={{ display: "flex", gap: 10 }}>
              <span style={{ color: "#94a3b8", minWidth: 90 }}>Cheque date</span>
              <span style={{ fontWeight: 600 }}>{MOCK.payment.chequeDate} &nbsp;·&nbsp; Clearing: {MOCK.payment.clearing}</span>
            </div>}
        </div>}

      {
    /* ── NOTE ── */
  }
      {s.showNote && <div style={{ background: `${gold}14`, border: `1px solid ${gold}66`, borderRadius: 4, padding: "7px 12px", fontSize: `${f}px`, color: "#374151", marginBottom: 16 }}>
          {MOCK.note}
        </div>}

      {
    /* ── STAMP + QR ── */
  }
      {(s.showCompanyStamp || s.showQRCode) && <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginBottom: 14 }}>
          {s.showCompanyStamp && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {s.stampUrl ? <img src={s.stampUrl} alt="stamp" style={{ width: 88, height: 88, objectFit: "contain" }} /> : <div style={{
    width: 88,
    height: 88,
    borderRadius: "50%",
    border: `2px dashed ${gold}`,
    background: `${gold}0d`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center"
  }}>
                    <span style={{ fontSize: `${f - 1}px`, color: "#92400e", fontWeight: 700, textAlign: "center", lineHeight: 1.4 }}>
                      Company<br />Stamp
                    </span>
                  </div>}
              <span style={{ fontSize: `${f - 2}px`, color: "#94a3b8" }}>Official Stamp</span>
            </div>}
          {s.showQRCode && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: 52, height: 52, background: "#1a1a2e", borderRadius: 4 }} />
              <span style={{ fontSize: `${f - 2}px`, color: "#94a3b8" }}>Scan to verify</span>
            </div>}
        </div>}

      {
    /* ── FOOTER BAR ── */
  }
      {(s.showGeneratedBy || s.showReceivedByLine) && <div style={{ borderTop: `2px solid ${gold}`, marginTop: 8, paddingTop: 7, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: `${f - 0.5}px`, color: "#64748b" }}>
          <div>
            {s.showGeneratedBy && <span>BillBull ERP · Generated: {MOCK.footer.generated} · User: {MOCK.footer.user}</span>}
          </div>
          {s.showReceivedByLine && <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span>Received by:</span>
              <span style={{ borderBottom: "1px solid #94a3b8", display: "inline-block", minWidth: 90 }}>&nbsp;</span>
            </div>}
        </div>}

      </div>{/* end footer group */}
    </div>;
}
function SLabel({ label }) {
  return <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-4 mb-1.5 px-0.5">{label}</div>;
}
function Row({ label, children }) {
  return <div className="flex min-w-0 items-center justify-between gap-3 py-1.5 pr-1 border-b border-slate-100 last:border-0">
      <span className="min-w-0 text-[11px] text-slate-700 leading-tight">{label}</span>
      <div className="flex shrink-0 items-center justify-end">{children}</div>
    </div>;
}
function Toggle({ value, onChange }) {
  return <button
    type="button"
    role="switch"
    aria-checked={!!value}
    onClick={() => onChange(!value)}
    className={`relative inline-flex h-4 w-8 shrink-0 items-center overflow-hidden rounded-full transition-colors ${value ? "bg-[#F5C742]" : "bg-slate-200"}`}
  >
      <span className={`block h-3 w-3 shrink-0 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>;
}
function ColorPick({ value, onChange }) {
  return <label className="flex items-center gap-1.5 cursor-pointer">
      <span className="w-5 h-5 rounded border border-slate-200 block" style={{ background: value }} />
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="sr-only" />
      <span className="text-[10px] text-slate-500 font-mono">{value}</span>
    </label>;
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
  return <div className="py-1.5 border-b border-slate-100">
      <p className="text-[10px] text-slate-500 mb-1.5">{label}</p>
      <div className="flex items-center gap-2">
        {value ? <div className={`shrink-0 overflow-hidden bg-slate-100 border border-slate-200 ${shape === "circle" ? "rounded-full w-10 h-10" : "rounded w-16 h-10"}`}>
              <img src={value} alt="preview" className="w-full h-full object-contain" />
            </div> : <div className={`shrink-0 bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-[9px] text-slate-400 ${shape === "circle" ? "rounded-full w-10 h-10" : "rounded w-16 h-10"}`}>
              {shape === "circle" ? "Stamp" : "Logo"}
            </div>}
        <div className="flex flex-col gap-1">
          <label htmlFor={id} className="cursor-pointer text-[10px] text-[#b08a00] font-medium hover:underline">{value ? "Change" : "Upload"} image</label>
          <input id={id} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          {value && <button onClick={() => onChange("")} className="text-[10px] text-slate-400 hover:text-red-500 text-left">Remove</button>}
        </div>
      </div>
    </div>;
}
function PaymentReceiptDesigner({ templateName, initialSettings, onClose, onSave }) {
  const [s, setS] = useState({
    ...defaultSettings(),
    templateName: templateName ?? "Default Payment Receipt",
    ...initialSettings
  });
  const [tab, setTab] = useState("style");
  const [zoom, setZoom] = useState(0.6);
  function upd(key, val) {
    setS((prev) => ({ ...prev, [key]: val }));
  }
  const TABS = [
    { id: "style", label: "Style" },
    { id: "header", label: "Header" },
    { id: "table", label: "Invoices" },
    { id: "footer", label: "Footer" }
  ];
  return <div className="flex flex-col min-h-screen bg-[#F0F0F3]">

      {
    /* Top bar */
  }
      <div className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center justify-between gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-xs transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <span className="text-slate-200">|</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: s.accentColor }} />
            <span className="text-xs font-semibold text-slate-800">{s.templateName}</span>
            <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4">Customer Payment Receipt</Badge>
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
    onClick={() => {
      onSave(s);
      toast.success("Template saved!");
    }}
  >
            <Save className="h-3.5 w-3.5" /> Save Template
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {
    /* Settings panel */
  }
        <div className="w-[268px] shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">

          <div className="px-3 py-2 border-b border-slate-100">
            <input
    value={s.templateName}
    onChange={(e) => upd("templateName", e.target.value)}
    className="w-full text-[11px] font-semibold border border-slate-200 rounded-md px-2 py-1.5 bg-slate-50 focus:outline-none focus:border-[#F5C742]"
    placeholder="Template name"
  />
          </div>

          <div className="flex border-b border-slate-200 shrink-0">
            {TABS.map((t) => <button
    key={t.id}
    onClick={() => setTab(t.id)}
    className={`flex-1 px-2 py-2 text-[10px] font-medium border-b-2 transition-colors ${tab === t.id ? "border-[#F5C742] text-slate-900 bg-[#FFFBF0]" : "border-transparent text-slate-500 hover:text-slate-700"}`}
  >
                {t.label}
              </button>)}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-1.5">

            {
    /* ── STYLE ── */
  }
            {tab === "style" && <>
              <SLabel label="Colors" />
              <Row label="Accent Color"><ColorPick value={s.accentColor} onChange={(v) => upd("accentColor", v)} /></Row>
              <SLabel label="Typography" />
              <Row label="Font Family">
                <select
    value={s.fontFamily}
    onChange={(e) => upd("fontFamily", e.target.value)}
    className="text-[10px] border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none"
  >
                  {[["Inter, sans-serif", "Inter"], ["Arial, sans-serif", "Arial"], ["Helvetica, sans-serif", "Helvetica"], ["Georgia, serif", "Georgia"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Row>
              <Row label="Font Size (px)">
                <input
    type="number"
    min={7}
    max={13}
    value={s.fontSize}
    onChange={(e) => upd("fontSize", +e.target.value)}
    className="w-12 text-[10px] border border-slate-200 rounded px-1.5 py-0.5 text-center focus:outline-none"
  />
              </Row>
              <SLabel label="Paper" />
              <Row label="Paper Size">
                <select
    value={s.paperSize}
    onChange={(e) => upd("paperSize", e.target.value)}
    className="text-[10px] border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none"
  >
                  <option value="A4">A4</option>
                  <option value="Letter">Letter</option>
                </select>
              </Row>
            </>}

            {
    /* ── HEADER ── */
  }
            {tab === "header" && <>
              <SLabel label="Company (right column)" />
              <Row label="Logo"><Toggle value={s.showLogo} onChange={(v) => upd("showLogo", v)} /></Row>
              {s.showLogo && <ImageUpload value={s.logoUrl} onChange={(v) => upd("logoUrl", v)} label="Company Logo" shape="rect" />}
              <Row label="Company Name"><Toggle value={s.showCompanyName} onChange={(v) => upd("showCompanyName", v)} /></Row>
              <Row label="Address"><Toggle value={s.showCompanyAddress} onChange={(v) => upd("showCompanyAddress", v)} /></Row>
              <Row label="Phone"><Toggle value={s.showCompanyPhone} onChange={(v) => upd("showCompanyPhone", v)} /></Row>
              <Row label="Email"><Toggle value={s.showCompanyEmail} onChange={(v) => upd("showCompanyEmail", v)} /></Row>
              <Row label="TRN (VAT Number)"><Toggle value={s.showTRN} onChange={(v) => upd("showTRN", v)} /></Row>

              <SLabel label="Receipt Info (middle column)" />
              <Row label="Receipt Number"><Toggle value={s.showReceiptNumber} onChange={(v) => upd("showReceiptNumber", v)} /></Row>
              <Row label="Receipt Date"><Toggle value={s.showReceiptDate} onChange={(v) => upd("showReceiptDate", v)} /></Row>
              <Row label="Status Badge"><Toggle value={s.showStatusBadge} onChange={(v) => upd("showStatusBadge", v)} /></Row>
              <Row label="Receipt Session"><Toggle value={s.showReceiptSession} onChange={(v) => upd("showReceiptSession", v)} /></Row>
              <Row label="Invoice Count"><Toggle value={s.showInvoiceCount} onChange={(v) => upd("showInvoiceCount", v)} /></Row>
              <Row label="Account / Currency"><Toggle value={s.showAccountCurrency} onChange={(v) => upd("showAccountCurrency", v)} /></Row>
              <Row label="Bank Account"><Toggle value={s.showBankAccount} onChange={(v) => upd("showBankAccount", v)} /></Row>

              <SLabel label="Customer (left column)" />
              <Row label="Customer Name"><Toggle value={s.showCustomerName} onChange={(v) => upd("showCustomerName", v)} /></Row>
              <Row label="Customer Code"><Toggle value={s.showCustomerCode} onChange={(v) => upd("showCustomerCode", v)} /></Row>
              <Row label="Address"><Toggle value={s.showCustomerAddress} onChange={(v) => upd("showCustomerAddress", v)} /></Row>
              <Row label="Phone"><Toggle value={s.showCustomerPhone} onChange={(v) => upd("showCustomerPhone", v)} /></Row>
              <Row label="Email"><Toggle value={s.showCustomerEmail} onChange={(v) => upd("showCustomerEmail", v)} /></Row>
              <Row label="TRN (VAT Number)"><Toggle value={s.showCustomerTRN} onChange={(v) => upd("showCustomerTRN", v)} /></Row>
              <Row label="CR Number"><Toggle value={s.showVATNumber} onChange={(v) => upd("showVATNumber", v)} /></Row>
            </>}

            {
    /* ── INVOICES ── */
  }
            {tab === "table" && <>
              <SLabel label="Table Columns" />
              <Row label="Invoice Date"><Toggle value={s.showInvoiceDate} onChange={(v) => upd("showInvoiceDate", v)} /></Row>
              <Row label="Invoice Total"><Toggle value={s.showInvoiceTotal} onChange={(v) => upd("showInvoiceTotal", v)} /></Row>
              <Row label="Outstanding"><Toggle value={s.showOutstanding} onChange={(v) => upd("showOutstanding", v)} /></Row>
              <Row label="Received Now"><Toggle value={s.showReceivedNow} onChange={(v) => upd("showReceivedNow", v)} /></Row>
              <Row label="Balance After"><Toggle value={s.showBalanceAfter} onChange={(v) => upd("showBalanceAfter", v)} /></Row>
              <Row label="Status Badge"><Toggle value={s.showInvoiceStatus} onChange={(v) => upd("showInvoiceStatus", v)} /></Row>
              <Row label="Linked SO"><Toggle value={s.showLinkedSO} onChange={(v) => upd("showLinkedSO", v)} /></Row>
              <Row label="Pay Mode"><Toggle value={s.showPayMode} onChange={(v) => upd("showPayMode", v)} /></Row>

              <SLabel label="Summary Block" />
              <Row label="Total Outstanding"><Toggle value={s.showTotalOutstanding} onChange={(v) => upd("showTotalOutstanding", v)} /></Row>
              <Row label="Discount Allowed"><Toggle value={s.showDiscountAllowed} onChange={(v) => upd("showDiscountAllowed", v)} /></Row>
              <Row label="Remaining Balance"><Toggle value={s.showRemainingBalance} onChange={(v) => upd("showRemainingBalance", v)} /></Row>
              <Row label="Total Received (bold)"><Toggle value={s.showTotalReceivedBold} onChange={(v) => upd("showTotalReceivedBold", v)} /></Row>
              <Row label="Amount in Words"><Toggle value={s.showAmountInWords} onChange={(v) => upd("showAmountInWords", v)} /></Row>
            </>}

            {
    /* ── FOOTER ── */
  }
            {tab === "footer" && <>
              <SLabel label="Payment Details" />
              <Row label="Payment Method"><Toggle value={s.showPaymentMethod} onChange={(v) => upd("showPaymentMethod", v)} /></Row>
              <Row label="Deposited To"><Toggle value={s.showDepositedTo} onChange={(v) => upd("showDepositedTo", v)} /></Row>
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
              <Row label="Received By Line"><Toggle value={s.showReceivedByLine} onChange={(v) => upd("showReceivedByLine", v)} /></Row>
            </>}

          </div>
        </div>

        {
    /* Preview */
  }
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
              <ReceiptPreview s={s} />
            </div>
          </div>
        </div>
      </div>
    </div>;
}
export {
  PaymentReceiptDesigner
};
