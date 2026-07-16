import React, { useState } from 'react';
import { MoreHorizontal, Printer, Download, MessageCircle, Smartphone, Mail } from 'lucide-react';

// Per-payment actions on the Payment History table.
//
// WhatsApp/SMS are client-side deep links (wa.me / sms:) — the established pattern in
// this codebase, and the only option for SMS since the backend has no SMS capability
// (no provider, gateway, or credentials — only a free-text `channel` label on a log row).
export default function VoucherRowMenu({ receipt, customerPhone, invoiceNumber, currency = 'AED', onPrintVoucher, onDownloadPdf, onEmail }) {
    const [open, setOpen] = useState(false);

    const digits = String(customerPhone || '').replace(/[^0-9]/g, '');
    const message = `Receipt ${receipt.receiptNumber || ''} for Invoice ${invoiceNumber || ''}: `
        + `${currency} ${Number(receipt.amount || 0).toLocaleString('en-AE', { minimumFractionDigits: 2 })} received. Thank you.`;

    const act = (fn) => { setOpen(false); fn?.(); };

    const openWhatsApp = () => {
        const url = digits
            ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
            : `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    };

    // `?body=` is honoured by iOS and most Android SMS apps; without a number it just
    // opens the composer empty-to.
    const openSms = () => {
        window.open(`sms:${digits}?body=${encodeURIComponent(message)}`, '_self');
    };

    const items = [
        { key: 'print', label: 'Print Voucher', icon: Printer, run: () => onPrintVoucher?.(receipt) },
        { key: 'pdf', label: 'Download PDF', icon: Download, run: () => onDownloadPdf?.(receipt) },
        { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, run: openWhatsApp },
        { key: 'sms', label: 'SMS', icon: Smartphone, run: openSms },
        { key: 'email', label: 'Email', icon: Mail, run: () => onEmail?.(receipt) },
    ];

    return (
        <div className="relative inline-block">
            <button
                type="button"
                aria-label={`Actions for receipt ${receipt.receiptNumber || ''}`}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className="p-1 rounded hover:bg-slate-100 text-slate-500"
            >
                <MoreHorizontal size={15} />
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div role="menu" className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1">
                        {items.map(({ key, label, icon: Icon, run }) => (
                            <button
                                key={key}
                                type="button"
                                role="menuitem"
                                onClick={() => act(run)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-[#FFF8E7] flex items-center gap-2 text-slate-700"
                            >
                                <Icon size={13} className="text-slate-400 shrink-0" /> {label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
