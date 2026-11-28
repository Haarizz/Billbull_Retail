import { useEffect, useState } from 'react';
import { errorMessage, platformApi } from '../../../api/client';
import { useAuth } from '../../../auth/AuthContext';
import { hasRole } from '../../../auth/roles';
import { Alert, Badge, Button, Card, Input, Spinner, Table } from '../../../ui/kit';
import { fmtBytes, fmtDate, timeAgo } from '../../../ui/format';
import { useLoad } from '../../../ui/useLoad';
import CapabilityHint from './CapabilityHint';
import { useStepUp } from './stepUp';
import { fmtMs } from './sqlUtils';

export default function BackupsPanel({ tenant }) {
  const { user } = useAuth();
  const operator = hasRole(user, 'OPERATOR');
  const owner = hasRole(user, 'OWNER');
  const { data, loading, error, reload } = useLoad(() => platformApi.dbBackups(tenant.id), [tenant.id]);
  const stepUp = useStepUp();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({ kind: '', text: '' });

  const running = data?.running;
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [running, reload]);

  const act = async (label, fn) => {
    setBusy(label);
    setMsg({ kind: '', text: '' });
    try {
      await fn();
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
    } finally {
      setBusy('');
    }
  };

  const start = () => act('start', async () => {
    const job = await platformApi.dbStartBackup(tenant.id, note.trim() || null);
    setNote('');
    setMsg({ kind: 'success', text: `Backup ${job.name} started. This page updates when it finishes.` });
    await reload();
  });

  const download = (name) => act(`dl:${name}`, async () => {
    const r = await stepUp.run((code) => platformApi.dbDownloadBackup(tenant.id, name, code), `Downloading a full copy of ${tenant.name}'s database`);
    if (!r) return;
    // A plain navigation streams to disk; the single-use link stands in for the bearer token.
    window.location.assign(r.url);
    setMsg({ kind: 'success', text: `Downloading ${name}. Keep the file somewhere safe: it holds all of ${tenant.name}'s data.` });
  });

  const remove = (name) => act(`rm:${name}`, async () => {
    if (!window.confirm(`Delete ${name} from ${tenant.name}'s server? This can't be undone.`)) return;
    await platformApi.dbDeleteBackup(tenant.id, name);
    setMsg({ kind: 'success', text: `Deleted ${name}.` });
    await reload();
  });

  if (loading && !data) return <Spinner />;

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      {data && !data.enabled && <CapabilityHint what="backups" />}
      <Alert kind={msg.kind || 'info'}>{msg.text}</Alert>

      {data?.enabled && operator && (
        <Card title="Take a backup now">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="md:flex-1">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. before price import" aria-label="Note" maxLength={300} />
            </div>
            <Button variant="accent" disabled={!!running || busy === 'start'} onClick={start}>
              {running ? 'Backup running…' : busy === 'start' ? 'Starting…' : 'Back up now'}
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Runs <code>pg_dump -Fc</code> on the client&apos;s server and checks it with <code>pg_restore --list</code>. The server keeps the newest {data.keep}; older ones are removed.
            {data.diskFreeBytes != null && <> Free disk there: {fmtBytes(data.diskFreeBytes)}.</>}
            {' '}This is on top of the nightly server backup, not instead of it: a dump on the database&apos;s own disk goes with that disk, so download the ones that matter.
          </p>
        </Card>
      )}

      {running && (
        <Alert kind="info">
          Backing up {running.database} ({fmtBytes(running.databaseSizeBytes)}) since {timeAgo(running.startedAt)}, requested by {running.requestedBy}…
        </Alert>
      )}

      <Card title="Backups on the client's server" actions={<Button size="sm" variant="secondary" onClick={reload}>Refresh</Button>}>
        <Table
          rowKey={(b) => b.name}
          columns={[
            { key: 'name', label: 'File', render: (b) => <span className="font-mono text-xs">{b.name}</span> },
            { key: 'status', label: 'Result', render: (b) => <Badge value={b.status} /> },
            { key: 'sizeBytes', label: 'Size', className: 'text-right', render: (b) => fmtBytes(b.sizeBytes) },
            { key: 'finishedAt', label: 'Taken', className: 'whitespace-nowrap text-xs', render: (b) => (
              <span title={fmtDate(b.finishedAt)}>{timeAgo(b.finishedAt)} · {fmtMs(Date.parse(b.finishedAt) - Date.parse(b.startedAt))}</span>
            ) },
            { key: 'requestedBy', label: 'By', className: 'text-xs', render: (b) => (
              <span>{b.requestedBy}{b.note && <span className="block text-slate-500">{b.note}</span>}</span>
            ) },
            { key: 'sha256', label: 'SHA-256', render: (b) => (b.sha256
              ? <span className="font-mono text-[11px] text-slate-500" title={b.sha256}>{b.sha256.slice(0, 12)}…</span>
              : <span className="text-xs text-red-600">{b.message}</span>) },
            { key: 'actions', label: '', render: (b) => (
              <div className="flex gap-1">
                {b.status === 'SUCCESS' && b.present && owner && (
                  <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => download(b.name)}>{busy === `dl:${b.name}` ? 'Preparing…' : 'Download'}</Button>
                )}
                {owner && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => remove(b.name)}>Delete</Button>}
              </div>
            ) },
          ]}
          rows={data?.backups || []}
          empty={data?.enabled ? 'No backup taken from here yet.' : 'Backups are switched off for this client.'}
        />
        {data?.directory && <p className="mt-2 text-xs text-slate-400">Stored in <span className="font-mono">{data.directory}</span> on the client&apos;s server.</p>}
      </Card>
      {!owner && <p className="text-xs text-slate-500">Downloading or deleting a backup needs the OWNER role.</p>}
      {stepUp.modal}
    </div>
  );
}
