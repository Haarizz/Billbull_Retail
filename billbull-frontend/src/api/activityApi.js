import api from '@billbull/shared/api/axiosConfig';

const BASE = '/api/activity';

const clean = (params) =>
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));

/**
 * User activity feed (who did what), newest first. What the caller may see is decided by the
 * server: admins see everyone, branch admins their branches, everyone else their own actions.
 * @param {object} filters - { username, module, outcome: 'SUCCESS'|'FAILED', branchId, q, from, to }
 * @returns {{ content: object[], page: number, size: number, hasMore: boolean, scope: 'ALL'|'BRANCH'|'SELF' }}
 */
export const getActivity = async (page = 0, size = 30, filters = {}) => {
    const res = await api.get(BASE, { params: clean({ page, size, ...filters, q: filters.q?.trim() }) });
    return res.data;
};

/**
 * Header numbers for the last `days` days (1 = today).
 * @returns {{ total, failed, activeUsers, topUsers, modules, timeline, timelineUnit, scope }}
 */
export const getActivitySummary = async (days = 1, filters = {}) => {
    const res = await api.get(`${BASE}/summary`, {
        params: clean({ days, username: filters.username, module: filters.module, branchId: filters.branchId }),
    });
    return res.data;
};

/** People the caller can filter the feed by. @returns {{ username, name }[]} */
export const getActivityPeople = async () => {
    const res = await api.get(`${BASE}/people`);
    return res.data;
};
