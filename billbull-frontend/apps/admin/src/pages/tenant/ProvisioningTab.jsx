import { useState } from 'react';
import { errorMessage, platformApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { hasRole } from '../../auth/roles';
import { Alert, Button, Card, CopyBlock, Modal, SecretOnce, Spinner } from '../../ui/kit';
import { useLoad } from '../../ui/useLoad';

export default function ProvisioningTab({ tenant, onChange, onError }) {
  const { user } = useAuth();
  const { data: kit, loading, error } = useLoad(() => platformApi.provisioningKit(tenant.id), [tenant.id, tenant.backendPort, tenant.databaseName]);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [secret, setSecret] = useState(null);

  const rotate = async () => {
    try {
      const r = await platformApi.rotateSecret(tenant.id);
      setConfirmRotate(false);
      setSecret(r.agentSecret);
      onChange(r, 'New agent secret issued.');
    } catch (e) {
      setConfirmRotate(false);
      onError(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <Alert kind="info">
        These files are generated from the registry; nothing is changed on any server. They give each client its own secrets,
        database role, working directory (uploads and logs) and heap cap, and limit <code>/api/platform/</code> to the control plane.
      </Alert>
      {hasRole(user, 'OWNER') && (
        <Card title="Agent secret" actions={<Button size="sm" variant="danger" onClick={() => setConfirmRotate(true)}>Rotate</Button>}>
          <p className="text-sm text-slate-600">Rotating issues a new secret. The control plane can&apos;t reach the client until its env file has the new value and the backend is restarted.</p>
        </Card>
      )}
      {loading && !kit && <Spinner />}
      <Alert>{error}</Alert>
      {kit && Object.entries(kit).map(([name, text]) => (
        <Card key={name} title={<span className="font-mono">{name}</span>}>
          <CopyBlock text={text} />
        </Card>
      ))}
      {confirmRotate && (
        <Modal
          title="Rotate the agent secret?"
          onClose={() => setConfirmRotate(false)}
          footer={<><Button variant="secondary" onClick={() => setConfirmRotate(false)}>Cancel</Button><Button variant="danger" onClick={rotate}>Rotate</Button></>}
        >
          <p className="text-sm text-slate-600">Health checks and pushes to {tenant.code} fail until the new secret is installed on its server.</p>
        </Modal>
      )}
      {secret && (
        <SecretOnce title={`New agent secret for ${tenant.code}`} secret={secret} onClose={() => setSecret(null)}>
          <p className="text-sm text-slate-600">Replace <code>PLATFORM_AGENT_SECRET</code> in <code>/etc/billbull/{tenant.code}.env</code>, then <code>systemctl restart billbull-{tenant.code}</code>.</p>
        </SecretOnce>
      )}
    </div>
  );
}
