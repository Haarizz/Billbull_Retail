import { useCallback, useEffect, useState } from 'react';
import { getEmployeePerformance } from '../../../api/employeeTargetsApi';

/** ISO first-day-of-month string for a Date, e.g. "2026-09-01". */
export const monthKey = (date = new Date()) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;

export const monthLabel = (isoMonth) => {
    if (!isoMonth) return '';
    const [y, m] = isoMonth.split('-');
    return new Date(Number(y), Number(m) - 1, 1)
        .toLocaleString(undefined, { month: 'long', year: 'numeric' });
};

/** The last 12 months, newest first — the Set Targets / performance month picker. */
export const recentMonths = (count = 12) => {
    const now = new Date();
    return Array.from({ length: count }, (_, i) =>
        monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
};

/**
 * Loads the server-computed employee performance payload for a month/branch.
 *
 * Every number (sales, achievement, commission, totals) comes from the server — this hook only
 * transports it. Nothing is derived here.
 */
export default function useEmployeePerformance({ month, branchId, enabled = true } = {}) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const reload = useCallback(async () => {
        if (!enabled) return;
        setLoading(true);
        setError('');
        try {
            const payload = await getEmployeePerformance({ month, branchId });
            setData(payload);
        } catch (err) {
            setData(null);
            // A user without hr.employee view permission gets a 403 here; that is an empty state,
            // not a crash — the page still renders its other sections.
            setError(err?.response?.status === 403
                ? 'You do not have permission to view employee performance.'
                : 'Failed to load employee performance.');
        } finally {
            setLoading(false);
        }
    }, [month, branchId, enabled]);

    useEffect(() => { reload(); }, [reload]);

    return { performance: data, performanceLoading: loading, performanceError: error, reloadPerformance: reload };
}
