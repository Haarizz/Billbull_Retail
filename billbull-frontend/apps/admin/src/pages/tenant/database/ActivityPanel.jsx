import { useEffect, useMemo, useState } from 'react';
import { errorMessage, platformApi } from '../../../api/client';
import { useAuth } from '../../../auth/AuthContext';
import { hasRole } from '../../../auth/roles';
import { Alert, Badge, Button, Card, Field, Input, Modal, Spinner, Table } from '../../../ui/kit';
import { useLoad } from '../../../ui/useLoad';
import { fmtSeconds } from './sqlUtils';

const STATE_BADGE = {
  active: ['UP', 'active'],
  idle: ['UNKNOWN', 'idle'],
  'idle in transaction': ['DEGRADED', 'idle in txn'],
  'idle in transaction (aborted)': ['FAILED', 'aborted txn'],
};

export default function ActivityPanel({ tenant, caps }) {
  const { user } = useAuth();
  const operator = hasRole(user, 'OPERATOR');
  const { data, loading, error, reload } = useLoad(() => platformApi.dbActivity(tenant.id), [tenant.id]);
  const [auto, setAuto] = useState(false);
  const [showIdle, setShowIdle] = useState(false);
  const [target, setTarget] = useState(null);
  const [msg, setMsg] = useState({ kind: '', text: '' });

  useEffect(() => {
    if (!auto) return undefined;
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [auto, reload]);

  const sessions = useMemo(() => (data?.sessions || []).filter((s) => showIdle || (s.state && s.state !== 'idle')), [data, showIdle]);
  const blocked = (data?.sessions || []).filter((s) => s.blocked_by);
  const longTxn = (data?.sessions || []).filter((s) => s.state?.startsWith('idle in transaction') && s.xact_seconds > 60);

  if (!operator) return <Alert kind="info">Session activity needs the OPERATOR role.</Alert>;

  return (
    <div className="space-y-4">
      <Alert kind={msg.kind || 'info'}>{msg.text}</Alert>
      {blocked.length > 0 && <Alert kind="warn">{blocked.length} session(s) are waiting on a lock held by another session (see “Blocked by”).</Alert>}
      {longTxn.length > 0 && <Alert kind="warn">{longTxn.length} session(s) have sat in an open transaction for over a minute. They hold locks and stop vacuum from cleaning up.</Alert>}
      {!caps.console && <Alert kind="info">Query text is hidden: the client&apos;s server hasn&apos;t switched the SQL console on.</Alert>}

      <Card
        title={data ? `${sessions.length} of ${data.sessions.length} sessions` : 'Sessions'}
        actions={(
          <>
            <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={showIdle} onChange={(e) => setShowIdle(e.target.checked)} /> Show idle</label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-refresh 5 s</label>
            <Button size="sm" variant="secondary" onClick={reload}>{loading ? 'Loading…' : 'Refresh'}</Button>
          </>
        )}
      >
        {error && <Alert>{error}</Alert>}
        {loading && !data ? <Spinner /> : (
          <Table
            rowKey={(s) => s.pid}
            columns={[
              { key: 'pid', label: 'PID', className: 'font-mono text-xs' },
              { key: 'state', label: 'State', render: (s) => {
                const [v, l] = STATE_BADGE[s.state] || ['UNKNOWN', s.state || s.backend_type];
                return <Badge value={v} label={l} />;
              } },
              { key: 'application_name', label: 'Application', className: 'text-xs', render: (s) => (
                <span title={`${s.user_name || ''} ${s.client_addr || ''}`}>{s.application_name || s.backend_type}</span>
              ) },
              { key: 'query_seconds', label: 'Running', className: 'text-xs whitespace-nowrap text-right', render: (s) => (
                <span className={s.state === 'active' && s.query_seconds > 30 ? 'font-semibold text-red-600' : ''}>{s.state === 'active' ? fmtSeconds(s.query_seconds) : '—'}</span>
              ) },
              { key: 'xact_seconds', label: 'In txn', className: 'text-xs whitespace-nowrap text-right', render: (s) => fmtSeconds(s.xact_seconds) },
              { key: 'wait', label: 'Waiting on', className: 'text-xs', render: (s) => (s.wait_event ? `${s.wait_event_type}: ${s.wait_event}` : '') },
              { key: 'blocked_by', label: 'Blocked by', className: 'font-mono text-xs text-red-600' },
              { key: 'query', label: 'Query', render: (s) => (s.query
                ? <code className="line-clamp-2 block max-w-md whitespace-pre-wrap break-all text-[11px] text-slate-700" title={s.query}>{s.query}</code>
                : <span className="text-xs text-slate-400">hidden</span>) },
              { key: 'actions', label: '', render: (s) => s.backend_type === 'client backend' && (
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => setTarget({ session: s, terminate: false })}>Cancel</Button>
                  <Button size="sm" variant="danger" onClick={() => setTarget({ session: s, terminate: true })}>End</Button>
                </div>
              ) },
            ]}
            rows={sessions}
            empty="No active sessions. Tick “Show idle” to see the connection pool."
          />
        )}
      </Card>

      {data?.locks?.length > 0 && (
        <Card title="Locks (waiting or exclusive)">
          <Table
            rowKey={(l) => `${l.pid}-${l.locktype}-${l.mode}-${l.relation}`}
            columns={[
              { key: 'pid', label: 'PID', className: 'font-mono text-xs' },
              { key: 'relation', label: 'Relation', className: 'font-mono text-xs' },
              { key: 'locktype', label: 'Type', className: 'text-xs' },
              { key: 'mode', label: 'Mode', className: 'text-xs' },
              { key: 'granted', label: 'Granted', render: (l) => (l.granted ? <Badge value="OK" label="held" /> : <Badge value="FAILED" label="waiting" />) },
            ]}
            rows={data.locks}
          />
        </Card>
      )}

      {target && (
        <CancelModal
          target={target}
          onClose={() => setTarget(null)}
          onDone={(text) => { setMsg({ kind: 'success', text }); setTarget(null); reload(); }}
          run={(reason) => platformApi.dbCancel(tenant.id, target.session.pid, { terminate: target.terminate, reason })}
        />
      )}
    </div>
  );
}

function CancelModal({ target, onClose, onDone, run }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const s = target.session;
  const app = s.application_name || '';
  const isApp = !app.startsWith('billbull-platform') && !app.startsWith('psql');
  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await run(reason.trim() || null);
      onDone(r.signalled
        ? `${target.terminate ? 'Ended session' : 'Cancelled the query in session'} ${s.pid}.`
        : `Session ${s.pid} had already finished.`);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={target.terminate ? `End session ${s.pid}?` : `Cancel the query in session ${s.pid}?`}
      onClose={onClose}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Back</Button>
          <Button variant={target.terminate ? 'danger' : 'primary'} disabled={busy} onClick={go}>{busy ? 'Sending…' : target.terminate ? 'End session' : 'Cancel query'}</Button>
        </>
      )}
    >
      <Alert>{err}</Alert>
      <p className="text-sm text-slate-600">
        {target.terminate
          ? 'Closes the connection and rolls back its open transaction.'
          : 'Stops the running statement; the connection stays open and its transaction is rolled back.'}
        {isApp && ' This looks like one of the application\'s own connections: the user whose request it serves gets an error and may need to retry.'}
      </p>
      {s.query && <pre className="max-h-40 overflow-auto rounded bg-slate-50 p-2 text-[11px] text-slate-700 whitespace-pre-wrap break-all">{s.query}</pre>}
      <Field label="Reason (recorded in both audit logs)">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. runaway report blocking the till" />
      </Field>
    </Modal>
  );
}
