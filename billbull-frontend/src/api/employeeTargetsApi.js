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
