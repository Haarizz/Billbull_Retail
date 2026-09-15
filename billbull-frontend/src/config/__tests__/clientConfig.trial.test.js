import { describe, expect, it } from 'vitest';
import { resolveClientConfig } from '../clientConfig';

describe('clientConfig free trial', () => {
  it.each(['royaltools.billbull.app', 'leroyalflowers.billbull.app', 'leroyalgifts.billbull.app'])(
    '%s is on a free trial ending Sunday 20 Sep 2026 23:59:59 Asia/Dubai',
    (hostname) => {
      const { trial } = resolveClientConfig(hostname);
      expect(trial.expiresAt).toBe('2026-09-20T23:59:59+04:00');
      expect(new Date(trial.expiresAt).toISOString()).toBe('2026-09-20T19:59:59.000Z');
    },
  );

  it.each(['demo.billbull.app', 'geebu.billbull.app', 'hilite.billbull.app', 'royaltools.example.com', 'localhost', ''])(
    '%j is not on a free trial',
    (hostname) => {
      expect(resolveClientConfig(hostname).trial).toEqual({ expiresAt: null });
    },
  );

  it('keeps the existing per-client overrides for trial clients', () => {
    const config = resolveClientConfig('royaltools.billbull.app');
    expect(config.landing.defaultRoute).toBe('/sales/pos');
    expect(config.sidebar.defaultCollapsed).toBe(true);
    expect(config.posFirstMode).toBe(true);
  });
});
