import { describe, expect, it } from 'vitest';
import { TILL_PERMISSIONS, TILL_SESSION_KEYS, canOperateTill, clearTillSession, resolveTillBranch } from '../shell/posAccess';

const B1 = { id: 1, name: 'Dubai' };
const B2 = { id: 2, name: 'Sharjah' };

describe('canOperateTill', () => {
  it('requires sales.pos and sales.invoice (the embedded route guard)', () => {
    expect(TILL_PERMISSIONS).toEqual(['sales.pos', 'sales.invoice']);
    expect(canOperateTill(() => true)).toBe(true);
    expect(canOperateTill((m) => m === 'sales.invoice')).toBe(false);
    expect(canOperateTill((m) => m === 'sales.pos')).toBe(false);
    expect(canOperateTill(() => undefined)).toBe(false);
  });
});

describe('resolveTillBranch — exactly one branch, never All Branches', () => {
  it('keeps a single active branch an admin can still see', () => {
    expect(resolveTillBranch({ activeBranchId: 2, branches: [B1, B2], canSwitchBranches: true }))
      .toEqual({ status: 'ready', branchId: 2 });
    expect(resolveTillBranch({ activeBranchId: '2', branches: [B1, B2], canSwitchBranches: true }))
      .toEqual({ status: 'ready', branchId: 2 });
  });

  it('never accepts ALL: an admin on All Branches must choose', () => {
    expect(resolveTillBranch({ activeBranchId: 'ALL', branches: [B1, B2], canSwitchBranches: true }))
      .toEqual({ status: 'choose', options: [B1, B2] });
    expect(resolveTillBranch({ activeBranchId: null, branches: [B1, B2], canSwitchBranches: true }).status).toBe('choose');
  });

  it('auto-selects only when exactly one branch exists', () => {
    expect(resolveTillBranch({ activeBranchId: 'ALL', branches: [B1], canSwitchBranches: true }))
      .toEqual({ status: 'select', branchId: 1 });
  });

  it('asks again when the stored branch is not one this user can see', () => {
    expect(resolveTillBranch({ activeBranchId: 9, branches: [B1, B2], canSwitchBranches: true }).status).toBe('choose');
  });

  it('pins branch-restricted users to their own branch', () => {
    expect(resolveTillBranch({ activeBranchId: 1, branches: [B1, B2], canSwitchBranches: false }))
      .toEqual({ status: 'ready', branchId: 1 });
    expect(resolveTillBranch({ activeBranchId: null, branches: [], canSwitchBranches: false, defaultBranch: B2 }))
      .toEqual({ status: 'ready', branchId: 2 });
    expect(resolveTillBranch({ activeBranchId: 'ALL', branches: [], canSwitchBranches: false })).toEqual({ status: 'none' });
  });

  it('reports none when an admin has no branches at all', () => {
    expect(resolveTillBranch({ activeBranchId: 'ALL', branches: [], canSwitchBranches: true })).toEqual({ status: 'none' });
  });
});

describe('clearTillSession', () => {
  it('clears the person, keeps the device', () => {
    TILL_SESSION_KEYS.forEach((k) => sessionStorage.setItem(k, 'x'));
    localStorage.setItem('billbull:pos:device_fingerprint', 'fp');
    localStorage.setItem('billbull:pos:terminal_id:1', 't1');
    clearTillSession();
    TILL_SESSION_KEYS.forEach((k) => expect(sessionStorage.getItem(k)).toBeNull());
    expect(localStorage.getItem('billbull:pos:device_fingerprint')).toBe('fp');
    expect(localStorage.getItem('billbull:pos:terminal_id:1')).toBe('t1');
  });
});
