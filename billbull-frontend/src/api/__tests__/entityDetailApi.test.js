import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../axiosConfig', () => ({
  default: { get: vi.fn() },
}));

import api from '../axiosConfig';
import {
  EntityDetailForbiddenError,
  LEDGER_TRANSACTION_LIMIT,
  PARTY_DOCUMENT_LIMIT,
  fetchCustomerDetail,
  fetchEmployeeDetail,
  fetchEmployeePayrollSummary,
  fetchLedgerDetail,
  fetchProductDetail,
  fetchVendorDetail,
  hasEntityDetail,
} from '../entityDetailApi';

// --- Fixtures ----------------------------------------------------------------

const PRODUCT_AGGREGATE = {
  product: {
    id: 11,
    code: 'WKB-2024',
    name: 'Wireless Keyboard Pro',
    sku: 'SKU-WKB',
    status: 'ACTIVE',
  },
  effectivePricing: { retailPrice: 183.5 },
  inventory: { reorderLevel: 25 },
};

const STOCK_AVAILABILITY = {
  locations: [
    { locationId: 1, name: 'Main Warehouse', type: 'WAREHOUSE', onHand: 100, reserved: 18, available: 82, uom: 'PCS' },
    { locationId: 2, name: 'Dubai Store', type: 'WAREHOUSE', onHand: 42, reserved: 2, available: 40, uom: 'PCS' },
  ],
  incomingLpos: [
    { lpoNumber: 'LPO-0007', expectedDate: '2026-10-12', quantity: 60, supplierName: 'TechSupply', uom: 'PCS' },
  ],
};

const LEDGER_SUMMARY = {
  accountCode: '1100',
  accountName: 'Accounts Receivable',
  accountType: 'Asset',
  accountGroup: 'Assets',
  status: 'active',
  debitTotal: 5500,
  creditTotal: 1500,
  closingBalance: 4000,
  branchBalances: [
    { branchId: 1, branchName: 'Dubai', debitTotal: 4000, creditTotal: 1000, closingBalance: 3000 },
    { branchId: null, branchName: 'Unattributed', debitTotal: 1500, creditTotal: 500, closingBalance: 1000 },
  ],
};

const CUSTOMER_SUMMARY = {
  id: 3,
  customerCode: 'CUST-003',
  customerName: 'Acme Corp Ltd',
  status: 'Active',
  branch: 'Dubai',
  currency: 'AED',
  openingBalance: 1200,
  outstanding: 4550.25,
  totalSales: 18300,
  // Server-computed: 18300 - 4550.25. The client must echo, never re-derive.
  totalPaid: 13749.75,
  overdueAmount: 2100.5,
  overdueInvoiceCount: 2,
};

const CUSTOMER_INVOICES = [
  { id: 91, invoiceNumber: 'INV-0091', invoiceDate: '2026-09-20', invoiceTotal: 1500, balance: 500, status: 'POSTED', branchName: 'Dubai' },
  { id: 88, invoiceNumber: 'INV-0088', invoiceDate: '2026-09-02', invoiceTotal: 900, balance: 0, status: 'PAID', branchName: 'Dubai' },
];

const VENDOR_SUMMARY = {
  id: 21,
  vendorCode: 'VEN-021',
  vendorName: 'TechSupply FZCO',
  status: 'Active',
  branch: 'Sharjah',
  currency: 'AED',
  openingBalance: 5000,
  openingBalanceOutstanding: 1500,
  payableBalance: 9200,
  totalPaid: 41000,
  overdueInvoiceCount: 3,
};

const VENDOR_LPOS = [
  { id: 7, lpoNumber: 'LPO-0007', lpoDate: '2026-09-18', grandTotal: 3200, status: 'APPROVED', branchName: 'Sharjah' },
];

const forbidden = () => Object.assign(new Error('Forbidden'), { response: { status: 403 } });

/** Routes each mocked GET by URL prefix, and fails loudly on an unexpected call. */
const route = (handlers) => {
  api.get.mockImplementation((url, config) => {
    const key = Object.keys(handlers).find((prefix) => url.startsWith(prefix));
    if (!key) return Promise.reject(new Error(`Unexpected GET ${url}`));
    const value = handlers[key];
    return typeof value === 'function'
      ? value(url, config)
      : Promise.resolve({ data: value });
  });
};

const urlsCalled = () => api.get.mock.calls.map(([url]) => url);

// --- Tests -------------------------------------------------------------------

