import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../axiosConfig', () => ({
  default: { get: vi.fn() },
}));

import api from '../axiosConfig';
import {
  DASHBOARD_SEARCH_SOURCE_KEYS,
  GLOBAL_SEARCH_CATEGORIES,
  MODAL_SEARCH_RESULT_LIMIT,
  SEARCH_CATEGORY,
  PREVIEW_PER_CATEGORY,
  clearGlobalSearchCache,
  globalSearch,
  globalSearchPreview,
  isCategorySupported,
} from '../globalSearchApi';

const productRow = { id: 1, name: 'Wireless Keyboard Pro', sku: 'WKB-2024', quantity: 142, sellingPrice: 183.5 };
const customerRow = { id: 9, name: 'Acme Corp Ltd', code: 'CUS-0042', mobile: '+971 50 234 5678' };
const vendorRow = {
  id: 21, code: 'VEN-0021', name: 'TechSupply FZCO', email: 'sales@techsupply.ae',
  contact: '+971 4 234 5678', mobile: '+971 50 111 2222', status: 'Active', branch: 'Dubai',
};
const ledgerRow = {
  id: 'acc-1', code: '1100', name: 'Accounts Receivable',
  accountType: 'Asset', accountGroup: 'Assets', status: 'active', isGroup: false,
};
const employeeRow = {
  id: 234, employeeCode: 'EMP-0234', name: 'Ahmed Al Mansoori',
  role: 'Senior Sales Executive', department: 'Sales', branch: 'Dubai', status: 'Active',
};

/** Routes each endpoint to a canned payload; anything unlisted returns []. */
const mockEndpoints = (byUrl) => {
  api.get.mockImplementation((url) => Promise.resolve({ data: byUrl[url] ?? [] }));
};

