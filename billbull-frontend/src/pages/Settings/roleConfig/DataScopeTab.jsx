import React from 'react';
import { Building2, Users, AlertTriangle, Info } from 'lucide-react';
import { SCOPE_GRANTS } from './catalog';
import { Chip } from './ui';

const ALL_BRANCH_ROLES = new Set(['ADMIN']);

/**
 * Data scope: WHICH records a role sees, as opposed to which modules (Access Matrix) and which
 * actions. Record-level scope is a per-role switch; branch scope is per user and is shown here
 * read-only so the admin sees the full picture in one place.
 */
export default function DataScopeTab({ role, saved, draft, onGrant, ownershipFilteringEnabled, users }) {
  const granted = (key) => !!draft[key]?.canView;
  const dirty = (key) => !!saved[key]?.canView !== granted(key);
  const bypass = role.name === 'ADMIN' || role.name === 'BRANCH_ADMIN';
  const holders = users.filter(u => u.active !== false && (u.roles || []).includes(role.name));

  return (
    <div className="p-4 sm:p-5 space-y-5">
      {/* Record scope */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-700">Record visibility</h3>
          <p className="text-[11px] text-slate-400">Choose whether users with this role see everyone's records or only the ones they created.</p>
        </div>

        {!ownershipFilteringEnabled && (
          <div className="flex items-start gap-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <Info size={13} className="shrink-0 mt-0.5 text-slate-400" />
            <span>
              Company-wide ownership filtering is <strong>off</strong>, so every user currently sees all transactions.
              The first setting below takes effect once it is switched on (<code className="text-[10px]">ownership.filtering.enabled</code>).
            </span>
          </div>
        )}
        {bypass && (
          <div className="flex items-start gap-2 text-[11px] text-purple-700 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
            <Info size={13} className="shrink-0 mt-0.5" />
            <span>{role.name} always sees every record in its branches — record-visibility settings don't restrict it.</span>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          {SCOPE_GRANTS.map(s => {
            const all = granted(s.key);
            return (
              <div key={s.key} className={`rounded-xl border p-3.5 ${dirty(s.key) ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-700">{s.label}</div>
                  {dirty(s.key) && <Chip tone="blue">unsaved</Chip>}
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5 mb-3 min-h-[28px]">{s.description}</p>
                <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 rounded-lg" role="radiogroup" aria-label={s.label}>
                  {[false, true].map(v => (
                    <button
                      key={String(v)}
                      role="radio"
                      aria-checked={all === v}
                      onClick={() => all !== v && onGrant(s.key, v)}
                      className={`text-[10px] font-semibold px-2 py-1.5 rounded-md transition-colors leading-tight
                        ${all === v ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {v ? s.allLabel : s.ownLabel}
                    </button>
                  ))}
                </div>
                {s.dependsOnOwnership && !ownershipFilteringEnabled && (
                  <p className="text-[9px] text-slate-400 mt-1.5">Inactive while ownership filtering is off.</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Branch scope */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Building2 size={14} className="text-slate-400" /> Branch scope</h3>
          <p className="text-[11px] text-slate-400">
            Branch access belongs to each user, not to the role: their home branch plus any additional branches,
            assigned under Payroll &amp; Employees › employee login access.
            {ALL_BRANCH_ROLES.has(role.name) ? ' ADMIN can switch to every branch.' : ''}
            {role.name === 'BRANCH_ADMIN' ? ' BRANCH_ADMIN is restricted to the branches assigned to each user.' : ''}
          </p>
        </div>
        {holders.length === 0 ? (
          <div className="text-[11px] text-slate-400 flex items-center gap-2 border border-dashed border-slate-200 rounded-lg px-3 py-3">
            <Users size={13} /> No active users hold this role.
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">User</th>
                  <th className="text-left font-semibold px-3 py-2">Home branch</th>
                  <th className="text-left font-semibold px-3 py-2">Additional branches</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {holders.map(u => (
                  <tr key={u.id}>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-700">{u.fullName || u.username}</div>
                      <div className="text-[10px] text-slate-400">{u.username}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {u.branchName || (
                        <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle size={11} /> None</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(u.additionalBranches || []).length === 0
                          ? <span className="text-slate-300">—</span>
                          : u.additionalBranches.map(b => <Chip key={b.id}>{b.name || b.code}</Chip>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
