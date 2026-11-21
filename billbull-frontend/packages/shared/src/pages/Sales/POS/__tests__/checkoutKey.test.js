import { describe, expect, it } from 'vitest';
import {
  classifyCheckoutFailure, credentialsOf, newCheckoutKey, payloadHash, saleOf, sha256Hex, stableStringify,
} from '../features/checkout/checkoutKey';

const networkError = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
const timeout = Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' });
const answer = (status, data) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

describe('newCheckoutKey', () => {
  it('is unique per call and fits sales_invoices.pos_checkout_key', () => {
    const a = newCheckoutKey();
    expect(a).not.toBe(newCheckoutKey());
    expect(a.length).toBeLessThanOrEqual(100);
  });
});

describe('the sale a key is bound to', () => {
  it('drops the key and the supervisor credentials, and nothing else', () => {
    const sale = saleOf({
      checkoutKey: 'k', supervisorOverridePin: '1', supervisorOverrideEmail: 'e', supervisorOverridePassword: 'p',
      customerCode: 'C', items: [{ itemCode: 'A', quantity: 1, batch: undefined }], notes: undefined,
    });
    expect(sale).toEqual({ customerCode: 'C', items: [{ itemCode: 'A', quantity: 1 }] });
  });

  it('keeps only the credentials actually present', () => {
    expect(credentialsOf({ supervisorOverridePin: '1234', supervisorOverrideEmail: undefined, x: 1 })).toEqual({ supervisorOverridePin: '1234' });
  });

  it('hashes equal sales equally whatever the key order, and different sales differently', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [1, { f: 1, e: 2 }] } })).toBe('{"a":{"c":[1,{"e":2,"f":1}],"d":2},"b":1}');
    expect(payloadHash({ a: 1, b: 2 })).toBe(payloadHash({ b: 2, a: 1 }));
    expect(payloadHash({ a: 1, b: 2 })).not.toBe(payloadHash({ a: 1, b: 3 }));
  });

  it('sha256Hex matches the standard test vectors (no crypto.subtle needed)', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(sha256Hex('Fatima — فاطمة')).toHaveLength(64);
  });
});

describe('classifyCheckoutFailure', () => {
  it.each([
    ['no response at all', undefined],
    ['a network error', networkError],
    ['an HTTP client timeout', timeout],
    ['408', answer(408, '')],
    ['502', answer(502, '<html>Bad Gateway</html>')],
    ['503', answer(503, '')],
    ['504', answer(504, '')],
    ['500', answer(500, { message: 'boom' })],
    ['409 CHECKOUT_IN_PROGRESS', answer(409, { code: 'CHECKOUT_IN_PROGRESS' })],
    ['409 CHECKOUT_STALLED', answer(409, { code: 'CHECKOUT_STALLED' })],
    ['409 CHECKOUT_ATTEMPT_SUPERSEDED', answer(409, { code: 'CHECKOUT_ATTEMPT_SUPERSEDED' })],
    ['409 CHECKOUT_ATTEMPT_INCONSISTENT', answer(409, { message: 'CHECKOUT_ATTEMPT_INCONSISTENT: attempt x is COMPLETED' })],
  ])('%s is uncertain: the operation must be kept', (_l, err) => {
    expect(classifyCheckoutFailure(err)).toBe('uncertain');
  });

  it('CHECKOUT_KEY_REUSED is a conflict, never a quiet refusal (although its body says recorded:false)', () => {
    expect(classifyCheckoutFailure(answer(409, { code: 'CHECKOUT_KEY_REUSED', recorded: false, invoiceNumber: 'INV-1' }))).toBe('keyConflict');
  });

  it.each([
    ['409 CHECKOUT_KEY_REQUIRED', answer(409, { code: 'CHECKOUT_KEY_REQUIRED', recorded: false })],
    ['409 SESSION_NOT_OPEN (guard body)', answer(409, { code: 'SESSION_NOT_OPEN', recorded: false })],
    ['409 SESSION_BUSY', answer(409, { code: 'SESSION_BUSY', recorded: false })],
    ['401', answer(401, '')],
    ['423 Business Day closed', answer(423, { code: 'BUSINESS_DAY_CLOSED' })],
    ['409 target readiness', answer(409, { ready: false, missing: [{ employeeCode: 'E1' }] })],
    ['403 price override', answer(403, { message: 'Line below minimum. Supervisor override required (pos_price_override).' })],
  ])('%s is a proven pre-write refusal', (_l, err) => {
    expect(classifyCheckoutFailure(err)).toBe('refused');
  });

  it.each([
    ['400 validation (may follow a compensated write)', answer(400, { message: 'Customer is required' })],
    ['409 close workflow (also raised after the invoice is saved)', answer(409, { message: 'SESSION_CLOSING_WORKFLOW: X-Report issued' })],
    ['403 without the price-override marker', answer(403, { message: 'Forbidden' })],
    ['a 409 with no body', answer(409, '')],
  ])('%s is unverified: it is checked with the lookup before release', (_l, err) => {
    expect(classifyCheckoutFailure(err)).toBe('unverified');
  });
});
