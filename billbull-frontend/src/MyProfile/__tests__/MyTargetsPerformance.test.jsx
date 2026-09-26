import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../api/employeeTargetsApi', () => ({ getMyPerformance: vi.fn() }));
vi.mock('../../components/CurrencyAmount', () => ({
  default: ({ value }) => <span>{value == null ? '' : String(value)}</span>,
}));

import { getMyPerformance } from '../../api/employeeTargetsApi';
import MyTargetsPerformance from '../MyTargetsPerformance';

const MINE = {
  employeeId: 7,
  employeeCode: 'EMP-007',
  employeeName: 'Manager One',
  targetAmount: '100000.00',
  commissionRate: '10.00',
  sales: '9450.00',
  bills: 2,
  achievementPercent: '9.45',
  // 9,450 against a 100,000 target: the target has NOT been reached, so nothing is earned yet.
  commission: '0.00',
  commissionEligible: false,
  commissionStatus: 'Not Eligible',
  remainingTarget: '90550.00',
  targetStatus: 'Below Target',
};

describe('MyTargetsPerformance', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the signed-in employee\'s own targets', async () => {
    getMyPerformance.mockResolvedValue(MINE);

    render(<MyTargetsPerformance mode="Targets" />);

    await waitFor(() => expect(screen.getByText('My Targets')).toBeInTheDocument());
    expect(screen.getByText('100000.00')).toBeInTheDocument();
    expect(screen.getByText('10.00%')).toBeInTheDocument();
    expect(screen.getByText('90550.00')).toBeInTheDocument();
    expect(screen.getByText(/Manager One/)).toBeInTheDocument();
  });

  it('renders the signed-in employee\'s own performance', async () => {
    getMyPerformance.mockResolvedValue(MINE);

    render(<MyTargetsPerformance mode="Performance" />);

    await waitFor(() => expect(screen.getByText('My Performance')).toBeInTheDocument());
    expect(screen.getByText('9450.00')).toBeInTheDocument();
    expect(screen.getByText('9.45%')).toBeInTheDocument();
    expect(screen.getByText(/Based on 2 invoice\(s\)/)).toBeInTheDocument();
    // Below target: the commission reads as "nothing owed", not as an amount accruing towards
    // payout. Showing 945.00 here would promise money the employee has not earned.
    expect(screen.getByText('Not Eligible')).toBeInTheDocument();
  });

  it('shows the earned commission once the target has been reached', async () => {
    // The worked example: 30,000 of sales against a 25,000 target at 10% pays 3,000 — the full
    // month, not the 5,000 excess.
    getMyPerformance.mockResolvedValue({
      ...MINE,
      targetAmount: '25000.00', sales: '30000.00', achievementPercent: '120.00',
      commission: '3000.00', commissionEligible: true, commissionStatus: 'Eligible',
      remainingTarget: '0.00', targetStatus: 'Target Reached',
    });

    render(<MyTargetsPerformance mode="Performance" />);

    await waitFor(() => expect(screen.getByText('My Performance')).toBeInTheDocument());
    expect(screen.getByText('3000.00')).toBeInTheDocument();
    expect(screen.getByText('Eligible')).toBeInTheDocument();
  });

  it('never sends an employee id — the server resolves identity from the session', async () => {
    getMyPerformance.mockResolvedValue(MINE);

    render(<MyTargetsPerformance mode="Performance" />);

    await waitFor(() => expect(getMyPerformance).toHaveBeenCalled());
    const [args] = getMyPerformance.mock.calls[0];
    expect(args).toEqual({ month: expect.any(String) });
    expect(args).not.toHaveProperty('employeeId');
  });

  it('handles a user with no linked employee gracefully', async () => {
    // Backend replies 204; the api layer maps that to null.
    getMyPerformance.mockResolvedValue(null);

    render(<MyTargetsPerformance mode="Targets" />);

    await waitFor(() =>
      expect(screen.getByText(/not linked to an employee record/)).toBeInTheDocument());
    expect(screen.queryByText('My Targets')).not.toBeInTheDocument();
  });

  it('shows a dash when no target is set for the month', async () => {
    getMyPerformance.mockResolvedValue({
      ...MINE, targetAmount: null, commissionRate: null,
      achievementPercent: null, remainingTarget: null, targetStatus: 'No Target',
    });

    render(<MyTargetsPerformance mode="Targets" />);

    await waitFor(() => expect(screen.getByText('My Targets')).toBeInTheDocument());
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText('No Target')).toBeInTheDocument();
  });

  it('shows sales but no achievement when there is no target', async () => {
    getMyPerformance.mockResolvedValue({
      ...MINE, targetAmount: null, achievementPercent: null, targetStatus: 'No Target',
    });

    render(<MyTargetsPerformance mode="Performance" />);

    await waitFor(() => expect(screen.getByText('9450.00')).toBeInTheDocument());
    expect(screen.getByText('No target set for this month')).toBeInTheDocument();
  });

  it('reports a load failure rather than rendering blank numbers', async () => {
    getMyPerformance.mockRejectedValue(new Error('boom'));

    render(<MyTargetsPerformance mode="Performance" />);

    await waitFor(() =>
      expect(screen.getByText('Failed to load your performance data.')).toBeInTheDocument());
  });

  it('shows a loading state first', () => {
    getMyPerformance.mockReturnValue(new Promise(() => {}));

    render(<MyTargetsPerformance mode="Targets" />);

    expect(screen.getByText(/Loading your targets/)).toBeInTheDocument();
  });
});