describe('entityDetailApi', () => {
  beforeEach(() => {
    api.get.mockReset();
  });

  it('exposes detail fetchers only for the types that have a panel', () => {
    expect(hasEntityDetail('product')).toBe(true);
    expect(hasEntityDetail('ledger')).toBe(true);
    expect(hasEntityDetail('customer')).toBe(true);
    expect(hasEntityDetail('vendor')).toBe(true);
    // Employee: identity + targets; payroll only on demand — see the employee blocks below.
    expect(hasEntityDetail('employee')).toBe(true);
    expect(hasEntityDetail('spaceship')).toBe(false);
  });

  describe('product', () => {
    it('looks stock up by the product code the stock-availability endpoint expects', async () => {
      route({
        '/api/products/11': PRODUCT_AGGREGATE,
        '/api/inventory/stock-availability/by-code/': STOCK_AVAILABILITY,
      });

      await fetchProductDetail({ type: 'product', id: '11', code: 'WKB-2024' });

      expect(urlsCalled()).toContain('/api/inventory/stock-availability/by-code/WKB-2024');
      // Never the product list — a details panel reads one row.
      expect(urlsCalled().some((u) => u.includes('/api/products/list'))).toBe(false);
      expect(urlsCalled().some((u) => u === '/api/products')).toBe(false);
    });

    it('returns the server figures without recomputing available', async () => {
      route({
        '/api/products/11': PRODUCT_AGGREGATE,
        '/api/inventory/stock-availability/by-code/': STOCK_AVAILABILITY,
      });

      const detail = await fetchProductDetail({ type: 'product', id: '11', code: 'WKB-2024' });

      expect(detail.onHand).toBe(142);
      expect(detail.reserved).toBe(20);
      expect(detail.available).toBe(122);
      expect(detail.incoming).toBe(60);
      expect(detail.unitPrice).toBe(183.5);
      expect(detail.reorderLevel).toBe(25);
      expect(detail.locations).toHaveLength(2);
      expect(detail.locations[0]).toMatchObject({ name: 'Main Warehouse', available: 82 });
    });

    it('carries no damaged figure, because the inventory model has none', async () => {
      route({
        '/api/products/11': PRODUCT_AGGREGATE,
        '/api/inventory/stock-availability/by-code/': STOCK_AVAILABILITY,
      });

      const detail = await fetchProductDetail({ type: 'product', id: '11', code: 'WKB-2024' });

      expect(detail).not.toHaveProperty('damaged');
      expect(detail.locations[0]).not.toHaveProperty('damaged');
    });

    it('falls back to a product lookup only when the result carries no code', async () => {
      route({
        '/api/products/11': PRODUCT_AGGREGATE,
        '/api/inventory/stock-availability/by-code/': STOCK_AVAILABILITY,
      });

      const detail = await fetchProductDetail({ type: 'product', id: '11' });

      expect(detail.code).toBe('WKB-2024');
      expect(urlsCalled()).toContain('/api/inventory/stock-availability/by-code/WKB-2024');
    });

    it('passes the abort signal to every request', async () => {
      route({
        '/api/products/11': PRODUCT_AGGREGATE,
        '/api/inventory/stock-availability/by-code/': STOCK_AVAILABILITY,
      });
      const signal = new AbortController().signal;

      await fetchProductDetail({ type: 'product', id: '11', code: 'WKB-2024' }, { signal });

      api.get.mock.calls.forEach(([, config]) => expect(config.signal).toBe(signal));
    });

    it('normalises a 403 on the stock read into a forbidden error', async () => {
      route({
        '/api/products/11': PRODUCT_AGGREGATE,
        '/api/inventory/stock-availability/by-code/': () => Promise.reject(forbidden()),
      });

      await expect(fetchProductDetail({ type: 'product', id: '11', code: 'WKB-2024' }))
        .rejects.toBeInstanceOf(EntityDetailForbiddenError);
    });

    it('still renders stock when the product metadata read fails', async () => {
      route({
        '/api/products/11': () => Promise.reject(new Error('boom')),
        '/api/inventory/stock-availability/by-code/': STOCK_AVAILABILITY,
      });

      const detail = await fetchProductDetail({
        type: 'product', id: '11', code: 'WKB-2024', title: 'Wireless Keyboard Pro',
      });

      expect(detail.name).toBe('Wireless Keyboard Pro'); // from the search result
      expect(detail.onHand).toBe(142);
      expect(detail.unitPrice).toBeNull();
      expect(detail.reorderLevel).toBeNull();
    });

    it('flags stock as unavailable rather than showing a confident zero', async () => {
      route({
        '/api/products/11': PRODUCT_AGGREGATE,
        '/api/inventory/stock-availability/by-code/': () => Promise.reject(new Error('boom')),
      });

      const detail = await fetchProductDetail({ type: 'product', id: '11', code: 'WKB-2024' });

      expect(detail.stockUnavailable).toBe(true);
      expect(detail.locations).toEqual([]);
    });
  });

  describe('ledger', () => {
    it('reads the bounded summary and transaction endpoints, never the whole ledger', async () => {
      route({
        '/api/ledger/accounts/1100/summary': LEDGER_SUMMARY,
        '/api/ledger/accounts/1100/transactions': [],
      });

      await fetchLedgerDetail({ type: 'ledger', id: 'acc-1', code: '1100' });

      expect(urlsCalled()).toEqual([
        '/api/ledger/accounts/1100/summary',
        '/api/ledger/accounts/1100/transactions',
      ]);
      expect(urlsCalled()).not.toContain('/api/ledger/transactions');
    });

    it('asks for a bounded number of transactions', async () => {
      route({
        '/api/ledger/accounts/1100/summary': LEDGER_SUMMARY,
        '/api/ledger/accounts/1100/transactions': [],
      });

      await fetchLedgerDetail({ type: 'ledger', code: '1100' });

      const txnCall = api.get.mock.calls.find(([url]) => url.endsWith('/transactions'));
      expect(txnCall[1].params).toEqual({ size: LEDGER_TRANSACTION_LIMIT });
    });

    it('echoes the backend totals rather than deriving them', async () => {
      route({
        '/api/ledger/accounts/1100/summary': LEDGER_SUMMARY,
        '/api/ledger/accounts/1100/transactions': [
          { id: 'le-2', transactionDate: '2026-03-02', voucherNo: 'JV-002', debitAmount: 200, creditAmount: 0, runningBalance: 4000 },
        ],
      });

      const detail = await fetchLedgerDetail({ type: 'ledger', code: '1100' });

      expect(detail.debitTotal).toBe(5500);
      expect(detail.creditTotal).toBe(1500);
      expect(detail.netBalance).toBe(4000);
      // Not the sum of the one transaction row below it.
      expect(detail.transactions).toHaveLength(1);
      expect(detail.transactions[0].runningBalance).toBe(4000);
    });

    it('keeps the unattributed branch row instead of dropping it', async () => {
      route({
        '/api/ledger/accounts/1100/summary': LEDGER_SUMMARY,
        '/api/ledger/accounts/1100/transactions': [],
      });

      const detail = await fetchLedgerDetail({ type: 'ledger', code: '1100' });

      expect(detail.branchBalances).toHaveLength(2);
      expect(detail.branchBalances[1]).toMatchObject({
        branchId: null,
        branchName: 'Unattributed',
        closingBalance: 1000,
      });
    });

    it('normalises a 403 on the summary into a forbidden error', async () => {
      route({
        '/api/ledger/accounts/1100/summary': () => Promise.reject(forbidden()),
        '/api/ledger/accounts/1100/transactions': [],
      });

      await expect(fetchLedgerDetail({ type: 'ledger', code: '1100' }))
        .rejects.toBeInstanceOf(EntityDetailForbiddenError);
    });

    it('still shows the summary when the transaction read fails', async () => {
      route({
        '/api/ledger/accounts/1100/summary': LEDGER_SUMMARY,
        '/api/ledger/accounts/1100/transactions': () => Promise.reject(new Error('boom')),
      });

      const detail = await fetchLedgerDetail({ type: 'ledger', code: '1100' });

      expect(detail.netBalance).toBe(4000);
      expect(detail.transactions).toEqual([]);
    });

    it('refuses a ledger result with no account code', async () => {
      await expect(fetchLedgerDetail({ type: 'ledger' })).rejects.toThrow(/account code/i);
      expect(api.get).not.toHaveBeenCalled();
    });
  });

  // --- Customer --------------------------------------------------------------

  describe('fetchCustomerDetail', () => {
    it('keeps opening balance, outstanding and total sales as three distinct figures', async () => {
      route({
        '/api/sales/customer-ledger/3/summary': CUSTOMER_SUMMARY,
        '/api/sales/invoices/recent': CUSTOMER_INVOICES,
      });

      const detail = await fetchCustomerDetail({ type: 'customer', id: '3' });

      expect(detail.entityType).toBe('customer');
      expect(detail.customerCode).toBe('CUST-003');
      // The three must not be collapsed: opening balance is not the current balance.
      expect(detail.openingBalance).toBe(1200);
      expect(detail.outstanding).toBe(4550.25);
      expect(detail.totalSales).toBe(18300);
    });

    it('carries contact and credit terms over from the selected search row', async () => {
      route({
        '/api/sales/customer-ledger/3/summary': CUSTOMER_SUMMARY,
        '/api/sales/invoices/recent': CUSTOMER_INVOICES,
      });

      const withMeta = await fetchCustomerDetail({
        type: 'customer',
        id: '3',
        meta: { mobile: '0501234567', email: 'a@acme.test', creditLimitAmount: '25000', blockCredit: true },
      });
      expect(withMeta.mobile).toBe('0501234567');
      expect(withMeta.email).toBe('a@acme.test');
      expect(withMeta.creditLimitAmount).toBe(25000);
      expect(withMeta.creditLimitDays).toBeNull();
      expect(withMeta.blockCredit).toBe(true);

      const bare = await fetchCustomerDetail({ type: 'customer', id: '3' });
      expect(bare.mobile).toBeNull();
      expect(bare.creditLimitAmount).toBeNull();
      expect(bare.blockCredit).toBe(false);
    });

    it('carries no due amount or generic last transaction field', async () => {
      route({
        '/api/sales/customer-ledger/3/summary': CUSTOMER_SUMMARY,
        '/api/sales/invoices/recent': CUSTOMER_INVOICES,
      });

      const detail = await fetchCustomerDetail({ type: 'customer', id: '3' });

      // Total Paid and Overdue now have server-side definitions and are present (see
      // the "customer totals, overdue and last invoice" block). These two do not and
      // will not: Due Amount would be `outstanding` under a second label, and the last
      // document is reported as Last Invoice, named for what it actually is.
      expect(detail).not.toHaveProperty('dueAmount');
      expect(detail).not.toHaveProperty('lastTransaction');
      expect(detail).not.toHaveProperty('lastTransactionDate');
      expect(detail.lastInvoiceDate).toBe('2026-09-20');
    });

    it('asks for recent invoices by customer code, bounded', async () => {
      route({
        '/api/sales/customer-ledger/3/summary': CUSTOMER_SUMMARY,
        '/api/sales/invoices/recent': CUSTOMER_INVOICES,
      });

      await fetchCustomerDetail({ type: 'customer', id: '3' });

      const invoiceCall = api.get.mock.calls.find(([url]) => url === '/api/sales/invoices/recent');
      expect(invoiceCall[1].params).toEqual({
        customerCode: 'CUST-003',
        size: PARTY_DOCUMENT_LIMIT,
      });
      // Never the whole-invoice-table read.
      expect(urlsCalled()).not.toContain('/api/sales/invoices');
    });

    it('echoes each invoice balance rather than deriving it', async () => {
      route({
        '/api/sales/customer-ledger/3/summary': CUSTOMER_SUMMARY,
        '/api/sales/invoices/recent': CUSTOMER_INVOICES,
      });

      const detail = await fetchCustomerDetail({ type: 'customer', id: '3' });

      expect(detail.invoices).toHaveLength(2);
      expect(detail.invoices[0]).toMatchObject({ invoiceNumber: 'INV-0091', balance: 500 });
      expect(detail.invoices[1].balance).toBe(0);
    });

    it('normalises a 403 on the summary into a forbidden error', async () => {
      route({
        '/api/sales/customer-ledger/3/summary': () => Promise.reject(forbidden()),
        '/api/sales/invoices/recent': CUSTOMER_INVOICES,
      });

      await expect(fetchCustomerDetail({ type: 'customer', id: '3' }))
        .rejects.toBeInstanceOf(EntityDetailForbiddenError);
    });

    it('keeps the summary when only the invoice read is denied', async () => {
      route({
        '/api/sales/customer-ledger/3/summary': CUSTOMER_SUMMARY,
        '/api/sales/invoices/recent': () => Promise.reject(forbidden()),
      });

      const detail = await fetchCustomerDetail({ type: 'customer', id: '3' });

      // Partial access: sales.customer granted, sales.invoice not.
      expect(detail.outstanding).toBe(4550.25);
      expect(detail.invoicesForbidden).toBe(true);
      expect(detail.invoices).toEqual([]);
    });

    it('keeps the summary when the invoice read fails outright', async () => {
      route({
        '/api/sales/customer-ledger/3/summary': CUSTOMER_SUMMARY,
        '/api/sales/invoices/recent': () => Promise.reject(new Error('boom')),
      });

      const detail = await fetchCustomerDetail({ type: 'customer', id: '3' });

      expect(detail.outstanding).toBe(4550.25);
      expect(detail.invoicesFailed).toBe(true);
      expect(detail.invoicesForbidden).toBe(false);
    });

    it('skips the invoice read when the customer has no code', async () => {
      route({ '/api/sales/customer-ledger/3/summary': { ...CUSTOMER_SUMMARY, customerCode: null } });

      const detail = await fetchCustomerDetail({ type: 'customer', id: '3' });

      expect(detail.invoices).toEqual([]);
      expect(urlsCalled()).not.toContain('/api/sales/invoices/recent');
    });

    it('refuses a customer result with no id', async () => {
      await expect(fetchCustomerDetail({ type: 'customer' })).rejects.toThrow(/id/i);
      expect(api.get).not.toHaveBeenCalled();
    });
  });

  // --- Vendor ----------------------------------------------------------------

  describe('fetchVendorDetail', () => {
    it('echoes the payable, opening and lifetime-paid figures', async () => {
      route({
        '/api/vendors/21/summary': VENDOR_SUMMARY,
        '/api/lpos/recent': VENDOR_LPOS,
      });

      const detail = await fetchVendorDetail({ type: 'vendor', id: '21' });

      expect(detail.entityType).toBe('vendor');
      expect(detail.vendorCode).toBe('VEN-021');
      expect(detail.payableBalance).toBe(9200);
      expect(detail.openingBalance).toBe(5000);
      expect(detail.openingBalanceOutstanding).toBe(1500);
      // Vendor total paid IS backed by an existing lifetime definition, unlike customer.
      expect(detail.totalPaid).toBe(41000);
    });

    it('carries no per-document due or overdue field', async () => {
      route({
        '/api/vendors/21/summary': VENDOR_SUMMARY,
        '/api/lpos/recent': VENDOR_LPOS,
      });

      const detail = await fetchVendorDetail({ type: 'vendor', id: '21' });

      expect(detail).not.toHaveProperty('dueAmount');
      expect(detail).not.toHaveProperty('overdueAmount');
      expect(detail).not.toHaveProperty('overdueCount');
      // PurchaseInvoice has no per-invoice balance, so no document-level due either.
      expect(detail.lpos[0]).not.toHaveProperty('balance');
    });

    it('echoes the LPO expected delivery date as-is, and null when unset', async () => {
      route({
        '/api/vendors/21/summary': VENDOR_SUMMARY,
        '/api/lpos/recent': [
          { ...VENDOR_LPOS[0], expectedDeliveryDate: '2026-10-02' },
          { id: 8, lpoNumber: 'LPO-0008', lpoDate: '2026-09-01', grandTotal: 10, status: 'DRAFT' },
        ],
      });

      const detail = await fetchVendorDetail({ type: 'vendor', id: '21' });

      expect(detail.lpos[0].expectedDeliveryDate).toBe('2026-10-02');
      expect(detail.lpos[1].expectedDeliveryDate).toBeNull();
    });

    it('takes phone and email from the selected search row, never inventing them', async () => {
      route({
        '/api/vendors/21/summary': VENDOR_SUMMARY,
        '/api/lpos/recent': VENDOR_LPOS,
      });

      const withContact = await fetchVendorDetail({
        type: 'vendor',
        id: '21',
        meta: { phone: '+971 4 234 5678', email: 'sales@techsupply.ae' },
      });
      expect(withContact.phone).toBe('+971 4 234 5678');
      expect(withContact.email).toBe('sales@techsupply.ae');

      const bare = await fetchVendorDetail({ type: 'vendor', id: '21' });
      expect(bare.phone).toBeNull();
      expect(bare.email).toBeNull();
    });

    it('resolves the vendor by id and asks for its LPOs by id, bounded', async () => {
      route({
        '/api/vendors/21/summary': VENDOR_SUMMARY,
        '/api/lpos/recent': VENDOR_LPOS,
      });

      await fetchVendorDetail({ type: 'vendor', id: '21' });

      // The id is the client-side key throughout; the name-keyed accounting is resolved
      // server-side from the authoritative vendor record.
      expect(urlsCalled()).toContain('/api/vendors/21/summary');
      const lpoCall = api.get.mock.calls.find(([url]) => url === '/api/lpos/recent');
      expect(lpoCall[1].params).toEqual({ vendorId: '21', size: PARTY_DOCUMENT_LIMIT });
      // Never the all-vendor list read.
      expect(urlsCalled()).not.toContain('/api/vendors');
    });

    it('normalises a 403 on the summary into a forbidden error', async () => {
      route({
        '/api/vendors/21/summary': () => Promise.reject(forbidden()),
        '/api/lpos/recent': VENDOR_LPOS,
      });

      await expect(fetchVendorDetail({ type: 'vendor', id: '21' }))
        .rejects.toBeInstanceOf(EntityDetailForbiddenError);
    });

    it('keeps the summary when only the LPO read is denied', async () => {
      route({
        '/api/vendors/21/summary': VENDOR_SUMMARY,
        '/api/lpos/recent': () => Promise.reject(forbidden()),
      });

      const detail = await fetchVendorDetail({ type: 'vendor', id: '21' });

      // Partial access: purchases.vendor granted, purchases.lpo not.
      expect(detail.payableBalance).toBe(9200);
      expect(detail.lposForbidden).toBe(true);
      expect(detail.lpos).toEqual([]);
    });

    it('refuses a vendor result with no id', async () => {
      await expect(fetchVendorDetail({ type: 'vendor' })).rejects.toThrow(/id/i);
      expect(api.get).not.toHaveBeenCalled();
    });
  });

  describe('customer totals, overdue and last invoice', () => {
    const routeCustomer = (summary = CUSTOMER_SUMMARY, invoices = CUSTOMER_INVOICES) =>
      route({
        '/api/sales/customer-ledger/3/summary': summary,
        '/api/sales/invoices/recent': invoices,
      });

    it('echoes the server total paid rather than subtracting on the client', async () => {
      routeCustomer();

      const detail = await fetchCustomerDetail({ id: '3' });

      expect(detail.totalPaid).toBe(13749.75);
      // And it is the server's number, not one this file happened to reproduce.
      routeCustomer({ ...CUSTOMER_SUMMARY, totalPaid: 999 });
      const second = await fetchCustomerDetail({ id: '3' });
      expect(second.totalPaid).toBe(999);
    });

    it('carries the overdue amount and count through unchanged', async () => {
      routeCustomer();

      const detail = await fetchCustomerDetail({ id: '3' });

      expect(detail.overdueAmount).toBe(2100.5);
      expect(detail.overdueInvoiceCount).toBe(2);
    });

    it('treats a missing overdue count as zero but a missing amount as absent', async () => {
      // Zero is a truthful count. A missing amount is not zero — it is "the server did
      // not say", and the panel renders that differently.
      routeCustomer({ ...CUSTOMER_SUMMARY, overdueAmount: null, overdueInvoiceCount: null });

      const detail = await fetchCustomerDetail({ id: '3' });

      expect(detail.overdueInvoiceCount).toBe(0);
      expect(detail.overdueAmount).toBeNull();
    });

    it('takes last invoice from the head of the bounded recent list', async () => {
      routeCustomer();

      const detail = await fetchCustomerDetail({ id: '3' });

      // CUSTOMER_INVOICES is newest-first, as the endpoint returns it.
      expect(detail.lastInvoiceDate).toBe('2026-09-20');
      expect(detail.lastInvoiceNumber).toBe('INV-0091');
    });

    it('issues no extra request to find the last invoice', async () => {
      routeCustomer();

      await fetchCustomerDetail({ id: '3' });

      // Exactly two reads: the summary and the bounded recent list. No statement
      // endpoint, no per-customer "latest document" query.
      expect(api.get).toHaveBeenCalledTimes(2);
      expect(urlsCalled().some((u) => u.includes('statement'))).toBe(false);
    });

    it('reports no last invoice rather than guessing when the list is empty', async () => {
      routeCustomer(CUSTOMER_SUMMARY, []);

      const detail = await fetchCustomerDetail({ id: '3' });

      expect(detail.lastInvoiceDate).toBeNull();
      expect(detail.lastInvoiceNumber).toBeNull();
    });

    it('reports no last invoice when the invoice section is denied', async () => {
      route({
        '/api/sales/customer-ledger/3/summary': CUSTOMER_SUMMARY,
        '/api/sales/invoices/recent': () => Promise.reject(forbidden()),
      });

      const detail = await fetchCustomerDetail({ id: '3' });

      // The customer's own figures survive a denial of the invoice section.
      expect(detail.invoicesForbidden).toBe(true);
      expect(detail.lastInvoiceDate).toBeNull();
      expect(detail.totalPaid).toBe(13749.75);
      expect(detail.overdueAmount).toBe(2100.5);
    });

    it('exposes no due amount or last transaction field', async () => {
      routeCustomer();

      const detail = await fetchCustomerDetail({ id: '3' });

      expect(detail).not.toHaveProperty('dueAmount');
      expect(detail).not.toHaveProperty('lastTransaction');
      expect(detail).not.toHaveProperty('lastTransactionDate');
      // Branch breakdown stays deferred for parties; only the ledger panel has one.
      expect(detail).not.toHaveProperty('branchBalances');
      expect(detail).not.toHaveProperty('outstandingByBranch');
    });
  });

  describe('vendor overdue and last LPO', () => {
    const routeVendor = (summary = VENDOR_SUMMARY, lpos = VENDOR_LPOS) =>
      route({
        '/api/vendors/21/summary': summary,
        '/api/lpos/recent': lpos,
      });

    it('carries the overdue invoice count through', async () => {
      routeVendor();

      expect((await fetchVendorDetail({ id: '21' })).overdueInvoiceCount).toBe(3);
    });

    it('never exposes an overdue amount, even if the server were to send one', async () => {
      // PurchaseInvoice stores no per-invoice balance, so there is no honest amount.
      // The shape must not carry one regardless of what arrives.
      routeVendor({ ...VENDOR_SUMMARY, overdueAmount: 12345 });

      const detail = await fetchVendorDetail({ id: '21' });

      expect(detail).not.toHaveProperty('overdueAmount');
      expect(detail).not.toHaveProperty('dueAmount');
    });

    it('treats a missing overdue count as zero', async () => {
      routeVendor({ ...VENDOR_SUMMARY, overdueInvoiceCount: null });

      expect((await fetchVendorDetail({ id: '21' })).overdueInvoiceCount).toBe(0);
    });

    it('takes last LPO from the head of the bounded recent list, with no extra request', async () => {
      routeVendor();

      const detail = await fetchVendorDetail({ id: '21' });

      expect(detail.lastLpoDate).toBe('2026-09-18');
      expect(detail.lastLpoNumber).toBe('LPO-0007');
      expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('reports no last LPO rather than guessing when the list is empty', async () => {
      routeVendor(VENDOR_SUMMARY, []);

      const detail = await fetchVendorDetail({ id: '21' });

      expect(detail.lastLpoDate).toBeNull();
      expect(detail.lastLpoNumber).toBeNull();
    });

    it('exposes no last transaction field', async () => {
      routeVendor();

      const detail = await fetchVendorDetail({ id: '21' });

      expect(detail).not.toHaveProperty('lastTransaction');
      expect(detail).not.toHaveProperty('lastTransactionDate');
    });

    it('keeps the lifetime total paid with no date predicate involved', async () => {
      routeVendor();

      await fetchVendorDetail({ id: '21' });

      // No request carries a from/to/period parameter: Total Paid is lifetime, and
      // nothing on this path may narrow it to a range.
      const configs = api.get.mock.calls.map(([, config]) => config?.params ?? {});
      for (const params of configs) {
        expect(Object.keys(params)).not.toContain('from');
        expect(Object.keys(params)).not.toContain('to');
        expect(Object.keys(params)).not.toContain('fromDate');
        expect(Object.keys(params)).not.toContain('toDate');
        expect(Object.keys(params)).not.toContain('period');
      }
    });
  });

  describe('employee (identity only)', () => {
    const ROW = {
      id: '42',
      type: 'employee',
      title: 'Ahmed Al Mansoori',
      employee: {
        employeeCode: 'EMP-0234',
        name: 'Ahmed Al Mansoori',
        role: 'Senior Sales Executive',
        department: 'Sales',
        branch: 'Dubai',
        status: 'Active',
      },
    };

    const TARGETS = {
      currentMonth: {
        month: '2026-10-01', targetAmount: '50000.00', sales: '36000.00', bills: 12,
        achievementPercent: '72.00', targetStatus: 'On Track',
      },
      previousMonth: {
        month: '2026-09-01', targetAmount: null, sales: '8000.00', bills: 3,
        achievementPercent: null, targetStatus: 'No Target',
      },
    };

    it('renders identity from the search row', async () => {
      api.get.mockResolvedValue({ data: TARGETS });
      const detail = await fetchEmployeeDetail(ROW);

      expect(detail.entityType).toBe('employee');
      expect(detail.name).toBe('Ahmed Al Mansoori');
      expect(detail.employeeCode).toBe('EMP-0234');
      expect(detail.role).toBe('Senior Sales Executive');
      expect(detail.department).toBe('Sales');
      expect(detail.branch).toBe('Dubai');
      expect(detail.status).toBe('Active');
    });

    it('reads only the per-employee targets summary, and passes the server figures through', async () => {
      api.get.mockResolvedValue({ data: TARGETS });
      const detail = await fetchEmployeeDetail(ROW);

      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.get.mock.calls[0][0]).toBe('/api/hr/targets/employee/42');
      expect(detail.targets.currentMonth).toEqual({
        month: '2026-10-01', targetAmount: 50000, sales: 36000, bills: 12,
        achievementPercent: 72, targetStatus: 'On Track',
      });
      // No target stays null — never 0%.
      expect(detail.targets.previousMonth.achievementPercent).toBeNull();
      expect(detail.targets.previousMonth.targetAmount).toBeNull();
    });

    /**
     * The load-bearing test. GET /api/employees/{id} returns the whole Employee,
     * salary columns included. The panel must never cause that payload to exist —
     * and payroll is never read as a side effect of selecting a row.
     */
    it('never reads the full employee record or payroll', async () => {
      api.get.mockResolvedValue({ data: TARGETS });
      await fetchEmployeeDetail(ROW);

      const urls = api.get.mock.calls.map(([url]) => url);
      expect(urls.some((u) => u.startsWith('/api/employees/'))).toBe(false);
      expect(urls.some((u) => u.startsWith('/api/payroll'))).toBe(false);
    });

    it('exposes no salary, commission, attendance or leave field', async () => {
      api.get.mockResolvedValue({
        data: { currentMonth: { ...TARGETS.currentMonth, commission: '500.00', commissionRate: '2.00' } },
      });
      const detail = await fetchEmployeeDetail(ROW);

      const keys = JSON.stringify(detail).toLowerCase();
      for (const fragment of ['salar', 'commission', 'payslip', 'allowance', 'deduction', 'leave', 'attend', 'checkin']) {
        expect(keys).not.toContain(fragment);
      }
    });

    it('does not carry contact or document details either', async () => {
      api.get.mockResolvedValue({ data: TARGETS });
      const detail = await fetchEmployeeDetail(ROW);

      for (const key of ['email', 'phone', 'mobile', 'passportNumber', 'emiratesId', 'visaNumber']) {
        expect(detail).not.toHaveProperty(key);
      }
    });

    it('keeps the identity card when targets are denied or fail', async () => {
      api.get.mockRejectedValueOnce({ response: { status: 403 } });
      const denied = await fetchEmployeeDetail(ROW);
      expect(denied.name).toBe('Ahmed Al Mansoori');
      expect(denied.targets).toBeNull();
      expect(denied.targetsForbidden).toBe(true);

      api.get.mockRejectedValueOnce({ response: { status: 500 } });
      const failed = await fetchEmployeeDetail(ROW);
      expect(failed.targets).toBeNull();
      expect(failed.targetsFailed).toBe(true);
    });

    it('falls back to the row title when the projection is missing', async () => {
      api.get.mockResolvedValue({ data: TARGETS });
      const detail = await fetchEmployeeDetail({ id: '42', type: 'employee', title: 'Unknown Person' });

      expect(detail.name).toBe('Unknown Person');
      expect(detail.employeeCode).toBeNull();
    });
  });

  describe('employee payroll summary (on demand)', () => {
    it('reads the per-employee payroll summary by code and shapes the figures', async () => {
      api.get.mockResolvedValue({
        data: {
          currentMonth: {
            month: 10, year: 2026, baseSalary: '8000.00', allowances: '1500.00',
            deductions: '250.00', netPayable: '9250.00', status: 'Pending',
            // A field the panel must never carry, even if the server ever sends it.
            paymentMethod: 'Bank Transfer',
          },
          ytdYear: 2026,
          salaryYtd: '83250.00',
          latestPayslip: { month: 9, year: 2026, paymentDate: '2026-09-30' },
        },
      });

      const summary = await fetchEmployeePayrollSummary('EMP 0234');

      expect(api.get.mock.calls[0][0]).toBe('/api/payroll/employee/EMP%200234/summary');
      expect(summary.currentMonth).toEqual({
        month: 10, year: 2026, baseSalary: 8000, allowances: 1500,
        deductions: 250, netPayable: 9250, status: 'Pending',
      });
      expect(summary.salaryYtd).toBe(83250);
      expect(summary.latestPayslip).toEqual({ month: 9, year: 2026, paymentDate: '2026-09-30' });
      expect(JSON.stringify(summary)).not.toContain('Bank');
    });

    it('keeps a missing period as null rather than zeros', async () => {
      api.get.mockResolvedValue({ data: { currentMonth: null, ytdYear: 2026, salaryYtd: '0', latestPayslip: null } });

      const summary = await fetchEmployeePayrollSummary('EMP-1');

      expect(summary.currentMonth).toBeNull();
      expect(summary.latestPayslip).toBeNull();
    });

    it('turns a 403 into a forbidden error', async () => {
      api.get.mockRejectedValue({ response: { status: 403 } });

      await expect(fetchEmployeePayrollSummary('EMP-1')).rejects.toBeInstanceOf(EntityDetailForbiddenError);
    });

    it('refuses to run without an employee code', async () => {
      await expect(fetchEmployeePayrollSummary(null)).rejects.toThrow();
      expect(api.get).not.toHaveBeenCalled();
    });
  });
});
