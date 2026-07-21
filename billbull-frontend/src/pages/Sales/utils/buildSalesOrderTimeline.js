// Builds a small, honest timeline strictly from data already available on the
// fetched sales order + its advance-receipt history — no fabricated audit trail.
// Mirrors buildInvoiceTimeline.js.
export function buildSalesOrderTimeline(order, receipts = []) {
    if (!order) return [];
    const events = [];

    if (order.createdAt) {
        events.push({
            key: 'created',
            label: 'Sales Order Created',
            date: order.createdAt,
            by: order.createdBy || null,
        });
    }

    if (order.updatedAt && order.updatedAt !== order.createdAt) {
        events.push({
            key: 'updated',
            label: 'Sales Order Updated',
            date: order.updatedAt,
            by: order.updatedBy || null,
        });
    }

    if (order.status) {
        events.push({
            key: 'status',
            label: `Status: ${order.status}`,
            date: order.updatedAt || order.createdAt || null,
            by: null,
        });
    }

    (receipts || []).forEach((r) => {
        events.push({
            key: `receipt-${r.key || r.dbId}`,
            label: `Advance received — ${r.mode || 'Payment'}`,
            date: r.date,
            by: r.receivedBy || null,
            amount: r.amount,
        });
    });

    return events
        .filter((e) => e.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
}
