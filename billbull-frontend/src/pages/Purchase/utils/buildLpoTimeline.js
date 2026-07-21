import { formatDisplayDate } from '../../../utils/dateUtils';

// Builds an LPO timeline from data already on the fetched entity: creation, the
// approval-history steps the backend records, and any advance payments. No
// fabricated events.
export function buildLpoTimeline(lpo, advances = []) {
    if (!lpo) return [];
    const events = [];

    if (lpo.createdAt || lpo.date) {
        events.push({
            key: 'created',
            label: 'LPO Created',
            date: lpo.createdAt || lpo.date,
            by: lpo.createdBy || lpo.createdFrom || null,
        });
    }

    (lpo.approvalHistory || []).forEach((h) => {
        if (!h.approvedAt && !h.remarks) return;
        events.push({
            key: `ah-${h.stepOrder}`,
            label: `${h.status || 'Approval'}${h.stepName ? ` — ${h.stepName}` : ''}${h.remarks ? `: ${h.remarks}` : ''}`,
            date: h.approvedAt || null,
            by: h.approvedBy || h.displayName || (h.stepOrder != null ? `Step ${h.stepOrder}` : null),
        });
    });

    (advances || []).forEach((a) => {
        events.push({
            key: `adv-${a.key || a.dbId}`,
            label: `Advance paid — ${a.mode || 'Payment'}`,
            date: a.date,
            by: a.paidBy || null,
            amount: a.amount,
        });
    });

    if (lpo.status) {
        events.push({
            key: 'status',
            label: `Status: ${String(lpo.status).replace(/_/g, ' ')}`,
            date: lpo.updatedAt || lpo.createdAt || lpo.date || null,
            by: null,
        });
    }

    return events
        .filter((e) => e.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map((e) => ({ ...e, _display: formatDisplayDate(e.date) }));
}
