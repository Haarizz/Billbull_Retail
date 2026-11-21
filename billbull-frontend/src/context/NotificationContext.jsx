import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
    getUnreadCount,
    getNotifications,
    getNotificationSummary,
    markAsRead as apiMarkAsRead,
    markManyAsRead as apiMarkManyAsRead,
    markAllAsRead as apiMarkAllAsRead,
    dismissNotification as apiDismiss,
    dismissMany as apiDismissMany,
    dismissAllRead as apiDismissAllRead,
} from '../api/notificationApi';

const NotificationContext = createContext(null);

const POLL_INTERVAL = 30_000; // 30 seconds

/**
 * Inbox state shared by the bell and the Notifications page.
 *
 * - `unreadCount` is polled (cheap indexed COUNT) while the tab is visible.
 * - `arrivals` increments whenever the unread count goes UP between polls, so open views can
 *   refetch their list without polling the heavier endpoints themselves.
 * - Mutations update local state optimistically, then re-sync the count and summary.
 */
export const NotificationProvider = ({ children }) => {
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [arrivals, setArrivals] = useState(0);
    const intervalRef = useRef(null);
    const abortedRef = useRef(false); // 401 kill-switch
    const lastCountRef = useRef(null);

    const stopOn401 = (err) => {
        if (err?.response?.status === 401) {
            abortedRef.current = true;
            clearInterval(intervalRef.current);
        }
    };

    // ── Fetch unread count (lightweight, for badge) ──────────────────────────

    const fetchUnreadCount = useCallback(async () => {
        if (abortedRef.current) return;
        try {
            const data = await getUnreadCount();
            const count = data.count || 0;
            if (lastCountRef.current !== null && count > lastCountRef.current) {
                setArrivals((n) => n + 1);
            }
            lastCountRef.current = count;
            setUnreadCount(count);
        } catch (err) {
            stopOn401(err);
        }
    }, []);

    const refreshSummary = useCallback(async () => {
        if (abortedRef.current) return null;
        try {
            const data = await getNotificationSummary();
            setSummary(data);
            if (typeof data?.unread === 'number') {
                lastCountRef.current = data.unread;
                setUnreadCount(data.unread);
            }
            return data;
        } catch (err) {
            stopOn401(err);
            return null;
        }
    }, []);

    // ── Fetch notification list (heavier, for dropdown/page) ─────────────────

    const fetchNotifications = useCallback(async (page = 0, size = 20, filters = {}) => {
        if (abortedRef.current) return null;
        setLoading(true);
        try {
            const data = await getNotifications(page, size, filters);
            const unfiltered = !filters.category && !filters.unreadOnly && !filters.type
                && !filters.priority && !filters.q && !filters.from && !filters.to;
            if (page === 0 && unfiltered) {
                setNotifications(data.content || []);
            }
            return data;
        } catch (err) {
            stopOn401(err);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    const resync = useCallback(() => {
        fetchUnreadCount();
        refreshSummary();
    }, [fetchUnreadCount, refreshSummary]);

    // ── Mutations (optimistic, then re-sync) ─────────────────────────────────

    const markAsRead = useCallback(async (id) => {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
        lastCountRef.current = Math.max(0, (lastCountRef.current ?? 1) - 1);
        try {
            await apiMarkAsRead(id);
        } finally {
            refreshSummary();
        }
    }, [refreshSummary]);

    const markManyAsRead = useCallback(async (ids) => {
        if (!ids?.length) return;
        const set = new Set(ids);
        setNotifications((prev) => prev.map((n) => (set.has(n.id) ? { ...n, read: true } : n)));
        try {
            await apiMarkManyAsRead(ids);
        } finally {
            resync();
        }
    }, [resync]);

    const markAllAsRead = useCallback(async (category) => {
        setNotifications((prev) => prev.map((n) => (!category || n.category === category ? { ...n, read: true } : n)));
        if (!category) {
            setUnreadCount(0);
            lastCountRef.current = 0;
        }
        try {
            await apiMarkAllAsRead(category);
        } finally {
            resync();
        }
    }, [resync]);

    const dismiss = useCallback(async (id) => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        try {
            await apiDismiss(id);
        } finally {
            resync();
        }
    }, [resync]);

    const dismissMany = useCallback(async (ids) => {
        if (!ids?.length) return;
        const set = new Set(ids);
        setNotifications((prev) => prev.filter((n) => !set.has(n.id)));
        try {
            await apiDismissMany(ids);
        } finally {
            resync();
        }
    }, [resync]);

    const dismissAllRead = useCallback(async () => {
        setNotifications((prev) => prev.filter((n) => !n.read));
        try {
            await apiDismissAllRead();
        } finally {
            resync();
        }
    }, [resync]);

    // ── Smart polling with Page Visibility API ───────────────────────────────

    useEffect(() => {
        fetchUnreadCount();

        const startPolling = () => {
            clearInterval(intervalRef.current);
            intervalRef.current = setInterval(fetchUnreadCount, POLL_INTERVAL);
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                clearInterval(intervalRef.current);
            } else {
                fetchUnreadCount();
                startPolling();
            }
        };

        startPolling();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(intervalRef.current);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [fetchUnreadCount]);

    return (
        <NotificationContext.Provider value={{
            unreadCount,
            notifications,
            summary,
            loading,
            arrivals,
            fetchUnreadCount,
            fetchNotifications,
            refreshSummary,
            markAsRead,
            markManyAsRead,
            markAllAsRead,
            dismiss,
            dismissMany,
            dismissAllRead,
        }}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotifications = () => {
    const ctx = useContext(NotificationContext);
    if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
    return ctx;
};
