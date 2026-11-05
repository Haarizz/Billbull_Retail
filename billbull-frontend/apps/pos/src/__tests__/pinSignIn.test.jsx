import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@billbull/shared/assets/billBullLogo.png', () => ({ default: 'logo.png' }));
vi.mock('@billbull/shared/context/CompanyContext', () => ({ useCompany: () => ({ refreshCompany: vi.fn() }) }));
vi.mock('@billbull/shared/context/BranchContext', () => ({
  useBranch: () => ({ activeBranch: { id: 3, name: 'Dubai Mall' } }),
}));
const persistLoginSession = vi.fn((data) => sessionStorage.setItem('token', data.token));
vi.mock('@billbull/shared/api/auth', () => ({
  isAuthenticated: () => false,
  persistLoginSession: (...args) => persistLoginSession(...args),
}));
const api = {
  posPasswordLogin: vi.fn(),
  fetchPinStaff: vi.fn(),
  pinLogin: vi.fn(),
  enablePinSignIn: vi.fn(),
  disablePinSignIn: vi.fn(),
  managerCredentialCheck: vi.fn(),
  fetchBranchesFor: vi.fn(),
};
vi.mock('@billbull/shared/api/posPinApi', () => ({
  posPasswordLogin: (...a) => api.posPasswordLogin(...a),
  fetchPinStaff: (...a) => api.fetchPinStaff(...a),
  pinLogin: (...a) => api.pinLogin(...a),
  enablePinSignIn: (...a) => api.enablePinSignIn(...a),
  disablePinSignIn: (...a) => api.disablePinSignIn(...a),
  managerCredentialCheck: (...a) => api.managerCredentialCheck(...a),
  fetchBranchesFor: (...a) => api.fetchBranchesFor(...a),
}));

import PosLogin from '../shell/PosLogin';
import PinSignInDialog from '../shell/PinSignInDialog';
import { PIN_DEVICE_KEY, readPinDevice } from '../shell/pinDevice';

const DEVICE = { deviceId: 5, token: 'tok', branchId: 3, branchName: 'Dubai Mall', label: 'Front' };
const httpError = (status, message) => Object.assign(new Error(message), { response: { status, data: { message }, headers: {} } });

const renderLogin = () => render(
  <MemoryRouter initialEntries={['/login']}>
    <Routes>
      <Route path="/login" element={<PosLogin />} />
      <Route path="/" element={<div>TILL WORKSPACE</div>} />
    </Routes>
  </MemoryRouter>,
);

const typePin = (digits) => digits.split('').forEach((d) => fireEvent.click(screen.getByRole('button', { name: d })));

