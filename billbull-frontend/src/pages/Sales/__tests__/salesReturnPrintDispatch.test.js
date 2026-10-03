import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * How a Sales Return receipt and a Credit Voucher actually reach paper.
 *
 * These cover the dispatch half of the print layer — printer resolution, the paper width the
 * document is laid out at, and what the operator is told when the driver downgrades the job —
 * as opposed to salesReturnPrint.test.js, which covers the content.
 *
 * Only the transport is mocked. Resolution and ESC/POS assembly run for real, because the
 * defects these guard against (a document built for the wrong paper, a barcode that silently
 * never printed) all live in the handover between those two steps.
 */

const sendEscPosReceiptToConfiguredPrinter = vi.fn();

vi.mock('../../../utils/localPrintAgent', async (importOriginal) => ({
  ...(await importOriginal()),
  sendEscPosReceiptToConfiguredPrinter: (...args) => sendEscPosReceiptToConfiguredPrinter(...args),
}));

const { printSalesReturnReceipt, printCreditVoucher } = await import('../../../utils/salesReturnPrint');

const printer = (overrides = {}) => ({
  id: 7,
  deviceName: 'Counter Printer',
  deviceType: 'RECEIPT_PRINTER',
  status: 'ACTIVE',
  connectionType: 'USB',
  systemPrinterName: 'POS-80',
  branchId: 3,
  terminalId: null,
  paperSize: '80mm',
  ...overrides,
});

const RETURN = {
  id: 12,
  returnNumber: 'SR-2026-0023',
  returnDate: '2026-10-01',
  linkedInvoice: 'INV-2026-0226',
  customerName: 'Bonzer',
  subTotal: 100, taxAmount: 4.76, totalAmount: 100,
  taxInclusive: true, refundMethod: 'CASH_REFUND',
  items: [{ itemCode: '08747', itemName: '1 Gang 1 Way Schneider White', returnQty: 1, price: 100 }],
};

const VOUCHER = {
  id: 9,
  voucherNumber: 'CV-2026-000009',
  voucherCode: '924V-W7EG-DH3Y',
  barcodeValue: '924VW7EGDH3Y',
  originalAmount: 100, usedAmount: 0, remainingAmount: 100,
  issueDate: '2026-10-01', expiryDate: '2027-10-01',
  status: 'ACTIVE', sourceReturnNumber: 'SR-2026-0023',
};

const sent = () => sendEscPosReceiptToConfiguredPrinter.mock.calls.at(-1);

describe('sales return / voucher dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEscPosReceiptToConfiguredPrinter.mockResolvedValue({});
  });

  it('lays the document out at the printer\'s configured paper width', async () => {
    // A 48-column document on a 58mm head does not fail — it prints wrapped and unreadable,
    // with nothing to tell the operator the width was the problem.
    await printCreditVoucher(VOUCHER, { printers: [printer({ paperSize: '58mm' })], branchId: 3 });

    const [, payload] = sent();
    payload.receiptText.split('\n').forEach((line) => expect(line.length).toBeLessThanOrEqual(32));
    expect((await printCreditVoucher(VOUCHER, { printers: [printer()], branchId: 3 })).paperSize)
      .toBe('80mm');
  });

  it('falls back to 80mm when the printer record carries no paper size', async () => {
    const result = await printSalesReturnReceipt(RETURN, {
      printers: [printer({ paperSize: null })], branchId: 3,
    });
    expect(result.paperSize).toBe('80mm');
  });

  it('sends the plain text alongside the bytes so a driver rejection still prints', async () => {
    // The agent can only fall back to text/GDI if it was given text, and the print job record
    // only holds something readable if the same text reaches it.
    await printSalesReturnReceipt(RETURN, { printers: [printer()], branchId: 3 });

    const [, payload] = sent();
    expect(payload.dataBase64).toBeTruthy();
    expect(payload.receiptText).toContain('SR-2026-0023');
    expect(payload.sourceType).toBe('SALES_RETURN');
    expect(payload.sourceRefId).toBe('12');
  });

  it('reports a text-mode downgrade, and that the voucher barcode did not print', async () => {
    // Text mode drops every binary command. The barcode is one, so the customer is holding a
    // voucher that will not scan — the cashier has to be told, not left to find out later.
    sendEscPosReceiptToConfiguredPrinter.mockResolvedValue({
      fallbackUsed: 'text', escPosError: 'StartDocPrinter refused RAW',
    });

    const result = await printCreditVoucher(VOUCHER, { printers: [printer()], branchId: 3 });

    expect(result.fallbackUsed).toBe('text');
    expect(result.escPosError).toBe('StartDocPrinter refused RAW');
    expect(result.barcodePrinted).toBe(false);
    // The code itself is in the body, so the voucher is still redeemable by hand.
    expect(sent()[1].receiptText).toContain('924V-W7EG-DH3Y');
  });

  it('counts the barcode as printed on the normal ESC/POS path', async () => {
    const result = await printCreditVoucher(VOUCHER, { printers: [printer()], branchId: 3 });
    expect(result.barcodePrinted).toBe(true);
    expect(result.printer.deviceName).toBe('Counter Printer');
  });

  it('prefers the printer bound to this terminal over the branch default', async () => {
    const branchDefault = printer({ id: 1, deviceName: 'Branch Default', defaultPrinter: true });
    const atTerminal = printer({ id: 2, deviceName: 'Counter 2 Printer', terminalId: 'T2' });

    const result = await printCreditVoucher(VOUCHER, {
      printers: [branchDefault, atTerminal], branchId: 3, terminalId: 'T2',
    });
    expect(result.printer.deviceName).toBe('Counter 2 Printer');
  });

  it('never prints to a printer bound to a different terminal', async () => {
    // That printer is physically at another counter — paper there is paper the customer
    // standing here never gets.
    const elsewhere = printer({ deviceName: 'Counter 9 Printer', terminalId: 'T9', defaultPrinter: true });

    await expect(printCreditVoucher(VOUCHER, {
      printers: [elsewhere], branchId: 3, terminalId: 'T2',
    })).rejects.toThrow(/No receipt printer is configured/);
    expect(sendEscPosReceiptToConfiguredPrinter).not.toHaveBeenCalled();
  });

  it('surfaces a transport failure instead of reporting a print that never happened', async () => {
    sendEscPosReceiptToConfiguredPrinter.mockRejectedValue(new Error('agent offline'));
    await expect(printSalesReturnReceipt(RETURN, { printers: [printer()], branchId: 3 }))
      .rejects.toThrow('agent offline');
  });
});
