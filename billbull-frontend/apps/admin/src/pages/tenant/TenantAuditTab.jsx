import { platformApi } from '../../api/client';
import { Card, Spinner, Table } from '../../ui/kit';
import { fmtDate } from '../../ui/format';
import { useLoad } from '../../ui/useLoad';

export default function TenantAuditTab({ tenant }) {
  const { data, loading } = useLoad(() => platformApi.audit({ tenantId: tenant.id, size: 100 }), [tenant.id, tenant.configVersion]);
  return (
    <Card title="Everything the control plane did to this client">
      {loading && !data ? <Spinner /> : (
        <Table
          columns={[
            { key: 'occurredAt', label: 'When', render: (r) => <span className="whitespace-nowrap">{fmtDate(r.occurredAt)}</span> },
            { key: 'actorEmail', label: 'Who' },
            { key: 'action', label: 'Action', render: (r) => <span className="font-mono text-xs">{r.action}</span> },
            { key: 'detail', label: 'Detail', className: 'text-slate-600' },
          ]}
          rows={data?.items || []}
        />
      )}
    </Card>
  );
}
