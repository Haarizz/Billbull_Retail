import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ArrowRight, User, Lock } from 'lucide-react';
import { describeLoginError, isAuthenticated, login, persistLoginSession } from '@billbull/shared/api/auth';
import { useCompany } from '@billbull/shared/context/CompanyContext';
import billBullLogo from '@billbull/shared/assets/billBullLogo.png';

const NAVY = '#1C2838';

const inputCls =
  'w-full rounded-lg border border-[#E3E1DA] bg-[#FBFAF7] py-3 pl-11 pr-4 text-base text-gray-900 placeholder-gray-400 transition focus:border-[#1C2838] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40';

// Decorative barcode at the foot of the receipt: bar/gap widths in px.
const BARCODE = [3, 1, 1, 2, 2, 1, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 1, 1, 3, 2, 1, 2, 1, 1, 2, 3, 1, 1];

// Torn-paper zigzag along the bottom edge of the receipt.
const zigzag = {
  height: 12,
  background:
    'linear-gradient(135deg, #ffffff 33%, transparent 33%) 0 0 / 16px 12px repeat-x,' +
    'linear-gradient(225deg, #ffffff 33%, transparent 33%) 0 0 / 16px 12px repeat-x',
};

const pad = (n) => String(n).padStart(2, '0');

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Dashed() {
  return <div aria-hidden className="my-5 border-t-2 border-dashed border-[#E3E1DA]" />;
}

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
  const now = useNow();

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

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const time = `${pad(hour)}:${pad(now.getMinutes())}`;
  const date = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const receiptDate = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-[#F3F1EC] text-[#1C2838]">
      <style>{`
        @keyframes bbPrint { from { transform: translateY(-48px); clip-path: inset(0 0 100% 0); } to { transform: none; clip-path: inset(0 0 0 0); } }
        @media (prefers-reduced-motion: no-preference) { .bb-print { animation: bbPrint 700ms cubic-bezier(.2,.8,.2,1) both; } }
      `}</style>

      {/* Backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{ backgroundImage: 'radial-gradient(#D6D2C7 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[#F5C742]/25 blur-3xl" />

      {/* Header: brand + till clock */}
      <header className="relative flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          <img src={billBullLogo} alt="BillBull" className="h-14 w-auto" />
          <span className="rounded-md bg-[#1C2838] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#F5C742]">POS</span>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-semibold tabular-nums leading-none">{time}</p>
          <p className="mt-1 hidden text-xs text-[#66737F] sm:block">{date}</p>
        </div>
      </header>

      {/* Printer + receipt */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-4 pb-10">
        <p className="mb-6 text-center text-lg text-[#66737F]">
          {greeting}. <span className="font-semibold text-[#1C2838]">Ready to open the till?</span>
        </p>

        <div className="w-full max-w-[440px]">
          {/* Printer body */}
          <div className="relative z-10 -mx-4 rounded-2xl px-5 pb-3 pt-4 shadow-xl shadow-[#1C2838]/25" style={{ background: NAVY }}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">BillBull · Receipt printer</span>
              <span aria-hidden className="flex gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#F5C742] shadow-[0_0_8px_#F5C742]" />
                <span className="h-2 w-2 rounded-full bg-white/20" />
              </span>
            </div>
            <div className="mt-3 h-2.5 rounded-full bg-black/60 shadow-inner" />
          </div>

          {/* Receipt paper */}
          <div className="bb-print relative -mt-2 drop-shadow-[0_18px_24px_rgba(28,40,56,0.15)]">
            <div className="bg-white px-7 pb-6 pt-8 sm:px-9">
              <div className="text-center font-mono text-xs uppercase tracking-[0.25em] text-[#66737F]">
                *** Point of Sale ***
              </div>
              <div className="mt-3 flex justify-between font-mono text-xs text-[#66737F]">
                <span>DATE {receiptDate}</span>
                <span>TIME {time}</span>
              </div>
              <Dashed />

              <h1 className="text-center text-2xl font-bold tracking-tight">Sign in to the till</h1>
              <p className="mt-1 text-center text-sm text-[#66737F]">Use your BillBull username and password</p>

              <form onSubmit={submit} className="mt-6 space-y-4">
                <label className="block space-y-1.5">
                  <span className="block text-sm font-medium text-[#333333]">Email or Username</span>
                  <div className="relative">
                    <User size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input name="username" autoComplete="username" autoFocus value={username} placeholder="you@company.com"
                      onChange={(e) => { setUsername(e.target.value); setError(''); }} className={inputCls} />
                  </div>
                </label>
                <label className="block space-y-1.5">
                  <span className="block text-sm font-medium text-[#333333]">Password</span>
                  <div className="relative">
                    <Lock size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                      value={password} placeholder="••••••••" onChange={(e) => { setPassword(e.target.value); setError(''); }}
                      className={`${inputCls} pr-12`} />
                    <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </label>
                {error && (
                  <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
                )}
                <button type="submit" disabled={busy}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#F5C742] text-base font-bold text-[#1A1A1A] shadow-sm transition hover:bg-[#E5B732] disabled:opacity-50">
                  {busy ? (<><Loader2 className="h-5 w-5 animate-spin" />Signing in…</>) : (<>Sign In <ArrowRight size={20} /></>)}
                </button>
              </form>

              <Dashed />
              <p className="text-center font-mono text-xs uppercase tracking-[0.2em] text-[#66737F]">Have a great shift</p>
              <div aria-hidden className="mt-4 flex h-10 items-stretch justify-center gap-px opacity-80">
                {BARCODE.map((w, i) => (
                  <span key={i} style={{ width: w * 2, background: i % 2 === 0 ? NAVY : 'transparent' }} />
                ))}
              </div>
            </div>
            <div aria-hidden style={zigzag} />
          </div>
        </div>
      </main>

      <footer className="relative flex flex-col items-center gap-1 px-6 pb-6 text-xs text-[#8A939C] sm:flex-row sm:justify-between sm:px-10">
        <span>Smart Billing • Smart Inventory • Smart Retail</span>
        <span>© {now.getFullYear()} BillBull. All rights reserved.</span>
      </footer>
    </div>
  );
}
