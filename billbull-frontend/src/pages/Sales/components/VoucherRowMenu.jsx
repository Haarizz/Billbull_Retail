import React from 'react';
import { MoreHorizontal, Printer, Download, MessageCircle, Smartphone, Mail } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../../components/ui/dropdown-menu';

// Per-payment actions on the Payment History table.
//
// WhatsApp/SMS are client-side deep links (wa.me / sms:) — the established pattern in
// this codebase, and the only option for SMS since the backend has no SMS capability
// (no provider, gateway, or credentials — only a free-text `channel` label on a log row).
export default function VoucherRowMenu({ receipt, customerPhone, invoiceNumber, currency = 'AED', onPrintVoucher, onDownloadPdf, onEmail }) {
    const digits = String(customerPhone || '').replace(/[^0-9]/g, '');
    const message = `Receipt ${receipt.receiptNumber || ''} for Invoice ${invoiceNumber || ''}: `
        + `${currency} ${Number(receipt.amount || 0).toLocaleString('en-AE', { minimumFractionDigits: 2 })} received. Thank you.`;

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
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={`Actions for receipt ${receipt.receiptNumber || ''}`}
                    className="p-1 rounded hover:bg-slate-100 text-slate-500"
                >
                    <MoreHorizontal size={15} />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-white border-0 rounded-xl shadow-lg shadow-slate-900/10 ring-1 ring-black/5 p-1.5">
                {items.map(({ key, label, icon: Icon, run }) => (
                    <DropdownMenuItem
                        key={key}
                        onClick={run}
                        className="group text-xs text-slate-600 rounded-lg py-2 gap-2.5 cursor-pointer focus:bg-[#FFF8E7] focus:text-[#8A6200]"
                    >
                        <Icon size={13} className="text-slate-400 shrink-0 group-focus:text-[#D99A00] transition-colors" /> {label}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
