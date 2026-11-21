import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw, Users, Monitor, X } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { getTerminalActivity } from '../../../../../api/posApi';

/**
 * Console > Terminals & Counters: recent POS activity (pos_audit_log) for the branch.
 * Only rendered for users holding permissions.pos.terminal.viewactivity — ADMIN, BRANCH_ADMIN,
 * MANAGER and SUPERVISOR by default. The backend enforces the same grant.
 */

const PAGE = 30;
const MORE = 100;
const POLL_MS = 60_000;

// Action → category. Categories drive the filter chips and the dot colour.
const CATEGORY_OF = (action = '') => {
  if (action.startsWith('SESSION_') || action === 'DAY_CLOSE_ADMIN_APPROVED') return 'shift';
  if (action.startsWith('CHECKOUT_') || action.startsWith('RETURN_') || action.startsWith('LAYAWAY_')
      || action.startsWith('HELD_SALE_') || action === 'RECEIPT_REPRINTED' || action.startsWith('OFFLINE_SALE')) return 'sales';
  if (action.startsWith('CASH_') || action.startsWith('VARIANCE_') || action === 'GL_POSTING_FAILED') return 'cash';
  if (action === 'ITEM_VOIDED' || action.includes('OVERRIDE') || action.includes('AUTHORIZED') || action.endsWith('_FAILED')) return 'alerts';
  if (action.startsWith('TERMINAL_') || action.startsWith('OFFLINE_')) return 'terminal';
  return 'other';
};

const CATEGORIES = [
  { key: 'all',      label: 'All' },
  { key: 'shift',    label: 'Shifts',   dot: 'bg-blue-500' },
  { key: 'sales',    label: 'Sales',    dot: 'bg-green-500' },
  { key: 'cash',     label: 'Cash',     dot: 'bg-amber-500' },
  { key: 'alerts',   label: 'Alerts',   dot: 'bg-red-500' },
  { key: 'terminal', label: 'Terminal', dot: 'bg-gray-400' },
];
const DOT = Object.fromEntries(CATEGORIES.filter(c => c.dot).map(c => [c.key, c.dot]));

const LABELS = {
  CHECKOUT_COMPLETED: 'Sale completed',
  CHECKOUT_FAILED: 'Checkout refused',
  ITEM_VOIDED: 'Item voided',
  SESSION_OPENED: 'Shift opened',
  SESSION_CLOSURE_STARTED: 'Shift closing started',
  SESSION_CLOSURE_CANCELLED: 'Shift closing cancelled',
  SESSION_CLOSED: 'Shift closed',
  CASH_DROP_IN: 'Cash in',
  CASH_DROP_OUT: 'Cash out',
  RECEIPT_REPRINTED: 'Receipt reprinted',
  RETURN_APPROVED: 'Return approved',
  RETURN_INITIATED: 'Return started',
};
const humanize = (action) => LABELS[action]
  || (action ? action.toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : 'Activity');

const toDate = (ts) => {
  if (!ts) return null;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
};

export default function TerminalActivityPanel({ branchId, terminals = [], terminalFilter = '', onTerminalFilterChange }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('all');
  const [limit, setLimit] = useState(PAGE);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!branchId) return;
    if (!quiet) setLoading(true);
    try {
      const data = await getTerminalActivity(branchId, { terminalId: terminalFilter || undefined, limit });
      setRows(data);
      setError('');
    } catch (e) {
      const status = e?.response?.status;
      setError(status === 403 ? 'You don’t have access to the activity log.' : 'Couldn’t load activity.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [branchId, terminalFilter, limit]);

  useEffect(() => { load(); }, [load]);

  // Light polling while the tab is visible, so a supervisor watching the floor sees new events.
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') load({ quiet: true });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const visible = useMemo(
    () => (category === 'all' ? rows : rows.filter(r => CATEGORY_OF(r.action) === category)),
    [rows, category],
  );

  const terminalOptions = useMemo(
    () => terminals
      .filter(t => t.status !== 'DECOMMISSIONED')
      .map(t => ({ id: t.terminalId, label: `${t.terminalName || t.terminalId} · ${t.terminalId}` })),
    [terminals],
  );

  return (
    <div id="terminal-activity-panel" className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#1E293B] flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-[#b8920e]" /> Recent activity
          </p>
          <p className="text-xs text-gray-400 mt-0.5 leading-snug">Shifts, sales, voids and cash movements. Visible to supervisors and admins.</p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          aria-label="Refresh activity"
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-60 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="relative">
        <select
          value={terminalFilter}
          onChange={e => onTerminalFilterChange?.(e.target.value)}
          aria-label="Filter activity by terminal"
          className="w-full h-8 pl-2.5 pr-7 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40"
        >
          <option value="">All terminals</option>
          {terminalOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        {terminalFilter && (
          <button
            type="button"
            onClick={() => onTerminalFilterChange?.('')}
            aria-label="Clear terminal filter"
            className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-semibold border transition-colors ${
              category === c.key ? 'bg-[#1E293B] text-white border-[#1E293B]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {c.dot && <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />}{c.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="text-xs text-red-500 font-semibold">{error}</p>
      ) : loading && rows.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-gray-50 rounded-lg animate-pulse" />)}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">No activity to show.</p>
      ) : (
        <ol className="max-h-[420px] overflow-y-auto -mx-1 px-1 divide-y divide-gray-50">
          {visible.map(r => {
            const cat = CATEGORY_OF(r.action);
            const at = toDate(r.createdAt);
            return (
              <li key={r.id} className="py-2 flex gap-2.5">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${DOT[cat] || 'bg-gray-300'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-[#1E293B] truncate">{humanize(r.action)}</span>
                    {at && (
                      <time
                        dateTime={at.toISOString()}
                        title={format(at, 'dd MMM yyyy, HH:mm:ss')}
                        className="text-[10px] text-gray-400 whitespace-nowrap"
                      >
                        {formatDistanceToNow(at, { addSuffix: true })}
                      </time>
                    )}
                  </div>
                  {r.description && (
                    <p className="text-[11px] text-gray-500 leading-snug line-clamp-2 break-words">{r.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-gray-400">
                    {r.userId && (
                      <span className="flex items-center gap-1"><Users className="h-2.5 w-2.5" />{r.userDisplayName || r.userId}</span>
                    )}
                    {r.terminalId && !terminalFilter && (
                      <button
                        type="button"
                        onClick={() => onTerminalFilterChange?.(r.terminalId)}
                        className="flex items-center gap-1 hover:text-[#327F74] hover:underline"
                        title="Show only this terminal"
                      >
                        <Monitor className="h-2.5 w-2.5" />{r.terminalName || r.terminalId}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {!error && rows.length >= limit && limit < MORE && (
        <button
          type="button"
          onClick={() => setLimit(MORE)}
          className="w-full h-8 text-xs font-semibold text-[#327F74] border border-[#327F74]/30 rounded-lg hover:bg-[#327F74]/5"
        >
          Show more
        </button>
      )}
    </div>
  );
}
