import React, { useMemo, useState } from 'react';
import { Search, ChevronDown, ChevronRight, ShieldAlert, X } from 'lucide-react';
import { APPROVAL_GROUPS } from './catalog';
import { Toggle, Chip, Hint } from './ui';

/**
 * Approval rules & advanced restrictions: single-switch grants the backend checks one by one
 * (maker-checker approvals, policy overrides, POS lifecycle actions). Grouped and collapsible
 * so dozens of switches never appear at once.
 */
export default function GrantsTab({ saved, draft, onGrant }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(() => new Set([APPROVAL_GROUPS[0].key]));
  const q = query.trim().toLowerCase();

  const groups = useMemo(() => APPROVAL_GROUPS.map(g => {
    const grants = g.grants.filter(x => !q || x.label.toLowerCase().includes(q)
      || x.description.toLowerCase().includes(q) || x.key.toLowerCase().includes(q)
      || g.title.toLowerCase().includes(q));
    return grants.length ? { ...g, grants } : null;
  }).filter(Boolean), [q]);

  const granted = (key) => !!draft[key]?.canView;
  const dirty = (key) => !!saved[key]?.canView !== granted(key);

  return (
    <div>
      <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search approvals and restrictions…"
            aria-label="Search approvals and restrictions"
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742]/30 focus:border-[#F5C742]"
          />
          {query && <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" aria-label="Clear search"><X size={12} /></button>}
        </div>
        <p className="text-[11px] text-slate-400 sm:ml-auto">
          Each switch is checked individually by the server — it is not inherited from any module.
        </p>
      </div>

      <div className="divide-y divide-slate-100">
        {groups.map(g => {
          const isOpen = open.has(g.key) || !!q;
          const count = g.grants.filter(x => granted(x.key)).length;
          const all = APPROVAL_GROUPS.find(x => x.key === g.key).grants;
          const allGranted = all.every(x => granted(x.key));
          const dirtyCount = all.filter(x => dirty(x.key)).length;
          return (
            <section key={g.key}>
              <div className="px-4 sm:px-5 py-3 flex items-center gap-3 bg-slate-50/40">
                <button
                  onClick={() => setOpen(prev => { const n = new Set(prev); n.has(g.key) ? n.delete(g.key) : n.add(g.key); return n; })}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  aria-expanded={isOpen}
                >
                  {isOpen ? <ChevronDown size={15} className="text-slate-400 shrink-0" /> : <ChevronRight size={15} className="text-slate-400 shrink-0" />}
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-slate-700">{g.title}</div>
                    <div className="text-[10px] text-slate-400 truncate">{g.description}</div>
                  </div>
                </button>
                <Chip tone={count ? 'green' : 'slate'}>{all.filter(x => granted(x.key)).length}/{all.length} granted</Chip>
                {dirtyCount > 0 && <Chip tone="blue">{dirtyCount} unsaved</Chip>}
                <button
                  onClick={() => all.forEach(x => onGrant(x.key, !allGranted))}
                  className={`text-[10px] px-2 py-0.5 rounded border font-medium shrink-0
                    ${allGranted ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-slate-200 text-slate-500 hover:bg-white'}`}
                >
                  {allGranted ? 'Revoke all' : 'Grant all'}
                </button>
              </div>
              {isOpen && (
                <ul className="divide-y divide-slate-50">
                  {g.grants.map(x => (
                    <li key={x.key} className="pl-11 pr-4 sm:pr-5 py-2.5 flex items-center gap-4 hover:bg-amber-50/20">
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-semibold flex items-center gap-1.5 ${granted(x.key) ? 'text-slate-700' : 'text-slate-400'}`}>
                          {x.label}
                          {x.risk && (
                            <Hint text="High-impact permission — grant only to roles that need it; every change is audited.">
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-red-600 bg-red-50 px-1 rounded cursor-help">
                                <ShieldAlert size={9} /> HIGH RISK
                              </span>
                            </Hint>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">{x.description}</div>
                      </div>
                      <Toggle checked={granted(x.key)} onChange={() => onGrant(x.key, !granted(x.key))} dirty={dirty(x.key)} label={x.label} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        {groups.length === 0 && <div className="px-5 py-12 text-center text-sm text-slate-400">Nothing matches “{query}”.</div>}
      </div>
    </div>
  );
}
