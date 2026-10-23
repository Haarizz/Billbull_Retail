import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Plus, Search, Printer, CheckCircle2, XCircle, Eye, Edit3, RotateCcw, FileText, Landmark,
    Clock, ArrowLeft, Check, X, BookOpen, AlertTriangle, AlertCircle, Layers, Send, Trash2,
    ShieldCheck, RefreshCw,
} from "lucide-react";
import toast from "react-hot-toast";
import { usePermissions } from "@billbull/shared/context/PermissionContext";
import { getBankAccounts } from "@billbull/shared/api/ledgerApi";
import { getTemplatesByCategory } from "@billbull/shared/api/printTemplateApi";
import { printHtml } from "@billbull/shared/utils/printGenerator";
import { formatDisplayDate } from "@billbull/shared/utils/dateUtils";
import {
    getChequeBooks, saveChequeBook, deleteChequeBook, getPendingChequePayments,
    getPayCheques, getPayCheque, createPayCheque, updatePayCheque, payChequeAction,
} from "../../api/payChequeApi";
import { formatAmountInWords } from "../../utils/amountInWords";
import { buildChequePrintHtml, chequeSettingsFromTemplate, formatChequeDate } from "../../utils/chequePrint";

// Financials → Pay Cheques.
//
// A cheque is built from payments that are already booked as "Cheque":
//   • Vendor / Purchase — payment vouchers from Vendors & Purchases → Payments → Pay Invoices
//     with method Cheque. Allotting AED 2,500 of a vendor's AED 5,000 balance there makes the
//     vendor's cheque due here exactly AED 2,500.
//   • Expense — expenses entered with payment mode Cheque and marked Paid.
// Flow: Draft → Approved → Printed → Issued → Paid → Reconciled. The ledger was posted by the
// payment itself, so nothing here posts to the GL; cancelling a cheque returns its payments to
// the due list for a replacement cheque.

const VOUCHER_MODULE = "finance.voucher";
const RECONCILE_MODULE = "finance.reconcile";

const STATUS_CFG = {
    DRAFT:      { label: "Draft",      cls: "bg-slate-100 text-slate-600" },
    APPROVED:   { label: "Approved",   cls: "bg-blue-50 text-blue-600" },
    PRINTED:    { label: "Printed",    cls: "bg-amber-50 text-amber-600" },
    ISSUED:     { label: "Issued",     cls: "bg-violet-50 text-violet-600" },
    PAID:       { label: "Paid",       cls: "bg-teal-50 text-teal-700" },
    RECONCILED: { label: "Reconciled", cls: "bg-green-50 text-green-600" },
    CANCELLED:  { label: "Cancelled",  cls: "bg-red-50 text-red-500" },
};
const FLOW = ["DRAFT", "APPROVED", "PRINTED", "ISSUED", "PAID", "RECONCILED"];
const OPEN = ["DRAFT", "APPROVED", "PRINTED", "ISSUED"];
const TYPE_CFG = {
    VENDOR:  { label: "Vendor / Purchase", cls: "bg-teal-50 text-teal-700" },
    EXPENSE: { label: "Expense",           cls: "bg-orange-50 text-orange-600" },
};

const today = () => new Date().toISOString().slice(0, 10);
const money = (n, currency = "AED") =>
    `${currency} ${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const apiError = (err, fallback) =>
    err?.response?.data?.message || err?.response?.data?.error || err?.message || fallback;
const fmtDateTime = (v) => (v ? String(v).replace("T", " ").slice(0, 16) : "—");

// ─── Atoms ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
    const cfg = STATUS_CFG[status] || STATUS_CFG.DRAFT;
    return <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${cfg.cls}`}>{cfg.label}</span>;
}

function TypeBadge({ type }) {
    const cfg = TYPE_CFG[type] || TYPE_CFG.VENDOR;
    return <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${cfg.cls}`}>{cfg.label}</span>;
}

function SectionHead({ title, children }) {
    return (
        <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{title}</p>
            {children}
        </div>
    );
}

function Label({ children, required }) {
    return (
        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-slate-500">
            {children}{required && <span className="text-red-500"> *</span>}
        </label>
    );
}

const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-[#F5C742] bg-white";

function Modal({ title, icon: Icon = FileText, width = 520, onClose, children, footer }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl flex flex-col max-h-[92vh] w-full" style={{ maxWidth: width }}>
                <div className="px-5 py-4 flex items-center justify-between rounded-t-2xl bg-slate-800 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#F5C742]/20">
                            <Icon className="h-4 w-4 text-[#F5C742]" />
                        </div>
                        <p className="text-sm font-bold text-white">{title}</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10"><X className="h-4 w-4 text-white" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-5">{children}</div>
                {footer && <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex gap-2 justify-end shrink-0">{footer}</div>}
            </div>
        </div>
    );
}

function Btn({ onClick, children, variant = "outline", disabled, icon: Icon, title }) {
    const styles = {
        primary: "bg-[#F5C742] hover:bg-[#E5B732] text-slate-900",
        teal: "bg-teal-700 hover:bg-teal-800 text-white",
        danger: "border border-red-200 text-red-600 hover:bg-red-50",
        outline: "border border-slate-200 text-slate-600 hover:bg-slate-100",
    };
    return (
        <button type="button" onClick={onClick} disabled={disabled} title={title}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]}`}>
            {Icon && <Icon className="h-3.5 w-3.5" />}{children}
        </button>
    );
}

// ─── Cheque preview (on-screen look of the leaf, not the print layout) ──────

