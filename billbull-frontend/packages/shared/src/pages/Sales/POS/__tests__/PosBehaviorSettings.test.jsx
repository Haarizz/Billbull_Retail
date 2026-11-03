import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PosBehaviorSettings from '../features/settings/PosBehaviorSettings';

const STORED = {
  requireCustomer: false,
  supervisorApprovalMode: 'PIN',
  supervisorPinSet: false,
  operatingHoursEnabled: true,
  operatingStartTime: '09:00:00',
  operatingEndTime: '21:00:00',
  businessDayExtensionMinutes: 120,
};

function Harness({ posSettings = STORED, onSave = vi.fn(), onDiscard = vi.fn() }) {
  const [draft, setDraft] = useState(null);
  return (
    <>
      <PosBehaviorSettings posSettings={posSettings} settingsDraft={draft} setSettingsDraft={setDraft}
        settingsSaving={false} handleSaveSettings={onSave} beginEditSettings={onDiscard} />
      <pre data-testid="draft">{JSON.stringify(draft)}</pre>
    </>
  );
}
const draftOf = () => JSON.parse(screen.getByTestId('draft').textContent);

describe('PosBehaviorSettings', () => {
  it('renders every section from the stored settings with no unsaved changes', () => {
    render(<Harness />);
    ['Selling', 'Cart & Cash Drawer', 'Delivery', 'Store Credit', 'Approvals & Access', 'Business Day']
      .forEach(t => expect(screen.getByRole('heading', { name: t })).toBeTruthy());
    expect(screen.queryByText(/unsaved change/)).toBeNull();
    expect(screen.getByRole('radio', { name: 'Optional' }).getAttribute('aria-checked')).toBe('true');
  });

  it('a choice patches the same draft key and shows the save bar', () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Required' }));
    expect(draftOf().requireCustomer).toBe(true);
    expect(screen.getByText('1 unsaved change')).toBeTruthy();
    fireEvent.click(within(screen.getByText('1 unsaved change').closest('div')).getByRole('button', { name: /Save Settings/ }));
    expect(onSave).toHaveBeenCalled();
  });

  it('restates the Business Day phases, including the extension', () => {
    render(<Harness />);
    expect(screen.getByText('09:00 → 21:00')).toBeTruthy();
    expect(screen.getByText('21:00 → 23:00')).toBeTruthy();
  });

  it('warns when an approval policy needs a PIN the branch does not have', () => {
    render(<Harness />);
    expect(screen.queryByText('No supervisor PIN is set for this branch')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'With Approval' }));
    expect(screen.getByText('No supervisor PIN is set for this branch')).toBeTruthy();
    expect(draftOf().posFunctionAccessMode).toBe('SUPERVISOR_PASSWORD');
  });
});
