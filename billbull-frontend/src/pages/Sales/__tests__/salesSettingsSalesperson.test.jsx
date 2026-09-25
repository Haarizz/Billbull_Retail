import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * The "SalesPerson & SetTargets" group on Sales → Configure & customize.
 *
 * The load-bearing assertion here is the SAVE PAYLOAD: the backend now merges, but the frontend
 * must still round-trip all three switches, because a screen that silently drops one of them
 * would leave an admin unable to turn enforcement back off from the UI.
 */

const getSalesSettings = vi.fn();
const saveSalesSettings = vi.fn();

vi.mock('../../../api/salesSettingsApi', () => ({
  getSalesSettings: (...args) => getSalesSettings(...args),
  saveSalesSettings: (...args) => saveSalesSettings(...args),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import SalesSettings from '../SalesSettings';

const STORED = {
  stockCheckRequired: true,
  creditLimitPolicy: 'BLOCK',
  salesMode: 'WORKFLOW_DRIVEN',
  salesItemPricePolicy: 'MIN_SALE',
  roundingMode: 'UP',
  roundingPrecision: 0.25,
  zeroPricePolicy: 'ALLOW',
  salespersonRequiredAtPos: false,
  salespersonRequiredAtBackOffice: false,
  monthlyTargetRequired: false,
  documentNumbering: [],
};

const openSalespersonScreen = async () => {
  render(<SalesSettings />);
  const card = await screen.findByText('SalesPerson & SetTargets');
  fireEvent.click(card.closest('button') || card);
  await screen.findByText('Required for this month');
};

describe('SalesSettings — SalesPerson & SetTargets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSalesSettings.mockResolvedValue({ ...STORED });
    saveSalesSettings.mockResolvedValue({ ...STORED });
  });

  it('shows the group on the hub, summarised as Disabled when all three are off', async () => {
    render(<SalesSettings />);
    expect(await screen.findByText('SalesPerson & SetTargets')).toBeTruthy();
    expect(screen.getByText('Disabled')).toBeTruthy();
  });

  it('summarises which switches are on', async () => {
    getSalesSettings.mockResolvedValue({
      ...STORED, salespersonRequiredAtPos: true, monthlyTargetRequired: true,
    });
    render(<SalesSettings />);
    expect(await screen.findByText('POS · Targets required')).toBeTruthy();
  });

  it('renders all three toggles on its own screen', async () => {
    await openSalespersonScreen();
    expect(screen.getByText('POS')).toBeTruthy();
    expect(screen.getByText('Back Office')).toBeTruthy();
    expect(screen.getByText('Required for this month')).toBeTruthy();
  });

  it('reflects the stored values', async () => {
    getSalesSettings.mockResolvedValue({
      ...STORED, salespersonRequiredAtPos: true, salespersonRequiredAtBackOffice: false,
      monthlyTargetRequired: true,
    });
    await openSalespersonScreen();
    const pressed = screen.getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') !== null)
      .map((b) => b.getAttribute('aria-pressed'));
    // POS on, Back Office off, Targets on — in render order.
    expect(pressed).toEqual(['true', 'false', 'true']);
  });

  it('warns that target enforcement is tenant-wide, only while it is on', async () => {
    await openSalespersonScreen();
    expect(screen.queryByText(/This is a tenant-wide rule/i)).toBeNull();

    const toggles = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') !== null);
    fireEvent.click(toggles[2]); // Set Targets → Required for this month

    expect(screen.getByText(/This is a tenant-wide rule/i)).toBeTruthy();
    expect(screen.getByText(/Back-office invoices are not affected/i)).toBeTruthy();
  });

  // ── THE REGRESSION GUARD ────────────────────────────────────────────────

  it('sends all three new fields in the save payload', async () => {
    await openSalespersonScreen();

    const toggles = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') !== null);
    fireEvent.click(toggles[0]); // POS on
    fireEvent.click(toggles[2]); // Targets on

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(saveSalesSettings).toHaveBeenCalled());
    const payload = saveSalesSettings.mock.calls[0][0];

    expect(payload).toHaveProperty('salespersonRequiredAtPos', true);
    expect(payload).toHaveProperty('salespersonRequiredAtBackOffice', false);
    expect(payload).toHaveProperty('monthlyTargetRequired', true);
  });

  it('does not drop the pre-existing settings when saving from this screen', async () => {
    await openSalespersonScreen();

    const toggles = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') !== null);
    fireEvent.click(toggles[0]);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(saveSalesSettings).toHaveBeenCalled());
    const payload = saveSalesSettings.mock.calls[0][0];

    expect(payload.stockCheckRequired).toBe(true);
    expect(payload.creditLimitPolicy).toBe('BLOCK');
    expect(payload.salesMode).toBe('WORKFLOW_DRIVEN');
    expect(payload.salesItemPricePolicy).toBe('MIN_SALE');
    expect(payload.roundingMode).toBe('UP');
    expect(payload.roundingPrecision).toBe(0.25);
    expect(payload.zeroPricePolicy).toBe('ALLOW');
  });
});
