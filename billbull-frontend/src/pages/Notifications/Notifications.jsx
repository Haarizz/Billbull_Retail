import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Bell, Search, Filter, CheckCheck, Trash2, ChevronLeft,
    ChevronRight, Package, ShoppingCart, Truck, Landmark,
    Users, AlertTriangle, Info, CheckCircle, XCircle,
    Inbox, X, RefreshCw
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

const CATEGORIES = [
    { key: null, label: 'All Categories' },
    { key: 'INVENTORY', label: 'Inventory', icon: Package },
    { key: 'SALES', label: 'Sales', icon: ShoppingCart },
    { key: 'PURCHASE', label: 'Purchase', icon: Truck },
    { key: 'FINANCE', label: 'Finance', icon: Landmark },
    { key: 'HR', label: 'HR', icon: Users },
    { key: 'SYSTEM', label: 'System', icon: AlertTriangle },
];

const TYPE_CONFIG = {
    INFO:    { icon: Info,         color: '#3B82F6', bg: '#EFF6FF', accent: '#3B82F6', label: 'Info' },
    WARNING: { icon: AlertTriangle, color: '#F59E0B', bg: '#FFFBEB', accent: '#F59E0B', label: 'Warning' },
    SUCCESS: { icon: CheckCircle,  color: '#10B981', bg: '#ECFDF5', accent: '#10B981', label: 'Success' },
    ERROR:   { icon: XCircle,      color: '#EF4444', bg: '#FEF2F2', accent: '#EF4444', label: 'Error' },
};

const CATEGORY_ICONS = {
    INVENTORY: Package,
    SALES: ShoppingCart,
    PURCHASE: Truck,
    FINANCE: Landmark,
    HR: Users,
    SYSTEM: AlertTriangle,
};

