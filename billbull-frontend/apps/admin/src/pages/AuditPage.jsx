import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage, platformApi } from '../api/client';
import { Alert, Button, Card, Input, PageHeader, Spinner, Table } from '../ui/kit';
import { fmtDate } from '../ui/format';
import { useLoad } from '../ui/useLoad';

export default function AuditPage() {
  const [filters, setFilters] = useState({ action: '', actor: '' });
  const [applied, setApplied] = useState({ action: '', actor: '' });
  const [page, setPage] = useState(0);
  const { data, loading, error } = useLoad(
    () => platformApi.audit({ action: applied.action || undefined, actor: applied.actor || undefined, page, size: 50 }),
    [applied, page],
  );
  const [verify, setVerify] = useState(null);

  const runVerify = async () => {
    try {
      setVerify(await platformApi.verifyAudit());
    } catch (e) {
      setVerify({ ok: false, message: errorMessage(e) });
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" subtitle="Every action in the control plane. Append-only and hash-chained."
        actions={<Button variant="secondary" onClick={runVerify}>Verify integrity</Button>} />
      {verify && <Alert kind={verify.ok ? 'success' : 'error'}>{verify.ok ? `Intact: ${verify.checked} events checked.` : verify.message}</Alert>}
      <Alert>{error}</Alert>
      <Card>
        <form className="mb-4 flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); setPage(0); setApplied(filters); }}>
          <div className="w-56"><Input placeholder="Action, e.g. LOGIN_FAILED" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value.toUpperCase() })} aria-label="Action" /></div>
          <div className="w-56"><Input placeholder="Who (email contains)" value={filters.actor} onChange={(e) => setFilters({ ...filters, actor: e.target.value })} aria-label="Actor" /></div>
          <Button type="submit" variant="secondary">Filter</Button>
        </form>
        {loading && !data ? <Spinner /> : (
          <>
            <Table
              columns={[
                { key: 'occurredAt', label: 'When', render: (r) => <span className="whitespace-nowrap">{fmtDate(r.occurredAt)}</span> },
                { key: 'actorEmail', label: 'Who', render: (r) => r.actorEmail || <span className="text-slate-400">—</span> },
                { key: 'action', label: 'Action', render: (r) => <span className="font-mono text-xs">{r.action}</span> },
                { key: 'tenantId', label: 'Client', render: (r) => (r.tenantId ? <Link className="hover:underline" to={`/tenants/${r.tenantId}`}>#{r.tenantId}</Link> : '') },
                { key: 'detail', label: 'Detail', className: 'text-slate-600' },
                { key: 'ip', label: 'IP', className: 'font-mono text-xs text-slate-500' },
              ]}
              rows={data?.items || []}
            />
            <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
              <span>{data?.totalItems ?? 0} events</span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</Button>
                <Button size="sm" variant="secondary" disabled={!data || page + 1 >= data.totalPages} onClick={() => setPage(page + 1)}>Older</Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
