import { formatDisplayDate } from '../../../utils/dateUtils';

// Builds a Purchase Invoice timeline from data already on the fetched entity:
// creation, submission, posting, and each vendor payment. No fabricated events.
export function buildPurchaseInvoiceTimeline(inv, payments = []) {
    if (!inv) return [];
    const events = [];
    const s = String(inv.status || '').toUpperCase().replace(/\s+/g, '_');

    if (inv.createdAt || inv.invoiceDate) {
        events.push({ key: 'created', label: 'Invoice Created', date: inv.createdAt || inv.invoiceDate, by: inv.createdBy || inv.submittedBy || null });
    }

    if (inv.submittedAt || s === 'PENDING_APPROVAL' || s === 'POSTED') {
        events.push({ key: 'submitted', label: 'Submitted for Approval', date: inv.submittedAt || null, by: inv.submittedBy || null });
    }

    if (inv.postedAt || s === 'POSTED') {
        events.push({ key: 'posted', label: 'Posted to Ledger', date: inv.postedAt || inv.updatedAt || null, by: inv.approvedBy || null });
    }

    (payments || []).forEach((p) => {
        events.push({
            key: `pay-${p.key || p.dbId}`,
            label: `Payment made — ${p.mode || 'Payment'}`,
            date: p.date,
            by: p.receivedBy || null,
            amount: p.amount,
        });
    });

    return events
        .filter((e) => e.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map((e) => ({ ...e, _display: formatDisplayDate(e.date) }));
}
