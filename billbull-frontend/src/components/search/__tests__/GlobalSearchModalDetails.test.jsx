import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// --- Module mocks ------------------------------------------------------------

const canViewMock = vi.fn(() => true);
vi.mock('../../../context/PermissionContext', () => ({
  usePermissions: () => ({ canView: canViewMock }),
}));

const globalSearchMock = vi.fn();
// The empty-query preview is stubbed out entirely here. This suite asserts, per entity,
// exactly which requests a selection causes - the preview's own fan-out would show up in
// those counts as five requests nobody in these tests asked for. It has its own tests in
// GlobalSearchModal.test.jsx and globalSearchApi.test.js.
const globalSearchPreviewMock = vi.fn(() => Promise.resolve({ success: true, data: [] }));
vi.mock('../../../api/globalSearchApi', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    globalSearch: (...args) => globalSearchMock(...args),
    globalSearchPreview: (...args) => globalSearchPreviewMock(...args),
  };
});

// The transport is stubbed at the axios boundary, so entityDetailApi's own shaping —
// which URL it calls, which field it reads — is exercised for real here.
const apiGetMock = vi.fn();
vi.mock('../../../api/axiosConfig', () => ({
  default: { get: (...args) => apiGetMock(...args) },
}));

import GlobalSearchModal from '../GlobalSearchModal';

// --- Fixtures ----------------------------------------------------------------

const PRODUCT = {
  id: '11',
  type: 'product',
  code: 'WKB-2024',
  title: 'Wireless Keyboard Pro',
  subtitle: 'SKU-WKB • Electronics',
  meta: { badge: 'Stock: 142' },
};

const PRODUCT_2 = { ...PRODUCT, id: '12', code: 'MSE-2024', title: 'Wireless Mouse' };

const LEDGER = {
  id: 'acc-1',
  type: 'ledger',
  code: '1100',
  title: 'Accounts Receivable',
  subtitle: 'Acc 1100 • Assets',
  meta: { badge: 'Asset' },
};

const VENDOR = {
  id: '21',
  type: 'vendor',
  title: 'TechSupply FZCO',
  subtitle: 'VEN-0021 • Dubai',
  meta: { badge: 'Active' },
};

const CUSTOMER = {
  id: '3',
  type: 'customer',
  title: 'Acme Corp Ltd',
  subtitle: 'CUST-003 • 0501234567',
  meta: { badge: 'Retail' },
};

// Employee now has a panel, but an identity-only one. The row carries the projection
// the panel renders from, because the panel issues no request of its own.
const EMPLOYEE = {
  id: '234',
  type: 'employee',
  title: 'Ahmed Hassan',
  subtitle: 'EMP-234 • Sales',
  employee: {
    employeeCode: 'EMP-234',
    name: 'Ahmed Hassan',
    role: 'Senior Sales Executive',
    department: 'Sales',
    branch: 'Dubai',
    status: 'Active',
  },
};

