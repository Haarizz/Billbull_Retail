import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Salesperson attribution must reach the backend from BOTH checkout payload builders.
 *
 * There are two in the POS codebase — the counter-sale builder in
 * POS/features/checkout/useCheckout.js, and the delivery-order builder inside POSSales.jsx. A
 * delivery order is a real invoice, so an attribution that only rides the first one would silently
 * drop every delivery sale into the Unassigned bucket.
 *
 * Asserted against the real source, in the same style as the POS architecture and
 * CheckoutPaymentRegions characterization suites: the payload objects are assembled deep inside
 * async handlers that these tests would otherwise have to stand a whole POS up to reach.
 */
const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');

const USE_CHECKOUT = read('../POS/features/checkout/useCheckout.js');
const POS_SALES = read('../POSSales.jsx');
const USE_SALESPERSON = read('../POS/features/sales/useSalesperson.js');

/**
 * Every `const payload = {` object literal in a file, sliced to its closing brace.
 *
 * A literal is closed by the first line that is only whitespace + `};` — the payloads are
 * brace-balanced object literals, so this is unambiguous.
 */
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

describe('builder 1 — counter sale (useCheckout.js)', () => {
  const payload = payloadContaining(USE_CHECKOUT, 'paymentAllocations,');

  it('sends both salesperson fields', () => {
    expect(payload).toContain('salespersonEmployeeId:');
    expect(payload).toContain('salespersonEmployeeCode:');
  });

  it('falls back to null rather than undefined when unassigned, so "cleared" is explicit', () => {
    expect(payload).toContain(
      'salespersonEmployeeId: salesperson?.salespersonPayload?.salespersonEmployeeId ?? null');
    expect(payload).toContain(
      'salespersonEmployeeCode: salesperson?.salespersonPayload?.salespersonEmployeeCode ?? null');
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

  it('takes the attribution as an optional input group, so the hook works without it', () => {
    expect(USE_CHECKOUT).toContain('salesperson,');
    // Optional chaining everywhere it is read — a caller that omits the group must not throw.
    expect(USE_CHECKOUT).not.toMatch(/[^?.]\bsalesperson\.salespersonPayload/);
    expect(USE_CHECKOUT).toContain('salesperson?.resetSalesperson?.()');
  });

  it('resets the attribution after a completed sale', () => {
    const resetAt = USE_CHECKOUT.indexOf('salesperson?.resetSalesperson?.()');
    const paidAt = USE_CHECKOUT.indexOf('setLastPaidInvoice(paid);');
    expect(resetAt).toBeGreaterThan(paidAt);
  });
});

describe('builder 2 — delivery order (POSSales.jsx)', () => {
  const payload = payloadContaining(POS_SALES, "paymentMode: 'Delivery'");

  it('carries the same attribution projection as the counter-sale builder', () => {
    expect(payload).toContain('...salespersonPayload');
  });

  it('still carries its own delivery-person fields — a separate concept', () => {
    expect(payload).toContain('deliveryPersonEmployeeCode:');
    expect(payload).toContain('driverName:');
  });

  it('leaves the rest of the delivery payload untouched', () => {
    for (const field of [
      'customerCode:', 'customerName:', 'sessionId:', 'terminalId:', 'branchId:',
      'billDiscountAmount:', 'taxInclusive:', 'shippingAddress:', 'deliveryDate,',
      'deliveryTimeSlot,', 'deliveryCharge:', 'items:',
    ]) {
      expect(payload, `delivery payload lost ${field}`).toContain(field);
    }
  });
});

describe('the projection both builders share', () => {
  // DELIBERATELY UPDATED in Phase 2: the projection now reads `effectiveSalesperson` rather than
  // `selectedSalesperson`. That indirection IS the feature — when POS verification is required,
  // effectiveSalesperson is the VERIFIED employee only, so a merely preselected default can never
  // reach a checkout payload. Both builders still read the one projection, which is what this pins.
  it('is built once in useSalesperson so the two cannot drift', () => {
    expect(USE_SALESPERSON).toContain('const salespersonPayload = useMemo(');
    expect(USE_SALESPERSON).toContain('salespersonEmployeeId: effectiveSalesperson ? effectiveSalesperson.id : null');
    expect(USE_SALESPERSON).toContain("salespersonEmployeeCode: effectiveSalesperson ? (effectiveSalesperson.employeeCode || null) : null");
  });

  it('attributes a sale to the VERIFIED employee and to nothing else', () => {
    // There is no preselection to promote and no roster to fall back on, and the feature switch
    // gates the whole projection — so turning POS salesperson off stops the two fields being
    // sent at all rather than leaving a stale id on the payload.
    expect(USE_SALESPERSON).toContain('salespersonRequired ? verifiedSalesperson : null');
    expect(USE_SALESPERSON).not.toContain('selectedSalesperson');
  });

  it('is owned by the hook, not by the POS orchestrator', () => {
    // POSSales destructures it; it declares no salesperson state of its own, which is what
    // keeps the POSSalesArchitecture shape counters unchanged.
    expect(POS_SALES).toContain('} = useSalesperson();');
    expect(POS_SALES).not.toMatch(/^ {2}const \[salesperson/m);
  });
});
