import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import SalespersonScanModal from '../features/sales/SalespersonScanModal';

/**
 * ONE modal, both entry states. What matters here is that the re-verification path is the SAME
 * component and writes through the SAME onVerify callback — a second implementation would be a
 * second source of truth for what the checkout sends.
 */

const VERIFIED = {
  id: 7,
  employeeCode: 'EMP9664',
  name: 'Manager One',
  role: 'Salesperson',
  status: 'Active',
  targetAmount: '100000.00',
  commissionRate: '10.00',
};

const setup = (props = {}) => {
  const onVerify = vi.fn().mockResolvedValue(VERIFIED);
  const onClear = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <SalespersonScanModal
      open onVerify={onVerify} onClear={onClear} onClose={onClose} {...props} />
  );
  return { onVerify, onClear, onClose, view };
};

const barcodeField = () => screen.getByLabelText('Employee barcode');

describe('SalespersonScanModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when closed', () => {
    const { container } = render(<SalespersonScanModal open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  // ── first verification ──────────────────────────────────────────────────

  it('opens in the scan state when nobody is verified yet', () => {
    setup();
    expect(screen.getByText('Select Salesperson')).toBeTruthy();
    expect(screen.getByText('Scan employee barcode')).toBeTruthy();
    expect(barcodeField()).toBeTruthy();
  });

  it('autofocuses the barcode field so a wedge scan lands here, not in the cart', async () => {
    setup();
    await waitFor(() => expect(document.activeElement).toBe(barcodeField()));
  });

  it('submits the scanned code on Enter', async () => {
    const { onVerify } = setup();
    fireEvent.change(barcodeField(), { target: { value: 'EMP9664' } });
    fireEvent.keyDown(barcodeField(), { key: 'Enter' });
    await waitFor(() => expect(onVerify).toHaveBeenCalledWith('EMP9664'));
  });

  it('supports manual typing plus the Verify button', async () => {
    const { onVerify } = setup();
    fireEvent.change(barcodeField(), { target: { value: ' emp9664 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(onVerify).toHaveBeenCalledWith('emp9664'));
  });

  it('will not submit an empty code', () => {
    const { onVerify } = setup();
    expect(screen.getByRole('button', { name: 'Verify' }).disabled).toBe(true);
    fireEvent.keyDown(barcodeField(), { key: 'Enter' });
    expect(onVerify).not.toHaveBeenCalled();
  });

  it('shows the found employee, including target and commission', async () => {
    const { onVerify } = setup();
    fireEvent.change(barcodeField(), { target: { value: 'EMP9664' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(onVerify).toHaveBeenCalled());

    // The parent owns the verified state, so re-render with it the way the hook would.
    setup({ current: VERIFIED });
    expect(screen.getAllByText('Manager One').length).toBeGreaterThan(0);
    expect(screen.getAllByText('EMP9664').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Salesperson').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    // Grouping is pinned to en-US in the component so this is stable across machines.
    expect(screen.getAllByText('AED 100,000.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('10.00%').length).toBeGreaterThan(0);
  });

  // ── the zero-commission rule, in the UI ─────────────────────────────────

  it('renders a configured 0% commission as 0.00%, not as "Not set"', () => {
    setup({ current: { ...VERIFIED, commissionRate: '0.00' } });
    expect(screen.getByText('0.00%')).toBeTruthy();
    expect(screen.queryByText('Not set')).toBeNull();
  });

  it('renders an unconfigured (null) commission as "Not set", not as 0%', () => {
    setup({ current: { ...VERIFIED, commissionRate: null } });
    expect(screen.getByText('Not set')).toBeTruthy();
    expect(screen.queryByText('0.00%')).toBeNull();
  });

  it('renders a missing target as "Not set"', () => {
    setup({ current: { ...VERIFIED, targetAmount: null } });
    expect(screen.getAllByText('Not set').length).toBeGreaterThan(0);
  });

  // ── re-verification ─────────────────────────────────────────────────────

  it('opens showing the current salesperson when one is already verified', () => {
    setup({ current: VERIFIED });
    expect(screen.getByText('Current Salesperson')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Scan New' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.queryByLabelText('Employee barcode')).toBeNull();
  });

  it('Scan New clears the verification and returns to the scan field', () => {
    const { onClear } = setup({ current: VERIFIED });
    fireEvent.click(screen.getByRole('button', { name: 'Scan New' }));
    expect(onClear).toHaveBeenCalled();
    expect(screen.getByLabelText('Employee barcode')).toBeTruthy();
  });

  it('Continue simply closes — it does not re-verify', () => {
    const { onClose, onVerify } = setup({ current: VERIFIED });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onClose).toHaveBeenCalled();
    expect(onVerify).not.toHaveBeenCalled();
  });

  it('replaces the salesperson through the SAME onVerify callback', async () => {
    const onVerify = vi.fn().mockResolvedValue({ ...VERIFIED, id: 9, employeeCode: 'EMP0009' });
    render(<SalespersonScanModal open current={VERIFIED} onVerify={onVerify} onClear={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Scan New' }));
    fireEvent.change(screen.getByLabelText('Employee barcode'), { target: { value: 'EMP0009' } });
    fireEvent.keyDown(screen.getByLabelText('Employee barcode'), { key: 'Enter' });
    await waitFor(() => expect(onVerify).toHaveBeenCalledWith('EMP0009'));
  });

  // ── rejection ───────────────────────────────────────────────────────────

  it('shows the server reason and stays in the scan state on rejection', async () => {
    const onVerify = vi.fn().mockResolvedValue(null);
    render(
      <SalespersonScanModal
        open onVerify={onVerify} onClose={vi.fn()} onClear={vi.fn()}
        error="Employee is not an eligible salesperson." />
    );
    fireEvent.change(screen.getByLabelText('Employee barcode'), { target: { value: 'EMP0005' } });
    fireEvent.keyDown(screen.getByLabelText('Employee barcode'), { key: 'Enter' });

    await waitFor(() => expect(onVerify).toHaveBeenCalled());
    expect(screen.getByText('Employee is not an eligible salesperson.')).toBeTruthy();
    expect(screen.getByLabelText('Employee barcode')).toBeTruthy();
  });

  it('marks its subtree so the POS wedge listener suppresses product scanning', () => {
    const { view } = setup();
    expect(view.container.querySelector('[data-pos-scan-suppress="true"]')).toBeTruthy();
  });

  it('disables Verify while a lookup is in flight', () => {
    setup({ verifying: true });
    fireEvent.change(barcodeField(), { target: { value: 'EMP9664' } });
    expect(screen.getByRole('button', { name: 'Verifying…' }).disabled).toBe(true);
  });
});
