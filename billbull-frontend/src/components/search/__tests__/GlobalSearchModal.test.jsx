import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/dom';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

// --- Module mocks ------------------------------------------------------------

const canViewMock = vi.fn(() => true);
vi.mock('../../../context/PermissionContext', () => ({
  usePermissions: () => ({ canView: canViewMock }),
}));

const globalSearchMock = vi.fn();
const globalSearchPreviewMock = vi.fn();
vi.mock('../../../api/globalSearchApi', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    globalSearch: (...args) => globalSearchMock(...args),
    globalSearchPreview: (...args) => globalSearchPreviewMock(...args),
  };
});

// The details pane is exercised in GlobalSearchModalDetails.test.jsx; here the fetchers
// are stubbed so these tests stay about search, selection and navigation.
const productDetailMock = vi.fn(() => Promise.resolve({
  name: 'Wireless Keyboard Pro', code: 'WKB-2024', sku: null, status: null,
  unitPrice: null, reorderLevel: null, uom: null,
  onHand: 0, reserved: 0, available: 0, incoming: 0,
  locations: [], incomingLpos: [], stockUnavailable: false,
}));
const ledgerDetailMock = vi.fn(() => Promise.resolve({
  accountCode: '1100', accountName: 'Accounts Receivable', accountType: 'Asset',
  accountGroup: 'Assets', status: 'active',
  debitTotal: 0, creditTotal: 0, netBalance: 0, branchBalances: [], transactions: [],
}));
const employeeDetailMock = vi.fn(() => Promise.resolve({
  name: 'Ahmed Al Mansoori', employeeCode: 'EMP-0234',
  role: 'Senior Sales Executive', department: 'Sales', branch: 'Dubai', status: 'Active',
}));
vi.mock('../../../api/entityDetailApi', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ENTITY_DETAIL_FETCHERS: {
      product: (...args) => productDetailMock(...args),
      ledger: (...args) => ledgerDetailMock(...args),
      // The employee panel carries the only explicit "open the record" action, which is
      // the one navigation this modal still performs — so it needs a real panel here.
      employee: (...args) => employeeDetailMock(...args),
    },
  };
});

import GlobalSearchModal from '../GlobalSearchModal';
import { SEARCH_CATEGORY } from '../../../api/globalSearchApi';

// --- jsdom polyfills Radix needs --------------------------------------------

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

// --- Helpers -----------------------------------------------------------------

const PRODUCT = {
  id: '11',
  type: 'product',
  title: 'Wireless Keyboard Pro',
  subtitle: 'WKB-2024 • Electronics',
  meta: { badge: 'Stock: 142', rightTag: 'AED 183.50' },
};
const CUSTOMER = {
  id: '3',
  type: 'customer',
  title: 'Acme Corp Ltd',
  subtitle: 'CUS-0042 • +971 50 234 5678',
  meta: { badge: 'Corporate' },
};

const VENDOR = {
  id: '21',
  type: 'vendor',
  title: 'TechSupply FZCO',
  subtitle: 'VEN-0021 \u2022 +971 4 234 5678 \u2022 Dubai',
  meta: { badge: 'Active' },
};
const LEDGER = {
  id: 'acc-1',
  type: 'ledger',
  title: 'Accounts Receivable',
  subtitle: 'Acc 1100 \u2022 Assets',
  meta: { badge: 'Asset' },
};
const EMPLOYEE = {
  id: '234',
  type: 'employee',
  title: 'Ahmed Al Mansoori',
  subtitle: 'EMP-0234 \u2022 Senior Sales Executive \u2022 Dubai',
  meta: { badge: 'Active' },
};

/** A second row per type, so a two-row-per-category preview can be asserted. */
const PRODUCT_2 = { ...PRODUCT, id: '12', title: 'USB-C Hub' };
const CUSTOMER_2 = { ...CUSTOMER, id: '4', title: 'Gulf Traders LLC' };
const VENDOR_2 = { ...VENDOR, id: '22', title: 'Emirates Parts LLC' };
const LEDGER_2 = { ...LEDGER, id: 'acc-2', code: '4000', title: 'Sales Revenue' };
const EMPLOYEE_2 = { ...EMPLOYEE, id: '235', title: 'Sarah Williams' };

/** What the bounded preview returns: two rows per visible category, ten in all. */
const PREVIEW_ROWS = [
  PRODUCT, PRODUCT_2,
  CUSTOMER, CUSTOMER_2,
  VENDOR, VENDOR_2,
  { ...LEDGER, code: '1100' }, LEDGER_2,
  EMPLOYEE, EMPLOYEE_2,
];

