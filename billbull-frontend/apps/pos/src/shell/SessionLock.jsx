import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { setSessionExpiredHandler } from '@billbull/shared/api/axiosConfig';
import { describeLoginError, getDecodedToken, login, persistLoginSession } from '@billbull/shared/api/auth';
import { signOutOfTill } from './signOut';
import { tillButton, tillSecondaryButton } from './TillScreen';

// Never schedule further out than setTimeout can represent (~24.8 days).
const MAX_TIMER_MS = 2_147_000_000;

// While locked, keystrokes belong to the unlock form only. The POS's scanner wedge, hotkeys and
// payment-modal keys all listen on window in the capture phase, so this guard must be registered
// on window before any of them — installTillKeyGuard() runs in main.jsx before the first render.
// stopImmediatePropagation keeps those listeners from seeing the event; the default action
// (typing into the password field, Enter submitting the form) is untouched.
let tillLocked = false;
const KEY_EVENTS = ['keydown', 'keypress', 'keyup'];
export function installTillKeyGuard(target = window) {
  const guard = (event) => {
    if (tillLocked) event.stopImmediatePropagation();
  };
  KEY_EVENTS.forEach((type) => target.addEventListener(type, guard, true));
  return () => KEY_EVENTS.forEach((type) => target.removeEventListener(type, guard, true));
}

/**
 * Till lock for an expired login. Instead of Retail's redirect to /login (which would unmount the
 * workspace and drop the cart), a 401 — or reaching the token's `exp` — raises a full-screen lock
 * over the still-mounted workspace. Only the same user can unlock it; anyone else has to sign
 * out, which discards the screen state explicitly. The token is not extended or stored anywhere
 * new: unlocking is an ordinary /api/auth/login that replaces the tab's token.
 *
 * The POS's own idle lock (IdleLockOverlay, driven by POS settings) is unchanged and separate.
 */
export default function SessionLock({ children }) {
  const [lockedUser, setLockedUser] = useState(null);

  const lock = useCallback(() => {
    setLockedUser((current) => current ?? (sessionStorage.getItem('user') || ''));
  }, []);

  useLayoutEffect(() => {
    tillLocked = lockedUser !== null;
  }, [lockedUser]);
  useEffect(() => () => { tillLocked = false; }, []);

  useEffect(() => {
    setSessionExpiredHandler(lock);
    return () => setSessionExpiredHandler(null);
  }, [lock]);

  useEffect(() => {
    if (lockedUser !== null) return undefined;
    const exp = getDecodedToken()?.exp;
    if (typeof exp !== 'number') return undefined;
    const t = setTimeout(lock, Math.min(Math.max(0, exp * 1000 - Date.now()), MAX_TIMER_MS));
    return () => clearTimeout(t);
  }, [lockedUser, lock]);

  return (
    <>
      <div aria-hidden={lockedUser !== null ? true : undefined} className="contents">{children}</div>
      {lockedUser !== null && <UnlockPanel username={lockedUser} onUnlocked={() => setLockedUser(null)} />}
    </>
  );
}

function UnlockPanel({ username, onUnlocked }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const unlock = async (e) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError('');
    try {
      const data = await login(username, password);
      if (username && data.username && data.username.toLowerCase() !== username.toLowerCase()) {
        setError('Only the signed-in cashier can unlock this till. Sign out to switch user.');
        return;
      }
      persistLoginSession(data);
      setPassword('');
      onUnlocked();
    } catch (err) {
      setError(describeLoginError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="till-lock-title" data-pos-scan-suppress="true"
      className="fixed inset-0 z-[11000] flex items-center justify-center bg-slate-900/70 px-4 backdrop-blur-sm">
      <form onSubmit={unlock} className="w-full max-w-md space-y-4 rounded-3xl bg-white p-8 shadow-2xl">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="rounded-full bg-[#FFF8E7] p-3 text-[#b8920e]"><Lock className="h-6 w-6" /></div>
          <h2 id="till-lock-title" className="text-xl font-semibold text-[#26333C]">Sign in again to continue</h2>
          <p className="text-sm text-gray-500">Your login expired. The sale on screen is kept.</p>
        </div>
        <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm">
          <span className="text-gray-500">Cashier </span><span className="font-semibold text-[#1E293B]">{username || '—'}</span>
        </div>
        <input type="password" autoFocus autoComplete="current-password" placeholder="Password" value={password}
          onChange={(e) => { setPassword(e.target.value); setError(''); }}
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:border-[#F5C742] focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20" />
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
        <button type="submit" disabled={busy || !password} className={tillButton}>
          {busy ? <><Loader2 className="h-5 w-5 animate-spin" />Unlocking…</> : 'Unlock till'}
        </button>
        <button type="button" className={tillSecondaryButton} onClick={() => signOutOfTill()}>Sign out instead</button>
      </form>
    </div>
  );
}
