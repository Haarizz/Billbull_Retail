import { describe, it, expect } from 'vitest';
import { dayLabel, groupByDay, shortAgo, initials, avatarTint, resolveActionUrl, formatDetail } from '../notificationUi';

const now = new Date(2026, 10, 19, 12, 0, 0); // 19 Nov 2026, local time

describe('notificationUi', () => {
    it('labels days relative to now', () => {
        expect(dayLabel('2026-11-19T08:00:00', now)).toBe('Today');
        expect(dayLabel('2026-11-18T23:59:00', now)).toBe('Yesterday');
        expect(dayLabel(null, now)).toBe('Earlier');
    });

    it('groups a newest-first list by day without reordering', () => {
        const items = [
            { id: 1, t: new Date(2026, 10, 19, 11) },
            { id: 2, t: new Date(2026, 10, 19, 9) },
            { id: 3, t: new Date(2026, 10, 18, 9) },
        ];
        const groups = groupByDay(items, (i) => i.t);
        expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([[1, 2], [3]]);
    });

    it('short relative times', () => {
        expect(shortAgo(new Date(2026, 10, 19, 11, 59, 30), now)).toBe('just now');
        expect(shortAgo(new Date(2026, 10, 19, 11, 55), now)).toBe('5m ago');
        expect(shortAgo(new Date(2026, 10, 19, 9, 0), now)).toBe('3h ago');
        expect(shortAgo(new Date(2026, 10, 18, 9, 0), now)).toBe('Yesterday');
    });

    it('initials and stable avatar colours', () => {
        expect(initials('System Administrator')).toBe('SA');
        expect(initials('cashier1@test.com')).toBe('CA');
        expect(initials('')).toBe('?');
        expect(avatarTint('admin')).toBe(avatarTint('admin'));
    });

    it('repairs the legacy POS console link', () => {
        expect(resolveActionUrl('/sales/pos-console?tab=terminals')).toBe('/sales/pos');
        expect(resolveActionUrl('/sales/invoice')).toBe('/sales/invoice');
        expect(resolveActionUrl(null)).toBeNull();
    });

    it('formats detail values', () => {
        expect(formatDetail(12)).toBe((12).toLocaleString());
        expect(formatDetail('AED 10.00')).toBe('AED 10.00');
        expect(formatDetail(null)).toBe('');
    });
});