describe('globalSearchApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGlobalSearchCache();
  });

  it('exposes the six designer categories', () => {
    expect(GLOBAL_SEARCH_CATEGORIES.map((c) => c.id)).toEqual([
      'all', 'products', 'customers', 'vendors', 'ledger', 'employees',
    ]);
  });

  it('backs every designer category with a real search source', () => {
    // Phase 2A wired vendors, ledger and employees; none of the six is a stub now.
    Object.values(SEARCH_CATEGORY).forEach((category) => {
      expect(isCategorySupported(category)).toBe(true);
    });
  });

  it('returns nothing and issues no request for a query under two characters', async () => {
    const res = await globalSearch('a');
    expect(res).toEqual({ success: true, data: [] });
    expect(api.get).not.toHaveBeenCalled();
  });

  it('fans out across every source for the "all" category', async () => {
    mockEndpoints({
      '/api/products/search': [productRow],
      '/api/sales/customer-ledger/search': [customerRow],
    });

    const res = await globalSearch('acme');

    expect(api.get).toHaveBeenCalledTimes(9);
    expect(res.data.map((r) => r.type)).toEqual(['product', 'customer']);
    expect(res.data[0]).toMatchObject({
      id: '1',
      type: 'product',
      title: 'Wireless Keyboard Pro',
      meta: { badge: 'Stock: 142' },
    });
  });

  it('queries only the matching source when a category is given', async () => {
    mockEndpoints({ '/api/products/search': [productRow] });

    const res = await globalSearch('keyboard', { category: SEARCH_CATEGORY.PRODUCTS });

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/api/products/search', expect.objectContaining({
      params: { q: 'keyboard', size: 3 },
    }));
    expect(res.data).toHaveLength(1);
  });

  it('issues no request for a category outside the allowed source keys', async () => {
    // The dashboard preset excludes employees, so that category has no source for it.
    const res = await globalSearch('ahmed', {
      category: SEARCH_CATEGORY.EMPLOYEES,
      sourceKeys: DASHBOARD_SEARCH_SOURCE_KEYS,
    });
    expect(api.get).not.toHaveBeenCalled();
    expect(res.data).toEqual([]);
  });

  it('skips sources the user cannot view so they never 403', async () => {
    mockEndpoints({ '/api/sales/customer-ledger/search': [customerRow] });

    const canView = vi.fn((mod) => mod === 'sales.customer');
    const res = await globalSearch('acme', { canView });

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/api/sales/customer-ledger/search', expect.anything());
    expect(res.data.every((r) => r.type === 'customer')).toBe(true);
  });

  it('reads paged responses from their content array', async () => {
    api.get.mockImplementation((url) =>
      url === '/api/sales/invoices/page'
        ? Promise.resolve({ data: { content: [{ id: 5, invoiceNumber: 'INV-0892', invoiceTotal: 15400 }] } })
        : Promise.resolve({ data: [] })
    );

    const res = await globalSearch('inv-0892');
    expect(res.data[0]).toMatchObject({ type: 'invoice', title: 'INV-0892' });
  });

  it('survives a failing source and still returns the others', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/products/search') return Promise.reject(new Error('boom'));
      if (url === '/api/sales/customer-ledger/search') return Promise.resolve({ data: [customerRow] });
      return Promise.resolve({ data: [] });
    });

    const res = await globalSearch('acme');
    expect(res.success).toBe(true);
    expect(res.data.map((r) => r.type)).toEqual(['customer']);
  });

  it('reports partial results as each source lands', async () => {
    mockEndpoints({
      '/api/products/search': [productRow],
      '/api/sales/customer-ledger/search': [customerRow],
    });

    const onPartial = vi.fn();
    await globalSearch('acme', { onPartial });

    expect(onPartial).toHaveBeenCalled();
    // The final partial carries the complete, source-ordered list.
    const last = onPartial.mock.calls.at(-1)[0];
    expect(last.map((r) => r.type)).toEqual(['product', 'customer']);
  });

  it('serves a repeated term from cache without re-requesting', async () => {
    mockEndpoints({ '/api/products/search': [productRow] });

    await globalSearch('keyboard', { category: SEARCH_CATEGORY.PRODUCTS });
    expect(api.get).toHaveBeenCalledTimes(1);

    const second = await globalSearch('KEYBOARD', { category: SEARCH_CATEGORY.PRODUCTS });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(second.data).toHaveLength(1);
  });

  it('does not serve a permission-filtered result set to a broader search', async () => {
    mockEndpoints({
      '/api/products/search': [productRow],
      '/api/sales/customer-ledger/search': [customerRow],
    });

    await globalSearch('acme', { canView: (m) => m === 'sales.customer' });
    api.get.mockClear();

    const full = await globalSearch('acme');
    expect(api.get).toHaveBeenCalledTimes(9);
    expect(full.data.map((r) => r.type)).toEqual(['product', 'customer']);
  });

  it('passes the abort signal through and does not cache an aborted run', async () => {
    mockEndpoints({ '/api/products/search': [productRow] });

    const controller = new AbortController();
    controller.abort();
    await globalSearch('keyboard', { category: SEARCH_CATEGORY.PRODUCTS, signal: controller.signal });

    expect(api.get).toHaveBeenCalledWith('/api/products/search', expect.objectContaining({
      signal: controller.signal,
    }));

    api.get.mockClear();
    await globalSearch('keyboard', { category: SEARCH_CATEGORY.PRODUCTS });
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('suppresses partial callbacks once the request is aborted', async () => {
    mockEndpoints({ '/api/products/search': [productRow] });

    const controller = new AbortController();
    controller.abort();
    const onPartial = vi.fn();
    await globalSearch('keyboard', {
      category: SEARCH_CATEGORY.PRODUCTS,
      signal: controller.signal,
      onPartial,
    });

    expect(onPartial).not.toHaveBeenCalled();
  });

  // -- Phase 2A sources ------------------------------------------------------

  describe('vendor / ledger / employee sources', () => {
    it('dispatches the vendor search endpoint for the vendors category', async () => {
      mockEndpoints({ '/api/vendors/search': [vendorRow] });

      const res = await globalSearch('tech', { category: SEARCH_CATEGORY.VENDORS });

      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.get).toHaveBeenCalledWith('/api/vendors/search', expect.objectContaining({
        params: { q: 'tech', size: 3 },
      }));
      expect(res.data[0]).toMatchObject({
        id: '21',
        type: 'vendor',
        title: 'TechSupply FZCO',
        subtitle: 'VEN-0021 \u2022 +971 4 234 5678 \u2022 Dubai',
        meta: { badge: 'Active' },
      });
    });

    it('dispatches the ledger account search endpoint for the ledger category', async () => {
      mockEndpoints({ '/api/ledger/accounts/search': [ledgerRow] });

      const res = await globalSearch('receiv', { category: SEARCH_CATEGORY.LEDGER });

      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.get).toHaveBeenCalledWith('/api/ledger/accounts/search', expect.objectContaining({
        params: { q: 'receiv', size: 3 },
      }));
      expect(res.data[0]).toMatchObject({
        id: 'acc-1',
        type: 'ledger',
        title: 'Accounts Receivable',
        subtitle: 'Acc 1100 \u2022 Assets',
        meta: { badge: 'Asset' },
      });
    });

    it('dispatches the employee search endpoint for the employees category', async () => {
      mockEndpoints({ '/api/employees/search': [employeeRow] });

      const res = await globalSearch('ahmed', { category: SEARCH_CATEGORY.EMPLOYEES });

      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.get).toHaveBeenCalledWith('/api/employees/search', expect.objectContaining({
        params: { q: 'ahmed', size: 3 },
      }));
      expect(res.data[0]).toMatchObject({
        id: '234',
        type: 'employee',
        title: 'Ahmed Al Mansoori',
        subtitle: 'EMP-0234 \u2022 Senior Sales Executive \u2022 Dubai',
        meta: { badge: 'Active' },
      });
    });

    it('omits missing subtitle parts instead of leaving empty separators', async () => {
      mockEndpoints({ '/api/vendors/search': [{ id: 1, name: 'Bare Vendor' }] });

      const res = await globalSearch('bare', { category: SEARCH_CATEGORY.VENDORS });

      expect(res.data[0].subtitle).toBe('');
      expect(res.data[0].meta.badge).toBeUndefined();
    });

    it('includes all three new sources in the "all" fan-out', async () => {
      mockEndpoints({
        '/api/vendors/search': [vendorRow],
        '/api/ledger/accounts/search': [ledgerRow],
        '/api/employees/search': [employeeRow],
      });

      const res = await globalSearch('ac', { maxResults: MODAL_SEARCH_RESULT_LIMIT });
      expect(res.data.map((r) => r.type)).toEqual(['vendor', 'ledger', 'employee']);
    });

    it('never dispatches a source the permission predicate denies', async () => {
      mockEndpoints({ '/api/employees/search': [employeeRow] });

      const canView = vi.fn((mod) => mod === 'hr.employee');
      const res = await globalSearch('ahmed', { canView });

      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.get).toHaveBeenCalledWith('/api/employees/search', expect.anything());
      expect(res.data.map((r) => r.type)).toEqual(['employee']);
    });

    it('returns nothing for a denied category without any request', async () => {
      const res = await globalSearch('ahmed', {
        category: SEARCH_CATEGORY.EMPLOYEES,
        canView: () => false,
      });

      expect(api.get).not.toHaveBeenCalled();
      expect(res.data).toEqual([]);
    });

    it('isolates a failing new source from the others', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/api/ledger/accounts/search') return Promise.reject(new Error('boom'));
        if (url === '/api/vendors/search') return Promise.resolve({ data: [vendorRow] });
        return Promise.resolve({ data: [] });
      });

      const res = await globalSearch('acme', { maxResults: MODAL_SEARCH_RESULT_LIMIT });

      expect(res.success).toBe(true);
      expect(res.data.map((r) => r.type)).toEqual(['vendor']);
    });

    it('passes the abort signal to the new endpoints', async () => {
      mockEndpoints({ '/api/employees/search': [employeeRow] });
      const controller = new AbortController();

      await globalSearch('ahmed', {
        category: SEARCH_CATEGORY.EMPLOYEES,
        signal: controller.signal,
      });

      expect(api.get).toHaveBeenCalledWith('/api/employees/search', expect.objectContaining({
        signal: controller.signal,
      }));
    });

    it('caps each new source at three rows', async () => {
      const many = Array.from({ length: 12 }, (_, i) => ({ ...employeeRow, id: i }));
      mockEndpoints({ '/api/employees/search': many });

      const res = await globalSearch('ahmed', { category: SEARCH_CATEGORY.EMPLOYEES });
      expect(res.data).toHaveLength(3);
    });
  });

  describe('dashboard source preset', () => {
    it('keeps the original six sources and adds vendors and ledger accounts', async () => {
      mockEndpoints({
        '/api/products/search': [productRow],
        '/api/vendors/search': [vendorRow],
        '/api/ledger/accounts/search': [ledgerRow],
        '/api/employees/search': [employeeRow],
      });

      const res = await globalSearch('acme', { sourceKeys: DASHBOARD_SEARCH_SOURCE_KEYS });

      // Six original sources plus vendors and ledger accounts, both of which now have a
      // verified navigation contract.
      expect(api.get).toHaveBeenCalledTimes(8);
      expect(api.get).toHaveBeenCalledWith('/api/vendors/search', expect.anything());
      expect(api.get).toHaveBeenCalledWith('/api/ledger/accounts/search', expect.anything());
      // The original six are all still there.
      for (const url of [
        '/api/products/search',
        '/api/sales/customer-ledger/search',
        '/api/sales/invoices/page',
        '/api/lpos/page',
        '/api/grns/page',
        '/api/sales/quotations/page',
      ]) {
        expect(api.get).toHaveBeenCalledWith(url, expect.anything());
      }
      expect(res.data.map((r) => r.type)).toEqual(['product', 'vendor', 'ledger']);
    });

    /**
     * Employees stay off the dashboard by decision, not because the route is missing.
     * The dropdown is the most ambiently-visible search surface in the app; employee
     * records are opened deliberately, from the modal.
     */
    it('never searches employees from the dashboard', async () => {
      mockEndpoints({ '/api/employees/search': [employeeRow] });

      const res = await globalSearch('ahmed', { sourceKeys: DASHBOARD_SEARCH_SOURCE_KEYS });

      expect(api.get).not.toHaveBeenCalledWith('/api/employees/search', expect.anything());
      expect(res.data.map((r) => r.type)).not.toContain('employee');
      expect(DASHBOARD_SEARCH_SOURCE_KEYS).not.toContain('employees');
    });

    it('defaults the combined result cap to twelve and lets the modal raise it', async () => {
      const many = (row) => Array.from({ length: 5 }, (_, i) => ({ ...row, id: i }));
      mockEndpoints({
        '/api/products/search': many(productRow),
        '/api/sales/customer-ledger/search': many(customerRow),
        '/api/vendors/search': many(vendorRow),
        '/api/ledger/accounts/search': many(ledgerRow),
        '/api/employees/search': many(employeeRow),
      });

      const capped = await globalSearch('acme');
      expect(capped.data).toHaveLength(12);

      const raised = await globalSearch('acme', { maxResults: MODAL_SEARCH_RESULT_LIMIT });
      expect(raised.data).toHaveLength(15);
    });
  });

  it('caps each source at its configured limit', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...productRow, id: i }));
    mockEndpoints({ '/api/products/search': many });

    const res = await globalSearch('keyboard', { category: SEARCH_CATEGORY.PRODUCTS });
    expect(res.data).toHaveLength(3);
  });

  // --- Empty-query preview ---------------------------------------------------

  describe('empty-query preview', () => {
    const previewEndpoints = (rowsPer = 5) => {
      const many = (row) => Array.from({ length: rowsPer }, (_, i) => ({ ...row, id: `${row.id}-${i}` }));
      mockEndpoints({
        '/api/products/search': many(productRow),
        '/api/sales/customer-ledger/search': many(customerRow),
        '/api/vendors/search': many(vendorRow),
        '/api/ledger/accounts/search': many(ledgerRow),
        '/api/employees/search': many(employeeRow),
      });
    };

    it('asks each tabbed source for its own bounded preview, never a search', async () => {
      previewEndpoints();

      await globalSearchPreview();

      // Five categories with a tab. Invoices, LPOs, GRNs and quotations have no tab, so
      // they take no part in the preview.
      expect(api.get).toHaveBeenCalledTimes(5);
      [
        '/api/products/search',
        '/api/sales/customer-ledger/search',
        '/api/vendors/search',
        '/api/ledger/accounts/search',
        '/api/employees/search',
      ].forEach((url) => {
        expect(api.get).toHaveBeenCalledWith(url, expect.objectContaining({
          params: { preview: true, size: PREVIEW_PER_CATEGORY },
        }));
      });
      // No request carries a query parameter: an empty q never means "everything".
      api.get.mock.calls.forEach(([, config]) => {
        expect(config.params).not.toHaveProperty('q');
      });
    });

    it('returns at most two rows per category and ten in total', async () => {
      previewEndpoints(9);

      const res = await globalSearchPreview();

      expect(res.data).toHaveLength(10);
      const byType = res.data.reduce((acc, r) => ({ ...acc, [r.type]: (acc[r.type] ?? 0) + 1 }), {});
      expect(byType).toEqual({ product: 2, customer: 2, vendor: 2, ledger: 2, employee: 2 });
    });

    it('groups the preview by source in the tab order', async () => {
      previewEndpoints(2);

      const res = await globalSearchPreview();

      expect(res.data.map((r) => r.type)).toEqual([
        'product', 'product', 'customer', 'customer', 'vendor', 'vendor',
        'ledger', 'ledger', 'employee', 'employee',
      ]);
    });

    it('previews a single category when one is given', async () => {
      previewEndpoints();

      const res = await globalSearchPreview({ category: SEARCH_CATEGORY.VENDORS });

      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.get).toHaveBeenCalledWith('/api/vendors/search', expect.objectContaining({
        params: { preview: true, size: PREVIEW_PER_CATEGORY },
      }));
      expect(res.data.map((r) => r.type)).toEqual(['vendor', 'vendor']);
    });

    it('never requests a category the user cannot view', async () => {
      previewEndpoints();

      const res = await globalSearchPreview({ canView: (mod) => mod !== 'hr.employee' });

      expect(api.get).toHaveBeenCalledTimes(4);
      expect(api.get).not.toHaveBeenCalledWith('/api/employees/search', expect.anything());
      expect(res.data.some((r) => r.type === 'employee')).toBe(false);
    });

    it('issues nothing at all when every category is denied', async () => {
      previewEndpoints();

      const res = await globalSearchPreview({ canView: () => false });

      expect(api.get).not.toHaveBeenCalled();
      expect(res.data).toEqual([]);
    });

    it('normalises preview rows through the same mappers as the search', async () => {
      previewEndpoints(1);

      const res = await globalSearchPreview({ category: SEARCH_CATEGORY.PRODUCTS });

      expect(res.data[0]).toMatchObject({
        type: 'product',
        title: 'Wireless Keyboard Pro',
        meta: { badge: 'Stock: 142' },
      });
    });

    it('survives a failing source and still previews the others', async () => {
      previewEndpoints();
      api.get.mockImplementation((url) =>
        url === '/api/vendors/search'
          ? Promise.reject(new Error('boom'))
          : Promise.resolve({ data: [productRow] })
      );

      const res = await globalSearchPreview();

      expect(res.data.some((r) => r.type === 'vendor')).toBe(false);
      expect(res.data.length).toBeGreaterThan(0);
    });

    it('serves a repeated preview from cache, so clearing the query costs no request', async () => {
      previewEndpoints(2);

      await globalSearchPreview();
      expect(api.get).toHaveBeenCalledTimes(5);

      const again = await globalSearchPreview();
      expect(api.get).toHaveBeenCalledTimes(5);
      expect(again.data).toHaveLength(10);
    });

    it('passes the abort signal through and does not cache an aborted run', async () => {
      previewEndpoints(2);
      const controller = new AbortController();

      await globalSearchPreview({ category: SEARCH_CATEGORY.PRODUCTS, signal: controller.signal });
      expect(api.get).toHaveBeenCalledWith('/api/products/search', expect.objectContaining({
        signal: controller.signal,
      }));

      controller.abort();
      const aborted = new AbortController();
      aborted.abort();
      api.get.mockClear();
      await globalSearchPreview({ category: SEARCH_CATEGORY.CUSTOMERS, signal: aborted.signal });
      api.get.mockClear();
      await globalSearchPreview({ category: SEARCH_CATEGORY.CUSTOMERS });
      // The aborted run wrote nothing to the cache, so the next one still requests.
      expect(api.get).toHaveBeenCalledTimes(1);
    });

    it('reports partial results as each source lands', async () => {
      previewEndpoints(2);
      const partials = [];

      await globalSearchPreview({ onPartial: (rows) => partials.push(rows.length) });

      expect(partials.length).toBe(5);
      expect(partials.at(-1)).toBe(10);
    });
  });
});
