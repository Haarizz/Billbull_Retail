import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// --- Module mocks ------------------------------------------------------------

const ACCOUNTS = [
  {
    id: 'acc-1', code: '1100', name: 'Accounts Receivable', accountGroup: 'Assets',
    subGroup: 'Current Assets', accountType: 'Asset', branch: 'Dubai', status: 'active',
    balanceAmount: 4000, balanceType: 'Dr', isGroup: false, costCenterCode: null, level: 4,
  },
  {
    id: 'acc-2', code: '4000', name: 'Sales Revenue', accountGroup: 'Income',
    subGroup: 'Revenue', accountType: 'Income', branch: 'Dubai', status: 'active',
    balanceAmount: 9000, balanceType: 'Cr', isGroup: false, costCenterCode: null, level: 4,
  },
];

const getAccountsMock = vi.fn(() => Promise.resolve(ACCOUNTS));

vi.mock('../../../api/ledgerApi', () => ({
  getAccounts: (...args) => getAccountsMock(...args),
  getCostCenters: vi.fn(() => Promise.resolve([])),
  updateCostCenter: vi.fn(),
  getTransactions: vi.fn(() => Promise.resolve([])),
  getBankAccounts: vi.fn(() => Promise.resolve([])),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  archiveAccount: vi.fn(),
  unarchiveAccount: vi.fn(),
  createCostCenter: vi.fn(),
  archiveCostCenter: vi.fn(),
  unarchiveCostCenter: vi.fn(),
  getNextAccountCode: vi.fn(() => Promise.resolve('1101')),
  getOpeningBalanceLocks: vi.fn(() => Promise.resolve({})),
  saveOpeningBalance: vi.fn(),
  createTransaction: vi.fn(),
}));

vi.mock('../../../api/financialReportsBackendApi', () => ({
  getAccountTree: vi.fn(() => Promise.resolve([])),
  getLedgerStatement: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../../../api/employeesApi', () => ({
  employeesApi: { getActiveEmployees: vi.fn(() => Promise.resolve([])) },
}));

vi.mock('../../../context/BranchContext', () => ({
  useBranch: () => ({
    branches: [{ id: 1, name: 'Dubai' }],
    defaultBranchName: 'Dubai',
    activeBranch: { id: 1, name: 'Dubai' },
    activeBranchId: 1,
    isAllBranches: false,
  }),
}));

vi.mock('../../../context/CompanyContext', () => ({
  default: React.createContext({ company: { currency: 'AED' } }),
  useCompany: () => ({ company: { currency: 'AED' } }),
}));

import Ledger from '../Ledger';

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
    <MemoryRouter initialEntries={[{ pathname: '/finance/ledger', state }]}>
      <Routes>
        <Route path="/finance/ledger" element={<Ledger />} />
      </Routes>
    </MemoryRouter>
  );

const chartTab = () => screen.getByRole('button', { name: /chart of accounts/i });
// The chart has two view modes with separate search boxes; an arrival lands on the
// list view, whose box is the one keyed by account code.
const listSearchBox = () => screen.getByPlaceholderText('Search accounts...');
const treeSearchBox = () => screen.getByPlaceholderText('Search COA tree...');

/**
 * The { accountCode, tab } router-state contract from utils/entityNavigation.
 *
 * <p>The page resolves the account out of its own loaded rows rather than being handed a
 * row object in route state — the view modal needs formatted balance/branch fields that
 * only the page can produce, and fabricating them in the navigation layer would put
 * display strings on the URL's state.
 */
describe('Ledger — global search navigation', () => {
  beforeEach(() => {
    getAccountsMock.mockReset().mockResolvedValue(ACCOUNTS);
  });

  afterEach(cleanup);

  it('selects the account named by accountCode and shows it in the view modal', async () => {
    renderPage({ accountCode: '1100', tab: 'chart' });

    // The modal renders the real row, including its name and code.
    await waitFor(() => expect(screen.getAllByText('Accounts Receivable').length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getAllByText('1100').length).toBeGreaterThan(0));
  });

  it('activates the chart tab', async () => {
    renderPage({ accountCode: '1100', tab: 'chart' });

    await waitFor(() => expect(getAccountsMock).toHaveBeenCalled());
    // The active tab carries the selected styling the page applies to it.
    await waitFor(() => expect(chartTab().className).toMatch(/bg-slate-100/));
  });

  it('filters the chart down to the requested account', async () => {
    renderPage({ accountCode: '1100', tab: 'chart' });

    await waitFor(() => expect(listSearchBox()).toHaveValue('1100'));
  });

  it('leaves the chart untouched for an unknown account code', async () => {
    renderPage({ accountCode: '9999', tab: 'chart' });

    await waitFor(() => expect(getAccountsMock).toHaveBeenCalled());
    // Still on the default tree view, unfiltered.
    expect(treeSearchBox()).toHaveValue('');
    expect(screen.queryByPlaceholderText('Search accounts...')).not.toBeInTheDocument();
  });

  it('behaves exactly as before when there is no router state', async () => {
    renderPage(undefined);

    await waitFor(() => expect(getAccountsMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText('Accounts Receivable').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Sales Revenue').length).toBeGreaterThan(0);
    // Default tree view, untouched.
    expect(treeSearchBox()).toHaveValue('');
  });
});
