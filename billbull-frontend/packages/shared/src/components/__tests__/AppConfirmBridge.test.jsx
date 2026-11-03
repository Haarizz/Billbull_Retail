import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AppConfirmBridge, { confirmDialog } from '../AppConfirmBridge';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ask = (input) => {
  let promise;
  act(() => { promise = confirmDialog(input); });
  return promise;
};

describe('confirmDialog with AppConfirmBridge mounted', () => {
  it('shows title, message and labels, and resolves true on confirm', async () => {
    const nativeConfirm = vi.spyOn(window, 'confirm');
    render(<AppConfirmBridge />);
    const answer = ask({ title: 'Sign out of the till?', message: 'Your POS session stays open.', confirmLabel: 'Sign out' });

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Sign out of the till?')).toBeInTheDocument();
    expect(screen.getByText('Your POS session stays open.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await expect(answer).resolves.toBe(true);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it('resolves false on Cancel and on Escape', async () => {
    render(<AppConfirmBridge />);
    const first = ask({ title: 'Remove?' });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await expect(first).resolves.toBe(false);

    const second = ask('Plain question?');
    await screen.findByRole('alertdialog');
    await userEvent.keyboard('{Escape}');
    await expect(second).resolves.toBe(false);
  });

  it('starts a danger question on Cancel, so Enter does not confirm it', async () => {
    render(<AppConfirmBridge />);
    const answer = ask({ title: 'Delete counter?', confirmLabel: 'Delete', tone: 'danger' });
    expect(await screen.findByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(answer).resolves.toBe(false);
  });

  it('starts a non-danger question on the confirm button, so Enter confirms it', async () => {
    render(<AppConfirmBridge />);
    const answer = ask({ title: 'Replace cart?', confirmLabel: 'Replace cart', tone: 'warning' });
    expect(await screen.findByRole('button', { name: 'Replace cart' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(answer).resolves.toBe(true);
  });

  it('asks queued questions one after another', async () => {
    render(<AppConfirmBridge />);
    const a = ask({ title: 'First?' });
    const b = ask({ title: 'Second?' });
    expect(await screen.findByText('First?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Second?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await expect(a).resolves.toBe(true);
    await expect(b).resolves.toBe(false);
  });

  it('answers an open question with false when the host unmounts', async () => {
    const { unmount } = render(<AppConfirmBridge />);
    const answer = ask({ title: 'Still there?' });
    await screen.findByRole('alertdialog');
    unmount();
    await expect(answer).resolves.toBe(false);
  });
});

describe('confirmDialog without a host', () => {
  it('falls back to window.confirm with title and message joined', async () => {
    const nativeConfirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await expect(confirmDialog({ title: 'Delete?', message: 'This cannot be undone.' })).resolves.toBe(true);
    expect(nativeConfirm).toHaveBeenCalledWith('Delete?\n\nThis cannot be undone.');
  });

  it('treats a falsy native answer as cancel', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(undefined);
    await expect(confirmDialog('Sure?')).resolves.toBe(false);
  });
});
