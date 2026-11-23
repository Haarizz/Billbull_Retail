/**
 * An offline cash sale (M3): checked against the pilot rules, signed with the till's key and
 * committed to IndexedDB in ONE transaction together with the lease counter and chain head. The
 * sale counts as accepted only when that transaction's `complete` event fires; any failure before
 * that throws, and the caller must tell the cashier the sale was NOT taken.
 *
 * Pilot rules (anything else is refused here, never silently sent online or posted):
 *   walk-in customer · cash only · no line or bill discount · no voided lines · list price from the
 *   offline catalogue · catalogue tax rate · whole quantities · no layaway, Sales Order, delivery or
 *   shipping · within the lease's expiry, sale count and value.
 */
import { signCanonical } from './offlineCrypto';
import { runTx, OfflineStorageError } from './offlineDb';
import { findCatalogProduct, catalogIndex } from './offlineCatalog';
import { getRawState, getSigningKey, leaseRefusal, refreshOutboxCounts, setCounter, estimatedServerNow } from './offlineRuntime';

export class OfflineSaleRefused extends Error {
  constructor(message) {
    super(message);
    this.name = 'OfflineSaleRefused';
    this.code = 'OFFLINE_SALE_REFUSED';
  }
}

const minor = (n) => Math.round(Number(n || 0) * 100);
const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

/** Builds the record's lines and total, or throws OfflineSaleRefused with the first reason. */
export function offlineLinesFor(payload, { taxInclusive }) {
  if (!catalogIndex()) throw new OfflineSaleRefused('The offline product catalogue is not on this till.');
  const lines = [];
  for (const item of payload.items || []) {
    if (item.voided) throw new OfflineSaleRefused(`Remove the voided line ${item.itemName || item.itemCode}: voided lines are not taken offline.`);
    if (item.batchNumber || item.serialNumber) throw new OfflineSaleRefused(`${item.itemName || item.itemCode} is batch or serial controlled and needs the server.`);
    if (Number(item.discount || 0) !== 0) throw new OfflineSaleRefused('Discounts are not available offline.');
    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty <= 0) throw new OfflineSaleRefused(`${item.itemName || item.itemCode}: offline sales need whole quantities.`);
    const product = findCatalogProduct(item.itemCode);
    if (!product) throw new OfflineSaleRefused(`${item.itemName || item.itemCode} is not in the offline catalogue (batch, serial or expiry-controlled items need the server).`);
    const priceMinor = minor(item.price);
    if (priceMinor !== minor(product.retailPrice)) {
      throw new OfflineSaleRefused(`${product.name}: only the list price (AED ${Number(product.retailPrice).toFixed(2)}) can be charged offline.`);
    }
    const taxBp = Math.round(Number(item.taxRate || 0) * 100);
    if (taxBp !== Math.round(Number(product.taxRate || 0) * 100)) {
      throw new OfflineSaleRefused(`${product.name}: its tax rate differs from the offline catalogue. Sell it when the server is back.`);
    }
    lines.push({ code: String(product.code), name: String(item.itemName || product.name), qty, unit: String(item.unit || 'Each'), priceMinor, taxBp });
  }
  if (!lines.length) throw new OfflineSaleRefused('The sale has no lines.');
  const totalMinor = lines.reduce((sum, l) => {
    const gross = l.priceMinor * l.qty;
    return sum + (taxInclusive ? gross : gross + Math.round((gross * l.taxBp) / 10000));
  }, 0);
  return { lines, totalMinor };
}

/** Refuses everything outside the pilot before anything is written. */
export function assertOfflineEligible(payload, { depositAmount = 0 } = {}) {
  if (payload.customerCode && payload.customerCode !== 'WALK-IN') throw new OfflineSaleRefused('Offline sales are walk-in only. Remove the customer, or wait for the server.');
  if (Number(payload.billDiscountAmount || 0) !== 0) throw new OfflineSaleRefused('Discounts are not available offline.');
  if (payload.priceLevelId != null) throw new OfflineSaleRefused('Price levels are not available offline.');
  if (payload.linkedSalesOrder) throw new OfflineSaleRefused('Sales Orders need the server.');
  if (Number(payload.shippingCharge || 0) > 0 || payload.shippingAddress || payload.driverName) throw new OfflineSaleRefused('Delivery and shipping need the server.');
  if (depositAmount > 0) throw new OfflineSaleRefused('Layaways need the server.');
  const allocations = payload.paymentAllocations || [];
  if (!allocations.length || allocations.some((a) => a.type !== 'CASH')) {
    throw new OfflineSaleRefused('Only cash can be taken offline. Card, credit, voucher and other payments need the server.');
  }
}

/**
 * Commits one offline sale. Returns { record, row, invoice } where `invoice` is a display-only
 * stand-in for the success screen and receipt: it has NO invoice number (the official number is
 * issued by the server at synchronisation).
 */
