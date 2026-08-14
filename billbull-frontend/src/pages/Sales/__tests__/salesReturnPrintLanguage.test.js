import { describe, expect, it } from 'vitest';

import {
  PRINT_LANGUAGE,
  label,
  refundMethodLabel,
  voucherStatusLabel,
  voucherTerms,
  buildSalesReturnReceiptBody,
  buildCreditVoucherBody,
} from '../../../utils/salesReturnPrint';
import { RECEIPT_LABELS } from '../../../utils/receiptLabels';

/**
 * English / Arabic / bilingual output for Sales Return and Credit Voucher.
 *
 * Two rules these protect:
 *   1. Wording comes from the shared RECEIPT_LABELS dictionary — the same one the bilingual
 *      invoice renderer uses. A second translation table would drift.
 *   2. Arabic is only emitted where the document can actually carry it. These thermal
 *      printers have no Arabic code page, so Arabic reaches paper as raster or not at all;
 *      the native-text path degrades to English rather than printing mojibake.
 */

const RASTER = { rasterCapable: true };
const AR = /[؀-ۿ]/;

const VOUCHER = {
  voucherNumber: 'CV-2026-000001',
  voucherCode: 'EDZH-PBCR-8C65',
  barcodeValue: 'EDZHPBCR8C65',
  originalAmount: 100, usedAmount: 40, remainingAmount: 60,
  issueDate: '2026-08-14', expiryDate: '2027-08-14',
  status: 'PARTIALLY_REDEEMED',
  customerName: 'Ahmed Al Mansouri',
  sourceInvoiceNumber: 'INV-2026-0166',
  sourceReturnNumber: 'SR-2026-0014',
};

const RETURN = {
  returnNumber: 'SR-2026-0015',
  returnDate: '2026-08-14',
  linkedInvoice: 'INV-2026-04812',
  subTotal: 100, taxAmount: 4.76, totalAmount: 100,
  taxInclusive: true,
  refundMethod: 'CASH_REFUND',
  items: [{ itemCode: 'X1', itemName: 'Test Item', returnQty: 1, price: 100 }],
};

describe('label resolution', () => {
  it('reads from the shared dictionary rather than a private table', () => {
    expect(label('SALES_RETURN', PRINT_LANGUAGE.EN)).toBe(RECEIPT_LABELS.SALES_RETURN.en);
    expect(label('SALES_RETURN', PRINT_LANGUAGE.AR, RASTER)).toBe(RECEIPT_LABELS.SALES_RETURN.ar);
  });

  it('pairs English and Arabic on one line in bilingual mode', () => {
    expect(label('RETURN_NO', PRINT_LANGUAGE.BILINGUAL, RASTER))
      .toBe(`${RECEIPT_LABELS.RETURN_NO.en} / ${RECEIPT_LABELS.RETURN_NO.ar}`);
  });

  it('degrades to English when the document cannot carry raster Arabic', () => {
    // Native ESC/POS text has no Arabic code page — emitting Arabic here would print garbage.
    expect(label('SALES_RETURN', PRINT_LANGUAGE.AR)).toBe(RECEIPT_LABELS.SALES_RETURN.en);
    expect(label('SALES_RETURN', PRINT_LANGUAGE.BILINGUAL)).toBe(RECEIPT_LABELS.SALES_RETURN.en);
  });

  it('falls back readably for an unknown key', () => {
    expect(label('NOT_A_LABEL', PRINT_LANGUAGE.EN)).toBe('NOT_A_LABEL');
  });

  it('translates refund methods and voucher statuses, never the enum name', () => {
    expect(refundMethodLabel('CASH_REFUND', PRINT_LANGUAGE.EN)).toBe('Cash Refund');
    expect(refundMethodLabel('CASH_REFUND', PRINT_LANGUAGE.AR, RASTER)).toMatch(AR);
    expect(refundMethodLabel('CREDIT_VOUCHER', PRINT_LANGUAGE.BILINGUAL, RASTER)).toContain('/');

    expect(voucherStatusLabel('PARTIALLY_REDEEMED', PRINT_LANGUAGE.EN)).toBe('Partially Redeemed');
    expect(voucherStatusLabel('PARTIALLY_REDEEMED', PRINT_LANGUAGE.AR, RASTER)).toMatch(AR);
  });

  it('sources voucher terms from the dictionary in each language', () => {
    expect(voucherTerms(PRINT_LANGUAGE.EN).join(' ')).toContain('Not redeemable for cash.');
    expect(voucherTerms(PRINT_LANGUAGE.AR, RASTER).join(' ')).toMatch(AR);
  });
});

describe('sales return receipt language modes', () => {
  it('English mode contains no Arabic', () => {
    const body = buildSalesReturnReceiptBody(RETURN, { language: PRINT_LANGUAGE.EN });
    expect(body).toContain('SALES RETURN');
    expect(body).not.toMatch(AR);
  });

  it('Arabic mode renders Arabic when the document is raster-capable', () => {
    const body = buildSalesReturnReceiptBody(RETURN, {
      language: PRINT_LANGUAGE.AR, ...RASTER,
    });
    expect(body).toMatch(AR);
    expect(body).toContain('SR-2026-0015'); // identifiers stay latin
  });

  it('bilingual mode carries both scripts', () => {
    const body = buildSalesReturnReceiptBody(RETURN, {
      language: PRINT_LANGUAGE.BILINGUAL, ...RASTER,
    });
    expect(body).toContain('SALES RETURN');
    expect(body).toMatch(AR);
    expect(body).toContain('/');
  });

  it('an Arabic request on a native-text document stays English rather than printing mojibake', () => {
    const body = buildSalesReturnReceiptBody(RETURN, { language: PRINT_LANGUAGE.AR });
    expect(body).not.toMatch(AR);
  });
});

describe('credit voucher language modes', () => {
  it('English mode contains no Arabic', () => {
    const body = buildCreditVoucherBody(VOUCHER, { language: PRINT_LANGUAGE.EN });
    expect(body).toContain('CREDIT VOUCHER');
    expect(body).not.toMatch(AR);
  });

  it('Arabic and bilingual modes render Arabic on a raster-capable document', () => {
    expect(buildCreditVoucherBody(VOUCHER, { language: PRINT_LANGUAGE.AR, ...RASTER })).toMatch(AR);
    expect(buildCreditVoucherBody(VOUCHER, { language: PRINT_LANGUAGE.BILINGUAL, ...RASTER })).toMatch(AR);
  });

  it('keeps the current balance distinct from the face value in every language', () => {
    for (const language of [PRINT_LANGUAGE.EN, PRINT_LANGUAGE.AR, PRINT_LANGUAGE.BILINGUAL]) {
      const body = buildCreditVoucherBody(VOUCHER, { language, ...RASTER });
      expect(body).toContain('100.00'); // original
      expect(body).toContain('60.00');  // current — what the customer can actually spend
      expect(body).toContain('40.00');  // redeemed
    }
  });

  it('voucher code and number stay latin so they remain keyable and scannable', () => {
    const body = buildCreditVoucherBody(VOUCHER, { language: PRINT_LANGUAGE.AR, ...RASTER });
    expect(body).toContain('CV-2026-000001');
    expect(body).toContain('EDZH-PBCR-8C65');
  });
});
