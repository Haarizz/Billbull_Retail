import { useState } from 'react';
import { errorMessage, platformApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageHeader, SecretOnce, Select, Spinner, Table } from '../ui/kit';
import { fmtDate } from '../ui/format';
import { useLoad } from '../ui/useLoad';

const ROLES = [
  ['VIEWER', 'Viewer — read only'],
  ['OPERATOR', 'Operator — manage clients, status, modules, support'],
  ['OWNER', 'Owner — everything, plus users, plans and secrets'],
];

export default function UsersPage() {
  const { user: me } = useAuth();
  const { data, loading, error, reload } = useLoad(() => platformApi.users(), []);
  const [creating, setCreating] = useState(null);
  const [temp, setTemp] = useState(null);
  const [notice, setNotice] = useState('');

  const run = async (fn, after) => {
    setNotice('');
    try {
      const r = await fn();
      if (r?.temporaryPassword) setTemp({ email: r.email, password: r.temporaryPassword });
      after?.();
      reload();
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Platform users" subtitle="BillBull staff who can sign in here. Every one must use two-step sign-in."
        actions={<Button variant="accent" onClick={() => setCreating({ email: '', fullName: '', role: 'VIEWER' })}>Add user</Button>} />
      <Alert>{error || notice}</Alert>
      <Card>
        {loading && !data ? <Spinner /> : (
          <Table
            columns={[
              { key: 'email', label: 'User', render: (u) => <div><div className="font-medium">{u.fullName}</div><div className="text-xs text-slate-500">{u.email}</div></div> },
              { key: 'role', label: 'Role', render: (u) => (u.id === me.id ? <Badge value={u.role} /> : (
                <Select value={u.role} onChange={(e) => run(() => platformApi.updateUser(u.id, { role: e.target.value }))} aria-label={`Role of ${u.email}`}>
                  {ROLES.map(([r]) => <option key={r} value={r}>{r}</option>)}
                </Select>
              )) },
              { key: 'mfa', label: 'Two-step', render: (u) => (u.mfaEnabled ? <Badge value="ACTIVE" label="On" /> : <Badge value="READ_ONLY" label="Not set up" />) },
              { key: 'lastLoginAt', label: 'Last sign-in', render: (u) => <span className="whitespace-nowrap">{fmtDate(u.lastLoginAt)}</span> },
              { key: 'active', label: 'State', render: (u) => <Badge value={u.active ? 'ACTIVE' : 'SUSPENDED'} label={u.active ? 'Active' : 'Deactivated'} /> },
              { key: 'actions', label: '', render: (u) => u.id !== me.id && (
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="secondary" onClick={() => run(() => platformApi.resetPassword(u.id))}>Reset password</Button>
                  <Button size="sm" variant="secondary" onClick={() => run(() => platformApi.resetMfa(u.id))}>Reset two-step</Button>
                  <Button size="sm" variant={u.active ? 'danger' : 'secondary'} onClick={() => run(() => platformApi.updateUser(u.id, { active: !u.active }))}>{u.active ? 'Deactivate' : 'Reactivate'}</Button>
                </div>
              ) },
            ]}
            rows={data || []}
          />
        )}
      </Card>
      {creating && (
        <Modal title="Add platform user" onClose={() => setCreating(null)}
          footer={<><Button variant="secondary" onClick={() => setCreating(null)}>Cancel</Button><Button variant="accent" onClick={() => run(() => platformApi.createUser(creating), () => setCreating(null))}>Create</Button></>}>
          <Field label="Email"><Input type="email" value={creating.email} onChange={(e) => setCreating({ ...creating, email: e.target.value })} /></Field>
          <Field label="Full name"><Input value={creating.fullName} onChange={(e) => setCreating({ ...creating, fullName: e.target.value })} /></Field>
          <Field label="Role">
            <Select value={creating.role} onChange={(e) => setCreating({ ...creating, role: e.target.value })}>
              {ROLES.map(([r, l]) => <option key={r} value={r}>{l}</option>)}
            </Select>
          </Field>
          <Alert>{notice}</Alert>
        </Modal>
      )}
      {temp && (
        <SecretOnce title={`Temporary password for ${temp.email}`} secret={temp.password} onClose={() => setTemp(null)}>
          <p className="text-sm text-slate-600">Give it to them over a separate channel. They must change it and set up two-step sign-in when they first sign in.</p>
        </SecretOnce>
      )}
    </div>
  );
}
