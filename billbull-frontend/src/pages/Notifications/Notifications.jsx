import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Bell, Search, CheckCheck, Trash2, RefreshCw, Inbox, X, Loader2, AlertTriangle,
    CalendarDays, Activity, Layers, MailOpen,
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import NotificationCard from '../../components/notifications/NotificationCard';
import ActivityFeed from '../../components/notifications/ActivityFeed';
import {
    CATEGORY_META, categoryMeta, TYPE_META, PRIORITY_META, groupByDay, resolveActionUrl,
} from '../../components/notifications/notificationUi';

const PAGE_SIZE = 20;

const Stat = ({ icon: Icon, label, value, active, onClick, tone }) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`text-left rounded-2xl border p-4 shadow-sm transition-colors
            ${active ? 'border-[#F5C742] bg-[#FFF8E7]' : 'border-slate-200 bg-white hover:border-slate-300'}`}
    >
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Icon className={`w-4 h-4 ${tone === 'danger' ? 'text-red-500' : 'text-[#C99A06]'}`} /> {label}
        </div>
        <div className={`mt-2 text-2xl font-bold tabular-nums ${tone === 'danger' && value > 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {value ?? '—'}
        </div>
    </button>
);

const isoToday = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ── Inbox ─────────────────────────────────────────────────────────────────────

const InboxView = ({ initialPriority }) => {
    const navigate = useNavigate();
    const {
        summary, unreadCount, arrivals, fetchNotifications, refreshSummary,
        markAsRead, markManyAsRead, markAllAsRead, dismiss, dismissMany, dismissAllRead,
    } = useNotifications();

    const [items, setItems] = useState([]);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [totalElements, setTotalElements] = useState(0);
    // The filters the visible first page was loaded for; while they differ from the current
    // filters the list is (re)loading. Derived instead of toggled inside the fetch effect.
    const [loadedFor, setLoadedFor] = useState(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [selected, setSelected] = useState(() => new Set());

    const [category, setCategory] = useState(null);
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [priority, setPriority] = useState(initialPriority || '');
    const [type, setType] = useState('');
    const [search, setSearch] = useState('');
    const [q, setQ] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const requestRef = useRef(0);

    useEffect(() => {
        const t = setTimeout(() => setQ(search), 350);
        return () => clearTimeout(t);
    }, [search]);

    const filters = useMemo(() => ({
        category, unreadOnly, priority, type, q, from, to,
    }), [category, unreadOnly, priority, type, q, from, to]);

    /** Applies a fetched page; ignores responses overtaken by a newer request. */
    const apply = useCallback((req, p, data) => {
        if (req !== requestRef.current) return;
        if (data) {
            setItems((prev) => (p === 0 ? data.content || [] : [...prev, ...(data.content || [])]));
            setTotalPages(data.totalPages || 0);
            setTotalElements(data.totalElements || 0);
            setPage(p);
        }
        if (p === 0) {
            setSelected(new Set());
            setLoadedFor(filters);
        }
        setLoadingMore(false);
    }, [filters]);

    // Fetch, then apply in a .then — never a synchronous setState inside the effects below.
    const load = useCallback((p = 0) => {
        const req = ++requestRef.current;
        return fetchNotifications(p, PAGE_SIZE, filters).then((data) => apply(req, p, data));
    }, [fetchNotifications, filters, apply]);

    const loading = loadedFor !== filters;

    const loadMore = () => {
        setLoadingMore(true);
        load(page + 1);
    };

    const refresh = async () => {
        setRefreshing(true);
        await Promise.all([load(0), refreshSummary()]);
        setRefreshing(false);
    };

    useEffect(() => { load(0); }, [load]);
    useEffect(() => { refreshSummary(); }, [refreshSummary]);
    // New notifications arrived while the page is open.
    useEffect(() => { if (arrivals > 0) load(0); }, [arrivals]); // eslint-disable-line react-hooks/exhaustive-deps

    const removeLocally = (ids) => {
        const set = new Set(ids);
        setItems((prev) => prev.filter((n) => !set.has(n.id)));
        setTotalElements((prev) => Math.max(0, prev - ids.length));
        setSelected((prev) => new Set([...prev].filter((id) => !set.has(id))));
    };

    const markReadLocally = (ids) => {
        if (unreadOnly) return removeLocally(ids);
        const set = new Set(ids);
        setItems((prev) => prev.map((n) => (set.has(n.id) ? { ...n, read: true } : n)));
    };

    const open = (n) => {
        if (!n.read) {
            markAsRead(n.id);
            markReadLocally([n.id]);
        }
        const url = resolveActionUrl(n.actionUrl);
        if (url) navigate(url);
    };

    const onMarkRead = (id) => { markAsRead(id); markReadLocally([id]); };
    const onDismiss = (id) => { dismiss(id); removeLocally([id]); };

    const toggle = (id) => setSelected((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const allSelected = items.length > 0 && items.every((n) => selected.has(n.id));
    const selectAll = () => setSelected(allSelected ? new Set() : new Set(items.map((n) => n.id)));

    const bulkRead = async () => {
        const ids = [...selected];
        await markManyAsRead(ids);
        markReadLocally(ids);
        setSelected(new Set());
    };

    const bulkDismiss = async () => {
        const ids = [...selected];
        await dismissMany(ids);
        removeLocally(ids);
    };

    const readAll = async () => {
        await markAllAsRead(category || undefined);
        load(0);
    };

    const clearRead = async () => {
        if (!window.confirm('Remove every notification you have already read?')) return;
        await dismissAllRead();
        load(0);
    };

    const resetFilters = () => {
        setCategory(null);
        setUnreadOnly(false);
        setPriority('');
        setType('');
        setSearch('');
        setFrom('');
        setTo('');
    };

    const hasFilters = category || unreadOnly || priority || type || q || from || to;
    const categories = summary?.categories || [];
    const catCount = (key) => categories.find((c) => c.category === key);
    const today = isoToday();
    const showingToday = from === today && to === today;
    const urgentOnly = priority === 'URGENT';

    return (
        <div className="space-y-5">
            {/* Numbers (also quick filters) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat icon={MailOpen} label="Unread" value={summary?.unread ?? unreadCount} active={unreadOnly && !urgentOnly}
                    onClick={() => { setUnreadOnly(!unreadOnly || urgentOnly); setPriority(''); }} />
                <Stat icon={AlertTriangle} label="Urgent unread" value={summary?.urgentUnread} tone="danger" active={urgentOnly}
                    onClick={() => { if (urgentOnly) { setPriority(''); setUnreadOnly(false); } else { setPriority('URGENT'); setUnreadOnly(true); } }} />
                <Stat icon={CalendarDays} label="Today" value={summary?.today} active={showingToday}
                    onClick={() => { if (showingToday) { setFrom(''); setTo(''); } else { setFrom(today); setTo(today); } }} />
                <Stat icon={Layers} label="All notifications" value={summary?.total} active={!hasFilters} onClick={resetFilters} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-5">
                {/* Category rail */}
                <nav aria-label="Categories" className="lg:sticky lg:top-24 self-start">
                    <ul className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
                        <li>
                            <button
                                type="button"
                                onClick={() => setCategory(null)}
                                aria-current={!category}
                                className={`w-full flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm ${!category ? 'bg-white shadow-sm ring-1 ring-slate-200 font-semibold text-slate-900' : 'text-slate-600 hover:bg-white/70'}`}
                            >
                                <Inbox className="w-4 h-4 text-slate-500" />
                                <span className="flex-1 text-left">Everything</span>
                                {summary?.unread > 0 && <span className="text-xs font-bold text-[#B45309]">{summary.unread}</span>}
                            </button>
                        </li>
                        {Object.entries(CATEGORY_META).filter(([k]) => k !== 'OTHER' || catCount('OTHER')).map(([key, meta]) => {
                            const c = catCount(key);
                            const Icon = meta.icon;
                            const active = category === key;
                            return (
                                <li key={key}>
                                    <button
                                        type="button"
                                        onClick={() => setCategory(active ? null : key)}
                                        aria-current={active}
                                        className={`w-full flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm ${active ? 'bg-white shadow-sm ring-1 ring-slate-200 font-semibold text-slate-900' : 'text-slate-600 hover:bg-white/70'} ${!c ? 'opacity-60' : ''}`}
                                    >
                                        <span className={`w-6 h-6 rounded-lg ring-1 flex items-center justify-center ${meta.tint}`}><Icon className="w-3.5 h-3.5" /></span>
                                        <span className="flex-1 text-left">{meta.label}</span>
                                        {c?.unread > 0 ? (
                                            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#F5C742] text-[11px] font-bold text-slate-900 flex items-center justify-center">{c.unread}</span>
                                        ) : c ? (
                                            <span className="text-xs text-slate-400">{c.total}</span>
                                        ) : null}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                <div className="min-w-0 space-y-3">
                    {/* Toolbar */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative flex-1 min-w-[200px]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="search"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search title, message, reference or person…"
                                    aria-label="Search notifications"
                                    className="h-9 w-full pl-9 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 placeholder:text-slate-400"
                                />
                            </div>
                            <div className="inline-flex p-0.5 rounded-lg bg-slate-100 text-xs font-semibold" role="group" aria-label="Read state">
                                {[[false, 'All'], [true, 'Unread']].map(([val, label]) => (
                                    <button key={label} type="button" aria-pressed={unreadOnly === val} onClick={() => setUnreadOnly(val)}
                                        className={`px-3 py-1.5 rounded-md ${unreadOnly === val ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority"
                                className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600">
                                <option value="">Any priority</option>
                                <option value="URGENT">Urgent (high + critical)</option>
                                {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type"
                                className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600">
                                <option value="">Any type</option>
                                {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                            <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                                From
                                <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 px-2 rounded-lg border border-slate-200 text-xs text-slate-600" />
                            </label>
                            <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                                To
                                <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 px-2 rounded-lg border border-slate-200 text-xs text-slate-600" />
                            </label>
                            <button type="button" onClick={refresh} title="Refresh" aria-label="Refresh"
                                className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50">
                                <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${loading || refreshing ? 'animate-spin' : ''}`} />
                            </button>
                        </div>

                        {/* Selection / bulk bar */}
                        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
                            <label className="inline-flex items-center gap-2 font-medium text-slate-600 cursor-pointer">
                                <input type="checkbox" checked={allSelected} onChange={selectAll} disabled={items.length === 0}
                                    className="h-4 w-4 rounded border-slate-300 accent-[#E0A800]" />
                                {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
                            </label>
                            {selected.size > 0 ? (
                                <>
                                    <button type="button" onClick={bulkRead} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-200 font-semibold text-slate-700 hover:border-[#F5C742]">
                                        <CheckCheck className="w-3.5 h-3.5" /> Mark read
                                    </button>
                                    <button type="button" onClick={bulkDismiss} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-200 font-semibold text-red-600 hover:border-red-200 hover:bg-red-50">
                                        <Trash2 className="w-3.5 h-3.5" /> Dismiss
                                    </button>
                                    <button type="button" onClick={() => setSelected(new Set())} className="inline-flex items-center gap-1 h-7 px-2 font-semibold text-slate-500 hover:text-slate-800">
                                        <X className="w-3.5 h-3.5" /> Clear
                                    </button>
                                </>
                            ) : (
                                <>
                                    <span className="text-slate-400">
                                        {loading ? 'Loading…' : `${totalElements.toLocaleString()} notification${totalElements === 1 ? '' : 's'}${category ? ` in ${categoryMeta(category).label}` : ''}`}
                                    </span>
                                    <div className="ml-auto flex items-center gap-2">
                                        {hasFilters && (
                                            <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 h-7 px-2 font-semibold text-slate-500 hover:text-slate-800">
                                                <X className="w-3.5 h-3.5" /> Clear filters
                                            </button>
                                        )}
                                        {(category ? catCount(category)?.unread : summary?.unread) > 0 && (
                                            <button type="button" onClick={readAll} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-200 font-semibold text-slate-700 hover:border-[#F5C742]">
                                                <CheckCheck className="w-3.5 h-3.5" /> Mark {category ? categoryMeta(category).label : 'all'} read
                                            </button>
                                        )}
                                        {summary && summary.total > summary.unread && (
                                            <button type="button" onClick={clearRead} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-200 font-semibold text-slate-600 hover:border-red-200 hover:text-red-600">
                                                <Trash2 className="w-3.5 h-3.5" /> Clear read
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* List */}
                    {loading ? (
                        <div className="py-20 flex justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
                    ) : items.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
                            <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                                <Inbox className="w-7 h-7 text-slate-400" />
                            </div>
                            <h3 className="text-sm font-semibold text-slate-600">{hasFilters ? 'Nothing matches these filters' : 'Your inbox is empty'}</h3>
                            <p className="mt-1 text-xs text-slate-400">
                                {hasFilters ? 'Try clearing a filter.' : 'Alerts about stock, sales, purchases and approvals land here.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {groupByDay(items, (n) => n.createdAt).map((g) => (
                                <section key={g.label}>
                                    <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                                        {g.label}<span className="h-px flex-1 bg-slate-200" />
                                    </h3>
                                    <div className="space-y-2">
                                        {g.items.map((n) => (
                                            <NotificationCard
                                                key={n.id}
                                                notif={n}
                                                selected={selected.has(n.id)}
                                                onToggleSelect={toggle}
                                                onOpen={open}
                                                onMarkRead={onMarkRead}
                                                onDismiss={onDismiss}
                                            />
                                        ))}
                                    </div>
                                </section>
                            ))}
                            {page < totalPages - 1 && (
                                <div className="flex justify-center">
                                    <button type="button" onClick={loadMore} disabled={loadingMore}
                                        className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                                        {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        Load more ({(totalElements - items.length).toLocaleString()} left)
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS = [
    { key: 'inbox', label: 'Inbox', icon: Inbox },
    { key: 'activity', label: 'User activity', icon: Activity },
];

const Notifications = () => {
    const [params, setParams] = useSearchParams();
    const tab = params.get('tab') === 'activity' ? 'activity' : 'inbox';
    const { unreadCount } = useNotifications();

    const setTab = (key) => {
        const next = new URLSearchParams(params);
        if (key === 'inbox') next.delete('tab'); else next.set('tab', key);
        next.delete('priority');
        setParams(next, { replace: true });
    };

    return (
        <div className="min-h-screen bg-[#F7F7FA] font-sans text-slate-900">
            <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 md:px-6 pt-4 shadow-sm">
                <div className="max-w-[1400px] mx-auto">
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                        <div>
                            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <Bell className="text-[#F5C742]" size={22} /> Notifications
                            </h1>
                            <p className="text-xs text-slate-500 mt-1">
                                Alerts that need you, and a record of what everyone has been doing.
                            </p>
                        </div>
                    </div>
                    <nav className="mt-3 flex gap-1" role="tablist" aria-label="Notification views">
                        {TABS.map(({ key, label, icon: Icon }) => (
                            <button
                                key={key}
                                type="button"
                                role="tab"
                                aria-selected={tab === key}
                                onClick={() => setTab(key)}
                                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors
                                    ${tab === key ? 'border-[#F5C742] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                            >
                                <Icon className="w-4 h-4" /> {label}
                                {key === 'inbox' && unreadCount > 0 && (
                                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#F5C742] text-[11px] font-bold text-slate-900 flex items-center justify-center">
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                )}
                            </button>
                        ))}
                    </nav>
                </div>
            </header>

            <main className="p-4 md:p-6 max-w-[1400px] mx-auto">
                {tab === 'inbox'
                    ? <InboxView key={params.get('priority') || 'all'} initialPriority={params.get('priority') || ''} />
                    : <ActivityFeed />}
            </main>
        </div>
    );
};

export default Notifications;
