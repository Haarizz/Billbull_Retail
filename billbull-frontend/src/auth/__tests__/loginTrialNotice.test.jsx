import React from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  clientConfig: { landing: { defaultRoute: null }, sidebar: { defaultCollapsed: false }, posFirstMode: false, trial: { expiresAt: null } },
}));

// Same storage behaviour as the real api/auth: the token in sessionStorage is the login.
vi.mock('../../api/auth', () => ({
  login: mocks.login,
  isAuthenticated: () => !!sessionStorage.getItem('token'),
  logout: () => sessionStorage.removeItem('token'),
}));
vi.mock('../../context/CompanyContext', () => ({ useCompany: () => ({ refreshCompany: vi.fn() }) }));
vi.mock('../../config/clientConfig', () => ({ clientConfig: mocks.clientConfig }));

import Login from '../login';
import PrivateRoute from '../PrivateRoute';
import TrialExpiryModal from '../../components/common/TrialExpiryModal';
import { logout } from '../../api/auth';
import { TRIAL_NOTICE_PENDING_KEY } from '../../utils/trialNotice';

const WARNING = 'Your free trial is going to expire this weekend.';

/** Logout wired like the Sidebar button: logout() then navigate("/login"). */
function LogoutButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => { logout(); navigate('/login'); }}>Logout</button>;
}

/** Mirrors App.jsx: /login is public, the modal lives inside the PrivateRoute tree. */
function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={(
            <PrivateRoute>
              <TrialExpiryModal />
              <p>Authenticated app</p>
              <LogoutButton />
            </PrivateRoute>
          )}
        />
      </Routes>
    </MemoryRouter>,
  );
}

async function loginSuccessfully() {
  fireEvent.change(screen.getByPlaceholderText('admin'), { target: { value: 'cashier' } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secret' } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
  expect(await screen.findByText('Authenticated app')).toBeInTheDocument();
}

async function loginFailing() {
  mocks.login.mockRejectedValueOnce({ response: { status: 401 } });
  fireEvent.change(screen.getByPlaceholderText('admin'), { target: { value: 'cashier' } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'wrong' } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
  expect(await screen.findByText('Invalid username or password')).toBeInTheDocument();
}

async function expectPopup() {
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText(WARNING)).toBeInTheDocument();
  expect(screen.getByRole('timer')).toHaveTextContent(/^\d+ Days? \d+ Hours? \d+ Minutes? \d+ Seconds?$/);
}

function logoutViaApp() {
  fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
  expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  expect(sessionStorage.getItem('token')).toBeNull();
}

const DISMISSALS = [
  ['Continue', () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }))],
  ['the X close button', () => fireEvent.click(screen.getByRole('button', { name: 'Close' }))],
  ['Escape', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })],
];

beforeEach(() => {
  sessionStorage.clear();
  mocks.login.mockReset();
  mocks.login.mockResolvedValue({ token: 't', username: 'cashier', fullName: 'Cashier', primaryRole: 'SALES' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  mocks.clientConfig.trial.expiresAt = null;
  vi.restoreAllMocks();
});

describe('login → free trial warning (eligible client)', () => {
  beforeEach(() => {
    mocks.clientConfig.trial.expiresAt = new Date(Date.now() + 3 * 86400 * 1000).toISOString();
  });

  it('shows the popup on the first successful login', async () => {
    renderApp();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await loginSuccessfully();

    await expectPopup();
    expect(sessionStorage.getItem('token')).toBe('t');
  });

  it.each(DISMISSALS)('close via %s → logout → login again shows the popup again', async (_label, dismiss) => {
    renderApp();
    await loginSuccessfully();
    await expectPopup();

    dismiss();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Authenticated app')).toBeInTheDocument();

    logoutViaApp();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await loginSuccessfully();
    await expectPopup();
  });

  it('shows the popup on every separate successful login', async () => {
    renderApp();

    for (let i = 1; i <= 4; i += 1) {
      await loginSuccessfully();
      await expectPopup();
      DISMISSALS[(i - 1) % DISMISSALS.length][1]();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      logoutViaApp();
    }

    expect(mocks.login).toHaveBeenCalledTimes(4);
  });

  it('shows the popup again even when the user logged out without closing it', async () => {
    renderApp();
    await loginSuccessfully();
    await expectPopup();

    fireEvent.click(screen.getByRole('button', { name: 'Logout', hidden: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await loginSuccessfully();
    await expectPopup();
  });

  it('does not show or set the popup on a failed login', async () => {
    renderApp();
    await loginFailing();

    expect(sessionStorage.getItem(TRIAL_NOTICE_PENDING_KEY)).toBeNull();
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show the popup on a failed login after an earlier dismissed login', async () => {
    renderApp();
    await loginSuccessfully();
    await expectPopup();
    DISMISSALS[0][1]();
    logoutViaApp();

    await loginFailing();

    expect(sessionStorage.getItem(TRIAL_NOTICE_PENDING_KEY)).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Authenticated app')).not.toBeInTheDocument();

    // The next successful login still gets its popup.
    await loginSuccessfully();
    await expectPopup();
  });
});

describe('login → free trial warning (non-eligible client)', () => {
  it('never shows the popup across repeated logins, logouts and failed logins', async () => {
    renderApp();

    await loginFailing();
    for (let i = 0; i < 3; i += 1) {
      await loginSuccessfully();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(sessionStorage.getItem(TRIAL_NOTICE_PENDING_KEY)).toBeNull();
      expect(sessionStorage.getItem('token')).toBe('t');
      logoutViaApp();
    }
  });
});
