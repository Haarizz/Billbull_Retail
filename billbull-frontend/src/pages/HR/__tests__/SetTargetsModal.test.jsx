import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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

  // Phase 2: commission_rate is nullable, and null means "not configured" — the condition that
  // blocks POS sales when Set Targets enforcement is on. A blank field must therefore travel as
  // null; coercing it to 0 here would mark everyone configured-at-0% and make readiness unfailable.
  it('sends a blank commission as null, not as zero', async () => {
    renderModal();
    fireEvent.change(targetInput('Cashier Two'), { target: { value: '80000' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(saveEmployeeTargetsBulk).toHaveBeenCalled());
    const rowTwo = saveEmployeeTargetsBulk.mock.calls[0][0]
      .find((r) => r.employeeId === 2);
    expect(rowTwo.commissionRate).toBeNull();
  });

  it('sends a typed zero commission as an explicit configured 0%', async () => {
    renderModal();
    fireEvent.change(targetInput('Cashier Two'), { target: { value: '80000' } });
    fireEvent.change(rateInput('Cashier Two'), { target: { value: '0' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(saveEmployeeTargetsBulk).toHaveBeenCalled());
    const rowTwo = saveEmployeeTargetsBulk.mock.calls[0][0]
      .find((r) => r.employeeId === 2);
    expect(rowTwo.commissionRate).toBe(0);
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

  /**
   * The Status column exists because a blank commission box and a box containing 0 look almost
   * identical, and they are two different saves: blank writes NULL ("not configured", which
   * blocks POS sales when SetTargets is on) and 0 writes a real 0% commission (which does not).
   * The column names which one is about to be written, live, before Save is pressed.
   */
  describe('the configuration status column', () => {
    const rowOf = (name) => screen.getByText(name).closest('tr');

    it('reads a filled row as Ready', () => {
      renderModal();
      expect(within(rowOf('Cashier One')).getByText('Ready')).toBeInTheDocument();
    });

    it('reads an empty row as missing both', () => {
      renderModal();
      expect(within(rowOf('Cashier Two')).getByText('Missing Target & Commission')).toBeInTheDocument();
    });

    it('turns Ready as soon as a deliberate 0% is typed — 0 is configured, blank is not', () => {
      renderModal();
      fireEvent.change(targetInput('Cashier Two'), { target: { value: '25000' } });
      expect(within(rowOf('Cashier Two')).getByText('Missing Commission')).toBeInTheDocument();

      fireEvent.change(rateInput('Cashier Two'), { target: { value: '0' } });
      expect(within(rowOf('Cashier Two')).getByText('Ready')).toBeInTheDocument();
    });

    it('falls back to missing when a rate is cleared again', () => {
      renderModal();
      fireEvent.change(rateInput('Cashier One'), { target: { value: '' } });
      expect(within(rowOf('Cashier One')).getByText('Missing Commission')).toBeInTheDocument();
    });
  });
});
