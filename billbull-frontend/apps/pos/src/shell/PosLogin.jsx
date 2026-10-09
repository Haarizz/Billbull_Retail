import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import { describeLoginError, isAuthenticated, login, persistLoginSession } from '@billbull/shared/api/auth';
import { useCompany } from '@billbull/shared/context/CompanyContext';
import TillScreen, { tillButton } from './TillScreen';

const inputCls =
  'w-full rounded-xl border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-[#F5C742] focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20';

// Till sign-in against the existing /api/auth/login. Every successful sign-in lands on the POS
// workspace — there is no back-office landing route in this app.
export default function PosLogin() {
  const navigate = useNavigate();
  const { refreshCompany } = useCompany();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (isAuthenticated()) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await login(username, password);
      // A fresh sign-in resolves its own branch: never inherit another user's branch from this tab.
      sessionStorage.removeItem('activeBranchId');
      persistLoginSession(data);
      refreshCompany();
      // BranchProvider mounted before the token existed; tell it to load this user's branches.
      window.dispatchEvent(new CustomEvent('billbull:login'));
      navigate('/', { replace: true });
    } catch (err) {
      setError(describeLoginError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <TillScreen title="Sign in to the till" subtitle="Use your BillBull username and password">
      <form onSubmit={submit} className="space-y-5">
        <label className="block space-y-2">
          <span className="block text-sm font-medium text-[#333333]">Email or Username</span>
          <input name="username" autoComplete="username" autoFocus value={username}
            onChange={(e) => { setUsername(e.target.value); setError(''); }} className={inputCls} />
        </label>
        <label className="block space-y-2">
          <span className="block text-sm font-medium text-[#333333]">Password</span>
          <div className="relative">
            <input name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
              value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }}
              className={`${inputCls} pr-12`} />
            <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </label>
        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}
        <button type="submit" disabled={busy} className={tillButton}>
          {busy ? (<><Loader2 className="h-5 w-5 animate-spin" />Signing in…</>) : (<>Sign In <ArrowRight size={20} /></>)}
        </button>
      </form>
    </TillScreen>
  );
}
