// M3 Standalone POS offline MVP: canonical form shared with Java, and the offline sale's commit and
// refusal rules against a real (fake-indexeddb) IndexedDB and real WebCrypto.
import { beforeEach, describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalize } from '../offline/jcs';
import { loadCatalogIndex, offlineResolve, offlineProductList, clearCatalogIndex } from '../offline/offlineCatalog';
import { getAllOutbox, getMeta, putMeta, __resetOfflineDbForTests } from '../offline/offlineDb';
import { __resetOfflineRuntimeForTests, __setStateForTests, leaseRefusal } from '../offline/offlineRuntime';
import { commitOfflineSale, buildOfflineReceiptText, OfflineSaleRefused } from '../offline/offlineSale';
import { OfflineStorageError } from '../offline/offlineDb';

// The vectors live with the Java test that runs them too (one file, two languages).
const vectorsFile = JSON.parse(readFileSync(resolve(process.cwd(), '../billbull-backend/src/test/resources/pos-offline/jcs-vectors.json'), 'utf8'));

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const subtle = webcrypto.subtle;

describe('RFC 8785 canonical form (shared vectors with OfflineJcs.java)', () => {
  it.each(vectorsFile.vectors.map((v) => [v.name, v]))('%s', (_name, v) => {
    expect(canonicalize(JSON.parse(v.input))).toBe(v.expected);
  });

  it('signs the exact bytes Java verifies', () => {
    expect(canonicalize(vectorsFile.signature.record)).toBe(vectorsFile.signature.canonical);
  });

  it('refuses non-integers instead of guessing their serialisation', () => {
    expect(() => canonicalize({ a: 1.5 })).toThrow(TypeError);
    expect(() => canonicalize({ a: 2 ** 53 })).toThrow(TypeError);
  });
});

const CATALOG = {
  version: 'v1', generatedAt: new Date().toISOString(), branchId: 1,
  tax: { taxEnabled: true, taxInclusive: true, branchDefaultVatRate: 5 },
  products: [{ id: 2, code: '08747', name: 'Gang switch', barcodes: ['0000000100908'], barcode: '0000000100908', retailPrice: 100, taxRate: 5, salesTax: 5, unitName: 'PCS' }],
  salespersons: { required: true, lookups: [{ id: 9, employeeCode: 'EMP1257', name: 'Hari' }] },
};

const payload = (over = {}) => ({
  customerCode: 'WALK-IN', customerName: 'Walk-in Customer', priceLevelId: null, taxInclusive: true, billDiscountAmount: 0,
  paymentAllocations: [{ type: 'CASH', amount: 150 }],
  salespersonEmployeeId: 9, salespersonEmployeeCode: 'EMP1257',
  items: [{ itemCode: '08747', itemName: 'Gang switch', quantity: 1, unit: 'PCS', price: 100, discount: 0, taxRate: 5, voided: false }],
  ...over,
});

async function setUpTill({ expSeconds = 3600, seqStart = 1, maxSales = 50, maxValue = 500000, storageReady = true } = {}) {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const now = Math.floor(Date.now() / 1000);
  const claims = { lid: 'lease-1', ten: 'tenant_x', br: 1, term: 'T1', sid: 58, kid: 'key-1', op: 'admin', bd: '2026-11-13', iat: now - 60, exp: now + expSeconds, maxSales, maxValue, seqStart, seqEnd: seqStart + maxSales };
  const counter = { leaseId: 'lease-1', nextSeq: seqStart, count: 0, valueMinor: 0, chainHead: 'GENESIS', lastCapturedAt: null };
  await putMeta('counter', counter);
  __setStateForTests({
    installed: true, connectivity: 'offline',
    device: { keyId: 'key-1', terminalId: 'T1' },
    lease: { leaseId: 'lease-1', claims, serverOffsetMs: 0, verified: true },
    counter,
    storage: { ready: storageReady, persisted: true, error: storageReady ? null : 'blocked' },
  }, pair.privateKey);
  loadCatalogIndex(CATALOG);
  return pair;
}

