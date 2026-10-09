import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
vi.mock('../../utils/clientLogger', () => ({
  createClientRequestId: () => 'req-1',
  logApiError: vi.fn(),
  setCurrentRequestId: vi.fn(),
}));

import api, { setSessionExpiredHandler } from '../axiosConfig';

const rejected = () => api.interceptors.response.handlers.find(Boolean).rejected;
const unauthorized = (url = '/api/pos/sessions/current') => ({
  config: { url, method: 'get' },
  response: { status: 401, headers: {}, data: {} },
});

describe('axiosConfig — 401 session expiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    sessionStorage.setItem('token', 'tkn');
    sessionStorage.setItem('user', 'cashier1');
  });
  afterEach(() => {
    setSessionExpiredHandler(null);
    vi.useRealTimers();
  });

  it('keeps the Retail default when no handler is registered: clears the session and flags expiry', async () => {
    const error = unauthorized();
    await expect(rejected()(error)).rejects.toBe(error);
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('user')).toBeNull();
    expect(sessionStorage.getItem('__session_expired')).toBe('true');
  });

  it('hands a registered handler the error instead of clearing the session or redirecting', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    const error = unauthorized();
    await expect(rejected()(error)).rejects.toBe(error);
    expect(handler).toHaveBeenCalledWith(error);
    expect(sessionStorage.getItem('token')).toBe('tkn');
    expect(sessionStorage.getItem('__session_expired')).toBeNull();
  });

  it('never routes a 401 from the auth endpoints (bad login) to the handler', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    const error = unauthorized('/api/auth/login');
    await expect(rejected()(error)).rejects.toBe(error);
    expect(handler).not.toHaveBeenCalled();
  });

  it('restores the default when the handler is cleared', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    setSessionExpiredHandler(null);
    await expect(rejected()(unauthorized())).rejects.toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('token')).toBeNull();
  });
});
