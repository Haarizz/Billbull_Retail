import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CheckoutCompleteActions from '../features/checkout/CheckoutCompleteActions';

/**
 * Enter on the COMPLETE screen starts the next sale with no POS input controller mounted (the
 * posInputV2-off path, or a caret the controller does not route): useNewSaleEnterFallback.
 */
const setup = () => {
  const props = { onNewSale: vi.fn(), onPrintReceipt: vi.fn(), onReprint: vi.fn(), onShare: vi.fn() };
  render(<CheckoutCompleteActions {...props} />);
  return props;
};
const newSaleButton = () => screen.getByRole('button', { name: /New Sale/ });

afterEach(cleanup);

describe('COMPLETE screen Enter fallback', () => {
  it('Enter with the caret on no control starts the new sale once', () => {
    const props = setup();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(props.onNewSale).toHaveBeenCalledTimes(1);
  });

  it('Enter on the New Sale button starts it once, not again through the button activation', () => {
    const props = setup();
    newSaleButton().focus();
    const notCancelled = fireEvent.keyDown(newSaleButton(), { key: 'Enter' });
    expect(notCancelled).toBe(false); // the native click activation is cancelled
    expect(props.onNewSale).toHaveBeenCalledTimes(1);
  });

  it('another button keeps its own Enter', () => {
    const props = setup();
    fireEvent.keyDown(screen.getByRole('button', { name: /Print Receipt/ }), { key: 'Enter' });
    expect(props.onNewSale).not.toHaveBeenCalled();
  });

  it('an Enter already handled, held down, or with a modifier does nothing', () => {
    const props = setup();
    const handled = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    handled.preventDefault();
    document.body.dispatchEvent(handled);
    fireEvent.keyDown(document.body, { key: 'Enter', repeat: true });
    fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true });
    expect(props.onNewSale).not.toHaveBeenCalled();
  });

  it('stops listening once the COMPLETE screen unmounts', () => {
    const props = setup();
    cleanup();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(props.onNewSale).not.toHaveBeenCalled();
  });
});
