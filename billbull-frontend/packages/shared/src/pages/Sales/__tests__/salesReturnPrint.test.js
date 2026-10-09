import { describe, expect, it } from 'vitest';

import {
  buildSalesReturnReceiptBody,
  buildCreditVoucherBody,
  refundMethodLabel,
  voucherStatusLabel,
} from '../../../utils/salesReturnPrint';

/**
 * Sales Return receipt and Credit Voucher print content.
 *
 * The rule these protect: the print layer reports persisted state and never derives it. A
 * receipt that recomputes a total, or a voucher reprint that assumes the face value is still
 * available, tells the customer something the ledger disagrees with.
 */

const RETURN = {
  id: 12,
  returnNumber: 'SR-2026-0012',
  returnDate: '2026-08-14',
  linkedInvoice: 'INV-2026-0164',
  linkedReceiptNumber: 'RCP-0044',
  customerName: 'Ahmed Al Mansouri',
  customerMobile: '+971500000000',
  posTerminalId: 'T002-95F6',
  subTotal: 100.0,
  taxAmount: 4.76,
  totalAmount: 100.0,
  taxInclusive: true,
  refundMethod: 'CASH_REFUND',
  items: [{
    itemCode: '09380',
    itemName: 'Premium Beef Mince 1kg',
    returnQty: 1,
    price: 100.0,
    discountAmount: 0,
    taxAmount: 4.76,
    condition: 'GOOD',
  }],
};

const VOUCHER = {
  id: 1,
  voucherNumber: 'CV-2026-000001',
  voucherCode: 'EDZH-PBCR-8C65',
  barcodeValue: 'EDZHPBCR8C65',
  originalAmount: 100.0,
  usedAmount: 0,
  remainingAmount: 100.0,
  issueDate: '2026-08-14',
  expiryDate: '2027-08-14',
  status: 'ACTIVE',
  customerName: 'Ahmed Al Mansouri',
  sourceInvoiceNumber: 'INV-2026-0166',
  sourceReturnNumber: 'SR-2026-0014',
};

describe('customer-facing labels', () => {
  it('never prints internal enum names', () => {
    expect(refundMethodLabel('CASH_REFUND')).toBe('Cash Refund');
    expect(refundMethodLabel('CREDIT_VOUCHER')).toBe('Credit Voucher');
    expect(refundMethodLabel('CUSTOMER_CREDIT')).toBe('Customer Credit');
    expect(voucherStatusLabel('PARTIALLY_REDEEMED')).toBe('Partially Redeemed');
    expect(voucherStatusLabel('FULLY_REDEEMED')).toBe('Fully Redeemed');
  });

  it('degrades readably on an unknown value rather than printing raw underscores', () => {
    expect(refundMethodLabel('SOME_NEW_METHOD')).toBe('SOME NEW METHOD');
    expect(refundMethodLabel(null)).toBe('—');
  });
});

describe('sales return receipt', () => {
  it('prints the persisted totals verbatim', () => {
    const body = buildSalesReturnReceiptBody(RETURN, { paperSize: '80mm' });

    expect(body).toContain('SR-2026-0012');
    expect(body).toContain('INV-2026-0164');
    expect(body).toContain('Premium Beef Mince 1kg');
    expect(body).toContain('100.00');
    expect(body).toContain('4.76');
    expect(body).toContain('Cash Refund');
    // The enum must never reach paper.
    expect(body).not.toContain('CASH_REFUND');
  });

  it('labels VAT as included when the original invoice was VAT-inclusive', () => {
    expect(buildSalesReturnReceiptBody(RETURN, {})).toContain('VAT Reversal (incl.)');
    expect(buildSalesReturnReceiptBody({ ...RETURN, taxInclusive: false }, {}))
      .toContain('VAT Reversal');
  });

  it('marks a reprint so a duplicate is never mistaken for a second refund', () => {
    expect(buildSalesReturnReceiptBody(RETURN, { isReprint: true })).toContain('REPRINT');
    expect(buildSalesReturnReceiptBody(RETURN, { isReprint: false })).not.toContain('REPRINT');
  });

  it('names the voucher on a voucher-settled return', () => {
    const body = buildSalesReturnReceiptBody(
      { ...RETURN, refundMethod: 'CREDIT_VOUCHER' }, { voucher: VOUCHER },
    );
    expect(body).toContain('CV-2026-000001');
    expect(body).toContain('EDZH-PBCR-8C65');
    expect(body).toContain('2027-08-14');
  });

  it('fits the narrower 58mm width', () => {
    const body = buildSalesReturnReceiptBody(RETURN, { paperSize: '58mm' });
    body.split('\n').forEach((line) => expect(line.length).toBeLessThanOrEqual(32));
  });

  it('refuses to print an unsaved return', async () => {
    const { printSalesReturnReceipt } = await import('../../../utils/salesReturnPrint');
    await expect(printSalesReturnReceipt({}, {})).rejects.toThrow(/not been saved/i);
  });
});

describe('credit voucher print', () => {
  it('prints the persisted identifiers, balance and expiry', () => {
    const body = buildCreditVoucherBody(VOUCHER, { paperSize: '80mm' });

    expect(body).toContain('CV-2026-000001');
    expect(body).toContain('EDZH-PBCR-8C65');
    expect(body).toContain('2027-08-14');
    expect(body).toContain('Active');
    expect(body).toContain('SR-2026-0014');
  });

  it('a reprint after partial redemption shows the CURRENT balance, not the face value', () => {
    const partiallySpent = {
      ...VOUCHER, usedAmount: 40, remainingAmount: 60, status: 'PARTIALLY_REDEEMED',
    };
    const body = buildCreditVoucherBody(partiallySpent, { isReprint: true });

    // Both figures appear, and they are distinguishable — this is the whole point of the
    // reprint: the customer must not read 100.00 as still spendable.
    expect(body).toMatch(/Original Value\s+100\.00/);
    expect(body).toMatch(/CURRENT BALANCE\s+60\.00/);
    expect(body).toMatch(/Redeemed\s+40\.00/);
    expect(body).toContain('Partially Redeemed');
    expect(body).toContain('REPRINT');
  });

  it('a fully redeemed voucher prints a zero balance', () => {
    const spent = {
      ...VOUCHER, usedAmount: 100, remainingAmount: 0, status: 'FULLY_REDEEMED',
    };
    const body = buildCreditVoucherBody(spent, {});
    expect(body).toMatch(/CURRENT BALANCE\s+0\.00/);
    expect(body).toContain('Fully Redeemed');
  });

  it('states "No expiry" rather than a blank when the voucher never expires', () => {
    expect(buildCreditVoucherBody({ ...VOUCHER, expiryDate: null }, {})).toContain('No expiry');
  });

  it('carries terms, and honours configured terms over the default', () => {
    expect(buildCreditVoucherBody(VOUCHER, {})).toContain('Not redeemable for cash.');
    expect(buildCreditVoucherBody(VOUCHER, { terms: ['Branch A only.'] }))
      .toContain('Branch A only.');
  });

  it('fits the narrower 58mm width', () => {
    const body = buildCreditVoucherBody(VOUCHER, { paperSize: '58mm' });
    body.split('\n').forEach((line) => expect(line.length).toBeLessThanOrEqual(32));
  });

  it('refuses to print a voucher with no persisted code', async () => {
    const { printCreditVoucher } = await import('../../../utils/salesReturnPrint');
    await expect(printCreditVoucher({ voucherNumber: 'CV-1' }, {})).rejects.toThrow(/persisted code/i);
  });
});