const LocationProbe = () => {
  const location = useLocation();
  return (
    <div
      data-testid="location"
      data-pathname={location.pathname}
      data-state={JSON.stringify(location.state ?? null)}
    >
      {location.pathname}
    </div>
  );
};

/** A stand-in page that holds local state, so we can prove it is not remounted. */
const StatefulPage = ({ label }) => {
  const [count, setCount] = React.useState(0);
  return (
    <div>
      <span>{label}</span>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        bump
      </button>
      <output data-testid="page-count">{count}</output>
    </div>
  );
};

const renderApp = ({ route = '/dashboard', ...props } = {}) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <GlobalSearchModal {...props} />
      <LocationProbe />
      <Routes>
        <Route path="/dashboard" element={<StatefulPage label="dashboard page" />} />
        <Route path="/sales/pos" element={<StatefulPage label="pos page" />} />
        <Route path="/inventory/products" element={<StatefulPage label="products page" />} />
        <Route path="/sales/customers" element={<StatefulPage label="customers page" />} />
        <Route path="/purchases/vendors" element={<StatefulPage label="vendors page" />} />
        <Route path="/finance/ledger" element={<StatefulPage label="ledger page" />} />
        <Route path="/payroll/employees" element={<StatefulPage label="employees page" />} />
      </Routes>
    </MemoryRouter>
  );

const pressShortcut = (init = { ctrlKey: true }) =>
  act(() => {
    fireEvent.keyDown(document.body, { key: 'x', ...init });
  });

const searchBox = () => screen.getByLabelText('Search BillBull');

// A result title also appears in the details pane once selected, so result rows
// are always addressed by their option role rather than by text.
const resultRow = (name) => screen.findByRole('option', { name: new RegExp(name) });

