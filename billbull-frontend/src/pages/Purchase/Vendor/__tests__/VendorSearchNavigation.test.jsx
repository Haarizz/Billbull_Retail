import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// --- Module mocks ------------------------------------------------------------

const getVendorsMock = vi.fn();
vi.mock('../../../../api/vendorsApi', () => ({
  getVendors: (...args) => getVendorsMock(...args),
  createVendor: vi.fn(),
  createVendorDraft: vi.fn(),
  importVendors: vi.fn(),
  updateVendor: vi.fn(),
  deleteVendor: vi.fn(),
}));

vi.mock('../../../../api/financialsApi', () => ({
  fetchStatementOfAccount: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../../../../api/printTemplateApi', () => ({
  getTemplatesByCategory: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../../../../context/BranchContext', () => ({
  useBranch: () => ({ activeBranch: { id: 1, name: 'Dubai' }, branches: [], isAllBranches: false }),
}));

vi.mock('../../../../context/CompanyContext', () => ({
  default: React.createContext({ company: { currency: 'AED' } }),
  useCompany: () => ({ company: { currency: 'AED' } }),
}));

import Vendor from '../Vendor';

// --- Fixtures ----------------------------------------------------------------

const VENDORS = [
  { id: 21, code: 'VEN-0021', name: 'TechSupply FZCO', status: 'Active', balance: '1200', contactPerson: 'Sam' },
  { id: 22, code: 'VEN-0022', name: 'Gulf Hardware LLC', status: 'Active', balance: '800', contactPerson: 'Ali' },
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
    <MemoryRouter initialEntries={[{ pathname: '/purchases/vendors', state }]}>
      <Routes>
        <Route path="/purchases/vendors" element={<Vendor />} />
      </Routes>
    </MemoryRouter>
  );

const searchBox = () => screen.getByPlaceholderText(/search vendors/i);

const highlightedRow = () => document.querySelector('tr[data-highlighted="true"]');

/**
 * The vendorId router-state contract from utils/entityNavigation.
 *
 * <p>The deliberate limit of this contract: arriving from global search selects the
 * vendor, it does not open CreateVendorWizard. That component is the page's create/edit
 * mutation form, and a read-only search hit has no business landing inside one.
 */
describe('Vendor — global search navigation', () => {
  beforeEach(() => {
    getVendorsMock.mockReset();
    getVendorsMock.mockResolvedValue(VENDORS);
  });

  afterEach(cleanup);

  it('selects and filters down to the vendor named in router state', async () => {
    renderPage({ vendorId: '21' });

    await waitFor(() => expect(searchBox()).toHaveValue('VEN-0021'));
    await waitFor(() => expect(highlightedRow()).not.toBeNull());
    expect(highlightedRow()).toHaveAttribute('data-vendor-id', '21');
    expect(screen.getByText('TechSupply FZCO')).toBeInTheDocument();
  });

  it('does not open the create/edit wizard', async () => {
    renderPage({ vendorId: '21' });

    await waitFor(() => expect(searchBox()).toHaveValue('VEN-0021'));
    // The wizard replaces the list entirely, so the list's own search box is the tell.
    expect(searchBox()).toBeInTheDocument();
    expect(screen.queryByText(/vendor registration/i)).not.toBeInTheDocument();
  });

  it('leaves the list untouched for a stale vendor id', async () => {
    renderPage({ vendorId: '9999' });

    await waitFor(() => expect(screen.getByText('TechSupply FZCO')).toBeInTheDocument());
    expect(screen.getByText('Gulf Hardware LLC')).toBeInTheDocument();
    expect(searchBox()).toHaveValue('');
    expect(highlightedRow()).toBeNull();
  });

  it('behaves exactly as before when there is no router state', async () => {
    renderPage(undefined);

    await waitFor(() => expect(screen.getByText('TechSupply FZCO')).toBeInTheDocument());
    expect(screen.getByText('Gulf Hardware LLC')).toBeInTheDocument();
    expect(searchBox()).toHaveValue('');
    expect(highlightedRow()).toBeNull();
  });

  it('loads the roster once — arriving from search costs no extra request', async () => {
    renderPage({ vendorId: '21' });

    await waitFor(() => expect(searchBox()).toHaveValue('VEN-0021'));
    expect(getVendorsMock).toHaveBeenCalledTimes(1);
  });
});
