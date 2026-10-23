// Builds a small, honest timeline strictly from data already available on
// the fetched invoice + its payment history — no fabricated audit trail.
// auditEvents defaults to empty and is merged into the same sorted output,
// so wiring a real audit API later (if one is ever built) is passing a new
// array here, not restructuring this function or its callers.
export function buildInvoiceTimeline(invoice, payments = [], auditEvents = []) {
    if (!invoice) return [];
    const events = [];

    if (invoice.createdAt) {
        events.push({
            key: 'created',
            label: 'Invoice Created',
            date: invoice.createdAt,
            by: invoice.createdBy || null,
        });
    }

    if (invoice.updatedAt && invoice.updatedAt !== invoice.createdAt) {
        events.push({
            key: 'updated',
            label: 'Invoice Updated',
            date: invoice.updatedAt,
            by: invoice.updatedBy || null,
        });
    }

    if (invoice.status) {
        events.push({
            key: 'status',
            label: `Status: ${invoice.status}`,
            date: invoice.updatedAt || invoice.createdAt || null,
            by: null,
        });
    }

    (payments || []).forEach((p) => {
        events.push({
            key: `payment-${p.key || p.dbId}`,
            label: `Payment received — ${p.mode || 'Payment'}`,
            date: p.date,
            by: p.receivedBy || null,
            amount: p.amount,
        });
    });

    (auditEvents || []).forEach((e) => events.push(e));

    // Newest first. Payment dates are date-only (no time recorded), so they sort as the
    // end of their day — otherwise a same-day payment lands below the invoice it paid.
    return events
        .filter((e) => e.date)
        .sort((a, b) => sortTime(b.date) - sortTime(a.date));
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function sortTime(date) {
    if (typeof date === 'string' && DATE_ONLY.test(date)) {
        return new Date(`${date}T23:59:59.999`).getTime();
    }
    return new Date(date).getTime();
}
