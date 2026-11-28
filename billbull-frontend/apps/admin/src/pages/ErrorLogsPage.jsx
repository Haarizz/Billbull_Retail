import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage, platformApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { hasRole } from '../auth/roles';
import { Alert, Button, Card, Input, PageHeader, Select, Spinner, Stat, Table } from '../ui/kit';
import { fmtDate, timeAgo } from '../ui/format';
import { useLoad } from '../ui/useLoad';
import {
  DEFAULT_FILTERS, SEVERITIES, SOURCES, STATUSES, WINDOWS, filtersToParams, shownMessage, sourceLabel,
} from './errors/errorLogic';
import { ErrorStatusBadge, SeverityBadge, Tag } from './errors/errorUi';

/**
 * Error logs across all clients, or one client's when `tenantId` is given (the client's Errors tab).
 * Groups recurring faults, explains each in ERP terms and lets operators triage them.
 */
export default function ErrorLogsPage({ tenantId, embedded = false }) {
  const { user } = useAuth();
  const operator = hasRole(user, 'OPERATOR');
  const navigate = useNavigate();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState({ kind: '', text: '' });
  const [syncing, setSyncing] = useState(false);

  const params = filtersToParams(filters, tenantId);
  const { data, loading, error, reload } = useLoad(() => platformApi.errors(params), [JSON.stringify(params)]);
  const { data: catalog } = useLoad(() => platformApi.errorCatalog(), []);
  const { data: tenants } = useLoad(() => (tenantId ? Promise.resolve([]) : platformApi.tenants()), [tenantId]);
  const { data: syncState, reload: reloadSync } = useLoad(() => platformApi.errorSyncState(), []);

  const set = (patch) => setFilters((f) => ({ ...f, page: 0, ...patch }));

  const syncNow = async () => {
    setSyncing(true);
    setNotice({ kind: '', text: '' });
    try {
      const results = await platformApi.syncErrors(tenantId);
      const failed = results.filter((r) => r.status !== 'OK');
      const pulled = results.reduce((n, r) => n + (r.events || 0), 0);
      setNotice(failed.length
        ? { kind: 'warn', text: `Pulled ${pulled} new occurrence(s). Could not reach ${failed.length} client(s): ${failed.map((r) => r.error || r.status).join('; ')}` }
        : { kind: 'success', text: `Pulled ${pulled} new occurrence(s) from ${results.length} client(s).` });
      await Promise.all([reload(), reloadSync()]);
    } catch (e) {
      setNotice({ kind: 'error', text: errorMessage(e) });
    } finally {
      setSyncing(false);
    }
  };

  const s = data?.summary;
  const syncRows = (syncState || []).filter((r) => !tenantId || r.tenantId === Number(tenantId));
  const syncProblems = syncRows.filter((r) => r.lastStatus && r.lastStatus !== 'OK');
  const lastSync = syncRows.map((r) => r.lastSyncAt).filter(Boolean).sort().pop();
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / (data?.size || 50)));

  const columns = [
    { key: 'severity', label: 'Severity', render: (g) => <SeverityBadge value={g.severity} /> },
    {
      key: 'title',
      label: 'What happened',
      className: 'min-w-[18rem]',
      render: (g) => (
        <div>
          <div className="font-medium text-slate-900">{g.title}</div>
          {shownMessage(g) && <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{shownMessage(g)}</div>}
          <div className="mt-1 flex flex-wrap gap-1">
            <Tag>{g.categoryLabel}</Tag>
            <Tag title={g.pathTemplate || ''}>{sourceLabel(g.source)}{g.httpMethod ? ` · ${g.httpMethod}` : ''}</Tag>
          </div>
        </div>
      ),
    },
    ...(tenantId ? [] : [{ key: 'tenantCode', label: 'Client', render: (g) => <span className="font-mono text-xs">{g.tenantCode}</span> }]),
    { key: 'moduleLabel', label: 'Module' },
    {
      key: 'count',
      label: '24 h / total',
      className: 'text-right whitespace-nowrap',
      render: (g) => <span><b>{g.events24h}</b> <span className="text-slate-400">/ {g.occurrences}</span></span>,
    },
    { key: 'usersAffected', label: 'Users', className: 'text-right' },
    { key: 'lastSeenAt', label: 'Last seen', render: (g) => <span className="whitespace-nowrap" title={fmtDate(g.lastSeenAt)}>{timeAgo(g.lastSeenAt)}</span> },
    { key: 'status', label: 'Status', render: (g) => <ErrorStatusBadge value={g.status} regressed={g.regressed} /> },
  ];

  return (
    <div className="space-y-4">
      {!embedded && (
        <PageHeader
          title="Error logs"
          subtitle="Faults from every client — what broke, what it means for their business, and what to do."
          actions={(
            <>
              <Link to="/errors/guide" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">Error guide</Link>
              <Button variant="secondary" onClick={() => { reload(); reloadSync(); }}>Refresh</Button>
              {operator && <Button onClick={syncNow} disabled={syncing}>{syncing ? 'Pulling…' : 'Pull now'}</Button>}
            </>
          )}
        />
      )}
      {embedded && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link to="/errors/guide" className="text-sm text-slate-600 hover:underline">Error guide</Link>
          {operator && <Button size="sm" variant="secondary" onClick={syncNow} disabled={syncing}>{syncing ? 'Pulling…' : 'Pull now'}</Button>}
        </div>
      )}

      <Alert kind={notice.kind || 'info'}>{notice.text}</Alert>
      <Alert>{error}</Alert>
      {syncProblems.length > 0 && (
        <Alert kind="warn">
          Error logs could not be collected from {syncProblems.map((r) => r.tenantCode).join(', ')}:{' '}
          {syncProblems[0].lastError || syncProblems[0].lastStatus}
          {syncProblems.length > 1 ? ' (and others)' : ''}
        </Alert>
      )}

      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Open faults" value={s.openFaults} tone={s.openFaults ? 'amber' : 'green'} />
          <Stat label="Open critical" value={s.openCritical} tone={s.openCritical ? 'red' : 'green'} />
          <Stat label="Fault occurrences (24 h)" value={s.faultEvents24h} />
          {tenantId
            ? <Stat label="Regressed" value={s.regressed} tone={s.regressed ? 'red' : undefined} />
            : <Stat label="Clients affected (24 h)" value={s.clientsAffected24h} tone={s.clientsAffected24h ? 'amber' : 'green'} />}
        </div>
      )}

      {s && Object.keys(s.byModule || {}).length > 0 && (
        <Card title="Open faults by module (last 7 days)">
          <div className="flex flex-wrap gap-2">
            {Object.entries(s.byModule).map(([m, n]) => {
              const label = catalog?.modules?.find((x) => x.code === m)?.label || m;
              const active = filters.module === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => set({ module: active ? '' : m })}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${active ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  {label} <b className="ml-1">{n}</b>
                </button>
              );
            })}
            {s.businessRuleEvents24h > 0 && !filters.includeBusinessRules && (
              <button type="button" onClick={() => set({ includeBusinessRules: true })} className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50">
                + {s.businessRuleEvents24h} business-rule refusals in 24 h (hidden)
              </button>
            )}
          </div>
        </Card>
      )}

      <Card>
        <form
          className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8"
          onSubmit={(e) => { e.preventDefault(); set({ q: search }); }}
        >
          <div className="col-span-2">
            <Input placeholder="Search message, path, request ID…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
          </div>
          {!tenantId && (
            <Select value={filters.tenantFilter || ''} aria-label="Client" onChange={(e) => set({ tenantFilter: e.target.value })}>
              <option value="">All clients</option>
              {(tenants || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          )}
          <Select value={filters.severity} aria-label="Severity" onChange={(e) => set({ severity: e.target.value })}>
            <option value="">Any severity</option>
            {SEVERITIES.map((v) => <option key={v} value={v}>{v.charAt(0) + v.slice(1).toLowerCase()}</option>)}
            <option value="CRITICAL,HIGH">Critical + high</option>
          </Select>
          <Select value={filters.status} aria-label="Status" onChange={(e) => set({ status: e.target.value })}>
            <option value="OPEN,ACKNOWLEDGED">Open + acknowledged</option>
            {STATUSES.map((v) => <option key={v} value={v}>{v.charAt(0) + v.slice(1).toLowerCase()}</option>)}
            <option value="">Any status</option>
          </Select>
          <Select value={filters.category} aria-label="Category" onChange={(e) => set({ category: e.target.value })}>
            <option value="">Any kind</option>
            {(catalog?.categories || []).map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </Select>
          <Select value={filters.source} aria-label="Source" onChange={(e) => set({ source: e.target.value })}>
            <option value="">Any source</option>
            {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Select value={String(filters.sinceHours)} aria-label="Time window" onChange={(e) => set({ sinceHours: Number(e.target.value) })}>
            {WINDOWS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <div className="col-span-2 flex flex-wrap items-center gap-3 md:col-span-4 xl:col-span-8">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={filters.includeBusinessRules} onChange={(e) => set({ includeBusinessRules: e.target.checked })} />
              Include business-rule refusals (e.g. &ldquo;not enough stock&rdquo;, closed period)
            </label>
            <span className="ml-auto flex items-center gap-2 text-sm text-slate-500">
              Sort
              <Select value={filters.sort} aria-label="Sort" onChange={(e) => set({ sort: e.target.value })}>
                <option value="recent">Most recent</option>
                <option value="frequent">Most frequent (24 h)</option>
                <option value="severity">Most severe</option>
              </Select>
            </span>
          </div>
        </form>
      </Card>

      <Card
        title={`${total} error group${total === 1 ? '' : 's'}`}
        actions={<span className="text-xs text-slate-400">{lastSync ? `collected ${timeAgo(lastSync)}` : 'not collected yet'}</span>}
      >
        {loading && !data ? <Spinner /> : (
          <Table
            columns={columns}
            rows={data?.groups || []}
            onRowClick={(g) => navigate(`/errors/${g.id}`)}
            empty={filters.status === 'OPEN,ACKNOWLEDGED' ? 'No open errors match these filters.' : 'No errors match these filters.'}
          />
        )}
        {pages > 1 && (
          <div className="mt-3 flex items-center justify-end gap-2 text-sm text-slate-500">
            <Button size="sm" variant="secondary" disabled={filters.page === 0} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>Previous</Button>
            Page {filters.page + 1} of {pages}
            <Button size="sm" variant="secondary" disabled={filters.page + 1 >= pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
