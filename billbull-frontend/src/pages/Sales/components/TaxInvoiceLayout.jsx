import React from 'react';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { getInvoiceStatusBadge } from '../utils/invoiceStatusBadge';

// On-screen "TAX INVOICE" document view.
//
// Rendered in JSX from the fetched invoice rather than reusing the print engine's
// HTML: getPreviewHtml/buildCurrentInvoicePrintData are closures over the *editor's*
// form state, not functions of an invoice, so they can't render an arbitrary invoice
// from here. Actual printing still goes through the real print engine (Print / Print
// Template) — this is a reading view, not a print renderer.
function Field({ label, value, accent = false }) {
    if (value == null || value === '') return null;
    return (
        <div>
            <div className="text-[11px] text-slate-400 mb-0.5">{label}</div>
            <div className={`text-sm ${accent ? 'text-[#D99A00] font-medium' : 'text-slate-800 font-medium'}`}>{value}</div>
        </div>
    );
}

export default function TaxInvoiceLayout({ invoice, customer, currency, companyName }) {
    if (!invoice) return null;

    const status = getInvoiceStatusBadge(invoice.status, invoice);
    const items = invoice.items || [];
    const balanceDue = Number(invoice.balance ?? Math.max(0, (invoice.invoiceTotal || 0) - (invoice.amountPaid || 0)));
    // Tax-aware document title: a taxed invoice is a TAX INVOICE, a zero-rated/
    // exempt one is a plain SALES INVOICE — matches the print engine's rule
    // (see SalesInvoice.jsx `invoiceHasTax`).
    const hasTax = Number(invoice.taxTotal ?? invoice.totalTax ?? invoice.taxAmount ?? 0) > 0;

    return (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="text-center py-6 px-4 border-b border-slate-100">
                <h2 className="text-2xl font-bold tracking-wide text-slate-900">{hasTax ? 'TAX INVOICE' : 'SALES INVOICE'}</h2>
                {companyName && <p className="text-sm text-slate-500 mt-0.5">{companyName}</p>}
            </div>

            <div className="p-4 md:p-5 grid sm:grid-cols-2 gap-x-6 gap-y-4 border-b border-slate-100">
                <Field label="Invoice No" value={invoice.invoiceNumber} />
                <Field label="Customer" value={
                    <>
                        {invoice.customerName}
                        {invoice.customerCode && <div className="text-[11px] text-slate-400 font-normal">{invoice.customerCode}</div>}
                    </>
                } />
                <Field label="Invoice Date" value={formatDisplayDate(invoice.invoiceDate)} />
                <Field label="Phone" value={customer?.phone || customer?.mobile} />
                <Field label="Sales Order" value={invoice.linkedSalesOrder} accent />
                <Field label="Email" value={customer?.email} />
                <Field label="Delivery Note" value={invoice.linkedDeliveryNote} accent />
                <Field label="Proforma Invoice" value={invoice.linkedProforma} accent />
            </div>

            <div className="p-4 md:p-5 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-700 mb-2">Items</h3>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium">#</th>
                                <th className="px-3 py-2 text-left font-medium">Item</th>
                                <th className="px-3 py-2 text-right font-medium">Qty</th>
                                <th className="px-3 py-2 text-right font-medium">Price</th>
                                <th className="px-3 py-2 text-right font-medium">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {items.map((it, idx) => (
                                <tr key={it.id || idx}>
                                    <td className="px-3 py-2.5 text-slate-400">{idx + 1}</td>
                                    <td className="px-3 py-2.5">
                                        <div className="font-medium text-slate-700">{it.itemName || it.name}</div>
                                        {(it.itemCode || it.code) && (
                                            <div className="text-[10px] text-slate-400">{it.itemCode || it.code}</div>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-slate-600 whitespace-nowrap">
                                        {it.quantity ?? it.qty ?? 0} {it.unit || ''}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-slate-600 whitespace-nowrap">
                                        <CurrencyAmount value={it.price} currency={currency} />
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-medium text-slate-800 whitespace-nowrap">
                                        <CurrencyAmount value={it.netAmount ?? it.net} currency={currency} />
                                    </td>
                                </tr>
                            ))}
                            {items.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-6 text-slate-400">No items on this invoice.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="p-4 md:p-5 border-b border-slate-100">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-700">Payment Mode</h3>
                    <span className="border border-slate-200 px-2 py-0.5 rounded text-[11px] bg-white text-slate-600">
                        {invoice.paymentMode || '—'}
                    </span>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Net Amount</span>
                        <CurrencyAmount value={invoice.invoiceTotal} currency={currency} className="font-bold text-slate-800" />
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-emerald-700">Paid Amount</span>
                        <CurrencyAmount value={invoice.amountPaid} currency={currency} className="font-medium text-emerald-600" />
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                        <span className="text-base font-bold text-slate-800">Balance Due</span>
                        <CurrencyAmount value={balanceDue} currency={currency} className="text-lg font-bold text-red-600" />
                    </div>
                </div>
            </div>

            <div className="p-4 md:p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-700">Invoice Status</h3>
                    <span className={status.colorClasses}>{status.label}</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Salesperson" value={invoice.salesperson} />
                    <Field label="Branch" value={invoice.branch} />
                </div>
            </div>
        </section>
    );
}
