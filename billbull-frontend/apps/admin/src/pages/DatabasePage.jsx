import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { platformApi } from '../api/client';
import { Alert, Badge, Card, Input, PageHeader, Spinner, Table } from '../ui/kit';
import { timeAgo } from '../ui/format';
import { useLoad } from '../ui/useLoad';

/** Picks the client whose database to open; the console itself is the client's "Database" tab. */
export default function DatabasePage() {
  const navigate = useNavigate();
  const { data, loading, error } = useLoad(() => platformApi.tenants(false), []);
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const f = q.trim().toLowerCase();
    return (data || []).filter((t) => !f || [t.code, t.name, t.serverLabel].some((v) => (v || '').toLowerCase().includes(f)));
  }, [data, q]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Database console"
        subtitle="Run SQL, find what to optimise, watch live sessions and take backups — on one client's database at a time, through its signed agent."
      />
      <Alert kind="info">
        Every statement is recorded with your name in the platform audit log and in the client&apos;s own audit log. Reading data needs the client&apos;s server to switch the
        console on; changing data needs the OWNER role and an authenticator code.
      </Alert>
      <Card title="Choose a client" actions={<span className="w-64"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients" aria-label="Search clients" /></span>}>
        {error && <Alert>{error}</Alert>}
        {loading && !data ? <Spinner /> : (
          <Table
            onRowClick={(t) => navigate(`/tenants/${t.id}/database`)}
            columns={[
              { key: 'name', label: 'Client', render: (t) => (
                <div>
                  <div className="font-medium text-slate-900">{t.name}</div>
                  <div className="font-mono text-xs text-slate-500">{t.code}</div>
                </div>
              ) },
              { key: 'status', label: 'Status', render: (t) => <Badge value={t.status} /> },
              { key: 'health', label: 'Health', render: (t) => (
                <span className="flex items-center gap-2"><Badge value={t.healthStatus || 'UNKNOWN'} /><span className="text-xs text-slate-500">{timeAgo(t.healthAt)}</span></span>
              ) },
              { key: 'server', label: 'Server', render: (t) => <span className="text-slate-600">{t.serverLabel || '—'}</span> },
              { key: 'open', label: '', render: () => <span className="text-sm text-sky-700">Open →</span> },
            ]}
            rows={rows}
            empty="No clients."
          />
        )}
      </Card>
    </div>
  );
}