describe('GlobalSearchModal', () => {
  beforeEach(() => {
    canViewMock.mockImplementation(() => true);
    globalSearchMock.mockReset();
    globalSearchMock.mockResolvedValue({ success: true, data: [] });
    globalSearchPreviewMock.mockReset();
    // Most suites are about typed search; the preview has its own describe below.
    globalSearchPreviewMock.mockResolvedValue({ success: true, data: [] });
    // Call counts only, not the implementations: a detail fetcher that leaked calls from
    // an earlier test would make "only the selected row fetches" pass or fail by ordering.
    productDetailMock.mockClear();
    ledgerDetailMock.mockClear();
    employeeDetailMock.mockClear();
  });

  afterEach(cleanup);

  // --- Shortcut / open-close -------------------------------------------------

  describe('shortcut and open state', () => {
    it('opens on Ctrl+X', async () => {
      renderApp();
      expect(screen.queryByLabelText('Search BillBull')).not.toBeInTheDocument();

      pressShortcut({ ctrlKey: true });
      expect(await screen.findByLabelText('Search BillBull')).toBeInTheDocument();
    });

    it('opens on Cmd+X', async () => {
      renderApp();
      pressShortcut({ metaKey: true });
      expect(await screen.findByLabelText('Search BillBull')).toBeInTheDocument();
    });

    it('closes on Escape', async () => {
      renderApp();
      pressShortcut();
      await screen.findByLabelText('Search BillBull');

      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

      await waitFor(() =>
        expect(screen.queryByLabelText('Search BillBull')).not.toBeInTheDocument()
      );
    });

    it('does not open when the keystroke comes from a text field', async () => {
      renderApp();
      const pageButton = screen.getByRole('button', { name: 'bump' });
      // A form control standing in for any editable target on the page.
      const input = document.createElement('input');
      pageButton.parentElement.appendChild(input);

      fireEvent.keyDown(input, { key: 'x', ctrlKey: true });

      await waitFor(() =>
        expect(screen.queryByLabelText('Search BillBull')).not.toBeInTheDocument()
      );
    });
  });

  // --- Global mounting -------------------------------------------------------

  describe('global mounting', () => {
    it.each(['/dashboard', '/sales/pos'])('opens while on %s', async (route) => {
      renderApp({ route });
      pressShortcut();
      expect(await screen.findByLabelText('Search BillBull')).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveAttribute('data-pathname', route);
    });

    it('does not change the route when opened or closed', async () => {
      renderApp({ route: '/sales/pos' });

      pressShortcut();
      await screen.findByLabelText('Search BillBull');
      expect(screen.getByTestId('location')).toHaveAttribute('data-pathname', '/sales/pos');

      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      await waitFor(() =>
        expect(screen.queryByLabelText('Search BillBull')).not.toBeInTheDocument()
      );
      expect(screen.getByTestId('location')).toHaveAttribute('data-pathname', '/sales/pos');
    });

    it('leaves the underlying page state untouched across open and close', async () => {
      const user = userEvent.setup();
      renderApp();

      await user.click(screen.getByRole('button', { name: 'bump' }));
      await user.click(screen.getByRole('button', { name: 'bump' }));
      expect(screen.getByTestId('page-count')).toHaveTextContent('2');

      pressShortcut();
      await screen.findByLabelText('Search BillBull');
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      await waitFor(() =>
        expect(screen.queryByLabelText('Search BillBull')).not.toBeInTheDocument()
      );

      // Same component instance — the counter survived.
      expect(screen.getByTestId('page-count')).toHaveTextContent('2');
    });
  });

  // --- Search ----------------------------------------------------------------

  describe('search', () => {
    it('runs the shared search for the typed query', async () => {
      const user = userEvent.setup();
      globalSearchMock.mockResolvedValue({ success: true, data: [PRODUCT] });
      renderApp({ open: true, onOpenChange: vi.fn() });

      await user.type(searchBox(), 'keyboard');

      await waitFor(() => expect(globalSearchMock).toHaveBeenCalled());
      expect(globalSearchMock).toHaveBeenLastCalledWith(
        'keyboard',
        expect.objectContaining({ category: SEARCH_CATEGORY.ALL })
      );
      expect(await resultRow('Wireless Keyboard Pro')).toBeInTheDocument();
    });

    it('respects a category change', async () => {
      const user = userEvent.setup();
      globalSearchMock.mockResolvedValue({ success: true, data: [PRODUCT] });
      renderApp({ open: true, onOpenChange: vi.fn() });

      await user.type(searchBox(), 'keyboard');
      await waitFor(() => expect(globalSearchMock).toHaveBeenCalled());

      await user.click(screen.getByRole('tab', { name: 'Products' }));

      await waitFor(() =>
        expect(globalSearchMock).toHaveBeenLastCalledWith(
          'keyboard',
          expect.objectContaining({ category: SEARCH_CATEGORY.PRODUCTS })
        )
      );
    });

    it('switches category with Tab without moving focus away', async () => {
      const user = userEvent.setup();
      renderApp({ open: true, onOpenChange: vi.fn() });

      await user.type(searchBox(), 'ab');
      fireEvent.keyDown(searchBox(), { key: 'Tab' });

      await waitFor(() =>
        expect(screen.getByRole('tab', { name: 'Products' })).toHaveAttribute('aria-selected', 'true')
      );
    });

    it('never shows the "not available" state now that every tab is backed', async () => {
      const user = userEvent.setup();
      renderApp({ open: true, onOpenChange: vi.fn() });

      for (const tab of ['Vendors', 'Ledger', 'Employees']) {
        await user.click(screen.getByRole('tab', { name: tab }));
        expect(
          screen.queryByText('Search for this category is not available yet.')
        ).not.toBeInTheDocument();
      }
    });

    it('aborts the previous request when the query changes', async () => {
      const user = userEvent.setup();
      const signals = [];
      // Never resolves, so the first request is guaranteed to still be in flight
      // when the second one starts.
      globalSearchMock.mockImplementation((_q, opts) => {
        signals.push(opts.signal);
        return new Promise(() => {});
      });
      renderApp({ open: true, onOpenChange: vi.fn() });

      await user.type(searchBox(), 'ke');
      await waitFor(() => expect(signals).toHaveLength(1));
      await user.type(searchBox(), 'yboard');
      await waitFor(() => expect(signals.length).toBeGreaterThan(1));

      expect(signals[0].aborted).toBe(true);
      expect(signals.at(-1).aborted).toBe(false);
    });

    it('ignores a stale response that resolves after a newer one', async () => {
      const user = userEvent.setup();
      let resolveStale;
      globalSearchMock
        .mockImplementationOnce(
          () => new Promise((resolve) => { resolveStale = resolve; })
        )
        .mockResolvedValue({ success: true, data: [CUSTOMER] });

      renderApp({ open: true, onOpenChange: vi.fn() });

      await user.type(searchBox(), 'ke');
      await waitFor(() => expect(globalSearchMock).toHaveBeenCalledTimes(1));
      await user.type(searchBox(), 'acme');

      expect(await resultRow('Acme Corp Ltd')).toBeInTheDocument();

      // The superseded request lands late; it must not repaint the list.
      await act(async () => {
        resolveStale({ success: true, data: [PRODUCT] });
        await Promise.resolve();
      });
      expect(screen.queryByText('Wireless Keyboard Pro')).not.toBeInTheDocument();
      expect(await resultRow('Acme Corp Ltd')).toBeInTheDocument();
    });

    it('shows a loading state while a search is in flight', async () => {
      const user = userEvent.setup();
      globalSearchMock.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true, data: [] }), 60))
      );
      renderApp({ open: true, onOpenChange: vi.fn() });

      await user.type(searchBox(), 'acme');
      expect(await screen.findByTestId('global-search-loading')).toBeInTheDocument();
    });

    it('shows an empty state when a search returns nothing', async () => {
      const user = userEvent.setup();
      globalSearchMock.mockResolvedValue({ success: true, data: [] });
      renderApp({ open: true, onOpenChange: vi.fn() });

      await user.type(searchBox(), 'zzzzz');
      expect(await screen.findByText('No results found.')).toBeInTheDocument();
    });

    it('shows an error state instead of crashing when the search throws', async () => {
      const user = userEvent.setup();
      globalSearchMock.mockRejectedValue(new Error('network down'));
      renderApp({ open: true, onOpenChange: vi.fn() });

      await user.type(searchBox(), 'acme');
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Search is unavailable right now.'
      );
    });

    it('prompts before anything is typed', async () => {
      renderApp({ open: true, onOpenChange: vi.fn() });
      expect(await screen.findByText('Start typing to search.')).toBeInTheDocument();
      expect(globalSearchMock).not.toHaveBeenCalled();
    });

    it('shows the details placeholder until a result is chosen', async () => {
      renderApp({ open: true, onOpenChange: vi.fn() });
      expect(screen.getByText('Select a result')).toBeInTheDocument();
      expect(screen.getByText('Full details will appear here')).toBeInTheDocument();
    });
  });

  // --- Permissions -----------------------------------------------------------

  describe('permissions', () => {
    it('hides categories the user cannot view', async () => {
      canViewMock.mockImplementation((mod) => mod !== 'hr.employee');
      renderApp({ open: true, onOpenChange: vi.fn() });

      expect(screen.getByRole('tab', { name: 'Products' })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Employees' })).not.toBeInTheDocument();
    });

    it('passes canView to the search service so denied sources are never called', async () => {
      const user = userEvent.setup();
      renderApp({ open: true, onOpenChange: vi.fn() });

      await user.type(searchBox(), 'acme');
      await waitFor(() =>
        expect(globalSearchMock).toHaveBeenLastCalledWith(
          'acme',
          expect.objectContaining({ canView: canViewMock })
        )
      );
    });
  });

  // --- Phase 2A categories ---------------------------------------------------

  describe('vendor, ledger and employee categories', () => {
    const cases = [
      { tab: 'Vendors', category: SEARCH_CATEGORY.VENDORS, row: VENDOR, title: 'TechSupply FZCO' },
      { tab: 'Ledger', category: SEARCH_CATEGORY.LEDGER, row: LEDGER, title: 'Accounts Receivable' },
      { tab: 'Employees', category: SEARCH_CATEGORY.EMPLOYEES, row: EMPLOYEE, title: 'Ahmed Al Mansoori' },
    ];

    it.each(cases)('the $tab tab searches its category and renders results', async ({ tab, category, row, title }) => {
      const user = userEvent.setup();
      globalSearchMock.mockResolvedValue({ success: true, data: [row] });
      renderApp({ open: true, onOpenChange: vi.fn() });

      await user.click(screen.getByRole('tab', { name: tab }));
      await user.type(searchBox(), 'acme');

      await waitFor(() =>
        expect(globalSearchMock).toHaveBeenLastCalledWith(
          'acme',
          expect.objectContaining({ category })
        )
      );
      expect(await resultRow(title)).toBeInTheDocument();
    });

    // Every searchable category now has a detail panel, Employee included — its panel is
    // identity-only by decision rather than a stage it has not reached. The panes
    // themselves are asserted in GlobalSearchModalDetails; what matters here is that no
    // category tab still lands on the coming-next placeholder.
    it.each(cases)('selecting a $tab result opens a real panel, not a placeholder', async ({ tab, row, title }) => {
      const user = userEvent.setup();
      globalSearchMock.mockResolvedValue({ success: true, data: [row] });
      renderApp({ open: true, onOpenChange: vi.fn() });

      await user.click(screen.getByRole('tab', { name: tab }));
      await user.type(searchBox(), 'acme');
      await resultRow(title);

      await waitFor(() =>
        expect(screen.queryByText('Full details will appear here')).not.toBeInTheDocument()
      );
      expect(screen.queryByText('Details are coming next.')).not.toBeInTheDocument();
    });

    // Selection is not navigation. These three used to open their entity's page on
    // Enter; a details checker that leaves the modal on the key the footer calls
    // "select" is how a read-only lookup ended up in an edit form.
    const selectionCases = [
      { tab: 'Vendors', row: VENDOR, title: 'TechSupply FZCO' },
      { tab: 'Ledger', row: { ...LEDGER, code: '1100' }, title: 'Accounts Receivable' },
      { tab: 'Employees', row: EMPLOYEE, title: 'Ahmed Al Mansoori' },
    ];

    it.each(selectionCases)('keeps a $tab result inside the modal when Enter is pressed', async ({ tab, row, title }) => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      globalSearchMock.mockResolvedValue({ success: true, data: [row] });
      renderApp({ open: true, onOpenChange });

      await user.click(screen.getByRole('tab', { name: tab }));
      await user.type(searchBox(), 'acme');
      await resultRow(title);

      fireEvent.keyDown(searchBox(), { key: 'Enter' });

      expect(screen.getByTestId('location')).toHaveAttribute('data-pathname', '/dashboard');
      expect(screen.getByTestId('location')).toHaveAttribute('data-state', 'null');
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(await resultRow(title)).toHaveAttribute('aria-selected', 'true');
    });

    it('does not report a ledger result without an account code as unopenable', async () => {
      const user = userEvent.setup();
      // It cannot be navigated to - but nothing about selecting it tries to, so the
      // user is never told a row they only wanted to look at is broken.
      globalSearchMock.mockResolvedValue({ success: true, data: [LEDGER] });
      renderApp({ open: true, onOpenChange: vi.fn() });

      await user.click(screen.getByRole('tab', { name: 'Ledger' }));
      await user.type(searchBox(), 'acme');
      await resultRow('Accounts Receivable');

      fireEvent.keyDown(searchBox(), { key: 'Enter' });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveAttribute('data-pathname', '/dashboard');
    });

    it('does not leak results from the previous category while the new one loads', async () => {
      const user = userEvent.setup();
      globalSearchMock.mockResolvedValueOnce({ success: true, data: [PRODUCT] });
      renderApp({ open: true, onOpenChange: vi.fn() });

      await user.type(searchBox(), 'acme');
      await resultRow('Wireless Keyboard Pro');

      // The next category's request never settles, so anything still on screen
      // would be stale data from the products tab.
      globalSearchMock.mockImplementation(() => new Promise(() => {}));
      await user.click(screen.getByRole('tab', { name: 'Ledger' }));

      await waitFor(() =>
        expect(screen.queryByRole('option', { name: /Wireless Keyboard Pro/ })).not.toBeInTheDocument()
      );
    });

    it('aborts the previous category request so a late partial cannot repaint it', async () => {
      const user = userEvent.setup();
      // Hold the products request open and keep hold of what it was handed, so the late
      // arrival can be replayed after the tab has already changed.
      let productsOpts;
      globalSearchMock.mockImplementationOnce((_term, opts) => {
        productsOpts = opts;
        return new Promise(() => {});
      });
      renderApp({ open: true, onOpenChange: vi.fn() });

      await user.type(searchBox(), 'acme');
      await waitFor(() => expect(productsOpts).toBeDefined());

      globalSearchMock.mockImplementation(() => new Promise(() => {}));
      await user.click(screen.getByRole('tab', { name: 'Ledger' }));

      // Switching tabs must abort, not only clear the list: the request is still live
      // through the 200ms debounce, and onPartial only guards on its own signal.
      expect(productsOpts.signal.aborted).toBe(true);

      act(() => productsOpts.onPartial?.([PRODUCT]));
      expect(screen.queryByRole('option', { name: /Wireless Keyboard Pro/ })).not.toBeInTheDocument();
    });
  });

  // --- Permission-filtered tabs ----------------------------------------------

  describe('restricted users', () => {
    it.each([
      ['purchases.vendor', 'Vendors'],
      ['finance.ledger', 'Ledger'],
      ['hr.employee', 'Employees'],
    ])('hides the tab when %s is denied', async (permission, tab) => {
      canViewMock.mockImplementation((mod) => mod !== permission);
      renderApp({ open: true, onOpenChange: vi.fn() });

      expect(screen.queryByRole('tab', { name: tab })).not.toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Products' })).toBeInTheDocument();
    });

    it('leaves only All when every module is denied', async () => {
      canViewMock.mockImplementation(() => false);
      renderApp({ open: true, onOpenChange: vi.fn() });

      expect(screen.getAllByRole('tab')).toHaveLength(1);
      expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
    });
  });

  // --- Empty-query preview ---------------------------------------------------

  describe('initial preview', () => {
    const previewOf = (rows) => ({ success: true, data: rows });

    beforeEach(() => {
      globalSearchPreviewMock.mockResolvedValue(previewOf(PREVIEW_ROWS));
    });

    it('shows bounded results as soon as Ctrl+X opens it, before anything is typed', async () => {
      renderApp();
      pressShortcut({ ctrlKey: true });

      await screen.findByLabelText('Search BillBull');
      expect(await resultRow('Wireless Keyboard Pro')).toBeInTheDocument();
      expect(screen.queryByText('Start typing to search.')).not.toBeInTheDocument();
      // A preview is not a search: the search pipeline is never entered for an empty
      // query, so "q=" can never come to mean "return everything".
      expect(globalSearchMock).not.toHaveBeenCalled();
    });

    it('asks for two rows per category and nothing more', async () => {
      renderApp({ open: true, onOpenChange: vi.fn() });

      await waitFor(() => expect(globalSearchPreviewMock).toHaveBeenCalled());
      expect(globalSearchPreviewMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: SEARCH_CATEGORY.ALL, perCategory: 2 })
      );
    });

    it('caps the All tab at two rows per entity type', async () => {
      renderApp({ open: true, onOpenChange: vi.fn() });

      await resultRow('Wireless Keyboard Pro');
      const rows = screen.getAllByRole('option');
      expect(rows).toHaveLength(10);

      // Two of each, and every visible category represented.
      ['Wireless Keyboard Pro', 'USB-C Hub', 'Acme Corp Ltd', 'Gulf Traders LLC',
        'TechSupply FZCO', 'Emirates Parts LLC', 'Accounts Receivable', 'Sales Revenue',
        'Ahmed Al Mansoori', 'Sarah Williams'].forEach((title) => {
        expect(screen.getByRole('option', { name: new RegExp(title) })).toBeInTheDocument();
      });
    });

    it('hands the preview the permission predicate so a denied category is never requested', async () => {
      canViewMock.mockImplementation((mod) => mod !== 'hr.employee');
      renderApp({ open: true, onOpenChange: vi.fn() });

      await waitFor(() => expect(globalSearchPreviewMock).toHaveBeenCalled());
      expect(globalSearchPreviewMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ canView: canViewMock })
      );
      expect(screen.queryByRole('tab', { name: 'Employees' })).not.toBeInTheDocument();
    });

    it('falls back to the typing prompt when the preview comes back empty', async () => {
      globalSearchPreviewMock.mockResolvedValue(previewOf([]));
      renderApp({ open: true, onOpenChange: vi.fn() });

      expect(await screen.findByText('Start typing to search.')).toBeInTheDocument();
      expect(screen.queryByText('No results found.')).not.toBeInTheDocument();
    });

    it('does not put an error in front of a user who has not asked for anything', async () => {
      globalSearchPreviewMock.mockRejectedValue(new Error('network down'));
      renderApp({ open: true, onOpenChange: vi.fn() });

      expect(await screen.findByText('Start typing to search.')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    // --- Auto-selection ------------------------------------------------------

    it('selects the first preview row and loads only its details', async () => {
      renderApp({ open: true, onOpenChange: vi.fn() });

      expect(await resultRow('Wireless Keyboard Pro')).toHaveAttribute('aria-selected', 'true');

      await waitFor(() => expect(productDetailMock).toHaveBeenCalledTimes(1));
      // Ten rows are on screen; nine of them fetched nothing.
      expect(ledgerDetailMock).not.toHaveBeenCalled();
      expect(employeeDetailMock).not.toHaveBeenCalled();
    });

    // --- Per-category preview ------------------------------------------------

    it.each([
      ['Products', SEARCH_CATEGORY.PRODUCTS, [PRODUCT, PRODUCT_2], 'Wireless Keyboard Pro'],
      ['Customers', SEARCH_CATEGORY.CUSTOMERS, [CUSTOMER, CUSTOMER_2], 'Acme Corp Ltd'],
      ['Vendors', SEARCH_CATEGORY.VENDORS, [VENDOR, VENDOR_2], 'TechSupply FZCO'],
      ['Ledger', SEARCH_CATEGORY.LEDGER, [{ ...LEDGER, code: '1100' }, LEDGER_2], 'Accounts Receivable'],
      ['Employees', SEARCH_CATEGORY.EMPLOYEES, [EMPLOYEE, EMPLOYEE_2], 'Ahmed Al Mansoori'],
    ])('previews two rows on the %s tab with an empty query', async (tab, category, rows, title) => {
      const user = userEvent.setup();
      renderApp({ open: true, onOpenChange: vi.fn() });
      await resultRow('Wireless Keyboard Pro');

      globalSearchPreviewMock.mockResolvedValue(previewOf(rows));
      await user.click(screen.getByRole('tab', { name: tab }));

      await waitFor(() =>
        expect(globalSearchPreviewMock).toHaveBeenLastCalledWith(
          expect.objectContaining({ category, perCategory: 2 })
        )
      );
      expect(await resultRow(title)).toBeInTheDocument();
      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    });

    it('clears the previous tab rows when the category changes', async () => {
      const user = userEvent.setup();
      renderApp({ open: true, onOpenChange: vi.fn() });
      await resultRow('Wireless Keyboard Pro');

      // The new tab's preview never settles, so anything left on screen would be the
      // previous category's rows.
      globalSearchPreviewMock.mockImplementation(() => new Promise(() => {}));
      await user.click(screen.getByRole('tab', { name: 'Ledger' }));

      await waitFor(() =>
        expect(screen.queryByRole('option', { name: /Wireless Keyboard Pro/ })).not.toBeInTheDocument()
      );
    });

    it('aborts an in-flight preview so a late partial cannot repaint the new tab', async () => {
      const user = userEvent.setup();
      // Hold the All-tab preview open and keep what it was handed, so its late arrival
      // can be replayed after the tab has already changed.
      let firstOpts;
      globalSearchPreviewMock.mockImplementation((opts) => {
        firstOpts = opts;
        return new Promise(() => {});
      });
      renderApp({ open: true, onOpenChange: vi.fn() });
      await waitFor(() => expect(firstOpts).toBeDefined());
      const allTabOpts = firstOpts;

      await user.click(screen.getByRole('tab', { name: 'Ledger' }));

      expect(allTabOpts.signal.aborted).toBe(true);

      act(() => allTabOpts.onPartial?.(PREVIEW_ROWS));
      expect(screen.queryByRole('option', { name: /Wireless Keyboard Pro/ })).not.toBeInTheDocument();
    });

    // --- Query transition ----------------------------------------------------

    it('replaces the preview with query results, then restores it when the query is cleared', async () => {
      const user = userEvent.setup();
      globalSearchMock.mockResolvedValue({ success: true, data: [CUSTOMER_2] });
      renderApp({ open: true, onOpenChange: vi.fn() });

      await resultRow('Wireless Keyboard Pro');

      await user.type(searchBox(), 'gulf');
      expect(await resultRow('Gulf Traders LLC')).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByRole('option', { name: /Wireless Keyboard Pro/ })).not.toBeInTheDocument()
      );

      await user.clear(searchBox());

      expect(await resultRow('Wireless Keyboard Pro')).toBeInTheDocument();
      // Clearing the box restores the preview rather than issuing a search for "".
      expect(globalSearchMock).not.toHaveBeenCalledWith('', expect.anything());
    });
  });

  // --- Layout ----------------------------------------------------------------

  // jsdom computes no layout, so these assert the constraints that produce it. Each one
  // stands for an overflow seen on screen: a long name pushing the row past its column,
  // a summary card or table widening the details pane past the modal.
  describe('layout', () => {
    const LONG = 'ABDULLA ALI AL SHARHAN AND SONS GENERAL TRADING ESTABLISHMENT LLC BRANCH';

    it('truncates a long result title instead of widening the row', async () => {
      const user = userEvent.setup();
      globalSearchMock.mockResolvedValue({
        success: true,
        data: [{ ...VENDOR, title: LONG }],
      });
      renderApp({ open: true, onOpenChange: vi.fn() });

      await user.type(searchBox(), 'abdulla');
      const row = await resultRow(LONG);

      expect(row.querySelector('.truncate')).not.toBeNull();
      // The text block shrinks; the badge and any right-hand tag do not.
      expect(row.querySelector('.min-w-0')).not.toBeNull();
    });

    it('constrains both body columns so neither can spill out of the modal', async () => {
      renderApp({ open: true, onOpenChange: vi.fn() });

      const viewport = document.querySelector('[data-slot="scroll-area-viewport"]');
      // Radix sizes its viewport content as a table, which grows with the content and
      // defeats every truncate inside it. fitWidth pins it back to a block.
      expect(viewport.className).toContain('[&>div]:!block');

      const details = screen.getByText('Select a result').closest('.flex-col');
      expect(details.className).toContain('min-w-0');
      expect(details.className).toContain('overflow-hidden');
    });
  });

  // --- Selection is not navigation -------------------------------------------

  describe('selection', () => {
    it('selects with Enter and leaves the route alone', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      globalSearchMock.mockResolvedValue({ success: true, data: [PRODUCT] });
      renderApp({ open: true, onOpenChange });

      await user.type(searchBox(), 'keyboard');
      await resultRow('Wireless Keyboard Pro');

      fireEvent.keyDown(searchBox(), { key: 'Enter' });

      const probe = screen.getByTestId('location');
      expect(probe).toHaveAttribute('data-pathname', '/dashboard');
      expect(probe).toHaveAttribute('data-state', 'null');
      // The modal is still open and the row is still the selected one.
      expect(searchBox()).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(await resultRow('Wireless Keyboard Pro')).toHaveAttribute('aria-selected', 'true');
    });

    it('shows the selected result details inside the modal on Enter', async () => {
      const user = userEvent.setup();
      globalSearchMock.mockResolvedValue({ success: true, data: [CUSTOMER, PRODUCT] });
      renderApp({ open: true, onOpenChange: vi.fn() });

      await user.type(searchBox(), 'acme');
      await resultRow('Acme Corp Ltd');

      fireEvent.keyDown(searchBox(), { key: 'ArrowDown' });
      fireEvent.keyDown(searchBox(), { key: 'Enter' });

      // The product panel is the one mounted, and the page underneath never changed.
      await waitFor(() => expect(productDetailMock).toHaveBeenCalled());
      expect(screen.getByTestId('location')).toHaveAttribute('data-pathname', '/dashboard');
      expect(screen.getByText('dashboard page')).toBeInTheDocument();
    });

    it('selects a clicked result without navigating', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      globalSearchMock.mockResolvedValue({ success: true, data: [PRODUCT, CUSTOMER] });
      renderApp({ open: true, onOpenChange });

      await user.type(searchBox(), 'a');
      await user.type(searchBox(), 'cme');
      await resultRow('Acme Corp Ltd');

      await user.click(await resultRow('Acme Corp Ltd'));

      expect(await resultRow('Acme Corp Ltd')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('location')).toHaveAttribute('data-pathname', '/dashboard');
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });

    it('does not navigate on a double click either', async () => {
      const user = userEvent.setup();
      globalSearchMock.mockResolvedValue({ success: true, data: [PRODUCT] });
      renderApp({ open: true, onOpenChange: vi.fn() });

      await user.type(searchBox(), 'keyboard');
      const row = await resultRow('Wireless Keyboard Pro');

      await user.dblClick(row);

      expect(screen.getByTestId('location')).toHaveAttribute('data-pathname', '/dashboard');
    });

    it('moves the selection with the arrow keys without navigating', async () => {
      const user = userEvent.setup();
      globalSearchMock.mockResolvedValue({ success: true, data: [PRODUCT, CUSTOMER] });
      renderApp({ open: true, onOpenChange: vi.fn() });

      await user.type(searchBox(), 'a');
      await user.type(searchBox(), 'cme');
      await resultRow('Acme Corp Ltd');

      fireEvent.keyDown(searchBox(), { key: 'ArrowDown' });
      await waitFor(() =>
        expect(screen.getByRole('option', { name: /Acme Corp Ltd/ })).toHaveAttribute(
          'aria-selected',
          'true'
        )
      );
      expect(screen.getByTestId('location')).toHaveAttribute('data-pathname', '/dashboard');
    });

    it('still navigates from the explicit open action in the detail panel', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      globalSearchMock.mockResolvedValue({ success: true, data: [EMPLOYEE] });
      renderApp({ open: true, onOpenChange });

      await user.click(screen.getByRole('tab', { name: 'Employees' }));
      await user.type(searchBox(), 'ahmed');
      await resultRow('Ahmed Al Mansoori');

      // The employee panel renders from the row itself, so its action is available as
      // soon as the row is selected. It is the one deliberate way out of the modal.
      const openAction = await screen.findByRole('button', { name: /Open employee record/i });
      await user.click(openAction);

      await waitFor(() =>
        expect(screen.getByTestId('location')).toHaveAttribute('data-pathname', '/payroll/employees')
      );
      expect(JSON.parse(screen.getByTestId('location').getAttribute('data-state'))).toEqual({
        employeeId: '234',
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('promises only what it does in the footer: Enter selects', () => {
      renderApp({ open: true, onOpenChange: vi.fn() });
      expect(screen.getByText('select')).toBeInTheDocument();
      expect(screen.queryByText('open')).not.toBeInTheDocument();
    });
  });
});
