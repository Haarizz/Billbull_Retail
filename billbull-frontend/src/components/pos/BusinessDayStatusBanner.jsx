import React, { useEffect, useRef, useState } from 'react';
import { Clock, Lock } from 'lucide-react';
import { formatCountdown, useBusinessDayStatus } from './BusinessDayStatusContext';

/**
 * Business Day *overlays* for the POS: the once-per-day "scheduled end reached"
 * announcement and the blocking closed screen.
 *
 * The in-flow status text this component used to render (the "approaching end"
 * hint and the standing extension warning) now lives in the header as
 * `BusinessDayStatusChip` — a full-width bar above the till cost horizontal room
 * the POS layout needs. Phase, times and countdown all come from
 * `BusinessDayStatusProvider`; nothing here recomputes them.
 *
 * The closed screen is not an error page. Closure is scheduled and expected: it
 * tells the operator when trading resumes and what closure work remains, rather
 * than reading like a failure. Closure is final — there is no affordance here to
 * extend or reopen the Business Day.
 */
export default function BusinessDayStatusBanner({
  openSession,
  onCloseSession,
  onPhaseChange,
}) {
  const day = useBusinessDayStatus();
  const [endTimeNoticeOpen, setEndTimeNoticeOpen] = useState(false);
  // Which Business Day we have already announced the scheduled end for, so the
  // notice appears once per Business Day rather than on every 60s poll.
  const announcedEndForRef = useRef(null);

  const businessDay = day?.businessDay;
  const phase = day?.phase;

  useEffect(() => {
    if (phase) onPhaseChange?.(phase, businessDay);
  }, [phase, businessDay, onPhaseChange]);

  // Announce the scheduled end once, when this Business Day first enters its
  // extension. Keyed on the Trading Date rather than on a phase transition so a
  // terminal that was switched on mid-extension still gets told, and one left on
  // all evening is not told twice.
  useEffect(() => {
    if (phase !== 'EXTENSION') return;
    const tradingDate = businessDay?.tradingDate;
    if (!tradingDate || announcedEndForRef.current === tradingDate) return;
    announcedEndForRef.current = tradingDate;
    setEndTimeNoticeOpen(true);
  }, [phase, businessDay?.tradingDate]);

  if (!day || !day.enforced) return null;

  const {
    secondsUntilClosure, secondsUntilNextStart,
    scheduledEndTime, closureTime, nextStartTime,
    sessionsRequiringClosure,
  } = day;

  // ── CLOSED — blocking ────────────────────────────────────────────────────
  if (phase === 'CLOSED') {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-7">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center">
              <Lock className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1E293B]">Business Day Closed</h2>
              <p className="text-xs text-gray-500">Trading Date {businessDay.tradingDate}</p>
            </div>
          </div>

          {sessionsRequiringClosure.length > 0 ? (
            <>
              <p className="text-sm text-[#1E293B] mb-1">The extension period has ended.</p>
              <p className="text-sm text-gray-600 mb-4">
                {sessionsRequiringClosure.length === 1 ? 'This session belongs' : 'These sessions belong'} to
                the closed Business Day. Please close {sessionsRequiringClosure.length === 1 ? 'it' : 'them'} before continuing.
              </p>
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 mb-5">
                {sessionsRequiringClosure.map((s) => (
                  <div key={s.sessionId} className="px-4 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-[#1E293B]">Session #{s.sessionId}</p>
                      <p className="text-[10px] text-gray-500">
                        {s.terminalName || s.terminalId}{s.openedBy ? ` — ${s.openedBy}` : ''}
                      </p>
                    </div>
                    {openSession?.id === s.sessionId && (
                      <span className="text-[10px] font-semibold text-[#b8920e] bg-[#FFF8E7] border border-[#FDE6A9] px-2 py-0.5 rounded">
                        This terminal
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-600 mb-4">
              The extension period has ended. The current Business Day ended at {closureTime}.
              No new POS sessions can be opened during this period.
            </p>
          )}

          {/* Business Day closure and Day Close are separate steps: closure stops
              trading, Day Close formally closes the day and is never automatic.
              Both are named so the operator knows work remains. */}
          <p className="text-sm text-gray-600 mb-4">
            Please complete the required session closure and Day Close process.
          </p>

          <div className="rounded-xl bg-slate-50 px-4 py-3 mb-5">
            <p className="text-xs text-slate-600">
              Next Business Day starts at <span className="font-semibold text-[#1E293B]">{nextStartTime}</span>
              {secondsUntilNextStart > 0 && (
                <> — in <span className="font-semibold tabular-nums">{formatCountdown(secondsUntilNextStart)}</span></>
              )}.
            </p>
          </div>

          <div className="flex gap-2">
            {openSession && onCloseSession && (
              <button
                type="button"
                onClick={onCloseSession}
                className="flex-1 bg-[#F5C742] hover:bg-[#e6b73a] text-[#1E293B] font-semibold text-sm rounded-xl py-2.5 transition-colors"
              >
                Close Session
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-400 text-center mt-3">
            The Business Day cannot be extended once it has closed. Trading resumes at the next scheduled start time.
          </p>
        </div>
      </div>
    );
  }

  // ── EXTENSION — announced once, then the header chip carries it ──────────
  if (phase === 'EXTENSION' && endTimeNoticeOpen) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-7 text-center">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <h2 className="text-base font-bold text-[#1E293B] mb-1">Scheduled Business Day End Time Reached</h2>
          <p className="text-xs text-gray-500 mb-5">
            Trading continues during the extension period. The Business Day closes when it expires.
          </p>

          <div className="rounded-xl bg-slate-50 divide-y divide-slate-200/70 text-left mb-5">
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-[11px] text-gray-500">Scheduled End Time</span>
              <span className="text-[11px] font-semibold text-[#1E293B]">{scheduledEndTime}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-[11px] text-gray-500">Business Day Closure Time</span>
              <span className="text-[11px] font-semibold text-[#1E293B]">{closureTime}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-[11px] text-gray-500">Extension Remaining</span>
              <span className="text-sm font-bold tabular-nums text-amber-700">
                {formatCountdown(secondsUntilClosure) || '00:00:00'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setEndTimeNoticeOpen(false)}
            className="w-full bg-[#F5C742] hover:bg-[#e6b73a] text-[#1E293B] font-semibold text-sm rounded-xl py-2.5 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return null;
}
