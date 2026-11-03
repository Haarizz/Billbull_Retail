import React, { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AlterItemModal from '../features/cart/AlterItemModal';

const UNITS = [
  { unit: 'PCS', conversion: 1, base: true, price: 89 },
  { unit: 'Box of 12', conversion: 12, base: false, price: 1068 },
];

const item = (over = {}) => ({ id: 1, productId: 1, name: 'Creatine', code: 'SUP-002', price: 89, quantity: 3, discount: 0, ...over });

function Harness({ line, onApply, loadUnits, variant }) {
  const [mode, setMode] = useState('qty');
  const [value, setValue] = useState('');
  const [discountType, setDiscountType] = useState('percent');
  const inputRef = useRef(null);
  return (
    <AlterItemModal
      item={line} mode={mode} onModeChange={setMode} value={value} onValueChange={setValue}
      discountType={discountType} onDiscountTypeChange={setDiscountType} inputRef={inputRef}
      onApply={onApply} onClose={() => {}} formatCurrency={(n) => `AED ${Number(n).toFixed(2)}`}
      loadUnits={loadUnits} variant={variant}
    />
  );
}

afterEach(cleanup);

describe.each(['dialog', 'panel'])('Alter Item — Unit (%s)', (variant) => {
  it('lists the sale units and applies the picked one, re-pricing the preview', async () => {
    const onApply = vi.fn();
    const loadUnits = vi.fn().mockResolvedValue(UNITS);
    render(<Harness line={item()} onApply={onApply} loadUnits={loadUnits} variant={variant} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Unit' }));
    const box = await screen.findByRole('radio', { name: 'Box of 12 (2)' });
    expect(screen.getByRole('radio', { name: 'PCS (1)' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(box);
    expect(box).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByText('AED 3204.00').length).toBeGreaterThan(0);

    fireEvent.keyDown(screen.getByLabelText('Unit — key its number'), { key: 'Enter' });
    expect(onApply).toHaveBeenCalledWith({ quantity: null, price: null, discount: null, unit: UNITS[1] });
    expect(loadUnits).toHaveBeenCalledTimes(1);
  });

  it('picks a unit by its number on the keyboard', async () => {
    const onApply = vi.fn();
    render(<Harness line={item()} onApply={onApply} loadUnits={() => Promise.resolve(UNITS)} variant={variant} />);
    const field = screen.getByLabelText('New quantity');
    fireEvent.keyDown(field, { key: 'u' });
    await screen.findByRole('radio', { name: 'Box of 12 (2)' });
    fireEvent.keyDown(screen.getByLabelText('Unit — key its number'), { key: '2' });
    fireEvent.keyDown(screen.getByLabelText('Unit — key its number'), { key: 'Enter' });
    expect(onApply.mock.calls[0][0].unit).toBe(UNITS[1]);
  });

  it('locks Unit for a batch line and for a single-unit product', async () => {
    const { unmount } = render(<Harness line={item({ batchControlled: true })} onApply={vi.fn()} loadUnits={() => Promise.resolve(UNITS)} variant={variant} />);
    expect(screen.getByRole('tab', { name: 'Unit' })).toBeDisabled();
    unmount();
    render(<Harness line={item()} onApply={vi.fn()} loadUnits={() => Promise.resolve([UNITS[0]])} variant={variant} />);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Unit' })).toBeDisabled());
  });
});
