import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// --- Module mocks ------------------------------------------------------------

const getAllCustomersMock = vi.fn();
const getCustomerByIdMock = vi.fn();

vi.mock('../../../api/customerledgerApi', () => ({
  getAllCustomers: (...args) => getAllCustomersMock(...args),
  getCustomerById: (...args) => getCustomerByIdMock(...args),
  createCustomer: vi.fn(),
  importCustomers: vi.fn(),
  deleteCustomer: vi.fn(),
  getOpeningInvoicesByCustomerCode: vi.fn(() => Promise.resolve([])),
  getNextCustomerCode: vi.fn(() => Promise.resolve('CUS-0100')),
}));

vi.mock('../../../api/financialsApi', () => ({
  fetchStatementOfAccount: vi.fn(() => Promise.resolve([])),
  fetchARAgingReport: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../../../api/warehouseApi', () => ({ getWarehouses: vi.fn(() => Promise.resolve([])) }));
vi.mock('../../../api/employeeApi', () => ({ getEmployees: vi.fn(() => Promise.resolve([])) }));
vi.mock('../../../api/salesPaymentApi', () => ({
  getAllSalesPayments: vi.fn(() => Promise.resolve([])),
  saveSalesPayment: vi.fn(),
  getNextSalesPaymentNumber: vi.fn(() => Promise.resolve('RV-001')),
  getSalesPaymentStats: vi.fn(() => Promise.resolve({})),
}));
vi.mock('../../../api/salesInvoiceApi', () => ({ getAllSalesInvoices: vi.fn(() => Promise.resolve([])) }));
vi.mock('../../../api/ledgerApi', () => ({ getBankAccounts: vi.fn(() => Promise.resolve([])) }));
vi.mock('../../../api/salesSettingsApi', () => ({ getSalesSettings: vi.fn(() => Promise.resolve({})) }));
vi.mock('../../../api/printTemplateApi', () => ({ getTemplatesByCategory: vi.fn(() => Promise.resolve([])) }));

vi.mock('../../../context/BranchContext', () => ({
  useBranch: () => ({ activeBranch: { id: 1, name: 'Dubai' }, branches: [], isAllBranches: false }),
}));
vi.mock('../../../context/CompanyContext', () => ({
  default: React.createContext({ company: { currency: 'AED' } }),
  useCompany: () => ({ company: { currency: 'AED' } }),
}));
vi.mock('../../../context/PermissionContext', () => ({
  usePermissions: () => ({
    canView: () => true, canCreate: () => true, canEdit: () => true, canApprove: () => true,
  }),
}));

import CustomerLedger from '../CustomerLedger';

// --- Fixtures ----------------------------------------------------------------

const CUSTOMERS = [
  { id: 3, code: 'CUS-0042', name: 'Acme Corp Ltd', mobile: '+971 50 234 5678', status: 'Active', groupType: 'Corporate' },
  { id: 4, code: 'CUS-0043', name: 'Blue Ridge Trading', mobile: '+971 50 111 2222', status: 'Active', groupType: 'Retail' },
];

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
});

const renderPage = (state) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/sales/customers', state }]}>
      <Routes>
        <Route path="/sales/customers" element={<CustomerLedger />} />
      </Routes>
    </MemoryRouter>
  );

/**
 * The customerId router-state contract from utils/entityNavigation.
 *
 * <p>Before this, the state key was sent but never read: the page opened an unfiltered
 * customer list and the id was silently dropped. These tests pin the state down to the
 * page's own detail mechanism — the one handleEditClick already drives — so no second
 * customer-detail workflow can appear beside it.
 */
describe('CustomerLedger — global search navigation', () => {
  beforeEach(() => {
    getAllCustomersMock.mockReset().mockResolvedValue(CUSTOMERS);
    getCustomerByIdMock.mockReset().mockImplementation((id) =>
      Promise.resolve(CUSTOMERS.find((c) => String(c.id) === String(id)))
    );
  });

  afterEach(cleanup);

  it('opens the existing customer detail view for the id in router state', async () => {
    renderPage({ customerId: '3' });

    // The page's own detail mechanism, reached through the id it was handed.
    await waitFor(() => expect(getCustomerByIdMock).toHaveBeenCalledWith(3));
    expect(await screen.findByDisplayValue('Acme Corp Ltd')).toBeInTheDocument();
  });

  it('consumes the state once, so the view does not reopen on a later render', async () => {
    const { rerender } = renderPage({ customerId: '3' });
    await waitFor(() => expect(getCustomerByIdMock).toHaveBeenCalledTimes(1));

    rerender(
      <MemoryRouter initialEntries={[{ pathname: '/sales/customers', state: { customerId: '3' } }]}>
        <Routes>
          <Route path="/sales/customers" element={<CustomerLedger />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(getAllCustomersMock).toHaveBeenCalled());
    expect(getCustomerByIdMock).toHaveBeenCalledTimes(1);
  });

  it('leaves the list alone for a stale customer id', async () => {
    renderPage({ customerId: '9999' });

    await waitFor(() => expect(screen.getByText('Acme Corp Ltd')).toBeInTheDocument());
    expect(screen.getByText('Blue Ridge Trading')).toBeInTheDocument();
    expect(getCustomerByIdMock).not.toHaveBeenCalled();
  });

  it('behaves exactly as before when there is no router state', async () => {
    renderPage(undefined);

    await waitFor(() => expect(screen.getByText('Acme Corp Ltd')).toBeInTheDocument());
    expect(screen.getByText('Blue Ridge Trading')).toBeInTheDocument();
    expect(getCustomerByIdMock).not.toHaveBeenCalled();
  });
});
