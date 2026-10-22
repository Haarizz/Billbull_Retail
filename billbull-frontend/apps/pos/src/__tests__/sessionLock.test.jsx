import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let expiredHandler = null;
vi.mock('@billbull/shared/api/axiosConfig', () => ({
  setSessionExpiredHandler: (h) => { expiredHandler = h; },
}));
const auth = {
  login: vi.fn(),
  getDecodedToken: vi.fn(() => null),
};
vi.mock('@billbull/shared/api/auth', () => ({
  login: (...a) => auth.login(...a),
  getDecodedToken: () => auth.getDecodedToken(),
  persistLoginSession: (data) => sessionStorage.setItem('token', data.token),
  describeLoginError: () => 'Invalid username or password',
}));

import SessionLock, { installTillKeyGuard } from '../shell/SessionLock';

// Stand-in for the POS workspace: keeps local state (the "cart") and a window-level capture
// listener like the scanner wedge / payment hotkeys.
function FakeTill({ onWindowKey }) {
  const [lines, setLines] = React.useState(0);
  React.useEffect(() => {
    window.addEventListener('keydown', onWindowKey, true);
    return () => window.removeEventListener('keydown', onWindowKey, true);
  }, [onWindowKey]);
  return <button type="button" onClick={() => setLines((n) => n + 1)}>cart lines: {lines}</button>;
}
import React from 'react';

let removeGuard;
beforeEach(() => {
  removeGuard = installTillKeyGuard();
  sessionStorage.clear();
  sessionStorage.setItem('user', 'cashier1');
  sessionStorage.setItem('token', 'old');
  auth.login.mockReset();
  auth.getDecodedToken.mockReturnValue(null);
});
afterEach(() => removeGuard());

const expire = () => act(() => { expiredHandler(new Error('401')); });

describe('SessionLock', () => {
  it('locks over the still-mounted workspace on a 401 and keeps its state', () => {
    render(<SessionLock><FakeTill onWindowKey={() => {}} /></SessionLock>);
    fireEvent.click(screen.getByText('cart lines: 0'));
    expire();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('cashier1')).toBeTruthy();
    expect(screen.getByText('cart lines: 1')).toBeTruthy();
  });

  it('keeps keystrokes away from the POS window listeners while locked, and restores them after', async () => {
    const posKeys = vi.fn();
    render(<SessionLock><FakeTill onWindowKey={posKeys} /></SessionLock>);
    fireEvent.keyDown(window, { key: '1' });
    expect(posKeys).toHaveBeenCalledTimes(1);

    expire();
    fireEvent.keyDown(screen.getByPlaceholderText('Password'), { key: '7' });
    expect(posKeys).toHaveBeenCalledTimes(1);

    auth.login.mockResolvedValue({ token: 'new', username: 'cashier1' });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pw' } });
    await act(async () => { fireEvent.click(screen.getByText('Unlock till')); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(auth.login).toHaveBeenCalledWith('cashier1', 'pw');
    expect(sessionStorage.getItem('token')).toBe('new');
    fireEvent.keyDown(window, { key: '2' });
    expect(posKeys).toHaveBeenCalledTimes(2);
  });

  it('refuses to unlock for a different user', async () => {
    render(<SessionLock><FakeTill onWindowKey={() => {}} /></SessionLock>);
    expire();
    auth.login.mockResolvedValue({ token: 'other', username: 'someoneElse' });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pw' } });
    await act(async () => { fireEvent.click(screen.getByText('Unlock till')); });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/Only the signed-in cashier/);
    expect(sessionStorage.getItem('token')).toBe('old');
  });

  it('locks proactively when the token reaches its expiry', () => {
    vi.useFakeTimers();
    try {
      auth.getDecodedToken.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 60 });
      render(<SessionLock><FakeTill onWindowKey={() => {}} /></SessionLock>);
      expect(screen.queryByRole('dialog')).toBeNull();
      act(() => { vi.advanceTimersByTime(61_000); });
      expect(screen.getByRole('dialog')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
