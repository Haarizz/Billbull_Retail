package com.billbull.backend.pos.session;

import com.billbull.backend.pos.businessdate.BusinessDayContinuationGate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Thrown when an operation would continue normal POS work on a session whose closure
 * workflow has already been started — i.e. an operator pressed "Close Session", but the
 * final close has not completed yet, so the session is still OPEN by design.
 *
 * <p>Modelled on {@code PreviousBusinessDaySessionException}: a 409 CONFLICT carrying a
 * machine-readable {@code SESSION_CLOSING_WORKFLOW:} prefix plus labelled detail lines, so
 * the POS routes it to a dedicated "Session Closure Required" modal the same way it routes
 * {@code PREVIOUS_DAY_SESSION_OPEN:} to "Previous Day Not Closed". The two conditions stay
 * separately worded and separately raised — this one says nothing about Business Days
 * beyond naming the one the session belongs to.
 *
 * <p>There is no supervisor override <i>for the operation</i>: the way out is either
 * completing the closure or a supervisor explicitly cancelling it via
 * {@code POST /sessions/{id}/cancel-closure}.
 */
public class PosSessionClosureRequiredException extends ResponseStatusException {

    private final Long sessionId;
    private final String terminalId;
    private final String sessionStatus;
    private final LocalDate businessDay;

    private PosSessionClosureRequiredException(String message, Long sessionId, String terminalId,
                                                String sessionStatus, LocalDate businessDay) {
        super(HttpStatus.CONFLICT, message);
        this.sessionId = sessionId;
        this.terminalId = terminalId;
        this.sessionStatus = sessionStatus;
        this.businessDay = businessDay;
    }

    static PosSessionClosureRequiredException of(PosSession session) {
        String status = session.getStatus() != null ? session.getStatus().name() : "OPEN";
        // Same Business Day resolution the continuation gate uses (tradingDate, falling back
        // to the legacy sessionDate bucket) — read only, never recomputed here, so no
        // Business Day logic is duplicated into this class.
        LocalDate day = BusinessDayContinuationGate.sessionBusinessDay(session);
        String message = buildMessage(session.getId(), session.getTerminalId(), status, day,
                session.getClosingStartedBy(), session.getClosingStartedAt());
        return new PosSessionClosureRequiredException(message, session.getId(), session.getTerminalId(),
                status, day);
    }

    /** The user-facing text, built in one place so any payload exposing this condition and
     *  the thrown 409 can never drift apart. */
    public static String buildMessage(Long sessionId, String terminalId, String status,
                                      LocalDate businessDay, String startedBy, LocalDateTime startedAt) {
        return "SESSION_CLOSING_WORKFLOW: "
                + "Session closure is already in progress for Session #" + sessionId
                + " on Terminal " + terminalId + ", so it can no longer be used for sales.\n"
                + "Session ID : " + sessionId + "\n"
                + "Terminal : " + terminalId + "\n"
                + "Status : " + status + " (closing)\n"
                + "Business Day : " + businessDay + "\n"
                + "Closure Started By : " + (startedBy != null ? startedBy : "—") + "\n"
                + "Closure Started At : " + (startedAt != null ? startedAt : "—") + "\n"
                + "Complete the X-Report / Close Session workflow to close this session. "
                + "A supervisor can cancel the closure if it was started by mistake.";
    }

    public Long getSessionId() { return sessionId; }
    public String getTerminalId() { return terminalId; }
    public String getSessionStatus() { return sessionStatus; }
    public LocalDate getBusinessDay() { return businessDay; }
}
