import api from '@billbull/shared/api/axiosConfig';

const BASE = '/api/notifications';

const clean = (params) =>
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false));

/**
 * Fetch paginated notifications for the authenticated user, newest first.
 * @param {number} page - zero-based page index
 * @param {number} size - page size (max 50)
 * @param {object} filters - { category, unreadOnly, type, priority, q, from, to } (all optional;
 *                           from/to are yyyy-MM-dd and inclusive)
 */
export const getNotifications = async (page = 0, size = 20, filters = {}) => {
    const params = clean({
        page,
        size,
        category: filters.category,
        unreadOnly: filters.unreadOnly ? true : undefined,
        type: filters.type,
        priority: filters.priority,
        q: filters.q?.trim(),
        from: filters.from,
        to: filters.to,
    });
    const res = await api.get(BASE, { params });
    return res.data;
};

/** Lightweight unread count for the bell badge. @returns {{ count: number }} */
export const getUnreadCount = async () => {
    const res = await api.get(`${BASE}/unread-count`);
    return res.data;
};

/**
 * Inbox overview.
 * @returns {{ total, unread, urgentUnread, criticalUnread, today, categories: {category,total,unread}[] }}
 */
export const getNotificationSummary = async () => {
    const res = await api.get(`${BASE}/summary`);
    return res.data;
};

/** Mark a single notification as read. */
export const markAsRead = async (id) => {
    const res = await api.put(`${BASE}/${id}/read`);
    return res.data;
};

/** Mark several notifications as read. */
export const markManyAsRead = async (ids) => {
    const res = await api.put(`${BASE}/read`, { ids });
    return res.data;
};

/** Bulk mark all (or one category's) notifications as read. */
export const markAllAsRead = async (category) => {
    const res = await api.put(`${BASE}/read-all`, null, { params: clean({ category }) });
    return res.data;
};

/** Dismiss (soft-delete) a notification. */
export const dismissNotification = async (id) => {
    await api.delete(`${BASE}/${id}`);
};

/** Dismiss several notifications. */
export const dismissMany = async (ids) => {
    const res = await api.post(`${BASE}/dismiss`, { ids });
    return res.data;
};

/** Dismiss every notification already read. */
export const dismissAllRead = async () => {
    const res = await api.delete(`${BASE}/read`);
    return res.data;
};
