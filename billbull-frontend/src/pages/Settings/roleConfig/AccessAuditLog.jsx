import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search, Download, ShieldCheck, ShieldAlert, RefreshCw, X, ChevronLeft, ChevronRight,
  History, Filter, Layers, Globe, Monitor as MonitorIcon, Users,
} from 'lucide-react';
import { accessAuditApi } from '../../../api/accessAuditApi';
import { usePermissions } from '@billbull/shared/context/PermissionContext';
import { Chip, Hint, apiError } from './ui';
import { labelFor } from './catalog';

const AUDIT_MODULE = 'userManagement.audit';
const FLAG_NAMES = ['view', 'create', 'edit', 'delete', 'approve', 'export'];

const ACTION_TONE = {
  ROLE_CREATED: 'green', ROLE_UPDATED: 'slate', ROLE_DELETED: 'red',
  PERMISSION_ADDED: 'amber', PERMISSION_CHANGED: 'amber', PERMISSION_RESET: 'slate', PERMISSIONS_COPIED: 'purple',
  USER_ROLES_ASSIGNED: 'blue', USER_ROLES_CHANGED: 'blue', USER_BRANCHES_CHANGED: 'blue',
  USER_SUSPENDED: 'red', USER_REACTIVATED: 'green', AUDIT_EXPORTED: 'slate',
};

const RANGES = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: 'all', label: 'All time', days: null },
];

const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtTime = (s) => {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
};
const parse = (s) => { if (!s) return null; try { return JSON.parse(s); } catch { return s; } };
const isFlags = (v) => v && typeof v === 'object' && FLAG_NAMES.every(f => f in v);

