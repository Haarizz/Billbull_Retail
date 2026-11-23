import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts';
import {
    Search, RefreshCw, Loader2, Activity, Users, AlertOctagon, Layers, ChevronDown,
    MapPin, Monitor, ExternalLink, X, ShieldCheck, Clock,
} from 'lucide-react';
import { getActivity, getActivitySummary, getActivityPeople } from '../../api/activityApi';
import { Avatar } from './NotificationCard';
import { MODULE_META, moduleMeta, groupByDay, timeOfDay, fullDateTime, toDate } from './notificationUi';

const WINDOWS = [
    { days: 1, label: 'Today' },
    { days: 7, label: '7 days' },
    { days: 30, label: '30 days' },
];

const PAGE_SIZE = 30;

const StatCard = ({ icon: Icon, label, value, hint, tone = 'default' }) => {
    const tones = {
        default: 'text-slate-900',
        danger: 'text-red-600',
    };
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Icon className="w-4 h-4 text-[#C99A06]" /> {label}
            </div>
            <div className={`mt-2 text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</div>
            {hint && <div className="mt-0.5 text-xs text-slate-400 truncate">{hint}</div>}
        </div>
    );
};

const bucketLabel = (bucket, unit) => {
    const d = toDate(bucket);
    if (!d) return '';
    return unit === 'hour'
        ? d.toLocaleTimeString(undefined, { hour: 'numeric' })
        : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

const ActivityEntry = ({ entry, expanded, onToggle, onOpen }) => {
    const mod = moduleMeta(entry.module);
    const ModIcon = mod.icon;
    const failed = entry.outcome === 'FAILED';
    const events = entry.events || [];

    return (
        <li className={`rounded-xl border bg-white transition-shadow ${expanded ? 'border-slate-300 shadow-md' : 'border-slate-200 hover:shadow-sm'}`}>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                className="w-full flex items-start gap-3 p-3.5 text-left"
            >
                <Avatar name={entry.actorName} seed={entry.username || entry.actorName} size="md" />
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 leading-snug">
                        <span className="font-semibold text-slate-900">{entry.actorName}</span>{' '}
                        <span className={failed ? 'text-slate-500' : ''}>{lowerFirst(entry.summary)}</span>
                    </p>
                    {events.length > 0 && (
                        <p className="mt-0.5 text-xs text-slate-500 truncate">{events[0].title}{events.length > 1 ? ` (+${events.length - 1} more)` : ''}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                        <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold ${mod.tint}`}>
                            <ModIcon className="w-3 h-3" /> {mod.label}
                        </span>
                        {failed && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 font-semibold text-red-700">
                                <AlertOctagon className="w-3 h-3" /> Failed{entry.status ? ` · ${entry.status}` : ''}
                            </span>
                        )}
                        {entry.branchName && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{entry.branchName}</span>}
                        {entry.device && <span className="inline-flex items-center gap-1"><Monitor className="w-3 h-3" />{entry.device}</span>}
                    </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                    <time className="text-xs font-medium text-slate-500 tabular-nums" dateTime={entry.time} title={fullDateTime(entry.time)}>
                        {timeOfDay(entry.time)}
                    </time>
                    <ChevronDown className={`w-4 h-4 text-slate-300 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {expanded && (
                <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-600 space-y-3">
                    {events.length > 0 && (
                        <div className="space-y-1.5">
                            <div className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">What changed</div>
                            {events.map((ev, i) => (
                                <div key={i} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                                    <div className="font-semibold text-slate-700">{ev.title}</div>
                                    {ev.detail && <div className="mt-0.5 text-slate-500 break-words">{ev.detail}</div>}
                                </div>
                            ))}
                        </div>
                    )}
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                        <Detail label="When" value={fullDateTime(entry.time)} />
                        <Detail label="User" value={entry.username || entry.actorName} />
                        <Detail label="Request" value={<span className="font-mono">{entry.method} {entry.endpoint}</span>} />
                        <Detail label="Result" value={failed ? `Failed (HTTP ${entry.status})` : `Succeeded${entry.status ? ` (HTTP ${entry.status})` : ''}`} />
                        {entry.reference && <Detail label="Reference" value={<span className="font-mono">{entry.reference}</span>} />}
                        {entry.durationMs != null && <Detail label="Took" value={`${entry.durationMs.toLocaleString()} ms`} />}
                        {entry.ipAddress && <Detail label="IP address" value={<span className="font-mono">{entry.ipAddress}</span>} />}
                        {entry.requestId && <Detail label="Request ID" value={<span className="font-mono break-all">{entry.requestId}</span>} />}
                    </dl>
                    {entry.link && (
                        <button
                            type="button"
                            onClick={() => onOpen(entry.link)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:border-[#F5C742] hover:text-[#B45309]"
                        >
                            <ExternalLink className="w-3.5 h-3.5" /> Open {moduleMeta(entry.module).label}
                        </button>
                    )}
                </div>
            )}
        </li>
    );
};

const Detail = ({ label, value }) => (
    <div className="flex gap-2 min-w-0">
        <dt className="w-24 shrink-0 text-slate-400">{label}</dt>
        <dd className="min-w-0 text-slate-700">{value}</dd>
    </div>
);

const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : '');

/**
 * Who did what: readable feed over the audit trail, with day/week/month numbers on top.
 * The server decides whose activity the viewer may see (`scope`).
 */
const ActivityFeed = () => {
    const navigate = useNavigate();
    const [days, setDays] = useState(1);
    const [username, setUsername] = useState('');
    const [module, setModule] = useState('');
    const [outcome, setOutcome] = useState('');
    const [search, setSearch] = useState('');
    const [q, setQ] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');

    const [summary, setSummary] = useState(null);
    const [people, setPeople] = useState([]);
    const [entries, setEntries] = useState([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [scope, setScope] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState(null);
    const requestRef = useRef(0);

    // Debounced search
    useEffect(() => {
        const t = setTimeout(() => setQ(search), 350);
        return () => clearTimeout(t);
    }, [search]);

    const filters = useMemo(() => ({
        username: username || undefined,
        module: module || undefined,
        outcome: outcome || undefined,
        q: q || undefined,
        from: from || undefined,
        to: to || undefined,
    }), [username, module, outcome, q, from, to]);

    const loadFeed = useCallback(async (p = 0) => {
        const req = ++requestRef.current;
        p === 0 ? setLoading(true) : setLoadingMore(true);
        setError(null);
        try {
            const data = await getActivity(p, PAGE_SIZE, filters);
            if (req !== requestRef.current) return;
            setEntries((prev) => (p === 0 ? data.content : [...prev, ...data.content]));
            setHasMore(Boolean(data.hasMore));
            setScope(data.scope);
            setPage(p);
        } catch (e) {
            if (req === requestRef.current) setError(e?.response?.data?.message || 'Could not load activity.');
        } finally {
            if (req === requestRef.current) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, [filters]);

    const loadSummary = useCallback(async () => {
        try {
            setSummary(await getActivitySummary(days, filters));
        } catch {
            setSummary(null);
        }
    }, [days, filters]);

    useEffect(() => { loadFeed(0); }, [loadFeed]);
    useEffect(() => { loadSummary(); }, [loadSummary]);
    useEffect(() => {
        getActivityPeople().then(setPeople).catch(() => setPeople([]));
    }, []);

    const refresh = () => {
        loadFeed(0);
        loadSummary();
    };

    const clearFilters = () => {
        setUsername('');
        setModule('');
        setOutcome('');
        setSearch('');
        setFrom('');
        setTo('');
    };

    const hasFilters = username || module || outcome || q || from || to;
    const busiest = summary?.modules?.[0];
    const chartData = (summary?.timeline || []).map((t) => ({ label: bucketLabel(t.bucket, summary.timelineUnit), count: t.count }));
    const windowLabel = WINDOWS.find((w) => w.days === days)?.label.toLowerCase();

    return (
        <div className="space-y-5">
            {/* Scope + window */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="inline-flex items-center gap-2 text-xs text-slate-500">
                    <ShieldCheck className="w-4 h-4 text-slate-400" />
                    {scope === 'SELF' && 'Showing your own activity.'}
                    {scope === 'BRANCH' && 'Showing activity in your branches.'}
                    {scope === 'ALL' && 'Showing activity across the business.'}
                </p>
                <div className="inline-flex p-0.5 rounded-lg bg-slate-100 text-xs font-semibold self-start" role="tablist" aria-label="Summary period">
                    {WINDOWS.map((w) => (
                        <button
                            key={w.days}
                            type="button"
                            role="tab"
                            aria-selected={days === w.days}
                            onClick={() => setDays(w.days)}
                            className={`px-3 py-1.5 rounded-md ${days === w.days ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {w.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Numbers */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard icon={Activity} label={`Actions ${windowLabel === 'today' ? 'today' : `· ${windowLabel}`}`} value={summary ? summary.total.toLocaleString() : '—'} />
                <StatCard icon={Users} label="People active" value={summary ? summary.activeUsers : '—'} hint={summary?.topUsers?.[0] ? `Most active: ${summary.topUsers[0].name}` : null} />
                <StatCard icon={AlertOctagon} label="Failed actions" value={summary ? summary.failed : '—'} tone={summary?.failed ? 'danger' : 'default'} hint={summary?.failed ? 'Rejected or errored requests' : 'Nothing failed'} />
                <StatCard icon={Layers} label="Busiest area" value={busiest ? moduleMeta(busiest.module).label : '—'} hint={busiest ? `${busiest.count.toLocaleString()} actions` : null} />
            </div>

            {/* Timeline + people/modules */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-700">Activity over time</h3>
                        <span className="text-xs text-slate-400">{summary?.timelineUnit === 'hour' ? 'per hour' : 'per day'}</span>
                    </div>
                    <div className="h-36 mt-2">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(245,199,66,0.12)' }}
                                        contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }}
                                        formatter={(v) => [v, 'Actions']}
                                    />
                                    <Bar dataKey="count" fill="#E0A800" radius={[4, 4, 0, 0]} maxBarSize={28} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-xs text-slate-400">No activity in this period</div>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-700">{scope === 'SELF' ? 'Where you worked' : 'Most active people'}</h3>
                    <ul className="mt-3 space-y-2">
                        {scope !== 'SELF' && (summary?.topUsers || []).map((u) => (
                            <li key={u.username}>
                                <button
                                    type="button"
                                    onClick={() => setUsername(username === u.username ? '' : u.username)}
                                    className={`w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 ${username === u.username ? 'bg-[#FFF8E7] ring-1 ring-[#FDE6A9]' : ''}`}
                                >
                                    <Avatar name={u.name} seed={u.username} />
                                    <span className="flex-1 min-w-0 truncate text-sm text-slate-700">{u.name}</span>
                                    <span className="text-xs font-semibold tabular-nums text-slate-500">{u.count.toLocaleString()}</span>
                                </button>
                            </li>
                        ))}
                        {scope === 'SELF' && (summary?.modules || []).slice(0, 5).map((m) => {
                            const meta = moduleMeta(m.module);
                            const Icon = meta.icon;
                            return (
                                <li key={m.module} className="flex items-center gap-2.5 px-2 py-1.5">
                                    <span className={`w-6 h-6 rounded-md flex items-center justify-center ${meta.tint}`}><Icon className="w-3.5 h-3.5" /></span>
                                    <span className="flex-1 text-sm text-slate-700">{meta.label}</span>
                                    <span className="text-xs font-semibold tabular-nums text-slate-500">{m.count.toLocaleString()}</span>
                                </li>
                            );
                        })}
                        {summary && (scope === 'SELF' ? summary.modules : summary.topUsers)?.length === 0 && (
                            <li className="text-xs text-slate-400 px-2">Nobody has done anything yet in this period.</li>
                        )}
                    </ul>
                </div>
            </div>

            {/* Filters */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by user or action (e.g. invoice, session)…"
                            aria-label="Search activity"
                            className="h-9 w-full pl-9 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 placeholder:text-slate-400"
                        />
                    </div>
                    {scope !== 'SELF' && (
                        <select
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            aria-label="Person"
                            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 max-w-[200px]"
                        >
                            <option value="">Everyone</option>
                            {people.map((p) => <option key={p.username} value={p.username}>{p.name}</option>)}
                        </select>
                    )}
                    <select
                        value={outcome}
                        onChange={(e) => setOutcome(e.target.value)}
                        aria-label="Result"
                        className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600"
                    >
                        <option value="">Any result</option>
                        <option value="SUCCESS">Succeeded</option>
                        <option value="FAILED">Failed</option>
                    </select>
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        From
                        <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 px-2 rounded-lg border border-slate-200 text-xs text-slate-600" />
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        To
                        <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 px-2 rounded-lg border border-slate-200 text-xs text-slate-600" />
                    </label>
                    <button type="button" onClick={refresh} className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50" title="Refresh" aria-label="Refresh">
                        <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    {[['', 'All areas'], ...Object.entries(MODULE_META).map(([k, v]) => [k, v.label])].map(([key, label]) => (
                        <button
                            key={key || 'all'}
                            type="button"
                            onClick={() => setModule(key)}
                            aria-pressed={module === key}
                            className={`h-7 px-3 rounded-full text-xs font-semibold transition-colors ${module === key ? 'bg-[#F5C742] text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                            {label}
                        </button>
                    ))}
                    {hasFilters && (
                        <button type="button" onClick={clearFilters} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
                            <X className="w-3.5 h-3.5" /> Clear filters
                        </button>
                    )}
                </div>
            </div>

            {/* Feed */}
            {loading ? (
                <div className="py-16 flex justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : error ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center text-sm text-red-700">{error}</div>
            ) : entries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
                    <Clock className="mx-auto w-8 h-8 text-slate-300" />
                    <p className="mt-3 text-sm font-semibold text-slate-600">No activity found</p>
                    <p className="mt-1 text-xs text-slate-400">{hasFilters ? 'Try removing a filter.' : 'Actions people take will show up here.'}</p>
                </div>
            ) : (
                <div className="space-y-5">
                    {groupByDay(entries, (e) => e.time).map((g) => (
                        <section key={g.label}>
                            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                                {g.label}
                                <span className="h-px flex-1 bg-slate-200" />
                                <span className="font-semibold normal-case tracking-normal">{g.items.length} action{g.items.length === 1 ? '' : 's'}</span>
                            </h3>
                            <ul className="space-y-2">
                                {g.items.map((e) => (
                                    <ActivityEntry
                                        key={e.id}
                                        entry={e}
                                        expanded={expanded === e.id}
                                        onToggle={() => setExpanded(expanded === e.id ? null : e.id)}
                                        onOpen={(link) => navigate(link)}
                                    />
                                ))}
                            </ul>
                        </section>
                    ))}
                    {hasMore && (
                        <div className="flex justify-center">
                            <button
                                type="button"
                                onClick={() => loadFeed(page + 1)}
                                disabled={loadingMore}
                                className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                                {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Load older activity
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ActivityFeed;
