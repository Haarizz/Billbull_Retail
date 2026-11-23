import React, { useMemo, useState } from 'react';
import { Search, Check, Minus, UserCircle2, Building2, ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react';
import { MODULES, VIEW_COLUMN, ACTION_COLUMNS, APPROVAL_GROUPS, SCOPE_GRANTS, getRoleMeta } from './catalog';
import { effectiveForUser } from './permissionModel';
import { Hint, Chip } from './ui';

const COLUMNS = [VIEW_COLUMN, ...ACTION_COLUMNS];

/**
 * What one user can actually do: the union of all their roles, resolved with the same rules the
 * server enforces (explicit page rule decides, otherwise module default; ALLOW wins across roles).
 * Read-only — it explains access, it does not change it.
 */
export default function EffectiveAccessTab({ users, roleMaps, onOpenRole }) {
  const [query, setQuery] = useState('');
  const [userId, setUserId] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());

  const q = query.trim().toLowerCase();
  const candidates = useMemo(() => users
    .filter(u => !q || (u.username || '').toLowerCase().includes(q) || (u.fullName || '').toLowerCase().includes(q)
      || (u.roles || []).some(r => r.toLowerCase().includes(q)))
    .sort((a, b) => (a.fullName || a.username).localeCompare(b.fullName || b.username)), [users, q]);

  const user = users.find(u => u.id === userId) || null;
  const maps = useMemo(() => {
    if (!user) return {};
    return Object.fromEntries((user.roles || []).map(r => [r, roleMaps[r] || {}]));
  }, [user, roleMaps]);

  const isAdmin = (user?.roles || []).includes('ADMIN');

  const cell = (key) => {
    const e = effectiveForUser(maps, key);
    return COLUMNS.map(col => {
      const on = e[col.flag];
      const src = e.sources[col.flag];
      const text = on
        ? `Granted by ${src.join(', ')}${e.mode === 'inherited' ? ' (module default)' : ''}`
        : e.mode === 'explicit' ? 'Denied by an explicit page rule' : 'Not granted by any of this user\'s roles';
      return (
        <td key={col.flag} className={`px-2 py-2 text-center ${col.flag === 'canView' ? 'bg-blue-50/30' : ''}`}>
          <Hint text={text}>
            <span className={`inline-flex w-5 h-5 items-center justify-center rounded-full cursor-help
              ${on ? (e.mode === 'inherited' ? 'bg-emerald-50 text-emerald-500' : 'bg-emerald-100 text-emerald-700') : 'text-slate-300'}`}>
              {on ? <Check size={12} strokeWidth={3} /> : <Minus size={12} />}
            </span>
          </Hint>
        </td>
      );
    });
  };

  const grantedSpecials = user ? APPROVAL_GROUPS.flatMap(g => g.grants)
    .map(gr => ({ ...gr, e: effectiveForUser(maps, gr.key) }))
    .filter(gr => gr.e.canView) : [];

  return (
    <div className="flex flex-col lg:flex-row flex-1 min-h-0">
      {/* User picker */}
      <aside className="lg:w-64 shrink-0 lg:min-h-0 border-b lg:border-b-0 lg:border-r border-slate-100 flex flex-col">
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a user or role…"
              aria-label="Find a user"
              className="w-full pl-8 pr-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742]/30 focus:border-[#F5C742]"
            />
          </div>
        </div>
        <ul className="overflow-y-auto max-h-52 lg:max-h-none lg:flex-1 lg:min-h-0 divide-y divide-slate-50">
          {candidates.map(u => (
            <li key={u.id}>
              <button
                onClick={() => setUserId(u.id)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 ${userId === u.id ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
              >
                <UserCircle2 size={18} className={u.active === false ? 'text-slate-300' : 'text-slate-400'} />
                <div className="min-w-0 flex-1">
                  <div className={`text-xs font-semibold truncate ${u.active === false ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{u.fullName || u.username}</div>
                  <div className="text-[10px] text-slate-400 truncate">{(u.roles || []).join(', ') || 'No roles'}</div>
                </div>
              </button>
            </li>
          ))}
          {candidates.length === 0 && <li className="px-3 py-6 text-center text-[11px] text-slate-400">No users match.</li>}
        </ul>
      </aside>

      {/* Result */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {!user ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-10 text-slate-400">
            <ShieldCheck size={28} className="mb-2 text-slate-300" />
            <div className="text-sm font-semibold text-slate-500">Select a user to see their effective access</div>
            <p className="text-[11px] max-w-sm mt-1">Combines every role the user holds, the same way the server decides each request. Shows saved permissions — unsaved edits are not included.</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 px-4 sm:px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div>
                <div className="text-sm font-bold text-slate-800">{user.fullName || user.username}</div>
                <div className="text-[10px] text-slate-400">{user.username}{user.active === false ? ' · frozen (cannot sign in)' : ''}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {(user.roles || []).map(r => (
                  <button key={r} onClick={() => onOpenRole(r)} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getRoleMeta(r).badge} hover:opacity-80`} title="Open this role">
                    {r}{user.primaryRoleName === r ? ' ★' : ''}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-slate-500 sm:ml-auto">
                <Building2 size={12} className="text-slate-400" />
                {isAdmin ? 'All branches' : [user.branchName, ...(user.additionalBranches || []).map(b => b.name || b.code)].filter(Boolean).join(', ') || 'No branch assigned'}
              </div>
            </div>

            <div className="overflow-auto flex-1 min-h-0 max-h-[60vh] lg:max-h-none">
              <table className="w-full text-xs min-w-[640px] border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="sticky top-0 left-0 z-20 bg-slate-50 border-b border-slate-200 text-left px-4 py-2 font-semibold text-slate-500">Module / page</th>
                    {COLUMNS.map(c => (
                      <th key={c.flag} className={`sticky top-0 z-10 border-b border-slate-200 px-2 py-2 font-semibold text-slate-500 ${c.flag === 'canView' ? 'bg-blue-50' : 'bg-slate-50'}`}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map(mod => {
                    const open = expanded.has(mod.key);
                    const top = effectiveForUser(maps, mod.key);
                    return (
                      <React.Fragment key={mod.key}>
                        <tr className={top.canView ? 'bg-white' : 'bg-slate-50/60'}>
                          <td className="sticky left-0 z-10 bg-inherit border-b border-slate-100 px-3 py-2">
                            <button
                              className="flex items-center gap-1.5 font-semibold text-slate-700 disabled:text-slate-400"
                              disabled={mod.resources.length === 0}
                              onClick={() => setExpanded(p => { const n = new Set(p); n.has(mod.key) ? n.delete(mod.key) : n.add(mod.key); return n; })}
                              aria-expanded={open}
                            >
                              {mod.resources.length > 0 ? (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="w-[13px]" />}
                              {mod.label}
                            </button>
                          </td>
                          {cell(mod.key).map(c => React.cloneElement(c, { className: `${c.props.className} border-b border-slate-100` }))}
                        </tr>
                        {open && mod.resources.map(r => (
                          <tr key={r.key} className="bg-white">
                            <td className="sticky left-0 z-10 bg-white border-b border-slate-50 pl-10 pr-3 py-1.5 text-slate-600">{r.label}</td>
                            {cell(r.key).map(c => React.cloneElement(c, { className: `${c.props.className} border-b border-slate-50` }))}
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="shrink-0 grid md:grid-cols-2 gap-4 p-4 sm:p-5 border-t border-slate-100">
              <div>
                <h4 className="text-xs font-bold text-slate-600 mb-2">Approvals &amp; overrides ({grantedSpecials.length})</h4>
                <div className="flex flex-wrap gap-1">
                  {grantedSpecials.length === 0 && <span className="text-[11px] text-slate-400">None</span>}
                  {grantedSpecials.map(g => (
                    <Hint key={g.key} text={`Granted by ${g.e.sources.canView.join(', ')}`}>
                      <span><Chip tone={g.risk ? 'red' : 'green'}>{g.label}</Chip></span>
                    </Hint>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-600 mb-2">Data scope</h4>
                <ul className="space-y-1">
                  {SCOPE_GRANTS.map(s => {
                    const all = isAdmin || (user.roles || []).includes('BRANCH_ADMIN') || effectiveForUser(maps, s.key).canView;
                    return (
                      <li key={s.key} className="text-[11px] text-slate-600 flex justify-between gap-2">
                        <span>{s.label}</span>
                        <span className={all ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>{all ? s.allLabel : s.ownLabel}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