describe('till sign-in', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    Object.values(api).forEach((fn) => fn.mockReset());
    persistLoginSession.mockClear();
  });

  it('opens on PIN sign-in even before setup, with username and password one tap away', async () => {
    api.posPasswordLogin.mockRejectedValue(httpError(403, 'POS access is turned off for this employee. Ask HR to enable it.'));
    renderLogin();

    expect(screen.getByRole('heading', { name: 'Sign in with PIN' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Set up with manager sign-in/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Use username/ }));
    fireEvent.change(screen.getByPlaceholderText('you@company.com'), { target: { value: 'sara' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'Secret#1' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/ }));

    expect(await screen.findByText(/POS access is turned off/)).toBeTruthy();
    expect(api.posPasswordLogin).toHaveBeenCalledWith('sara', 'Secret#1');
  });

  it('defaults to name + PIN on an enabled till and signs in on the till’s branch', async () => {
    localStorage.setItem(PIN_DEVICE_KEY, JSON.stringify(DEVICE));
    api.fetchPinStaff.mockResolvedValue({ branchName: 'Dubai Mall', staff: [{ employeeId: 10, name: 'Aisha Khan', initials: 'AK' }] });
    api.pinLogin.mockResolvedValue({ token: 'jwt', username: 'aisha', tillBranchId: 3 });
    renderLogin();

    fireEvent.click(await screen.findByRole('button', { name: /Aisha Khan/ }));
    typePin('2580');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('TILL WORKSPACE')).toBeTruthy();
    expect(api.fetchPinStaff).toHaveBeenCalledWith('tok');
    expect(api.pinLogin).toHaveBeenCalledWith('tok', 10, '2580');
    expect(sessionStorage.getItem('activeBranchId')).toBe('3');
  });

  it('shows a wrong PIN and lets the person try again', async () => {
    localStorage.setItem(PIN_DEVICE_KEY, JSON.stringify(DEVICE));
    api.fetchPinStaff.mockResolvedValue({ staff: [{ employeeId: 10, name: 'Aisha Khan', initials: 'AK' }] });
    api.pinLogin.mockRejectedValue(httpError(401, 'Wrong PIN. Try again.'));
    renderLogin();

    fireEvent.click(await screen.findByRole('button', { name: /Aisha Khan/ }));
    typePin('2581');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Wrong PIN. Try again.')).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('0 digits entered');
  });

  it('can switch to username and password from the PIN screen', async () => {
    localStorage.setItem(PIN_DEVICE_KEY, JSON.stringify(DEVICE));
    api.fetchPinStaff.mockResolvedValue({ staff: [] });
    renderLogin();

    fireEvent.click(await screen.findByRole('button', { name: /Use username/ }));
    expect(screen.getByPlaceholderText('you@company.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Sign in with PIN/ }));
    expect(await screen.findByText(/No one can use PIN sign-in/)).toBeTruthy();
  });

  it('offers setup again and forgets the key when an admin turned PIN sign-in off', async () => {
    localStorage.setItem(PIN_DEVICE_KEY, JSON.stringify(DEVICE));
    api.fetchPinStaff.mockRejectedValue(httpError(401, 'PIN sign-in is not enabled on this till.'));
    renderLogin();

    expect(await screen.findByText(/PIN sign-in was turned off/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Set up with manager sign-in/ })).toBeTruthy();
    expect(readPinDevice()).toBeNull();
  });

  const managerSetup = () => {
    fireEvent.click(screen.getByRole('button', { name: /Set up with manager sign-in/ }));
    fireEvent.change(screen.getByLabelText(/Manager username/), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'Secret#1' } });
    fireEvent.click(screen.getByRole('button', { name: /Turn on PIN sign-in/ }));
  };

  it('a manager sets the till up from the sign-in screen without signing in', async () => {
    api.managerCredentialCheck.mockResolvedValue({ token: 'mgr-jwt', branchId: 3 });
    api.fetchBranchesFor.mockResolvedValue([{ id: 3, name: 'Dubai Mall' }]);
    api.enablePinSignIn.mockResolvedValue(DEVICE);
    api.fetchPinStaff.mockResolvedValue({ branchName: 'Dubai Mall', staff: [{ employeeId: 10, name: 'Aisha Khan', initials: 'AK' }] });
    renderLogin();

    managerSetup();

    expect(await screen.findByRole('button', { name: /Aisha Khan/ })).toBeTruthy();
    expect(api.enablePinSignIn).toHaveBeenCalledWith(expect.objectContaining({ branchId: 3 }), 'mgr-jwt');
    expect(readPinDevice()?.token).toBe('tok');
    expect(persistLoginSession).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('token')).toBeNull();
  });

  it('asks which branch when the manager can reach several', async () => {
    api.managerCredentialCheck.mockResolvedValue({ token: 'mgr-jwt', branchId: 3 });
    api.fetchBranchesFor.mockResolvedValue([{ id: 3, name: 'Dubai Mall' }, { id: 4, name: 'Sharjah' }]);
    api.enablePinSignIn.mockResolvedValue({ ...DEVICE, branchId: 4, branchName: 'Sharjah' });
    api.fetchPinStaff.mockResolvedValue({ staff: [] });
    renderLogin();

    managerSetup();
    fireEvent.change(await screen.findByLabelText(/Which branch/), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /Turn on PIN sign-in/ }));

    await waitFor(() => expect(api.enablePinSignIn).toHaveBeenCalledWith(expect.objectContaining({ branchId: 4 }), 'mgr-jwt'));
  });

  it('a non-manager is told only an admin can set it up', async () => {
    api.managerCredentialCheck.mockResolvedValue({ token: 'c-jwt', branchId: 3 });
    api.fetchBranchesFor.mockResolvedValue([{ id: 3, name: 'Dubai Mall' }]);
    api.enablePinSignIn.mockRejectedValue(httpError(403, 'Access denied'));
    renderLogin();

    managerSetup();

    expect(await screen.findByText(/Only an admin or branch admin/)).toBeTruthy();
    expect(readPinDevice()).toBeNull();
  });

  it('works entirely from the keyboard: arrows, type-ahead, Escape, typed digits, Backspace, Enter', async () => {
    localStorage.setItem(PIN_DEVICE_KEY, JSON.stringify(DEVICE));
    api.fetchPinStaff.mockResolvedValue({ staff: [
      { employeeId: 10, name: 'Aisha Khan', initials: 'AK' },
      { employeeId: 11, name: 'Bilal Noor', initials: 'BN' },
      { employeeId: 12, name: 'Chen Li', initials: 'CL' },
    ] });
    api.pinLogin.mockResolvedValue({ token: 'jwt', tillBranchId: 3 });
    renderLogin();

    const aisha = await screen.findByRole('button', { name: /Aisha Khan/ });
    await waitFor(() => expect(document.activeElement).toBe(aisha));
    fireEvent.keyDown(aisha, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Bilal Noor/ }));
    fireEvent.keyDown(document.activeElement, { key: 'c' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Chen Li/ }));

    fireEvent.click(document.activeElement);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(await screen.findByRole('button', { name: /Chen Li/ }));

    for (const key of ['2', '5', '9', 'Backspace', '8', '0']) fireEvent.keyDown(window, { key });
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('4 digits entered');
    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(() => expect(api.pinLogin).toHaveBeenCalledWith('tok', 12, '2580'));
  });

  it('shows exactly as many dots as the PIN has and signs in on the last digit', async () => {
    localStorage.setItem(PIN_DEVICE_KEY, JSON.stringify(DEVICE));
    api.fetchPinStaff.mockResolvedValue({ staff: [{ employeeId: 10, name: 'Aisha Khan', initials: 'AK', pinLength: 4 }] });
    api.pinLogin.mockRejectedValueOnce(httpError(401, 'Wrong PIN. Try again.')).mockResolvedValueOnce({ token: 'jwt', tillBranchId: 3 });
    renderLogin();

    fireEvent.click(await screen.findByRole('button', { name: /Aisha Khan/ }));
    expect(screen.getByText('Enter your 4-digit PIN')).toBeTruthy();
    expect(screen.getByRole('status').children).toHaveLength(4);

    typePin('2581');
    expect(await screen.findByText('Wrong PIN. Try again.')).toBeTruthy();
    expect(api.pinLogin).toHaveBeenCalledWith('tok', 10, '2581');
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('0 digits entered');

    for (const key of ['2', '5', '8', '0', '7']) fireEvent.keyDown(window, { key }); // the 5th digit is ignored
    await waitFor(() => expect(api.pinLogin).toHaveBeenLastCalledWith('tok', 10, '2580'));
    expect(api.pinLogin).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('TILL WORKSPACE')).toBeTruthy();
  });

  it('ignores Enter until at least four digits are in', async () => {
    localStorage.setItem(PIN_DEVICE_KEY, JSON.stringify(DEVICE));
    api.fetchPinStaff.mockResolvedValue({ staff: [{ employeeId: 10, name: 'Aisha Khan', initials: 'AK' }] });
    renderLogin();

    fireEvent.click(await screen.findByRole('button', { name: /Aisha Khan/ }));
    typePin('258');
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(api.pinLogin).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign in' }).disabled).toBe(true);
  });
});

