package com.billbull.backend.pos.businessdate;

import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Optional;

/**
 * Decides whether an <b>already existing</b> session may keep being used for normal
 * POS work — the "Continue / Resume Session" counterpart to
 * {@link BusinessDayCheckoutGate} (which gates selling) and to the Start Session
 * Business Day gate in {@code PosSessionService#openSession} (which gates opening).
 *
 * <h2>Why this exists</h2>
 * Blocking Start Session alone left a hole: a terminal whose session was still OPEN
 * from a Business Day that has since closed could simply "Continue Session" and go
 * on trading, while the terminal next to it — with no session — was correctly told
 * "Previous Day Not Closed". The rule has to be a property of the <i>Business Day</i>,
 * not of whether a session record happens to exist, so it is asked here in exactly
 * one place and reused by every continuation entry point.
 *
 * <h2>Source of truth</h2>
 * The Candidate Business Day comes from {@link BusinessDayWindowService} — the same
 * {@code BusinessDayResolver}/{@code BusinessDayWindow} pipeline
 * {@code openSession} resolves its {@code candidateBusinessDay} from. No Trading Date
 * arithmetic, timezone handling, or window/extension logic is duplicated here: this
 * class only compares two already-resolved {@link LocalDate}s.
 *
 * <p>A session belongs to a previous Business Day when its own Trading Date is
 * strictly before the Candidate Business Day. Equal (today's own in-progress day,
 * including an overnight window that has rolled past midnight) is allowed, which is
 * the same strict {@code isBefore} comparison the Start Session gate makes.
 */
@Service
public class BusinessDayContinuationGate {

    private final BusinessDayWindowService windowService;

    public BusinessDayContinuationGate(BusinessDayWindowService windowService) {
        this.windowService = windowService;
    }

    /**
     * Throws {@link PreviousBusinessDaySessionException} when {@code session} belongs
     * to a Business Day earlier than the branch's current one. Returns normally in
     * every other case — including a session on the current Business Day, a CLOSED
     * session (reading/closing one must always stay possible), and any session whose
     * branch or Business Day cannot be determined.
     */
    @Transactional(readOnly = true)
    public void assertMayContinue(PosSession session) {
        evaluate(session).ifPresent(blocked -> {
            throw PreviousBusinessDaySessionException.of(session, blocked);
        });
    }

    /**
     * Non-throwing form for read-only callers (the {@code day-status} payload): the
     * session's Business Day when it is a previous one, otherwise empty.
     */
    @Transactional(readOnly = true)
    public Optional<LocalDate> evaluate(PosSession session) {
        if (session == null || session.getBranchId() == null) return Optional.empty();

        // Only a session that can still be *used* can be blocked. A CLOSED session is
        // exactly what the operator is being pushed toward, and its X-Report/Day Close
        // work must never be gated by this rule.
        PosSessionStatus status = session.getStatus();
        if (status != PosSessionStatus.OPEN && status != PosSessionStatus.SUSPENDED) return Optional.empty();

        LocalDate sessionBusinessDay = sessionBusinessDay(session);
        if (sessionBusinessDay == null) return Optional.empty();

        LocalDate candidate = windowService.resolveCurrent(session.getBranchId()).window().tradingDate();
        if (candidate == null) return Optional.empty();

        return sessionBusinessDay.isBefore(candidate) ? Optional.of(sessionBusinessDay) : Optional.empty();
    }

    /** The Business Day a session belongs to: its immutable {@code tradingDate}, or
     *  the legacy {@code sessionDate} bucket for sessions that predate Trading Dates.
     *  Same fallback order {@code PosCheckoutController#posBusinessDate} uses. */
    public static LocalDate sessionBusinessDay(PosSession session) {
        if (session == null) return null;
        return session.getTradingDate() != null ? session.getTradingDate() : session.getSessionDate();
    }
}
