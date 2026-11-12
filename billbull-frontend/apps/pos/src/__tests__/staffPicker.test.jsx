import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@billbull/shared/assets/billBullLogo.png', () => ({ default: 'logo.png' }));
vi.mock('@billbull/shared/context/CompanyContext', () => ({ useCompany: () => ({ refreshCompany: vi.fn() }) }));
vi.mock('@billbull/shared/api/auth', () => ({
  isAuthenticated: () => false,
  persistLoginSession: (data) => sessionStorage.setItem('token', data.token),
}));
const api = { posPasswordLogin: vi.fn(), fetchPinStaff: vi.fn(), pinLogin: vi.fn() };
vi.mock('@billbull/shared/api/posPinApi', () => ({
  posPasswordLogin: (...a) => api.posPasswordLogin(...a),
  fetchPinStaff: (...a) => api.fetchPinStaff(...a),
  pinLogin: (...a) => api.pinLogin(...a),
  enablePinSignIn: vi.fn(),
  managerCredentialCheck: vi.fn(),
  fetchBranchesFor: vi.fn(),
}));

import PosLogin from '../shell/PosLogin';
import { PIN_DEVICE_KEY } from '../shell/pinDevice';
import {
  AVATAR_COLORS, avatarColor, distinctInitials, filterStaff, layoutFor, readRecent, recentKey, recentPeople,
  rememberSignIn, roleChips, roleGroup,
} from '../shell/staffDirectory';

const DEVICE = { deviceId: 5, token: 'tok', branchId: 3, branchName: 'Dubai Mall', label: 'Front' };
const httpError = (status, message) => Object.assign(new Error(message), { response: { status, data: { message }, headers: {} } });

const ROLES = ['Cashier', 'Cashier', 'Cashier', 'Supervisor', 'Store Manager', 'Store Keeper'];
const makeStaff = (n) => Array.from({ length: n }, (_, i) => ({
  employeeId: 100 + i,
  employeeCode: `EMP-${String(100 + i).padStart(4, '0')}`,
  name: `Person ${String(i + 1).padStart(2, '0')}`,
  initials: 'P',
  role: ROLES[i % ROLES.length],
  pinLength: 4,
}));

const renderLogin = () => render(
  <MemoryRouter initialEntries={['/login']}>
    <Routes>
      <Route path="/login" element={<PosLogin />} />
      <Route path="/" element={<div>TILL WORKSPACE</div>} />
    </Routes>
  </MemoryRouter>,
);

const staffList = () => screen.findByRole('list', { name: 'Staff' });
const receipt = () => screen.getByTestId('till-receipt');
const typePin = (digits) => digits.split('').forEach((d) => fireEvent.click(screen.getByRole('button', { name: d })));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Object.values(api).forEach((fn) => fn.mockReset());
  localStorage.setItem(PIN_DEVICE_KEY, JSON.stringify(DEVICE));
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('staff directory helpers', () => {
  it('picks the layout by head count', () => {
    expect([1, 8, 9, 24, 25, 300].map(layoutFor)).toEqual(['tiles', 'tiles', 'cards', 'cards', 'directory', 'directory']);
  });

  it('gives look-alike names different initials and leaves the rest alone', () => {
    const initials = distinctInitials([
      { employeeId: 1, name: 'Store 1' },
      { employeeId: 2, name: 'Supervisor 1' },
      { employeeId: 3, name: 'Cashier 1' },
      { employeeId: 4, name: 'Cashier 2' },
      { employeeId: 5, name: 'Madonna' },
    ]);
    expect(initials.get(1)).toBe('ST1');
    expect(initials.get(2)).toBe('SU1');
    expect(initials.get(3)).toBe('C1');
    expect(initials.get(4)).toBe('C2');
    expect(initials.get(5)).toBe('MA');
  });

  it('colours an avatar the same way every time, from the employee id', () => {
    expect(avatarColor(101)).toEqual(avatarColor(101));
    expect(avatarColor(101)).not.toEqual(avatarColor(102));
    expect(AVATAR_COLORS).toContainEqual(avatarColor('E-7'));
  });

  it('groups roles into chips with counts, known groups first', () => {
    expect(roleGroup('Senior Cashier').key).toBe('cashier');
    expect(roleGroup(null).label).toBe('Other');
    const chips = roleChips([...makeStaff(6), { employeeId: 1, name: 'X', role: '' }]);
    expect(chips.map((c) => `${c.label} ${c.count}`)).toEqual([
      'All 7', 'Cashiers 3', 'Supervisors 1', 'Managers 1', 'Store Keeper 1', 'Other 1',
    ]);
  });

  it('searches by name or employee id, ignoring case', () => {
    const staff = makeStaff(30);
    expect(filterStaff(staff, { query: 'person 2' }).map((p) => p.name)).toContain('Person 21');
    expect(filterStaff(staff, { query: 'emp-0105' }).map((p) => p.employeeId)).toEqual([105]);
    expect(filterStaff(staff, { query: 'person', role: 'supervisor' })).toHaveLength(5);
  });

  it('keeps the last four PIN sign-ins per till, newest first, ids only', () => {
    [1, 2, 3, 2, 4, 5].forEach((id) => rememberSignIn(9, id));
    expect(readRecent(9)).toEqual([5, 4, 2, 3]);
    expect(readRecent(10)).toEqual([]);
    expect(localStorage.getItem(recentKey(9))).toBe('[5,4,2,3]');
    // Someone no longer on the list drops out; the open-session owner isn't repeated.
    expect(recentPeople(makeStaff(3), [102, 999, 100], 100).map((p) => p.employeeId)).toEqual([102]);
  });
});