// A type with no panel at all, for the "details are coming next" placeholder that
// Employee used to stand in for.
const INVOICE = {
  id: '91',
  type: 'invoice',
  title: 'INV-0091',
  subtitle: 'Acme Corp Ltd • 2026-09-20',
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
  // Server-computed: 18300 - 4550.25.
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

const PRODUCT_AGGREGATE = {
  product: { id: 11, code: 'WKB-2024', name: 'Wireless Keyboard Pro', sku: 'SKU-WKB', status: 'ACTIVE' },
  effectivePricing: { retailPrice: 183.5 },
  inventory: { reorderLevel: 25 },
};

const STOCK_AVAILABILITY = {
  locations: [
    { locationId: 1, name: 'Main Warehouse', onHand: 100, reserved: 18, available: 82, uom: 'PCS' },
    { locationId: 2, name: 'Dubai Store', onHand: 42, reserved: 2, available: 40, uom: 'PCS' },
  ],
  incomingLpos: [
    { lpoNumber: 'LPO-0007', expectedDate: '2026-10-12', quantity: 60, supplierName: 'TechSupply' },
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

const LEDGER_SUMMARY_BRANCH_SCOPED = {
  ...LEDGER_SUMMARY,
  debitTotal: 900,
  creditTotal: 100,
  closingBalance: 800,
  branchBalances: [
    { branchId: 3, branchName: 'Deira', debitTotal: 900, creditTotal: 100, closingBalance: 800 },
  ],
};

const LEDGER_TRANSACTIONS = [
  { id: 'le-2', transactionDate: '2026-03-02', voucherNo: 'JV-002', description: 'Invoice', debitAmount: 200, creditAmount: 0, runningBalance: 4000 },
  { id: 'le-1', transactionDate: '2026-03-01', voucherNo: 'JV-001', description: 'Receipt', debitAmount: 0, creditAmount: 50, runningBalance: 3800 },
];

// --- Helpers -----------------------------------------------------------------

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
});

const forbidden = () => Object.assign(new Error('Forbidden'), { response: { status: 403 } });

/** Routes each mocked GET by URL prefix. Anything unrouted is a test bug, not a 404. */
const route = (handlers) => {
  apiGetMock.mockImplementation((url, config) => {
    const key = Object.keys(handlers).find((prefix) => url.startsWith(prefix));
    if (!key) return Promise.reject(new Error(`Unexpected GET ${url}`));
    const value = handlers[key];
    return typeof value === 'function' ? value(url, config) : Promise.resolve({ data: value });
  });
};

const productRoutes = {
  '/api/products/': PRODUCT_AGGREGATE,
  '/api/inventory/stock-availability/by-code/': STOCK_AVAILABILITY,
};

const ledgerRoutes = {
  '/api/ledger/accounts/1100/summary': LEDGER_SUMMARY,
  '/api/ledger/accounts/1100/transactions': LEDGER_TRANSACTIONS,
};

const customerRoutes = {
  '/api/sales/customer-ledger/3/summary': CUSTOMER_SUMMARY,
  '/api/sales/invoices/recent': CUSTOMER_INVOICES,
};

const vendorRoutes = {
  '/api/vendors/21/summary': VENDOR_SUMMARY,
  '/api/lpos/recent': VENDOR_LPOS,
};

const renderModal = () =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <GlobalSearchModal open onOpenChange={vi.fn()} />
    </MemoryRouter>
  );

const searchBox = () => screen.getByLabelText('Search BillBull');

const urlsCalled = () => apiGetMock.mock.calls.map(([url]) => url);

/** Types a query and waits for the result row to appear. */
const search = async (user, term = 'acme') => {
  await user.type(searchBox(), term);
  await screen.findAllByRole('option', {}, { timeout: 3000 });
};

