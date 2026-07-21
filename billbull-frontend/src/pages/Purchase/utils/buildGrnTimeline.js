import { formatDisplayDate } from '../../../utils/dateUtils';

// Builds a GRN receipt/QC timeline from data already on the fetched entity:
// created → QC submitted → QC completed → posted. No fabricated events.
export function buildGrnTimeline(grn) {
    if (!grn) return [];
    const events = [];
    const s = String(grn.status || '').toUpperCase();

    if (grn.createdAt || grn.date || grn.grnDate) {
        events.push({ key: 'created', label: 'GRN Created', date: grn.createdAt || grn.date || grn.grnDate, by: grn.createdBy || null });
    }

    if (grn.qcSubmittedAt || ['QC_PENDING', 'QC_COMPLETED', 'POSTED'].includes(s)) {
        events.push({ key: 'qc-submitted', label: 'Submitted for QC', date: grn.qcSubmittedAt || null, by: grn.qcSubmittedBy || null });
    }

    if (grn.qcCompletedAt || ['QC_COMPLETED', 'POSTED'].includes(s)) {
        events.push({ key: 'qc-completed', label: 'QC Completed', date: grn.qcCompletedAt || null, by: grn.qcApprovedBy || null });
    }

    if (grn.postedAt || s === 'POSTED') {
        events.push({ key: 'posted', label: 'Posted to Stock', date: grn.postedAt || grn.updatedAt || null, by: grn.postedBy || null });
    }

    if (s === 'REVERSED') {
        events.push({ key: 'reversed', label: 'Reversed', date: grn.updatedAt || null, by: grn.updatedBy || null });
    }

    return events
        .filter((e) => e.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map((e) => ({ ...e, _display: formatDisplayDate(e.date) }));
}