const Notifications = () => {
    const navigate = useNavigate();
    const { markAsRead, markAllAsRead, dismiss, fetchNotifications, unreadCount, fetchUnreadCount } = useNotifications();

    const [notifs, setNotifs] = useState([]);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [totalElements, setTotalElements] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState(null);
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const loadPage = useCallback(async (p = 0) => {
        setLoading(true);
        const filters = {};
        if (categoryFilter) filters.category = categoryFilter;
        if (unreadOnly) filters.unreadOnly = true;
        const data = await fetchNotifications(p, 20, filters);
        if (data) {
            setNotifs(data.content || []);
            setTotalPages(data.totalPages || 0);
            setTotalElements(data.totalElements || 0);
            setPage(p);
        }
        setLoading(false);
    }, [categoryFilter, unreadOnly, fetchNotifications]);

    useEffect(() => { loadPage(0); }, [loadPage]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadPage(page);
        await fetchUnreadCount();
        setRefreshing(false);
    };

    const handleMarkRead = async (id) => {
        await markAsRead(id);
        setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    };

    const handleDismiss = async (id) => {
        await dismiss(id);
        setNotifs(prev => prev.filter(n => n.id !== id));
        setTotalElements(prev => prev - 1);
    };

    const handleMarkAllRead = async () => {
        await markAllAsRead();
        setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    };

    const handleClick = (notif) => {
        if (!notif.read) handleMarkRead(notif.id);
        if (notif.actionUrl) navigate(notif.actionUrl);
    };

    // Client-side search filter (on current page)
    const searchLower = search.trim().toLowerCase();
    const filteredNotifs = searchLower
        ? notifs.filter(n =>
            (n.title || '').toLowerCase().includes(searchLower) ||
            (n.message || '').toLowerCase().includes(searchLower) ||
            (n.referenceId || '').toLowerCase().includes(searchLower))
        : notifs;

    return (
        <div className="min-h-screen bg-[#F7F7FA] font-sans text-slate-900">
            {/* Page Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-4 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 max-w-[1400px] mx-auto">
                    <div>
                        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Bell className="text-[#F5C742]" size={24} />
                            Notifications
                            {unreadCount > 0 && (
                                <span className="ml-2 px-2.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                                    {unreadCount} unread
                                </span>
                            )}
                        </h1>
                        <p className="text-xs text-slate-500 mt-1">
                            {totalElements} total notification{totalElements !== 1 ? 's' : ''}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search notifications..."
                                className="h-9 w-56 pl-9 pr-4 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 placeholder:text-slate-400"
                            />
                        </div>

                        {/* Category Filter */}
                        <select
                            value={categoryFilter || ''}
                            onChange={(e) => setCategoryFilter(e.target.value || null)}
                            className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 outline-none hover:border-slate-300 cursor-pointer"
                        >
                            {CATEGORIES.map(c => (
                                <option key={c.key || 'all'} value={c.key || ''}>{c.label}</option>
                            ))}
                        </select>

                        {/* Unread Toggle */}
                        <button
                            onClick={() => setUnreadOnly(!unreadOnly)}
                            className={`h-9 px-3 rounded-lg border text-xs font-medium transition-all ${
                                unreadOnly
                                    ? 'bg-[#F5C742] border-[#F5C742] text-slate-900'
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                        >
                            Unread Only
                        </button>

                        {/* Mark All Read */}
                        {unreadCount > 0 && (
                            <button
                                onClick={handleMarkAllRead}
                                className="h-9 px-3 flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                            >
                                <CheckCheck className="w-3.5 h-3.5" /> Mark All Read
                            </button>
                        )}

                        {/* Refresh */}
                        <button
                            onClick={handleRefresh}
                            className="h-9 w-9 flex items-center justify-center bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                            title="Refresh"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${refreshing ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
                {loading ? (
                    <div className="text-center py-20">
                        <RefreshCw className="w-8 h-8 text-[#F5C742] animate-spin mx-auto mb-3" />
                        <p className="text-sm text-slate-500">Loading notifications...</p>
                    </div>
                ) : filteredNotifs.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                            <Inbox className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-base font-semibold text-slate-600">No notifications found</h3>
                        <p className="text-sm text-slate-400 mt-1">
                            {search ? 'Try a different search term' : unreadOnly ? 'All caught up!' : 'Nothing here yet'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredNotifs.map((notif) => {
                            const typeConf = TYPE_CONFIG[notif.type] || TYPE_CONFIG.INFO;
                            const CatIcon = CATEGORY_ICONS[notif.category] || Info;

                            return (
                                <div
                                    key={notif.id}
                                    onClick={() => handleClick(notif)}
                                    className={`group flex items-start gap-4 p-4 rounded-xl border transition-all ${
                                        notif.read
                                            ? 'bg-white/60 border-slate-100 hover:border-slate-200'
                                            : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md'
                                    } ${notif.actionUrl ? 'cursor-pointer' : ''}`}
                                    style={{ borderLeft: `3px solid ${typeConf.accent}` }}
                                >
                                    {/* Icon */}
                                    <div
                                        className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                                        style={{ background: typeConf.bg }}
                                    >
                                        <CatIcon style={{ width: 20, height: 20, color: typeConf.color }} />
                                    </div>

                                    {/* Body */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            {!notif.read && (
                                                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                                            )}
                                            <span className={`text-sm ${notif.read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'} truncate`}>
                                                {notif.title}
                                            </span>
                                            {(notif.priority === 'HIGH' || notif.priority === 'CRITICAL') && (
                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                                                    notif.priority === 'CRITICAL'
                                                        ? 'bg-red-100 text-red-700'
                                                        : 'bg-amber-100 text-amber-700'
                                                }`}>
                                                    {notif.priority}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{notif.message}</p>
                                        <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
                                            <span>{notif.timeAgo}</span>
                                            {notif.category && (
                                                <>
                                                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                                                    <span>{notif.category.charAt(0) + notif.category.slice(1).toLowerCase()}</span>
                                                </>
                                            )}
                                            {notif.referenceId && (
                                                <>
                                                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                                                    <span className="font-mono">{notif.referenceId}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {!notif.read && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleMarkRead(notif.id); }}
                                                className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors"
                                                title="Mark as read"
                                            >
                                                <CheckCircle className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDismiss(notif.id); }}
                                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                                            title="Dismiss"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        {notif.actionUrl && (
                                            <ChevronRight className="w-4 h-4 text-slate-300" />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6 px-2">
                        <span className="text-xs text-slate-500">
                            Page {page + 1} of {totalPages}
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => loadPage(page - 1)}
                                disabled={page === 0}
                                className="h-8 px-3 flex items-center gap-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" /> Previous
                            </button>
                            <button
                                onClick={() => loadPage(page + 1)}
                                disabled={page >= totalPages - 1}
                                className="h-8 px-3 flex items-center gap-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Next <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Notifications;
