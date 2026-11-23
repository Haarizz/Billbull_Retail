import { platformApi } from '../../api/client';
import { Badge, Card, Spinner, Table } from '../../ui/kit';
import { fmtBytes, fmtDate } from '../../ui/format';
import { useLoad } from '../../ui/useLoad';

export default function TenantBackupsTab({ tenant }) {
  const { data, loading } = useLoad(() => platformApi.tenantBackups(tenant.id), [tenant.id]);
  return (
    <Card title="Backup reports">
      {loading && !data ? <Spinner /> : (
        <Table
          columns={[
            { key: 'reportedAt', label: 'Reported', render: (r) => <span className="whitespace-nowrap">{fmtDate(r.reportedAt)}</span> },
            { key: 'kind', label: 'Kind' },
            { key: 'status', label: 'Result', render: (r) => <Badge value={r.status} /> },
            { key: 'sizeBytes', label: 'Size', render: (r) => fmtBytes(r.sizeBytes) },
            { key: 'location', label: 'Location', className: 'font-mono text-xs' },
            { key: 'message', label: 'Message', className: 'text-slate-600' },
          ]}
          rows={data || []}
          empty="No backup has been reported for this client. See docs/superadmin/OPERATIONS.md."
        />
      )}
    </Card>
  );
}
