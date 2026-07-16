import React, { useEffect, useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { getSalesInvoiceHistory } from '../../../api/salesInvoiceHistoryApi';
import { getHistoryEventStyle, getHistoryChipStyle } from '../utils/historyEventStyles';

const formatEventTime = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('en-GB', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: true,
    }).replace(',', ' at');
};

function TimelineEntry({ event }) {
    const { icon: Icon, bg, fg } = getHistoryEventStyle(event.eventType);
    const time = formatEventTime(event.timestamp);

    return (
        <li className="flex gap-3">
            <div className="flex flex-col items-center shrink-0">
                <span className={`w-9 h-9 rounded-full ${bg} flex items-center justify-center`}>
                    <Icon size={16} className={fg} />
                </span>
                <span className="w-px flex-1 bg-slate-200 my-1" />
            </div>

            <div className="flex-1 min-w-0 pb-5">
                <div className="bg-white border border-slate-200 rounded-lg p-3">
                    <p className="text-sm font-bold text-slate-800">{event.title}</p>

                    {event.linkedDocumentNumber && (
                        <span className={`inline-block mt-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getHistoryChipStyle(event.linkedDocumentType)}`}>
                            {event.linkedDocumentNumber}
                        </span>
                    )}

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-400">
                        {/* Derived lineage events carry no recorded time — say so rather than invent one. */}
                        <span>{time || 'Time not recorded'}</span>
                        {event.username && <span>· {event.username}</span>}
                    </div>

                    {event.amount != null && (
                        <div className="mt-2 bg-slate-50 rounded p-2">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Amount</div>
                            <CurrencyAmount value={event.amount} className="text-sm font-bold text-emerald-600" />
                        </div>
                    )}

                    {Array.isArray(event.changes) && event.changes.length > 0 && (
                        <div className="mt-2 bg-amber-50 border border-amber-100 rounded p-2">
                            <div className="text-[10px] font-bold text-amber-800 mb-1">Changes Made:</div>
                            <ul className="list-disc list-inside space-y-0.5">
                                {event.changes.map((c, i) => (
                                    <li key={i} className="text-[11px] text-amber-900">{c}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </li>
    );
}

export default function InvoiceHistoryModal({ invoiceId, invoiceNumber, onClose }) {
    const [events, setEvents] = useState([]);
    const [state, setState] = useState('loading'); // 'loading' | 'ready' | 'error'

    const load = React.useCallback(async () => {
        setState('loading');
        try {
            const data = await getSalesInvoiceHistory(invoiceId);
            setEvents(Array.isArray(data) ? data : []);
            setState('ready');
        } catch {
            setState('error');
        }
    }, [invoiceId]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="invoice-history-title"
                className="bg-slate-50 w-[640px] max-w-full max-h-[85vh] rounded-xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-150"
            >
                <div className="px-5 py-4 border-b border-slate-200 bg-white rounded-t-xl flex justify-between items-start shrink-0">
                    <div>
                        <h2 id="invoice-history-title" className="text-base font-bold text-slate-900">Invoice History</h2>
                        <p className="text-xs text-slate-500">Timeline of all activities for {invoiceNumber}</p>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close history"
                        className="h-8 w-8 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 flex items-center justify-center"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="overflow-y-auto p-5 flex-1">
                    {state === 'loading' && (
                        <div className="space-y-3 animate-pulse" aria-busy="true">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="h-20 bg-slate-200/60 rounded-lg" />
                            ))}
                        </div>
                    )}

                    {state === 'error' && (
                        <div className="text-center py-10 text-sm text-slate-400">
                            Couldn't load invoice history.
                            <button onClick={load} className="ml-2 inline-flex items-center gap-1 text-[#D99A00] font-medium hover:underline">
                                <RotateCcw size={12} /> Retry
                            </button>
                        </div>
                    )}

                    {state === 'ready' && events.length === 0 && (
                        <div className="text-center py-10 text-sm text-slate-400">No activity recorded for this invoice.</div>
                    )}

                    {state === 'ready' && events.length > 0 && (
                        <ol className="[&>li:last-child>div:first-child>span:last-child]:hidden">
                            {events.map((e, i) => (
                                <TimelineEntry key={e.id ?? `derived-${e.eventType}-${i}`} event={e} />
                            ))}
                        </ol>
                    )}
                </div>
            </div>
        </div>
    );
}
