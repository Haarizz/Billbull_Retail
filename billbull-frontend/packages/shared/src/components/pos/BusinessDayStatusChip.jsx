import React, { useEffect, useRef, useState } from 'react';
import { Clock, Info } from 'lucide-react';
import { formatCountdown, useBusinessDayStatus } from './BusinessDayStatusContext';

/**
 * Compact Business Day indicator for the POS header, sitting beside the session
 * block.
 *
 * It replaced a full-width banner above the till: that bar consumed a row of
 * vertical space and, more importantly, forced a horizontal minimum on a screen
 * whose product grid and cart already compete for width. The chip is
 * width-elastic instead — the times drop out below `xl`, leaving the coloured dot
 * and the phase, and the full detail stays one hover/click away in the popover.
 *
 * All numbers come from `BusinessDayStatusProvider`; nothing here recomputes the
 * phase or the countdown.
 */

/**
 * The dot carries the phase colour; the chip body stays neutral. A fully tinted
 * pill reads as an alert and competes with the Configure button and the cart —
 * this is a standing status line, visible for the whole trading day, so it earns
 * only as much weight as the session text beside it.
 */
const PHASE_STYLES = {
  ACTIVE: { label: 'Active', dot: 'bg-emerald-500', text: 'text-gray-500' },
  EXTENSION: { label: 'Extension', dot: 'bg-amber-500', text: 'text-amber-700' },
  CLOSED: { label: 'Closed', dot: 'bg-red-500', text: 'text-red-700' },
};

/**
 * The current Business Day wall-clock time, derived from a boundary the server sent
 * and the countdown that is already ticking toward it — `boundary - remaining`.
 *
 * Deliberately string arithmetic on the naive "…T23:00:00" the backend sends, never
 * `new Date(...)`: parsing that string into a Date would attach the *device*
 * timezone and reintroduce exactly the confusion this row exists to remove. It also
 * needs no timer and no second poll — it moves because the shared countdown moves,
 * so it cannot drift away from the number displayed beside it.
 */
function businessDayNowFrom(boundaryIso, secondsRemaining) {
  if (!boundaryIso || secondsRemaining == null || secondsRemaining < 0) return null;
  const timePart = String(boundaryIso).split('T')[1];
  if (!timePart) return null;
  const [h, m, s] = timePart.split(':');
  const boundarySeconds = Number(h) * 3600 + Number(m) * 60 + Math.floor(Number(s) || 0);
  const DAY = 24 * 3600;
  const nowSeconds = ((boundarySeconds - Math.floor(secondsRemaining)) % DAY + DAY) % DAY;
  return [Math.floor(nowSeconds / 3600), Math.floor((nowSeconds % 3600) / 60), nowSeconds % 60]
    .map((n) => String(n).padStart(2, '0')).join(':');
}

/** The device's own wall clock, in the same HH:MM:SS shape, for comparison only. */
function deviceWallClock() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0')).join(':');
}

export default function BusinessDayStatusChip() {
  const day = useBusinessDayStatus();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Click-outside closes the popover; hover opens it, so a stray click elsewhere
  // must not leave it pinned open.
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (!day || !day.enforced) return null;

  const { businessDay, phase, scheduledEndTime, closureTime, nextStartTime, secondsUntilClosure, secondsUntilNextStart } = day;
  const style = PHASE_STYLES[phase];
  if (!style) return null;

  const countdown = phase === 'CLOSED'
    ? formatCountdown(secondsUntilNextStart)
    : formatCountdown(secondsUntilClosure);

  // The till's own clock (the "8/10/2026 • 10:38:47 PM" beside this chip) is the
  // *device* timezone, while every Business Day time here is the configured
  // Business Day timezone. A terminal in IST reading a Dubai schedule sees the two
  // sit 1h30m apart and the countdown looks wrong when it is exactly right, so the
  // Business Day's own clock is shown alongside its zone.
  const businessNow = businessDayNowFrom(businessDay?.closureAt, secondsUntilClosure)
    ?? businessDayNowFrom(businessDay?.nextWindowStart, secondsUntilNextStart);
  // Compared at minute granularity: a few seconds of ordinary clock skew is not
  // worth flagging, a timezone offset always is.
  const deviceOffsetMismatch = Boolean(businessNow) && businessNow.slice(0, 5) !== deviceWallClock().slice(0, 5);

  return (
    <div
      ref={wrapRef}
      className="relative shrink min-w-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Business Day status"
        className={`flex items-center gap-1.5 max-w-full rounded-md border border-gray-200 bg-gray-50/70 px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-gray-100 hover:border-gray-300 ${style.text}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
        <Clock className="h-3 w-3 shrink-0 opacity-60" />
        {/* Secondary text is the first thing to go when the header runs out of
            room — the dot, phase and info affordance always survive. */}
        <span className="hidden xl:inline truncate">
          Ends {scheduledEndTime}
          {businessDay?.extensionMinutes > 0 && closureTime ? ` · Ext ${closureTime}` : ''}
        </span>
        <span className="hidden sm:inline xl:hidden truncate">{style.label}</span>
        <Info className="h-3 w-3 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-60 rounded-lg border border-gray-200 bg-white shadow-md shadow-slate-900/5 p-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
            <p className="text-[11px] font-bold text-[#1E293B]">Business Day Status</p>
            <span className="ml-auto text-[10px] font-semibold text-gray-400">{style.label}</span>
          </div>

          <div className="rounded-md bg-slate-50 divide-y divide-slate-200/60">
            <Row label="Scheduled End Time" value={scheduledEndTime || '—'} />
            <Row label="Business Day Closes" value={closureTime || '—'} />
            {phase === 'CLOSED' ? (
              <Row label="Next Day Starts" value={nextStartTime || '—'} />
            ) : (
              <Row
                label={phase === 'EXTENSION' ? 'Extension Remaining' : 'Time Remaining'}
                value={countdown || '00:00:00'}
                emphasise
              />
            )}
            {phase === 'CLOSED' && secondsUntilNextStart > 0 && (
              <Row label="Starts In" value={countdown || '00:00:00'} emphasise />
            )}
            {businessNow && (
              <Row label="Business Day Time" value={businessNow} />
            )}
            {businessDay?.tradingDate && (
              <Row label="Trading Date" value={businessDay.tradingDate} />
            )}
          </div>

          {/* Only shown when the two clocks actually disagree, so a same-timezone
              terminal — the common case — never carries the extra line. */}
          {deviceOffsetMismatch && (
            <p className="text-[10px] text-gray-400 mt-1.5 leading-snug">
              All times {businessDay?.timezone ? `in ${businessDay.timezone}` : 'in the Business Day timezone'} —
              this terminal&apos;s clock reads {deviceWallClock().slice(0, 5)}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, emphasise = false }) {
  return (
    <div className="flex justify-between items-center px-2.5 py-1.5 gap-3">
      <span className="text-[11px] text-gray-500">{label}</span>
      <span className={emphasise
        ? 'text-[11px] font-bold tabular-nums text-[#1E293B]'
        : 'text-[11px] font-semibold text-[#1E293B]'}>
        {value}
      </span>
    </div>
  );
}
