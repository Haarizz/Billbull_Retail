import { describe, expect, it } from 'vitest';
import { formatTrialRemaining, getTrialRemaining } from '../trialNotice';

const EXPIRES_AT = '2026-09-20T23:59:59+04:00';
const at = (iso) => new Date(iso).getTime();

describe('getTrialRemaining', () => {
  it('splits the remaining time into days, hours, minutes and seconds', () => {
    expect(getTrialRemaining(EXPIRES_AT, at('2026-09-18T09:27:41+04:00'))).toEqual({
      totalSeconds: 2 * 86400 + 14 * 3600 + 32 * 60 + 18,
      expired: false,
      days: 2,
      hours: 14,
      minutes: 32,
      seconds: 18,
    });
  });

  it('is timezone-correct regardless of how "now" is expressed', () => {
    const fromUtc = getTrialRemaining(EXPIRES_AT, at('2026-09-18T05:27:41Z'));
    expect(formatTrialRemaining(fromUtc)).toBe('2 Days 14 Hours 32 Minutes 18 Seconds');
  });

  it('rounds partial seconds up so it does not expire early', () => {
    const r = getTrialRemaining(EXPIRES_AT, at(EXPIRES_AT) - 400);
    expect(r).toMatchObject({ totalSeconds: 1, expired: false });
  });

  it.each([
    ['exactly at expiry', 0],
    ['one second after', 1000],
    ['a week after', 7 * 86400 * 1000],
  ])('is expired with zero (never negative) time %s', (_label, offsetMs) => {
    expect(getTrialRemaining(EXPIRES_AT, at(EXPIRES_AT) + offsetMs)).toEqual({
      totalSeconds: 0,
      expired: true,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  });

  it.each([null, undefined, '', 'not-a-date'])('returns null for %j', (value) => {
    expect(getTrialRemaining(value, Date.now())).toBeNull();
  });
});

describe('formatTrialRemaining', () => {
  it('uses plural and singular units', () => {
    expect(formatTrialRemaining({ days: 2, hours: 14, minutes: 32, seconds: 18 })).toBe('2 Days 14 Hours 32 Minutes 18 Seconds');
    expect(formatTrialRemaining({ days: 1, hours: 1, minutes: 1, seconds: 1 })).toBe('1 Day 1 Hour 1 Minute 1 Second');
    expect(formatTrialRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0 })).toBe('0 Days 0 Hours 0 Minutes 0 Seconds');
  });
});
