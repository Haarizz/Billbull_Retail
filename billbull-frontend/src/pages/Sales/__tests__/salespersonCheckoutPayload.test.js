import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Salesperson attribution must reach the backend from BOTH checkout payload builders in
 * POSSales.jsx — the counter sale (processPayment) and the delivery order. A delivery order is a
 * real invoice, so an attribution that only rides the first one would silently drop every
 * delivery sale into the Unassigned bucket.
 *
 * Asserted against the real source: the payload objects are assembled deep inside async handlers
 * that these tests would otherwise have to stand a whole POS up to reach.
 */
const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');

const POS_SALES = read('../POSSales.jsx');
const USE_SALESPERSON = read('../POS/features/sales/useSalesperson.js');

/** Every `const payload = {` object literal in a file, sliced to its closing brace. */
const payloadBlocks = (src) => {
  const blocks = [];
  let from = 0;
  for (;;) {
    const start = src.indexOf('const payload = {', from);
    if (start === -1) break;
    const end = src.slice(start).search(/\n\s*\};/);
    expect(end, 'unterminated payload literal').toBeGreaterThan(-1);
    blocks.push(src.slice(start, start + end));
    from = start + end;
  }
  return blocks;
};

/** The single payload literal containing `marker`. */
const payloadContaining = (src, marker) => {
  const matches = payloadBlocks(src).filter(b => b.includes(marker));
  expect(matches, `expected exactly one payload containing ${marker}`).toHaveLength(1);
  return matches[0];
};

describe('builder 1 — counter sale (processPayment)', () => {
  const payload = payloadContaining(POS_SALES, 'paymentAllocations,');

  it('sends both salesperson fields, null rather than undefined when unassigned', () => {
    expect(payload).toContain(
      'salespersonEmployeeId: salespersonPayload?.salespersonEmployeeId ?? null');
    expect(payload).toContain(
      'salespersonEmployeeCode: salespersonPayload?.salespersonEmployeeCode ?? null');
  });

  it('never sends a salesperson NAME — identity is resolved server-side from id/code', () => {
    expect(payload).not.toMatch(/salespersonName\s*:/);
  });

  it('leaves every pre-existing payload field in place', () => {
    for (const field of [
      'customerCode:', 'customerName:', 'paymentMode,', 'combinedPaymentMode,',
      'paymentAllocations,', 'sessionId:', 'terminalId:', 'counterName:',
      'branchId:', 'branchName:', 'branchCode:', 'billDiscountAmount:',
      'shippingAddress:', 'shippingCharge:', 'taxInclusive:', 'driverName:',
      'deliveryNotes:', 'items,',
      'supervisorOverridePin:', 'supervisorOverrideEmail:', 'supervisorOverridePassword:',
    ]) {
      expect(payload, `payload lost ${field}`).toContain(field);
    }
  });

  it('resets the attribution after a completed sale', () => {
    const paidAt = POS_SALES.indexOf('setLastPaidInvoice(paid);');
    const resetAt = POS_SALES.indexOf('resetSalesperson();', paidAt);
    expect(paidAt).toBeGreaterThan(-1);
    expect(resetAt).toBeGreaterThan(paidAt);
  });
});

describe('builder 2 — delivery order', () => {
  const payload = payloadContaining(POS_SALES, "paymentMode: 'Delivery'");

  it('carries the same attribution projection as the counter-sale builder', () => {
    expect(payload).toContain('...salespersonPayload');
  });

  it('still carries its own delivery-person fields — a separate concept', () => {
    expect(payload).toContain('deliveryPersonEmployeeCode:');
    expect(payload).toContain('driverName:');
  });
});

describe('the projection both builders share', () => {
  it('is built once in useSalesperson so the two cannot drift', () => {
    expect(USE_SALESPERSON).toContain('const salespersonPayload = useMemo(');
    expect(USE_SALESPERSON).toContain('salespersonEmployeeId: selectedSalesperson ? selectedSalesperson.id : null');
    expect(USE_SALESPERSON).toContain("salespersonEmployeeCode: selectedSalesperson ? (selectedSalesperson.employeeCode || null) : null");
  });

  it('is declared before any callback that lists it as a dependency', () => {
    const hookAt = POS_SALES.indexOf('} = useSalesperson();');
    const depAt = POS_SALES.indexOf('salespersonPayload]);');
    expect(hookAt).toBeGreaterThan(-1);
    expect(depAt).toBeGreaterThan(hookAt);
  });
});
