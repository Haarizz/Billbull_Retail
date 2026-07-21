// Builds a small, honest timeline for a quotation from data already on the
// fetched entity + its revision history — no fabricated audit trail. Mirrors
// buildInvoiceTimeline / buildSalesOrderTimeline, but the payment events are
// replaced by revision events (a quotation carries revisions, not payments).
export function buildQuotationTimeline(qtn, revisions = []) {
    if (!qtn) return [];
    const events = [];

    if (qtn.createdAt || qtn.date) {
        events.push({
            key: 'created',
            label: 'Quotation Created',
            date: qtn.createdAt || qtn.date,
            by: qtn.createdBy || null,
        });
    }

    if (qtn.updatedAt && qtn.updatedAt !== qtn.createdAt) {
        events.push({
            key: 'updated',
            label: 'Quotation Updated',
            date: qtn.updatedAt,
            by: qtn.updatedBy || null,
        });
    }

    (revisions || []).forEach((r) => {
        events.push({
            key: `rev-${r.revId ?? r.id ?? r.revNumber}`,
            label: `Revision ${r.revNumber ?? r.revisionNumber ?? ''}`.trim() + (r.note || r.followUpNote ? ` — ${r.note || r.followUpNote}` : ''),
            date: r.date || r.revisionDate,
            by: r.createdBy || null,
            amount: r.total ?? r.totalAmountSnapshot,
        });
    });

    if (qtn.status) {
        events.push({
            key: 'status',
            label: `Status: ${qtn.status}`,
            date: qtn.updatedAt || qtn.createdAt || qtn.date || null,
            by: null,
        });
    }

    return events
        .filter((e) => e.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
}