function ChequePreview({ cheque }) {
    const book = cheque.chequeBook || {};
    const currency = book.currency || "AED";
    return (
        <div className="relative rounded-2xl overflow-hidden border-2 border-slate-200 shadow bg-[#FFFEF5]">
            <div className="px-5 py-3 flex items-center justify-between bg-slate-800">
                <div>
                    <p className="text-xs font-bold text-white">{book.bankName || "Bank"}</p>
                    <p className="text-[10px] text-white/50">{book.bankBranch || ""}</p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-white/50">A/C No.</p>
                    <p className="text-xs tabular-nums font-bold text-white">{book.accountNumber || "—"}</p>
                </div>
            </div>
            <div className="px-5 py-4">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <p className="text-[9px] uppercase tracking-widest text-slate-500">Cheque No.</p>
                        <p className="tabular-nums font-bold text-base text-slate-800">{cheque.chequeNumber || "—"}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[9px] uppercase tracking-widest text-slate-500">Date</p>
                        <p className="font-semibold text-sm text-slate-800 border-b-2 border-dashed border-slate-700 px-3 py-1 min-w-[120px]">
                            {formatChequeDate(cheque.chequeDate)}
                        </p>
                    </div>
                </div>
                <div className="flex items-end gap-2 mb-3">
                    <span className="text-xs font-semibold shrink-0 text-slate-500">Pay</span>
                    <div className="flex-1 border-b-2 border-dashed border-slate-700 pb-0.5">
                        <p className="font-bold text-sm px-1 text-slate-800">{cheque.payeeName || "—"}</p>
                    </div>
                </div>
                <div className="flex items-end gap-2 mb-4">
                    <div className="flex-1 border-b-2 border-dashed border-slate-700 pb-0.5">
                        <p className="text-xs px-1 italic text-slate-800">
                            {Number(cheque.amount) > 0 ? formatAmountInWords(cheque.amount, currency) : "—"}
                        </p>
                    </div>
                    <div className="border-2 border-slate-700 rounded-lg px-3 py-1.5 text-right shrink-0 bg-white min-w-[140px]">
                        <p className="text-[9px] uppercase text-slate-500">{currency}</p>
                        <p className="font-bold text-lg tabular-nums text-slate-800">
                            {(Number(cheque.amount) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </div>
                </div>
                <div className="flex justify-between items-end">
                    <div>
                        <p className="text-[9px] text-slate-500">{book.accountName || ""}</p>
                        {book.iban && <p className="text-[9px] tabular-nums text-slate-500">IBAN: {book.iban}</p>}
                    </div>
                    <div className="border-b-2 border-dashed border-slate-700 w-40 text-center pb-0.5">
                        <p className="text-[9px] text-slate-500">Authorised Signatory</p>
                    </div>
                </div>
            </div>
            {cheque.status === "CANCELLED" && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-6xl font-black -rotate-[25deg] opacity-20 tracking-widest text-red-500">CANCELLED</p>
                </div>
            )}
        </div>
    );
}

function ChequeTimeline({ status }) {
    if (status === "CANCELLED") {
        return (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 w-fit">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <p className="text-xs font-bold text-red-500">Cancelled</p>
            </div>
        );
    }
    const idx = FLOW.indexOf(status);
    return (
        <div className="flex items-center overflow-x-auto">
            {FLOW.map((s, i) => {
                const done = i < idx || (i === idx && s === "RECONCILED");
                const active = i === idx && !done;
                return (
                    <div key={s} className="flex items-center shrink-0">
                        <div className="flex flex-col items-center gap-1">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${done ? "bg-teal-700 text-white" : active ? "bg-[#F5C742] text-white" : "bg-slate-200 text-slate-500"}`}>
                                {done ? <Check className="h-3 w-3" /> : i + 1}
                            </div>
                            <span className={`text-[9px] font-semibold whitespace-nowrap ${active ? "text-amber-500" : done ? "text-teal-700" : "text-slate-400"}`}>
                                {STATUS_CFG[s].label}
                            </span>
                        </div>
                        {i < FLOW.length - 1 && <div className={`w-8 h-0.5 mb-4 mx-0.5 ${i < idx ? "bg-teal-700" : "bg-slate-200"}`} />}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Create / edit cheque ───────────────────────────────────────────────────

function ChequeFormModal({ existing, books, onClose, onSaved }) {
    const isEdit = !!existing;
    const [type, setType] = useState(existing?.paymentType || "VENDOR");
    const [pending, setPending] = useState([]);
    const [loadingPending, setLoadingPending] = useState(false);
    const [payeeKey, setPayeeKey] = useState("");
    const [selected, setSelected] = useState({});
    const [bookId, setBookId] = useState(existing?.chequeBook?.id ? String(existing.chequeBook.id) : "");
    const [chequeNumber, setChequeNumber] = useState(existing?.chequeNumber || "");
    const [chequeDate, setChequeDate] = useState(existing?.chequeDate || today());
    const [payeeName, setPayeeName] = useState(existing?.payeeName || "");
    const [memo, setMemo] = useState(existing?.memo || "");
    const [step, setStep] = useState("form");
    const [errors, setErrors] = useState([]);
    const [saving, setSaving] = useState(false);

    const rowKey = (r) => `${r.sourceType}:${r.sourceId}`;

    // A draft's own payments are not "pending" any more, so merge them back in as rows.
    const existingRows = useMemo(() => (existing?.allocations || []).filter(a => a.active).map(a => ({
        sourceType: a.sourceType, sourceId: a.sourceId, sourceNumber: a.sourceNumber,
        reference: a.reference, amount: a.amount, payeeKey: "__existing__",
        payeeName: existing.payeeName, vendorId: existing.vendorId, date: null, chequeDate: existing.chequeDate,
        bankCode: existing.chequeBook?.glAccountCode, bankLabel: null, onThisCheque: true, postsGl: a.postsGl,
    })), [existing]);

    const loadPending = useCallback(async (t) => {
        setLoadingPending(true);
        try {
            setPending(await getPendingChequePayments(t));
        } catch (err) {
            toast.error(apiError(err, "Failed to load cheque due"));
            setPending([]);
        } finally {
            setLoadingPending(false);
        }
    }, []);

    useEffect(() => { loadPending(type); }, [type, loadPending]);

    // Edit mode: select the draft's own rows and pick the payee group they belong to.
    useEffect(() => {
        if (!isEdit) return;
        setSelected(Object.fromEntries(existingRows.map(r => [rowKey(r), true])));
        setPayeeKey("__existing__");
    }, [isEdit, existingRows]);

    const payees = useMemo(() => {
        const map = new Map();
        for (const r of pending) {
            const g = map.get(r.payeeKey) || { key: r.payeeKey, name: r.payeeName || "(No payee)", total: 0, count: 0, rows: [] };
            g.total += Number(r.amount) || 0;
            g.count += 1;
            g.rows.push(r);
            map.set(r.payeeKey, g);
        }
        return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    }, [pending]);

    const rows = useMemo(() => {
        if (payeeKey === "__existing__") {
            // The draft's rows plus anything still pending for the same vendor / payee.
            const sameVendor = (r) => existing?.vendorId
                ? (r.vendorId || "").toLowerCase() === existing.vendorId.toLowerCase()
                : (r.payeeName || "").trim().toLowerCase() === (existing?.payeeName || "").trim().toLowerCase();
            return [...existingRows, ...pending.filter(sameVendor)];
        }
        return payees.find(p => p.key === payeeKey)?.rows || [];
    }, [payeeKey, payees, pending, existingRows, existing]);

    const chosen = rows.filter(r => selected[rowKey(r)]);
    const amount = chosen.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const book = books.find(b => String(b.id) === String(bookId));
    const currency = book?.currency || "AED";

    const choosePayee = (key) => {
        setPayeeKey(key);
        const group = payees.find(p => p.key === key);
        const groupRows = group?.rows || [];
        setSelected(Object.fromEntries(groupRows.map(r => [rowKey(r), true])));
        if (group) setPayeeName(group.name === "(No payee)" ? "" : group.name);
        // Prefill from Pay Invoices: the cheque date entered there and the bank it was paid from.
        const first = groupRows[0];
        if (first?.chequeDate) setChequeDate(first.chequeDate);
        const matching = first?.bankCode && books.find(b => b.glAccountCode === first.bankCode);
        if (matching) chooseBook(String(matching.id));
    };

    const chooseBook = (id) => {
        setBookId(id);
        const b = books.find(x => String(x.id) === String(id));
        if (!isEdit || String(existing?.chequeBook?.id) !== String(id)) setChequeNumber(b?.nextChequeNumber || "");
        else setChequeNumber(existing.chequeNumber);
    };

    const bankMismatch = book?.glAccountCode
        ? chosen.find(r => r.bankCode && r.bankCode !== book.glAccountCode)
        : null;

    const validate = () => {
        const e = [];
        if (!payeeKey) e.push(type === "VENDOR" ? "Select a vendor." : "Select a payee.");
        if (!chosen.length) e.push("Select at least one payment.");
        if (!bookId) e.push("Select the bank account to draw the cheque on.");
        if (!payeeName.trim()) e.push("Payee name is required.");
        if (!chequeDate) e.push("Cheque date is required.");
        if (amount <= 0) e.push("Cheque amount must be greater than zero.");
        if (bankMismatch) e.push(`${bankMismatch.sourceNumber} was paid from ledger ${bankMismatch.bankCode}; choose that bank account.`);
        return e;
    };

    const save = async () => {
        const e = validate();
        if (e.length) { setErrors(e); setStep("form"); return; }
        setErrors([]);
        setSaving(true);
        const payload = {
            paymentType: type,
            chequeBookId: Number(bookId),
            chequeNumber: chequeNumber.trim() || null,
            chequeDate,
            payeeName: payeeName.trim(),
            memo: memo.trim() || null,
            sources: chosen.map(r => ({ sourceType: r.sourceType, sourceId: r.sourceId })),
        };
        try {
            const saved = isEdit ? await updatePayCheque(existing.id, payload) : await createPayCheque(payload);
            toast.success(isEdit ? `Cheque ${saved.chequeNumber} updated` : `Draft cheque ${saved.chequeNumber} saved`);
            onSaved(saved);
        } catch (err) {
            toast.error(apiError(err, "Failed to save cheque"));
        } finally {
            setSaving(false);
        }
    };

    const preview = { chequeNumber, chequeDate, payeeName, amount, chequeBook: book };

    return (
        <Modal title={isEdit ? `Edit Cheque ${existing.chequeNumber}` : step === "form" ? "Create Cheque" : "Cheque Preview"}
            width={940} onClose={onClose}
            footer={<>
                <div className="mr-auto"><Btn onClick={onClose} icon={X}>Cancel</Btn></div>
                {step === "preview" && <Btn onClick={() => setStep("form")} icon={ArrowLeft}>Back</Btn>}
                {step === "form" && <Btn onClick={() => { const e = validate(); setErrors(e); if (!e.length) setStep("preview"); }} icon={Eye}>Preview</Btn>}
                <Btn variant="primary" onClick={save} disabled={saving} icon={FileText}>{saving ? "Saving…" : isEdit ? "Save Changes" : "Save Draft"}</Btn>
            </>}>
            {step === "preview" ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <ChequePreview cheque={preview} />
                    <div className="space-y-3">
                        <div className="rounded-2xl border border-slate-200 p-4 text-xs space-y-1.5">
                            <SectionHead title="Cheque Summary" />
                            {[["Bank", book?.bankName], ["Ledger", book ? `${book.glAccountCode || ""} ${book.glAccountName || ""}` : ""],
                              ["Cheque No.", chequeNumber], ["Date", formatDisplayDate(chequeDate)], ["Payee", payeeName],
                              ["Amount", money(amount, currency)], ["Type", TYPE_CFG[type].label],
                              ["Payments", chosen.map(r => r.sourceNumber).join(", ")]].map(([l, v]) => (
                                <div key={l} className="flex justify-between gap-4"><span className="text-slate-500">{l}</span><span className="font-semibold text-slate-800 text-right">{v || "—"}</span></div>
                            ))}
                        </div>
                        <div className="rounded-xl p-3 text-xs bg-amber-50 text-amber-700 flex gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            The cheque is saved as a Draft. It must be approved before it can be printed.
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 p-4">
                            <SectionHead title="Payment Type" />
                            <div className="flex gap-2">
                                {Object.entries(TYPE_CFG).map(([t, cfg]) => (
                                    <button key={t} type="button" disabled={isEdit}
                                        onClick={() => { setType(t); setPayeeKey(""); setSelected({}); setPayeeName(""); }}
                                        className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all disabled:cursor-not-allowed ${type === t ? "border-teal-700 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-500"}`}>
                                        {cfg.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                            <SectionHead title={type === "VENDOR" ? "Vendor & Cheque Due" : "Payee & Cheque Due"}>
                                <button onClick={() => loadPending(type)} className="text-slate-400 hover:text-slate-700" title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></button>
                            </SectionHead>
                            {!isEdit && (
                                <div>
                                    <Label required>{type === "VENDOR" ? "Vendor" : "Payee"}</Label>
                                    <select value={payeeKey} onChange={e => choosePayee(e.target.value)} className={inputCls}>
                                        <option value="">{loadingPending ? "Loading…" : payees.length ? "— Select —" : "No cheque payments due"}</option>
                                        {payees.map(p => (
                                            <option key={p.key} value={p.key}>{p.name} — {money(p.total)} due ({p.count})</option>
                                        ))}
                                    </select>
                                    {!loadingPending && !payees.length && (
                                        <p className="text-[11px] text-slate-500 mt-1.5">
                                            {type === "VENDOR"
                                                ? "Allot vendor payments by Cheque in Vendors & Purchases → Payments → Pay Invoices first."
                                                : "Record expenses with payment mode Cheque and mark them Paid first."}
                                        </p>
                                    )}
                                </div>
                            )}
                            {rows.length > 0 && (
                                <div className="border border-slate-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-500">
                                            <tr>
                                                <th className="px-2 py-2 w-8"></th>
                                                <th className="px-2 py-2 text-left">{type === "VENDOR" ? "Voucher" : "Expense"}</th>
                                                <th className="px-2 py-2 text-left">{type === "VENDOR" ? "Invoice" : "Details"}</th>
                                                <th className="px-2 py-2 text-right">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map(r => (
                                                <tr key={rowKey(r)} className="border-t border-slate-100">
                                                    <td className="px-2 py-2 text-center">
                                                        <input type="checkbox" checked={!!selected[rowKey(r)]}
                                                            onChange={e => setSelected(s => ({ ...s, [rowKey(r)]: e.target.checked }))} />
                                                    </td>
                                                    <td className="px-2 py-2 tabular-nums">
                                                        {r.sourceNumber}
                                                        {r.date && <div className="text-[10px] text-slate-400 font-sans">{formatDisplayDate(r.date)}</div>}
                                                        {r.postsGl === false && <div className="text-[9px] font-sans font-bold text-slate-400 uppercase">already posted</div>}
                                                    </td>
                                                    <td className="px-2 py-2 text-slate-600">
                                                        {r.reference || "—"}
                                                        {r.bankLabel && <div className="text-[10px] text-slate-400">{r.bankLabel}</div>}
                                                    </td>
                                                    <td className="px-2 py-2 text-right tabular-nums font-bold">{money(r.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                            <SectionHead title="Bank & Cheque" />
                            <div>
                                <Label required>Bank Account</Label>
                                <select value={bookId} onChange={e => chooseBook(e.target.value)} className={inputCls}>
                                    <option value="">{books.length ? "— Select bank account —" : "No bank accounts set up"}</option>
                                    {books.map(b => (
                                        <option key={b.id} value={b.id}>{b.bankName} — {b.accountNumber || b.glAccountName} ({b.glAccountCode})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label>Cheque No.</Label>
                                    <input value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="Next in book" />
                                </div>
                                <div>
                                    <Label required>Cheque Date</Label>
                                    <input type="date" value={chequeDate} onChange={e => setChequeDate(e.target.value)} className={inputCls} />
                                </div>
                            </div>
                            <div>
                                <Label required>Payee Name (as printed)</Label>
                                <input value={payeeName} onChange={e => setPayeeName(e.target.value)} className={inputCls} placeholder="Name on cheque" />
                            </div>
                            <div>
                                <Label>Memo</Label>
                                <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2} className={`${inputCls} resize-none`}
                                    placeholder="Defaults to “Payment against …” the invoices" />
                            </div>
                        </div>

                        <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 text-xs space-y-1.5">
                            <SectionHead title="Cheque Amount" />
                            <p className="text-2xl font-black text-teal-700">{money(amount, currency)}</p>
                            {amount > 0 && <p className="italic text-slate-500">{formatAmountInWords(amount, currency)}</p>}
                            <p className="text-[10px] pt-1.5 border-t border-teal-200 text-slate-500">
                                {type === "VENDOR"
                                    ? "Nothing posts while the cheque is a draft. Issued: Dr Accounts Payable / Cr 2150 AP – Post-Dated Cheques. Paid: Dr 2150 / Cr the bank."
                                    : "The expense already posted Dr Expense / Cr 2150 AP – Post-Dated Cheques. Paid: Dr 2150 / Cr the bank."}
                                {chosen.some(r => r.postsGl === false) && " Payments marked “already posted” credited the bank when they were booked, so the cheque posts nothing for them."}
                            </p>
                        </div>

                        {(errors.length > 0 || bankMismatch) && (
                            <div className="rounded-xl p-3 bg-red-50 space-y-1">
                                {(errors.length ? errors : [`${bankMismatch.sourceNumber} was paid from ledger ${bankMismatch.bankCode}; choose that bank account.`]).map(e => (
                                    <div key={e} className="flex items-center gap-1.5 text-xs text-red-500"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{e}</div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Modal>
    );
}

// ─── Status action dialog (issue / paid / reconcile / cancel) ───────────────

const ACTION_CFG = {
    issue:     { title: "Issue Cheque",        verb: "Mark as Issued",  icon: Send,         variant: "primary", date: false, noteLabel: "Handed over to / remark" },
    paid:      { title: "Mark Cheque as Paid", verb: "Confirm Paid",    icon: CheckCircle2, variant: "teal",    date: "Paid date", noteLabel: "Remark" },
    reconcile: { title: "Reconcile Cheque",    verb: "Confirm Cleared", icon: BookOpen,     variant: "teal",    date: "Cleared in bank on", noteLabel: "Statement reference" },
    cancel:    { title: "Cancel Cheque",       verb: "Cancel Cheque",   icon: XCircle,      variant: "danger",  date: false, noteLabel: "Reason" },
};

function ActionDialog({ action, cheque, onClose, onDone }) {
    const cfg = ACTION_CFG[action];
    const [date, setDate] = useState(today());
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const needsReason = action === "cancel" && ["PRINTED", "ISSUED"].includes(cheque.status);

    const submit = async () => {
        if (needsReason && !note.trim()) { toast.error("Give a reason for cancelling a printed or issued cheque."); return; }
        setBusy(true);
        try {
            const updated = await payChequeAction(cheque.id, action, { date: cfg.date ? date : null, note: note.trim() || null });
            toast.success(`Cheque ${updated.chequeNumber}: ${STATUS_CFG[updated.status]?.label}`);
            onDone(updated);
        } catch (err) {
            toast.error(apiError(err, "Action failed"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal title={cfg.title} icon={cfg.icon} width={460} onClose={onClose}
            footer={<>
                <Btn onClick={onClose}>Close</Btn>
                <Btn variant={cfg.variant} onClick={submit} disabled={busy} icon={cfg.icon}>{busy ? "Working…" : cfg.verb}</Btn>
            </>}>
            <div className="space-y-3">
                <div className="rounded-xl p-3 grid grid-cols-2 gap-2 text-xs bg-slate-50">
                    {[["Cheque No.", cheque.chequeNumber], ["Bank", cheque.chequeBook?.bankName], ["Payee", cheque.payeeName],
                      ["Amount", money(cheque.amount, cheque.chequeBook?.currency)]].map(([l, v]) => (
                        <div key={l}><p className="text-slate-500">{l}</p><p className="font-bold text-slate-800">{v || "—"}</p></div>
                    ))}
                </div>
                {cfg.date && (
                    <div>
                        <Label required>{cfg.date}</Label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
                    </div>
                )}
                <div>
                    <Label required={needsReason}>{cfg.noteLabel}</Label>
                    <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className={`${inputCls} resize-none`} />
                </div>
                {action === "cancel" && (
                    <p className="text-[11px] text-slate-500">
                        The payments on this cheque go back to the {cheque.paymentType === "VENDOR" ? "vendor's" : "payee's"} cheque due so a replacement cheque can be written.
                    </p>
                )}
            </div>
        </Modal>
    );
}

// ─── Accounting panel: which journal each step posts, and whether it has ────

function Step({ title, posted, rows, note }) {
    return (
        <div className={`rounded-xl border p-3 ${posted ? "border-teal-200 bg-white" : "border-dashed border-slate-200 bg-slate-50/60"}`}>
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${posted ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-400"}`}>
                    {posted ? "Posted" : "Not yet"}
                </span>
            </div>
            {rows.map(([l, v]) => (
                <div key={l} className="flex justify-between"><span className="text-slate-600">{l}</span><span className="font-bold tabular-nums">{v}</span></div>
            ))}
            {note && <p className="text-[10px] text-slate-400 mt-1">{note}</p>}
        </div>
    );
}

function ChequeAccounting({ cheque }) {
    const book = cheque.chequeBook || {};
    const currency = book.currency || "AED";
    const live = (cheque.allocations || []).filter(a => a.active || cheque.status === "CANCELLED");
    const owned = live.filter(a => a.postsGl).reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const legacy = live.filter(a => !a.postsGl).reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const reached = (s) => FLOW.indexOf(cheque.status) >= FLOW.indexOf(s);
    const issuedPosted = cheque.status === "CANCELLED" ? !!cheque.issuedAt : reached("ISSUED");
    const isVendor = cheque.paymentType === "VENDOR";

    return (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4 text-xs space-y-2">
            <SectionHead title="Accounting" />
            {owned > 0 && isVendor && (
                <Step title={`On issue${cheque.issuedAt ? ` · ${String(cheque.issuedAt).slice(0, 10)}` : ""}`} posted={issuedPosted}
                    rows={[["Dr 2001 Accounts Payable", money(owned, currency)], ["Cr 2150 AP – Post-Dated Cheques", money(owned, currency)]]}
                    note="Vendor statement shows the payment on the issue date." />
            )}
            {owned > 0 && !isVendor && (
                <Step title="When the expense was paid" posted
                    rows={[["Dr Expense (+ VAT)", money(owned, currency)], ["Cr 2150 AP – Post-Dated Cheques", money(owned, currency)]]} />
            )}
            {owned > 0 && (
                <Step title={`On paid${cheque.paidDate ? ` · ${cheque.paidDate}` : ""}`} posted={reached("PAID") && cheque.status !== "CANCELLED"}
                    rows={[["Dr 2150 AP – Post-Dated Cheques", money(owned, currency)], [`Cr ${book.glAccountCode || ""} ${book.glAccountName || "Bank"}`, money(owned, currency)]]}
                    note="This bank line is what Bank Reconciliation matches to the statement." />
            )}
            {cheque.status === "CANCELLED" && issuedPosted && owned > 0 && isVendor && (
                <Step title="On cancel" posted
                    rows={[["Dr 2150 AP – Post-Dated Cheques", money(owned, currency)], ["Cr 2001 Accounts Payable", money(owned, currency)]]}
                    note="The issue entry was reversed; the payments are back in the cheque due." />
            )}
            {legacy > 0 && (
                <p className="text-[10px] text-slate-500 pt-1.5 border-t border-teal-200">
                    {money(legacy, currency)} of this cheque was booked before cheque accounting was enabled and already credited the bank directly, so the cheque posts nothing for it.
                </p>
            )}
        </div>
    );
}

// ─── Cheque detail ──────────────────────────────────────────────────────────

function ChequeDetail({ chequeId, perms, onBack, onEdit, onPrint, onAction, refreshKey }) {
    const [cheque, setCheque] = useState(null);

    useEffect(() => {
        let alive = true;
        getPayCheque(chequeId)
            .then(c => { if (alive) setCheque(c); })
            .catch(err => toast.error(apiError(err, "Failed to load cheque")));
        return () => { alive = false; };
    }, [chequeId, refreshKey]);

    if (!cheque) return <div className="p-10 text-center text-sm text-slate-400">Loading cheque…</div>;
    const book = cheque.chequeBook || {};
    const currency = book.currency || "AED";
    const s = cheque.status;

    return (
        <div className="flex flex-col h-full">
            <div className="bg-white border-b border-slate-200 px-5 py-3 flex flex-wrap items-center gap-4 shrink-0">
                <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-100"><ArrowLeft className="h-4 w-4 text-slate-500" /></button>
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">Cheque #{cheque.chequeNumber}</span>
                        <StatusBadge status={s} /><TypeBadge type={cheque.paymentType} />
                    </div>
                    <p className="text-[11px] text-slate-500">{book.bankName} · {cheque.payeeName} · {money(cheque.amount, currency)}</p>
                </div>
                <div className="ml-auto flex flex-wrap gap-2">
                    {s === "DRAFT" && perms.edit && <Btn onClick={() => onEdit(cheque)} icon={Edit3}>Edit</Btn>}
                    {s === "DRAFT" && perms.approve && <Btn variant="primary" onClick={() => onAction("approve", cheque, setCheque)} icon={ShieldCheck}>Approve</Btn>}
                    {s === "APPROVED" && perms.edit && <Btn variant="primary" onClick={() => onPrint(cheque, setCheque)} icon={Printer}>Print</Btn>}
                    {s === "PRINTED" && perms.edit && <Btn onClick={() => onPrint(cheque, setCheque)} icon={RotateCcw}>Reprint</Btn>}
                    {s === "PRINTED" && perms.edit && <Btn variant="primary" onClick={() => onAction("issue", cheque, setCheque)} icon={Send}>Issue</Btn>}
                    {s === "ISSUED" && perms.edit && <Btn variant="teal" onClick={() => onAction("paid", cheque, setCheque)} icon={CheckCircle2}>Mark as Paid</Btn>}
                    {s === "PAID" && perms.reconcile && <Btn variant="teal" onClick={() => onAction("reconcile", cheque, setCheque)} icon={BookOpen}>Reconcile</Btn>}
                    {OPEN.includes(s) && perms.edit && <Btn variant="danger" onClick={() => onAction("cancel", cheque, setCheque)} icon={XCircle}>Cancel</Btn>}
                </div>
            </div>

            <div className="bg-white border-b border-slate-200 px-5 py-3 shrink-0"><ChequeTimeline status={s} /></div>

            {s === "DRAFT" && !perms.approve && (
                <div className="mx-5 mt-4 rounded-xl px-3 py-2 text-xs bg-blue-50 text-blue-700 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" /> Waiting for approval by a user with approve rights on Financial Vouchers.
                </div>
            )}

            <div className="flex-1 overflow-auto p-5">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    <div className="space-y-4">
                        <div><SectionHead title="Cheque Preview" /><ChequePreview cheque={cheque} /></div>
                        <div className="bg-white rounded-2xl border border-slate-200 p-4">
                            <SectionHead title="Cheque Information" />
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                {[["Cheque No.", cheque.chequeNumber], ["Cheque Date", formatDisplayDate(cheque.chequeDate)],
                                  ["Branch", cheque.branchName], ["Created By", cheque.createdBy],
                                  ["Created At", fmtDateTime(cheque.createdAt)], ["Approved By", cheque.approvedBy],
                                  ["Printed At", fmtDateTime(cheque.printedAt)], ["Prints", cheque.printCount],
                                  ["Issued At", fmtDateTime(cheque.issuedAt)], ["Paid On", cheque.paidDate ? formatDisplayDate(cheque.paidDate) : "—"],
                                  ["Cleared On", cheque.reconciledDate ? formatDisplayDate(cheque.reconciledDate) : "—"],
                                  ["Memo", cheque.memo]].map(([l, v]) => (
                                    <div key={l}><p className="text-[10px] text-slate-500">{l}</p><p className="font-semibold mt-0.5 text-slate-800">{v ?? "—"}</p></div>
                                ))}
                            </div>
                            {cheque.cancelReason && <p className="mt-3 text-xs text-red-500">Cancelled: {cheque.cancelReason}</p>}
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 p-4">
                            <SectionHead title="Bank Details" />
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                {[["Bank", book.bankName], ["Branch", book.bankBranch], ["Account", book.accountName],
                                  ["A/C No.", book.accountNumber], ["IBAN", book.iban], ["Ledger", `${book.glAccountCode || ""} ${book.glAccountName || ""}`]].map(([l, v]) => (
                                    <div key={l}><p className="text-[10px] text-slate-500">{l}</p><p className="font-semibold tabular-nums mt-0.5 text-slate-800">{v || "—"}</p></div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl border border-slate-200 p-4">
                            <SectionHead title={cheque.paymentType === "VENDOR" ? "Vendor Payments on this Cheque" : "Expenses on this Cheque"} />
                            <table className="w-full text-xs">
                                <thead className="text-[9px] uppercase tracking-wider text-slate-500">
                                    <tr><th className="text-left py-1.5">Document</th><th className="text-left py-1.5">Against</th><th className="text-right py-1.5">Amount</th></tr>
                                </thead>
                                <tbody>
                                    {cheque.allocations.map(a => (
                                        <tr key={a.id} className={`border-t border-slate-100 ${a.active ? "" : "text-slate-400 line-through"}`}>
                                            <td className="py-2 tabular-nums">{a.sourceNumber}</td>
                                            <td className="py-2">{a.reference || "—"}</td>
                                            <td className="py-2 text-right tabular-nums font-bold">{money(a.amount, currency)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <ChequeAccounting cheque={cheque} />


                        <div className="bg-white rounded-2xl border border-slate-200 p-4">
                            <SectionHead title="Activity Log" />
                            {(cheque.events || []).map((e, i, arr) => (
                                <div key={i} className="flex gap-2.5">
                                    <div className="flex flex-col items-center">
                                        <div className="w-2 h-2 rounded-full mt-1 bg-teal-700 shrink-0" />
                                        {i < arr.length - 1 && <div className="w-px flex-1 my-1 bg-slate-200" />}
                                    </div>
                                    <div className="pb-3">
                                        <p className="text-xs font-bold text-slate-800">{e.action}</p>
                                        {e.note && <p className="text-[11px] text-slate-500">{e.note}</p>}
                                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-400">
                                            <Clock className="h-2.5 w-2.5" />{fmtDateTime(e.at)} · {e.username}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Bank accounts (cheque books) ───────────────────────────────────────────

const EMPTY_BOOK = { glAccountId: "", bankName: "", bankBranch: "", accountName: "", accountNumber: "", iban: "", currency: "AED", nextChequeNumber: "000001", templateId: "" };

function ChequeBookModal({ book, ledgerAccounts, templates, onClose, onSaved }) {
    const [form, setForm] = useState(() => book ? {
        ...EMPTY_BOOK, ...Object.fromEntries(Object.entries(book).map(([k, v]) => [k, v ?? ""])),
        templateId: book.templateId ? String(book.templateId) : "",
    } : EMPTY_BOOK);
    const [busy, setBusy] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const submit = async () => {
        if (!form.glAccountId) return toast.error("Select the bank ledger account");
        if (!form.bankName.trim()) return toast.error("Bank name is required");
        if (!/\d$/.test(form.nextChequeNumber.trim())) return toast.error("Next cheque number must end in digits");
        setBusy(true);
        try {
            const saved = await saveChequeBook(book?.id, {
                ...form,
                templateId: form.templateId ? Number(form.templateId) : null,
            });
            toast.success(`${saved.bankName} saved`);
            onSaved(saved);
        } catch (err) {
            toast.error(apiError(err, "Failed to save bank account"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal title={book ? `Edit ${book.bankName}` : "Add Bank Account"} icon={Landmark} width={620} onClose={onClose}
            footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={submit} disabled={busy} icon={Check}>{busy ? "Saving…" : "Save"}</Btn></>}>
            <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                    <Label required>Bank Ledger (Chart of Accounts)</Label>
                    <select value={form.glAccountId} onChange={e => set("glAccountId", e.target.value)} className={inputCls}>
                        <option value="">— Select ledger —</option>
                        {ledgerAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">Must be the same bank account chosen in Pay Invoices / Expenses for these payments.</p>
                </div>
                <div><Label required>Bank Name</Label><input value={form.bankName} onChange={e => set("bankName", e.target.value)} className={inputCls} placeholder="Emirates NBD" /></div>
                <div><Label>Bank Branch</Label><input value={form.bankBranch} onChange={e => set("bankBranch", e.target.value)} className={inputCls} /></div>
                <div><Label>Account Name</Label><input value={form.accountName} onChange={e => set("accountName", e.target.value)} className={inputCls} /></div>
                <div><Label>Account No.</Label><input value={form.accountNumber} onChange={e => set("accountNumber", e.target.value)} className={`${inputCls} tabular-nums`} /></div>
                <div><Label>IBAN</Label><input value={form.iban} onChange={e => set("iban", e.target.value)} className={`${inputCls} tabular-nums`} /></div>
                <div><Label>Currency</Label><input value={form.currency} onChange={e => set("currency", e.target.value.toUpperCase())} className={inputCls} maxLength={3} /></div>
                <div><Label required>Next Cheque No.</Label><input value={form.nextChequeNumber} onChange={e => set("nextChequeNumber", e.target.value)} className={`${inputCls} tabular-nums`} /></div>
                <div>
                    <Label>Cheque Print Template</Label>
                    <select value={form.templateId} onChange={e => set("templateId", e.target.value)} className={inputCls}>
                        <option value="">Default cheque template</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (default)" : ""}</option>)}
                    </select>
                </div>
            </div>
        </Modal>
    );
}

function BankAccountsView({ books, templates, canEdit, onAdd, onEdit, onDelete }) {
    const navigate = useNavigate();
    const templateName = (id) => templates.find(t => String(t.id) === String(id))?.name || "Default cheque template";
    return (
        <div className="p-5">
            <SectionHead title="Bank Accounts & Cheque Templates">
                <div className="flex gap-2">
                    <Btn onClick={() => navigate("/finance/templates")} icon={Layers}>Cheque Designer</Btn>
                    {canEdit && <Btn variant="primary" onClick={onAdd} icon={Plus}>Add Bank Account</Btn>}
                </div>
            </SectionHead>
            {!books.length && (
                <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
                    No bank accounts set up for cheques yet. Add the bank account, its next cheque number and the print template.
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {books.map(b => (
                    <div key={b.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="px-4 py-3 flex items-center gap-2.5 bg-slate-800">
                            <Landmark className="h-5 w-5 text-[#F5C742]" />
                            <div>
                                <p className="text-xs font-bold text-white">{b.bankName}</p>
                                <p className="text-[10px] text-white/50">{b.bankBranch || "—"}</p>
                            </div>
                        </div>
                        <div className="p-4 space-y-2 text-xs">
                            {[["Account Name", b.accountName], ["Account No.", b.accountNumber], ["IBAN", b.iban],
                              ["Ledger", `${b.glAccountCode || ""} ${b.glAccountName || ""}`], ["Next Cheque No.", b.nextChequeNumber],
                              ["Template", templateName(b.templateId)]].map(([l, v]) => (
                                <div key={l} className="flex justify-between gap-3"><span className="text-slate-500">{l}</span><span className="font-semibold tabular-nums text-right text-slate-800">{v || "—"}</span></div>
                            ))}
                            <div className="pt-2 border-t border-slate-100 flex justify-between">
                                <span className="text-slate-500">Open Cheques</span>
                                <span className={`font-bold ${b.openCheques > 0 ? "text-amber-500" : "text-green-600"}`}>{b.openCheques}</span>
                            </div>
                        </div>
                        {canEdit && (
                            <div className="px-4 pb-3 flex gap-2">
                                <button onClick={() => onEdit(b)} className="flex-1 py-2 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50">Edit / Change Template</button>
                                <button onClick={() => onDelete(b)} className="px-3 rounded-lg border border-slate-200 text-red-500 hover:bg-red-50" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── BRS view ───────────────────────────────────────────────────────────────

function BrsView({ cheques, perms, onAction, onOpen }) {
    const items = cheques.filter(c => ["ISSUED", "PAID", "RECONCILED"].includes(c.status));
    const sum = (list) => list.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const cleared = sum(items.filter(c => c.status === "RECONCILED"));
    const pending = sum(items.filter(c => c.status !== "RECONCILED"));
    return (
        <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[["Cleared", cleared, "text-teal-700"], ["Pending Clearance", pending, "text-amber-500"], ["Total Issued", cleared + pending, "text-slate-800"]].map(([l, v, c]) => (
                    <div key={l} className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                        <p className={`text-2xl font-black ${c}`}>{money(v)}</p>
                        <p className="text-xs mt-1 text-slate-500">{l}</p>
                    </div>
                ))}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>{["Cheque No.", "Cheque Date", "Bank", "Payee", "Amount", "Status", "Paid On", "Cleared On", ""].map(h => (
                            <th key={h} className="px-4 py-2.5 text-left font-bold uppercase tracking-wider whitespace-nowrap text-[9px] text-slate-500">{h}</th>
                        ))}</tr>
                    </thead>
                    <tbody>
                        {items.map(c => (
                            <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(c)}>
                                <td className="px-4 py-3 tabular-nums font-bold">{c.chequeNumber}</td>
                                <td className="px-4 py-3">{formatDisplayDate(c.chequeDate)}</td>
                                <td className="px-4 py-3">{c.chequeBook?.bankName}</td>
                                <td className="px-4 py-3 font-semibold">{c.payeeName}</td>
                                <td className="px-4 py-3 tabular-nums font-bold text-teal-700">{money(c.amount, c.chequeBook?.currency)}</td>
                                <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                                <td className="px-4 py-3">{c.paidDate ? formatDisplayDate(c.paidDate) : "—"}</td>
                                <td className="px-4 py-3">{c.reconciledDate ? formatDisplayDate(c.reconciledDate) : "—"}</td>
                                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                    {c.status === "ISSUED" && perms.edit && (
                                        <button onClick={() => onAction("paid", c)} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-teal-50 text-teal-700">Mark Paid</button>
                                    )}
                                    {c.status === "PAID" && perms.reconcile && (
                                        <button onClick={() => onAction("reconcile", c)} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-green-50 text-green-700">Mark Cleared</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!items.length && <p className="text-center py-8 text-xs text-slate-400">No issued cheques yet.</p>}
            </div>
        </div>
    );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function PayCheques() {
    const permissions = usePermissions();
    const perms = {
        create: permissions.canCreate(VOUCHER_MODULE),
        edit: permissions.canEdit(VOUCHER_MODULE),
        approve: permissions.canApprove(VOUCHER_MODULE),
        reconcile: permissions.canEdit(RECONCILE_MODULE),
    };

    const [view, setView] = useState("list");
    const [cheques, setCheques] = useState([]);
    const [books, setBooks] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [ledgerAccounts, setLedgerAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [filterBook, setFilterBook] = useState("all");
    const [filterType, setFilterType] = useState("all");

    const [openId, setOpenId] = useState(null);
    const [detailKey, setDetailKey] = useState(0);
    const [form, setForm] = useState(null);          // { existing } | null
    const [bookModal, setBookModal] = useState(null); // { book } | null
    const [dialog, setDialog] = useState(null);       // { action, cheque, onDone } | null

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [c, b] = await Promise.all([getPayCheques(), getChequeBooks()]);
            setCheques(c || []);
            setBooks(b || []);
        } catch (err) {
            toast.error(apiError(err, "Failed to load cheques"));
        } finally {
            setLoading(false);
        }
        getTemplatesByCategory("Cheque").then(t => setTemplates(t || [])).catch(() => setTemplates([]));
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const handler = () => load();
        window.addEventListener("billbull:branch-changed", handler);
        return () => window.removeEventListener("billbull:branch-changed", handler);
    }, [load]);
    useEffect(() => {
        if (!bookModal || ledgerAccounts.length) return;
        getBankAccounts({ excludeCash: true }).then(a => setLedgerAccounts(a || [])).catch(() => toast.error("Failed to load bank ledgers"));
    }, [bookModal, ledgerAccounts.length]);

    const refreshAfter = (updated, setLocal) => {
        if (setLocal) setLocal(updated);
        setDetailKey(k => k + 1);
        load();
    };

    const runAction = async (action, cheque, setLocal) => {
        if (action === "approve") {
            try {
                const updated = await payChequeAction(cheque.id, "approve", {});
                toast.success(`Cheque ${updated.chequeNumber} approved`);
                refreshAfter(updated, setLocal);
            } catch (err) {
                toast.error(apiError(err, "Approval failed"));
            }
            return;
        }
        setDialog({ action, cheque, onDone: (u) => { setDialog(null); refreshAfter(u, setLocal); } });
    };

    const printCheque = async (cheque, setLocal) => {
        const template = templates.find(t => String(t.id) === String(cheque.chequeBook?.templateId))
            || templates.find(t => t.isDefault) || templates[0];
        if (!template) toast("No cheque template designed yet — printing with the default layout.", { icon: "ℹ️" });
        try {
            // Record the print first: a cheque leaf must never come out of the printer unrecorded.
            const updated = await payChequeAction(cheque.id, "print", {});
            printHtml(buildChequePrintHtml(updated, chequeSettingsFromTemplate(template)));
            refreshAfter(updated, setLocal);
        } catch (err) {
            toast.error(apiError(err, "Print failed"));
        }
    };

    const removeBook = async (book) => {
        if (!window.confirm(`Remove ${book.bankName} (${book.accountNumber || book.glAccountCode}) from cheque bank accounts?`)) return;
        try {
            await deleteChequeBook(book.id);
            toast.success("Bank account removed");
            load();
        } catch (err) {
            toast.error(apiError(err, "Failed to remove"));
        }
    };

    const counts = useMemo(() => {
        const by = (s) => cheques.filter(c => c.status === s).length;
        return {
            total: cheques.length,
            totalAmt: cheques.filter(c => c.status !== "CANCELLED").reduce((s, c) => s + (Number(c.amount) || 0), 0),
            openAmt: cheques.filter(c => OPEN.includes(c.status)).reduce((s, c) => s + (Number(c.amount) || 0), 0),
            ...Object.fromEntries(Object.keys(STATUS_CFG).map(s => [s, by(s)])),
        };
    }, [cheques]);

    const filtered = cheques.filter(c => {
        const q = search.trim().toLowerCase();
        const matchQ = !q || c.chequeNumber?.toLowerCase().includes(q) || c.payeeName?.toLowerCase().includes(q)
            || c.allocations?.some(a => a.sourceNumber?.toLowerCase().includes(q) || a.reference?.toLowerCase().includes(q));
        return matchQ
            && (filterStatus === "all" || c.status === filterStatus)
            && (filterBook === "all" || String(c.chequeBook?.id) === filterBook)
            && (filterType === "all" || c.paymentType === filterType);
    });

    const modals = (
        <>
            {form && (
                <ChequeFormModal existing={form.existing} books={books} onClose={() => setForm(null)}
                    onSaved={(saved) => { setForm(null); setOpenId(saved.id); setDetailKey(k => k + 1); load(); }} />
            )}
            {bookModal && (
                <ChequeBookModal book={bookModal.book} ledgerAccounts={ledgerAccounts} templates={templates}
                    onClose={() => setBookModal(null)} onSaved={() => { setBookModal(null); load(); }} />
            )}
            {dialog && <ActionDialog action={dialog.action} cheque={dialog.cheque} onClose={() => setDialog(null)} onDone={dialog.onDone} />}
        </>
    );

    if (openId) {
        return (
            <div className="flex flex-col h-full bg-[#F7F7FA]">
                <ChequeDetail chequeId={openId} perms={perms} refreshKey={detailKey}
                    onBack={() => setOpenId(null)}
                    onEdit={(c) => setForm({ existing: c })}
                    onPrint={printCheque}
                    onAction={runAction} />
                {modals}
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-[#F7F7FA]">
            <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#F5C742]/20"><FileText className="h-4 w-4 text-[#F5C742]" /></div>
                    <div>
                        <h1 className="text-sm font-bold text-slate-800">Pay Cheques</h1>
                        <p className="text-[11px] text-slate-500">Cheque preparation · approval · printing · payment · reconciliation</p>
                    </div>
                </div>
                {perms.create && (
                    <button onClick={() => {
                        if (!books.length) { toast.error("Add a bank account under Bank Accounts first"); setView("banks"); return; }
                        setForm({ existing: null });
                    }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-[#F5C742] hover:bg-[#E5B732] text-slate-900">
                        <Plus className="h-4 w-4" />Create Cheque
                    </button>
                )}
            </div>

            <div className="bg-white border-b border-slate-200 px-5 flex">
                {[{ id: "list", label: "Cheque List", icon: FileText }, { id: "banks", label: "Bank Accounts", icon: Landmark }, { id: "brs", label: "BRS", icon: BookOpen }].map(t => (
                    <button key={t.id} onClick={() => setView(t.id)}
                        className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold border-b-2 transition-all ${view === t.id ? "border-[#F5C742] text-amber-600" : "border-transparent text-slate-500"}`}>
                        <t.icon className="h-3.5 w-3.5" />{t.label}
                    </button>
                ))}
            </div>

            {view === "banks" && (
                <BankAccountsView books={books} templates={templates} canEdit={perms.edit}
                    onAdd={() => setBookModal({ book: null })} onEdit={(b) => setBookModal({ book: b })} onDelete={removeBook} />
            )}
            {view === "brs" && <BrsView cheques={cheques} perms={perms} onAction={runAction} onOpen={(c) => setOpenId(c.id)} />}
            {view === "list" && (
                <>
                    <div className="px-5 py-4">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                            {[["Total Cheques", counts.total, "text-slate-800"], ["Total Amount", money(counts.totalAmt), "text-teal-700"],
                              ["Open (not yet paid)", money(counts.openAmt), "text-amber-500"], ["Reconciled", counts.RECONCILED, "text-green-600"]].map(([l, v, c]) => (
                                <div key={l} className="bg-white rounded-2xl border border-slate-200 p-4">
                                    <p className="text-[11px] text-slate-500">{l}</p>
                                    <p className={`text-xl font-black ${c}`}>{v}</p>
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
                            {["DRAFT", "APPROVED", "PRINTED", "ISSUED", "PAID", "CANCELLED"].map(s => (
                                <button key={s} onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
                                    className={`bg-white rounded-xl border p-2.5 text-center ${filterStatus === s ? "border-[#F5C742]" : "border-slate-200"}`}>
                                    <p className="text-lg font-black text-slate-700">{counts[s]}</p>
                                    <p className="text-[9px] uppercase tracking-wide font-semibold text-slate-500">{STATUS_CFG[s].label}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="px-5 pb-3 flex gap-2 flex-wrap">
                        <div className="relative flex-1 min-w-[220px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cheque No., payee, voucher, invoice…"
                                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#F5C742]" />
                        </div>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white">
                            <option value="all">All Statuses</option>
                            {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                        <select value={filterBook} onChange={e => setFilterBook(e.target.value)} className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white">
                            <option value="all">All Banks</option>
                            {books.map(b => <option key={b.id} value={String(b.id)}>{b.bankName} {b.accountNumber ? `· ${b.accountNumber}` : ""}</option>)}
                        </select>
                        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white">
                            <option value="all">All Types</option>
                            {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                    </div>

                    <div className="px-5 pb-5">
                        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>{["Cheque No.", "Date", "Bank Account", "Payee", "Type", "Against", "Amount", "Status", "Created By", "Printed", "Paid", ""].map(h => (
                                        <th key={h} className="px-3 py-2.5 text-left font-bold uppercase tracking-wider whitespace-nowrap text-[9px] text-slate-500">{h}</th>
                                    ))}</tr>
                                </thead>
                                <tbody>
                                    {filtered.map(c => {
                                        const refs = c.allocations.filter(a => a.active).map(a => a.reference || a.sourceNumber);
                                        return (
                                            <tr key={c.id} onClick={() => setOpenId(c.id)} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer group">
                                                <td className="px-3 py-3 tabular-nums font-bold text-slate-800">{c.chequeNumber}</td>
                                                <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{formatDisplayDate(c.chequeDate)}</td>
                                                <td className="px-3 py-3">
                                                    <p className="font-semibold text-slate-800">{c.chequeBook?.bankName}</p>
                                                    <p className="text-[10px] text-slate-500">{c.chequeBook?.accountNumber || c.chequeBook?.glAccountName}</p>
                                                </td>
                                                <td className="px-3 py-3 font-semibold text-slate-800">{c.payeeName}</td>
                                                <td className="px-3 py-3"><TypeBadge type={c.paymentType} /></td>
                                                <td className="px-3 py-3 tabular-nums text-[10px] text-slate-500 max-w-[180px] truncate" title={refs.join(", ")}>{refs.join(", ") || "—"}</td>
                                                <td className="px-3 py-3 tabular-nums font-bold text-teal-700 whitespace-nowrap">{money(c.amount, c.chequeBook?.currency)}</td>
                                                <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                                                <td className="px-3 py-3 text-slate-500">{c.createdBy || "—"}</td>
                                                <td className="px-3 py-3 text-[10px] text-slate-500 whitespace-nowrap">{c.printedAt ? String(c.printedAt).slice(0, 10) : "—"}</td>
                                                <td className="px-3 py-3 text-[10px] text-slate-500 whitespace-nowrap">{c.paidDate || "—"}</td>
                                                <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => setOpenId(c.id)} className="p-1 rounded hover:bg-slate-100" title="View"><Eye className="h-3.5 w-3.5 text-teal-700" /></button>
                                                        {c.status === "DRAFT" && perms.edit && <button onClick={() => setForm({ existing: c })} className="p-1 rounded hover:bg-slate-100" title="Edit"><Edit3 className="h-3.5 w-3.5 text-blue-500" /></button>}
                                                        {c.status === "DRAFT" && perms.approve && <button onClick={() => runAction("approve", c)} className="p-1 rounded hover:bg-slate-100" title="Approve"><ShieldCheck className="h-3.5 w-3.5 text-blue-600" /></button>}
                                                        {c.status === "APPROVED" && perms.edit && <button onClick={() => printCheque(c)} className="p-1 rounded hover:bg-slate-100" title="Print"><Printer className="h-3.5 w-3.5 text-amber-500" /></button>}
                                                        {OPEN.includes(c.status) && perms.edit && <button onClick={() => runAction("cancel", c)} className="p-1 rounded hover:bg-red-50" title="Cancel"><XCircle className="h-3.5 w-3.5 text-red-500" /></button>}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {!loading && !filtered.length && <p className="text-center py-8 text-xs text-slate-400">No cheques match your filters.</p>}
                            {loading && <p className="text-center py-8 text-xs text-slate-400">Loading…</p>}
                        </div>
                    </div>
                </>
            )}
            {modals}
        </div>
    );
}
