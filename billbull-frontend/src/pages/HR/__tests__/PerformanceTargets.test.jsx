import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../../../components/CurrencyAmount', () => ({
  default: ({ value }) => <span>{value == null ? '' : String(value)}</span>,
}));

const getTargetReadiness = vi.fn();
vi.mock('../../../api/employeeTargetsApi', () => ({
  getTargetReadiness: (...a) => getTargetReadiness(...a),
}));

import PerformanceTargets from '../Emp_Role.jsx/PerformanceTargets';

const READY = { required: true, ready: true, month: '2026-09-01', missing: [] };
const missingRow = (over = {}) => ({
  employeeId: 3, employeeCode: 'EMP-003', employeeName: 'Sales B', role: 'Salesperson',
  missingTarget: true, missingCommission: false, ...over,
});

const row = (over = {}) => ({
  employeeId: 1,
  employeeCode: 'EMP-001',
  employeeName: 'Cashier One',
  role: 'Cashier',
  department: 'Store Team',
  branchName: 'Main',
  employeeStatus: 'Active',
  targetAmount: '100000.00',
  commissionRate: '10.00',
  sales: '50000.00',
  bills: 12,
  achievementPercent: '50.00',
  commission: '5000.00',
  remainingTarget: '50000.00',
  targetStatus: 'On Track',
  ...over,
});

const payload = (over = {}) => ({
  month: '2026-09-01',
  branchId: null,
  branchFiltered: false,
  rows: [row()],
  totalTarget: '180000.00',
  totalSales: '130000.00',
  totalBills: 32,
  overallAchievementPercent: '72.22',
  totalCommission: '11400.00',
  unassignedSales: '0.00',
  unassignedBills: 0,
  ...over,
});

const renderView = (props = {}) => render(
  <PerformanceTargets
    month="2026-09-01"
    onMonthChange={() => {}}
    branches={[{ id: 1, name: 'Main' }, { id: 2, name: 'Branch Two' }]}
    branchId={null}
    onBranchChange={() => {}}
    performance={payload()}
    loading={false}
    error=""
    onOpenSetTargets={() => {}}
    canEditTargets
    {...props}
  />
);

describe('PerformanceTargets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTargetReadiness.mockResolvedValue({ required: false, ready: true, missing: [] });
  });

  it('renders the server-supplied employee row without recomputing anything', () => {
    renderView();
    expect(screen.getByText('Cashier One')).toBeInTheDocument();
    expect(screen.getByText('EMP-001')).toBeInTheDocument();
    expect(screen.getByText('50000.00')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('50.00%')).toBeInTheDocument();
    expect(screen.getByText('5000.00')).toBeInTheDocument();
    expect(screen.getByText('On Track')).toBeInTheDocument();
  });

  it('renders the server-computed totals verbatim', () => {
    renderView();
    // Labelled as attributed sales — the figure excludes invoices with no salesperson.
    expect(screen.getByText('Attributed Sales')).toBeInTheDocument();
    expect(screen.queryByText('Total Sales')).not.toBeInTheDocument();
    // 72.22 is the server's SUM(sales)/SUM(target); the component must not average the rows.
    expect(screen.getByText('72.22%')).toBeInTheDocument();
    expect(screen.getByText('180000.00')).toBeInTheDocument();
    expect(screen.getByText('130000.00')).toBeInTheDocument();
    expect(screen.getByText('11400.00')).toBeInTheDocument();
  });

  it('shows a dash for achievement when the employee has no target', () => {
    renderView({
      performance: payload({
        rows: [row({ targetAmount: null, achievementPercent: null, remainingTarget: null, targetStatus: 'No Target' })],
      }),
    });
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText('No Target')).toBeInTheDocument();
  });

  it('shows a dash rather than 0% or Infinity when a target is zero', () => {
    // The server sends null achievement for a zero target; the UI must not invent a number.
    renderView({
      performance: payload({
        rows: [row({ targetAmount: '0.00', achievementPercent: null, targetStatus: 'No Target' })],
        overallAchievementPercent: null,
      }),
    });
    expect(screen.queryByText('Infinity%')).not.toBeInTheDocument();
    expect(screen.queryByText('0.00%')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no rows for the month', () => {
    renderView({ performance: payload({ rows: [] }) });
    expect(screen.getByText(/No employee performance for/)).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    renderView({ loading: true, performance: null });
    expect(screen.getByText(/Loading performance/)).toBeInTheDocument();
  });

  it('surfaces a permission error instead of crashing', () => {
    renderView({ performance: null, error: 'You do not have permission to view employee performance.' });
    expect(screen.getByText(/do not have permission/)).toBeInTheDocument();
  });

  it('explains why achievement is hidden under a single-branch filter', () => {
    renderView({
      branchId: 2,
      performance: payload({
        branchId: 2,
        branchFiltered: true,
        rows: [row({ achievementPercent: null, targetStatus: null })],
        overallAchievementPercent: null,
      }),
    });
    expect(screen.getByText(/Targets are global per employee/)).toBeInTheDocument();
    expect(screen.getByText('Not shown for a single branch')).toBeInTheDocument();
  });

  it('surfaces the unassigned bucket when there is one', () => {
    renderView({ performance: payload({ unassignedSales: '4200.00', unassignedBills: 9 }) });
    const note = screen.getByTestId('unassigned-sales');
    expect(within(note).getByText('Unassigned Sales:')).toBeInTheDocument();
    expect(within(note).getByText('4200.00')).toBeInTheDocument();
    expect(note).toHaveTextContent('9 bill(s)');
    // It must say what "unassigned" means and that it is excluded from employee figures.
    expect(note).toHaveTextContent('no salesperson recorded');
    expect(note).toHaveTextContent('not included in any');
  });

  it('hides the unassigned note when everything is attributed', () => {
    renderView();
    expect(screen.queryByTestId('unassigned-sales')).not.toBeInTheDocument();
  });

  it('keeps an inactive employee visible and flags their status', () => {
    renderView({ performance: payload({ rows: [row({ employeeStatus: 'Inactive' })] }) });
    expect(screen.getByText('Cashier One')).toBeInTheDocument();
    expect(screen.getByText(/· Inactive/)).toBeInTheDocument();
  });

  it('only offers Set Targets to a user with edit permission', () => {
    const { rerender } = renderView({ canEditTargets: true });
    expect(screen.getByRole('button', { name: 'Set Targets' })).toBeInTheDocument();

    rerender(
      <PerformanceTargets
        month="2026-09-01" onMonthChange={() => {}} branches={[]} branchId={null}
        onBranchChange={() => {}} performance={payload()} loading={false} error=""
        onOpenSetTargets={() => {}} canEditTargets={false}
      />
    );
    expect(screen.queryByRole('button', { name: 'Set Targets' })).not.toBeInTheDocument();
  });
});

