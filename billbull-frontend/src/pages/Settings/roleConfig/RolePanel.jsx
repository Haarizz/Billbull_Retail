import React, { useState } from 'react';
import { PlusCircle, Lock, Search, ChevronRight } from 'lucide-react';
import { SYSTEM_ROLES, getRoleMeta } from './catalog';
import { roleSummary } from './permissionModel';

/** Role list with search and an at-a-glance access summary per role. */
export default function RolePanel({ roles, selectedName, onSelect, onAdd, userCounts, roleMaps, dirtyRole, loading }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = roles.filter(r => !q || r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));

  return (
    <div className="w-full lg:w-64 shrink-0 lg:min-h-0 flex flex-col">
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Roles <span className="text-slate-400 font-normal">({roles.length})</span></p>
        <button onClick={onAdd}
          className="text-[10px] bg-[#F5C742] hover:bg-[#e5b732] text-slate-800 font-bold px-2 py-1 rounded shadow-sm flex items-center gap-1">
          <PlusCircle size={10} /> Add Role
        </button>
      </div>

      {/* Phones / tablets: compact picker */}
      <select
        className="lg:hidden w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
        value={selectedName || ''}
        onChange={(e) => onSelect(e.target.value)}
        aria-label="Select role"
      >
        {roles.map(r => <option key={r.id} value={r.name}>{r.name}{userCounts[r.name] ? ` (${userCounts[r.name]} user${userCounts[r.name] === 1 ? '' : 's'})` : ''}</option>)}
      </select>

      <div className="hidden lg:flex lg:flex-col lg:flex-1 lg:min-h-0">
        {roles.length > 6 && (
          <div className="relative mb-2">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find role…" aria-label="Find role"
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742]/30 focus:border-[#F5C742]" />
          </div>
        )}
        <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto pr-0.5">
          {loading && <div className="text-xs text-slate-400 px-2">Loading roles…</div>}
          {shown.map(role => {
            const meta = getRoleMeta(role.name);
            const active = selectedName === role.name;
            const count = userCounts[role.name] || 0;
            const sum = roleSummary(roleMaps[role.name] || {});
            const pct = Math.round((sum.modulesOn / sum.modulesTotal) * 100);
            return (
              <button
                key={role.id}
                onClick={() => onSelect(role.name)}
                aria-current={active ? 'true' : undefined}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all flex items-center gap-2.5
                  ${active ? `${meta.bg} ${meta.border} shadow-sm` : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${active ? meta.dot : 'bg-slate-300'}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-semibold truncate flex items-center gap-1.5 ${active ? meta.text : 'text-slate-700'}`}>
                    {role.name}
                    {SYSTEM_ROLES.has(role.name) && <Lock size={9} className="text-slate-400 shrink-0" aria-label="System role" />}
                    {dirtyRole === role.name && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" title="Unsaved changes" />}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {role.description || (role.name === 'ADMIN' ? 'Full system access' : 'No description')}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="h-1 flex-1 bg-slate-100 rounded-full overflow-hidden" title={`${sum.modulesOn} of ${sum.modulesTotal} modules visible`}>
                      <div className={`h-full ${active ? meta.dot : 'bg-slate-300'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[9px] text-slate-400 whitespace-nowrap">{sum.modulesOn}/{sum.modulesTotal} modules</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${count ? 'bg-slate-100 text-slate-600' : 'text-slate-300'}`}>
                    {count} {count === 1 ? 'user' : 'users'}
                  </span>
                  {active && <ChevronRight size={13} className={meta.text} />}
                </div>
              </button>
            );
          })}
          {!loading && shown.length === 0 && <div className="text-[11px] text-slate-400 px-2 py-3">No roles match.</div>}
        </div>
      </div>
    </div>
  );
}
