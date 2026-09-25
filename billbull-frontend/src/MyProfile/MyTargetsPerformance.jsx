import React, { useEffect, useState } from 'react';
import { Target, BarChart2, Loader2, Info } from 'lucide-react';
import CurrencyAmount from '../components/CurrencyAmount';
import { getMyPerformance } from '../api/employeeTargetsApi';
import { monthKey, monthLabel, recentMonths } from '../pages/HR/Emp_Role.jsx/useEmployeePerformance';

const DASH = '—';

/**
 * My Profile → Targets / Performance.
 *
 * Always self-scoped by the SERVER: the endpoint resolves the employee from the authenticated
 * principal's linked employee and accepts no employeeId, so there is no request an employee could
 * edit to read a colleague's figures. This component never sends an identity of any kind.
 *
 * `mode` selects which of the two tabs to render; both read the same payload.
 */
export default function MyTargetsPerformance({ mode = 'Targets' }) {
    const [month, setMonth] = useState(() => monthKey());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notLinked, setNotLinked] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            setNotLinked(false);
            try {
                const payload = await getMyPerformance({ month });
                if (cancelled) return;
                // 204 → the signed-in user has no linked employee record.
                if (!payload) { setData(null); setNotLinked(true); return; }
                setData(payload);
            } catch {
                if (!cancelled) { setData(null); setError('Failed to load your performance data.'); }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [month]);

    const Icon = mode === 'Performance' ? BarChart2 : Target;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-sm text-slate-400 gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading your {mode.toLowerCase()}…
            </div>
        );
    }

    if (notLinked) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <Info className="h-8 w-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">{mode}</h3>
                <p className="text-slate-500 text-xs max-w-xs mx-auto mt-2 leading-relaxed">
                    Your login is not linked to an employee record, so there are no targets or
                    sales to show. Ask an administrator to link your account.
                </p>
            </div>
        );
    }

    if (error) {
        return <div className="py-20 text-center text-sm text-rose-600">{error}</div>;
    }

    const achieved = data?.achievementPercent;
    const progress = achieved == null ? 0 : Math.min(100, Math.max(0, Number(achieved)));

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-2 min-w-0">
                    <Icon className="h-5 w-5 text-[#F5C742] shrink-0" />
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-slate-900 truncate">My {mode}</h3>
                        <p className="text-xs text-slate-500 truncate">
                            {data?.employeeName}{data?.employeeCode ? ` · ${data.employeeCode}` : ''}
                        </p>
                    </div>
                </div>
                <label className="flex items-center gap-2 text-sm shrink-0">
                    <span className="text-slate-500 text-xs font-semibold uppercase">Month</span>
                    <select
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        aria-label="Month"
                        className="border border-slate-200 rounded-md px-2 py-1.5 text-sm bg-white"
                    >
                        {recentMonths().map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
                    </select>
                </label>
            </div>

            {mode === 'Targets' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Stat label="Target" value={data?.targetAmount != null
                        ? <CurrencyAmount value={data.targetAmount} /> : DASH} />
                    {/* The CONFIGURED rate. `0.00%` is a real rate someone set; DASH means no
                        rate has been configured at all — they are not the same thing. */}
                    <Stat label="Commission Rate" value={data?.commissionRate != null
                        ? `${Number(data.commissionRate).toFixed(2)}%` : DASH} />
                    <Stat label="Remaining Target" value={data?.remainingTarget != null
                        ? <CurrencyAmount value={data.remainingTarget} /> : DASH} />
                </div>
            ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Stat label="Sales" value={<CurrencyAmount value={data?.sales ?? 0} />} />
                    <Stat label="Target" value={data?.targetAmount != null
                        ? <CurrencyAmount value={data.targetAmount} /> : DASH} />
                    <Stat label="Achievement" value={achieved == null ? DASH : `${Number(achieved).toFixed(2)}%`} />
                    {/* Commission is EARNED ONLY once the monthly target is reached, and is then
                        paid on the full month's sales. Until then the figure is not "0.00 so far"
                        — nothing is owed — so it reads as a dash with the reason under it rather
                        than as an amount that looks like it is accruing. */}
                    <Stat
                        label="Commission"
                        value={data?.commissionEligible
                            ? <CurrencyAmount value={data?.commission ?? 0} />
                            : DASH}
                        hint={data?.commissionStatus
                            || (data?.commissionEligible ? 'Eligible' : 'Not Eligible')}
                    />
                </div>
            )}

            <div className="mt-6">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                    <span>{data?.targetStatus || 'No Target'}</span>
                    <span>
                        {achieved == null ? 'No target set for this month' : `${Number(achieved).toFixed(2)}% of target`}
                    </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5">
                    <div className="bg-[#F5C742] h-2.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
            </div>

            <p className="text-[11px] text-slate-400 mt-4">
                Based on {data?.bills ?? 0} invoice(s) in {monthLabel(month)}. Sales include every
                confirmed invoice attributed to you, across all branches; cancelled and draft
                invoices are excluded.
            </p>
        </div>
    );
}

const Stat = ({ label, value, hint }) => (
    <div className="bg-[#F7F7FA] border border-slate-200 rounded-lg p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-lg font-bold text-slate-900 mt-1">{value}</p>
        {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
);
