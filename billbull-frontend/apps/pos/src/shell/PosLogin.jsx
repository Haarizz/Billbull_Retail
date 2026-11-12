import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ArrowRight, User, Lock, KeyRound, RotateCw } from 'lucide-react';
import { isAuthenticated, persistLoginSession } from '@billbull/shared/api/auth';
import { fetchPinStaff, pinLogin, posPasswordLogin } from '@billbull/shared/api/posPinApi';
import { useCompany } from '@billbull/shared/context/CompanyContext';
import billBullLogo from '@billbull/shared/assets/billBullLogo.png';
import { clearPinDevice, describeTillLoginError, readPinDevice } from './pinDevice';
import { ErrorBox, NAVY, PinPad, PinSetup, StaffPicker, inputCls, linkCls } from './PinSignIn';
import { distinctInitials, layoutFor, readRecent, rememberSignIn } from './staffDirectory';

// This PC's registered POS terminal for the till's branch (written by the workspace when it
// registers the terminal). Only sent so the server can name whose drawer is open here.
const terminalIdFor = (device) => {
  try {
    return localStorage.getItem(`billbull:pos:terminal_id:${device.branchId}`) || undefined;
  } catch {
    return undefined;
  }
};

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
  return <div aria-hidden className="my-5 short:my-3 border-t-2 border-dashed border-[#E3E1DA]" />;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

