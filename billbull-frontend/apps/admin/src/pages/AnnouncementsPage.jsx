import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage, platformApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { hasRole } from '../auth/roles';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Table, Textarea } from '../ui/kit';
import { fmtDate, timeAgo } from '../ui/format';
import { useLoad } from '../ui/useLoad';
import {
  AUDIENCES, KINDS, PHASES, audienceLabel, draftFrom, draftProblem, draftToBody, emptyDraft, kindMeta, matches, summarize,
} from './announcements/announcementLogic';

const PHASE_BADGE = {
  LIVE: { value: 'ACTIVE', label: 'Live' },
  SCHEDULED: { value: 'ONBOARDING', label: 'Scheduled' },
  ENDED: { value: 'NEVER', label: 'Ended' },
  ARCHIVED: { value: 'ARCHIVED', label: 'Archived' },
};

const DELIVERY_BADGE = {
  DELIVERED: { value: 'OK', label: 'Delivered' },
  PENDING: { value: 'STALE', label: 'Pending' },
  FAILED: { value: 'FAILED', label: 'Failed' },
  NOT_CONFIGURED: { value: 'NOT_CONFIGURED', label: 'Agent not set up' },
  WITHDRAWN: { value: 'ARCHIVED', label: 'Withdrawn' },
  NOT_TARGETED: { value: 'ARCHIVED', label: 'No longer targeted' },
};

