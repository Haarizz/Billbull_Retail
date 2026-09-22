import React from 'react';
import { Loader2, Info } from 'lucide-react';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { monthLabel, recentMonths } from './useEmployeePerformance';

const DASH = '—';

const pct = (value) => (value == null ? DASH : `${Number(value).toFixed(2)}%`);

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
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && (
                                <tr><td colSpan="9" className="px-6 py-12 text-center text-slate-400">
                                    <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading performance…</span>
                                </td></tr>
                            )}
                            {!loading && rows.length === 0 && (
                                <tr><td colSpan="9" className="px-6 py-12 text-center text-slate-400">
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
                                    <td className="px-4 py-3 text-right"><CurrencyAmount value={row.commission} /></td>
                                    <td className="px-4 py-3">
                                        {row.targetStatus ? (
                                            <span className={`text-[11px] px-2 py-0.5 rounded-full ${statusChip(row.targetStatus)}`}>
                                                {row.targetStatus}
                                            </span>
                                        ) : <span className="text-slate-400 text-xs">{DASH}</span>}
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

const SummaryCard = ({ label, value, hint }) => (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-lg font-bold text-slate-900 mt-1">{value}</p>
        {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
);
