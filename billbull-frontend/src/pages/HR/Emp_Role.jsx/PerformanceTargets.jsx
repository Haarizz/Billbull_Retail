import React, { useEffect, useState } from 'react';
import { Loader2, Info, AlertTriangle, X } from 'lucide-react';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { getTargetReadiness } from '../../../api/employeeTargetsApi';
import { isSalespersonRole } from '../../../utils/salespersonRoles';
import { monthLabel, recentMonths } from './useEmployeePerformance';

const DASH = '—';

const pct = (value) => (value == null ? DASH : `${Number(value).toFixed(2)}%`);

/**
 * Is this row's month configured? Mirrors the server's `TargetReadinessService`:
 *
 *   target      — configured when it is present AND greater than zero
 *   commission  — configured when it is NOT NULL. **0% is a complete configuration**, and the
 *                 most common way to get this wrong is to test `rate > 0`, which would show a
 *                 deliberate 0% as "Missing Commission" and send an admin hunting for a problem
 *                 that does not exist.
 *
 * Non-eligible designations are not evaluated at all: the rule only applies to ACTIVE
 * Salesperson / Cashier + Salesperson employees, and marking a storekeeper "Missing Target" would
 * be noise hiding the rows that actually block the tills.
 */
const configStatus = (row) => {
    if (!isSalespersonRole(row.role)) return null;
    if (String(row.employeeStatus ?? '').trim().toLowerCase() !== 'active') return null;
    const missingTarget = row.targetAmount == null || Number(row.targetAmount) <= 0;
    const missingCommission = row.commissionRate == null;
    if (missingTarget && missingCommission) return 'Missing Target & Commission';
    if (missingTarget) return 'Missing Target';
    if (missingCommission) return 'Missing Commission';
    return 'Ready';
};

const configChip = (status) => (status === 'Ready'
    ? 'bg-green-100 text-green-700'
    : 'bg-rose-100 text-rose-700');

const statusChip = (status) => {
    const map = {
        'Target Reached': 'bg-green-100 text-green-700',
        'On Track': 'bg-amber-100 text-amber-700',
        'Below Target': 'bg-rose-100 text-rose-700',
        'No Target': 'bg-slate-100 text-slate-500',
    };
    return map[status] || 'bg-slate-100 text-slate-500';
};

/**
 * Admin Performance & Targets.
 *
 * Every figure rendered here — sales, bills, achievement, commission and all four totals — is
 * computed server-side. This component formats; it never derives a business number. In particular
 * "Overall Achievement" is the server's SUM(sales)/SUM(target), not an average of the rows.
 */
