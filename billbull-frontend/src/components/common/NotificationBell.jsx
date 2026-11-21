import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, X, Inbox, Activity, ArrowRight, AlertTriangle, Loader2 } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import NotificationCard from '../notifications/NotificationCard';
import { groupByDay, resolveActionUrl } from '../notifications/notificationUi';

const PANEL_WIDTH = 400;
const PANEL_MARGIN = 12;

/** Short, quiet chime — only when an urgent (HIGH/CRITICAL) notification arrives. */
const chime = () => {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.18);
    } catch { /* audio unavailable */ }
};

/**
 * Bell + dropdown inbox. The panel is portalled and positioned from the button, so it works
 * from the sidebar header (opens to the right) and from the mobile top bar (opens below).
 */
const NotificationBell = ({ className = '' }) => {
    const navigate = useNavigate();
    const {
        unreadCount, summary, arrivals, fetchNotifications, refreshSummary,
        markAsRead, markAllAsRead, dismiss,
    } = useNotifications();

    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState('unread');
    // The list remembers which tab it was loaded for; until the current tab's list arrives
    // it is "loading" and shows nothing, rather than the other tab's items.
    const [list, setList] = useState({ tab: null, items: [] });
    const [pos, setPos] = useState(null);
    const buttonRef = useRef(null);
    const panelRef = useRef(null);
    const lastUrgentRef = useRef(null);

    const loading = list.tab !== tab;
    const items = loading ? [] : list.items;
    const setItems = (update) => setList((prev) => ({ ...prev, items: update(prev.items) }));

    // Fetch only; the caller applies the result (state is set in a .then, never synchronously in an effect).
    const fetchList = useCallback(
        () => fetchNotifications(0, 15, tab === 'unread' ? { unreadOnly: true } : {})
            .then((data) => ({ tab, items: data?.content || [] })),
        [fetchNotifications, tab],
    );

    useEffect(() => {
        if (!open) return undefined;
        let live = true;
        fetchList().then((next) => { if (live) setList(next); });
        refreshSummary();
        return () => { live = false; };
    }, [open, fetchList, refreshSummary]);

    // New arrivals: refresh what's on screen and chime once per new urgent notification.
    useEffect(() => {
        if (arrivals === 0) return undefined;
        let live = true;
        refreshSummary().then((s) => {
            const urgent = s?.urgentUnread ?? 0;
            if (lastUrgentRef.current !== null && urgent > lastUrgentRef.current) chime();
            lastUrgentRef.current = urgent;
        });
        if (open) fetchList().then((next) => { if (live) setList(next); });
        return () => { live = false; };
    }, [arrivals]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (summary && lastUrgentRef.current === null) lastUrgentRef.current = summary.urgentUnread ?? 0;
    }, [summary]);

    // Position next to the button, clamped to the viewport.
    const measure = useCallback(() => {
        const btn = buttonRef.current;
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const width = Math.min(PANEL_WIDTH, vw - PANEL_MARGIN * 2);
        let left;
        let top;
        if (r.right + PANEL_MARGIN + width <= vw && r.left < vw / 2 && vw >= 768) {
            left = r.right + PANEL_MARGIN; // sidebar: open to the right
            top = Math.max(PANEL_MARGIN, r.top - 8);
        } else {
            left = Math.min(Math.max(PANEL_MARGIN, r.right - width), vw - width - PANEL_MARGIN);
            top = r.bottom + 8; // top bar: open below
        }
        return { left, top, width, maxHeight: Math.max(320, vh - top - PANEL_MARGIN) };
    }, []);

    const toggleOpen = () => {
        if (!open) setPos(measure());
        setOpen(!open);
    };

    useLayoutEffect(() => {
        if (!open) return undefined;
        const place = () => setPos(measure());
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [open, measure]);

    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => {
            if (panelRef.current?.contains(e.target) || buttonRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') {
                setOpen(false);
                buttonRef.current?.focus();
            }
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const openNotif = (n) => {
        if (!n.read) markAsRead(n.id);
        const url = resolveActionUrl(n.actionUrl);
        if (url) {
            navigate(url);
            setOpen(false);
        } else if (tab === 'unread') {
            setItems((prev) => prev.filter((x) => x.id !== n.id));
        }
    };

    const onMarkRead = (id) => {
        markAsRead(id);
        setItems((prev) => (tab === 'unread' ? prev.filter((x) => x.id !== id) : prev.map((x) => (x.id === id ? { ...x, read: true } : x))));
    };

    const onDismiss = (id) => {
        dismiss(id);
        setItems((prev) => prev.filter((x) => x.id !== id));
    };

    const onMarkAll = async () => {
        await markAllAsRead();
        setItems((prev) => (tab === 'unread' ? [] : prev.map((x) => ({ ...x, read: true }))));
    };

    const go = (path) => {
        navigate(path);
        setOpen(false);
    };

    const urgent = summary?.urgentUnread ?? 0;
    const badge = unreadCount > 99 ? '99+' : unreadCount;

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                id="notification-bell"
                onClick={toggleOpen}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
                title="Notifications"
                className={`relative inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors
                    ${open ? 'bg-[#FFF8E7] border-[#F5C742] text-[#B45309]' : 'bg-white border-slate-200 text-slate-600 hover:border-[#F5C742] hover:text-[#B45309]'}
                    ${className}`}
            >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                    <span
                        className={`absolute -top-1.5 -right-1.5 min-w-4.5 h-4.5 px-1 rounded-full text-[10px] font-bold leading-3.5
                            text-white border-2 border-white flex items-center justify-center ${urgent > 0 ? 'bg-red-500' : 'bg-[#E0A800]'}`}
                    >
                        {badge}
                    </span>
                )}
            </button>

            {open && pos && createPortal(
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-label="Notifications"
                    style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.width, maxHeight: Math.min(pos.maxHeight, 640), zIndex: 10001 }}
                    className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 animate-[notifIn_.16s_ease-out]"
                >
                    <style>{`@keyframes notifIn{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}`}</style>

                    {/* Header */}
                    <div className="px-4 pt-4 pb-3 border-b border-slate-100">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <h3 className="text-[15px] font-bold text-slate-900">Notifications</h3>
                                <p className="text-xs text-slate-500">
                                    {unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up'}
                                    {summary?.today ? ` · ${summary.today} today` : ''}
                                </p>
                            </div>
                            <div className="flex items-center gap-1">
                                {unreadCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={onMarkAll}
                                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:border-[#F5C742] hover:text-[#B45309]"
                                    >
                                        <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                                    </button>
                                )}
                                <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="mt-3 inline-flex p-0.5 rounded-lg bg-slate-100 text-xs font-semibold" role="tablist">
                            {[['unread', `Unread${unreadCount ? ` (${badge})` : ''}`], ['all', 'All']].map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === key}
                                    onClick={() => setTab(key)}
                                    className={`px-3 py-1 rounded-md transition-colors ${tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {urgent > 0 && (
                        <button
                            type="button"
                            onClick={() => go('/notifications?priority=URGENT')}
                            className="mx-3 mt-3 flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-left text-xs text-red-700 hover:bg-red-100"
                        >
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span className="flex-1"><b>{urgent}</b> urgent notification{urgent === 1 ? '' : 's'} need{urgent === 1 ? 's' : ''} attention</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    )}

                    {/* List */}
                    <div className="flex-1 overflow-y-auto px-3 py-2">
                        {loading && items.length === 0 ? (
                            <div className="flex items-center justify-center py-12 text-slate-400">
                                <Loader2 className="w-5 h-5 animate-spin" />
                            </div>
                        ) : items.length === 0 ? (
                            <div className="py-12 text-center">
                                <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                                    <Inbox className="w-6 h-6 text-slate-400" />
                                </div>
                                <p className="text-sm font-semibold text-slate-600">{tab === 'unread' ? 'No unread notifications' : 'No notifications yet'}</p>
                                <p className="mt-1 text-xs text-slate-400">New alerts about sales, stock and approvals appear here.</p>
                            </div>
                        ) : (
                            groupByDay(items, (n) => n.createdAt).map((g) => (
                                <section key={g.label} className="mb-2">
                                    <h4 className="sticky top-0 z-1 bg-white/95 backdrop-blur px-1 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                                        {g.label}
                                    </h4>
                                    <div className="space-y-1.5">
                                        {g.items.map((n) => (
                                            <NotificationCard
                                                key={n.id}
                                                notif={n}
                                                compact
                                                onOpen={openNotif}
                                                onMarkRead={onMarkRead}
                                                onDismiss={onDismiss}
                                            />
                                        ))}
                                    </div>
                                </section>
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    <div className="grid grid-cols-2 border-t border-slate-100 text-[13px] font-semibold">
                        <button type="button" onClick={() => go('/notifications')} className="flex items-center justify-center gap-1.5 py-3 text-[#B45309] hover:bg-[#FFF8E7]">
                            <Inbox className="w-4 h-4" /> Open inbox
                        </button>
                        <button type="button" onClick={() => go('/notifications?tab=activity')} className="flex items-center justify-center gap-1.5 py-3 border-l border-slate-100 text-slate-600 hover:bg-slate-50">
                            <Activity className="w-4 h-4" /> User activity
                        </button>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
};

export default NotificationBell;
