import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const login = vi.fn();
const verifyMfa = vi.fn();
const enrollMfa = vi.fn();
const completeSignIn = vi.fn();

vi.mock('../api/client', () => ({
  platformApi: {
    login: (...a) => login(...a),
    verifyMfa: (...a) => verifyMfa(...a),
    enrollMfa: (...a) => enrollMfa(...a),
  },
  errorMessage: (e) => e?.response?.data?.message || 'Request failed',
}));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ completeSignIn }) }));
vi.mock('qrcode', () => ({ default: { toDataURL: () => Promise.resolve('data:image/png;base64,AAA') } }));

import LoginPage from '../pages/LoginPage';

describe('LoginPage', () => {
  beforeEach(() => {
    login.mockReset();
    verifyMfa.mockReset();
    enrollMfa.mockReset();
    completeSignIn.mockReset();
  });

  const signIn = () => {
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ops@billbull.app' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse battery' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  };

  it('asks for the authenticator code after the password, then signs in', async () => {
    login.mockResolvedValue({ stage: 'MFA', challenge: 'c1' });
    verifyMfa.mockResolvedValue({ stage: 'DONE', token: 't', user: { email: 'ops@billbull.app' } });
    render(<LoginPage />);
    signIn();
    const code = await screen.findByLabelText('Code');
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(completeSignIn).toHaveBeenCalledWith(expect.objectContaining({ token: 't' })));
    expect(verifyMfa).toHaveBeenCalledWith('c1', '123456');
  });

  it('shows the enrolment QR code on first sign-in and enrols', async () => {
    login.mockResolvedValue({ stage: 'MFA_SETUP', challenge: 'c2', secret: 'ABCDEF', otpauthUri: 'otpauth://totp/x' });
    enrollMfa.mockResolvedValue({ stage: 'DONE', token: 't2', user: {} });
    render(<LoginPage />);
    signIn();
    expect(await screen.findByAltText('Authenticator QR code')).toBeTruthy();
    expect(screen.getByText('ABCDEF')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(enrollMfa).toHaveBeenCalledWith('c2', '654321'));
  });

  it('shows the platform message when the password is wrong', async () => {
    login.mockRejectedValue({ response: { status: 401, data: { message: 'Invalid email or password' } } });
    render(<LoginPage />);
    signIn();
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(completeSignIn).not.toHaveBeenCalled();
  });
});
