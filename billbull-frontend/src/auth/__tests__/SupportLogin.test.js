import { describe, expect, it } from 'vitest';
import { readSupportFragment } from '../supportFragment';

// Unsigned test tokens: readSupportFragment only reads claims (the backend verifies the signature).
const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const token = (claims) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.sig`;
const future = Math.floor(Date.now() / 1000) + 600;

describe('readSupportFragment', () => {
  it('accepts a support token from the fragment', () => {
    const t = token({ sub: 'platform.support', sst: 12, roles: ['ADMIN'], exp: future });
    const r = readSupportFragment(`#token=${encodeURIComponent(t)}&expires=2026-11-22T10:00:00Z`);
    expect(r.claims.sst).toBe(12);
    expect(r.expires).toBe('2026-11-22T10:00:00Z');
  });

  it('refuses ordinary sign-in tokens, expired tokens and junk', () => {
    expect(readSupportFragment(`#token=${token({ sub: 'admin', exp: future })}`)).toBeNull();
    expect(readSupportFragment(`#token=${token({ sub: 'platform.support', sst: 1, exp: 1 })}`)).toBeNull();
    expect(readSupportFragment('#token=not-a-jwt')).toBeNull();
    expect(readSupportFragment('')).toBeNull();
  });
});
