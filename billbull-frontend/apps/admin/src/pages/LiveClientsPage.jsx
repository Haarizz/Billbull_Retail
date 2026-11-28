import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage, platformApi } from '../api/client';
import { Alert, Button, Card, PageHeader, Spinner } from '../ui/kit';
import { timeAgo } from '../ui/format';
import {
  APP_LABEL,
  CONNECTION_LABEL,
  REFRESH_MS,
  SORTS,
  clockTime,
  describeDevice,
  filterClients,
  initials,
  isProblem,
  matchesDevice,
  orderDevices,
  sinceLabel,
  sortClients,
  sparkPoints,
} from './live/liveLogic';

const cx = (...c) => c.filter(Boolean).join(' ');

const CONNECTION_STYLE = {
  ONLINE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  OFFLINE: 'bg-slate-100 text-slate-600 ring-slate-200',
  OUTDATED: 'bg-amber-50 text-amber-800 ring-amber-200',
  NOT_CONFIGURED: 'bg-slate-100 text-slate-500 ring-slate-200',
  AGENT_OFF: 'bg-slate-100 text-slate-500 ring-slate-200',
};

const APP_STYLE = {
  RETAIL: 'bg-sky-50 text-sky-700 ring-sky-200',
  POS: 'bg-amber-50 text-amber-800 ring-amber-200',
  POS_DESKTOP: 'bg-violet-50 text-violet-700 ring-violet-200',
  OTHER: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const AVATAR_TONES = ['bg-amber-100 text-amber-800', 'bg-sky-100 text-sky-800', 'bg-emerald-100 text-emerald-800', 'bg-violet-100 text-violet-800', 'bg-rose-100 text-rose-800', 'bg-teal-100 text-teal-800'];
const toneFor = (code) => AVATAR_TONES[[...String(code || '')].reduce((n, ch) => n + ch.charCodeAt(0), 0) % AVATAR_TONES.length];

function ConnectionBadge({ value }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', CONNECTION_STYLE[value] || 'bg-red-50 text-red-700 ring-red-200')}>
      {value === 'ONLINE' && <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>}
      {CONNECTION_LABEL[value] || value}
    </span>
  );
}

function Pill({ className, children, title }) {
  return <span title={title} className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', className)}>{children}</span>;
}

function AppIcon({ app, className = 'h-4 w-4' }) {
  // Monitor for the Retail web app, till for POS (browser and desktop), phone-ish fallback.
  if (app === 'POS' || app === 'POS_DESKTOP') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
        <rect x="4" y="3" width="16" height="10" rx="1.5" /><path d="M8 17h8M6 21h12M12 13v4" />
      </svg>
    );
  }
  if (app === 'RETAIL') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
        <rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20h8M12 16v4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" />
    </svg>
  );
}

function StatCard({ label, value, sub, tone, children }) {
  const tones = { green: 'text-emerald-600', amber: 'text-amber-600', red: 'text-red-600' };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cx('mt-1 text-2xl font-semibold tabular-nums text-slate-900', tones[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
      {children}
    </div>
  );
}

function Sparkline({ series, width = 96, height = 24, className }) {
  const points = sparkPoints(series, width, height);
  if (!points) return <span className="text-xs text-slate-300">—</span>;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <polyline points={points} fill="none" stroke="#d4a72c" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function ActivityChart({ history }) {
  const width = 900;
  const height = 120;
  const points = sparkPoints(history, width, height, 6);
  const peak = (history || []).reduce((best, p) => (p.devices > (best?.devices ?? -1) ? p : best), null);
  if (!points) {
    return <p className="text-sm text-slate-400">The 24-hour line fills in as the 5-minute health checks report online counts.</p>;
  }
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-28 w-full" role="img" aria-label="Devices online over the last 24 hours">
        <polygon points={`6,${height - 6} ${points} ${width - 6},${height - 6}`} fill="#F5C742" opacity="0.18" />
        <polyline points={points} fill="none" stroke="#d4a72c" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
        <span>{clockTime(history[0]?.at)}</span>
        {peak && <span>Peak <b className="text-slate-700">{peak.devices}</b> devices at {clockTime(peak.at)}</span>}
        <span>Now</span>
      </div>
    </div>
  );
}

function DeviceCard({ d, now }) {
  const ua = describeDevice(d.userAgent);
  return (
    <div className={cx('flex gap-3 rounded-lg border bg-white p-3', d.online ? 'border-slate-200' : 'border-slate-100 opacity-70')}>
      <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', d.online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400')}>
        <AppIcon app={ua.mobile ? 'MOBILE' : d.app} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium text-slate-900" title={d.fullName || d.username}>{d.username}</span>
          {(d.roles || []).slice(0, 2).map((r) => <Pill key={r} className="bg-slate-50 text-slate-600 ring-slate-200">{r.replace(/_/g, ' ').toLowerCase()}</Pill>)}
          {d.support && <Pill className="bg-red-50 text-red-700 ring-red-200" title="Signed in through a platform support session">Support</Pill>}
        </div>
        {d.fullName && d.fullName !== d.username && <div className="truncate text-xs text-slate-500">{d.fullName}</div>}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Pill className={APP_STYLE[d.app] || APP_STYLE.OTHER}>{APP_LABEL[d.app] || d.app}</Pill>
          {d.branchName && <span className="truncate text-xs text-slate-500">{d.branchName}</span>}
        </div>
        <div className="mt-1 truncate text-xs text-slate-500" title={d.userAgent || ''}>{ua.label}{d.ip ? ` · ${d.ip}` : ''}</div>
      </div>
      <div className="shrink-0 text-right text-xs">
        <div className={cx('flex items-center justify-end gap-1', d.online ? 'text-emerald-700' : 'text-slate-400')}>
          <span className={cx('h-1.5 w-1.5 rounded-full', d.online ? 'bg-emerald-500' : 'bg-slate-300')} />
          {d.online ? 'Online' : sinceLabel(d.lastSeenAt, timeAgo, now)}
        </div>
        <div className="mt-1 text-slate-400" title={d.since}>Since {clockTime(d.since)}</div>
      </div>
    </div>
  );
}

