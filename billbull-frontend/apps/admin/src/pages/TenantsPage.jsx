import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { platformApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { hasRole } from '../auth/roles';
import { Alert, Badge, Button, Card, Input, PageHeader, Select, Spinner, Table } from '../ui/kit';
import { timeAgo } from '../ui/format';
import { useLoad } from '../ui/useLoad';

export const filterTenants = (tenants, query, status) => {
  const q = query.trim().toLowerCase();
  return tenants.filter((t) =>
    (!status || t.status === status)
    && (!q || [t.code, t.name, t.appUrl, t.serverLabel, t.planCode].some((v) => (v || '').toLowerCase().includes(q))));
};

export default function TenantsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data, loading, error, reload } = useLoad(() => platformApi.tenants(includeArchived), [includeArchived]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const rows = useMemo(() => filterTenants(data || [], query, status), [data, query, status]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clients"
        subtitle="The client registry. Each client runs its own backend and database."
        actions={(
          <>
            <Button variant="secondary" onClick={reload}>Refresh</Button>
            {hasRole(user, 'OPERATOR') && <Button variant="accent" onClick={() => navigate('/tenants/new')}>New client</Button>}
          </>
        )}
      />
      <Alert>{error}</Alert>
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="w-64"><Input placeholder="Search code, name, server…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search clients" /></div>
          <div className="w-48">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
              <option value="">All statuses</option>
              {['ONBOARDING', 'ACTIVE', 'READ_ONLY', 'SUSPENDED', 'ARCHIVED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} /> Show archived
          </label>
        </div>
        {loading && !data ? <Spinner /> : (
          <Table
            onRowClick={(t) => navigate(`/tenants/${t.id}`)}
            empty="No clients match."
            columns={[
              { key: 'name', label: 'Client', render: (t) => (
                <div>
                  <Link to={`/tenants/${t.id}`} className="font-medium text-slate-900 hover:underline" onClick={(e) => e.stopPropagation()}>{t.name}</Link>
                  <div className="font-mono text-xs text-slate-500">{t.code}</div>
                </div>
              ) },
              { key: 'status', label: 'Status', render: (t) => <Badge value={t.status} /> },
              { key: 'plan', label: 'Plan', render: (t) => t.planName || <span className="text-slate-400">—</span> },
              { key: 'health', label: 'Health', render: (t) => (
                <div>
                  <Badge value={t.healthStatus || 'UNKNOWN'} />
                  <div className="mt-0.5 text-xs text-slate-500">{timeAgo(t.healthAt)}</div>
                </div>
              ) },
              { key: 'sync', label: 'Sync', render: (t) => (t.syncPending
                ? <span className={t.lastSyncError ? 'text-red-600' : 'text-amber-700'} title={t.lastSyncError || ''}>{t.lastSyncError ? 'Failed' : 'Pending'}</span>
                : <span className="text-emerald-700">In sync</span>) },
              { key: 'usage', label: 'Users · Terminals', render: (t) => (t.health ? `${t.health.activeUsers ?? '—'} · ${t.health.terminals ?? '—'}` : '—') },
              { key: 'server', label: 'Server', render: (t) => <span className="text-slate-600">{t.serverLabel || '—'}</span> },
            ]}
            rows={rows}
          />
        )}
      </Card>
    </div>
  );
}