function KindIcon({ kind, size = 'h-8 w-8 text-sm' }) {
  const k = kindMeta(kind);
  return <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-lg font-bold ${size} ${k.tone}`}>{k.icon}</span>;
}

/** Roughly what a client's user sees when they next open BillBull. */
function PopupPreview({ draft }) {
  const k = kindMeta(draft.kind);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Preview</div>
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-start gap-3">
          <KindIcon kind={draft.kind} size="h-10 w-10 text-base" />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k.label} · from BillBull</div>
            <div className="mt-0.5 font-semibold text-slate-900">{draft.title || 'Your title'}</div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{draft.message || 'Your message…'}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <span className="rounded-md bg-[#F5C742] px-3 py-1.5 text-sm font-medium text-slate-900">Got it</span>
        </div>
      </div>
    </div>
  );
}

function Composer({ initial, editing, tenants, onClose, onSaved }) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const problem = draftProblem(draft);
  const choosable = tenants.filter((t) => t.status !== 'ARCHIVED');

  const toggleTenant = (id) => setDraft((d) => ({
    ...d,
    tenantIds: d.tenantIds.includes(id) ? d.tenantIds.filter((x) => x !== id) : [...d.tenantIds, id],
  }));

  const save = async () => {
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = draftToBody(draft);
      const saved = editing ? await platformApi.updateAnnouncement(editing.id, body) : await platformApi.createAnnouncement(body);
      onSaved(saved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      wide
      title={editing ? 'Edit announcement' : 'New announcement'}
      onClose={onClose}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="accent" onClick={save} disabled={saving}>{saving ? 'Sending…' : editing ? 'Save and resend' : 'Publish'}</Button>
        </>
      )}
    >
      {editing && (
        <Alert kind="info">Clients get the new text within a minute. People who already dismissed it won&apos;t see it pop up again.</Alert>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <Field label="Type">
            <Select value={draft.kind} onChange={set('kind')}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </Field>
          <Field label="Title" hint={`${draft.title.trim().length}/150`}>
            <Input value={draft.title} onChange={set('title')} maxLength={150} placeholder="Please refresh your browser before using BillBull" />
          </Field>
          <Field label="Message" hint={`${draft.message.trim().length}/4000 · line breaks are kept`}>
            <Textarea value={draft.message} onChange={set('message')} rows={7} maxLength={4000} />
          </Field>
          <Field label="Shown to">
            <Select value={draft.audience} onChange={set('audience')}>
              {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </Select>
          </Field>
        </div>
        <div className="space-y-4">
          <fieldset className="text-sm">
            <legend className="mb-1 font-medium text-slate-700">Send to</legend>
            <label className="mr-4 inline-flex items-center gap-2">
              <input type="radio" checked={draft.targetAll} onChange={() => setDraft((d) => ({ ...d, targetAll: true }))} />
              Every client
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={!draft.targetAll} onChange={() => setDraft((d) => ({ ...d, targetAll: false }))} />
              Chosen clients
            </label>
            {!draft.targetAll && (
              <div className="mt-2 max-h-40 space-y-1 overflow-auto rounded-md border border-slate-200 p-2">
                {choosable.length === 0 && <div className="text-xs text-slate-500">No clients yet.</div>}
                {choosable.map((t) => (
                  <label key={t.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.tenantIds.includes(t.id)} onChange={() => toggleTenant(t.id)} />
                    <span>{t.name}</span>
                    <span className="text-xs text-slate-400">{t.code}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Show from" hint="Blank = now">
              <Input type="datetime-local" value={draft.startsAt} onChange={set('startsAt')} />
            </Field>
            <Field label="Stop showing at" hint="Blank = until archived">
              <Input type="datetime-local" value={draft.endsAt} onChange={set('endsAt')} />
            </Field>
          </div>
          <PopupPreview draft={draft} />
        </div>
      </div>
      <Alert>{error}</Alert>
    </Modal>
  );
}

function Details({ id, onClose }) {
  const { data, loading, error } = useLoad(() => platformApi.announcement(id), [id]);
  return (
    <Modal wide title="Announcement" onClose={onClose}>
      <Alert>{error}</Alert>
      {loading && !data ? <Spinner /> : data && (
        <>
          <div className="flex items-start gap-3">
            <KindIcon kind={data.kind} size="h-10 w-10 text-base" />
            <div className="min-w-0">
              <div className="font-semibold text-slate-900">{data.title}</div>
              <div className="mt-0.5 text-xs text-slate-500">
                {kindMeta(data.kind).label} · {audienceLabel(data.audience)} · published {fmtDate(data.publishedAt)} by {data.createdBy || '—'}
                {data.version > 1 && ` · edited ${fmtDate(data.updatedAt)} by ${data.updatedBy || '—'}`}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{data.message}</p>
              {(data.startsAt || data.endsAt) && (
                <p className="mt-2 text-xs text-slate-500">Showing {data.startsAt ? `from ${fmtDate(data.startsAt)}` : 'now'}{data.endsAt ? ` until ${fmtDate(data.endsAt)}` : ''}</p>
              )}
            </div>
          </div>
          <Table
            rowKey={(r) => r.tenantId}
            columns={[
              { key: 'name', label: 'Client', render: (r) => <Link to={`/tenants/${r.tenantId}`} className="hover:underline">{r.name}</Link> },
              { key: 'delivery', label: 'Delivery', render: (r) => {
                const b = DELIVERY_BADGE[r.delivery] || { value: 'UNKNOWN', label: r.delivery };
                return <span title={r.deliveryError || ''}><Badge value={b.value} label={b.label} /></span>;
              } },
              { key: 'seenUsers', label: 'Seen by', render: (r) => `${r.seenUsers} user${r.seenUsers === 1 ? '' : 's'}` },
              { key: 'lastSeenAt', label: 'Last seen', render: (r) => (r.lastSeenAt ? timeAgo(r.lastSeenAt) : '—') },
              { key: 'reportedAt', label: 'Counts from', render: (r) => (r.reportedAt ? timeAgo(r.reportedAt) : '—') },
            ]}
            rows={data.clients || []}
            empty="No clients are targeted."
          />
          {(data.clients || []).some((c) => c.deliveryError && c.delivery === 'FAILED') && (
            <Alert kind="warn">
              {(data.clients || []).filter((c) => c.delivery === 'FAILED').map((c) => `${c.name}: ${c.deliveryError}`).join(' · ')}
            </Alert>
          )}
        </>
      )}
    </Modal>
  );
}

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const canEdit = hasRole(user, 'OPERATOR');
  const { data, loading, error, reload } = useLoad(() => platformApi.announcements(), []);
  const { data: tenants } = useLoad(() => platformApi.tenants(false), []);
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState('ALL');
  const [composer, setComposer] = useState(null); // { initial, editing }
  const [viewing, setViewing] = useState(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [syncing, setSyncing] = useState(false);

  const list = useMemo(() => data || [], [data]);
  const rows = useMemo(() => list.filter((a) => matches(a, query, phase)), [list, query, phase]);
  const totals = summarize(list);
  const activeClients = (tenants || []).filter((t) => t.status !== 'ARCHIVED').length;

  const act = async (fn, done) => {
    setActionError('');
    setNotice('');
    try {
      await fn();
      if (done) setNotice(done);
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  };

  const remove = (a) => {
    if (!window.confirm(`Delete "${a.title}"? It disappears from every client and from this list.`)) return;
    act(() => platformApi.deleteAnnouncement(a.id), 'Deleted. Clients drop it within a minute.');
  };

  const syncNow = async () => {
    setSyncing(true);
    await act(async () => {
      const r = await platformApi.syncAnnouncements();
      setNotice(`Sent to ${r.sent} client${r.sent === 1 ? '' : 's'}${r.failed ? `; ${r.failed} could not be reached` : ''}.`);
    });
    setSyncing(false);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Announcements"
        subtitle="Tell every client, or chosen ones, about new features, updates or maintenance. It pops up once for each user the next time they open BillBull."
        actions={canEdit && (
          <>
            <Button variant="secondary" onClick={syncNow} disabled={syncing}>{syncing ? 'Sending…' : 'Send to clients now'}</Button>
            <Button variant="accent" onClick={() => setComposer({ initial: emptyDraft(), editing: null })}>+ New announcement</Button>
          </>
        )}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Live now" value={totals.live} tone={totals.live ? 'green' : undefined} />
        <Stat label="Sent" value={totals.sent} />
        <Stat label="Times seen" value={totals.seen} />
        <Stat label="Active clients" value={activeClients} />
      </div>
      <Alert>{error || actionError}</Alert>
      <Alert kind="success">{notice}</Alert>
      <Card
        title={`Sent announcements (${rows.length})`}
        actions={(
          <>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, message or client…"
              className="w-56 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
            <select value={phase} onChange={(e) => setPhase(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
              {PHASES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </>
        )}
      >
        {loading && !data ? <Spinner /> : (
          <Table
            columns={[
              { key: 'title', label: 'Announcement', render: (a) => (
                <button type="button" onClick={() => setViewing(a.id)} className="flex max-w-md items-start gap-3 text-left">
                  <KindIcon kind={a.kind} />
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-900 hover:underline">{a.title}</span>
                    <span className="block truncate text-xs text-slate-500">{a.message}</span>
                  </span>
                </button>
              ) },
              { key: 'to', label: 'Sent to', render: (a) => (a.targetAll
                ? <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs">Every client</span>
                : <span className="text-xs" title={(a.tenantNames || []).join(', ')}>{(a.tenantNames || []).slice(0, 2).join(', ')}{a.tenantNames?.length > 2 ? ` +${a.tenantNames.length - 2}` : ''}</span>) },
              { key: 'audience', label: 'Shown to', render: (a) => <span className="whitespace-nowrap">{audienceLabel(a.audience)}</span> },
              { key: 'seen', label: 'Seen by', render: (a) => (
                <span className="whitespace-nowrap">
                  <b>{a.seenUsers}</b> user{a.seenUsers === 1 ? '' : 's'} · {a.seenClients} client{a.seenClients === 1 ? '' : 's'}
                  {a.phase === 'LIVE' && a.deliveredClients < a.targetedClients && (
                    <span className="block text-xs text-amber-700">Delivered to {a.deliveredClients}/{a.targetedClients}</span>
                  )}
                </span>
              ) },
              { key: 'phase', label: 'Status', render: (a) => {
                const b = PHASE_BADGE[a.phase] || { value: 'UNKNOWN', label: a.phase };
                return <Badge value={b.value} label={b.label} />;
              } },
              { key: 'publishedAt', label: 'Sent', render: (a) => <span className="whitespace-nowrap" title={fmtDate(a.publishedAt)}>{new Date(a.publishedAt).toLocaleDateString()}</span> },
              { key: 'actions', label: '', className: 'text-right', render: (a) => (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setViewing(a.id)}>View</Button>
                  {canEdit && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setComposer({ initial: draftFrom(a), editing: a })}>Edit</Button>
                      {a.status === 'ARCHIVED'
                        ? <Button size="sm" variant="ghost" onClick={() => act(() => platformApi.republishAnnouncement(a.id), 'Live again.')}>Republish</Button>
                        : <Button size="sm" variant="ghost" onClick={() => act(() => platformApi.archiveAnnouncement(a.id), 'Archived. Clients stop showing it within a minute.')}>Archive</Button>}
                      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => remove(a)}>Delete</Button>
                    </>
                  )}
                </div>
              ) },
            ]}
            rows={rows}
            empty={list.length ? 'Nothing matches.' : 'No announcements yet.'}
          />
        )}
      </Card>
      {composer && (
        <Composer
          initial={composer.initial}
          editing={composer.editing}
          tenants={tenants || []}
          onClose={() => setComposer(null)}
          onSaved={() => {
            setComposer(null);
            setNotice(composer.editing ? 'Saved. Clients get the new text within a minute.' : 'Published. It reaches clients within a minute.');
            reload();
          }}
        />
      )}
      {viewing && <Details id={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
