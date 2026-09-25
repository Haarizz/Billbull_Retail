import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * "Salesperson Setup Required" — shown when Set Targets enforcement is on and this month's
 * configuration is incomplete.
 *
 * <p>Deliberately lists WHO is unconfigured and WHICH half is missing. A refusal that only says
 * "targets are incomplete" leaves the cashier with nothing to act on and nobody to call; this is
 * the difference between a blocker and a dead end.
 *
 * <p>There is no "go and fix it" navigation button. Leaving the POS would discard the cart that is
 * already on screen, and target configuration is an HR-permission task the cashier almost
 * certainly cannot perform anyway. Close, and fetch someone who can.
 *
 * <p>Renders the same payload whether it came from the advisory `GET /api/hr/targets/readiness`
 * or from the checkout's 409 refusal body — they are the same DTO, produced by the same service.
 */
export default function TargetReadinessWarning({ open, readiness, onClose }) {
  if (!open || !readiness) return null;

  const missing = Array.isArray(readiness.missing) ? readiness.missing : [];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-[0_20px_60px_rgba(15,23,42,0.25)] overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-3 min-w-0">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-amber-900">Salesperson Setup Required</h2>
              <p className="mt-1 text-sm text-amber-800">
                Sales cannot be completed because the monthly salesperson target / commission
                configuration is incomplete.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close salesperson setup warning"
            className="rounded-lg p-1.5 text-amber-700 hover:bg-amber-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="mb-3 text-sm text-gray-600">
            Every active <strong>Salesperson</strong> and <strong>Cashier + Salesperson</strong>{' '}
            must have a target and a commission rate for this month before any POS sale is allowed
            — not only the salesperson on this sale.
          </p>

          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">
            Missing configuration
          </p>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left">Employee</th>
                  <th className="px-3 py-2 text-left">Role</th>
                  <th className="px-3 py-2 text-left">Target</th>
                  <th className="px-3 py-2 text-left">Commission</th>
                </tr>
              </thead>
              <tbody>
                {missing.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                      No details were returned.
                    </td>
                  </tr>
                ) : missing.map((row) => (
                  <tr key={row.employeeId ?? row.employeeCode} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-[#1E293B] truncate">{row.employeeName || '—'}</div>
                      <div className="text-xs text-gray-500">{row.employeeCode || '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{row.role || '—'}</td>
                    <td className={`px-3 py-2 ${row.missingTarget ? 'font-semibold text-red-600' : 'text-emerald-600'}`}>
                      {row.missingTarget ? 'Missing' : 'Set'}
                    </td>
                    <td className={`px-3 py-2 ${row.missingCommission ? 'font-semibold text-red-600' : 'text-emerald-600'}`}>
                      {row.missingCommission ? 'Missing' : 'Set'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            Ask an administrator to complete this in Employees &amp; Roles → Set Targets. A
            commission of 0% counts as configured.
          </p>
        </div>

        <div className="flex items-center justify-end border-t border-gray-200 bg-gray-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#327F74] px-5 py-2.5 text-sm font-bold text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
