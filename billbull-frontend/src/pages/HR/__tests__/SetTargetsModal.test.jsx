import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../../api/employeeTargetsApi', () => ({ saveEmployeeTargetsBulk: vi.fn() }));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import { saveEmployeeTargetsBulk } from '../../../api/employeeTargetsApi';
import toast from 'react-hot-toast';
import SetTargetsModal from '../Emp_Role.jsx/SetTargetsModal';

const ROWS = [
  { employeeId: 1, employeeCode: 'EMP-001', employeeName: 'Cashier One', role: 'Cashier', targetAmount: '100000.00', commissionRate: '10.00' },
  { employeeId: 2, employeeCode: 'EMP-002', employeeName: 'Cashier Two', role: 'Cashier', targetAmount: null, commissionRate: null },
];

const renderModal = (props = {}) => render(
  <SetTargetsModal
    open onClose={() => {}} month="2026-09-01" onMonthChange={() => {}}
    rows={ROWS} loading={false} onSaved={() => {}} {...props}
  />
);

const targetInput = (name) => screen.getByLabelText(`Target for ${name}`);
const rateInput = (name) => screen.getByLabelText(`Commission rate for ${name}`);
const saveButton = () => screen.getByRole('button', { name: 'Save All' });

describe('SetTargetsModal', () => {
  beforeEach(() => { vi.clearAllMocks(); saveEmployeeTargetsBulk.mockResolvedValue([]); });

  it('renders nothing when closed', () => {
    const { container } = renderModal({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('seeds the grid from the existing server values', () => {
    renderModal();
    expect(targetInput('Cashier One')).toHaveValue(100000);
    expect(rateInput('Cashier One')).toHaveValue(10);
    // An employee with no target yet starts blank rather than at a phantom zero.
    expect(targetInput('Cashier Two')).toHaveValue(null);
  });

  it('saves only the rows that were filled in, with the selected month', async () => {
    renderModal();
    fireEvent.change(targetInput('Cashier Two'), { target: { value: '80000' } });
    fireEvent.change(rateInput('Cashier Two'), { target: { value: '8' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(saveEmployeeTargetsBulk).toHaveBeenCalled());
    expect(saveEmployeeTargetsBulk).toHaveBeenCalledWith([
      { employeeId: 1, targetMonth: '2026-09-01', targetAmount: 100000, commissionRate: 10 },
      { employeeId: 2, targetMonth: '2026-09-01', targetAmount: 80000, commissionRate: 8 },
    ]);
  });

  it('leaves an untouched employee without a target rather than writing a zero', async () => {
    renderModal({ rows: [ROWS[1]] });
    fireEvent.click(saveButton());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Nothing to save.'));
    expect(saveEmployeeTargetsBulk).not.toHaveBeenCalled();
  });

  it('refuses to save a commission rate above 100', async () => {
    renderModal();
    fireEvent.change(rateInput('Cashier One'), { target: { value: '150' } });

    expect(screen.getByText('Commission cannot exceed 100%')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('refuses to save a negative target', () => {
    renderModal();
    fireEvent.change(targetInput('Cashier One'), { target: { value: '-5' } });

    expect(screen.getByText('Target must be 0 or more')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('refuses to save a negative commission rate', () => {
    renderModal();
    fireEvent.change(rateInput('Cashier One'), { target: { value: '-1' } });

    expect(screen.getByText('Commission must be 0 or more')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('accepts the boundary values 0 and 100', () => {
    renderModal();
    fireEvent.change(rateInput('Cashier One'), { target: { value: '100' } });
    expect(saveButton()).not.toBeDisabled();

    fireEvent.change(rateInput('Cashier One'), { target: { value: '0' } });
    expect(saveButton()).not.toBeDisabled();
  });

  it('filters the grid by search', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Search employees'), { target: { value: 'Two' } });

    expect(screen.getByText('Cashier Two')).toBeInTheDocument();
    expect(screen.queryByText('Cashier One')).not.toBeInTheDocument();
  });

  it('narrows to a single employee when opened from a row action', () => {
    renderModal({ focusEmployeeId: 2 });

    expect(screen.getByText('Cashier Two')).toBeInTheDocument();
    expect(screen.queryByText('Cashier One')).not.toBeInTheDocument();
    // The search box is pointless for a single-employee view.
    expect(screen.queryByLabelText('Search employees')).not.toBeInTheDocument();
  });

  it('reports a server rejection instead of claiming success', async () => {
    saveEmployeeTargetsBulk.mockRejectedValue({ response: { data: { message: 'Commission rate cannot exceed 100.' } } });
    const onSaved = vi.fn();
    renderModal({ onSaved });

    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Commission rate cannot exceed 100.'));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('reloads the grid after a successful save', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderModal({ onSaved, onClose });

    fireEvent.click(saveButton());

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a loading state while the roster is being fetched', () => {
    renderModal({ loading: true, rows: [] });
    expect(screen.getByText(/Loading employees/)).toBeInTheDocument();
  });
});