/** Before → after for one value: flag rows render as a 6-cell diff, other objects as key/value. */
function ValueDiff({ previous, next }) {
  const a = parse(previous);
  const b = parse(next);

  if (isFlags(a) || isFlags(b)) {
    return (
      <table className="w-full text-[11px] border border-slate-200 rounded-lg overflow-hidden">
        <thead className="bg-slate-50 text-slate-500"><tr><th className="px-2 py-1 text-left font-semibold" />{FLAG_NAMES.map(f => <th key={f} className="px-2 py-1 font-semibold capitalize">{f}</th>)}</tr></thead>
        <tbody>
          {[['Before', a], ['After', b]].map(([label, v]) => (
            <tr key={label} className="border-t border-slate-100">
              <td className="px-2 py-1 font-semibold text-slate-500">{label}</td>
              {FLAG_NAMES.map(f => {
                const changed = isFlags(a) && isFlags(b) && !!a[f] !== !!b[f];
                const on = isFlags(v) ? !!v[f] : null;
                return (
                  <td key={f} className={`px-2 py-1 text-center ${changed ? 'bg-amber-50 font-bold' : ''}`}>
                    {on === null ? <span className="text-slate-300">{v?.inheritsFrom ? 'inherits' : '—'}</span>
                      : on ? <span className="text-emerald-600">✓</span> : <span className="text-slate-300">✕</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const keys = Array.from(new Set([...Object.keys(a && typeof a === 'object' ? a : {}), ...Object.keys(b && typeof b === 'object' ? b : {})]));
  const show = (v) => {
    if (v === null || v === undefined || v === '') return <span className="text-slate-300">—</span>;
    if (isFlags(v)) return FLAG_NAMES.filter(f => v[f]).join(', ') || 'no access';
    if (Array.isArray(v)) return v.length ? v.join(', ') : <span className="text-slate-300">none</span>;
    if (typeof v === 'object') return `${Object.keys(v).length} rules`;
    return String(v);
  };
  if (keys.length === 0) {
    return <div className="text-[11px] text-slate-500 break-words">{show(a)} → {show(b)}</div>;
  }
  return (
    <table className="w-full text-[11px] border border-slate-200 rounded-lg overflow-hidden">
      <thead className="bg-slate-50 text-slate-500"><tr><th className="px-2 py-1 text-left">Field</th><th className="px-2 py-1 text-left">Before</th><th className="px-2 py-1 text-left">After</th></tr></thead>
      <tbody>
        {keys.map(k => {
          const va = a?.[k]; const vb = b?.[k];
          const changed = JSON.stringify(va) !== JSON.stringify(vb);
          return (
            <tr key={k} className={`border-t border-slate-100 align-top ${changed ? 'bg-amber-50/60' : ''}`}>
              <td className="px-2 py-1 font-semibold text-slate-500 whitespace-nowrap">{labelFor(k) !== k ? labelFor(k) : k}</td>
              <td className="px-2 py-1 text-slate-600 break-words">{a == null ? <span className="text-slate-300">—</span> : show(va)}</td>
              <td className="px-2 py-1 text-slate-800 break-words">{b == null ? <span className="text-slate-300">—</span> : show(vb)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const Row = ({ icon: Icon, label, children }) => (
  <div className="flex gap-3 py-1.5">
    <div className="w-28 shrink-0 text-[11px] text-slate-400 flex items-center gap-1.5">{Icon && <Icon size={11} />}{label}</div>
    <div className="text-xs text-slate-700 min-w-0 break-words flex-1">{children || <span className="text-slate-300">—</span>}</div>
  </div>
);

function DetailDrawer({ entry, actionLabels, onClose, onShowChangeSet }) {
  if (!entry) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose} role="dialog" aria-modal="true" aria-label="Audit entry">
      <div className="w-full max-w-lg h-full bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <Chip tone={ACTION_TONE[entry.action] || 'slate'}>{actionLabels[entry.action] || entry.action}</Chip>
            <div className="text-sm font-bold text-slate-800 mt-1.5">{entry.targetLabel || entry.roleName || '—'}</div>
            <div className="text-[11px] text-slate-400">{fmtTime(entry.occurredAt)} · entry #{entry.id}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {entry.changeSummary && <div className="text-xs font-semibold text-slate-700 bg-slate-50 rounded-lg px-3 py-2">{entry.changeSummary}</div>}
          <section>
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Previous → new value</h4>
            <ValueDiff previous={entry.previousValue} next={entry.newValue} />
          </section>
          <section className="divide-y divide-slate-50">
            <Row label="Changed by">{entry.actorUsername}{entry.actorRoles ? <span className="text-slate-400"> ({entry.actorRoles})</span> : null}</Row>
            <Row label="Reason">{entry.reason ? <span className="italic">“{entry.reason}”</span> : <span className="text-slate-400">No reason given</span>}</Row>
            <Row icon={Users} label={`Affected (${entry.affectedUserCount})`}>{entry.affectedUsernames ? entry.affectedUsernames.split(',').join(', ') : null}</Row>
            <Row label="Role">{entry.roleName}</Row>
            <Row label="Permission">{entry.module ? `${labelFor(entry.module)} (${entry.module})` : null}</Row>
            <Row label="Branch">{entry.branchId != null ? `#${entry.branchId}` : 'All branches / not set'}</Row>
            <Row icon={Globe} label="Tenant">{entry.tenant}</Row>
            <Row label="IP address">{entry.ipAddress}</Row>
            <Row icon={MonitorIcon} label="User agent"><span className="text-[11px] text-slate-500">{entry.userAgent}</span></Row>
            <Row icon={Layers} label="Change set">
              {entry.changeSetId && (
                <button onClick={() => onShowChangeSet(entry.changeSetId)} className="text-[11px] text-blue-600 hover:underline">
                  Show every change saved together
                </button>
              )}
            </Row>
            <Row label="Request id"><code className="text-[10px]">{entry.requestId}</code></Row>
            <Row label="Integrity hash"><code className="text-[10px] text-slate-400 break-all">{entry.rowHash}</code></Row>
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * Access audit log — who changed which role, permission or user assignment, when, from where,
 * and why. Read-only: entries cannot be edited or deleted by anyone through the application.
 */
export default function AccessAuditLog({ embedded = false, initialFilters = {} }) {
  const { canExport, canView } = usePermissions();
  const allowed = canView(AUDIT_MODULE);
  const exportAllowed = canExport(AUDIT_MODULE);

  const [range, setRange] = useState('30d');
  const [filters, setFilters] = useState({ actor: '', action: '', roleName: '', affectedUser: '', changeSetId: '', from: '', to: '', ...initialFilters });
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ content: [], totalElements: 0, totalPages: 0 });
  const [facets, setFacets] = useState({ actions: [], actors: [], roles: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [verify, setVerify] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);

  const effectiveFilters = useMemo(() => {
    const f = { ...filters, q: debounced };
    const r = RANGES.find(x => x.key === range);
    if (range !== 'custom' && r) {
      if (r.days === null) { f.from = ''; f.to = ''; } else {
        const start = new Date(); start.setDate(start.getDate() - r.days);
        f.from = isoDate(start); f.to = '';
      }
    }
    return {
      ...f,
      from: f.from ? `${f.from}T00:00:00` : '',
      to: f.to ? `${f.to}T23:59:59` : '',
    };
  }, [filters, debounced, range]);

  const load = useCallback(() => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    accessAuditApi.search(effectiveFilters, page, 50)
      .then(setData)
      .catch(err => setError(apiError(err, 'Could not load the audit log')))
      .finally(() => setLoading(false));
  }, [effectiveFilters, page, allowed]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [effectiveFilters]);
  useEffect(() => {
    if (allowed) accessAuditApi.facets().then(setFacets).catch(() => {});
  }, [allowed]);

  const actionLabels = useMemo(() => Object.fromEntries(facets.actions.map(a => [a.name, a.label])), [facets]);
  const setF = (k, v) => setFilters(prev => ({ ...prev, [k]: v }));
  const activeFilterCount = ['actor', 'action', 'roleName', 'affectedUser', 'changeSetId'].filter(k => filters[k]).length;

  const runVerify = async () => {
    setVerifying(true);
    try { setVerify(await accessAuditApi.verify()); }
    catch (err) { setVerify({ intact: false, message: apiError(err, 'Verification failed to run') }); }
    finally { setVerifying(false); }
  };

  const runExport = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await accessAuditApi.exportCsv(effectiveFilters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(apiError(err, 'Export failed'));
    } finally { setExporting(false); }
  };

  if (!allowed) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-400">
        You need the <strong>Access Audit Log</strong> permission (User Management) to view this page.
      </div>
    );
  }

  return (
    <div className={embedded ? 'flex flex-col flex-1 min-h-0' : 'p-4 md:p-6 flex flex-col gap-4 bg-[#F7F7FA] min-h-full lg:h-full'}>
      {!embedded && (
        <div>
          <div className="text-xs text-slate-500 mb-1">Enterprise Console → Access Audit Log</div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><History className="text-[#F5C742]" size={24} /> Access Audit Log</h1>
        </div>
      )}
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-4 sm:px-5 py-3 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-700">Access changes</div>
            <div className="text-[11px] text-slate-400">Append-only and tamper-evident · {facets.total.toLocaleString()} entries recorded</div>
          </div>
          <div className="lg:ml-auto flex flex-wrap items-center gap-2">
            {verify && (
              <Hint text={verify.message}>
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg ${verify.intact ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                  {verify.intact ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                  {verify.intact ? `Verified (${verify.rowsChecked})` : `Integrity problem${verify.firstBrokenId ? ` at #${verify.firstBrokenId}` : ''}`}
                </span>
              </Hint>
            )}
            <button onClick={runVerify} disabled={verifying}
              className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1 disabled:opacity-50">
              {verifying ? <RefreshCw size={12} className="animate-spin" /> : <ShieldCheck size={12} />} Verify integrity
            </button>
            {exportAllowed && (
              <button onClick={runExport} disabled={exporting}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-[#F5C742] hover:bg-[#e5b732] text-slate-800 flex items-center gap-1 disabled:opacity-50">
                {exporting ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />} Export CSV
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="shrink-0 px-4 sm:px-5 py-3 border-b border-slate-100 space-y-2.5 bg-slate-50/40">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the audit log"
                placeholder="Search user, role, permission, reason, IP…"
                className="w-full pl-8 pr-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742]/30 focus:border-[#F5C742]" />
            </div>
            <div className="flex items-center gap-1 overflow-x-auto">
              {RANGES.map(r => (
                <button key={r.key} onClick={() => setRange(r.key)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-md whitespace-nowrap ${range === r.key ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {r.label}
                </button>
              ))}
              <button onClick={() => setRange('custom')}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-md whitespace-nowrap ${range === 'custom' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                Custom
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
            {range === 'custom' && (
              <>
                <input type="date" value={filters.from} onChange={(e) => setF('from', e.target.value)} aria-label="From date"
                  className="px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg" />
                <input type="date" value={filters.to} onChange={(e) => setF('to', e.target.value)} aria-label="To date"
                  className="px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg" />
              </>
            )}
            <select value={filters.action} onChange={(e) => setF('action', e.target.value)} aria-label="Change type"
              className="px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg">
              <option value="">All change types</option>
              {['ROLE', 'ROLE_PERMISSION', 'USER', 'AUDIT'].map(t => (
                <optgroup key={t} label={{ ROLE: 'Roles', ROLE_PERMISSION: 'Permissions', USER: 'User assignments', AUDIT: 'Audit log' }[t]}>
                  {facets.actions.filter(a => a.targetType === t).map(a => <option key={a.name} value={a.name}>{a.label}</option>)}
                </optgroup>
              ))}
            </select>
            <select value={filters.actor} onChange={(e) => setF('actor', e.target.value)} aria-label="Changed by"
              className="px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg">
              <option value="">Anyone</option>
              {facets.actors.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={filters.roleName} onChange={(e) => setF('roleName', e.target.value)} aria-label="Role"
              className="px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg">
              <option value="">Any role</option>
              {facets.roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <input value={filters.affectedUser} onChange={(e) => setF('affectedUser', e.target.value)} aria-label="Affected user"
              placeholder="Affected user…" className="px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg" />
          </div>
          {(activeFilterCount > 0 || filters.changeSetId) && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <Filter size={11} className="text-slate-400" />
              {filters.changeSetId && <Chip tone="blue">One change set <button onClick={() => setF('changeSetId', '')} aria-label="Clear change set"><X size={10} /></button></Chip>}
              <button onClick={() => setFilters(f => ({ ...f, actor: '', action: '', roleName: '', affectedUser: '', changeSetId: '' }))}
                className="text-slate-500 hover:text-slate-800 underline">Clear filters</button>
            </div>
          )}
        </div>

        {error && <div className="mx-5 my-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        {/* Results */}
        <div className="overflow-auto flex-1 min-h-[260px] max-h-[70vh] lg:max-h-none">
          <table className="w-full text-xs min-w-[860px] border-separate border-spacing-0">
            <thead>
              <tr className="text-slate-500">
                {['When', 'Changed by', 'Change', 'Target', 'What changed', 'Reason', 'Affected'].map(h => (
                  <th key={h} className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-left font-semibold px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && data.content.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400"><RefreshCw size={14} className="inline animate-spin mr-1" /> Loading…</td></tr>
              )}
              {!loading && data.content.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400">No access changes match these filters.</td></tr>
              )}
              {data.content.map(e => (
                <tr key={e.id} onClick={() => setSelected(e)} className="cursor-pointer hover:bg-amber-50/30 align-top">
                  <td className="border-b border-slate-50 px-3 py-2 whitespace-nowrap text-slate-500">{fmtTime(e.occurredAt)}</td>
                  <td className="border-b border-slate-50 px-3 py-2">
                    <div className="font-semibold text-slate-700">{e.actorUsername}</div>
                    <div className="text-[10px] text-slate-400">{e.ipAddress || '—'}</div>
                  </td>
                  <td className="border-b border-slate-50 px-3 py-2"><Chip tone={ACTION_TONE[e.action] || 'slate'}>{actionLabels[e.action] || e.action}</Chip></td>
                  <td className="border-b border-slate-50 px-3 py-2 max-w-[220px]">
                    <div className="text-slate-700 truncate">{e.module ? labelFor(e.module) : (e.targetLabel || '—')}</div>
                    {e.roleName && <div className="text-[10px] text-slate-400">{e.roleName}</div>}
                  </td>
                  <td className="border-b border-slate-50 px-3 py-2 text-slate-600 max-w-[240px]"><div className="line-clamp-2">{e.changeSummary}</div></td>
                  <td className="border-b border-slate-50 px-3 py-2 text-slate-500 max-w-[220px]">
                    {e.reason ? <div className="line-clamp-2 italic">“{e.reason}”</div> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="border-b border-slate-50 px-3 py-2">
                    {e.affectedUserCount > 0
                      ? <Hint text={(e.affectedUsernames || '').split(',').join(', ')}><span><Chip>{e.affectedUserCount} user{e.affectedUserCount === 1 ? '' : 's'}</Chip></span></Hint>
                      : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="shrink-0 px-4 sm:px-5 py-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>{data.totalElements.toLocaleString()} matching entr{data.totalElements === 1 ? 'y' : 'ies'}</span>
          <div className="flex items-center gap-2">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30" aria-label="Previous page"><ChevronLeft size={14} /></button>
            <span>Page {data.totalPages === 0 ? 0 : page + 1} of {data.totalPages}</span>
            <button disabled={page + 1 >= data.totalPages} onClick={() => setPage(p => p + 1)} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30" aria-label="Next page"><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      <DetailDrawer
        entry={selected}
        actionLabels={actionLabels}
        onClose={() => setSelected(null)}
        onShowChangeSet={(id) => { setSelected(null); setRange('all'); setF('changeSetId', id); }}
      />
    </div>
  );
}
