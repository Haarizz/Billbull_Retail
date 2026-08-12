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
 *
 * Three distinct states share the CLOSED phase and must not be conflated. Each
 * one carries its own next step — the operator must never reach a state with no
 * action, because the post-trading workflow (close sessions → X-Reports → Day
 * Close → Z-Report) is only recoverable if every intermediate state is actionable
 * on re-entry. All three are decided from backend fields, so a terminal that
 * arrives late, refreshes, or comes back via browser Back sees the true state.
 *
 * - **Trading Period Ended** — the window has closed but sessions from that
 *   Trading Date are still open. Selling is blocked; closing those sessions,
 *   their X-Reports and the Day Close are not, and none of it waits for the next
 *   window. Every session in `sessionsRequiringClosure` gets its own action, for
 *   every terminal — the list is backend-derived, so all tills see the same one.
 * - **Day Close Required** (`dayCloseRequired`) — sessions are all closed but the
 *   Business Day is not finalized. Offers "Open Day Close", which hands off to the
 *   *existing* Day Close/Z-Report workflow; this overlay implements none of it and
 *   bypasses none of its validations.
 * - **Awaiting next Business Day** — nothing left open on that date and no Day
 *   Close outstanding; the screen is purely informational until trading resumes.
 *
 * `closureFlowActive` is what keeps this overlay from sitting on top of the
 * closure dialogs it just launched: the parent owns the closure flow, and while
 * that flow is up this blocking layer renders nothing at all.
 */
export default function BusinessDayStatusBanner({
  openSession,
  currentTerminalId,
  onCloseSession,
  onOpenDayClose,
  closureFlowActive = false,
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
    sessionsRequiringClosure, dayCloseRequired, pendingDayCloseDate,
  } = day;

  // ── CLOSED — blocking ────────────────────────────────────────────────────
  // Suppressed outright while a closure flow is up: this overlay must never
  // cover the denomination/session-close dialogs the operator was sent to.
  if (phase === 'CLOSED' && !closureFlowActive) {
    const pendingClosure = sessionsRequiringClosure.length > 0;
    // Backend-decided and mutually exclusive with pendingClosure — see the
    // dayCloseRequired javadoc on DayStatusResponse.
    const dayClosePending = !pendingClosure && dayCloseRequired;
    const title = pendingClosure
      ? 'Trading Period Ended'
      : dayClosePending ? 'Day Close Required' : 'Business Day Closed';
    return (
      <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-7">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center">
              <Lock className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1E293B]">{title}</h2>
              <p className="text-xs text-gray-500">Trading Date {businessDay.tradingDate}</p>
            </div>
          </div>

          {pendingClosure ? (
            <>
              <p className="text-sm text-[#1E293B] mb-1">
                Trading for Business Date {businessDay.tradingDate} has ended.
              </p>
              <p className="text-sm text-gray-600 mb-4">
                {sessionsRequiringClosure.length === 1 ? 'This session is' : 'These sessions are'} still
                open and must be closed before the Business Day can be finalized.
              </p>
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 mb-5">
                {sessionsRequiringClosure.map((s) => {
                  // Visual indicator only — every terminal sees, and may act on,
                  // every open session, subject to the existing closure
                  // authorization the close flow itself enforces.
                  const isThisTerminal = (currentTerminalId && s.terminalId === currentTerminalId)
                    || openSession?.id === s.sessionId;
                  return (
                    <div key={s.sessionId} className="px-4 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#1E293B]">
                          Session #{s.sessionId}
                          {isThisTerminal && (
                            <span className="ml-2 text-[10px] font-semibold text-[#b8920e] bg-[#FFF8E7] border border-[#FDE6A9] px-2 py-0.5 rounded">
                              This terminal
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-gray-500 truncate">
                          {s.terminalName || s.terminalId}{s.openedBy ? ` — ${s.openedBy}` : ''}
                        </p>
                      </div>
                      {onCloseSession && (
                        <button
                          type="button"
                          onClick={() => onCloseSession(s)}
                          className="shrink-0 bg-[#F5C742] hover:bg-[#e6b73a] text-[#1E293B] font-semibold text-xs rounded-lg px-3 py-1.5 transition-colors"
                        >
                          Close Session
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : dayClosePending ? (
            <>
              <p className="text-sm text-[#1E293B] mb-1">
                Trading for Business Date {businessDay.tradingDate} has ended.
              </p>
              <p className="text-sm text-gray-600 mb-5">
                All POS sessions have been closed, but the Business Day still needs to be finalized.
              </p>
              {/* Hands off to the existing Z-Report / Day Close view — this button
                  navigates, it does not close anything. The overlay stands down as
                  the parent enters the closure flow, so Day Close never opens
                  underneath this blocking layer. */}
              {onOpenDayClose && (
                <button
                  type="button"
                  onClick={() => onOpenDayClose(pendingDayCloseDate || businessDay.tradingDate)}
                  className="w-full bg-[#F5C742] hover:bg-[#e6b73a] text-[#1E293B] font-semibold text-sm rounded-xl py-2.5 mb-3 transition-colors"
                >
                  Open Z-Report
                </button>
              )}
              <p className="text-sm text-gray-600 mb-4">
                Day Close can be completed now. It does not require waiting until the next
                Business Day.
              </p>
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
          {pendingClosure && (
            <p className="text-sm text-gray-600 mb-4">
              Close each session (cash declaration and X-Report), then complete the Day Close and
              Z-Report. None of this waits for the next Business Day.
            </p>
          )}

          <div className="rounded-xl bg-slate-50 px-4 py-3 mb-5">
            <p className="text-xs text-slate-600">
              Next Business Day starts at <span className="font-semibold text-[#1E293B]">{nextStartTime}</span>
              {secondsUntilNextStart > 0 && (
                <> — in <span className="font-semibold tabular-nums">{formatCountdown(secondsUntilNextStart)}</span></>
              )}.
            </p>
          </div>

          <p className="text-[11px] text-gray-400 text-center">
            The trading period cannot be extended once it has ended. New sales resume at the next scheduled start time;
            session closure, X-Reports and Day Close remain available now.
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
