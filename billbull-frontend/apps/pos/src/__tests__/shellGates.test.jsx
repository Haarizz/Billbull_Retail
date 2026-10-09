import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const permissions = { permissionsLoaded: true, canView: () => true, refreshPermissions: vi.fn() };
vi.mock('@billbull/shared/context/PermissionContext', () => ({ usePermissions: () => permissions }));

const branch = {
  isLoading: false, activeBranchId: null, branches: [], canSwitchBranches: true, defaultBranch: null,
  switchBranch: vi.fn(), formatBranchLabel: (b) => b.name,
};
vi.mock('@billbull/shared/context/BranchContext', () => ({ useBranch: () => branch }));
vi.mock('@billbull/shared/assets/billBullLogo.png', () => ({ default: 'logo.png' }));

import RequirePosAccess from '../shell/RequirePosAccess';
import PosBootGate from '../shell/PosBootGate';

const Till = () => <div>TILL WORKSPACE</div>;

describe('RequirePosAccess', () => {
  beforeEach(() => {
    permissions.permissionsLoaded = true;
    permissions.canView = () => true;
  });

  it('renders the till for a user holding sales.pos and sales.invoice', () => {
    render(<RequirePosAccess><Till /></RequirePosAccess>);
    expect(screen.getByText('TILL WORKSPACE')).toBeTruthy();
  });

  it('denies a user without the till permissions and names them', () => {
    permissions.canView = (m) => m !== 'sales.pos';
    render(<RequirePosAccess><Till /></RequirePosAccess>);
    expect(screen.queryByText('TILL WORKSPACE')).toBeNull();
    expect(screen.getByText('No till access')).toBeTruthy();
    expect(screen.getByText('sales.pos')).toBeTruthy();
  });

  it('waits for permissions without rendering the till', () => {
    permissions.permissionsLoaded = false;
    render(<RequirePosAccess><Till /></RequirePosAccess>);
    expect(screen.queryByText('TILL WORKSPACE')).toBeNull();
    expect(screen.getByText('Checking your permissions')).toBeTruthy();
  });

  it('latches once granted: a later permission refresh does not unmount the sale', () => {
    const view = render(<RequirePosAccess><Till /></RequirePosAccess>);
    permissions.permissionsLoaded = false;
    view.rerender(<RequirePosAccess><Till /></RequirePosAccess>);
    expect(screen.getByText('TILL WORKSPACE')).toBeTruthy();
  });
});

describe('PosBootGate', () => {
  beforeEach(() => {
    Object.assign(branch, {
      isLoading: false, activeBranchId: null, branches: [], canSwitchBranches: true, defaultBranch: null,
      switchBranch: vi.fn(() => Promise.resolve({})),
    });
  });

  it('shows a loader, not the till, while branches load', () => {
    branch.isLoading = true;
    render(<PosBootGate><Till /></PosBootGate>);
    expect(screen.queryByText('TILL WORKSPACE')).toBeNull();
    expect(screen.getByText('Loading your branch')).toBeTruthy();
  });

  it('makes an admin on All Branches choose one branch, then activates it', async () => {
    branch.activeBranchId = 'ALL';
    branch.branches = [{ id: 1, name: 'Dubai' }, { id: 2, name: 'Sharjah' }];
    render(<PosBootGate><Till /></PosBootGate>);
    expect(screen.queryByText('TILL WORKSPACE')).toBeNull();
    expect(screen.queryByText(/All Branches/i)).toBeNull();
    fireEvent.click(screen.getByText('Sharjah'));
    await waitFor(() => expect(branch.switchBranch).toHaveBeenCalledWith(2));
  });

  it('auto-activates the only branch', async () => {
    branch.activeBranchId = 'ALL';
    branch.branches = [{ id: 7, name: 'Only' }];
    render(<PosBootGate><Till /></PosBootGate>);
    await waitFor(() => expect(branch.switchBranch).toHaveBeenCalledWith(7));
    expect(branch.switchBranch).toHaveBeenCalledTimes(1);
  });

  it('renders the till once exactly one branch is active, and stays mounted if branches reload', () => {
    branch.activeBranchId = 2;
    branch.branches = [{ id: 1, name: 'Dubai' }, { id: 2, name: 'Sharjah' }];
    const view = render(<PosBootGate><Till /></PosBootGate>);
    expect(screen.getByText('TILL WORKSPACE')).toBeTruthy();
    branch.isLoading = true;
    view.rerender(<PosBootGate><Till /></PosBootGate>);
    expect(screen.getByText('TILL WORKSPACE')).toBeTruthy();
  });

  it('surfaces an open-session conflict instead of switching', async () => {
    branch.activeBranchId = 'ALL';
    branch.branches = [{ id: 1, name: 'Dubai' }, { id: 2, name: 'Sharjah' }];
    branch.switchBranch = vi.fn(() => Promise.reject(Object.assign(new Error('ACTIVE_POS_SESSION'), { isPosConflict: true })));
    render(<PosBootGate><Till /></PosBootGate>);
    await act(async () => { fireEvent.click(screen.getByText('Dubai')); });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/open POS session on another branch/);
    expect(screen.queryByText('TILL WORKSPACE')).toBeNull();
  });
});
