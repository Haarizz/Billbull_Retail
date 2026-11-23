import { Link } from 'react-router-dom';
import { platformApi } from '../api/client';
import { Alert, Badge, Button, Card, PageHeader, Spinner, Table } from '../ui/kit';
import { fmtBytes, fmtDate, timeAgo } from '../ui/format';
import { useLoad } from '../ui/useLoad';

export default function BackupsPage() {
  const { data, loading, error, reload } = useLoad(() => platformApi.backups(), []);
  return (
    <div className="space-y-4">
      <PageHeader title="Backups"
        subtitle={`Reported by each server's backup script. A database backup older than ${data?.staleAfterHours ?? 26} hours is flagged.`}
        actions={<Button variant="secondary" onClick={reload}>Refresh</Button>} />
      <Alert>{error}</Alert>
      {loading && !data ? <Spinner /> : (
        <>
          <Card title="Per client">
            <Table
              rowKey={(r) => r.tenantId}
              columns={[
                { key: 'tenantName', label: 'Client', render: (r) => <Link to={`/tenants/${r.tenantId}/backups`} className="font-medium hover:underline">{r.tenantName}</Link> },
                { key: 'state', label: 'State', render: (r) => <Badge value={r.state} /> },
                { key: 'lastSuccessAt', label: 'Last good database backup', render: (r) => (r.lastSuccessAt ? `${fmtDate(r.lastSuccessAt)} (${timeAgo(r.lastSuccessAt)})` : '—') },
                { key: 'size', label: 'Size', render: (r) => fmtBytes(r.lastSuccessSizeBytes) },
                { key: 'lastRunMessage', label: 'Last message', className: 'text-slate-600', render: (r) => (r.lastRunStatus === 'FAILED' ? r.lastRunMessage : '') },
              ]}
              rows={data?.tenants || []}
            />
          </Card>
          <Card title="Recent reports">
            <Table
              columns={[
                { key: 'reportedAt', label: 'Reported', render: (r) => <span className="whitespace-nowrap">{fmtDate(r.reportedAt)}</span> },
                { key: 'tenantCode', label: 'Client', render: (r) => r.tenantCode || r.databaseName || '—' },
                { key: 'kind', label: 'Kind' },
                { key: 'status', label: 'Result', render: (r) => <Badge value={r.status} /> },
                { key: 'sizeBytes', label: 'Size', render: (r) => fmtBytes(r.sizeBytes) },
                { key: 'location', label: 'Location', className: 'font-mono text-xs' },
              ]}
              rows={data?.recent || []}
              empty="No reports yet. Install the backup script (docs/superadmin/OPERATIONS.md)."
            />
          </Card>
        </>
      )}
    </div>
  );
}