export default function PerformanceTargets({
    month,
    onMonthChange,
    branches = [],
    branchId,
    onBranchChange,
    performance,
    loading,
    error,
    onOpenSetTargets,
    canEditTargets = false,
}) {
    const rows = performance?.rows || [];
    const branchFiltered = !!performance?.branchFiltered;

    // Readiness is READ here, never re-derived: the banner must agree with the refusal the POS
    // issues, and two implementations of "is this month configured?" would eventually disagree.
    const [readiness, setReadiness] = useState(null);
    const [showMissing, setShowMissing] = useState(false);

    // Re-read whenever the month changes or targets are saved (the same reload refetches
    // `performance`), so completing the last missing employee clears the banner in place.
    // `cancelled` guards the late response from a month the user has already moved away from.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const result = await getTargetReadiness({ month });
                if (!cancelled) setReadiness(result);
            } catch (_) {
                // Advisory: a failed read hides the banner, it never invents one. The checkout
                // gate still refuses the sale, so nothing is let through by this being quiet.
                if (!cancelled) setReadiness(null);
            }
        })();
        return () => { cancelled = true; };
    }, [month, performance]);

    return (
        <div className="space-y-4">

            {/* Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500 text-xs font-semibold uppercase">Month</span>
                    <select
                        value={month}
                        onChange={(e) => onMonthChange?.(e.target.value)}
                        aria-label="Performance month"
                        className="border border-slate-200 rounded-md px-2 py-1.5 text-sm bg-white"
                    >
                        {recentMonths().map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
                    </select>
                </label>

                <label className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500 text-xs font-semibold uppercase">Branch</span>
                    <select
                        value={branchId ?? 'All'}
                        onChange={(e) => onBranchChange?.(e.target.value === 'All' ? null : e.target.value)}
                        aria-label="Performance branch"
                        className="border border-slate-200 rounded-md px-2 py-1.5 text-sm bg-white"
                    >
                        <option value="All">All Branches</option>
                        {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                </label>

                {canEditTargets && (
                    <button
                        onClick={onOpenSetTargets}
                        className="sm:ml-auto px-3 py-2 text-sm rounded-md bg-[#F5C742] text-slate-900 font-semibold hover:brightness-95"
                    >
                        Set Targets
                    </button>
                )}
            </div>

            {/* Target readiness — the SAME evaluation the POS checkout gate runs, so an admin
                finds out here rather than from a cashier whose sale has just been refused. A
                persistent banner and not an auto-opening modal: this screen is opened many times a
                day, and a dialog on every visit trains people to dismiss it unread. */}
            {readiness?.required && readiness?.ready === false && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200">
                    <AlertTriangle size={18} className="shrink-0 text-rose-600" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-rose-800">Salesperson Setup Incomplete</p>
                        <p className="text-xs text-rose-700 mt-0.5">
                            {readiness.missing.length} active Salesperson / Cashier + Salesperson
                            {readiness.missing.length === 1 ? ' employee is' : ' employees are'} missing
                            this month&apos;s target or commission configuration.{' '}
                            <strong>POS sales are currently blocked.</strong>
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowMissing(true)}
                        className="shrink-0 px-3 py-2 text-xs font-semibold rounded-md bg-rose-600 text-white hover:bg-rose-700"
                    >
                        Review Missing Employees
                    </button>
                </div>
            )}

            {showMissing && readiness?.missing?.length > 0 && (
                <MissingConfigDialog missing={readiness.missing} onClose={() => setShowMissing(false)} />
            )}

            {/*
              A branch filter narrows SALES but not the TARGET — targets are global per employee,
              because an employee sells across branches. Comparing one branch's sales to a whole
              company target would be a misleading percentage, so the server suppresses achievement
              for this view and we say why rather than rendering a silently-wrong number.
            */}
            {branchFiltered && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-[#FFF8E7] border border-[#FDE6A9] text-xs text-slate-600">
                    <Info size={14} className="mt-0.5 shrink-0 text-[#F5C742]" />
                    <span>
                        Showing sales for the selected branch only. Targets are global per employee,
                        so achievement is not shown for a single-branch view — switch to
                        <strong> All Branches</strong> to see achievement against target.
                    </span>
                </div>
            )}

            {error && (
                <div className="px-3 py-2 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    {error}
                </div>
            )}

            {/* Server-computed totals */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <SummaryCard label="Total Target" value={performance ? <CurrencyAmount value={performance.totalTarget} /> : DASH} />
                <SummaryCard
                    label="Attributed Sales"
                    value={performance ? <CurrencyAmount value={performance.totalSales} /> : DASH}
                    hint="Invoices with a salesperson"
                />
                <SummaryCard
                    label="Overall Achievement"
                    value={performance ? pct(performance.overallAchievementPercent) : DASH}
                    hint={branchFiltered ? 'Not shown for a single branch' : 'Attributed sales ÷ total target'}
                />
                <SummaryCard label="Total Commission" value={performance ? <CurrencyAmount value={performance.totalCommission} /> : DASH} />
            </div>

            {/* Unassigned bucket — invoices whose salespersonEmployeeId is NULL: POS sales rung up
                with no salesperson, every back-office invoice (that screen does not record one yet)
                and every invoice from before salesperson tracking existed. Presentation only: they
                are never attributed to anyone, and never counted in any employee's figures. */}
            {performance && Number(performance.unassignedSales) > 0 && (
                <div
                    data-testid="unassigned-sales"
                    className="flex items-start gap-2 px-3 py-2 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-600"
                >
                    <Info size={14} className="mt-0.5 shrink-0 text-slate-400" />
                    <div>
                        <p>
                            <strong>Unassigned Sales:</strong>{' '}
                            <CurrencyAmount value={performance.unassignedSales} /> across {performance.unassignedBills} bill(s)
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            Invoices with no salesperson recorded — including back-office invoices and
                            invoices from before salesperson tracking began. They are not included in any
                            employee&apos;s sales, achievement or commission above.
                        </p>
                    </div>
                </div>
            )}

            {/* Employee table */}
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="bb-nowrap-table w-full text-sm text-left">
                        <thead className="bg-[#F7F7FA] text-slate-500 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 font-semibold text-xs uppercase">Employee</th>
                                <th className="px-4 py-4 font-semibold text-xs uppercase">Role / Dept</th>
                                <th className="px-4 py-4 font-semibold text-xs uppercase">Branch</th>
                                <th className="px-4 py-4 font-semibold text-xs uppercase text-right">Sales</th>
                                <th className="px-4 py-4 font-semibold text-xs uppercase text-right">Bills</th>
                                <th className="px-4 py-4 font-semibold text-xs uppercase text-right">Target</th>
                                <th className="px-4 py-4 font-semibold text-xs uppercase text-right">Achievement</th>
                                <th className="px-4 py-4 font-semibold text-xs uppercase text-right">Commission</th>
                                <th className="px-4 py-4 font-semibold text-xs uppercase">Status</th>
                                <th className="px-4 py-4 font-semibold text-xs uppercase">Configuration</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && (
                                <tr><td colSpan="10" className="px-6 py-12 text-center text-slate-400">
                                    <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading performance…</span>
                                </td></tr>
                            )}
                            {!loading && rows.length === 0 && (
                                <tr><td colSpan="10" className="px-6 py-12 text-center text-slate-400">
                                    No employee performance for {monthLabel(month)}.
                                </td></tr>
                            )}
                            {!loading && rows.map(row => (
                                <tr key={row.employeeId} className="hover:bg-slate-50">
                                    <td className="px-6 py-3">
                                        <div className="font-medium text-slate-800">{row.employeeName}</div>
                                        <div className="text-[11px] text-slate-400">
                                            {row.employeeCode}
                                            {row.employeeStatus && row.employeeStatus.toLowerCase() !== 'active' && (
                                                <span className="ml-1 text-rose-500">· {row.employeeStatus}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-500">
                                        {row.role || DASH}{row.department ? ` / ${row.department}` : ''}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-500">{row.branchName || DASH}</td>
                                    <td className="px-4 py-3 text-right font-medium"><CurrencyAmount value={row.sales} /></td>
                                    <td className="px-4 py-3 text-right text-slate-500">{row.bills}</td>
                                    <td className="px-4 py-3 text-right">
                                        {row.targetAmount != null ? <CurrencyAmount value={row.targetAmount} /> : DASH}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {row.achievementPercent == null ? (
                                            <span className="text-slate-400">{DASH}</span>
                                        ) : (
                                            <div className="inline-flex flex-col items-end gap-1 w-24">
                                                <span className="text-xs font-medium">{pct(row.achievementPercent)}</span>
                                                <div className="w-full bg-slate-200 rounded-full h-1.5">
                                                    <div
                                                        className="bg-[#F5C742] h-1.5 rounded-full"
                                                        style={{ width: `${Math.min(100, Math.max(0, Number(row.achievementPercent)))}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {row.commission == null ? (
                                            <span className="text-slate-400">{DASH}</span>
                                        ) : (
                                            <div className="inline-flex flex-col items-end">
                                                <CurrencyAmount value={row.commission} />
                                                {/* Commission is earned only once the target is
                                                    reached, so a 0.00 needs its reason attached:
                                                    "0% rate, target met" and "target missed" are
                                                    different answers that must not look alike. */}
                                                {row.commissionStatus && (
                                                    <span className={`text-[10px] ${row.commissionEligible ? 'text-green-600' : 'text-slate-400'}`}>
                                                        {row.commissionStatus}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        {row.targetStatus ? (
                                            <span className={`text-[11px] px-2 py-0.5 rounded-full ${statusChip(row.targetStatus)}`}>
                                                {row.targetStatus}
                                            </span>
                                        ) : <span className="text-slate-400 text-xs">{DASH}</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        {(() => {
                                            const status = configStatus(row);
                                            if (!status) return <span className="text-slate-400 text-xs">{DASH}</span>;
                                            return (
                                                <span className={`text-[11px] px-2 py-0.5 rounded-full ${configChip(status)}`}>
                                                    {status}
                                                </span>
                                            );
                                        })()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

/**
 * The rows blocking the tills, named. Deliberately the server's `missing` list rather than a
 * filter over the grid: the grid can be branch-filtered or narrowed, and a banner that says "3
 * employees" must show those three whatever the screen is currently displaying.
 */
const MissingConfigDialog = ({ missing, onClose }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div className="w-full max-w-lg rounded-lg bg-white shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-700">Missing Configuration</h3>
                <button onClick={onClose} aria-label="Close missing configuration" className="text-slate-400 hover:text-slate-600">
                    <X size={16} />
                </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-[#F7F7FA] text-slate-500 sticky top-0">
                        <tr>
                            <th className="px-4 py-2.5 font-semibold text-xs uppercase">Employee</th>
                            <th className="px-4 py-2.5 font-semibold text-xs uppercase">Target</th>
                            <th className="px-4 py-2.5 font-semibold text-xs uppercase">Commission</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {missing.map(m => (
                            <tr key={m.employeeId}>
                                <td className="px-4 py-2.5">
                                    <div className="font-medium text-slate-800">{m.employeeName}</div>
                                    <div className="text-[11px] text-slate-400">{m.employeeCode} · {m.role}</div>
                                </td>
                                <td className={`px-4 py-2.5 text-xs ${m.missingTarget ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
                                    {m.missingTarget ? 'Missing' : 'Set'}
                                </td>
                                <td className={`px-4 py-2.5 text-xs ${m.missingCommission ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
                                    {m.missingCommission ? 'Missing' : 'Set'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-4 py-3">
                <button onClick={onClose} className="px-3 py-2 text-xs font-medium rounded text-slate-600 hover:bg-slate-200">
                    Close
                </button>
            </div>
        </div>
    </div>
);

const SummaryCard = ({ label, value, hint }) => (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-lg font-bold text-slate-900 mt-1">{value}</p>
        {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
);