/**
 * The target-readiness banner.
 *
 * The point of this banner is that an administrator finds out about incomplete configuration HERE
 * rather than from a cashier whose sale has just been refused. It renders the server's own
 * readiness answer — the same one the POS checkout gate uses — so the warning and the refusal can
 * never disagree.
 */
describe('the target-readiness banner', () => {
  beforeEach(() => vi.clearAllMocks());

  it('warns, counts and names the employees blocking the tills', async () => {
    getTargetReadiness.mockResolvedValue({
      ...READY,
      ready: false,
      missing: [missingRow(), missingRow({ employeeId: 4, employeeCode: 'EMP-004', employeeName: 'Cashier C', role: 'Cashier + Salesperson', missingTarget: false, missingCommission: true })],
    });

    renderView();

    await waitFor(() => expect(screen.getByText('Salesperson Setup Incomplete')).toBeInTheDocument());
    expect(screen.getByText(/2 active Salesperson/)).toBeInTheDocument();
    expect(screen.getByText(/POS sales are currently blocked/)).toBeInTheDocument();

    // Not auto-opened: this screen is opened many times a day and a dialog on every visit trains
    // people to dismiss it unread. The names are one click away.
    expect(screen.queryByText('Missing Configuration')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Review Missing Employees/ }));

    const dialog = screen.getByText('Missing Configuration').closest('div').parentElement;
    expect(within(dialog).getByText('Sales B')).toBeInTheDocument();
    expect(within(dialog).getByText('Cashier C')).toBeInTheDocument();
  });

  it('stays silent when this month is fully configured', async () => {
    getTargetReadiness.mockResolvedValue(READY);
    renderView();
    await waitFor(() => expect(getTargetReadiness).toHaveBeenCalled());
    expect(screen.queryByText('Salesperson Setup Incomplete')).not.toBeInTheDocument();
  });

  it('stays silent when target enforcement is switched off', async () => {
    // `required: false` means nothing is being enforced, so incomplete configuration is not a
    // problem to report — there is nothing for it to block.
    getTargetReadiness.mockResolvedValue({ required: false, ready: true, missing: [] });
    renderView();
    await waitFor(() => expect(getTargetReadiness).toHaveBeenCalled());
    expect(screen.queryByText('Salesperson Setup Incomplete')).not.toBeInTheDocument();
  });

  it('invents no warning when the readiness read fails', async () => {
    getTargetReadiness.mockRejectedValue(new Error('offline'));
    renderView();
    await waitFor(() => expect(getTargetReadiness).toHaveBeenCalled());
    expect(screen.queryByText('Salesperson Setup Incomplete')).not.toBeInTheDocument();
  });

  it('asks about the month being viewed, not always today', async () => {
    getTargetReadiness.mockResolvedValue(READY);
    renderView({ month: '2026-07-01' });
    await waitFor(() => expect(getTargetReadiness).toHaveBeenCalledWith({ month: '2026-07-01' }));
  });
});