describe('GlobalSearchModal details pane', () => {
  beforeEach(() => {
    canViewMock.mockImplementation(() => true);
    globalSearchMock.mockReset();
    apiGetMock.mockReset();
    globalSearchMock.mockResolvedValue({ success: true, data: [] });
  });

  afterEach(cleanup);

  // --- Product ---------------------------------------------------------------

  describe('product', () => {
    it('fetches on selection — without waiting for Enter — and renders the server figures', async () => {
      const user = userEvent.setup();
      route(productRoutes);
      globalSearchMock.mockResolvedValue({ success: true, data: [PRODUCT] });
      renderModal();

      await search(user);

      expect(await screen.findByTestId('product-detail-panel')).toBeInTheDocument();
      expect(screen.getByTestId('product-on-hand')).toHaveTextContent('142');
      expect(screen.getByTestId('product-reserved')).toHaveTextContent('20');
      expect(screen.getByTestId('product-available')).toHaveTextContent('122');
      expect(screen.getByTestId('product-incoming')).toHaveTextContent('60');
      expect(screen.getByTestId('product-unit-price')).toHaveTextContent('183.50');
      expect(screen.getByTestId('product-reorder-point')).toHaveTextContent('25');
    });

    it('uses the product code, not the id, for the stock lookup', async () => {
      const user = userEvent.setup();
      route(productRoutes);
      globalSearchMock.mockResolvedValue({ success: true, data: [PRODUCT] });
      renderModal();

      await search(user);
      await screen.findByTestId('product-detail-panel');

      expect(urlsCalled()).toContain('/api/inventory/stock-availability/by-code/WKB-2024');
    });

    it('renders the per-location breakdown', async () => {
      const user = userEvent.setup();
      route(productRoutes);
      globalSearchMock.mockResolvedValue({ success: true, data: [PRODUCT] });
      renderModal();

      await search(user);
      const table = await screen.findByTestId('product-location-table');

      expect(table).toHaveTextContent('Main Warehouse');
      expect(table).toHaveTextContent('Dubai Store');
      expect(table).toHaveTextContent('82');
    });

    it('never shows a Damaged figure', async () => {
      const user = userEvent.setup();
      route(productRoutes);
      globalSearchMock.mockResolvedValue({ success: true, data: [PRODUCT] });
      renderModal();

      await search(user);
      await screen.findByTestId('product-detail-panel');

      expect(screen.queryByText(/damaged/i)).not.toBeInTheDocument();
    });

    it('shows an inline permission state on 403, not an empty panel', async () => {
      const user = userEvent.setup();
      route({
        '/api/products/': PRODUCT_AGGREGATE,
        '/api/inventory/stock-availability/by-code/': () => Promise.reject(forbidden()),
      });
      globalSearchMock.mockResolvedValue({ success: true, data: [PRODUCT] });
      renderModal();

      await search(user);

      expect(await screen.findByTestId('entity-detail-forbidden')).toBeInTheDocument();
      expect(screen.getByText(/don't have permission/i)).toBeInTheDocument();
      expect(screen.queryByTestId('product-detail-panel')).not.toBeInTheDocument();
    });

    it('shows an error state — not a permission state — on an ordinary failure', async () => {
      const user = userEvent.setup();
      route({
        '/api/products/': () => Promise.reject(new Error('boom')),
        '/api/inventory/stock-availability/by-code/': () => Promise.reject(new Error('boom')),
      });
      globalSearchMock.mockResolvedValue({ success: true, data: [PRODUCT] });
      renderModal();

      await search(user);
      // The stock read failing softly still yields a panel, flagged as unavailable.
      expect(await screen.findByText(/stock figures are unavailable/i)).toBeInTheDocument();
    });
  });

  // --- Ledger ----------------------------------------------------------------

  describe('ledger account', () => {
    it('renders the server totals and the branch breakdown', async () => {
      const user = userEvent.setup();
      route(ledgerRoutes);
      globalSearchMock.mockResolvedValue({ success: true, data: [LEDGER] });
      renderModal();

      await search(user);

      expect(await screen.findByTestId('ledger-detail-panel')).toBeInTheDocument();
      expect(screen.getByTestId('ledger-net-balance')).toHaveTextContent('4,000.00');
      expect(screen.getByTestId('ledger-total-debit')).toHaveTextContent('5,500.00');
      expect(screen.getByTestId('ledger-total-credit')).toHaveTextContent('1,500.00');

      const branches = screen.getByTestId('ledger-branch-list');
      expect(branches).toHaveTextContent('Dubai');
      // The branch-less balance row is shown, not silently discarded.
      expect(branches).toHaveTextContent('Unattributed');
    });

    /**
     * The backend decides what a branch-restricted user may see (the summary endpoint is
     * scoped server-side); the panel renders exactly that dataset. This asserts the panel
     * adds no branch row of its own — and that it is not relied on to hide one either.
     */
    it('renders only the branch rows the server returned for a restricted user', async () => {
      const user = userEvent.setup();
      route({
        ...ledgerRoutes,
        '/api/ledger/accounts/1100/summary': LEDGER_SUMMARY_BRANCH_SCOPED,
      });
      globalSearchMock.mockResolvedValue({ success: true, data: [LEDGER] });
      renderModal();

      await search(user);

      expect(await screen.findByTestId('ledger-detail-panel')).toBeInTheDocument();
      expect(screen.getByTestId('ledger-net-balance')).toHaveTextContent('800.00');
      expect(screen.getByTestId('ledger-total-debit')).toHaveTextContent('900.00');
      expect(screen.getByTestId('ledger-total-credit')).toHaveTextContent('100.00');

      const branches = screen.getByTestId('ledger-branch-list');
      expect(branches).toHaveTextContent('Deira');
      expect(branches).not.toHaveTextContent('Dubai');
      expect(branches.querySelectorAll('li')).toHaveLength(1);
    });

    it('renders the bounded recent-transaction list newest first', async () => {
      const user = userEvent.setup();
      route(ledgerRoutes);
      globalSearchMock.mockResolvedValue({ success: true, data: [LEDGER] });
      renderModal();

      await search(user);
      const table = await screen.findByTestId('ledger-transaction-table');

      expect(table).toHaveTextContent('JV-002');
      expect(table).toHaveTextContent('JV-001');
      const rows = table.querySelectorAll('tbody tr');
      expect(rows[0]).toHaveTextContent('2026-03-02');
    });

    it('never calls the whole-ledger transactions endpoint', async () => {
      const user = userEvent.setup();
      route(ledgerRoutes);
      globalSearchMock.mockResolvedValue({ success: true, data: [LEDGER] });
      renderModal();

      await search(user);
      await screen.findByTestId('ledger-detail-panel');

      expect(urlsCalled()).not.toContain('/api/ledger/transactions');
      expect(urlsCalled()).toEqual([
        '/api/ledger/accounts/1100/summary',
        '/api/ledger/accounts/1100/transactions',
      ]);
    });

    it('shows an inline permission state on 403', async () => {
      const user = userEvent.setup();
      route({
        '/api/ledger/accounts/1100/summary': () => Promise.reject(forbidden()),
        '/api/ledger/accounts/1100/transactions': [],
      });
      globalSearchMock.mockResolvedValue({ success: true, data: [LEDGER] });
      renderModal();

      await search(user);

      expect(await screen.findByTestId('entity-detail-forbidden')).toBeInTheDocument();
    });

    it('shows an empty transaction state rather than an empty table', async () => {
      const user = userEvent.setup();
      route({ ...ledgerRoutes, '/api/ledger/accounts/1100/transactions': [] });
      globalSearchMock.mockResolvedValue({ success: true, data: [LEDGER] });
      renderModal();

      await search(user);
      await screen.findByTestId('ledger-detail-panel');

      expect(screen.getByText(/no transactions posted/i)).toBeInTheDocument();
    });
  });

  // --- Selection lifecycle ---------------------------------------------------

  describe('selection lifecycle', () => {
    it('does not leave the previous entity on screen under a new selection', async () => {
      const user = userEvent.setup();
      route({ ...productRoutes, ...ledgerRoutes });
      globalSearchMock.mockResolvedValue({ success: true, data: [PRODUCT, LEDGER] });
      renderModal();

      await search(user);
      await screen.findByTestId('product-detail-panel');

      await user.click(screen.getByRole('option', { name: /Accounts Receivable/ }));

      // The product panel must be gone the moment the selection moves, not when the
      // ledger response lands.
      await waitFor(() =>
        expect(screen.queryByTestId('product-detail-panel')).not.toBeInTheDocument()
      );
      expect(await screen.findByTestId('ledger-detail-panel')).toBeInTheDocument();
    });

    it('serves a revisited selection from cache without a second round of requests', async () => {
      const user = userEvent.setup();
      route({ ...productRoutes, '/api/products/12': { ...PRODUCT_AGGREGATE, product: { ...PRODUCT_AGGREGATE.product, id: 12, code: 'MSE-2024', name: 'Wireless Mouse' } } });
      globalSearchMock.mockResolvedValue({ success: true, data: [PRODUCT, PRODUCT_2] });
      renderModal();

      await search(user);
      await screen.findByTestId('product-detail-panel');
      const afterFirst = apiGetMock.mock.calls.length;

      await user.click(screen.getByRole('option', { name: /Wireless Mouse/ }));
      await waitFor(() => expect(apiGetMock.mock.calls.length).toBeGreaterThan(afterFirst));
      const afterSecond = apiGetMock.mock.calls.length;

      await user.click(screen.getByRole('option', { name: /Wireless Keyboard Pro/ }));
      await screen.findByTestId('product-detail-panel');

      expect(apiGetMock.mock.calls.length).toBe(afterSecond);
    });

    it('keeps the truthful placeholder for a type with no panel yet', async () => {
      const user = userEvent.setup();
      globalSearchMock.mockResolvedValue({ success: true, data: [INVOICE] });
      renderModal();

      await search(user);

      expect(await screen.findByText('Details are coming next.')).toBeInTheDocument();
      // A type with no panel must not reach the network at all.
      expect(apiGetMock).not.toHaveBeenCalled();
    });

    it('shows the empty state when nothing is selected', async () => {
      renderModal();
      expect(await screen.findByText('Select a result')).toBeInTheDocument();
      expect(apiGetMock).not.toHaveBeenCalled();
    });
  });

  // --- Customer --------------------------------------------------------------

  describe('customer', () => {
    it('renders opening balance, outstanding and total sales as separate figures', async () => {
      const user = userEvent.setup();
      route(customerRoutes);
      globalSearchMock.mockResolvedValue({ success: true, data: [CUSTOMER] });
      renderModal();

      await search(user);

      expect(await screen.findByTestId('customer-detail-panel')).toBeInTheDocument();
      expect(screen.getByTestId('customer-opening-balance')).toHaveTextContent('1,200.00');
      expect(screen.getByTestId('customer-outstanding')).toHaveTextContent('4,550.25');
      expect(screen.getByTestId('customer-total-sales')).toHaveTextContent('18,300.00');
    });

    it('renders total paid as the server sent it, without re-deriving it', async () => {
      const user = userEvent.setup();
      // A deliberately inconsistent payload: if the panel were doing the subtraction
      // itself it would show 13,749.75 and this would fail.
      route({
        ...customerRoutes,
        '/api/sales/customer-ledger/3/summary': { ...CUSTOMER_SUMMARY, totalPaid: 7.5 },
      });
      globalSearchMock.mockResolvedValue({ success: true, data: [CUSTOMER] });
      renderModal();

      await search(user);

      expect(await screen.findByTestId('customer-total-paid')).toHaveTextContent('7.50');
    });

    it('renders the overdue amount and invoice count', async () => {
      const user = userEvent.setup();
      route(customerRoutes);
      globalSearchMock.mockResolvedValue({ success: true, data: [CUSTOMER] });
      renderModal();

      await search(user);

      expect(await screen.findByTestId('customer-overdue-amount')).toHaveTextContent('2,100.50');
      expect(screen.getByTestId('customer-overdue-count')).toHaveTextContent('2');
    });

    it('says nothing is past due rather than showing a zero amount', async () => {
      const user = userEvent.setup();
      route({
        ...customerRoutes,
        '/api/sales/customer-ledger/3/summary': {
          ...CUSTOMER_SUMMARY, overdueAmount: 0, overdueInvoiceCount: 0,
        },
      });
      globalSearchMock.mockResolvedValue({ success: true, data: [CUSTOMER] });
      renderModal();

      await search(user);

      expect(await screen.findByTestId('customer-overdue-none')).toBeInTheDocument();
      expect(screen.queryByTestId('customer-overdue-amount')).not.toBeInTheDocument();
    });

    it('shows the last invoice date from the recent list', async () => {
      const user = userEvent.setup();
      route(customerRoutes);
      globalSearchMock.mockResolvedValue({ success: true, data: [CUSTOMER] });
      renderModal();

      await search(user);

      const lastInvoice = await screen.findByTestId('customer-last-invoice');
      expect(lastInvoice).toHaveTextContent('2026-09-20');
      expect(lastInvoice).toHaveTextContent('INV-0091');
    });

    it('shows no due amount, generic last transaction or branch breakdown', async () => {
      const user = userEvent.setup();
      route(customerRoutes);
      globalSearchMock.mockResolvedValue({ success: true, data: [CUSTOMER] });
      renderModal();

      await search(user);
      const panel = await screen.findByTestId('customer-detail-panel');

      // Due Amount would be Outstanding under a second label; Last Transaction is
      // replaced by the precisely-named Last Invoice; party branch breakdowns stay
      // deferred.
      //
      // Anchored on the whole label: "Overdue amount" contains "due amount", and that
      // card is supposed to be here.
      expect(screen.queryByText(/^due amount$/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/^overdue amount$/i)).toBeInTheDocument();
      expect(panel).not.toHaveTextContent(/last transaction/i);
      expect(panel).not.toHaveTextContent(/activity by branch/i);
      expect(panel).not.toHaveTextContent(/outstanding by branch/i);
      expect(panel).not.toHaveTextContent(/paid by branch/i);
    });

    it('renders the bounded recent-invoice list with each invoice balance', async () => {
      const user = userEvent.setup();
      route(customerRoutes);
      globalSearchMock.mockResolvedValue({ success: true, data: [CUSTOMER] });
      renderModal();

      await search(user);
      const table = await screen.findByTestId('customer-invoice-table');

      expect(table).toHaveTextContent('INV-0091');
      expect(table).toHaveTextContent('INV-0088');
      expect(table).toHaveTextContent('500.00');
    });

    it('never falls back to the whole-invoice-table read', async () => {
      const user = userEvent.setup();
      route(customerRoutes);
      globalSearchMock.mockResolvedValue({ success: true, data: [CUSTOMER] });
      renderModal();

      await search(user);
      await screen.findByTestId('customer-detail-panel');

      expect(urlsCalled()).toContain('/api/sales/invoices/recent');
      expect(urlsCalled()).not.toContain('/api/sales/invoices');
      expect(urlsCalled()).not.toContain('/api/sales/customer-ledger');
    });

    it('denies the whole pane when the customer summary is forbidden', async () => {
      const user = userEvent.setup();
      route({
        '/api/sales/customer-ledger/3/summary': () => Promise.reject(forbidden()),
        '/api/sales/invoices/recent': CUSTOMER_INVOICES,
      });
      globalSearchMock.mockResolvedValue({ success: true, data: [CUSTOMER] });
      renderModal();

      await search(user);

      expect(await screen.findByTestId('entity-detail-forbidden')).toBeInTheDocument();
    });

    it('keeps identity and figures visible when only invoices are forbidden', async () => {
      const user = userEvent.setup();
      route({
        '/api/sales/customer-ledger/3/summary': CUSTOMER_SUMMARY,
        '/api/sales/invoices/recent': () => Promise.reject(forbidden()),
      });
      globalSearchMock.mockResolvedValue({ success: true, data: [CUSTOMER] });
      renderModal();

      await search(user);

      // Partial access: the pane still renders, only the section it may not see is denied.
      expect(await screen.findByTestId('customer-detail-panel')).toBeInTheDocument();
      expect(screen.getByTestId('customer-outstanding')).toHaveTextContent('4,550.25');
      expect(screen.getByTestId('entity-detail-section-forbidden')).toBeInTheDocument();
      expect(screen.queryByTestId('customer-invoice-table')).not.toBeInTheDocument();
    });

    it('shows an inline error when the summary read fails', async () => {
      const user = userEvent.setup();
      route({ '/api/sales/customer-ledger/3/summary': () => Promise.reject(new Error('boom')) });
      globalSearchMock.mockResolvedValue({ success: true, data: [CUSTOMER] });
      renderModal();

      await search(user);

      expect(await screen.findByTestId('entity-detail-error')).toBeInTheDocument();
    });

    it('shows the empty state for a customer with no invoices', async () => {
      const user = userEvent.setup();
      route({
        '/api/sales/customer-ledger/3/summary': CUSTOMER_SUMMARY,
        '/api/sales/invoices/recent': [],
      });
      globalSearchMock.mockResolvedValue({ success: true, data: [CUSTOMER] });
      renderModal();

      await search(user);

      expect(await screen.findByText('No invoices raised for this customer.')).toBeInTheDocument();
    });
  });

  // --- Vendor ----------------------------------------------------------------

  describe('vendor', () => {
    it('renders the payables figures, including a lifetime total paid', async () => {
      const user = userEvent.setup();
      route(vendorRoutes);
      globalSearchMock.mockResolvedValue({ success: true, data: [VENDOR] });
      renderModal();

      await search(user);

      expect(await screen.findByTestId('vendor-detail-panel')).toBeInTheDocument();
      expect(screen.getByTestId('vendor-payable-balance')).toHaveTextContent('9,200.00');
      expect(screen.getByTestId('vendor-opening-balance')).toHaveTextContent('5,000.00');
      expect(screen.getByTestId('vendor-total-paid')).toHaveTextContent('41,000.00');
      expect(screen.getByTestId('vendor-opening-outstanding')).toHaveTextContent('1,500.00');
    });

    it('shows how many invoices are past due, and never how much', async () => {
      const user = userEvent.setup();
      route(vendorRoutes);
      globalSearchMock.mockResolvedValue({ success: true, data: [VENDOR] });
      renderModal();

      await search(user);

      expect(await screen.findByTestId('vendor-overdue-count')).toHaveTextContent('3');
      const panel = screen.getByTestId('vendor-detail-panel');
      // PurchaseInvoice has no per-invoice balance, so no amount may appear here — not
      // even the gross grandTotal of the past-due invoices.
      expect(panel).not.toHaveTextContent(/overdue amount/i);
      expect(panel).not.toHaveTextContent(/due amount/i);
      expect(screen.queryByTestId('vendor-overdue-amount')).not.toBeInTheDocument();
      // The vendor's own gross figures must not be recycled into an overdue amount.
      expect(panel).not.toHaveTextContent('AED 3,200.00 past due');
    });

    it('stays silent about overdue when the vendor has nothing past due', async () => {
      const user = userEvent.setup();
      route({
        ...vendorRoutes,
        '/api/vendors/21/summary': { ...VENDOR_SUMMARY, overdueInvoiceCount: 0 },
      });
      globalSearchMock.mockResolvedValue({ success: true, data: [VENDOR] });
      renderModal();

      await search(user);
      await screen.findByTestId('vendor-detail-panel');

      expect(screen.queryByTestId('vendor-overdue-count')).not.toBeInTheDocument();
    });

    it('shows the last LPO date and no generic last transaction', async () => {
      const user = userEvent.setup();
      route(vendorRoutes);
      globalSearchMock.mockResolvedValue({ success: true, data: [VENDOR] });
      renderModal();

      await search(user);

      const lastLpo = await screen.findByTestId('vendor-last-lpo');
      expect(lastLpo).toHaveTextContent('2026-09-18');
      expect(lastLpo).toHaveTextContent('LPO-0007');
      expect(screen.getByTestId('vendor-detail-panel'))
        .not.toHaveTextContent(/last transaction/i);
    });

    it('renders the bounded recent-LPO list with status', async () => {
      const user = userEvent.setup();
      route(vendorRoutes);
      globalSearchMock.mockResolvedValue({ success: true, data: [VENDOR] });
      renderModal();

      await search(user);
      const table = await screen.findByTestId('vendor-lpo-table');

      expect(table).toHaveTextContent('LPO-0007');
      expect(table).toHaveTextContent('APPROVED');
      expect(table).toHaveTextContent('3,200.00');
    });

    it('resolves the vendor by id and never aggregates every vendor', async () => {
      const user = userEvent.setup();
      route(vendorRoutes);
      globalSearchMock.mockResolvedValue({ success: true, data: [VENDOR] });
      renderModal();

      await search(user);
      await screen.findByTestId('vendor-detail-panel');

      expect(urlsCalled()).toContain('/api/vendors/21/summary');
      expect(urlsCalled()).not.toContain('/api/vendors');
    });

    it('keeps identity and figures visible when only purchase orders are forbidden', async () => {
      const user = userEvent.setup();
      route({
        '/api/vendors/21/summary': VENDOR_SUMMARY,
        '/api/lpos/recent': () => Promise.reject(forbidden()),
      });
      globalSearchMock.mockResolvedValue({ success: true, data: [VENDOR] });
      renderModal();

      await search(user);

      expect(await screen.findByTestId('vendor-detail-panel')).toBeInTheDocument();
      expect(screen.getByTestId('vendor-payable-balance')).toHaveTextContent('9,200.00');
      expect(screen.getByTestId('entity-detail-section-forbidden')).toBeInTheDocument();
      expect(screen.queryByTestId('vendor-lpo-table')).not.toBeInTheDocument();
    });

    it('denies the whole pane when the vendor summary is forbidden', async () => {
      const user = userEvent.setup();
      route({
        '/api/vendors/21/summary': () => Promise.reject(forbidden()),
        '/api/lpos/recent': VENDOR_LPOS,
      });
      globalSearchMock.mockResolvedValue({ success: true, data: [VENDOR] });
      renderModal();

      await search(user);

      expect(await screen.findByTestId('entity-detail-forbidden')).toBeInTheDocument();
    });
  });

  // --- Switching between the two ---------------------------------------------

  describe('switching between a customer and a vendor', () => {
    it('never shows one entity\'s figures under the other\'s name', async () => {
      const user = userEvent.setup();
      route({ ...customerRoutes, ...vendorRoutes });
      globalSearchMock.mockResolvedValue({ success: true, data: [CUSTOMER, VENDOR] });
      renderModal();

      await search(user);
      await screen.findByTestId('customer-detail-panel');

      await user.click(screen.getByRole('option', { name: /TechSupply FZCO/ }));
      expect(await screen.findByTestId('vendor-detail-panel')).toBeInTheDocument();
      // The customer pane and every figure on it are gone, not merely covered.
      expect(screen.queryByTestId('customer-detail-panel')).not.toBeInTheDocument();
      expect(screen.queryByTestId('customer-outstanding')).not.toBeInTheDocument();

      await user.click(screen.getByRole('option', { name: /Acme Corp Ltd/ }));
      expect(await screen.findByTestId('customer-detail-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('vendor-detail-panel')).not.toBeInTheDocument();
      expect(screen.queryByTestId('vendor-payable-balance')).not.toBeInTheDocument();
    });

    it('serves the second visit to a row from the session cache', async () => {
      const user = userEvent.setup();
      route({ ...customerRoutes, ...vendorRoutes });
      globalSearchMock.mockResolvedValue({ success: true, data: [CUSTOMER, VENDOR] });
      renderModal();

      await search(user);
      await screen.findByTestId('customer-detail-panel');

      await user.click(screen.getByRole('option', { name: /TechSupply FZCO/ }));
      await screen.findByTestId('vendor-detail-panel');
      const afterVendor = apiGetMock.mock.calls.length;

      await user.click(screen.getByRole('option', { name: /Acme Corp Ltd/ }));
      await screen.findByTestId('customer-detail-panel');

      expect(apiGetMock.mock.calls.length).toBe(afterVendor);
    });
  });

  // --- Employee --------------------------------------------------------------

  describe('employee (identity only)', () => {
    const renderEmployee = async (user) => {
      globalSearchMock.mockResolvedValue({ success: true, data: [EMPLOYEE] });
      renderModal();
      await search(user);
      return screen.findByTestId('employee-detail-panel');
    };

    it('renders the identity fields', async () => {
      const user = userEvent.setup();
      const panel = await renderEmployee(user);

      expect(panel).toBeInTheDocument();
      expect(screen.getByTestId('employee-code')).toHaveTextContent('EMP-234');
      expect(screen.getByTestId('employee-role')).toHaveTextContent('Senior Sales Executive');
      expect(screen.getByTestId('employee-department')).toHaveTextContent('Sales');
      expect(screen.getByTestId('employee-branch')).toHaveTextContent('Dubai');
      expect(screen.getByTestId('employee-status')).toHaveTextContent('Active');
    });

    /**
     * The load-bearing test for the whole panel. GET /api/employees/{id} returns the
     * full Employee including salary columns; the panel must never cause that request.
     */
    it('reaches the network not at all', async () => {
      const user = userEvent.setup();
      await renderEmployee(user);

      expect(apiGetMock).not.toHaveBeenCalled();
      expect(urlsCalled().some((u) => u.includes('/api/employees/'))).toBe(false);
    });

    it('shows no salary, payroll, attendance, leave or performance data', async () => {
      const user = userEvent.setup();
      const panel = await renderEmployee(user);

      for (const pattern of [
        /basic salary/i, /\ballowances\b/i, /\bdeductions\b/i, /net pay/i,
        /salary ytd/i, /payslip/i, /performance/i,
        /\bpresent\b/i, /\babsent\b/i, /check-?in/i,
        /annual leave/i, /sick leave/i, /leave balance/i, /pending leave/i,
      ]) {
        expect(panel).not.toHaveTextContent(pattern);
      }
    });

    it('offers a way into the HR record without opening one itself', async () => {
      const user = userEvent.setup();
      await renderEmployee(user);

      // The action exists — the panel is a pointer to the record, not the record.
      expect(screen.getByTestId('employee-open-record')).toBeInTheDocument();
      // And it still has not fetched anything.
      expect(apiGetMock).not.toHaveBeenCalled();
    });

    it('renders without a code rather than blanking when the projection is thin', async () => {
      const user = userEvent.setup();
      globalSearchMock.mockResolvedValue({
        success: true,
        data: [{ id: '234', type: 'employee', title: 'Ahmed Hassan' }],
      });
      renderModal();
      await search(user);

      expect(await screen.findByTestId('employee-detail-panel')).toHaveTextContent('Ahmed Hassan');
      expect(apiGetMock).not.toHaveBeenCalled();
    });
  });
});
