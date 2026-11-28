import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, dailySeries, filtersToParams, shownMessage, sourceLabel } from '../pages/errors/errorLogic';
import { filterRules } from '../pages/ErrorGuidePage';

describe('error log filters', () => {
  it('drops blanks and keeps the defaults', () => {
    expect(filtersToParams(DEFAULT_FILTERS)).toEqual({
      status: 'OPEN,ACKNOWLEDGED', sinceHours: 168, includeBusinessRules: false, sort: 'recent', page: 0,
    });
  });

  it('maps the client picker to tenantId, and a fixed client wins', () => {
    expect(filtersToParams({ tenantFilter: '7', q: '  stock ' })).toMatchObject({ tenantId: 7, q: 'stock' });
    expect(filtersToParams({ tenantFilter: '7' }, 3).tenantId).toBe(3);
    expect(filtersToParams({ tenantFilter: '' })).not.toHaveProperty('tenantFilter');
  });
});

describe('daily occurrence strip', () => {
  it('zero-fills every day, oldest first', () => {
    const s = dailySeries([{ day: '2026-11-27', n: 4 }], 3, new Date('2026-11-28T10:00:00Z'));
    expect(s).toEqual([
      { day: '2026-11-26', n: 0 },
      { day: '2026-11-27', n: 4 },
      { day: '2026-11-28', n: 0 },
    ]);
  });
});

describe('labels', () => {
  it('prefers the root cause message', () => {
    expect(shownMessage({ message: 'could not execute statement', rootCauseMessage: 'duplicate key' })).toBe('duplicate key');
    expect(shownMessage({ message: 'x' })).toBe('x');
    expect(sourceLabel('JOB')).toBe('Background job');
  });

  it('searches the guide across causes and actions', () => {
    const rules = [
      { code: 'A', title: 'Printer', likelyCauses: ['paper out'], recommendedActions: [] },
      { code: 'B', title: 'Stock', likelyCauses: [], recommendedActions: ['post the GRN'] },
    ];
    expect(filterRules(rules, 'grn').map((r) => r.code)).toEqual(['B']);
    expect(filterRules(rules, '').length).toBe(2);
  });
});
