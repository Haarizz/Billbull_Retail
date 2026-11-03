import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
vi.mock('../../utils/clientLogger', () => ({
  createClientRequestId: () => 'req-1',
  logApiError: vi.fn(),
  setCurrentRequestId: vi.fn(),
}));

import toast from 'react-hot-toast';
import api from '../axiosConfig';

const PERMISSION_TOAST = 'You do not have permission to perform this action.';
const rejected = () => api.interceptors.response.handlers.find(Boolean).rejected;
const forbidden = (url, data = {}, method = 'post') => ({
  config: { url, method },
  response: { status: 403, headers: {}, data },
});

describe('axiosConfig — 403 permission toast', () => {
  beforeEach(() => {
    toast.error.mockClear();
  });

  it('skips the permission toast when terminal registration hits the branch terminal limit', async () => {
    const error = forbidden('/api/pos/terminals/register', {
      message: 'Maximum number of terminals (5) reached for this branch.',
    });
    await expect(rejected()(error)).rejects.toBe(error);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('skips the permission toast for other terminal-registration 403s, still rejecting with the server reason', async () => {
    const error = forbidden('/api/pos/terminals/register', { message: 'Terminal is ARCHIVED' });
    await expect(rejected()(error)).rejects.toMatchObject({
      response: { status: 403, data: { message: 'Terminal is ARCHIVED' } },
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it.each([
    ['another POS terminal action', '/api/pos/terminals/42/archive'],
    ['a terminal path that only starts with "register"', '/api/pos/terminals/register-bulk'],
    ['a terminal named "register"', '/api/pos/terminals/register/heartbeat'],
    ['a non-POS endpoint', '/api/sales/invoices'],
  ])('still shows the generic permission toast for %s', async (_name, url) => {
    const error = forbidden(url, { message: 'Access denied' });
    await expect(rejected()(error)).rejects.toBe(error);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(PERMISSION_TOAST, { id: 'permission-denied', duration: 5000 });
  });

  it('still shows the generic toast for a 403 with no response body', async () => {
    const error = { config: { url: '/api/inventory/products', method: 'get' }, response: { status: 403, headers: {} } };
    await expect(rejected()(error)).rejects.toBe(error);
    expect(toast.error).toHaveBeenCalledWith(PERMISSION_TOAST, { id: 'permission-denied', duration: 5000 });
  });

  it('keeps skipping the toast for SUPERVISOR_AUTHORIZATION_REQUIRED', async () => {
    const error = forbidden('/api/pos/sessions/7/close', { message: 'SUPERVISOR_AUTHORIZATION_REQUIRED' });
    await expect(rejected()(error)).rejects.toBe(error);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('skips the toast for a registration URL with a query string', async () => {
    const error = forbidden('/api/pos/terminals/register?retry=1', { message: 'Access denied' });
    await expect(rejected()(error)).rejects.toBe(error);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
