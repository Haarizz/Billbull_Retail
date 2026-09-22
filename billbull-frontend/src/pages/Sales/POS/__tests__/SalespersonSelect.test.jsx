import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SalespersonSelect from '../features/sales/SalespersonSelect';

const OPTIONS = [
  { id: 1, employeeCode: 'EMP-001', name: 'Cashier One' },
  { id: 2, employeeCode: 'EMP-002', name: 'Manager One' },
  { id: 3, employeeCode: 'EMP-003', name: 'Sales Rep' },
];

const input = () => screen.getByRole('combobox');

describe('SalespersonSelect', () => {

  it('shows a loading placeholder while options are being fetched', () => {
    render(<SalespersonSelect options={[]} value={null} onChange={() => {}} loading />);
    expect(input()).toHaveAttribute('placeholder', 'Loading salespersons...');
  });

  it('shows the Unassigned placeholder and an empty value when nothing is selected', () => {
    render(<SalespersonSelect options={OPTIONS} value={null} onChange={() => {}} />);
    expect(input()).toHaveValue('');
    expect(input()).toHaveAttribute('placeholder', 'Unassigned');
  });

  it('renders the selected employee by id', () => {
    render(<SalespersonSelect options={OPTIONS} value={2} onChange={() => {}} />);
    expect(input()).toHaveValue('Manager One');
  });

  it('matches the selected id loosely so a string id from the API still resolves', () => {
    render(<SalespersonSelect options={OPTIONS} value="2" onChange={() => {}} />);
    expect(input()).toHaveValue('Manager One');
  });

  it('lists every option once opened', () => {
    render(<SalespersonSelect options={OPTIONS} value={null} onChange={() => {}} />);
    fireEvent.focus(input());
    expect(screen.getByText('Cashier One')).toBeInTheDocument();
    expect(screen.getByText('Manager One')).toBeInTheDocument();
    expect(screen.getByText('EMP-003')).toBeInTheDocument();
  });

  it('filters by name and employee code', () => {
    render(<SalespersonSelect options={OPTIONS} value={null} onChange={() => {}} />);
    fireEvent.focus(input());

    fireEvent.change(input(), { target: { value: 'manager' } });
    expect(screen.getByText('Manager One')).toBeInTheDocument();
    expect(screen.queryByText('Cashier One')).not.toBeInTheDocument();

    fireEvent.change(input(), { target: { value: 'EMP-003' } });
    expect(screen.getByText('Sales Rep')).toBeInTheDocument();
    expect(screen.queryByText('Manager One')).not.toBeInTheDocument();
  });

  it('renders no phone number even if an older API response still carries one', () => {
    render(<SalespersonSelect
      options={[{ id: 9, employeeCode: 'EMP-009', name: 'Legacy Shape', phone: '050-999' }]}
      value={null} onChange={() => {}} />);
    fireEvent.focus(input());
    expect(screen.getByText('Legacy Shape')).toBeInTheDocument();
    expect(screen.queryByText('050-999')).not.toBeInTheDocument();
  });

  it('emits the employee id — not the code or name — on selection', () => {
    const onChange = vi.fn();
    render(<SalespersonSelect options={OPTIONS} value={null} onChange={onChange} />);
    fireEvent.focus(input());
    fireEvent.click(screen.getByText('Manager One'));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('clears back to Unassigned with null, not an empty string', () => {
    const onChange = vi.fn();
    render(<SalespersonSelect options={OPTIONS} value={2} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Clear salesperson'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('offers no clear control when nothing is selected', () => {
    render(<SalespersonSelect options={OPTIONS} value={null} onChange={() => {}} />);
    expect(screen.queryByLabelText('Clear salesperson')).not.toBeInTheDocument();
  });

  it('shows an empty state when no employee matches', () => {
    render(<SalespersonSelect options={OPTIONS} value={null} onChange={() => {}} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: 'nobody-by-that-name' } });
    expect(screen.getByText('No active employees found')).toBeInTheDocument();
  });

  it('shows an empty state when the roster itself is empty', () => {
    render(<SalespersonSelect options={[]} value={null} onChange={() => {}} />);
    fireEvent.focus(input());
    expect(screen.getByText('No active employees found')).toBeInTheDocument();
  });

  it('selects the highlighted row with Enter after arrowing down', () => {
    const onChange = vi.fn();
    render(<SalespersonSelect options={OPTIONS} value={null} onChange={onChange} />);
    fireEvent.focus(input());
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('arrowing up from the first row stays on the first row', () => {
    const onChange = vi.fn();
    render(<SalespersonSelect options={OPTIONS} value={null} onChange={onChange} />);
    fireEvent.focus(input());
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('keeps the highlight valid after filtering narrows the list', () => {
    // Highlight row 3, then filter down to a single match: Enter must pick that match
    // rather than reading past the end of the shortened list.
    const onChange = vi.fn();
    render(<SalespersonSelect options={OPTIONS} value={null} onChange={onChange} />);
    fireEvent.focus(input());
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.change(input(), { target: { value: 'Cashier' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('closes on Escape without selecting anything', () => {
    const onChange = vi.fn();
    render(<SalespersonSelect options={OPTIONS} value={null} onChange={onChange} />);
    fireEvent.focus(input());
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(screen.queryByText('Manager One')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('surfaces a load error without blocking the control', () => {
    render(<SalespersonSelect options={[]} value={null} onChange={() => {}} error="Could not load salespersons" />);
    expect(screen.getByText('Could not load salespersons')).toBeInTheDocument();
    expect(input()).not.toBeDisabled();
  });
});
