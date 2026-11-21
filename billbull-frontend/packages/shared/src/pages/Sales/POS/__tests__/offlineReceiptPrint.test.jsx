// M1 follow-up: an offline sale's receipt can be printed again from the stored outbox row, without a
// server invoice id or a connection, and printing never touches the sale. Real (fake-indexeddb)
// IndexedDB and real WebCrypto, as offlineMvp.test.js; the printer is a stub.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadCatalogIndex, clearCatalogIndex } from '../offline/offlineCatalog';
import { getAllOutbox, getMeta, putMeta, updateOutboxSync, __resetOfflineDbForTests } from '../offline/offlineDb';
import { __resetOfflineRuntimeForTests, __setStateForTests, refreshOutboxCounts } from '../offline/offlineRuntime';
import { buildOfflineReceiptText, commitOfflineSale } from '../offline/offlineSale';
import {
  offlineReceiptFailureMessage, OfflineReceiptPrintBusy, printOfflineReceipt, registerOfflineReceiptPrinter,
} from '../offline/offlineReceiptPrint';
import OfflineStatusPanel from '../offline/OfflineStatusPanel';

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const subtle = webcrypto.subtle;

const CATALOG = {
  version: 'v1', generatedAt: new Date().toISOString(), branchId: 1,
  tax: { taxEnabled: true, taxInclusive: true, branchDefaultVatRate: 5 },
  products: [{ id: 2, code: '08747', name: 'Gang switch', barcodes: ['0000000100908'], barcode: '0000000100908', retailPrice: 100, taxRate: 5, salesTax: 5, unitName: 'PCS' }],
  salespersons: { required: false, lookups: [] },
};

const payload = () => ({
  customerCode: 'WALK-IN', customerName: 'Walk-in Customer', priceLevelId: null, taxInclusive: true, billDiscountAmount: 0,
  paymentAllocations: [{ type: 'CASH', amount: 150 }],
  items: [{ itemCode: '08747', itemName: 'Gang switch', quantity: 1, unit: 'PCS', price: 100, discount: 0, taxRate: 5, voided: false }],
});

async function setUpTill() {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const now = Math.floor(Date.now() / 1000);
  const claims = { lid: 'lease-1', ten: 'tenant_x', br: 1, term: 'T1', sid: 58, kid: 'key-1', op: 'admin', bd: '2026-11-13', iat: now - 60, exp: now + 3600, maxSales: 50, maxValue: 500000, seqStart: 1, seqEnd: 51 };
  const counter = { leaseId: 'lease-1', nextSeq: 1, count: 0, valueMinor: 0, chainHead: 'GENESIS', lastCapturedAt: null };
  await putMeta('counter', counter);
  __setStateForTests({
    installed: true, connectivity: 'offline',
    device: { keyId: 'key-1', terminalId: 'T1' },
    lease: { leaseId: 'lease-1', claims, serverOffsetMs: 0, verified: true },
    counter,
    storage: { ready: true, persisted: true, error: null },
  }, pair.privateKey);
  loadCatalogIndex(CATALOG);
}

const CONTEXT = { outletName: 'Pilot Outlet', outletTrn: '100200300400003', cashierName: 'Admin User' };

// Records every submission; `fail` makes the next ones reject, `hold` keeps one pending.
function stubPrinter() {
  const calls = [];
  const printer = {
    calls,
    fail: null,
    hold: null,
    context: () => CONTEXT,
    print: vi.fn(async (job) => {
      calls.push(job);
      if (printer.hold) await printer.hold.promise;
      if (printer.fail) throw printer.fail;
      return { mode: 'agent-escpos' };
    }),
  };
  return printer;
}

const deferred = () => { let release; const promise = new Promise((r) => { release = r; }); return { promise, release }; };

// What must never change when a receipt is printed: the signed sale and its sync bookkeeping.
const saleSnapshot = (row) => ({
  record: row.record, sig: row.sig, sha256: row.sha256, seq: row.seq, rid: row.rid,
  syncState: row.syncState, attempts: row.attempts, invoiceId: row.invoiceId, invoiceNumber: row.invoiceNumber,
});

let printer;
let unregister;
let fetchSpy;
let xhrSpy;

beforeEach(async () => {
  __resetOfflineRuntimeForTests();
  __resetOfflineDbForTests();
  clearCatalogIndex();
  await setUpTill();
  printer = stubPrinter();
  unregister = registerOfflineReceiptPrinter(printer);
  // Printing must not reach the server at all: no checkout, no sync, no invoice/payment/stock/journal.
  fetchSpy = vi.fn(() => Promise.reject(new Error('network used while printing')));
  vi.stubGlobal('fetch', fetchSpy);
  xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open');
});