// Till sign-in. PIN sign-in is the default: tap (or arrow to) your name, then type your PIN on the
// on-screen keypad or the keyboard. A till that hasn't been set up yet opens on a one-time
// manager setup card instead (see PinSetup). Username and password is always one tap away.
// Every successful sign-in lands on the POS workspace — there is no back-office route here.
export default function PosLogin() {
  const navigate = useNavigate();
  const { refreshCompany } = useCompany();
  const now = useNow();

  const [device, setDevice] = useState(() => readPinDevice());
  const [mode, setMode] = useState('pin');
  const [notice, setNotice] = useState('');

  // PIN mode
  const [staff, setStaff] = useState(() => ({ loading: Boolean(readPinDevice()), error: '', list: [], branchName: '', openSession: null }));
  const [person, setPerson] = useState(null);
  const [reload, setReload] = useState(0);
  const [attempt, setAttempt] = useState(0); // bumps on each wrong PIN to replay the shake

  // Password mode
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode !== 'pin' || !device) return undefined;
    let cancelled = false;
    fetchPinStaff(device.token, terminalIdFor(device))
      .then((data) => {
        if (!cancelled) {
          setStaff({
            loading: false,
            error: '',
            list: data.staff || [],
            branchName: data.branchName || device.branchName || '',
            openSession: data.openSession || null,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 401) {
          // Turned off by an admin (or the record is gone): back to the setup card.
          clearPinDevice();
          setDevice(null);
          setNotice('PIN sign-in was turned off for this till. A manager can set it up again, or use your username and password.');
          return;
        }
        setStaff((s) => ({ ...s, loading: false, error: describeTillLoginError(err, 'Couldn’t load staff for this till.') }));
      });
    return () => { cancelled = true; };
  }, [mode, device, reload]);

  // Initials made unique across this till's list (Store 1 / Supervisor 1 -> ST1 / SU1).
  const people = useMemo(() => {
    const initials = distinctInitials(staff.list);
    return staff.list.map((p) => ({ ...p, initials: initials.get(p.employeeId) || p.initials }));
  }, [staff.list]);
  const layout = layoutFor(people.length);
  // A few ids from localStorage: cheap enough to read on every render, so it is never stale.
  const recentIds = device ? readRecent(device.deviceId) : [];

  if (isAuthenticated()) return <Navigate to="/" replace />;

  const finishSignIn = (data, tillBranchId) => {
    // A fresh sign-in resolves its own branch: never inherit another user's branch from this tab.
    sessionStorage.removeItem('activeBranchId');
    persistLoginSession(data);
    // A PIN sign-in runs on the till's own branch; BranchProvider honours a pre-seeded id.
    if (tillBranchId != null) sessionStorage.setItem('activeBranchId', String(tillBranchId));
    refreshCompany();
    // BranchProvider mounted before the token existed; tell it to load this user's branches.
    window.dispatchEvent(new CustomEvent('billbull:login'));
    navigate('/', { replace: true });
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }
    setBusy(true);
    setError('');
    try {
      finishSignIn(await posPasswordLogin(username, password));
    } catch (err) {
      setError(describeTillLoginError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitPin = async (pin) => {
    setBusy(true);
    setError('');
    try {
      const data = await pinLogin(device.token, person.employeeId, pin);
      rememberSignIn(device.deviceId, person.employeeId); // only after the server accepted the PIN
      finishSignIn(data, data.tillBranchId);
    } catch (err) {
      if (err?.response?.status === 401 && /not enabled/i.test(err.response.data?.message || '')) {
        clearPinDevice();
        setDevice(null);
        setNotice('PIN sign-in was turned off for this till. A manager can set it up again, or use your username and password.');
        setPerson(null);
        return;
      }
      setError(describeTillLoginError(err, 'Wrong PIN. Try again.'));
      setAttempt((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next) => {
    if (next === 'pin' && device) setStaff((s) => ({ ...s, loading: true, error: '' }));
    setMode(next);
    setError('');
    setNotice('');
    setPerson(null);
  };

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const time = `${pad(hour)}:${pad(now.getMinutes())}`;
  const date = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const receiptDate = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;

  // Larger branches get a wider receipt while choosing a name, so cards and the directory have room
  // for full names. The PIN pad and the password form keep the classic narrow receipt.
  const picking = mode === 'pin' && device && !person && !staff.loading && !staff.error && people.length > 0;
  const wide = picking && layout !== 'tiles';

  const noticeBox = notice && (
    <p role="status" className="mt-4 rounded-lg border border-[#FDE6A9] bg-[#FFF8E7] px-4 py-3 text-sm text-[#7a5b07]">{notice}</p>
  );

  const pinBody = (
    <>
      <h1 className="text-center text-2xl font-bold tracking-tight">Sign in with PIN</h1>
      <p className="mt-1 text-center text-sm text-[#66737F]">
        {!device ? 'This till isn’t set up for PIN sign-in yet'
          : person ? (staff.branchName || 'Enter your PIN')
            : `${layout === 'tiles' ? 'Tap your name' : 'Find your name'}${staff.branchName ? ` · ${staff.branchName}` : ''}`}
      </p>
      {noticeBox}

      {!device ? (
        <PinSetup onDone={() => {
          setNotice('');
          setStaff((s) => ({ ...s, loading: true, error: '' }));
          setDevice(readPinDevice());
        }} />
      ) : person ? (
        <PinPad key={attempt} person={person} busy={busy} error={error} attempt={attempt} onSubmit={submitPin}
          onBack={() => { setPerson(null); setError(''); }} />
      ) : staff.loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[#66737F]" /></div>
      ) : staff.error ? (
        <div className="mt-5 space-y-3">
          <ErrorBox>{staff.error}</ErrorBox>
          <button type="button" onClick={() => { setStaff((s) => ({ ...s, loading: true, error: '' })); setReload((n) => n + 1); }} className={`${linkCls} w-full justify-center`}>
            <RotateCw size={14} /> Try again
          </button>
        </div>
      ) : staff.list.length === 0 ? (
        <p className="mt-6 rounded-lg bg-[#F3F1EC] px-4 py-4 text-center text-sm text-[#66737F]">
          No one can use PIN sign-in on this till yet. Each person needs POS access and a PIN in their employee record,
          plus a BillBull login for this branch.
        </p>
      ) : (
        <StaffPicker staff={people} layout={layout} openSession={staff.openSession} recentIds={recentIds}
          onPick={(p) => { setPerson(p); setError(''); }} />
      )}

      <div className="mt-5 text-center">
        <button type="button" onClick={() => switchMode('password')} className={linkCls}>
          <User size={14} /> Use username &amp; password instead
        </button>
      </div>
    </>
  );

  const passwordBody = (
    <>
      <h1 className="text-center text-2xl font-bold tracking-tight">Sign in to the till</h1>
      <p className="mt-1 text-center text-sm text-[#66737F]">Use your BillBull username and password</p>

      <form onSubmit={submitPassword} className="mt-6 short:mt-4 space-y-4 short:space-y-3">
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
        {error && <ErrorBox>{error}</ErrorBox>}
        <button type="submit" disabled={busy}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#F5C742] text-base font-bold text-[#1A1A1A] shadow-sm transition hover:bg-[#E5B732] disabled:opacity-50">
          {busy ? (<><Loader2 className="h-5 w-5 animate-spin" />Signing in…</>) : (<>Sign In <ArrowRight size={20} /></>)}
        </button>
      </form>

      <div className="mt-5 text-center">
        <button type="button" onClick={() => switchMode('pin')} className={linkCls}>
          <KeyRound size={14} /> Sign in with PIN
        </button>
      </div>
    </>
  );

  return (
    // The screen is exactly one viewport tall. The staff list shortens itself to fit (StaffPicker's
    // useFitToScreen); anything still too tall (e.g. the password form on a tiny screen) scrolls
    // inside <main>, and the auto margins keep it centred when it fits.
    // (--bb-scaled-vh is the viewport height in the app's 90%-zoomed #root, see index.css.)
    <div className="relative flex h-[var(--bb-scaled-vh)] w-full flex-col overflow-hidden bg-[#F3F1EC] text-[#1C2838]">
      <style>{`
        @keyframes bbPrint { from { transform: translateY(-48px); clip-path: inset(0 0 100% 0); } to { transform: none; clip-path: inset(0 0 0 0); } }
        @media (prefers-reduced-motion: no-preference) { .bb-print { animation: bbPrint 700ms cubic-bezier(.2,.8,.2,1) both; } }
      `}</style>

      {/* Backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{ backgroundImage: 'radial-gradient(#D6D2C7 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[#F5C742]/25 blur-3xl" />

      {/* Header: brand + till clock */}
      <header className="relative flex items-center justify-between px-6 py-5 short:py-2 sm:px-10">
        <div className="flex items-center gap-3">
          <img src={billBullLogo} alt="BillBull" className="h-14 short:h-10 w-auto" />
          <span className="rounded-md bg-[#1C2838] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#F5C742]">POS</span>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-semibold tabular-nums leading-none">{time}</p>
          <p className="mt-1 hidden text-xs text-[#66737F] sm:block">{date}</p>
        </div>
      </header>

      {/* Printer + receipt */}
      <main className={`relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 short:pb-4 ${wide ? 'pb-6' : 'pb-10'}`}>
        <div aria-hidden className="grow" />
        {/* The greeting gives its room to the staff list on short screens and on the wider receipt. */}
        <p className={`mb-6 text-center text-lg text-[#66737F] short:hidden ${wide ? 'hidden' : ''}`}>
          {greeting}. <span className="font-semibold text-[#1C2838]">Ready to open the till?</span>
        </p>

        <div data-testid="till-receipt" data-layout={picking ? layout : 'form'}
          className={`flex w-full flex-col transition-[max-width] duration-300 ease-out ${!wide ? 'max-w-110' : layout === 'directory' ? 'max-w-180' : 'max-w-160'}`}>
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
          <div className="bb-print relative -mt-2 flex flex-col drop-shadow-[0_18px_24px_rgba(28,40,56,0.15)]">
            <div className="flex flex-col bg-white px-7 pb-6 pt-8 short:pb-4 short:pt-5 sm:px-9">
              <div className="text-center font-mono text-xs uppercase tracking-[0.25em] text-[#66737F]">
                *** Point of Sale ***
              </div>
              <div className="mt-3 flex justify-between font-mono text-xs text-[#66737F]">
                <span>DATE {receiptDate}</span>
                <span>TIME {time}</span>
              </div>
              <Dashed />

              {mode === 'pin' ? pinBody : passwordBody}

              <Dashed />
              <p className="text-center font-mono text-xs uppercase tracking-[0.2em] text-[#66737F]">Have a great shift</p>
              <div aria-hidden className={`mt-4 h-10 short:hidden items-stretch justify-center gap-px opacity-80 ${picking && layout === 'directory' ? 'hidden' : 'flex'}`}>
                {BARCODE.map((w, i) => (
                  <span key={i} style={{ width: w * 2, background: i % 2 === 0 ? NAVY : 'transparent' }} />
                ))}
              </div>
            </div>
            <div aria-hidden style={zigzag} />
          </div>
        </div>
        <div aria-hidden className="grow" />
      </main>

      <footer className="relative flex flex-col items-center gap-1 px-6 pb-6 short:pb-3 text-xs text-[#8A939C] sm:flex-row sm:justify-between sm:px-10">
        <span>Smart Billing • Smart Inventory • Smart Retail</span>
        <span>© {now.getFullYear()} BillBull. All rights reserved.</span>
      </footer>
    </div>
  );
}
