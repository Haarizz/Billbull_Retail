import { formatDisplayDate } from '../../../utils/dateUtils';

// Builds a fulfillment timeline for a delivery note from data already on the
// fetched entity — created → dispatched → delivered (with receiver), plus any
// audit dates the entity carries. No fabricated events.
export function buildDeliveryNoteTimeline(dn) {
    if (!dn) return [];
    const events = [];

    if (dn.createdAt || dn.dnDate || dn.date) {
        events.push({
            key: 'created',
            label: 'Delivery Note Created',
            date: dn.createdAt || dn.dnDate || dn.date,
            by: dn.createdBy || null,
        });
    }

    const s = String(dn.status || '').toUpperCase();

    if (dn.dispatchedDate || s === 'DISPATCHED' || s === 'DELIVERED') {
        events.push({
            key: 'dispatched',
            label: 'Dispatched',
            date: dn.dispatchedDate || dn.updatedAt || null,
            by: dn.driverName ? `Driver: ${dn.driverName}` : null,
        });
    }

    if (dn.receivedDate || s === 'DELIVERED') {
        events.push({
            key: 'delivered',
            label: 'Delivered' + (dn.receivedBy ? ` — received by ${dn.receivedBy}` : ''),
            date: dn.receivedDate || dn.updatedAt || null,
            by: null,
        });
    }

    if (s === 'CANCELLED') {
        events.push({
            key: 'cancelled',
            label: 'Cancelled',
            date: dn.updatedAt || dn.cancelledDate || null,
            by: dn.updatedBy || null,
        });
    }

    return events
        .filter((e) => e.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        // formatDisplayDate is applied by the renderer; keep raw dates here.
        .map((e) => ({ ...e, _display: formatDisplayDate(e.date) }));
}
