import { useState } from 'react';
import { errorMessage, platformApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { hasRole } from '../../auth/roles';
import { Alert, Badge, Button, Card, Field, Input, Modal, Select, Textarea } from '../../ui/kit';
import { fmtDate } from '../../ui/format';

const STATUSES = [
  ['ONBOARDING', 'Onboarding — being set up; the client works normally.'],
  ['ACTIVE', 'Active — live.'],
  ['READ_ONLY', 'Read-only — users can sign in, view and export, but not change anything.'],
  ['SUSPENDED', 'Suspended — nobody can sign in. Data is kept.'],
  ['ARCHIVED', 'Archived — offboarded; enforced as suspended (OWNER only).'],
];

export const needsReason = (status) => ['READ_ONLY', 'SUSPENDED', 'ARCHIVED'].includes(status);

export default function StatusTab({ tenant, onChange, onError }) {
  const { user } = useAuth();
  const [status, setStatus] = useState(tenant.status);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState(tenant.statusMessage || '');
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const canEdit = hasRole(user, 'OPERATOR');
  const restrictive = needsReason(status);

  const apply = async () => {
    setBusy(true);
    try {
      const updated = await platformApi.changeStatus(tenant.id, { status, reason, customerMessage: restrictive ? message : null });
      setConfirming(false);
      setTyped('');
      setReason('');
      onChange(updated, `Status set to ${status}.`);
    } catch (e) {
      onError(errorMessage(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Current status">
        <div className="space-y-2 text-sm">
          <div><Badge value={tenant.status} /> since {fmtDate(tenant.statusChangedAt)}</div>
          {tenant.statusReason && <div><span className="text-slate-500">Internal reason:</span> {tenant.statusReason}</div>}
          {tenant.statusMessage && <div><span className="text-slate-500">Message shown to users:</span> {tenant.statusMessage}</div>}
        </div>
      </Card>
      {canEdit && (
        <Card title="Change status">
          <div className="space-y-4">
            <Field label="New status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map(([s, label]) => <option key={s} value={s}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Internal reason" hint={restrictive ? 'Required (10+ characters). Goes in the audit log; the client never sees it.' : 'Optional.'}>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            {restrictive && (
              <Field label="Message shown to the client's users" hint="Blank = standard wording.">
                <Input value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} placeholder="Your account is on hold. Please call BillBull on …" />
              </Field>
            )}
            <Button
              variant={restrictive ? 'danger' : 'accent'}
              disabled={busy || status === tenant.status && !restrictive || (restrictive && reason.trim().length < 10)}
              onClick={() => (restrictive ? setConfirming(true) : apply())}
            >
              Apply
            </Button>
          </div>
        </Card>
      )}
      {confirming && (
        <Modal
          title={`Set ${tenant.name} to ${status.replace('_', ' ')}?`}
          onClose={() => setConfirming(false)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button variant="danger" disabled={typed !== tenant.code || busy} onClick={apply}>{busy ? 'Applying…' : 'Confirm'}</Button>
            </>
          )}
        >
          <Alert kind="warn">
            {status === 'READ_ONLY'
              ? 'Every user of this client loses the ability to save anything, including sales at the till.'
              : 'Every user of this client is signed out on their next action and can’t sign in again, the till included.'}
          </Alert>
          <Field label={`Type the client code (${tenant.code}) to confirm`}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </Field>
        </Modal>
      )}
    </div>
  );
}
