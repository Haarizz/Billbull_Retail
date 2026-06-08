import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, X } from 'lucide-react';

const toIso = (d) => d.toISOString().slice(0, 10);

const today = () => {
    const d = new Date();
    return toIso(d);
};

const yesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toIso(d);
};

const thisMonthStart = () => {
    const d = new Date();
    return toIso(new Date(d.getFullYear(), d.getMonth(), 1));
};

const thisYearStart = () => {
    const d = new Date();
    return toIso(new Date(d.getFullYear(), 0, 1));
};

const PRESETS = [
    { label: 'Today', key: 'today' },
    { label: 'Yesterday', key: 'yesterday' },
    { label: 'This Month', key: 'thisMonth' },
    { label: 'This Year', key: 'thisYear' },
    { label: 'Custom', key: 'custom' },
];

function resolvePreset(key) {
    const t = today();
    if (key === 'today') return { fromDate: t, toDate: t };
    if (key === 'yesterday') return { fromDate: yesterday(), toDate: yesterday() };
    if (key === 'thisMonth') return { fromDate: thisMonthStart(), toDate: t };
    if (key === 'thisYear') return { fromDate: thisYearStart(), toDate: t };
    return null;
}

function formatLabel(fromDate, toDate, preset) {
    if (preset !== 'custom') {
        return PRESETS.find(p => p.key === preset)?.label || 'Today';
    }
    if (fromDate && toDate) {
        if (fromDate === toDate) return fromDate;
        return `${fromDate} – ${toDate}`;
    }
    return fromDate || toDate || 'Custom';
}

export default function DateFilter({ onChange, defaultPreset = 'today' }) {
    const [preset, setPreset] = useState(defaultPreset);
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [open, setOpen] = useState(false);
    const [pendingFrom, setPendingFrom] = useState('');
    const [pendingTo, setPendingTo] = useState('');
    const ref = useRef(null);

    // Emit initial value on mount
    useEffect(() => {
        const resolved = resolvePreset(defaultPreset);
        if (resolved) onChange(resolved);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const applyPreset = (key) => {
        setPreset(key);
        if (key !== 'custom') {
            setOpen(false);
            const resolved = resolvePreset(key);
            onChange(resolved);
        }
    };

    const applyCustom = () => {
        if (!pendingFrom || !pendingTo) return;
        setCustomFrom(pendingFrom);
        setCustomTo(pendingTo);
        setOpen(false);
        onChange({ fromDate: pendingFrom, toDate: pendingTo });
    };

    const { fromDate: resolvedFrom, toDate: resolvedTo } = (preset !== 'custom'
        ? resolvePreset(preset)
        : { fromDate: customFrom, toDate: customTo }) || {};

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#FDE6A9] bg-[#FFF8E7] text-sm font-medium text-gray-700 hover:bg-amber-50 transition-colors whitespace-nowrap"
            >
                <Calendar size={14} className="text-amber-500" />
                <span>{formatLabel(resolvedFrom, resolvedTo, preset)}</span>
                <ChevronDown size={14} className="text-gray-400" />
            </button>

            {open && (
                <div className="absolute top-full mt-1 left-0 z-50 bg-white rounded-xl shadow-lg border border-gray-200 w-64 p-2">
                    {PRESETS.map(p => (
                        <button
                            key={p.key}
                            onClick={() => applyPreset(p.key)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${preset === p.key ? 'bg-amber-100 text-amber-800 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}
                        >
                            {p.label}
                        </button>
                    ))}

                    {preset === 'custom' && (
                        <div className="mt-2 pt-2 border-t border-gray-100 space-y-2 px-1">
                            <div className="flex flex-col gap-3">
                                <div>
                                    <label className="text-xs text-gray-500 mb-1 block">From</label>
                                    <input
                                        type="date"
                                        value={pendingFrom}
                                        onChange={e => setPendingFrom(e.target.value)}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 mb-1 block">To</label>
                                    <input
                                        type="date"
                                        value={pendingTo}
                                        onChange={e => setPendingTo(e.target.value)}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                                    />
                                </div>
                            </div>
                            <button
                                onClick={applyCustom}
                                disabled={!pendingFrom || !pendingTo}
                                className="w-full py-1.5 rounded-lg bg-amber-400 text-white text-sm font-medium hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                Apply
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
