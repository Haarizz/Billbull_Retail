import { useState } from 'react';
import { errorMessage, platformApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { hasRole } from '../../auth/roles';
import { Alert, Badge, Button, Card, Field, Input, Modal, Select, Table, Textarea } from '../../ui/kit';
import { fmtDate } from '../../ui/format';
import { useLoad } from '../../ui/useLoad';

export default function SupportTab({ tenant, onError }) {
  const { user } = useAuth();
  const canOpen = hasRole(user, 'OPERATOR');
  const { data, reload } = useLoad(() => platformApi.supportSessions(tenant.id), [tenant.id]);
  const [reason, setReason] = useState('');
  const [ticket, setTicket] = useState('');
  const [minutes, setMinutes] = useState('30');
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(null);

  const open = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await platformApi.openSupport(tenant.id, { reason, ticketRef: ticket || null, minutes: Number(minutes) });
      setOpened(r);
      setReason('');
      setTicket('');
      reload();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id) => {
    try {
      await platformApi.revokeSupport(id);
      reload();
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <Alert kind="info">
        Support sign-in needs the client&apos;s consent on their server: <code>BILLBULL_PLATFORM_SUPPORT_ACCESS_ENABLED=true</code> and an
        active <code>platform.support</code> user, whose roles decide what you can do. The client sees every session under
        Settings → BillBull Account and can end it.
      </Alert>
      {canOpen && (
        <Card title="Open a support session">
          <form onSubmit={open} className="space-y-4">
            <Field label="Reason" hint="10+ characters. Recorded here and on the client's server.">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} required minLength={10} />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Ticket reference"><Input value={ticket} onChange={(e) => setTicket(e.target.value)} /></Field>
              <Field label="Duration">
                <Select value={minutes} onChange={(e) => setMinutes(e.target.value)}>
                  {['15', '30', '60'].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                </Select>
              </Field>
            </div>
            <Button type="submit" variant="accent" disabled={busy || reason.trim().length < 10}>{busy ? 'Requesting…' : 'Open session'}</Button>
          </form>
        </Card>
      )}
      <Card title="Sessions">
        <Table
          columns={[
            { key: 'createdAt', label: 'Opened', render: (s) => <span className="whitespace-nowrap">{fmtDate(s.createdAt)}</span> },
            { key: 'platformUserEmail', label: 'By' },
            { key: 'reason', label: 'Reason', render: (s) => <span>{s.reason}{s.ticketRef ? ` (${s.ticketRef})` : ''}</span> },
            { key: 'expiresAt', label: 'Until', render: (s) => (s.revokedAt ? `Ended ${fmtDate(s.revokedAt)}` : fmtDate(s.expiresAt)) },
            { key: 'live', label: '', render: (s) => (s.live
              ? <div className="flex items-center gap-2"><Badge value="ACTIVE" label="Live" />{canOpen && <Button size="sm" variant="danger" onClick={() => revoke(s.id)}>End</Button>}</div>
              : <Badge value="ARCHIVED" label="Ended" />) },
          ]}
          rows={data || []}
          empty="No support sessions."
        />
      </Card>
      {opened && (
        <Modal title="Support session ready" onClose={() => setOpened(null)} footer={<Button onClick={() => setOpened(null)}>Close</Button>}>
          <p className="text-sm text-slate-600">Valid until {fmtDate(opened.expiresAt)}. The link signs you in once, in a new tab, on the client&apos;s own site.</p>
          <a href={opened.loginUrl} target="_blank" rel="noreferrer noopener" className="inline-flex rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Open {tenant.appUrl}
          </a>
          <Alert kind="warn">Don&apos;t paste this link anywhere: it is a live sign-in until it expires.</Alert>
        </Modal>
      )}
    </div>
  );
}
