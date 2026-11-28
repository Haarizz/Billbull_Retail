import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorMessage, platformApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { hasRole } from '../auth/roles';
import { Alert, Button, Card, CopyBlock, Field, PageHeader, Select, Spinner, Table, Textarea } from '../ui/kit';
import { fmtDate, timeAgo } from '../ui/format';
import { useLoad } from '../ui/useLoad';
import { STATUSES, STATUS_HELP, dailySeries, shownMessage, sourceLabel } from './errors/errorLogic';
import { DailyBars, ErrorStatusBadge, SeverityBadge, Tag } from './errors/errorUi';

function Facts({ rows }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
      {rows.filter(([, v]) => v != null && v !== '').map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd className="min-w-0 break-words font-mono text-xs text-slate-800 sm:pt-0.5">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Triage({ group, onSaved }) {
  const [status, setStatus] = useState(group.status);
  const [note, setNote] = useState(group.statusNote || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      onSaved(await platformApi.setErrorStatus(group.id, status, note));
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <Alert>{err}</Alert>
      <Field label="Status" hint={STATUS_HELP[status]}>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
        </Select>
      </Field>
      <Field label="Note" hint="What was found or done — e.g. the fix, the ticket, or why it is ignored. Recorded in the audit log.">
        <Textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
    </div>
  );
}

export default function ErrorDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const operator = hasRole(user, 'OPERATOR');
  const { data, loading, error, setData } = useLoad(() => platformApi.error(id), [id]);
  const [saved, setSaved] = useState('');

  if (loading && !data) return <Spinner />;
  if (!data) return <Alert>{error || 'Error not found'}</Alert>;
  const g = data.group;
  const x = data.explanation;
  const message = shownMessage(g);

  return (
    <div className="space-y-4">
      <div className="text-sm"><Link to="/errors" className="text-slate-500 hover:text-slate-800">← Error logs</Link></div>
      <PageHeader
        title={(
          <span className="flex flex-wrap items-center gap-2">
            <SeverityBadge value={x.severity} /> {x.title}
          </span>
        )}
        subtitle={(
          <span className="flex flex-wrap items-center gap-2">
            <Link to={`/tenants/${g.tenantId}/errors`} className="font-medium text-slate-700 hover:underline">{g.tenantName}</Link>
            <span className="font-mono text-xs">{g.tenantCode}</span> ·
            <Tag>{x.moduleLabel}</Tag> <Tag>{x.categoryLabel}</Tag> <Tag>{sourceLabel(g.source)}</Tag>
            <ErrorStatusBadge value={g.status} regressed={g.regressed} />
          </span>
        )}
      />
      <Alert kind="success">{saved}</Alert>
      {g.regressed && (
        <Alert kind="warn">This was marked resolved{g.statusChangedBy ? ` by ${g.statusChangedBy}` : ''} and has happened again since — the fix did not hold, or it was not deployed to this client.</Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="What happened">
            <p className="text-sm leading-relaxed text-slate-700">{x.whatHappened}</p>
            {message && (
              <blockquote className="mt-3 rounded-md border-l-4 border-amber-300 bg-amber-50/60 px-3 py-2 text-sm text-slate-800">
                <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {x.category === 'BUSINESS_RULE' || x.category === 'ACCOUNTING_RULE' ? 'Message the user saw' : 'Recorded message'}
                </div>
                {message}
              </blockquote>
            )}
          </Card>

          <Card title="What it means for the business">
            <p className="text-sm leading-relaxed text-slate-700">{x.businessImpact}</p>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Likely causes">
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
                {x.likelyCauses.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </Card>
            <Card title="What to do">
              <p className="mb-2 text-xs text-slate-500">First to act: <b className="text-slate-700">{x.ownerLabel}</b></p>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
                {x.recommendedActions.map((a) => <li key={a}>{a}</li>)}
              </ol>
            </Card>
          </div>

          <Card title="Recent occurrences" actions={<span className="text-xs text-slate-400">latest {data.events.length}</span>}>
            <Table
              rowKey={(e) => e.id}
              columns={[
                { key: 'occurredAt', label: 'When', render: (e) => <span className="whitespace-nowrap" title={fmtDate(e.occurredAt)}>{timeAgo(e.occurredAt)}</span> },
                { key: 'username', label: 'User', render: (e) => e.username || '—' },
                { key: 'branchId', label: 'Branch', render: (e) => e.branchId ?? '—' },
                { key: 'path', label: 'Where', className: 'font-mono text-xs', render: (e) => `${e.httpMethod ? `${e.httpMethod} ` : ''}${e.path || e.clientUrl || '—'}` },
                { key: 'httpStatus', label: 'Status', render: (e) => e.httpStatus ?? '—' },
                { key: 'requestId', label: 'Request ID', className: 'font-mono text-[11px] text-slate-500', render: (e) => e.requestId || '—' },
              ]}
              rows={data.events}
              empty="Individual occurrences are kept for 30 days."
            />
          </Card>

          <Card title="Technical details">
            <p className="mb-3 font-mono text-xs text-slate-700">{x.technicalSummary}</p>
            <Facts
              rows={[
                ['Exception', g.exceptionClass],
                ['Root cause', g.rootCauseClass],
                ['Cause chain', g.causeChain],
                ['Root cause message', g.rootCauseMessage && g.rootCauseMessage !== message ? g.rootCauseMessage : null],
                ['Top message', g.message && g.message !== message ? g.message : null],
                ['SQL state', g.sqlState],
                ['Error code', g.errorCode],
                ['Endpoint', g.pathTemplate ? `${g.httpMethod || ''} ${g.pathTemplate}`.trim() : null],
                ['HTTP status', g.httpStatus],
                ['Where in the code', g.topFrame],
                ['Logger / source', g.logger],
                ['Build', g.appVersion],
                ['Last request ID', g.lastRequestId],
                ['Catalogue rule', x.ruleCode],
                ['Fingerprint', g.fingerprint],
              ]}
            />
            {g.stackTrace && <div className="mt-4"><CopyBlock text={g.stackTrace} label="Copy stack" /></div>}
            <p className="mt-3 text-xs text-slate-400">
              Request IDs match the client server&apos;s log lines ([req=…]) for the full context. Messages are redacted
              (e-mails, long numbers, tokens) before they leave the client.
            </p>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Occurrences">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-slate-500">Total</div><div className="text-xl font-semibold">{g.occurrences}</div></div>
              <div><div className="text-xs text-slate-500">Users affected</div><div className="text-xl font-semibold">{data.usersAffected}</div></div>
              <div><div className="text-xs text-slate-500">First seen</div><div title={fmtDate(g.firstSeenAt)}>{timeAgo(g.firstSeenAt)}</div></div>
              <div><div className="text-xs text-slate-500">Last seen</div><div title={fmtDate(g.lastSeenAt)}>{timeAgo(g.lastSeenAt)}</div></div>
              <div><div className="text-xs text-slate-500">Branches</div><div>{data.branchesAffected}</div></div>
              <div><div className="text-xs text-slate-500">Last user</div><div className="truncate">{g.lastUsername || '—'}</div></div>
            </div>
            <div className="mt-4">
              <div className="mb-1 text-xs text-slate-500">Last 14 days</div>
              <DailyBars series={dailySeries(data.daily)} />
            </div>
          </Card>

          <Card title="Triage">
            {operator ? (
              <Triage
                key={`${g.id}-${g.status}-${g.statusChangedAt}`}
                group={g}
                onSaved={(d) => { setData(d); setSaved('Status saved.'); }}
              />
            ) : (
              <div className="space-y-1 text-sm">
                <ErrorStatusBadge value={g.status} regressed={g.regressed} />
                {g.statusNote && <p className="text-slate-700">{g.statusNote}</p>}
              </div>
            )}
            {g.statusChangedAt && (
              <p className="mt-3 text-xs text-slate-400">Last changed {fmtDate(g.statusChangedAt)} by {g.statusChangedBy}</p>
            )}
          </Card>

          <Card title="Same fault at other clients">
            {data.otherClients.length === 0 ? (
              <p className="text-sm text-slate-500">Only this client has hit it — likely tied to their data or setup.</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-slate-500">Seen elsewhere too — more likely a software defect than this client&apos;s data.</p>
                <ul className="space-y-1.5 text-sm">
                  {data.otherClients.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2">
                      <Link to={`/errors/${o.id}`} className="font-mono text-xs hover:underline">{o.tenantCode}</Link>
                      <span className="text-xs text-slate-500">{o.occurrences}× · {timeAgo(o.lastSeenAt)}</span>
                      <ErrorStatusBadge value={o.status} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card title="About this kind of error">
            <p className="text-sm text-slate-700"><b>{x.categoryLabel}.</b> {x.categoryDescription}</p>
            <Link to="/errors/guide" className="mt-2 inline-block text-sm text-slate-500 hover:underline">Open the error guide</Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
