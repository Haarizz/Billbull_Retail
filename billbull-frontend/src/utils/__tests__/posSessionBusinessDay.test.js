import { describe, it, expect } from 'vitest';
import {
  sessionBusinessDay,
  resolveSessionBusinessDate,
  isPreviousBusinessDaySession,
  isSessionUsableForSelling,
} from '../posSessionBusinessDay';
import { buildXReportViewModel } from '../posReportViewModel';

const CURRENT_DAY = '2026-08-11';

const session = (over = {}) => ({
  id: 67,
  status: 'OPEN',
  tradingDate: '2026-08-10',
  sessionDate: '2026-08-11', // legacy pointer already advanced — must never win
  ...over,
});

describe('sessionBusinessDay', () => {
  it('prefers the immutable tradingDate over the legacy sessionDate bucket', () => {
    expect(sessionBusinessDay(session())).toBe('2026-08-10');
  });

  it('falls back to sessionDate for pre-tradingDate sessions', () => {
    expect(sessionBusinessDay(session({ tradingDate: null }))).toBe('2026-08-11');
  });

  it('returns null rather than a date for an unknown session', () => {
    expect(sessionBusinessDay(null)).toBeNull();
  });
});

describe('resolveSessionBusinessDate (X-Report / Close Session header)', () => {
  it('shows the session\'s own Business Day when viewed on a later day', () => {
    const xReportData = { session: session(), sessionInfo: { businessDate: '2026-08-10' } };
    expect(resolveSessionBusinessDate(xReportData, null)).toBe('2026-08-10');
  });

  it('never substitutes today when the session date is available', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(resolveSessionBusinessDate({ session: session() }, null)).not.toBe(today);
  });

  it('uses the backend sessionInfo.businessDate when the session object is absent', () => {
    expect(resolveSessionBusinessDate({ sessionInfo: { businessDate: '2026-08-10' } }, null))
      .toBe('2026-08-10');
  });

  it('falls back to the loaded currentSession, then to null (never today)', () => {
    expect(resolveSessionBusinessDate(null, session())).toBe('2026-08-10');
    expect(resolveSessionBusinessDate(null, null)).toBeNull();
  });
});

describe('X-Report view model business date', () => {
  it('renders the session Business Day, not the current one', () => {
    const vm = buildXReportViewModel({ session: session(), summary: {} }, {});
    const row = vm.reportMeta.find(m => m.label === 'Business Date');
    expect(row.value).toBe('2026-08-10');
    expect(vm.note).toContain('2026-08-10');
  });
});

describe('isPreviousBusinessDaySession', () => {
  it('flags an OPEN session from an earlier Business Day', () => {
    expect(isPreviousBusinessDaySession(session(), CURRENT_DAY)).toBe(true);
  });

  it('flags a SUSPENDED session from an earlier Business Day', () => {
    expect(isPreviousBusinessDaySession(session({ status: 'SUSPENDED' }), CURRENT_DAY)).toBe(true);
  });

  it('does not flag a session on the current Business Day', () => {
    expect(isPreviousBusinessDaySession(
      session({ tradingDate: CURRENT_DAY }), CURRENT_DAY)).toBe(false);
  });

  it('does not flag a CLOSED previous-day session (closure/reporting stays open)', () => {
    expect(isPreviousBusinessDaySession(session({ status: 'CLOSED' }), CURRENT_DAY)).toBe(false);
  });

  it('does not flag anything when the current Business Day is unknown', () => {
    expect(isPreviousBusinessDaySession(session(), null)).toBe(false);
  });
});

describe('isSessionUsableForSelling', () => {
  it('refuses a previous-day OPEN session', () => {
    expect(isSessionUsableForSelling(session(), { currentBusinessDay: CURRENT_DAY })).toBe(false);
  });

  it('refuses a previous-day SUSPENDED session', () => {
    expect(isSessionUsableForSelling(
      session({ status: 'SUSPENDED' }), { currentBusinessDay: CURRENT_DAY })).toBe(false);
  });

  it('keeps refusing a session the backend already blocked, even without a resolved day', () => {
    // The "Go to Close Session" path loads the stale session by id for its closure
    // workflow; that must not make it sellable again.
    expect(isSessionUsableForSelling(session(), { blockedSessionId: 67 })).toBe(false);
    expect(isSessionUsableForSelling(session(), { blockedSessionId: '67' })).toBe(false);
  });

  it('allows a current-day OPEN session to continue normally', () => {
    expect(isSessionUsableForSelling(
      session({ tradingDate: CURRENT_DAY, sessionDate: CURRENT_DAY }),
      { currentBusinessDay: CURRENT_DAY })).toBe(true);
  });

  it('does not treat an unrelated blocked id as blocking the live session', () => {
    expect(isSessionUsableForSelling(
      session({ id: 68, tradingDate: CURRENT_DAY, sessionDate: CURRENT_DAY }),
      { currentBusinessDay: CURRENT_DAY, blockedSessionId: 67 })).toBe(true);
  });

  it('is never usable for a CLOSED session (it is a reporting/closure artifact)', () => {
    expect(isSessionUsableForSelling(
      session({ status: 'CLOSED' }), { currentBusinessDay: CURRENT_DAY })).toBe(false);
  });

  it('refuses when there is no session at all', () => {
    expect(isSessionUsableForSelling(null, { currentBusinessDay: CURRENT_DAY })).toBe(false);
  });
});
