import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Delete, KeyRound, Loader2, Lock, Search, User } from 'lucide-react';
import { enablePinSignIn, fetchBranchesFor, managerCredentialCheck } from '@billbull/shared/api/posPinApi';
import { getImageUrl } from '@billbull/shared/utils/urlUtils';
import { describeTillLoginError, savePinDevice } from './pinDevice';
import { avatarColor, filterStaff, layoutFor, recentPeople, roleChips } from './staffDirectory';

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

// Photo when the employee has one (and it loads), otherwise their initials on a colour that is
// fixed per employee, so look-alike initials still read differently.
export function Avatar({ person, size = 'h-12 w-12 text-base' }) {
  const [broken, setBroken] = useState(false);
  const color = avatarColor(person?.employeeId);
  const src = person?.avatarUrl && !broken ? getImageUrl(person.avatarUrl) : '';
  const initials = person?.initials || '?';
  return (
    <span aria-hidden data-initials={initials}
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold tracking-tight ${size}`}
      style={{ background: color.bg, color: color.fg }}>
      {src ? <img src={src} alt="" draggable={false} onError={() => setBroken(true)} className="h-full w-full object-cover" /> : initials}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Who's signing in
// ---------------------------------------------------------------------------

const PAGE = 40; // directory rows rendered per step; more appear as the list scrolls
const COLUMNS = { tiles: 3, cards: 2, directory: 1 };

// Tallest the list gets on a big screen. On a smaller one useFitToScreen trims it further.
const LIST_HEIGHT = {
  tiles: 'max-h-88',
  cards: 'max-h-104',
  directory: 'max-h-112',
};
const LIST_FLOOR_PX = 144; // never shorter than this: below it, the page scrolls instead

/**
 * Keeps the sign-in screen inside the viewport by shortening the staff list (the one part that
 * scrolls on its own) by however much the screen overflows. Re-fits when the window or the
 * receipt changes size, e.g. when the receipt widens or the list is filtered.
 */
function useFitToScreen(listRef, deps) {
  useLayoutEffect(() => {
    const list = listRef.current;
    const screen = list?.closest('main');
    if (!list || !screen) return undefined;
    let frame = 0;
    const fit = () => {
      list.style.maxHeight = ''; // back to the CSS cap, then measure
      const overflow = screen.scrollHeight - screen.clientHeight;
      if (overflow > 0) list.style.maxHeight = `${Math.max(LIST_FLOOR_PX, list.clientHeight - overflow)}px`;
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    fit();
    window.addEventListener('resize', schedule);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    if (observer && screen.firstElementChild) {
      // The receipt column: it changes size when the receipt widens or the content above the list changes.
      [...screen.children].forEach((child) => observer.observe(child));
    }
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
      list.style.maxHeight = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

const formatOpenedAt = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return date.toDateString() === new Date().toDateString()
    ? `since ${time}`
    : `since ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
};

const detailLine = (person) => [person.role, person.employeeCode].filter(Boolean).join(' · ');

const sectionLabel = 'font-mono text-[11px] uppercase tracking-[0.2em] text-[#8A939C]';
// A single row that swipes sideways when it doesn't fit, without a scrollbar eating height.
const oneLine = '-mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/**
 * The name picker. Picking someone only opens their PIN pad; nothing here signs anyone in.
 *
 * layout (see staffDirectory.layoutFor): 'tiles' up to 8 people, 'cards' up to 24, then a
 * search-first 'directory'. Above the list: whose drawer is open on this till, then the last few
 * people who signed in here (both only while not searching or filtering).
 */
export function StaffPicker({ staff, layout = layoutFor(staff.length), openSession = null, recentIds = [], onPick }) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [limit, setLimit] = useState(PAGE);
  const tileRefs = useRef([]);
  const searchRef = useRef(null);
  const openRef = useRef(null);
  const listRef = useRef(null);

  const searchable = layout !== 'tiles';
  const columns = COLUMNS[layout];
  const chips = useMemo(() => (searchable ? roleChips(staff) : []), [searchable, staff]);
  const shown = useMemo(() => filterStaff(staff, { query, role }), [staff, query, role]);
  const visible = layout === 'directory' ? shown.slice(0, limit) : shown;
  const browsing = !query.trim() && role === 'all';

  const openPerson = openSession
    ? staff.find((p) => String(p.employeeId) === String(openSession.employeeId)) || null
    : null;
  // Tiles already show everyone, so recent people are tagged on their tile instead of getting a
  // row of their own (which would push the tiles off a short screen).
  const recentList = recentPeople(staff, recentIds, openPerson?.employeeId);
  const recent = browsing && layout !== 'tiles' ? recentList : [];
  const recentTagged = layout === 'tiles' ? new Set(recentList.map((p) => String(p.employeeId))) : null;

  // A new search or filter starts at the top of a short list again.
  useEffect(() => {
    setLimit(PAGE);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query, role]);

  // Keyboard users land on something useful straight away.
  useEffect(() => {
    if (searchable) searchRef.current?.focus();
    else if (openRef.current) openRef.current.focus();
    else tileRefs.current[0]?.focus();
  }, [searchable]);

  const focusTile = (index) => {
    const clamped = Math.max(0, Math.min(visible.length - 1, index));
    tileRefs.current[clamped]?.focus();
  };

  const onTileKey = (e, index) => {
    const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };
    if (moves[e.key] !== undefined) {
      e.preventDefault();
      if (e.key === 'ArrowUp' && index < columns && searchable) searchRef.current?.focus();
      else focusTile(index + moves[e.key]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusTile(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusTile(visible.length - 1);
    } else if (e.key.length === 1 && /\p{L}|\p{N}/u.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (searchable) {
        // Typing on a card carries on in the search box.
        e.preventDefault();
        setQuery((q) => q + e.key);
        searchRef.current?.focus();
        return;
      }
      // Type-ahead: jump to the next name starting with that letter.
      const letter = e.key.toLowerCase();
      const order = [...visible.keys()].map((i) => (index + 1 + i) % visible.length);
      const next = order.find((i) => visible[i].name.toLowerCase().startsWith(letter));
      if (next !== undefined) {
        e.preventDefault();
        focusTile(next);
      }
    }
  };

  const onSearchKey = (e) => {
    if (e.key === 'ArrowDown' && visible.length) {
      e.preventDefault();
      focusTile(0);
    } else if (e.key === 'Enter') {
      // Only an unambiguous match opens a PIN pad: a stray Enter (or a scanner's suffix) can't
      // land on whoever happens to be first.
      e.preventDefault();
      if (query.trim() && shown.length === 1) onPick(shown[0]);
    } else if (e.key === 'Escape' && query) {
      e.preventDefault();
      setQuery('');
    }
  };

  const onListScroll = (e) => {
    if (layout !== 'directory' || limit >= shown.length) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 160) setLimit((n) => n + PAGE);
  };

  const tileCls = `flex min-h-30 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-[#E3E1DA] bg-[#FBFAF7] px-2 py-3 transition active:scale-[0.97] active:bg-white ${touch} ${focusRing} focus-visible:border-[#1C2838]`;
  const cardCls = (dense) => `flex w-full items-center gap-3 rounded-xl border-2 border-[#E3E1DA] bg-[#FBFAF7] text-left transition active:scale-[0.98] active:bg-white ${dense ? 'min-h-[56px] px-3 py-2' : 'min-h-[64px] px-3 py-2.5'} ${touch} ${focusRing} focus-visible:border-[#1C2838]`;

  const renderPerson = (person, index) => {
    const ref = (el) => { tileRefs.current[index] = el; };
    const detail = detailLine(person);
    if (layout === 'tiles') {
      const isRecent = recentTagged?.has(String(person.employeeId));
      return (
        <button type="button" ref={ref} onClick={() => onPick(person)} onKeyDown={(e) => onTileKey(e, index)} className={tileCls}>
          <span className="relative">
            <Avatar person={person} />
            {isRecent && (
              <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-[#F5C742] px-1.5 font-mono text-[9px] font-bold uppercase leading-[14px] tracking-wider text-[#1C2838] ring-2 ring-[#FBFAF7]">
                Recent
              </span>
            )}
          </span>
          <span className="w-full truncate text-center text-sm font-semibold text-[#1C2838]" title={person.name}>{person.name}</span>
          {(person.role || person.employeeCode) && (
            <span className="flex w-full flex-col items-center text-[11px] leading-tight text-[#66737F]" title={detail}>
              {person.role && <span className="w-full truncate text-center">{person.role}</span>}
              {person.employeeCode && <span className="w-full truncate text-center font-mono text-[10px] text-[#8A939C]">{person.employeeCode}</span>}
            </span>
          )}
        </button>
      );
    }
    const dense = layout === 'directory';
    return (
      <button type="button" ref={ref} onClick={() => onPick(person)} onKeyDown={(e) => onTileKey(e, index)} className={cardCls(dense)}>
        <Avatar person={person} size={dense ? 'h-9 w-9 text-xs' : 'h-10 w-10 text-sm'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[#1C2838]" title={person.name}>{person.name}</span>
          {detail && <span className="block truncate text-xs text-[#66737F]" title={detail}>{detail}</span>}
        </span>
      </button>
    );
  };

  const gridCls = layout === 'tiles' ? 'grid-cols-3 gap-2.5'
    : layout === 'cards' ? 'grid-cols-1 gap-2 sm:grid-cols-2' : 'grid-cols-1 gap-1.5';

  const showOpen = Boolean(openPerson && browsing);

  useFitToScreen(listRef, [layout, visible.length, showOpen, recent.length, query, role]);

  return (
    <div className="mt-5 flex flex-col gap-3 short:mt-3">
      {showOpen && (
        <button type="button" ref={openRef} onClick={() => onPick(openPerson)} aria-label={`Continue as ${openPerson.name}`}
          className={`flex w-full items-center gap-3 rounded-xl border-2 border-[#F5C742] bg-[#FFF8E7] px-3 py-2.5 text-left transition active:scale-[0.98] ${touch} ${focusRing}`}>
          <Avatar person={openPerson} size="h-10 w-10 text-sm" />
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a6a10]">Till open on this PC</span>
            <span className="block truncate text-sm font-semibold text-[#1C2838]">{openPerson.name}</span>
            <span className="block truncate text-xs text-[#66737F]">
              {[formatOpenedAt(openSession.openedAt), openSession.counterName].filter(Boolean).join(' · ') || 'Drawer still open'}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 rounded-lg bg-[#F5C742] px-3 py-2 text-sm font-bold text-[#1A1A1A]">
            Continue <ArrowRight size={16} />
          </span>
        </button>
      )}

      {searchable && (
        <div className="space-y-2.5">
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input ref={searchRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey}
              placeholder="Search name or employee ID" aria-label="Search name or employee ID" autoComplete="off" spellCheck={false}
              enterKeyHint="search" className={inputCls} />
          </div>
          {chips.length > 2 && (
            <div role="group" aria-label="Filter by role" className={oneLine}>
              {chips.map((chip) => {
                const active = role === chip.key;
                return (
                  <button key={chip.key} type="button" aria-pressed={active} onClick={() => setRole(active && chip.key !== 'all' ? 'all' : chip.key)}
                    className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${touch} ${focusRing} ${active ? 'border-[#1C2838] bg-[#1C2838] text-white' : 'border-[#E3E1DA] bg-white text-[#1C2838] hover:border-[#CFCBC0]'}`}>
                    {chip.label}
                    <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? 'bg-white/15 text-[#F5C742]' : 'bg-[#F3F1EC] text-[#66737F]'}`}>{chip.count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {recent.length > 0 && (
        <section aria-label="Recent on this till">
          <h2 className={`${sectionLabel} mb-1.5`}>Recent on this till</h2>
          <div className={oneLine}>
            {recent.map((person) => (
              <button key={person.employeeId} type="button" onClick={() => onPick(person)}
                className={`flex h-11 shrink-0 items-center gap-2 rounded-full border-2 border-[#E3E1DA] bg-white py-1 pl-1 pr-3.5 transition active:scale-[0.97] ${touch} ${focusRing}`}>
                <Avatar person={person} size="h-8 w-8 text-[11px]" />
                <span className="max-w-36 truncate text-sm font-semibold text-[#1C2838]">{person.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col">
        {searchable && (recent.length > 0 || openPerson) && browsing && <h2 className={`${sectionLabel} mb-1.5`}>Everyone</h2>}
        {searchable && <p className="sr-only" role="status" aria-live="polite">{shown.length === 1 ? '1 person' : `${shown.length} people`}</p>}
        <ul ref={listRef} role="list" aria-label="Staff" onScroll={onListScroll}
          className={`grid content-start overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin] ${gridCls} ${LIST_HEIGHT[layout]}`}>
          {visible.map((person, index) => <li key={person.employeeId}>{renderPerson(person, index)}</li>)}
          {layout === 'directory' && shown.length > visible.length && (
            // Inside the scroll area, so it costs no height; scrolling near it loads more anyway.
            <li role="none">
              <button type="button" onClick={() => setLimit((n) => n + PAGE)} className={`${linkCls} w-full justify-center`}>
                Show more ({shown.length - visible.length} more)
              </button>
            </li>
          )}
        </ul>
        {shown.length === 0 && (
          <div className="py-4 text-center text-sm text-[#66737F]">
            <p>No one matches{query.trim() ? ` “${query.trim()}”` : ''}{role !== 'all' ? ` in ${chips.find((c) => c.key === role)?.label || 'this role'}` : ''}.</p>
            <button type="button" onClick={() => { setQuery(''); setRole('all'); searchRef.current?.focus(); }} className={linkCls}>
              Show everyone
            </button>
          </div>
        )}
      </div>
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
        <Avatar person={person} size="h-10 w-10 text-sm" />
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