describe('offline cash sale', () => {
  beforeEach(() => { __resetOfflineRuntimeForTests(); __resetOfflineDbForTests(); clearCatalogIndex(); });

  it('answers barcode and list lookups from the catalogue only', () => {
    loadCatalogIndex(CATALOG);
    expect(offlineResolve('0000000100908').type).toBe('PRODUCT');
    expect(offlineResolve('10672').type).toBe('NONE');
    expect(offlineProductList({ search: 'switch' }).content.map((p) => p.code)).toEqual(['08747']);
  });

  it('commits record, counter and chain head together, signed, with no invoice number', async () => {
    const pair = await setUpTill();
    const { record, invoice } = await commitOfflineSale({ payload: payload(), displayedTotal: 100, cashierName: 'Admin' });
    const rows = await getAllOutbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ seq: 1, syncState: 'PENDING', record: { ck: `off-${record.rid}`, totalMinor: 10000, lid: 'lease-1', ten: 'tenant_x', br: 1, term: 'T1', sid: 58, op: 'admin', tender: { type: 'CASH', tenderedMinor: 15000, changeMinor: 5000 }, sp: { id: 9, code: 'EMP1257' } } });
    const counter = await getMeta('counter');
    expect(counter).toMatchObject({ nextSeq: 2, count: 1, valueMinor: 10000, chainHead: rows[0].sha256 });
    const sig = Uint8Array.from(Buffer.from(rows[0].sig, 'base64url'));
    expect(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, sig, new TextEncoder().encode(canonicalize(rows[0].record)))).toBe(true);
    expect(invoice.invoiceNumber).toBeNull();
    expect(invoice.offline.ref).toBe('OFF-T1-000001');
    const receipt = buildOfflineReceiptText(record, {});
    expect(receipt).toContain('OFFLINE — PENDING SYNCHRONIZATION');
    expect(receipt).toContain('NOT A TAX INVOICE');
  });

  it('chains the second sale to the first and keeps one sequence', async () => {
    await setUpTill();
    await commitOfflineSale({ payload: payload() });
    const { record } = await commitOfflineSale({ payload: payload() });
    const rows = await getAllOutbox();
    expect(rows.map((r) => r.seq)).toEqual([1, 2]);
    expect(record.prev).toBe(rows[0].sha256);
  });

  it.each([
    ['card payment', payload({ paymentAllocations: [{ type: 'CARD', amount: 100 }] }), /Only cash/],
    ['credit customer', payload({ customerCode: 'C001' }), /walk-in only/],
    ['line discount', payload({ items: [{ ...payload().items[0], discount: 10 }] }), /Discounts/],
    ['price override', payload({ items: [{ ...payload().items[0], price: 90 }] }), /list price/],
    ['product not in the offline catalogue (batch/serial/expiry)', payload({ items: [{ ...payload().items[0], itemCode: '10672' }] }), /not in the offline catalogue/],
    ['short cash', payload({ paymentAllocations: [{ type: 'CASH', amount: 50 }] }), /less than the total/],
  ])('refuses %s and writes nothing', async (_name, p, message) => {
    await setUpTill();
    await expect(commitOfflineSale({ payload: p })).rejects.toThrow(message);
    expect(await getAllOutbox()).toHaveLength(0);
  });

  it('refuses a new sale once the lease has expired, and keeps earlier sales', async () => {
    await setUpTill({ expSeconds: -1 });
    await expect(commitOfflineSale({ payload: payload() })).rejects.toBeInstanceOf(OfflineSaleRefused);
    expect(leaseRefusal(0)).toMatch(/expired/);
  });

  it('refuses when the sale count or value limit is used up', async () => {
    await setUpTill({ maxSales: 1 });
    await commitOfflineSale({ payload: payload() });
    await expect(commitOfflineSale({ payload: payload() })).rejects.toThrow(/sale limit/);
    __resetOfflineRuntimeForTests();
    __resetOfflineDbForTests();
    globalThis.indexedDB = new (await import('fake-indexeddb')).IDBFactory();
    await setUpTill({ maxValue: 5000 });
    await expect(commitOfflineSale({ payload: payload() })).rejects.toThrow(/value limit/);
  });

  it('refuses when local storage is not ready', async () => {
    await setUpTill({ storageReady: false });
    await expect(commitOfflineSale({ payload: payload() })).rejects.toThrow(/storage is not available/);
  });

  it('never reports a sale when the IndexedDB write fails', async () => {
    await setUpTill();
    globalThis.indexedDB = undefined;
    __resetOfflineDbForTests();
    await expect(commitOfflineSale({ payload: payload() })).rejects.toBeInstanceOf(OfflineStorageError);
  });
});