describe('PinSignInDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.values(api).forEach((fn) => fn.mockReset());
  });

  it('turns PIN sign-in on for the active branch and remembers the key', async () => {
    localStorage.setItem('billbull:pos:terminal_id:3', 'T-01');
    api.enablePinSignIn.mockResolvedValue(DEVICE);
    render(<PinSignInDialog onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('e.g. Front counter'), { target: { value: 'Front' } });
    fireEvent.click(screen.getByRole('button', { name: /Turn on PIN sign-in/ }));

    await waitFor(() => expect(readPinDevice()).toEqual(DEVICE));
    expect(api.enablePinSignIn).toHaveBeenCalledWith({ branchId: 3, label: 'Front', terminalId: 'T-01' });
    expect(screen.getByRole('button', { name: /Turn off PIN sign-in/ })).toBeTruthy();
  });

  it('turning it off revokes on the server and forgets the key', async () => {
    localStorage.setItem(PIN_DEVICE_KEY, JSON.stringify(DEVICE));
    api.disablePinSignIn.mockResolvedValue({});
    render(<PinSignInDialog onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Turn off PIN sign-in/ }));

    await waitFor(() => expect(readPinDevice()).toBeNull());
    expect(api.disablePinSignIn).toHaveBeenCalledWith(5);
  });
});
