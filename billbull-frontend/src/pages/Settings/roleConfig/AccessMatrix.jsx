import React, { useMemo, useState } from 'react';
import {
  Search, ChevronRight, ChevronDown, RotateCcw, Eye, PlusCircle, Pencil, Trash2,
  CheckCircle, Download, Lock, ChevronsDownUp, ChevronsUpDown, X,
} from 'lucide-react';
import { MODULES, VIEW_COLUMN, ACTION_COLUMNS, ADMIN_PROTECTED } from './catalog';
import { effective, moduleSummary, allOn, sameFlags } from './permissionModel';
import { Toggle, Hint, Chip } from './ui';

const ICONS = { canView: Eye, canCreate: PlusCircle, canEdit: Pencil, canDelete: Trash2, canApprove: CheckCircle, canExport: Download };
const ICON_COLORS = { canView: 'text-blue-600', canCreate: 'text-emerald-600', canEdit: 'text-yellow-600', canDelete: 'text-red-500', canApprove: 'text-purple-600', canExport: 'text-slate-500' };
const COLUMNS = [VIEW_COLUMN, ...ACTION_COLUMNS];

const FILTERS = [
  { key: 'all',     label: 'All' },
  { key: 'visible', label: 'Visible' },
  { key: 'hidden',  label: 'Hidden' },
  { key: 'custom',  label: 'Custom rules' },
  { key: 'unsaved', label: 'Unsaved' },
];

const rowDirty = (saved, draft, key) =>
  !!saved[key] !== !!draft[key] || (!!draft[key] && !sameFlags(draft[key], saved[key]));

