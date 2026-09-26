import api from "./axiosConfig";

/**
 * Employee monthly targets and performance.
 *
 * Every figure here is computed server-side (sales aggregate, achievement, commission, totals).
 * Nothing in this module derives a business number from the response — the UI renders what the
 * server sends.
 */

/** `month` is any ISO date inside the month; the backend normalises it to the 1st. */
export const getEmployeePerformance = async ({ month, branchId } = {}) => {
    const params = {};
    if (month) params.month = month;
    if (branchId !== undefined && branchId !== null && branchId !== '' && branchId !== 'All') {
        params.branchId = branchId;
    }
    const res = await api.get("/api/hr/targets", { params });
    return res.data;
};

export const saveEmployeeTarget = async ({ employeeId, targetMonth, targetAmount, commissionRate }) => {
    const res = await api.put("/api/hr/targets", {
        employeeId, targetMonth, targetAmount, commissionRate,
    });
    return res.data;
};

/** Bulk save from the Set Targets grid — validated row-by-row server-side before anything writes. */
export const saveEmployeeTargetsBulk = async (rows) => {
    const res = await api.put("/api/hr/targets/bulk", rows);
    return res.data;
};

/**
 * The signed-in user's own targets/performance. The employee is resolved server-side from the
 * authenticated principal — there is no employeeId parameter by design.
 *
 * Returns null when the user has no linked employee (backend replies 204).
 */
export const getMyPerformance = async ({ month } = {}) => {
    const params = {};
    if (month) params.month = month;
    const res = await api.get("/api/hr/targets/me", { params });
    return res.status === 204 ? null : (res.data ?? null);
};

/**
 * Whether this month's salesperson target configuration allows POS selling.
 *
 * ADVISORY ONLY — this drives the early warning in the POS. The authoritative check runs inside
 * the checkout transaction server-side, so a stale or failed read here can never let a sale
 * through that the server would refuse.
 *
 * Returns `{ required, ready, month, missing: [{ employeeId, employeeCode, employeeName, role,
 * missingTarget, missingCommission }] }`. Authenticated access — POS cashiers hold no HR
 * permissions, which is why the response carries no personal data.
 */
export const getTargetReadiness = async ({ month } = {}) => {
    const params = {};
    if (month) params.month = month;
    const res = await api.get("/api/hr/targets/readiness", { params });
    return res.data;
};
