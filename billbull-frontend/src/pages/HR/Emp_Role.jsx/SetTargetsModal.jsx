import React, { useEffect, useMemo, useState } from 'react';
import { X, Target, Loader2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { saveEmployeeTargetsBulk } from '../../../api/employeeTargetsApi';
import { monthLabel, recentMonths } from './useEmployeePerformance';

/**
 * The monthly Set Targets grid: one row per employee, editable target amount and commission %.
 *
 * Client-side validation here is a convenience only — the same rules are enforced server-side in
 * EmployeeSalesTargetService, which is the authority. A row that fails here never reaches the API;
 * a row that somehow does is rejected there.
 */
const MAX_RATE = 100;

/**
 * What the grid will SAVE for this row, spelled out.
 *
 * A blank commission field means NULL ("not configured"), and an explicit 0 means a real 0%
 * commission. Those are two different saves with two different consequences — NULL blocks POS
 * sales when SetTargets is on, 0 does not — and they look almost identical in an input box, so
 * the status column says which one the admin is about to write.
 */
const draftStatus = (d) => {
    const blank = (v) => v === '' || v == null;
    const missingTarget = blank(d.targetAmount) || Number(d.targetAmount) <= 0;
    const missingCommission = blank(d.commissionRate);
    if (missingTarget && missingCommission) return 'Missing Target & Commission';
    if (missingTarget) return 'Missing Target';
    if (missingCommission) return 'Missing Commission';
    return 'Ready';
};

const validateRow = (row) => {
    const amount = row.targetAmount === '' || row.targetAmount == null ? 0 : Number(row.targetAmount);
    const rate = row.commissionRate === '' || row.commissionRate == null ? 0 : Number(row.commissionRate);
    if (!Number.isFinite(amount) || amount < 0) return 'Target must be 0 or more';
    if (!Number.isFinite(rate) || rate < 0) return 'Commission must be 0 or more';
    if (rate > MAX_RATE) return 'Commission cannot exceed 100%';
    return '';
};

export default function SetTargetsModal({
    open,
    onClose,
    month,
    onMonthChange,
    rows = [],
    loading = false,
    onSaved,
    focusEmployeeId = null,
}) {
    const [draft, setDraft] = useState({});
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);

    // Re-seed whenever the server rows change (month switch, or a reload after save).
    useEffect(() => {
        if (!open) return;
        const seeded = {};
        rows.forEach(r => {
            seeded[r.employeeId] = {
                targetAmount: r.targetAmount != null ? String(r.targetAmount) : '',
                commissionRate: r.commissionRate != null ? String(r.commissionRate) : '',
            };
        });
        setDraft(seeded);
    }, [open, rows]);

    useEffect(() => { if (!open) setSearch(''); }, [open]);

    const visibleRows = useMemo(() => {
        const q = search.trim().toLowerCase();
        const base = focusEmployeeId
            ? rows.filter(r => String(r.employeeId) === String(focusEmployeeId))
            : rows;
        if (!q) return base;
        return base.filter(r => [r.employeeName, r.employeeCode, r.role, r.department]
            .some(v => String(v || '').toLowerCase().includes(q)));
    }, [rows, search, focusEmployeeId]);

    const errors = useMemo(() => {
        const out = {};
        Object.entries(draft).forEach(([employeeId, row]) => {
            const msg = validateRow(row);
            if (msg) out[employeeId] = msg;
        });
        return out;
    }, [draft]);

    const hasErrors = Object.keys(errors).length > 0;

    const update = (employeeId, field, value) => {
        setDraft(prev => ({
            ...prev,
            [employeeId]: { ...(prev[employeeId] || {}), [field]: value },
        }));
    };

    const handleSave = async () => {
        if (hasErrors) {
            toast.error('Fix the highlighted rows before saving.');
            return;
        }
        // Only send rows the user actually filled in or changed — an untouched employee with no
        // target stays without one rather than getting a phantom zero target.
        const payload = rows
            .filter(r => {
                const d = draft[r.employeeId];
                if (!d) return false;
                const amountTouched = d.targetAmount !== '' && d.targetAmount != null;
                const rateTouched = d.commissionRate !== '' && d.commissionRate != null;
                return amountTouched || rateTouched;
            })
            .map(r => ({
                employeeId: r.employeeId,
                targetMonth: month,
                targetAmount: Number(draft[r.employeeId].targetAmount || 0),
                // A BLANK commission field is sent as null, not 0. Since Phase 2 the backend keeps
                // that null and reads it as "commission not configured", which is what blocks POS
                // sales when Set Targets enforcement is on. Coercing blank to 0 here would silently
                // mark every employee as configured at 0% and defeat the whole check. A typed 0 is
                // still an explicit, complete 0% configuration.
                commissionRate: (draft[r.employeeId].commissionRate === ''
                    || draft[r.employeeId].commissionRate == null)
                    ? null
                    : Number(draft[r.employeeId].commissionRate),
            }));

        if (payload.length === 0) {
            toast.error('Nothing to save.');
            return;
        }
        setSaving(true);
        try {
            await saveEmployeeTargetsBulk(payload);
            toast.success(`Saved ${payload.length} target${payload.length === 1 ? '' : 's'} for ${monthLabel(month)}`);
            onSaved?.();
            onClose?.();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to save targets.');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-2 min-w-0">
                        <Target size={18} className="text-[#F5C742] shrink-0" />
                        <div className="min-w-0">
                            <h3 className="text-base font-bold text-slate-900 truncate">Set Targets</h3>
                            <p className="text-xs text-slate-500">Monthly sales target and commission rate per employee</p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="p-1.5 rounded hover:bg-slate-100 text-slate-500">
                        <X size={18} />
                    </button>
                </div>

                <div className="px-5 py-3 border-b border-slate-200 flex flex-col sm:flex-row gap-3">
                    <label className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500 text-xs font-semibold uppercase">Month</span>
                        <select
                            value={month}
                            onChange={(e) => onMonthChange?.(e.target.value)}
                            aria-label="Target month"
                            className="border border-slate-200 rounded-md px-2 py-1.5 text-sm bg-white"
                        >
                            {recentMonths().map(m => (
                                <option key={m} value={m}>{monthLabel(m)}</option>
                            ))}
                        </select>
                    </label>
                    {!focusEmployeeId && (
                        <div className="relative flex-1 min-w-0">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search employee, code, role…"
                                aria-label="Search employees"
                                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-md"
                            />
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="p-8 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
                            <Loader2 size={16} className="animate-spin" /> Loading employees…
                        </div>
                    ) : visibleRows.length === 0 ? (
                        <div className="p-8 text-center text-sm text-slate-400">No employees found.</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-[#F7F7FA] text-slate-500 sticky top-0">
                                <tr>
                                    <th className="px-5 py-3 text-left font-semibold text-xs uppercase">Employee</th>
                                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase">Role</th>
                                    <th className="px-4 py-3 text-right font-semibold text-xs uppercase">Target (AED)</th>
                                    <th className="px-4 py-3 text-right font-semibold text-xs uppercase">Commission %</th>
                                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {visibleRows.map(r => {
                                    const d = draft[r.employeeId] || { targetAmount: '', commissionRate: '' };
                                    const err = errors[r.employeeId];
                                    return (
                                        <tr key={r.employeeId} className={err ? 'bg-red-50' : ''}>
                                            <td className="px-5 py-2.5">
                                                <div className="font-medium text-slate-800">{r.employeeName}</div>
                                                <div className="text-[11px] text-slate-400">{r.employeeCode}</div>
                                                {err && <div className="text-[11px] text-red-600 mt-0.5">{err}</div>}
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-500 text-xs">{r.role || '—'}</td>
                                            <td className="px-4 py-2.5 text-right">
                                                <input
                                                    type="number" min="0" step="0.01"
                                                    value={d.targetAmount}
                                                    onChange={(e) => update(r.employeeId, 'targetAmount', e.target.value)}
                                                    aria-label={`Target for ${r.employeeName}`}
                                                    className="w-32 text-right border border-slate-200 rounded px-2 py-1 text-sm"
                                                    placeholder="0.00"
                                                />
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <input
                                                    type="number" min="0" max="100" step="0.01"
                                                    value={d.commissionRate}
                                                    onChange={(e) => update(r.employeeId, 'commissionRate', e.target.value)}
                                                    aria-label={`Commission rate for ${r.employeeName}`}
                                                    className="w-24 text-right border border-slate-200 rounded px-2 py-1 text-sm"
                                                    placeholder="Blank = not set"
                                                />
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {(() => {
                                                    const status = draftStatus(d);
                                                    return (
                                                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                                                            status === 'Ready'
                                                                ? 'bg-green-100 text-green-700'
                                                                : 'bg-rose-100 text-rose-700'}`}>
                                                            {status}
                                                        </span>
                                                    );
                                                })()}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-3">
                    <p className="text-[11px] text-slate-400">
                        Targets are global per employee for the month — they are not split by branch.
                    </p>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-3 py-2 text-sm rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || hasErrors || loading}
                            className="px-4 py-2 text-sm rounded-md bg-[#F5C742] text-slate-900 font-semibold hover:brightness-95 disabled:opacity-50 flex items-center gap-2"
                        >
                            {saving && <Loader2 size={14} className="animate-spin" />}
                            Save All
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