export default function AccessMatrix({ saved, draft, onToggle, onSetRow, onReset, isAdminRole }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(() => new Set());

  const q = query.trim().toLowerCase();

  // Which modules/pages to render for the current search + filter.
  const visibleModules = useMemo(() => MODULES.map(mod => {
    const top = effective(draft, mod.key);
    const modMatches = !q || mod.label.toLowerCase().includes(q) || mod.key.toLowerCase().includes(q)
      || mod.description.toLowerCase().includes(q);
    let resources = mod.resources.filter(r => modMatches || r.label.toLowerCase().includes(q) || r.key.toLowerCase().includes(q));

    if (filter === 'custom') resources = resources.filter(r => draft[r.key]);
    if (filter === 'unsaved') resources = resources.filter(r => rowDirty(saved, draft, r.key));

    let show = modMatches || resources.length > 0;
    if (filter === 'visible') show = show && top.canView;
    if (filter === 'hidden') show = show && !top.canView;
    if (filter === 'custom') show = show && resources.length > 0;
    if (filter === 'unsaved') show = show && (resources.length > 0 || rowDirty(saved, draft, mod.key));
    // A search or a narrowing filter opens the matching groups automatically.
    const autoOpen = (!!q && !modMatches) || filter === 'custom' || filter === 'unsaved';
    return show ? { mod, resources, autoOpen } : null;
  }).filter(Boolean), [q, filter, draft, saved]);

  const toggleExpanded = (key) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const allExpanded = visibleModules.every(v => v.mod.resources.length === 0 || expanded.has(v.mod.key));

  const unsavedCount = useMemo(() => {
    const keys = new Set([...Object.keys(saved), ...Object.keys(draft)]);
    let n = 0;
    keys.forEach(k => { if (rowDirty(saved, draft, k)) n += 1; });
    return n;
  }, [saved, draft]);

  const renderCells = (key, eff, { disabled, inherited }) => COLUMNS.map(col => {
    const protectedView = isAdminRole && col.flag === 'canView' && ADMIN_PROTECTED.has(key) && eff.canView;
    const flagDirty = effective(saved, key)[col.flag] !== eff[col.flag];
    const toggle = (
      <Toggle
        checked={!!eff[col.flag]}
        onChange={() => onToggle(key, col.flag)}
        disabled={protectedView || (col.flag !== 'canView' && disabled)}
        inherited={inherited}
        dirty={flagDirty}
        label={`${col.label} — ${key}`}
      />
    );
    return (
      <td key={col.flag} className={`px-2 py-2.5 text-center ${col.flag === 'canView' ? 'bg-blue-50/30' : ''}`}>
        {protectedView
          ? <Hint text="Protected — ADMIN must keep access to role configuration, or nobody could undo the change."><span>{toggle}</span></Hint>
          : toggle}
      </td>
    );
  });

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="shrink-0 px-4 sm:px-5 py-2.5 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-2.5">
        <div className="relative flex-1 min-w-0 md:max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules and pages…"
            aria-label="Search modules and pages"
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742]/30 focus:border-[#F5C742]"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Clear search">
              <X size={12} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Filter rows">
          {FILTERS.map(f => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md whitespace-nowrap transition-colors
                ${filter === f.key ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              {f.label}{f.key === 'unsaved' && unsavedCount > 0 ? ` (${unsavedCount})` : ''}
            </button>
          ))}
        </div>
        <div className="md:ml-auto flex items-center gap-3">
          <button
            onClick={() => setExpanded(allExpanded ? new Set() : new Set(MODULES.map(m => m.key)))}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 whitespace-nowrap"
          >
            {allExpanded ? <ChevronsDownUp size={12} /> : <ChevronsUpDown size={12} />}
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="shrink-0 px-4 sm:px-5 py-1.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-6 h-3 rounded-full bg-[#F5C742] inline-block" /> Granted by a rule on this row</span>
        <span className="flex items-center gap-1.5"><span className="w-6 h-3 rounded-full bg-[#F5C742]/45 border border-dashed border-[#d9a52a] inline-block" /> Inherited from the module</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Unsaved change</span>
      </div>

      {/* Matrix */}
      <div className="overflow-auto flex-1 min-h-0 max-h-[70vh] lg:max-h-none">
        <table className="w-full table-fixed text-xs min-w-[760px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 bg-slate-50 border-b border-slate-200 text-left px-4 sm:px-5 py-2.5 font-semibold text-slate-500 w-[34%]">
                Module / page
              </th>
              {COLUMNS.map(col => {
                const Icon = ICONS[col.flag];
                return (
                  <th key={col.flag} className={`sticky top-0 z-20 border-b border-slate-200 px-2 py-2.5 text-center ${col.flag === 'canView' ? 'bg-blue-50' : 'bg-slate-50'}`}>
                    <Hint text={col.tip}>
                      <button type="button" className="inline-flex flex-col items-center gap-0.5 cursor-help">
                        <span className={`flex items-center gap-1 font-semibold ${ICON_COLORS[col.flag]}`}>
                          <Icon size={11} /> {col.label}
                        </span>
                        <span className="text-[9px] text-slate-400 font-normal">{col.flag === 'canView' ? 'Visibility' : 'Action'}</span>
                      </button>
                    </Hint>
                  </th>
                );
              })}
              <th className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 px-2 py-2.5 text-center text-[10px] font-normal text-slate-400 w-16">Row</th>
            </tr>
          </thead>
          <tbody>
            {visibleModules.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-400">No modules match “{query}”{filter !== 'all' ? ` with filter “${FILTERS.find(f => f.key === filter).label}”` : ''}.</td></tr>
            )}
            {visibleModules.map(({ mod, resources, autoOpen }) => {
              const eff = effective(draft, mod.key);
              const sum = moduleSummary(draft, mod);
              const open = mod.resources.length > 0 && eff.canView && (expanded.has(mod.key) || autoOpen);
              const ModIcon = mod.icon;
              const rowAll = eff.canView && allOn(eff);
              const dirtyPages = mod.resources.filter(r => rowDirty(saved, draft, r.key)).length;
              return (
                <React.Fragment key={mod.key}>
                  <tr className={`group ${eff.canView ? 'bg-white' : 'bg-slate-50/60'}`}>
                    <td className={`sticky left-0 z-10 border-b border-slate-100 px-3 sm:px-4 py-2.5 border-l-[3px] ${eff.canView ? 'border-l-blue-500 bg-white' : 'border-l-transparent bg-slate-50'}`}>
                      <div className="flex items-center gap-2">
                        {mod.resources.length > 0 ? (
                          <button
                            onClick={() => toggleExpanded(mod.key)}
                            disabled={!eff.canView}
                            aria-expanded={open}
                            aria-label={`${open ? 'Collapse' : 'Expand'} ${mod.label}`}
                            className="text-slate-400 hover:text-slate-700 disabled:opacity-30 shrink-0"
                          >
                            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </button>
                        ) : <span className="w-[15px] shrink-0" />}
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${eff.canView ? 'bg-white shadow-sm border border-slate-100' : 'bg-slate-100'}`}>
                          <ModIcon size={14} className={eff.canView ? mod.color : 'text-slate-400'} />
                        </div>
                        <div className="min-w-0">
                          <div className={`font-bold text-[13px] leading-tight ${eff.canView ? 'text-slate-800' : 'text-slate-400'}`}>{mod.label}</div>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            {!eff.canView && <Chip tone="slate">Hidden</Chip>}
                            {eff.canView && mod.resources.length > 0 && (
                              <Chip tone={sum.visible === sum.total ? 'green' : 'slate'} title="Pages this role can open">
                                {sum.visible}/{sum.total} pages
                              </Chip>
                            )}
                            {sum.custom > 0 && <Chip tone="amber" title="Pages with their own rule instead of inheriting">{sum.custom} custom</Chip>}
                            {dirtyPages + (rowDirty(saved, draft, mod.key) ? 1 : 0) > 0 && (
                              <Chip tone="blue">{dirtyPages + (rowDirty(saved, draft, mod.key) ? 1 : 0)} unsaved</Chip>
                            )}
                            {mod.resources.length === 0 && <span className="text-[10px] text-slate-400 truncate">{mod.description}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    {renderCells(mod.key, eff, { disabled: !eff.canView, inherited: false }).map(cell =>
                      React.cloneElement(cell, { className: `${cell.props.className} border-b border-slate-100` }))}
                    <td className="border-b border-slate-100 px-2 py-2.5 text-center">
                      <Hint text={rowAll ? 'Revoke everything on this module (and its custom page rules)' : 'Grant every action on this module and its custom page rules'}>
                        <button
                          onClick={() => onSetRow(mod.key, !rowAll)}
                          disabled={isAdminRole && rowAll && ADMIN_PROTECTED.has(mod.key)}
                          className={`text-[10px] px-2 py-0.5 rounded border font-medium disabled:opacity-30
                            ${rowAll ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                        >
                          {rowAll ? 'None' : 'All'}
                        </button>
                      </Hint>
                    </td>
                  </tr>

                  {open && resources.map(res => {
                    const rEff = effective(draft, res.key);
                    const rAll = allOn(rEff);
                    return (
                      <tr key={res.key} className="bg-white hover:bg-amber-50/20">
                        <td className="sticky left-0 z-10 bg-white border-b border-slate-50 pl-14 pr-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${rEff.inherited ? 'bg-slate-300' : 'bg-[#F5C742]'}`} />
                            <span className="text-xs font-medium text-slate-600 truncate">{res.label}</span>
                            {res.hint && <Hint text={res.hint}><Lock size={10} className="text-slate-300 shrink-0" /></Hint>}
                            {rEff.inherited ? (
                              <Hint text={`No rule of its own — follows ${mod.label}. Change any switch to give this page its own rule.`}>
                                <span className="text-[8px] uppercase tracking-wide font-bold text-slate-400 bg-slate-100 px-1 rounded cursor-help shrink-0">Inherits</span>
                              </Hint>
                            ) : (
                              <>
                                <Hint text={`This page has its own rule and ignores ${mod.label}'s defaults.`}>
                                  <span className="text-[8px] uppercase tracking-wide font-bold text-amber-700 bg-amber-50 px-1 rounded cursor-help shrink-0">Custom</span>
                                </Hint>
                                <Hint text={`Remove the custom rule — inherit from ${mod.label} again`}>
                                  <button onClick={() => onReset(res.key)} className="text-slate-300 hover:text-amber-600 shrink-0" aria-label={`Reset ${res.label} to inherit`}>
                                    <RotateCcw size={11} />
                                  </button>
                                </Hint>
                              </>
                            )}
                          </div>
                        </td>
                        {renderCells(res.key, rEff, { disabled: !rEff.canView, inherited: rEff.inherited }).map(cell =>
                          React.cloneElement(cell, { className: `${cell.props.className} border-b border-slate-50` }))}
                        <td className="border-b border-slate-50 px-2 py-2 text-center">
                          <button
                            onClick={() => onSetRow(res.key, !rAll)}
                            className={`text-[10px] px-2 py-0.5 rounded border font-medium
                              ${rAll ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                          >
                            {rAll ? 'None' : 'All'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
