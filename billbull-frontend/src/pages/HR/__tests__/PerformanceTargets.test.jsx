import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('../../../components/CurrencyAmount', () => ({
  default: ({ value }) => <span>{value == null ? '' : String(value)}</span>,
}));

import PerformanceTargets from '../Emp_Role.jsx/PerformanceTargets';

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
