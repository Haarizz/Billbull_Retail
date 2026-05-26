import React, { useState } from "react";
import {
    ArrowLeft, Save, Palette, AlignLeft, Mail, ChevronDown, Layout,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Voucher type metadata ────────────────────────────────────────────────────

export const VOUCHER_TYPES = [
    "journal-voucher", "expense-voucher", "receipt-voucher",
    "payment-voucher", "contra-voucher", "cheque-printing",
];

const LABELS = {
    "journal-voucher": "Journal Voucher",
    "expense-voucher": "Expense Voucher",
    "receipt-voucher": "Receipt Voucher",
    "payment-voucher": "Payment Voucher",
    "contra-voucher":  "Contra Voucher",
    "cheque-printing": "Cheque Printing",
};

export function voucherTypeLabel(t) { return LABELS[t]; }

export function defaultVoucherSettings(voucherType) {
    const isPayment = voucherType === "payment-voucher";
    const isReceipt = voucherType === "receipt-voucher";
    const isCheque  = voucherType === "cheque-printing";
    return {
        voucherType,
        templateName: `Default ${LABELS[voucherType]}`,
        accentColor: "#F5C742",
        fontFamily: "Inter, sans-serif",
        fontSize: 9,
        paperSize: isCheque ? "A5" : "A4",
        showLogo: true, logoUrl: "",
        showCompanyName: true, showCompanyAddress: true,
        showCompanyPhone: true, showCompanyEmail: true, showTRN: true,
        showVoucherNumber: true, showVoucherDate: true, showReference: true,
        showBranch: true, showCurrency: true, showPreparedBy: true,
        showNarration: !isCheque,
        showAccountCode: !isCheque,
        showCostCenter: voucherType === "expense-voucher",
        showProjectCode: false,
        showAmountInWords: true,
        showTotalDebit: !isCheque && !isPayment && !isReceipt,
        showTotalCredit: !isCheque && !isPayment && !isReceipt,
        showNetAmount: isPayment || isReceipt || voucherType === "expense-voucher",
        showPreparedBySign: true, showCheckedBySign: true,
        showApprovedBySign: true, showReceivedBySign: isPayment || isReceipt,
        showTerms: !isCheque,
        termsText: "This is a computer-generated voucher. Authorized signatures required for validity.",
        showCompanyStamp: true, showPageNumbers: true,
        emailSubject: `${LABELS[voucherType]} #{number} from {company_name}`,
        emailBody: `Dear {recipient},\n\nPlease find attached ${LABELS[voucherType]} #{number} for your records.\n\nBest regards,\n{company_name}`,
    };
}

// ─── Mock preview data ────────────────────────────────────────────────────────

const MOCK = {
    company: {
        name: "GEEBU Enterprise Platforms LLC",
        address: "Suite No. 103 · Office No. 33\nAl Mamkhool · Dubai · U.A.E",
        phone: "+971 529 125 865", email: "crteam@geebu.io", trn: "100047547540457",
    },
    journalEntries: [
        { no: 1, account: "1001 - Cash", description: "Office Supplies Purchase", debit: 5000, credit: 0 },
        { no: 2, account: "6001 - Office Expenses", description: "Stationery & supplies", debit: 0, credit: 5000 },
    ],
    expensePayment: { mode: "Cash", account: "Petty Cash — Main Office", branch: "Dubai — Main", date: "22-May-2026" },
    expenseItems: [
        { no: 1, description: "Air Ticket — Dubai to Riyadh (Booking Ref: FZ-20280)", category: "Travel", costCenter: "Sales Dept", amount: 1200 },
        { no: 2, description: "Hotel Stay — 2 nights, Riyadh Marriott", category: "Accommodation", costCenter: "Sales Dept", amount: 800 },
        { no: 3, description: "Office Stationery & Supplies", category: "Stationery", costCenter: "Admin", amount: 350 },
        { no: 4, description: "Taxi & Local Transport (receipts attached)", category: "Transport", costCenter: "Sales Dept", amount: 185 },
    ],
    receiptPayment: {
        party: "Al Mansoori Trading LLC", partyCode: "VND-0042", amount: 15000, currency: "AED",
        mode: "Bank Transfer", bank: "Emirates NBD", chequeRef: "CHQ-00188821",
        narration: "Payment against Invoice SI-2026-0521 and SI-2026-0522",
        invoices: [
            { ref: "SI-2026-0521", date: "01-May-2026", total: 8500, paid: 8500 },
            { ref: "SI-2026-0522", date: "10-May-2026", total: 6500, paid: 6500 },
        ],
    },
    contraEntries: [
        { account: "1001 - Petty Cash", type: "Dr", amount: 2000 },
        { account: "1002 - Main Cash Account", type: "Cr", amount: 2000 },
    ],
    cheque: {
        payee: "Al Mansoori Trading LLC", amount: 15000,
        amountWords: "Fifteen Thousand Dirhams Only",
        bank: "Emirates NBD", branch: "Al Barsha Branch",
        account: "1012-345678-001", date: "22-May-2026",
    },
};

const fmt = (n) => n.toLocaleString("en-AE", { minimumFractionDigits: 2 });

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Toggle({ checked, onChange }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${checked ? "bg-[#F5C742]" : "bg-gray-200"}`}
        >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
    );
}

function Row({ label, checked, onChange }) {
    return (
        <div className="flex items-center justify-between py-1.5">
            <span className="text-xs font-medium text-gray-700 leading-tight">{label}</span>
            <Toggle checked={checked} onChange={onChange} />
        </div>
    );
}

function Section({ title, children }) {
    const [open, setOpen] = useState(true);
    return (
        <div className="border rounded-lg overflow-hidden">
            <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors">
                <span className="text-xs font-semibold text-gray-800 uppercase tracking-wide">{title}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && <div className="px-3 pb-2 divide-y divide-gray-50">{children}</div>}
        </div>
    );
}

// ─── Header block shared by all paper previews ────────────────────────────────

function PaperHeader({ s, title, meta, claimantLabel = "Prepared By", claimantValue = "John Mathew" }) {
    const f = s.fontSize;
    const gold = s.accentColor;
    return (
        <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: `${f + 17}px`, fontWeight: 700, color: "#1a1a2e", margin: "0 0 14px 0", letterSpacing: "-0.5px" }}>{title}</h1>
                    {s.showCompanyName && <div style={{ fontWeight: 700, fontSize: `${f + 1}px`, color: "#1a1a2e", marginBottom: 2 }}>{MOCK.company.name}</div>}
                    {s.showCompanyAddress && <div style={{ fontSize: `${f - 1}px`, color: "#666", whiteSpace: "pre-line" }}>{MOCK.company.address}</div>}
                    {s.showCompanyPhone && <div style={{ fontSize: `${f - 1}px`, color: "#666" }}>{MOCK.company.phone}</div>}
                    {s.showTRN && <div style={{ fontSize: `${f - 1}px`, color: "#666" }}>TRN · {MOCK.company.trn}</div>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 20px", alignSelf: "flex-end", paddingBottom: 2, minWidth: 220 }}>
                    {meta.map(([key, label, value], i) => (
                        s[key] && (
                            <React.Fragment key={i}>
                                <span style={{ fontSize: `${f - 1}px`, color: "#999" }}>{label}</span>
                                <span style={{ fontSize: `${f - 1}px`, fontWeight: 600, color: "#1a1a2e" }}>{value}</span>
                            </React.Fragment>
                        )
                    ))}
                    {s.showPreparedBy && (
                        <>
                            <span style={{ fontSize: `${f - 1}px`, color: "#999" }}>{claimantLabel}</span>
                            <span style={{ fontSize: `${f - 1}px`, fontWeight: 600, color: "#1a1a2e" }}>{claimantValue}</span>
                        </>
                    )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                    {s.showLogo && (
                        <div style={{ width: 72, height: 72, borderRadius: "50%", border: `2px solid ${gold}`, background: `${gold}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 700, color: gold }}>G</div>
                    )}
                </div>
            </div>
            <div style={{ height: 2, background: `linear-gradient(90deg, ${gold}, ${gold}44)`, marginBottom: 16, borderRadius: 1 }} />
        </>
    );
}

