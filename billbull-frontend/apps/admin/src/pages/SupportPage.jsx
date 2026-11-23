import { Link } from 'react-router-dom';
import { errorMessage, platformApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { hasRole } from '../auth/roles';
import { Alert, Badge, Button, Card, PageHeader, Spinner, Table } from '../ui/kit';
import { fmtDate } from '../ui/format';
import { useLoad } from '../ui/useLoad';

export default function SupportPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useLoad(() => platformApi.allSupportSessions(), []);
  const { data: tenants } = useLoad(() => platformApi.tenants(true), []);
  const names = Object.fromEntries((tenants || []).map((t) => [t.id, t.name]));

  const revoke = async (id) => {
    try {
      await platformApi.revokeSupport(id);
      reload();
    } catch (e) {
      window.alert(errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Support access" subtitle="Every time-boxed support sign-in, across all clients. Open a new one from the client's page." />
      <Alert>{error}</Alert>
      <Card>
        {loading && !data ? <Spinner /> : (
          <Table
            columns={[
              { key: 'createdAt', label: 'Opened', render: (s) => <span className="whitespace-nowrap">{fmtDate(s.createdAt)}</span> },
              { key: 'tenantId', label: 'Client', render: (s) => <Link to={`/tenants/${s.tenantId}/support`} className="hover:underline">{names[s.tenantId] || `#${s.tenantId}`}</Link> },
              { key: 'platformUserEmail', label: 'By' },
              { key: 'reason', label: 'Reason', className: 'text-slate-600' },
              { key: 'expiresAt', label: 'Until', render: (s) => (s.revokedAt ? `Ended ${fmtDate(s.revokedAt)}` : fmtDate(s.expiresAt)) },
              { key: 'live', label: '', render: (s) => (s.live
                ? <div className="flex gap-2"><Badge value="ACTIVE" label="Live" />{hasRole(user, 'OPERATOR') && <Button size="sm" variant="danger" onClick={() => revoke(s.id)}>End</Button>}</div>
                : <Badge value="ARCHIVED" label="Ended" />) },
            ]}
            rows={data || []}
            empty="No support sessions yet."
          />
        )}
      </Card>
    </div>
  );
}
