// Builds a small, honest timeline for a proforma from data already on the
// fetched entity — no fabricated audit trail. Mirrors buildSalesOrderTimeline.
export function buildProformaTimeline(pi) {
    if (!pi) return [];
    const events = [];

    if (pi.createdAt || pi.piDate) {
        events.push({
            key: 'created',
            label: 'Proforma Created',
            date: pi.createdAt || pi.piDate,
            by: pi.createdBy || null,
        });
    }

    if (pi.updatedAt && pi.updatedAt !== pi.createdAt) {
        events.push({
            key: 'updated',
            label: 'Proforma Updated',
            date: pi.updatedAt,
            by: pi.updatedBy || null,
        });
    }

    const advance = Number(pi.advancePaid ?? pi.advanceAmount ?? 0);
    if (advance > 0) {
        events.push({
            key: 'advance',
            label: `Advance received — ${pi.paymentMethod || 'Payment'}`,
            date: pi.updatedAt || pi.piDate || null,
            by: null,
            amount: advance,
        });
    }

    if (pi.status) {
        events.push({
            key: 'status',
            label: `Status: ${pi.status}`,
            date: pi.updatedAt || pi.createdAt || pi.piDate || null,
            by: null,
        });
    }

    return events
        .filter((e) => e.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
}
