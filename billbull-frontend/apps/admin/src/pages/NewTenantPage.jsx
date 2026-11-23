import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage, platformApi } from '../api/client';
import { Alert, Card, PageHeader, SecretOnce } from '../ui/kit';
import { useLoad } from '../ui/useLoad';
import TenantForm from './TenantForm';

export default function NewTenantPage() {
  const navigate = useNavigate();
  const { data: plans } = useLoad(() => platformApi.plans(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  const submit = async (body) => {
    setBusy(true);
    setError('');
    try {
      setCreated(await platformApi.createTenant(body));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="New client" subtitle="Registers the client. Server setup follows the generated provisioning kit." />
      <Alert>{error}</Alert>
      <Card><TenantForm creating plans={plans} busy={busy} onSubmit={submit} onCancel={() => navigate('/tenants')} /></Card>
      {created && (
        <SecretOnce
          title={`Agent secret for ${created.code}`}
          secret={created.agentSecret}
          onClose={() => navigate(`/tenants/${created.id}/provisioning`)}
        >
          <p className="text-sm text-slate-600">
            Put it in <code>/etc/billbull/{created.code}.env</code> as <code>PLATFORM_AGENT_SECRET</code>, together with
            <code> BILLBULL_PLATFORM_AGENT_ENABLED=true</code>. The next screen has the full provisioning kit.
          </p>
        </SecretOnce>
      )}
    </div>
  );
}
