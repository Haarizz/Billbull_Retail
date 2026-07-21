import React, { useEffect, useRef, useState } from 'react';
import { Copy, MoreHorizontal, ChevronDown } from 'lucide-react';
import { copyToClipboard } from '../../../utils/clipboard';

// Shared small building blocks for the Purchase Transaction Preview screens
// (LPO / GRN / Purchase Invoice / Payment Voucher). These mirror the local
// helpers in the Sales previews; extracted here so the four purchase previews
// don't each redeclare them.

export function OverflowMenu({ children, label = 'More' }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);
    return (
        <div className="relative" ref={ref}>
            <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}
                className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium">
                <MoreHorizontal size={14} /> {label}
            </button>
            {open && (
                <div role="menu" onClick={() => setOpen(false)} className="absolute right-0 mt-1 z-30 min-w-42 bg-white border border-slate-200 rounded-lg shadow-lg py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                    {children}
                </div>
            )}
        </div>
    );
}

export function MenuItem({ onClick, icon: Icon, children, disabled, danger }) {
    return (
        <button type="button" role="menuitem" onClick={onClick} disabled={disabled}
            className={`w-full px-3 py-2 flex items-center gap-2 text-xs font-medium text-left disabled:opacity-40 ${danger ? 'text-emerald-700 hover:bg-emerald-50' : 'text-slate-700 hover:bg-slate-50'}`}>
            {Icon && <Icon size={13} className={danger ? 'text-emerald-500' : 'text-slate-400'} />} {children}
        </button>
    );
}

export function CopyField({ label, value, className = '' }) {
    if (!value) return null;
    return (
        <button type="button" onClick={() => copyToClipboard(value, label)}
            className={`inline-flex items-center gap-1 hover:text-[#D99A00] transition-colors ${className}`} title={`Copy ${label}`}>
            <span className="truncate">{value}</span>
            <Copy size={11} className="shrink-0" />
        </button>
    );
}

export function InfoRow({ label, value, copyable = false, copyLabel }) {
    const has = value != null && value !== '';
    const text = has ? String(value) : '';
    return (
        <div className="flex items-start justify-between gap-3 py-1 text-xs">
            <span className="text-slate-400 shrink-0">{label}</span>
            {has ? (
                copyable
                    ? <CopyField label={copyLabel || label} value={value} className="text-slate-700 font-medium min-w-0 justify-end" />
                    : <span className="text-slate-700 font-medium text-right min-w-0 wrap-break-word" title={text}>{value}</span>
            ) : (
                <span className="text-slate-300">—</span>
            )}
        </div>
    );
}

export function RailCard({ title, icon: Icon, children, collapsible = false, defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {collapsible ? (
                <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
                    className="w-full px-4 py-2.5 border-b border-slate-100 flex items-center justify-between text-left xl:cursor-default">
                    <h2 className="text-xs font-bold text-slate-800 flex items-center gap-2"><Icon size={14} className="text-[#D99A00]" /> {title}</h2>
                    <ChevronDown size={15} className={`text-slate-400 transition-transform xl:hidden ${open ? 'rotate-180' : ''}`} />
                </button>
            ) : (
                <div className="px-4 py-2.5 border-b border-slate-100">
                    <h2 className="text-xs font-bold text-slate-800 flex items-center gap-2"><Icon size={14} className="text-[#D99A00]" /> {title}</h2>
                </div>
            )}
            <div className={`px-4 py-2.5 ${collapsible && !open ? 'hidden xl:block' : ''}`}>{children}</div>
        </section>
    );
}

// Executive-summary strip renderer shared by the purchase previews.
// tiles: [{ label, node, icon?, iconCls?, tint? }]
export function SummaryStrip({ tiles }) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-2">
            {tiles.map((t) => (
                <div key={t.label} className={`border rounded-lg px-3 py-2 text-center bg-white flex flex-col justify-center ${t.tint || 'border-slate-200'} shadow-sm`}>
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1 flex items-center justify-center gap-1 truncate">
                        {t.icon && <t.icon size={10} className={t.iconCls} />} {t.label}
                    </div>
                    <div className="truncate">{t.node}</div>
                </div>
            ))}
        </div>
    );
}