/**
 * The per-row Configuration column.
 *
 * `commission_rate = 0.00` is a COMPLETE configuration that happens to pay nothing, and NULL is
 * "nobody has configured one". Reporting 0% as missing is the single most likely way to get this
 * wrong, and it would send an administrator hunting for a problem that does not exist.
 */
describe('the per-row configuration status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTargetReadiness.mockResolvedValue({ required: false, ready: true, missing: [] });
  });

  const statusOf = (over) => {
    renderView({ performance: payload({ rows: [row({ role: 'Salesperson', ...over })] }) });
    return screen.getByText('Cashier One').closest('tr');
  };

  it('reads a configured target and rate as Ready', () => {
    expect(within(statusOf({ targetAmount: '25000.00', commissionRate: '10.00' }))
      .getByText('Ready')).toBeInTheDocument();
  });

  it('treats an explicit 0% commission as configured, not missing', () => {
    expect(within(statusOf({ targetAmount: '25000.00', commissionRate: '0.00' }))
      .getByText('Ready')).toBeInTheDocument();
  });

  it('flags a NULL commission as missing', () => {
    expect(within(statusOf({ targetAmount: '25000.00', commissionRate: null }))
      .getByText('Missing Commission')).toBeInTheDocument();
  });

  it('flags an absent target as missing', () => {
    expect(within(statusOf({ targetAmount: null, commissionRate: '10.00' }))
      .getByText('Missing Target')).toBeInTheDocument();
  });

  it('flags a zero target as missing — a target of nothing is not a target', () => {
    expect(within(statusOf({ targetAmount: '0.00', commissionRate: '10.00' }))
      .getByText('Missing Target')).toBeInTheDocument();
  });

  it('says nothing about an ineligible designation', () => {
    // The rule applies to Salesperson / Cashier + Salesperson only. Marking a storekeeper
    // "Missing Target" would be noise hiding the rows that actually block the tills.
    const tr = statusOf({ role: 'Storekeeper', targetAmount: null, commissionRate: null });
    expect(within(tr).queryByText('Missing Target & Commission')).not.toBeInTheDocument();
  });

  it('says nothing about an inactive eligible employee', () => {
    // An inactive salesperson cannot ring up a sale, so their configuration cannot block one.
    const tr = statusOf({ employeeStatus: 'Inactive', targetAmount: null, commissionRate: null });
    expect(within(tr).queryByText('Missing Target & Commission')).not.toBeInTheDocument();
  });
});

describe('commission eligibility on a row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTargetReadiness.mockResolvedValue({ required: false, ready: true, missing: [] });
  });

  it('labels an unearned 0.00 so it cannot be read as an amount accruing', () => {
    renderView({ performance: payload({ rows: [row({
      commission: '0.00', commissionEligible: false, commissionStatus: 'Not Eligible',
    })] }) });
    expect(screen.getByText('Not Eligible')).toBeInTheDocument();
  });

  it('labels an earned commission as eligible', () => {
    renderView({ performance: payload({ rows: [row({
      targetAmount: '25000.00', sales: '30000.00',
      commission: '3000.00', commissionEligible: true, commissionStatus: 'Eligible',
    })] }) });
    expect(screen.getByText('3000.00')).toBeInTheDocument();
    expect(screen.getByText('Eligible')).toBeInTheDocument();
  });

  it('shows a dash rather than a figure when the server suppressed commission', () => {
    // Under a branch filter the server sends null: one branch's sales measured against a global
    // target would report a genuinely eligible employee as earning nothing.
    renderView({ performance: payload({
      branchFiltered: true,
      rows: [row({ commission: null, commissionStatus: null, commissionEligible: false })],
      totalCommission: null,
    }) });
    expect(screen.queryByText('Not Eligible')).not.toBeInTheDocument();
  });
});