afterEach(() => {
  unregister?.();
  vi.unstubAllGlobals();
  xhrSpy.mockRestore();
});

const commitSale = async () => {
  const { record } = await commitOfflineSale({ payload: payload(), displayedTotal: 100, cashierName: 'Admin User' });
  const [row] = await getAllOutbox();
  return { record, row };
};

const rowFor = async (rid) => (await getAllOutbox()).find((r) => r.rid === rid);

describe('printing a stored offline receipt', () => {
  it('records a failed automatic print and leaves the sale intact, pending and retryable', async () => {
    const { record, row } = await commitSale();
    const before = saleSnapshot(row);
    printer.fail = new Error('Printer queue \'POS-80C\' is not ready');

    await expect(printOfflineReceipt(record.rid)).rejects.toThrow(/not ready/);

    const after = await rowFor(record.rid);
    expect(after).toMatchObject({ printState: 'FAILED', printError: expect.stringMatching(/not ready/) });
    expect(saleSnapshot(after)).toEqual(before);
    expect(after.syncState).toBe('PENDING');
    expect(await getAllOutbox()).toHaveLength(1);

    printer.fail = null;
    await printOfflineReceipt(record.rid);
    const retried = await rowFor(record.rid);
    expect(retried).toMatchObject({ printState: 'SENT', printError: null, printCount: 1 });
    expect(saleSnapshot(retried)).toEqual(before);
  });

  it('prints from the persisted record and its original reference, with no server invoice id', async () => {
    const { record } = await commitSale();
    await printOfflineReceipt(record.rid);

    expect(printer.print).toHaveBeenCalledTimes(1);
    const job = printer.calls[0];
    expect(job.text).toBe(buildOfflineReceiptText(record, CONTEXT));
    expect(job.text).toContain(`Offline ref: ${record.ref}`);
    expect(job.text).toContain('OFFLINE — PENDING SYNCHRONIZATION');
    expect(job.text).toContain('NOT A TAX INVOICE');
    expect(job.title).toBe(`Offline receipt ${record.ref}`);
    expect(job.invoice).toMatchObject({ id: null, invoiceNumber: null, offline: { ref: record.ref, rid: record.rid } });
    expect(typeof job.escPosBase64).toBe('string');
    expect(job.escPosBase64.length).toBeGreaterThan(0);
  });

  it('prints a receipt that was already sent to the printer again, on request', async () => {
    const { record, row } = await commitSale();
    await printOfflineReceipt(record.rid);
    await printOfflineReceipt(record.rid);
    const after = await rowFor(record.rid);
    expect(printer.print).toHaveBeenCalledTimes(2);
    expect(printer.calls[1].text).toBe(printer.calls[0].text);
    expect(after).toMatchObject({ printState: 'SENT', printCount: 2 });
    expect(saleSnapshot(after)).toEqual(saleSnapshot(row));
  });

  it('refuses a second submission for the same sale while one is in flight', async () => {
    const { record } = await commitSale();
    printer.hold = deferred();
    const first = printOfflineReceipt(record.rid);
    await expect(printOfflineReceipt(record.rid)).rejects.toBeInstanceOf(OfflineReceiptPrintBusy);
    printer.hold.release();
    await first;
    expect(printer.print).toHaveBeenCalledTimes(1);
    printer.hold = null;
    await printOfflineReceipt(record.rid); // the guard is released afterwards
    expect(printer.print).toHaveBeenCalledTimes(2);
  });

  it('keeps the receipt printable after a reload (state comes from IndexedDB only)', async () => {
    const { record, row } = await commitSale();
    printer.fail = new Error('agent not running');
    await expect(printOfflineReceipt(record.rid)).rejects.toThrow();

    // Reload: in-memory runtime, DB connection and printer registration are gone; IndexedDB stays.
    unregister();
    __resetOfflineRuntimeForTests();
    __resetOfflineDbForTests();
    __setStateForTests({ installed: true, connectivity: 'offline', storage: { ready: true, persisted: true, error: null } });
    printer = stubPrinter();
    unregister = registerOfflineReceiptPrinter(printer);

    await printOfflineReceipt(record.rid);
    expect(printer.calls[0].text).toContain(record.ref);
    expect(saleSnapshot(await rowFor(record.rid))).toEqual(saleSnapshot(row));
  });

  it('touches nothing but the print bookkeeping and never calls the server', async () => {
    const { record } = await commitSale();
    const counter = await getMeta('counter');
    printer.fail = new Error('paper out');
    await expect(printOfflineReceipt(record.rid)).rejects.toThrow();
    printer.fail = null;
    await printOfflineReceipt(record.rid);
    await printOfflineReceipt(record.rid);

    expect(await getAllOutbox()).toHaveLength(1);
    expect(await getMeta('counter')).toEqual(counter);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
  });

  it('will not print the offline receipt once the sale has a server invoice', async () => {
    const { record } = await commitSale();
    await updateOutboxSync(record.rid, { syncState: 'SYNCED', invoiceNumber: 'INV-2026-0165', invoiceId: 165 });
    await expect(printOfflineReceipt(record.rid)).rejects.toThrow(/INV-2026-0165/);
    expect(printer.print).not.toHaveBeenCalled();
  });

  it('says the sale is safe and points to the working offline action, not to "Print Receipt"', () => {
    const message = offlineReceiptFailureMessage('OFF-T1-000001', new Error('printer offline'));
    expect(message).toMatch(/saved offline \(ref OFF-T1-000001\)/);
    expect(message).toMatch(/nothing needs to be rung again/);
    expect(message).toMatch(/could not be sent to the printer: printer offline/);
    expect(message).toMatch(/Offline selling .* "Print receipt" on OFF-T1-000001/);
    expect(message).not.toMatch(/Print Receipt/);
  });

  it('routes the automatic print and its failure message through the offline receipt path', () => {
    const source = readFileSync(resolve(__dirname, '../features/checkout/useCheckout.js'), 'utf8');
    expect(source).toContain('await printOfflineReceipt(offlineSale.record.rid);');
    expect(source).toContain('offlineReceiptFailureMessage(offlineSale.record.ref, autoPrintErr)');
    // The online message keeps pointing at "Print Receipt", which works for a server invoice.
    expect(source).toMatch(/alert\(offlineSale\s*\?\s*offlineReceiptFailureMessage/);
  });
});

describe('offline panel receipt action', () => {
  const openPanel = async () => {
    await act(async () => { await refreshOutboxCounts(); });
    render(<OfflineStatusPanel />);
    fireEvent.click(screen.getByTestId('offline-status-button'));
    return screen.getByTestId('offline-panel');
  };

  it('retries a failed receipt and then offers "Print again"', async () => {
    const { record } = await commitSale();
    await updateOutboxSync(record.rid, { printState: 'FAILED', printError: 'agent not running' });
    const panel = await openPanel();
    const row = within(panel).getByTestId('offline-sale-row');
    expect(within(row).getByTestId('offline-print-status').textContent).toMatch(/Receipt not printed: agent not running/);
    const button = within(row).getByTestId('offline-print-receipt');
    expect(button.textContent).toBe('Print receipt');

    await act(async () => { fireEvent.click(button); });
    await waitFor(() => expect(within(panel).getByTestId('offline-print-notice').textContent).toMatch(/sent to the printer/));

    expect(printer.calls[0].text).toContain(record.ref);
    await waitFor(() => expect(within(panel).getByTestId('offline-print-receipt').textContent).toBe('Print again'));
    expect(within(panel).getByTestId('offline-print-status').textContent).toMatch(/^Receipt sent to printer/);
    expect(within(panel).getByTestId('offline-print-status').textContent).not.toMatch(/\bprinted\b/i);
    expect((await rowFor(record.rid)).syncState).toBe('PENDING');
  });

  it('starts one print for a double click', async () => {
    const { record } = await commitSale();
    printer.hold = deferred();
    const panel = await openPanel();
    const button = within(panel).getByTestId('offline-print-receipt');
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(within(panel).getByTestId('offline-print-receipt')).toBeDisabled());
    printer.hold.release();
    await waitFor(() => expect(within(panel).getByTestId('offline-print-receipt')).not.toBeDisabled());
    expect(printer.print).toHaveBeenCalledTimes(1);
    expect((await rowFor(record.rid)).printCount).toBe(1);
  });

  it('shows a print failure as a receipt problem, never a failed sale', async () => {
    await commitSale();
    printer.fail = new Error('printer unplugged');
    const panel = await openPanel();
    await act(async () => { fireEvent.click(within(panel).getByTestId('offline-print-receipt')); });
    const alert = await within(panel).findByRole('alert');
    expect(alert.textContent).toMatch(/is saved; only the receipt failed: printer unplugged/);
    expect(within(panel).getByTestId('offline-print-receipt').textContent).toBe('Print receipt');
  });

  it('hides the offline receipt action once the sale has synchronised', async () => {
    const { record } = await commitSale();
    await updateOutboxSync(record.rid, { syncState: 'SYNCED', invoiceNumber: 'INV-2026-0165' });
    const panel = await openPanel();
    expect(within(panel).queryByTestId('offline-print-receipt')).toBeNull();
  });
});