function ClientDetail({ row, now, showEarlier, onToggleEarlier }) {
  const devices = orderDevices(row.devices, showEarlier);
  const offlineCount = (row.devices || []).filter((d) => !d.online).length;
  return (
    <div className="space-y-4 bg-slate-50/70 px-4 py-4">
      {row.error && <Alert kind={isProblem(row) ? 'error' : 'warn'}>{row.error}</Alert>}
      {!isProblem(row) && (
        <>
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Devices</h3>
              {offlineCount > 0 && (
                <button type="button" onClick={onToggleEarlier} className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline">
                  {showEarlier ? 'Hide earlier devices' : `Show earlier in the last 24 h (${offlineCount})`}
                </button>
              )}
            </div>
            {devices.length === 0 ? (
              <p className="text-sm text-slate-400">{offlineCount > 0 ? 'Nobody is signed in right now.' : 'No sign-ins in the last 24 hours.'}</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {devices.map((d) => <DeviceCard key={d.deviceKey} d={d} now={now} />)}
              </div>
            )}
          </div>
          {(row.openPosSessions || []).length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Open till sessions</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                      <th className="px-3 py-2 font-medium">Cashier</th>
                      <th className="px-3 py-2 font-medium">Counter</th>
                      <th className="px-3 py-2 font-medium">Branch</th>
                      <th className="px-3 py-2 font-medium">Opened</th>
                      <th className="px-3 py-2 font-medium">Last activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.openPosSessions.map((s) => (
                      <tr key={s.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-3 py-2 font-medium text-slate-800">{s.cashier || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{s.counterName || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{s.branchName || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{timeAgo(s.openedAt, now)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{s.lastActivityAt ? timeAgo(s.lastActivityAt, now) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <Link to={`/tenants/${row.tenantId}`} className="font-medium text-slate-700 hover:underline">Open client →</Link>
        {row.latencyMs != null && <span>Agent answered in {row.latencyMs} ms</span>}
        {row.sales?.lastInvoiceAt && <span>Last invoice {timeAgo(row.sales.lastInvoiceAt, now)}</span>}
      </div>
    </div>
  );
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'online', label: 'Online' },
  { key: 'offline', label: 'Offline' },
  { key: 'problems', label: 'Problems' },
];

export default function LiveClientsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [view, setView] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('active');
  const [expanded, setExpanded] = useState(() => new Set());
  const [earlier, setEarlier] = useState(() => new Set());
  const [now, setNow] = useState(Date.now());
  const seq = useRef(0);

  const load = useCallback(async (fresh) => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const result = await platformApi.liveClients(fresh);
      if (id !== seq.current) return;
      setData(result);
      setError('');
      setNow(Date.now());
      // First load: open the busiest client, like a glance at who is working.
      setExpanded((prev) => (prev.size === 0 && result?.clients?.[0]?.devicesOnline > 0 ? new Set([result.clients[0].tenantId]) : prev));
    } catch (e) {
      if (id === seq.current) setError(errorMessage(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  // Poll every 30 s while the tab is visible; a hidden tab catches up the moment it is shown.
  useEffect(() => {
    if (!auto) return undefined;
    const tick = () => {
      if (document.visibilityState === 'visible') load(false);
    };
    const timer = setInterval(tick, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [auto, load]);

  // Keep "x min ago" labels moving between refreshes.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const clients = useMemo(() => data?.clients || [], [data]);
  const rows = useMemo(() => sortClients(filterClients(clients, { view, query }), sort), [clients, view, query, sort]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, filterClients(clients, { view: t.key }).length])), [clients]);

  const toggle = (set, setter, id) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  if (!data && !error) return <Spinner />;
  const t = data?.totals || {};
  const apps = t.appsOnline || {};

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live clients"
        subtitle="Which clients have someone signed in right now, and on which devices. A device is online when it was active in the last 3 minutes."
        actions={(
          <>
            <span className="text-xs text-slate-500" title={data?.generatedAt}>{data ? `Updated ${clockTime(data.generatedAt)}` : ''}</span>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" className="accent-amber-500" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              Auto-refresh (30 s)
            </label>
            <Button variant="secondary" onClick={() => load(true)} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</Button>
          </>
        )}
      />
      <Alert>{error}</Alert>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Clients online" value={`${t.clientsOnline ?? 0} / ${t.clients ?? 0}`} sub="Clients with someone signed in now" tone={t.clientsOnline ? 'green' : undefined} />
        <StatCard label="Devices online" value={t.devicesOnline ?? 0} sub={`${t.peopleOnline ?? 0} people · ${t.activeToday ?? 0} active today`}>
          <div className="mt-2 flex flex-wrap gap-1">
            {Object.entries(apps).map(([k, v]) => <Pill key={k} className={APP_STYLE[k] || APP_STYLE.OTHER}>{APP_LABEL[k] || k} {v}</Pill>)}
          </div>
        </StatCard>
        <StatCard label="POS tills online" value={`${t.terminalsOnline ?? 0} / ${t.terminalsTotal ?? 0}`} sub="Registered terminals with a heartbeat in the last 3 min" />
        <StatCard label="Open till sessions" value={t.openPosSessions ?? 0} sub="Cash sessions open across all clients" />
        <StatCard label="Invoices today" value={t.invoicesToday ?? 0} sub="Sales invoices created since midnight" />
      </div>

      <Card title="Devices online, last 24 hours">
        <ActivityChart history={data?.history || []} />
      </Card>

      <Card
        title={<span className="flex items-center gap-2">Clients <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{clients.length}</span></span>}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 p-0.5" role="tablist">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={view === tab.key}
                  onClick={() => setView(tab.key)}
                  className={cx('rounded-md px-2.5 py-1 text-xs font-medium', view === tab.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}
                >
                  {tab.label}{tab.key !== 'all' && counts[tab.key] > 0 ? ` ${counts[tab.key]}` : ''}
                </button>
              ))}
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs" aria-label="Sort clients">
              {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search client, login or IP…"
              className="w-56 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </div>
        )}
      >
        <div className="-m-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="w-8 px-3 py-2" />
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Devices online</th>
                <th className="px-3 py-2 text-right font-medium">People online</th>
                <th className="px-3 py-2 text-right font-medium">Active today</th>
                <th className="px-3 py-2 text-right font-medium">Tills</th>
                <th className="px-3 py-2 text-right font-medium">Invoices today</th>
                <th className="px-3 py-2 font-medium">Last 24 h</th>
                <th className="px-3 py-2 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-400">{clients.length === 0 ? 'No clients yet.' : 'No client matches.'}</td></tr>
              )}
              {rows.map((r) => {
                const open = expanded.has(r.tenantId) || matchesDevice(r, query);
                const appEntries = Object.entries(r.appsOnline || {});
                return (
                  <Fragment key={r.tenantId}>
                    <tr className={cx('cursor-pointer border-b border-slate-100 hover:bg-amber-50/40', open && 'bg-amber-50/30')} onClick={() => toggle(expanded, setExpanded, r.tenantId)}>
                      <td className="px-3 py-3 text-slate-400">
                        <svg viewBox="0 0 20 20" className={cx('h-4 w-4 transition-transform', open && 'rotate-90')} fill="currentColor" aria-hidden="true"><path d="M7 5l6 5-6 5V5z" /></svg>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold', toneFor(r.code))}>{initials(r.name)}</div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-900">{r.name}</div>
                            <div className="text-xs text-slate-500">{r.code}{r.status !== 'ACTIVE' ? ` · ${r.status.replace(/_/g, ' ').toLowerCase()}` : ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3"><ConnectionBadge value={r.connection} /></td>
                      <td className="px-3 py-3 text-right">
                        <div className="font-semibold tabular-nums text-slate-900">{r.devicesOnline}</div>
                        {appEntries.length > 0 && (
                          <div className="mt-0.5 flex justify-end gap-2 text-[11px] text-slate-500">
                            {appEntries.map(([k, v]) => <span key={k} className="inline-flex items-center gap-0.5" title={APP_LABEL[k] || k}><AppIcon app={k} className="h-3 w-3" />{v}</span>)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.peopleOnline}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.activeToday ?? '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.pos ? `${r.pos.terminalsOnline} / ${r.pos.terminalsTotal}` : '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.sales?.invoicesToday ?? '—'}</td>
                      <td className="px-3 py-3"><Sparkline series={r.history} /></td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{sinceLabel(r.lastActivityAt, timeAgo, now)}</td>
                    </tr>
                    {open && (
                      <tr className="border-b border-slate-100">
                        <td colSpan={10} className="p-0">
                          <ClientDetail
                            row={r}
                            now={now}
                            showEarlier={earlier.has(r.tenantId)}
                            onToggleEarlier={() => toggle(earlier, setEarlier, r.tenantId)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
