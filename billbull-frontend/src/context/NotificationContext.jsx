import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getUnreadCount, getNotifications, markAsRead as apiMarkAsRead, markAllAsRead as apiMarkAllAsRead, dismissNotification as apiDismiss } from '../api/notificationApi';

const NotificationContext = createContext(null);

const POLL_INTERVAL = 30_000; // 30 seconds

export const NotificationProvider = ({ children }) => {
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);
    const intervalRef = useRef(null);
    const abortedRef = useRef(false); // 401 kill-switch

    // ── Fetch unread count (lightweight, for badge) ──────────────────────────

    const fetchUnreadCount = useCallback(async () => {
        if (abortedRef.current) return;
        try {
            const data = await getUnreadCount();
            setUnreadCount(data.count || 0);
        } catch (err) {
            // If the session has expired (401), stop polling to avoid
            // hammering the backend with doomed requests.
            if (err?.response?.status === 401) {
                abortedRef.current = true;
                clearInterval(intervalRef.current);
            }
        }
    }, []);

    // ── Fetch notification list (heavier, for dropdown/page) ─────────────────

    const fetchNotifications = useCallback(async (page = 0, size = 20, filters = {}) => {
        if (abortedRef.current) return null;
        setLoading(true);
        try {
            const data = await getNotifications(page, size, filters);
            // Only cache first page in state (for the dropdown)
            if (page === 0 && !filters.category && !filters.unreadOnly) {
                setNotifications(data.content || []);
            }
            return data;
        } catch (err) {
            if (err?.response?.status === 401) {
                abortedRef.current = true;
                clearInterval(intervalRef.current);
            }
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    // ── Mutations with optimistic updates ────────────────────────────────────

    const markAsRead = useCallback(async (id) => {
        // Optimistic: immediately mark as read in local state
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
        try {
            await apiMarkAsRead(id);
        } catch {
            // Revert on failure
            fetchUnreadCount();
        }
    }, [fetchUnreadCount]);

    const markAllAsRead = useCallback(async () => {
        const prevCount = unreadCount;
        // Optimistic
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
        try {
            await apiMarkAllAsRead();
        } catch {
            setUnreadCount(prevCount);
            fetchUnreadCount();
        }
    }, [unreadCount, fetchUnreadCount]);

    const dismiss = useCallback(async (id) => {
        const target = notifications.find(n => n.id === id);
        // Optimistic: remove from list
        setNotifications(prev => prev.filter(n => n.id !== id));
        if (target && !target.read) {
            setUnreadCount(prev => Math.max(0, prev - 1));
        }
        try {
            await apiDismiss(id);
        } catch {
            fetchUnreadCount();
            fetchNotifications();
        }
    }, [notifications, fetchUnreadCount, fetchNotifications]);

    // ── Smart polling with Page Visibility API ───────────────────────────────

    useEffect(() => {
        // Initial fetch
        fetchUnreadCount();

        const startPolling = () => {
            clearInterval(intervalRef.current);
            intervalRef.current = setInterval(fetchUnreadCount, POLL_INTERVAL);
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                // Tab is hidden — pause polling
                clearInterval(intervalRef.current);
            } else {
                // Tab is visible again — fetch immediately + resume polling
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
            loading,
            fetchUnreadCount,
            fetchNotifications,
            markAsRead,
            markAllAsRead,
            dismiss,
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