function SignatureStrip({ s, slots }) {
    const f = s.fontSize;
    return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${slots.length}, 1fr)`, gap: 16, marginTop: 24, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
            {slots.map((slot, i) => slot && (
                slot === "STAMP"
                    ? <div key={i} style={{ textAlign: "center" }}><div style={{ width: 56, height: 56, borderRadius: "50%", border: "1.5px dashed #94a3b8", margin: "0 auto 6px", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: `${f - 2}px`, color: "#94a3b8" }}>STAMP</span></div></div>
                    : <div key={i} style={{ textAlign: "center" }}><div style={{ borderBottom: "1px solid #94a3b8", height: 32, marginBottom: 6 }} /><div style={{ fontSize: `${f - 1.5}px`, color: "#888" }}>{slot}</div></div>
            ))}
        </div>
    );
}

function TermsFooter({ s }) {
    if (!s.showTerms) return null;
    const f = s.fontSize;
    return <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #f1f5f9", fontSize: `${f - 1.5}px`, color: "#94a3b8", textAlign: "center" }}>{s.termsText}</div>;
}

// ─── Previews ─────────────────────────────────────────────────────────────────

function JournalPreview({ s }) {
    const f = s.fontSize;
    const gold = s.accentColor;
    const totalDr = MOCK.journalEntries.reduce((sum, e) => sum + e.debit, 0);
    const totalCr = MOCK.journalEntries.reduce((sum, e) => sum + e.credit, 0);
    const thS = { background: `${gold}18`, color: "#1a1a2e", padding: "5px 8px", fontWeight: 700, fontSize: `${f - 0.5}px`, textAlign: "left" };
    const tdS = { padding: "5px 8px", fontSize: `${f}px`, borderBottom: "1px solid #f1f5f9", verticalAlign: "top" };

    return (
        <div style={{ fontFamily: s.fontFamily, fontSize: `${f}px`, background: "#fff", color: "#333", padding: "28px 32px", position: "relative" }}>
            <PaperHeader s={s} title="JOURNAL VOUCHER" meta={[
                ["showVoucherNumber", "Voucher No.", "JV-2026-0045"],
                ["showVoucherDate", "Date", "22-May-2026"],
                ["showReference", "Reference", "ADJ-MAY-2026"],
                ["showBranch", "Branch", "Dubai — Main"],
                ["showCurrency", "Currency", "AED"],
            ]} />

            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
                <thead>
                    <tr>
                        {s.showAccountCode && <th style={thS}>#</th>}
                        <th style={{ ...thS, width: "40%" }}>Account</th>
                        <th style={thS}>Description / Narration</th>
                        <th style={{ ...thS, textAlign: "right" }}>Debit (AED)</th>
                        <th style={{ ...thS, textAlign: "right" }}>Credit (AED)</th>
                    </tr>
                </thead>
                <tbody>
                    {MOCK.journalEntries.map((entry, i) => (
                        <tr key={i}>
                            {s.showAccountCode && <td style={{ ...tdS, color: "#999", fontSize: `${f - 1}px` }}>{entry.no}</td>}
                            <td style={{ ...tdS, fontWeight: 600, color: "#1a1a2e" }}>{entry.account}</td>
                            <td style={{ ...tdS, color: "#555" }}>{entry.description}</td>
                            <td style={{ ...tdS, textAlign: "right", fontFamily: "monospace", color: entry.debit ? "#166534" : "#aaa" }}>{entry.debit ? fmt(entry.debit) : "—"}</td>
                            <td style={{ ...tdS, textAlign: "right", fontFamily: "monospace", color: entry.credit ? "#991b1b" : "#aaa" }}>{entry.credit ? fmt(entry.credit) : "—"}</td>
                        </tr>
                    ))}
                    <tr style={{ background: `${gold}12` }}>
                        {s.showAccountCode && <td />}
                        <td colSpan={2} style={{ ...tdS, fontWeight: 700, color: "#1a1a2e", fontSize: `${f - 0.5}px` }}>TOTAL</td>
                        {s.showTotalDebit && <td style={{ ...tdS, textAlign: "right", fontWeight: 700, fontFamily: "monospace", color: "#166534" }}>{fmt(totalDr)}</td>}
                        {s.showTotalCredit && <td style={{ ...tdS, textAlign: "right", fontWeight: 700, fontFamily: "monospace", color: "#991b1b" }}>{fmt(totalCr)}</td>}
                    </tr>
                </tbody>
            </table>

            {s.showNarration && (
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 12px", marginBottom: 16, fontSize: `${f}px` }}>
                    <span style={{ fontWeight: 600, color: "#1a1a2e", marginRight: 8 }}>Narration:</span>
                    <span style={{ color: "#555" }}>Being the adjustment entry for office supplies purchase. Approved by Finance Manager.</span>
                </div>
            )}

            {s.showAmountInWords && (
                <div style={{ marginBottom: 16, fontSize: `${f - 0.5}px`, color: "#666" }}>
                    <span style={{ fontWeight: 600 }}>Amount in Words: </span>Five Thousand Dirhams Only
                </div>
            )}

            <SignatureStrip s={s} slots={[
                s.showPreparedBySign && "Prepared By",
                s.showCheckedBySign && "Checked By",
                s.showApprovedBySign && "Approved By",
                s.showCompanyStamp && "STAMP",
            ]} />
            <TermsFooter s={s} />
        </div>
    );
}

function ExpensePreview({ s }) {
    const f = s.fontSize;
    const gold = s.accentColor;
    const total = MOCK.expenseItems.reduce((sum, e) => sum + e.amount, 0);
    const thS = { background: `${gold}18`, color: "#1a1a2e", padding: "5px 8px", fontWeight: 700, fontSize: `${f - 0.5}px`, textAlign: "left" };
    const tdS = { padding: "5px 8px", fontSize: `${f}px`, borderBottom: "1px solid #f1f5f9", verticalAlign: "top" };
    const pay = MOCK.expensePayment;
    const colSpanTotal = 3 + (s.showCostCenter ? 1 : 0);

    return (
        <div style={{ fontFamily: s.fontFamily, fontSize: `${f}px`, background: "#fff", color: "#333", padding: "28px 32px" }}>
            <PaperHeader s={s} title="EXPENSE VOUCHER" meta={[
                ["showVoucherNumber", "Voucher No.", "EV-2026-0112"],
                ["showVoucherDate", "Date", pay.date],
                ["showBranch", "Branch", pay.branch],
            ]} claimantLabel="Claimant" claimantValue="Ahmed Al Rashidi" />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, marginBottom: 14, border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "8px 12px", background: "#f8fafc", borderRight: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: `${f - 1.5}px`, color: "#999", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 2 }}>Payment Mode</div>
                    <div style={{ fontWeight: 700, color: "#1a1a2e", fontSize: `${f}px`, display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#166534" }} />
                        {pay.mode}
                    </div>
                </div>
                <div style={{ padding: "8px 12px", background: "#f8fafc", borderRight: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: `${f - 1.5}px`, color: "#999", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 2 }}>Payment Account</div>
                    <div style={{ fontWeight: 600, color: "#1a1a2e", fontSize: `${f}px` }}>{pay.account}</div>
                </div>
                <div style={{ padding: "8px 12px", background: "#f8fafc" }}>
                    <div style={{ fontSize: `${f - 1.5}px`, color: "#999", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 2 }}>Voucher Date</div>
                    <div style={{ fontWeight: 600, color: "#1a1a2e", fontSize: `${f}px` }}>{pay.date}</div>
                </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
                <thead>
                    <tr>
                        <th style={{ ...thS, width: 24 }}>#</th>
                        <th style={thS}>Expense Description</th>
                        <th style={thS}>Category</th>
                        {s.showCostCenter && <th style={thS}>Cost Center</th>}
                        <th style={{ ...thS, textAlign: "right" }}>Amount (AED)</th>
                    </tr>
                </thead>
                <tbody>
                    {MOCK.expenseItems.map((item, i) => (
                        <tr key={i} style={{ background: i % 2 === 1 ? "#fafafa" : "#fff" }}>
                            <td style={{ ...tdS, color: "#999", fontSize: `${f - 1}px` }}>{item.no}</td>
                            <td style={{ ...tdS, fontWeight: 500, color: "#1a1a2e" }}>{item.description}</td>
                            <td style={tdS}>
                                <span style={{ background: `${gold}22`, color: "#92400e", fontSize: `${f - 1}px`, fontWeight: 600, padding: "1px 7px", borderRadius: 4, whiteSpace: "nowrap" }}>{item.category}</span>
                            </td>
                            {s.showCostCenter && (
                                <td style={{ ...tdS, color: "#4f46e5", fontSize: `${f - 0.5}px`, fontWeight: 500 }}>{item.costCenter}</td>
                            )}
                            <td style={{ ...tdS, textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: "#1a1a2e" }}>{fmt(item.amount)}</td>
                        </tr>
                    ))}
                    <tr style={{ background: `${gold}12` }}>
                        <td colSpan={colSpanTotal} style={{ ...tdS, fontWeight: 700, color: "#1a1a2e", fontSize: `${f - 0.5}px`, textTransform: "uppercase", letterSpacing: "0.3px" }}>Total Expense</td>
                        <td style={{ ...tdS, textAlign: "right", fontWeight: 700, fontFamily: "monospace", fontSize: `${f + 1}px`, color: "#1a1a2e" }}>{fmt(total)}</td>
                    </tr>
                </tbody>
            </table>

            {s.showNarration && (
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 12px", marginBottom: 14, fontSize: `${f}px` }}>
                    <span style={{ fontWeight: 600, color: "#1a1a2e" }}>Narration: </span>
                    <span style={{ color: "#555" }}>Business travel and operational expenses — Riyadh trip, May 2026. All receipts attached.</span>
                </div>
            )}

            {s.showAmountInWords && (
                <div style={{ marginBottom: 14, fontSize: `${f - 0.5}px`, color: "#666" }}>
                    <span style={{ fontWeight: 600 }}>Amount in Words: </span>Two Thousand Five Hundred and Thirty Five Dirhams Only
                </div>
            )}

            {s.showNetAmount && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                    <div style={{ border: `2px solid ${gold}`, borderRadius: 8, padding: "10px 20px", textAlign: "right", minWidth: 200 }}>
                        <div style={{ fontSize: `${f - 1}px`, color: "#666", marginBottom: 2 }}>Net Amount Claimed</div>
                        <div style={{ fontSize: `${f + 6}px`, fontWeight: 700, color: "#1a1a2e" }}>AED {fmt(total)}</div>
                    </div>
                </div>
            )}

            <SignatureStrip s={s} slots={[
                s.showPreparedBySign && "Claimant",
                s.showCheckedBySign && "Verified By",
                s.showApprovedBySign && "Approved By",
                s.showCompanyStamp && "STAMP",
            ]} />
            <TermsFooter s={s} />
        </div>
    );
}

function ReceiptPaymentPreview({ s, mode }) {
    const f = s.fontSize;
    const gold = s.accentColor;
    const data = MOCK.receiptPayment;
    const isReceipt = mode === "receipt";

    return (
        <div style={{ fontFamily: s.fontFamily, fontSize: `${f}px`, background: "#fff", color: "#333", padding: "28px 32px" }}>
            <PaperHeader s={s} title={isReceipt ? "RECEIPT VOUCHER" : "PAYMENT VOUCHER"} meta={[
                ["showVoucherNumber", "Voucher No.", isReceipt ? "RV-2026-0088" : "PV-2026-0099"],
                ["showVoucherDate", "Date", "22-May-2026"],
                ["showReference", "Cheque Ref", data.chequeRef],
                ["showBranch", "Branch", "Dubai — Main"],
            ]} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
                <div>
                    <div style={{ fontSize: `${f - 1.5}px`, color: "#999", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px" }}>{isReceipt ? "Received From" : "Paid To"}</div>
                    <div style={{ fontWeight: 700, fontSize: `${f + 1}px`, color: "#1a1a2e" }}>{data.party}</div>
                    <div style={{ fontSize: `${f - 1}px`, color: "#666" }}>Code: {data.partyCode}</div>
                </div>
                <div>
                    <div style={{ fontSize: `${f - 1.5}px`, color: "#999", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px" }}>Payment Mode</div>
                    <div style={{ fontWeight: 600, color: "#1a1a2e" }}>{data.mode}</div>
                    <div style={{ fontSize: `${f - 1}px`, color: "#666" }}>Bank: {data.bank}</div>
                </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
                <thead>
                    <tr>
                        {["Invoice Ref.", "Date", "Invoice Total", isReceipt ? "Received" : "Paid"].map((h, i) => (
                            <th key={i} style={{ background: `${gold}18`, color: "#1a1a2e", padding: "5px 8px", fontWeight: 700, fontSize: `${f - 0.5}px`, textAlign: i < 2 ? "left" : "right" }}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.invoices.map((inv, i) => (
                        <tr key={i}>
                            <td style={{ padding: "5px 8px", fontSize: `${f}px`, borderBottom: "1px solid #f1f5f9", fontFamily: "monospace", fontWeight: 600, color: "#1e40af" }}>{inv.ref}</td>
                            <td style={{ padding: "5px 8px", fontSize: `${f}px`, borderBottom: "1px solid #f1f5f9", color: "#555" }}>{inv.date}</td>
                            <td style={{ padding: "5px 8px", fontSize: `${f}px`, borderBottom: "1px solid #f1f5f9", textAlign: "right", fontFamily: "monospace" }}>{fmt(inv.total)}</td>
                            <td style={{ padding: "5px 8px", fontSize: `${f}px`, borderBottom: "1px solid #f1f5f9", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: "#166534" }}>{fmt(inv.paid)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {s.showNarration && (
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 12px", marginBottom: 14, fontSize: `${f}px` }}>
                    <span style={{ fontWeight: 600, color: "#1a1a2e" }}>Narration: </span>
                    <span style={{ color: "#555" }}>{data.narration}</span>
                </div>
            )}

            {s.showAmountInWords && (
                <div style={{ marginBottom: 12, fontSize: `${f - 0.5}px`, color: "#666" }}>
                    <span style={{ fontWeight: 600 }}>Amount in Words: </span>Fifteen Thousand Dirhams Only
                </div>
            )}

            {s.showNetAmount && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                    <div style={{ border: `2px solid ${gold}`, borderRadius: 8, padding: "10px 20px", textAlign: "right", minWidth: 200 }}>
                        <div style={{ fontSize: `${f - 1}px`, color: "#666", marginBottom: 2 }}>Total {isReceipt ? "Received" : "Paid"}</div>
                        <div style={{ fontSize: `${f + 6}px`, fontWeight: 700, color: "#1a1a2e" }}>AED {fmt(data.amount)}</div>
                    </div>
                </div>
            )}

            <SignatureStrip s={s} slots={[
                s.showPreparedBySign && "Prepared By",
                s.showCheckedBySign && "Checked By",
                s.showApprovedBySign && "Approved By",
                s.showReceivedBySign && (isReceipt ? "Received By" : "Acknowledged By"),
            ]} />
            <TermsFooter s={s} />
        </div>
    );
}

function ContraPreview({ s }) {
    const f = s.fontSize;
    const gold = s.accentColor;
    const total = MOCK.contraEntries.reduce((sum, e) => sum + e.amount, 0);

    return (
        <div style={{ fontFamily: s.fontFamily, fontSize: `${f}px`, background: "#fff", color: "#333", padding: "28px 32px" }}>
            <PaperHeader s={s} title="CONTRA VOUCHER" meta={[
                ["showVoucherNumber", "Voucher No.", "CV-2026-0031"],
                ["showVoucherDate", "Date", "22-May-2026"],
                ["showBranch", "Branch", "Dubai — Main"],
            ]} />

            <div style={{ background: `${gold}12`, border: `1px solid ${gold}44`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 700, color: "#92400e", fontSize: `${f - 0.5}px`, textTransform: "uppercase", letterSpacing: "0.5px" }}>Transfer Type:</div>
                <div style={{ fontWeight: 600, color: "#1a1a2e" }}>Cash to Cash</div>
                <div style={{ marginLeft: "auto", fontWeight: 700, fontSize: `${f + 3}px`, color: "#1a1a2e" }}>AED {fmt(total)}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                {MOCK.contraEntries.map((entry, i) => (
                    <div key={i} style={{ border: `2px solid ${i === 0 ? "#166534" : "#991b1b"}22`, borderRadius: 8, padding: 12, background: i === 0 ? "#f0fdf4" : "#fff1f2" }}>
                        <div style={{ fontSize: `${f - 1.5}px`, fontWeight: 700, color: i === 0 ? "#166534" : "#991b1b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{entry.type === "Dr" ? "Debit (To)" : "Credit (From)"}</div>
                        <div style={{ fontWeight: 700, color: "#1a1a2e", fontSize: `${f}px`, marginBottom: 2 }}>{entry.account}</div>
                        <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: `${f + 3}px`, color: i === 0 ? "#166534" : "#991b1b" }}>AED {fmt(entry.amount)}</div>
                    </div>
                ))}
            </div>

            {s.showNarration && (
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 12px", marginBottom: 16, fontSize: `${f}px` }}>
                    <span style={{ fontWeight: 600, color: "#1a1a2e" }}>Narration: </span>
                    <span style={{ color: "#555" }}>Petty cash replenishment from main cash account for operational expenses.</span>
                </div>
            )}

            {s.showAmountInWords && (
                <div style={{ marginBottom: 16, fontSize: `${f - 0.5}px`, color: "#666" }}>
                    <span style={{ fontWeight: 600 }}>Amount in Words: </span>Two Thousand Dirhams Only
                </div>
            )}

            <SignatureStrip s={s} slots={[
                s.showPreparedBySign && "Prepared By",
                s.showCheckedBySign && "Checked By",
                s.showApprovedBySign && "Approved By",
                s.showCompanyStamp && "STAMP",
            ]} />
            <TermsFooter s={s} />
        </div>
    );
}

function ChequePreview({ s }) {
    const f = s.fontSize;
    const gold = s.accentColor;
    const chq = MOCK.cheque;

    return (
        <div style={{ fontFamily: s.fontFamily, fontSize: `${f}px`, background: "#fff", color: "#333", padding: "28px 32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                    {s.showCompanyName && <div style={{ fontWeight: 700, fontSize: `${f + 2}px`, color: "#1a1a2e" }}>{MOCK.company.name}</div>}
                    {s.showVoucherNumber && <div style={{ fontSize: `${f - 1}px`, color: "#666" }}>Cheque Voucher No: CHQ-PV-2026-0012</div>}
                    {s.showVoucherDate && <div style={{ fontSize: `${f - 1}px`, color: "#666" }}>Print Date: 22-May-2026</div>}
                </div>
                {s.showLogo && (
                    <div style={{ width: 56, height: 56, borderRadius: "50%", border: `2px solid ${gold}`, background: `${gold}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, color: gold }}>G</div>
                )}
            </div>

            <div style={{ height: 2, background: `linear-gradient(90deg, ${gold}, ${gold}44)`, marginBottom: 20, borderRadius: 1 }} />

            <div style={{ border: "2px solid #1e3a5f", borderRadius: 10, overflow: "hidden", background: "linear-gradient(135deg, #f0f7ff 0%, #e8f4fd 100%)", marginBottom: 16 }}>
                <div style={{ background: "#1e3a5f", padding: "8px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: `${f + 2}px` }}>{chq.bank}</div>
                    <div style={{ color: gold, fontSize: `${f - 1}px`, fontWeight: 600 }}>{chq.branch}</div>
                    <div style={{ color: "#aac8e8", fontSize: `${f - 1}px` }}>Acct: {chq.account}</div>
                </div>

                <div style={{ padding: "20px 28px" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                        <div style={{ border: "1px solid #1e3a5f", borderRadius: 4, padding: "3px 12px", fontSize: `${f - 0.5}px`, fontFamily: "monospace", fontWeight: 600, color: "#1e3a5f", background: "rgba(255,255,255,0.7)" }}>
                            Date: {chq.date}
                        </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14, borderBottom: "1px solid #1e3a5f55" }}>
                        <span style={{ fontWeight: 700, color: "#1e3a5f", whiteSpace: "nowrap", fontSize: `${f - 0.5}px` }}>PAY:</span>
                        <span style={{ fontWeight: 700, color: "#1a1a2e", fontSize: `${f + 1}px`, flex: 1, paddingBottom: 2 }}>{chq.payee}</span>
                        <div style={{ border: "1px solid #1e3a5f", borderRadius: 4, padding: "2px 10px", background: "rgba(255,255,255,0.7)", fontFamily: "monospace", fontWeight: 700, color: "#1e3a5f", fontSize: `${f}px`, whiteSpace: "nowrap" }}>
                            AED {fmt(chq.amount)}
                        </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 20, borderBottom: "1px solid #1e3a5f55" }}>
                        <span style={{ fontWeight: 700, color: "#1e3a5f", whiteSpace: "nowrap", fontSize: `${f - 0.5}px` }}>THE SUM OF:</span>
                        <span style={{ color: "#1a1a2e", fontStyle: "italic", flex: 1, paddingBottom: 2 }}>{chq.amountWords}</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                        <div style={{ fontFamily: "monospace", fontSize: `${f + 2}px`, color: "#1e3a5f", letterSpacing: 3, opacity: 0.7 }}>⑆ 1012 ⑆ 345678 ⑆ 001 ⑈</div>
                        <div style={{ textAlign: "center", minWidth: 160 }}>
                            <div style={{ borderBottom: "1.5px solid #1e3a5f", height: 36, marginBottom: 4 }} />
                            <div style={{ fontSize: `${f - 1.5}px`, color: "#666" }}>Authorized Signature</div>
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ border: "1px dashed #94a3b8", borderRadius: 6, padding: "10px 16px", background: "#fafafa", marginBottom: 16 }}>
                <div style={{ fontSize: `${f - 1}px`, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Cheque Stub</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "4px 16px" }}>
                    {[
                        ["Payee", chq.payee],
                        ["Amount", `AED ${chq.amount.toLocaleString()}`],
                        ["Date", chq.date],
                        ["Bank", chq.bank],
                    ].map(([k, v]) => (
                        <div key={k}><div style={{ fontSize: `${f - 1.5}px`, color: "#999" }}>{k}</div><div style={{ fontSize: `${f - 0.5}px`, fontWeight: 600, color: "#1a1a2e" }}>{v}</div></div>
                    ))}
                </div>
            </div>

            <SignatureStrip s={s} slots={[
                s.showPreparedBySign && "Prepared By",
                s.showApprovedBySign && "Approved By",
                s.showReceivedBySign && "Received By",
            ]} />
        </div>
    );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function SettingsPanel({ s, onChange }) {
    const [activeTab, setActiveTab] = useState("design");
    const set = (patch) => onChange({ ...s, ...patch });
    const isCheque = s.voucherType === "cheque-printing";

    const tabs = [
        { id: "design",     label: "Design",     Icon: Palette },
        { id: "content",    label: "Content",    Icon: AlignLeft },
        { id: "signatures", label: "Signatures", Icon: Layout },
        { id: "email",      label: "Email",      Icon: Mail },
    ];

    return (
        <div className="w-80 bg-white border-r flex flex-col overflow-hidden">
            <div className="border-b flex">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 px-2 py-3 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${activeTab === tab.id ? "border-b-2 border-[#F5C742] text-gray-900" : "text-gray-500 hover:text-gray-800"}`}
                    >
                        <tab.Icon className="w-3.5 h-3.5" />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {activeTab === "design" && (
                    <>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Template Name</label>
                            <input
                                type="text"
                                value={s.templateName}
                                onChange={e => set({ templateName: e.target.value })}
                                className="w-full text-sm border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#F5C742]"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Accent Color</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={s.accentColor} onChange={e => set({ accentColor: e.target.value })} className="w-10 h-8 rounded border cursor-pointer" />
                                <input type="text" value={s.accentColor} onChange={e => set({ accentColor: e.target.value })} className="flex-1 text-xs border rounded-md px-2 py-1.5 font-mono" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Font Family</label>
                            <select value={s.fontFamily} onChange={e => set({ fontFamily: e.target.value })} className="w-full text-sm border rounded-md px-2.5 py-1.5">
                                {["Inter, sans-serif", "Arial, sans-serif", "Georgia, serif", "Times New Roman, serif", "Helvetica, sans-serif"].map(f => (
                                    <option key={f} value={f}>{f.split(",")[0]}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Font Size: {s.fontSize}px</label>
                            <input type="range" min={8} max={14} value={s.fontSize} onChange={e => set({ fontSize: +e.target.value })} className="w-full" />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Paper Size</label>
                            <select value={s.paperSize} onChange={e => set({ paperSize: e.target.value })} className="w-full text-sm border rounded-md px-2.5 py-1.5">
                                <option value="A4">A4 (210 × 297 mm)</option>
                                <option value="A5">A5 (148 × 210 mm)</option>
                                <option value="Letter">Letter (8.5 × 11 in)</option>
                            </select>
                        </div>

                        <Section title="Company Block">
                            <Row label="Show Logo" checked={s.showLogo} onChange={v => set({ showLogo: v })} />
                            <Row label="Company Name" checked={s.showCompanyName} onChange={v => set({ showCompanyName: v })} />
                            <Row label="Address" checked={s.showCompanyAddress} onChange={v => set({ showCompanyAddress: v })} />
                            <Row label="Phone" checked={s.showCompanyPhone} onChange={v => set({ showCompanyPhone: v })} />
                            <Row label="Email" checked={s.showCompanyEmail} onChange={v => set({ showCompanyEmail: v })} />
                            <Row label="TRN" checked={s.showTRN} onChange={v => set({ showTRN: v })} />
                        </Section>

                        <Section title="Voucher Header">
                            <Row label="Voucher Number" checked={s.showVoucherNumber} onChange={v => set({ showVoucherNumber: v })} />
                            <Row label="Date" checked={s.showVoucherDate} onChange={v => set({ showVoucherDate: v })} />
                            <Row label="Reference" checked={s.showReference} onChange={v => set({ showReference: v })} />
                            <Row label="Branch" checked={s.showBranch} onChange={v => set({ showBranch: v })} />
                            <Row label="Currency" checked={s.showCurrency} onChange={v => set({ showCurrency: v })} />
                            <Row label="Prepared By" checked={s.showPreparedBy} onChange={v => set({ showPreparedBy: v })} />
                        </Section>
                    </>
                )}

                {activeTab === "content" && (
                    <>
                        <Section title="Entry Details">
                            {!isCheque && <Row label="Account Code" checked={s.showAccountCode} onChange={v => set({ showAccountCode: v })} />}
                            {!isCheque && <Row label="Narration" checked={s.showNarration} onChange={v => set({ showNarration: v })} />}
                            <Row label="Amount in Words" checked={s.showAmountInWords} onChange={v => set({ showAmountInWords: v })} />
                            {!isCheque && <Row label="Cost Center" checked={s.showCostCenter} onChange={v => set({ showCostCenter: v })} />}
                            {!isCheque && <Row label="Project Code" checked={s.showProjectCode} onChange={v => set({ showProjectCode: v })} />}
                        </Section>

                        <Section title="Totals">
                            {!isCheque && <Row label="Total Debit" checked={s.showTotalDebit} onChange={v => set({ showTotalDebit: v })} />}
                            {!isCheque && <Row label="Total Credit" checked={s.showTotalCredit} onChange={v => set({ showTotalCredit: v })} />}
                            <Row label="Net Amount Box" checked={s.showNetAmount} onChange={v => set({ showNetAmount: v })} />
                        </Section>

                        {!isCheque && (
                            <Section title="Footer">
                                <Row label="Terms Text" checked={s.showTerms} onChange={v => set({ showTerms: v })} />
                                <Row label="Company Stamp" checked={s.showCompanyStamp} onChange={v => set({ showCompanyStamp: v })} />
                                <Row label="Page Numbers" checked={s.showPageNumbers} onChange={v => set({ showPageNumbers: v })} />
                                {s.showTerms && (
                                    <div className="pt-2">
                                        <textarea
                                            value={s.termsText}
                                            onChange={e => set({ termsText: e.target.value })}
                                            rows={3}
                                            className="w-full text-xs border rounded-md px-2.5 py-1.5 resize-none"
                                        />
                                    </div>
                                )}
                            </Section>
                        )}
                    </>
                )}

                {activeTab === "signatures" && (
                    <Section title="Signature Strip">
                        <Row label="Prepared By" checked={s.showPreparedBySign} onChange={v => set({ showPreparedBySign: v })} />
                        <Row label="Checked By" checked={s.showCheckedBySign} onChange={v => set({ showCheckedBySign: v })} />
                        <Row label="Approved By" checked={s.showApprovedBySign} onChange={v => set({ showApprovedBySign: v })} />
                        <Row label="Received By" checked={s.showReceivedBySign} onChange={v => set({ showReceivedBySign: v })} />
                        <Row label="Company Stamp" checked={s.showCompanyStamp} onChange={v => set({ showCompanyStamp: v })} />
                    </Section>
                )}

                {activeTab === "email" && (
                    <>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Email Subject</label>
                            <input
                                type="text"
                                value={s.emailSubject}
                                onChange={e => set({ emailSubject: e.target.value })}
                                className="w-full text-sm border rounded-md px-2.5 py-1.5"
                            />
                            <p className="text-xs text-gray-400 mt-1">Use {"{number}"}, {"{company_name}"}, {"{recipient}"}</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Email Body</label>
                            <textarea
                                value={s.emailBody}
                                onChange={e => set({ emailBody: e.target.value })}
                                rows={8}
                                className="w-full text-sm border rounded-md px-2.5 py-1.5 resize-none"
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FinancialVoucherDesigner({ voucherType, templateName, initialSettings, onClose, onSave }) {
    const [settings, setSettings] = useState(() => ({
        ...defaultVoucherSettings(voucherType),
        templateName,
        ...(initialSettings || {}),
    }));
    const [zoom, setZoom] = useState(90);

    const label = voucherTypeLabel(voucherType);

    function renderPreview() {
        switch (voucherType) {
            case "journal-voucher": return <JournalPreview s={settings} />;
            case "expense-voucher": return <ExpensePreview s={settings} />;
            case "receipt-voucher": return <ReceiptPaymentPreview s={settings} mode="receipt" />;
            case "payment-voucher": return <ReceiptPaymentPreview s={settings} mode="payment" />;
            case "contra-voucher":  return <ContraPreview s={settings} />;
            case "cheque-printing": return <ChequePreview s={settings} />;
            default: return null;
        }
    }

    return (
        <div className="h-screen flex flex-col bg-gray-50">
            <div className="bg-white border-b px-6 py-3 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-semibold text-gray-900">{settings.templateName}</h2>
                            <span className="text-[10px] uppercase tracking-wide border border-gray-200 rounded px-1.5 py-0.5 text-gray-600">{label}</span>
                        </div>
                        <p className="text-xs text-gray-500">Financial Voucher Template Designer</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-3 py-1.5">
                        <button onClick={() => setZoom(z => Math.max(50, z - 10))} className="text-gray-600 hover:text-gray-900 w-5 h-5 flex items-center justify-center text-base font-bold">−</button>
                        <span className="text-xs font-medium text-gray-700 w-10 text-center">{zoom}%</span>
                        <button onClick={() => setZoom(z => Math.min(150, z + 10))} className="text-gray-600 hover:text-gray-900 w-5 h-5 flex items-center justify-center text-base font-bold">+</button>
                    </div>
                    <button
                        onClick={() => onSave(settings)}
                        className="inline-flex items-center bg-[#F5C742] hover:bg-[#e5b732] text-gray-900 font-semibold text-sm rounded-md px-3 py-1.5"
                    >
                        <Save className="w-4 h-4 mr-1.5" />
                        Save Template
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                <SettingsPanel s={settings} onChange={setSettings} />

                <div className="flex-1 bg-gray-100 overflow-auto p-8">
                    <div className="flex items-start justify-center min-h-full">
                        <div
                            className="bg-white shadow-2xl rounded"
                            style={{
                                width: settings.paperSize === "A5" ? 595 : 794,
                                transform: `scale(${zoom / 100})`,
                                transformOrigin: "top center",
                                marginBottom: `${(zoom / 100 - 1) * (settings.paperSize === "A5" ? 420 : 560)}px`,
                            }}
                        >
                            {renderPreview()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