// ---------------------------------------------------------------------------
// Adaptive layout
// ---------------------------------------------------------------------------

describe('adaptive staff picker', () => {
  it('keeps the large tiles and the narrow receipt for up to eight people', async () => {
    api.fetchPinStaff.mockResolvedValue({ staff: makeStaff(8) });
    renderLogin();

    expect(within(await staffList()).getAllByRole('button')).toHaveLength(8);
    expect(receipt().dataset.layout).toBe('tiles');
    expect(receipt().className).toContain('max-w-110');
    expect(screen.queryByRole('searchbox')).toBeNull();
    // Name, role and employee id on each tile.
    expect(screen.getByRole('button', { name: /Person 04.*Supervisor.*EMP-0103/ })).toBeTruthy();
  });

  it('tags recent people on their tile instead of adding a row when everyone fits', async () => {
    rememberSignIn(DEVICE.deviceId, 102);
    api.fetchPinStaff.mockResolvedValue({ staff: makeStaff(6) });
    renderLogin();

    const tile = within(await staffList()).getByRole('button', { name: /Person 03/ });
    expect(within(tile).getByText('Recent')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Recent on this till' })).toBeNull();
    expect(within(screen.getByRole('list', { name: 'Staff' })).getAllByText('Recent')).toHaveLength(1);
  });

  it('switches to compact cards on a wider receipt from nine to 24 people', async () => {
    api.fetchPinStaff.mockResolvedValue({ staff: makeStaff(12) });
    renderLogin();

    expect(within(await staffList()).getAllByRole('button')).toHaveLength(12);
    expect(receipt().dataset.layout).toBe('cards');
    expect(receipt().className).toContain('max-w-160');
    expect(receipt().className).not.toContain('max-w-110');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: /Search name or employee ID/ })));
    expect(screen.getByText(/Find your name/)).toBeTruthy();
  });

  it('goes search-first from 25 people and only renders the list a page at a time', async () => {
    api.fetchPinStaff.mockResolvedValue({ staff: makeStaff(95) });
    renderLogin();

    const list = await staffList();
    expect(receipt().dataset.layout).toBe('directory');
    expect(within(list).getAllByRole('listitem')).toHaveLength(40);

    fireEvent.click(screen.getByRole('button', { name: /Show more \(55 more\)/ }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(80);

    // Scrolling near the bottom renders the next page too.
    Object.defineProperties(list, { scrollHeight: { value: 2000, configurable: true }, clientHeight: { value: 400, configurable: true } });
    list.scrollTop = 1500;
    fireEvent.scroll(list);
    expect(within(list).getAllByRole('listitem')).toHaveLength(95);
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull();
  });

  it('returns to the narrow receipt for the PIN pad', async () => {
    api.fetchPinStaff.mockResolvedValue({ staff: makeStaff(30) });
    renderLogin();

    fireEvent.click(within(await staffList()).getByRole('button', { name: /Person 03/ }));
    expect(screen.getByRole('group', { name: 'PIN keypad' })).toBeTruthy();
    expect(receipt().className).toContain('max-w-110');
    expect(receipt().dataset.layout).toBe('form');
  });
});

