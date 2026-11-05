import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Delete, KeyRound, Loader2, Lock, Search, User } from 'lucide-react';
import { enablePinSignIn, fetchBranchesFor, managerCredentialCheck } from '@billbull/shared/api/posPinApi';
import { describeTillLoginError, savePinDevice } from './pinDevice';

// The pieces of till PIN sign-in. Everything works by touch (large targets, no hover-only
// affordances, no double-tap zoom) and by keyboard (digits from the number row or numpad,
// Backspace, Enter, Escape, arrow keys between names).

export const NAVY = '#1C2838';
export const PIN_MIN = 4;
export const PIN_MAX = 6;

export const inputCls =
  'w-full rounded-lg border border-[#E3E1DA] bg-[#FBFAF7] py-3 pl-11 pr-4 text-base text-gray-900 placeholder-gray-400 transition focus:border-[#1C2838] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40';

export const linkCls =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-[#66737F] underline-offset-4 hover:text-[#1C2838] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5C742]';

const touch = 'touch-manipulation select-none [-webkit-tap-highlight-color:transparent]';
const focusRing = 'focus:outline-none focus-visible:ring-4 focus-visible:ring-[#F5C742]/70';

export function ErrorBox({ children }) {
  return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{children}</div>;
}

function Avatar({ initials, size = 'h-12 w-12 text-base' }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-bold text-[#F5C742] ${size}`} style={{ background: NAVY }}>
      {initials || '?'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Who's signing in
// ---------------------------------------------------------------------------

const COLUMNS = 3;

export function StaffPicker({ staff, onPick }) {
  const [query, setQuery] = useState('');
  const tileRefs = useRef([]);
  const searchRef = useRef(null);
  const showSearch = staff.length > 9;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? staff.filter((s) => s.name.toLowerCase().includes(q)) : staff;
  }, [staff, query]);

  // Keyboard users land on something useful straight away.
  useEffect(() => {
    if (showSearch) searchRef.current?.focus();
    else tileRefs.current[0]?.focus();
  }, [showSearch]);

  const focusTile = (index) => {
    const clamped = Math.max(0, Math.min(shown.length - 1, index));
    tileRefs.current[clamped]?.focus();
  };

  const onTileKey = (e, index) => {
    const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS };
    if (moves[e.key] !== undefined) {
      e.preventDefault();
      if (e.key === 'ArrowUp' && index < COLUMNS && showSearch) searchRef.current?.focus();
      else focusTile(index + moves[e.key]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusTile(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusTile(shown.length - 1);
    } else if (/^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Type-ahead: jump to the next name starting with that letter.
      const letter = e.key.toLowerCase();
      const order = [...shown.keys()].map((i) => (index + 1 + i) % shown.length);
      const next = order.find((i) => shown[i].name.toLowerCase().startsWith(letter));
      if (next !== undefined) {
        e.preventDefault();
        focusTile(next);
      }
    }
  };

  const onSearchKey = (e) => {
    if (e.key === 'ArrowDown' && shown.length) {
      e.preventDefault();
      focusTile(0);
    } else if (e.key === 'Enter' && shown.length) {
      e.preventDefault();
      onPick(shown[0]);
    }
  };

  return (
    <div className="mt-5 space-y-3">
      {showSearch && (
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey}
            placeholder="Type your name" aria-label="Find your name" autoComplete="off" className={inputCls} />
        </div>
      )}
      <ul role="list" aria-label="Staff" className="grid max-h-[340px] grid-cols-3 gap-2.5 overflow-y-auto p-1">
        {shown.map((person, index) => (
          <li key={person.employeeId}>
            <button type="button" ref={(el) => { tileRefs.current[index] = el; }}
              onClick={() => onPick(person)} onKeyDown={(e) => onTileKey(e, index)}
              className={`flex min-h-[104px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-[#E3E1DA] bg-[#FBFAF7] px-2 py-3 transition active:scale-[0.97] active:bg-white ${touch} ${focusRing} focus-visible:border-[#1C2838]`}>
              <Avatar initials={person.initials} />
              <span className="w-full truncate text-center text-sm font-semibold text-[#1C2838]" title={person.name}>{person.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="py-4 text-center text-sm text-[#66737F]">No one matches “{query}”.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PIN entry
// ---------------------------------------------------------------------------

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];

// person.pinLength comes from the server when known: the pad then shows exactly that many dots and
// signs in on the last digit. Unknown (a PIN set before lengths were stored): 4–6 digits, then Enter.
// The parent remounts the pad (key) after each failed try, which empties it.
export function PinPad({ person, busy, error, attempt, onSubmit, onBack }) {
  const pinLength = Number.isInteger(person.pinLength) && person.pinLength >= PIN_MIN && person.pinLength <= PIN_MAX
    ? person.pinLength : null;
  const maxDigits = pinLength || PIN_MAX;
  const [pin, setPin] = useState('');
  const [pressed, setPressed] = useState(null);
  const padRef = useRef(null);

  const press = useCallback((key) => {
    if (busy) return;
    if (key === 'back') setPin((p) => p.slice(0, -1));
    else if (key === 'clear') setPin('');
    else if (key === 'ok') {
      if (pin.length >= (pinLength || PIN_MIN)) onSubmit(pin);
    } else if (pin.length < maxDigits) {
      const next = pin + key;
      setPin(next);
      if (next.length === pinLength) onSubmit(next); // last digit signs in; the dots stay full while it checks
    }
  }, [busy, pin, pinLength, maxDigits, onSubmit]);

  // Physical keyboard and USB numpads: e.key is the digit for both rows; NumpadEnter is "Enter".
  useEffect(() => {
    let releaseTimer;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      let key = null;
      if (/^\d$/.test(e.key)) key = e.key;
      else if (e.key === 'Backspace') key = 'back';
      else if (e.key === 'Delete') key = 'clear';
      else if (e.key === 'Enter') key = 'ok';
      else if (e.key === 'Escape') { e.preventDefault(); onBack(); return; }
      if (!key) return;
      e.preventDefault();
      setPressed(key);
      press(key);
      // Flash the on-screen key; don't rely on keyup (lost if the window loses focus mid-press).
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => setPressed(null), 140);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(releaseTimer);
    };
  }, [press, onBack]);

  // Keep focus inside the pad so keystrokes never land on a link behind it.
  useEffect(() => { padRef.current?.focus(); }, []);

  const slots = pinLength || Math.max(PIN_MIN, pin.length);
  const keyBase = `flex h-16 items-center justify-center rounded-xl border-2 text-2xl font-semibold transition active:scale-[0.96] disabled:opacity-40 ${touch} ${focusRing}`;
  const keyCls = (key) => `${keyBase} ${pressed === key ? 'scale-[0.96] border-[#1C2838] bg-white' : 'border-[#E3E1DA] bg-[#FBFAF7] active:bg-white'} text-[#1C2838]`;

  return (
    <div ref={padRef} tabIndex={-1} className="mt-4 focus:outline-none">
      <style>{`@keyframes bbShake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-8px)}40%,60%{transform:translateX(8px)}}
        @media (prefers-reduced-motion: no-preference){.bb-shake{animation:bbShake .45s both}}`}</style>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label="Choose someone else"
          className={`flex h-11 w-11 items-center justify-center rounded-lg text-[#66737F] hover:bg-[#F3F1EC] hover:text-[#1C2838] ${touch} ${focusRing}`}>
          <ArrowLeft size={20} />
        </button>
        <Avatar initials={person.initials} size="h-10 w-10 text-sm" />
        <div className="min-w-0">
          <div className="truncate font-semibold text-[#1C2838]">{person.name}</div>
          <div className="text-xs text-[#66737F]">
            {pinLength
              ? `Enter your ${pinLength}-digit PIN`
              : <>Enter your PIN, then press <span aria-hidden>→</span><span className="sr-only">Sign in</span> or Enter</>}
          </div>
        </div>
      </div>

      <div key={attempt} className={`my-5 flex justify-center gap-3 ${error ? 'bb-shake' : ''}`} aria-label={`${pin.length} digits entered`} role="status">
        {Array.from({ length: slots }, (_, i) => (
          <span key={i} className={`h-4 w-4 rounded-full border-2 transition ${i < pin.length ? 'border-[#1C2838] bg-[#1C2838]' : 'border-[#CFCBC0] bg-transparent'}`} />
        ))}
      </div>

      {error && <div className="mb-3"><ErrorBox>{error}</ErrorBox></div>}

      <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="PIN keypad">
        {KEYS.map((key) => {
          if (key === 'back') {
            return (
              <button key={key} type="button" className={keyCls(key)} disabled={busy || !pin} onClick={() => press('back')} aria-label="Delete digit">
                <Delete size={24} />
              </button>
            );
          }
          if (key === 'ok') {
            return (
              <button key={key} type="button" disabled={busy || pin.length < (pinLength || PIN_MIN)} onClick={() => press('ok')} aria-label="Sign in"
                className={`flex h-16 items-center justify-center rounded-xl bg-[#F5C742] text-[#1A1A1A] shadow-sm transition hover:bg-[#E5B732] active:scale-[0.96] disabled:opacity-40 ${touch} ${focusRing} ${pressed === 'ok' ? 'scale-[0.96]' : ''}`}>
                {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <ArrowRight size={26} />}
              </button>
            );
          }
          return (
            <button key={key} type="button" className={keyCls(key)} disabled={busy} onClick={() => press(key)}>{key}</button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One-time setup, from the sign-in screen
// ---------------------------------------------------------------------------

/**
 * A till that hasn't been set up yet still opens on PIN sign-in, with this card. A manager (admin
 * or branch admin) enters their credentials once; the till gets its PIN key and the manager is
 * NOT signed in — the screen goes straight to the staff list.
 */
export function PinSetup({ onDone }) {
  const [step, setStep] = useState('intro'); // intro | credentials | branch
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [label, setLabel] = useState('');
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [managerToken, setManagerToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const enroll = async (token, chosenBranchId) => {
    const branch = branches.find((b) => String(b.id) === String(chosenBranchId));
    const enrolled = await enablePinSignIn({
      branchId: Number(chosenBranchId),
      label: label.trim() || undefined,
      terminalId: localStorage.getItem(`billbull:pos:terminal_id:${chosenBranchId}`) || undefined,
    }, token);
    if (!savePinDevice({ ...enrolled, branchName: enrolled.branchName || branch?.name })) {
      throw new Error('This computer blocked local storage, so PIN sign-in can’t be set up here.');
    }
    onDone();
  };

  const submitCredentials = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Enter the manager’s username and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const login = await managerCredentialCheck(username, password);
      const reachable = (await fetchBranchesFor(login.token)) || [];
      const list = Array.isArray(reachable) ? reachable : reachable.content || [];
      const home = list.find((b) => b.id === login.branchId);
      if (list.length > 1) {
        setBranches(list);
        setBranchId(String(home?.id ?? list[0].id));
        setManagerToken(login.token);
        setStep('branch');
      } else if (list.length === 1 || login.branchId) {
        setBranches(list);
        await enroll(login.token, list[0]?.id ?? login.branchId);
      } else {
        setError('This account has no branch to set the till up for.');
      }
    } catch (err) {
      setError(err?.response?.status === 403
        ? 'Only an admin or branch admin can set up PIN sign-in.'
        : describeTillLoginError(err));
    } finally {
      setPassword('');
      setBusy(false);
    }
  };

  const submitBranch = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await enroll(managerToken, branchId);
    } catch (err) {
      setError(err?.response?.status === 403
        ? 'Only an admin or branch admin can set up PIN sign-in for that branch.'
        : err?.response?.data?.message || err?.message || 'Couldn’t set up PIN sign-in.');
    } finally {
      setBusy(false);
    }
  };

  const primary = `flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#F5C742] text-base font-bold text-[#1A1A1A] shadow-sm transition hover:bg-[#E5B732] disabled:opacity-50 ${touch} ${focusRing}`;

  if (step === 'intro') {
    return (
      <div className="mt-5 space-y-4">
        <div className="flex gap-3 rounded-xl border border-[#FDE6A9] bg-[#FFF8E7] p-4">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-[#8a6a10]" />
          <div className="text-sm text-[#5c4a14]">
            <p className="font-semibold">Set up PIN sign-in on this till</p>
            <p className="mt-1">A manager does this once. After that, staff tap their name and enter their PIN.</p>
          </div>
        </div>
        <button type="button" autoFocus onClick={() => setStep('credentials')} className={primary}>
          Set up with manager sign-in <ArrowRight size={20} />
        </button>
      </div>
    );
  }

  if (step === 'branch') {
    return (
      <form onSubmit={submitBranch} className="mt-5 space-y-4">
        <label className="block space-y-1.5">
          <span className="block text-sm font-medium text-[#333333]">Which branch is this till in?</span>
          <select autoFocus value={branchId} onChange={(e) => setBranchId(e.target.value)}
            className="h-12 w-full rounded-lg border border-[#E3E1DA] bg-[#FBFAF7] px-3 text-base focus:border-[#1C2838] focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40">
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ''}</option>)}
          </select>
        </label>
        {error && <ErrorBox>{error}</ErrorBox>}
        <button type="submit" disabled={busy} className={primary}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound size={18} />} Turn on PIN sign-in
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitCredentials} className="mt-5 space-y-4">
      <p className="text-sm text-[#66737F]">Manager or admin credentials. They’re only used to set up this till — no one is signed in.</p>
      <label className="block space-y-1.5">
        <span className="block text-sm font-medium text-[#333333]">Manager username or email</span>
        <div className="relative">
          <User size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input autoFocus autoComplete="off" value={username} onChange={(e) => { setUsername(e.target.value); setError(''); }} className={inputCls} />
        </div>
      </label>
      <label className="block space-y-1.5">
        <span className="block text-sm font-medium text-[#333333]">Password</span>
        <div className="relative">
          <Lock size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="password" autoComplete="off" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} className={inputCls} />
        </div>
      </label>
      <label className="block space-y-1.5">
        <span className="block text-sm font-medium text-[#333333]">Till name <span className="font-normal text-[#8A939C]">(optional)</span></span>
        <input value={label} maxLength={100} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Front counter" className={`${inputCls} pl-4`} />
      </label>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex gap-2">
        <button type="button" onClick={() => { setStep('intro'); setError(''); }}
          className={`h-12 rounded-lg border border-[#E3E1DA] px-4 text-sm font-medium text-[#66737F] hover:bg-[#F3F1EC] ${touch} ${focusRing}`}>
          Back
        </button>
        <button type="submit" disabled={busy} className={primary}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound size={18} />} Turn on PIN sign-in
        </button>
      </div>
    </form>
  );
}
