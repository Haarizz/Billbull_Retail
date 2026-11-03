import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/posApi', () => ({
  approvePosSessionCloseByAdmin: vi.fn(),
  approvePosDayCloseByAdmin: vi.fn(),
}));

import { approvePosDayCloseByAdmin, approvePosSessionCloseByAdmin } from '../../../api/posApi';
import { isAdminApprovalRequired, useAdminCloseApproval } from '../POS/features/approval/useAdminCloseApproval';

describe('useAdminCloseApproval', () => {
  beforeEach(() => vi.clearAllMocks());

  it('recognises the server refusal by its code', () => {
    expect(isAdminApprovalRequired({ response: { data: { code: 'ADMIN_APPROVAL_REQUIRED' } } })).toBe(true);
    expect(isAdminApprovalRequired({ response: { data: { code: 'VARIANCE_APPROVAL_REQUIRED' } } })).toBe(false);
    expect(isAdminApprovalRequired(new Error('x'))).toBe(false);
  });

  it('stores the grant for the approved session and retries the close', async () => {
    approvePosSessionCloseByAdmin.mockResolvedValue({ authorized: true, authorizationToken: 'tok-1' });
    const onApproved = vi.fn();
    const { result } = renderHook(() => useAdminCloseApproval());

    act(() => result.current.request({ action: 'SESSION_CLOSE', targetId: 42, onApproved }));
    expect(result.current.pending?.action).toBe('SESSION_CLOSE');

    act(() => { result.current.setUsername('admin'); result.current.setPassword('pw'); });
    await act(async () => { await result.current.submit(); });

    expect(approvePosSessionCloseByAdmin).toHaveBeenCalledWith(42, { usernameOrEmail: 'admin', password: 'pw' });
    expect(onApproved).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBeNull();
    expect(result.current.password).toBe('');
    expect(result.current.tokenFor('SESSION_CLOSE', 42)).toBe('tok-1');
    // Bound to its own action and target.
    expect(result.current.tokenFor('SESSION_CLOSE', 43)).toBeUndefined();
    expect(result.current.tokenFor('DAY_CLOSE', 42)).toBeUndefined();

    act(() => result.current.clear());
    expect(result.current.tokenFor('SESSION_CLOSE', 42)).toBeUndefined();
  });

  it('keeps the dialog open with the reason when a non-admin tries to approve', async () => {
    approvePosDayCloseByAdmin.mockResolvedValue({
      authorized: false, reasonCode: 'ADMIN_REQUIRED', message: 'Only an administrator can approve this Business Day Close.',
    });
    const onApproved = vi.fn();
    const { result } = renderHook(() => useAdminCloseApproval());

    act(() => result.current.request({ action: 'DAY_CLOSE', targetId: 7, onApproved }));
    act(() => { result.current.setUsername('sup'); result.current.setPassword('pw'); });
    await act(async () => { await result.current.submit(); });

    expect(approvePosDayCloseByAdmin).toHaveBeenCalledWith(7, { usernameOrEmail: 'sup', password: 'pw' });
    expect(onApproved).not.toHaveBeenCalled();
    expect(result.current.pending?.action).toBe('DAY_CLOSE');
    expect(result.current.error).toMatch(/Only an administrator/);
    expect(result.current.tokenFor('DAY_CLOSE', 7)).toBeUndefined();
  });

  it('asks for both fields before calling the server', async () => {
    const { result } = renderHook(() => useAdminCloseApproval());
    act(() => result.current.request({ action: 'SESSION_CLOSE', targetId: 1, onApproved: vi.fn() }));
    await act(async () => { await result.current.submit(); });
    expect(approvePosSessionCloseByAdmin).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/username\/email and password/);
  });
});