// ---------------------------------------------------------------------------
// Search and role filtering
// ---------------------------------------------------------------------------

describe('search and role chips', () => {
  it('filters as you type, by name or employee id', async () => {
    api.fetchPinStaff.mockResolvedValue({ staff: makeStaff(30) });
    renderLogin();
    const list = await staffList();
    const search = screen.getByRole('searchbox');

    fireEvent.change(search, { target: { value: 'person 1' } });
    expect(within(list).getAllByRole('listitem')).toHaveLength(10); // 10–19
    fireEvent.change(search, { target: { value: 'EMP-0127' } });
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual([expect.stringContaining('Person 28')]);
    fireEvent.change(search, { target: { value: 'nobody' } });
    expect(screen.getByText(/No one matches “nobody”/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show everyone' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(30);
  });

  it('shows role chips with counts and filters by them', async () => {
    api.fetchPinStaff.mockResolvedValue({ staff: makeStaff(12) });
    renderLogin();
    const list = await staffList();
    const chips = screen.getByRole('group', { name: 'Filter by role' });

    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'All12', 'Cashiers6', 'Supervisors2', 'Managers2', 'Store Keeper2',
    ]);
    fireEvent.click(within(chips).getByRole('button', { name: /Supervisors/ }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(chips).getByRole('button', { name: /Supervisors/ }).getAttribute('aria-pressed')).toBe('true');
    // Tapping the active chip again goes back to everyone.
    fireEvent.click(within(chips).getByRole('button', { name: /Supervisors/ }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(12);
  });

  it('Enter in search opens a PIN pad only for a single match', async () => {
    api.fetchPinStaff.mockResolvedValue({ staff: makeStaff(30) });
    renderLogin();
    await staffList();
    const search = screen.getByRole('searchbox');

    fireEvent.change(search, { target: { value: 'person' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.queryByRole('group', { name: 'PIN keypad' })).toBeNull();

    fireEvent.change(search, { target: { value: 'emp-0110' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByRole('group', { name: 'PIN keypad' })).toBeTruthy();
    expect(screen.getByText('Person 11')).toBeTruthy();
  });

  it('typing a letter on a card carries on in the search box', async () => {
    api.fetchPinStaff.mockResolvedValue({ staff: makeStaff(12) });
    renderLogin();
    const card = within(await staffList()).getAllByRole('button')[0];

    card.focus();
    fireEvent.keyDown(card, { key: 'p' });
    const search = screen.getByRole('searchbox');
    expect(search.value).toBe('p');
    expect(document.activeElement).toBe(search);
  });
});

// ---------------------------------------------------------------------------
// Recent and open sessions, with PIN authentication unchanged
// ---------------------------------------------------------------------------

describe('recent and open sessions', () => {
  it('remembers a successful PIN sign-in on this till and lists it under Recent next time', async () => {
    const staff = makeStaff(12);
    api.fetchPinStaff.mockResolvedValue({ staff });
    api.pinLogin.mockResolvedValue({ token: 'jwt', tillBranchId: 3 });
    const first = renderLogin();

    fireEvent.click(within(await staffList()).getByRole('button', { name: /Person 07/ }));
    typePin('2580');
    expect(await screen.findByText('TILL WORKSPACE')).toBeTruthy();
    expect(readRecent(DEVICE.deviceId)).toEqual([106]);
    first.unmount();

    sessionStorage.clear();
    renderLogin();
    const recent = await screen.findByRole('region', { name: 'Recent on this till' });
    expect(within(recent).getByRole('button', { name: /Person 07/ })).toBeTruthy();
  });

  it('a wrong PIN is not remembered', async () => {
    api.fetchPinStaff.mockResolvedValue({ staff: makeStaff(12) });
    api.pinLogin.mockRejectedValue(httpError(401, 'Wrong PIN. Try again.'));
    renderLogin();

    fireEvent.click(within(await staffList()).getByRole('button', { name: /Person 07/ }));
    typePin('2581');
    expect(await screen.findByText('Wrong PIN. Try again.')).toBeTruthy();
    expect(readRecent(DEVICE.deviceId)).toEqual([]);
  });

  it('a recent pick still has to enter their PIN', async () => {
    rememberSignIn(DEVICE.deviceId, 103);
    api.fetchPinStaff.mockResolvedValue({ staff: makeStaff(12) });
    api.pinLogin.mockResolvedValue({ token: 'jwt', tillBranchId: 3 });
    renderLogin();

    const recent = await screen.findByRole('region', { name: 'Recent on this till' });
    fireEvent.click(within(recent).getByRole('button', { name: /Person 04/ }));
    expect(api.pinLogin).not.toHaveBeenCalled();
    typePin('2580');
    await waitFor(() => expect(api.pinLogin).toHaveBeenCalledWith('tok', 103, '2580'));
  });

  it('puts whoever has the drawer open on this PC first, and resuming still needs their PIN', async () => {
    localStorage.setItem('billbull:pos:terminal_id:3', 'T-01');
    api.fetchPinStaff.mockResolvedValue({
      staff: makeStaff(6),
      openSession: { employeeId: 102, openedAt: new Date().toISOString(), counterName: 'Counter 2' },
    });
    api.pinLogin
      .mockRejectedValueOnce(httpError(401, 'Wrong PIN. Try again.'))
      .mockResolvedValueOnce({ token: 'jwt', tillBranchId: 3 });
    renderLogin();

    const resume = await screen.findByRole('button', { name: 'Continue as Person 03' });
    expect(api.fetchPinStaff).toHaveBeenCalledWith('tok', 'T-01');
    expect(resume.textContent).toMatch(/Till open on this PC.*since .*Counter 2/);
    await waitFor(() => expect(document.activeElement).toBe(resume));

    fireEvent.click(resume);
    expect(screen.getByText('Person 03')).toBeTruthy();
    expect(api.pinLogin).not.toHaveBeenCalled();
    typePin('1111');
    expect(await screen.findByText('Wrong PIN. Try again.')).toBeTruthy();
    expect(screen.queryByText('TILL WORKSPACE')).toBeNull();
    typePin('2580');
    expect(await screen.findByText('TILL WORKSPACE')).toBeTruthy();
    expect(api.pinLogin).toHaveBeenLastCalledWith('tok', 102, '2580');
  });

  it('hides the open-session card while searching and ignores an owner who is not on the list', async () => {
    api.fetchPinStaff.mockResolvedValue({ staff: makeStaff(12), openSession: { employeeId: 105 } });
    renderLogin();
    await screen.findByRole('button', { name: 'Continue as Person 06' });

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'person 1' } });
    expect(screen.queryByRole('button', { name: /Continue as/ })).toBeNull();
  });

  it('shows no open-session card for an owner who is not on the list', async () => {
    api.fetchPinStaff.mockResolvedValue({ staff: makeStaff(6), openSession: { employeeId: 999 } });
    renderLogin();
    await staffList();
    expect(screen.queryByRole('button', { name: /Continue as/ })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Avatars
// ---------------------------------------------------------------------------

describe('avatars', () => {
  it('shows the photo when there is one, distinct initials otherwise, and falls back if the photo fails', async () => {
    api.fetchPinStaff.mockResolvedValue({ staff: [
      { employeeId: 1, name: 'Store 1', initials: 'S1', role: 'Store Keeper' },
      { employeeId: 2, name: 'Supervisor 1', initials: 'S1', role: 'Supervisor', avatarUrl: '/uploads/emp/2.jpg' },
    ] });
    const { container } = renderLogin();
    await staffList();

    const avatars = [...container.querySelectorAll('[data-initials]')];
    expect(avatars.map((a) => a.dataset.initials)).toEqual(['ST1', 'SU1']);
    const img = avatars[1].querySelector('img');
    expect(img.getAttribute('src')).toMatch(/\/uploads\/emp\/2\.jpg$/);
    fireEvent.error(img);
    expect(avatars[1].querySelector('img')).toBeNull();
    expect(avatars[1].textContent).toBe('SU1');
  });
});
