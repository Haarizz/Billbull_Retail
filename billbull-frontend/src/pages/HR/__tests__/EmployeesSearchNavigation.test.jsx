import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// --- Module mocks ------------------------------------------------------------

const getActiveEmployeesMock = vi.fn();
const getEmployeeByIdMock = vi.fn();

vi.mock('../../../api/employeesApi', () => ({
  employeesApi: {
    getActiveEmployees: (...args) => getActiveEmployeesMock(...args),
    getPendingApprovals: vi.fn(() => Promise.resolve([])),
    getEmployeeById: (...args) => getEmployeeByIdMock(...args),
    createEmployee: vi.fn(),
    updateEmployee: vi.fn(),
    approveEmployee: vi.fn(),
    rejectEmployee: vi.fn(),
    activateEmployee: vi.fn(),
    deactivateEmployee: vi.fn(),
  },
}));

vi.mock('../../../api/usersApi', () => ({
  usersApi: {
    getAllRoles: vi.fn(() => Promise.resolve([])),
    getEmployeeAccess: vi.fn(() => Promise.resolve(null)),
    create: vi.fn(), deleteUser: vi.fn(), freeze: vi.fn(), unfreeze: vi.fn(),
    resetPassword: vi.fn(), assignRoles: vi.fn(), assignBranches: vi.fn(),
  },
}));

vi.mock('../../../api/auth', () => ({ hasRole: () => true }));
vi.mock('../../../api/warehouseApi', () => ({ getWarehouses: vi.fn(() => Promise.resolve([])) }));

vi.mock('../../../context/PermissionContext', () => ({
  usePermissions: () => ({
    canView: () => true, canCreate: () => true, canEdit: () => true, canApprove: () => true,
  }),
}));
vi.mock('../../../context/CompanyContext', () => ({
  default: React.createContext({ company: { currency: 'AED' } }),
  useCompany: () => ({ company: { currency: 'AED' } }),
}));
vi.mock('../../../context/BranchContext', () => ({
  useBranch: () => ({ branches: [{ id: 1, name: 'Dubai' }], activeBranch: { id: 1, name: 'Dubai' } }),
}));

// Performance figures are a separate server payload; the navigation contract must not
// pull them in, so the hook is stubbed to a quiet, empty result.
const performanceHookMock = vi.fn(() => ({
  performance: null, performanceLoading: false, performanceError: '', reloadPerformance: vi.fn(),
}));
vi.mock('../Emp_Role.jsx/useEmployeePerformance', () => ({
  default: (...args) => performanceHookMock(...args),
  monthKey: () => '2026-09',
  monthLabel: () => 'September 2026',
}));

import Employees from '../Emp_Role.jsx/Employees';

// --- Fixtures ----------------------------------------------------------------

const EMPLOYEES = [
  {
    id: 234, firstName: 'Ahmed', lastName: 'Al Mansoori', employeeCode: 'EMP-0234',
    role: 'Senior Sales Executive', department: 'Sales', branch: 'Dubai', status: 'Active',
    email: 'ahmed@example.com',
  },
  {
    id: 235, firstName: 'Fatima', lastName: 'Hassan', employeeCode: 'EMP-0235',
    role: 'Cashier', department: 'Sales', branch: 'Dubai', status: 'Active',
    email: 'fatima@example.com',
  },
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
    <MemoryRouter initialEntries={[{ pathname: '/payroll/employees', state }]}>
      <Routes>
        <Route path="/payroll/employees" element={<Employees />} />
      </Routes>
    </MemoryRouter>
  );

/**
 * The employeeId router-state contract from utils/entityNavigation.
 *
 * <p>The row is resolved out of the roster the page already loads on mount, so arriving
 * from search costs no extra request and reads nothing the list does not already hold.
 * GET /api/employees/{id} is still the drawer's own call — the same one an ordinary row
 * click makes — and it happens only once the drawer is open, never to build the row.
 */
describe('Employees — global search navigation', () => {
  beforeEach(() => {
    getActiveEmployeesMock.mockReset().mockResolvedValue(EMPLOYEES);
    getEmployeeByIdMock.mockReset().mockResolvedValue(EMPLOYEES[0]);
  });

  afterEach(cleanup);

  it('opens the details drawer for the employee named in router state', async () => {
    renderPage({ employeeId: '234' });

    // The drawer is keyed by employee id and fetches its own full record on open.
    await waitFor(() => expect(getEmployeeByIdMock).toHaveBeenCalledWith(234));
  });

  it('resolves the row from the roster, with no extra list or search request', async () => {
    renderPage({ employeeId: '234' });

    await waitFor(() => expect(getEmployeeByIdMock).toHaveBeenCalled());
    expect(getActiveEmployeesMock).toHaveBeenCalledTimes(1);
  });

  it('pulls no payroll or performance data to resolve the row', async () => {
    renderPage({ employeeId: '234' });

    await waitFor(() => expect(getEmployeeByIdMock).toHaveBeenCalled());
    // The performance hook is mounted by the page either way; arriving from search must
    // not ask it for anything extra.
    expect(performanceHookMock.mock.calls.every(([args]) => !args?.employeeId)).toBe(true);
  });

  it('leaves the roster alone for a stale employee id', async () => {
    renderPage({ employeeId: '9999' });

    await waitFor(() => expect(getActiveEmployeesMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText(/Ahmed Al Mansoori/).length).toBeGreaterThan(0));
    expect(getEmployeeByIdMock).not.toHaveBeenCalled();
  });

  it('behaves exactly as before when there is no router state', async () => {
    renderPage(undefined);

    await waitFor(() => expect(screen.getAllByText(/Ahmed Al Mansoori/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Fatima Hassan/).length).toBeGreaterThan(0);
    expect(getEmployeeByIdMock).not.toHaveBeenCalled();
  });
});
