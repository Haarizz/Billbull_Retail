import { Link } from 'react-router-dom';
import { platformApi } from '../api/client';
import { Alert, Badge, Button, Card, PageHeader, Spinner, Stat, Table } from '../ui/kit';
import { fmtDate } from '../ui/format';
import { useLoad } from '../ui/useLoad';

const KIND_LABEL = { HEALTH: 'Health', SYNC: 'Sync', MIGRATION: 'Migrations', MEMORY: 'Memory', DISK: 'Disk', BACKUP: 'Backup', ERRORS: 'Errors' };

export default function DashboardPage() {
  const { data, loading, error, reload } = useLoad(() => platformApi.dashboard(), []);
  if (loading && !data) return <Spinner />;
  const d = data || {};
  const unhealthy = Object.entries(d.byHealth || {}).filter(([k]) => k !== 'UP').reduce((n, [, v]) => n + v, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Every BillBull client at a glance." actions={<Button variant="secondary" onClick={reload}>Refresh</Button>} />
      <Alert>{error}</Alert>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clients" value={d.tenantCount ?? 0} />
        <Stat label="Active" value={d.byStatus?.ACTIVE ?? 0} tone="green" />
        <Stat label="Suspended / read-only" value={(d.byStatus?.SUSPENDED ?? 0) + (d.byStatus?.READ_ONLY ?? 0)} tone={(d.byStatus?.SUSPENDED || d.byStatus?.READ_ONLY) ? 'amber' : undefined} />
        <Stat label="Not healthy" value={unhealthy} tone={unhealthy ? 'red' : 'green'} />
      </div>

      <Card title={`Needs attention (${(d.attention || []).length})`}>
        <Table
          rowKey={(r) => `${r.tenantId}-${r.kind}-${r.message}`}
          empty="Nothing needs attention."
          columns={[
            { key: 'tenantCode', label: 'Client', render: (r) => <Link className="font-medium text-slate-900 hover:underline" to={`/tenants/${r.tenantId}`}>{r.tenantCode}</Link> },
            {
              key: 'kind',
              label: 'Area',
              render: (r) => (r.kind === 'ERRORS'
                ? <Link className="hover:underline" to={`/tenants/${r.tenantId}/errors`}>{KIND_LABEL.ERRORS}</Link>
                : KIND_LABEL[r.kind] || r.kind),
            },
            { key: 'message', label: 'Issue', className: 'text-slate-600' },
          ]}
          rows={d.attention || []}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Deployed builds">
          {Object.keys(d.builds || {}).length === 0 && <p className="text-sm text-slate-400">No health reports with build information yet.</p>}
          <ul className="space-y-2 text-sm">
            {Object.entries(d.builds || {}).map(([build, codes]) => (
              <li key={build}>
                <div className="font-mono text-xs text-slate-700">{build}</div>
                <div className="text-slate-500">{codes.join(', ')}</div>
              </li>
            ))}
          </ul>
          {Object.keys(d.builds || {}).length > 1 && <div className="mt-3"><Alert kind="warn">Clients run different builds.</Alert></div>}
        </Card>
        <Card title="Database migration versions">
          <ul className="space-y-2 text-sm">
            {Object.entries(d.migrationVersions || {}).map(([v, codes]) => (
              <li key={v} className="flex justify-between gap-4"><span className="font-mono">V{v}</span><span className="text-right text-slate-500">{codes.join(', ')}</span></li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Health">
        <div className="flex flex-wrap gap-2">
          {Object.entries(d.byHealth || {}).map(([k, v]) => <span key={k} className="inline-flex items-center gap-1.5"><Badge value={k} /> <span className="text-sm text-slate-600">{v}</span></span>)}
        </div>
      </Card>

      <Card title="Recent activity" actions={<Link to="/audit" className="text-xs text-slate-500 hover:underline">Full audit log</Link>}>
        <Table
          columns={[
            { key: 'occurredAt', label: 'When', render: (r) => <span className="whitespace-nowrap">{fmtDate(r.occurredAt)}</span> },
            { key: 'actorEmail', label: 'Who' },
            { key: 'action', label: 'Action', render: (r) => <span className="font-mono text-xs">{r.action}</span> },
            { key: 'detail', label: 'Detail', className: 'text-slate-600' },
          ]}
          rows={d.recentActivity || []}
        />
      </Card>
    </div>
  );
}
