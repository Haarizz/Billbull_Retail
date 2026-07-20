import React from 'react';
import { useBranch } from '../../context/BranchContext';

/**
 * Branch-Level Inventory Phase 11 — small, reusable UI indicators for branch scoping.
 *
 * Every component here is a no-op (renders nothing / passes text through) unless
 * {@code branchScopeEnabled} is true for the tenant, so the UI is byte-identical when the backend
 * feature toggle is off — no cosmetic drift.
 */

/** True only when the tenant has inventory branch-scoping enabled. */
export const useBranchScopeUi = () => {
    const { branchScopeEnabled, activeBranch, isAllBranches } = useBranch();
    return {
        enabled: Boolean(branchScopeEnabled),
        activeBranch,
        isAllBranches,
        // The short branch context label ("All Branches" or the active branch name).
        contextLabel: isAllBranches ? 'All Branches' : (activeBranch?.name || 'Your Branch'),
    };
};

/**
 * "Global / Shared" badge for a master-data row that has no branch (branch_id = null). Renders
 * nothing when scoping is off, or when the row belongs to a branch. Pass the row's branchId.
 */
export const GlobalBadge = ({ branchId, className = '' }) => {
    const { enabled } = useBranchScopeUi();
    if (!enabled || branchId != null) return null;
    return (
        <span
            title="Shared across all branches"
            className={`inline-flex items-center gap-1 rounded-full border border-[#FDE6A9] bg-[#FFF8E7] px-2 py-0.5 text-[11px] font-semibold text-amber-800 ${className}`}
        >
            🌐 Global
        </span>
    );
};

/**
 * Column-header / caption label indicating stock is branch-specific, e.g. "On-hand @ North Branch"
 * or "On-hand @ All Branches (consolidated)". Falls back to the plain base label when scoping off.
 */
export const BranchStockLabel = ({ base = 'On-hand', className = '' }) => {
    const { enabled, isAllBranches, contextLabel } = useBranchScopeUi();
    if (!enabled) return <span className={className}>{base}</span>;
    const suffix = isAllBranches ? 'All Branches (consolidated)' : contextLabel;
    return (
        <span className={className} title={`Stock figures are for ${suffix}`}>
            {base} <span className="text-slate-400">@</span>{' '}
            <span className="font-semibold text-amber-800">{suffix}</span>
        </span>
    );
};

/**
 * A compact "you are viewing branch X" context chip for report/list headers. Renders nothing when
 * scoping is off.
 */
export const BranchContextIndicator = ({ className = '' }) => {
    const { enabled, isAllBranches, contextLabel } = useBranchScopeUi();
    if (!enabled) return null;
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-md border border-[#FDE6A9] bg-[#FFF8E7] px-2.5 py-1 text-xs font-medium text-amber-900 ${className}`}
            title={isAllBranches ? 'Consolidated across all branches' : `Scoped to ${contextLabel}`}
        >
            <span aria-hidden>📍</span>
            {isAllBranches ? 'All Branches' : contextLabel}
        </span>
    );
};

/**
 * Admin-only Consolidated / Active-branch selector for reports. Emits the value the backend
 * {@code ?branchScope=} param expects: "active" (default) or "all". Renders nothing when scoping is
 * off or the user cannot switch branches (non-admin). Controlled via value/onChange.
 */
export const ReportBranchScopeToggle = ({ value = 'active', onChange, className = '' }) => {
    const { enabled } = useBranchScopeUi();
    const { canSwitchBranches } = useBranch();
    if (!enabled || !canSwitchBranches) return null;
    return (
        <div className={`inline-flex rounded-md border border-slate-200 overflow-hidden text-xs ${className}`}>
            {[
                { key: 'active', label: 'Active branch' },
                { key: 'all', label: 'All branches' },
            ].map((opt) => (
                <button
                    key={opt.key}
                    type="button"
                    onClick={() => onChange?.(opt.key)}
                    className={`px-3 py-1.5 font-medium transition-colors ${
                        value === opt.key
                            ? 'bg-[#F5C742] text-slate-900'
                            : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
};