export async function commitOfflineSale({ payload, depositAmount = 0, posSettings, cashierName, displayedTotal = null }) {
  assertOfflineEligible(payload, { depositAmount });
  const taxInclusive = !!payload.taxInclusive;
  const { lines, totalMinor } = offlineLinesFor(payload, { taxInclusive, posSettings });
  // The cashier collected against the total on screen; refuse if the offline rules disagree with it.
  if (displayedTotal != null && Math.abs(minor(displayedTotal) - totalMinor) > lines.length) {
    throw new OfflineSaleRefused(`The offline total (AED ${(totalMinor / 100).toFixed(2)}) differs from the total on screen (AED ${Number(displayedTotal).toFixed(2)}).`);
  }
  const tenderedMinor = (payload.paymentAllocations || []).reduce((s, a) => s + minor(a.amount), 0);
  if (tenderedMinor < totalMinor) throw new OfflineSaleRefused(`Cash received (AED ${(tenderedMinor / 100).toFixed(2)}) is less than the total (AED ${(totalMinor / 100).toFixed(2)}).`);
  const refusal = leaseRefusal(totalMinor);
  if (refusal) throw new OfflineSaleRefused(`This sale cannot be taken offline: ${refusal}.`);

  const state = getRawState();
  const lease = state.lease;
  const claims = lease.claims;
  const run = async () => {
    const counter = state.counter;
    const seq = counter.nextSeq;
    const rid = newId();
    const record = {
      typ: 'bb.pos.offline.sale',
      v: 1,
      rid,
      ck: `off-${rid}`,
      lid: lease.leaseId,
      kid: state.device.keyId,
      seq,
      prev: counter.chainHead || 'GENESIS',
      ten: claims.ten,
      br: claims.br,
      term: claims.term,
      sid: claims.sid,
      op: claims.op,
      bd: claims.bd,
      at: new Date(estimatedServerNow()).toISOString(),
      cat: catalogIndex()?.version || null,
      taxInc: taxInclusive,
      lines,
      totalMinor,
      tender: { type: 'CASH', tenderedMinor, changeMinor: tenderedMinor - totalMinor },
      sp: payload.salespersonEmployeeId != null || payload.salespersonEmployeeCode
        ? { id: payload.salespersonEmployeeId ?? null, code: payload.salespersonEmployeeCode ?? null }
        : null,
      ref: `OFF-${claims.term}-${String(seq).padStart(6, '0')}`,
    };
    const { sig, sha256 } = await signCanonical(getSigningKey(), record);
    const row = {
      rid, seq, record, sig, sha256,
      syncState: 'PENDING', attempts: 0, printState: 'QUEUED',
      createdAt: new Date().toISOString(),
    };
    const nextCounter = {
      ...counter,
      nextSeq: seq + 1,
      count: (counter.count || 0) + 1,
      valueMinor: (counter.valueMinor || 0) + totalMinor,
      chainHead: sha256,
      lastCapturedAt: record.at,
    };
    // One transaction: the record, the counter and the chain head commit together or not at all.
    await runTx(['outbox', 'meta'], 'readwrite', (s, box) => {
      const req = s.meta.get('counter');
      req.onsuccess = () => {
        const stored = req.result?.v;
        if (!stored || stored.leaseId !== counter.leaseId || stored.nextSeq !== seq) {
          box.error = new OfflineStorageError('The offline sequence changed while this sale was saved (another tab?)');
          return;
        }
        s.outbox.add(row);
        s.meta.put({ k: 'counter', v: nextCounter });
        box.result = true;
      };
    });
    setCounter(nextCounter);
    return { record, row };
  };
  const { record, row } = navigator.locks?.request
    ? await navigator.locks.request('billbull-pos-offline-commit', run)
    : await run();
  void refreshOutboxCounts();
  return { record, row, invoice: displayInvoiceFor(record, { cashierName }) };
}

/** Display-only stand-in for the success screen. Never carries an invoice number. */
export function displayInvoiceFor(record, { cashierName } = {}) {
  return {
    id: null,
    invoiceNumber: null,
    status: 'OFFLINE_PENDING_SYNC',
    offline: { ref: record.ref, rid: record.rid, seq: record.seq, leaseId: record.lid },
    invoiceDate: record.bd,
    invoiceTotal: record.totalMinor / 100,
    taxInclusive: record.taxInc,
    customerCode: 'WALK-IN',
    customerName: 'Walk-in Customer',
    paymentMode: 'Cash',
    cashierName: cashierName || record.op,
    items: record.lines.map((l) => ({
      itemCode: l.code, itemName: l.name, quantity: l.qty, unit: l.unit, price: l.priceMinor / 100,
      taxRate: l.taxBp / 100, total: (l.priceMinor * l.qty) / 100,
    })),
  };
}

const money = (m) => (m / 100).toFixed(2);
const pad = (left, right, width = 42) => {
  const l = String(left);
  const r = String(right);
  return l.length + r.length + 1 > width ? `${l}\n${' '.repeat(Math.max(0, width - r.length))}${r}` : `${l}${' '.repeat(width - l.length - r.length)}${r}`;
};

/** Plain-text receipt for the print agent's text path. Marked so it cannot pass for a tax invoice. */
export function buildOfflineReceiptText(record, { outletName = '', outletTrn = '', cashierName = '' } = {}) {
  const rule = '-'.repeat(42);
  const out = [
    '******************************************',
    '  OFFLINE — PENDING SYNCHRONIZATION',
    '  NOT A TAX INVOICE',
    '******************************************',
  ];
  if (outletName) out.push(outletName);
  if (outletTrn) out.push(`TRN ${outletTrn}`);
  out.push(rule);
  out.push(`Offline ref: ${record.ref}`);
  out.push('(provisional reference, not an invoice no.)');
  out.push(`Business date: ${record.bd}`);
  out.push(`Recorded: ${new Date(record.at).toLocaleString()}`);
  out.push(`Terminal: ${record.term}   Cashier: ${cashierName || record.op}`);
  out.push(rule);
  for (const l of record.lines) {
    out.push(l.name.slice(0, 42));
    out.push(pad(`  ${l.qty} x ${money(l.priceMinor)}`, money(l.priceMinor * l.qty)));
  }
  out.push(rule);
  out.push(pad('TOTAL AED', money(record.totalMinor)));
  if (record.taxInc) out.push('  (prices include VAT)');
  out.push(pad('Cash', money(record.tender.tenderedMinor)));
  out.push(pad('Change', money(record.tender.changeMinor)));
  out.push(rule);
  out.push('The tax invoice number is issued when this');
  out.push('till synchronises with the server.');
  out.push('');
  return out.join('\n');
}
