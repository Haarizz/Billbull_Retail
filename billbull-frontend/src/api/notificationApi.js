import api from './axiosConfig';

const BASE = '/api/notifications';

/**
 * Fetch paginated notifications for the authenticated user.
 * @param {number} page - zero-based page index
 * @param {number} size - page size (max 50)
 * @param {object} filters - { category?: string, unreadOnly?: boolean }
 */
export const getNotifications = async (page = 0, size = 20, filters = {}) => {
    const params = { page, size };
    if (filters.category) params.category = filters.category;
    if (filters.unreadOnly) params.unreadOnly = true;
    const res = await api.get(BASE, { params });
    return res.data;
};

/**
 * Lightweight unread count for the bell badge.
 * @returns {{ count: number }}
 */
export const getUnreadCount = async () => {
    const res = await api.get(`${BASE}/unread-count`);
    return res.data;
};

/** Mark a single notification as read. */
export const markAsRead = async (id) => {
    const res = await api.put(`${BASE}/${id}/read`);
    return res.data;
};

/** Bulk mark all notifications as read. */
export const markAllAsRead = async () => {
    const res = await api.put(`${BASE}/read-all`);
    return res.data;
};

/** Dismiss (soft-delete) a notification. */
export const dismissNotification = async (id) => {
    await api.delete(`${BASE}/${id}`);
};
