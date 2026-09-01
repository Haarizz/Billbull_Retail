package com.billbull.backend.pos.businessdate;

import com.billbull.backend.pos.session.PosSession;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;

/**
 * Thrown when an operation would continue normal POS work on a session that belongs
 * to a <b>previous</b> Business Day.
 *
 * <p>Deliberately carries the exact {@code PREVIOUS_DAY_SESSION_OPEN:} message shape
 * the Start Session gate already produces ({@code PosSessionService#runLegacyGate} /
 * {@code toEnforcementException}), so the POS reuses its existing "Previous Day Not
 * Closed" modal instead of gaining a second, differently-worded warning. 409 CONFLICT
 * for the same reason — the POS already routes that status + prefix to that modal.
 *
 * <p>There is no supervisor override for this condition: the remaining work is
 * closing the old session and running Day Close, and no credential may reopen a
 * Business Day that has closed.
 */
public class PreviousBusinessDaySessionException extends ResponseStatusException {

    private final Long sessionId;
    private final String terminalId;
    private final String sessionStatus;
    private final LocalDate previousBusinessDay;

    private PreviousBusinessDaySessionException(String message, Long sessionId, String terminalId,
                                                 String sessionStatus, LocalDate previousBusinessDay) {
        super(HttpStatus.CONFLICT, message);
        this.sessionId = sessionId;
        this.terminalId = terminalId;
        this.sessionStatus = sessionStatus;
        this.previousBusinessDay = previousBusinessDay;
    }

    public static PreviousBusinessDaySessionException of(PosSession session, LocalDate sessionBusinessDay) {
        String status = session.getStatus() != null ? session.getStatus().name() : "OPEN";
        String message = buildMessage(session.getId(), session.getTerminalId(), status, sessionBusinessDay);
        return new PreviousBusinessDaySessionException(message, session.getId(), session.getTerminalId(),
                status, sessionBusinessDay);
    }

    /** The user-facing text, built in one place so the day-status payload and the
     *  thrown 409 can never drift apart. */
    public static String buildMessage(Long sessionId, String terminalId, String status, LocalDate businessDay) {
        return "PREVIOUS_DAY_SESSION_OPEN: "
                + "Business Day " + businessDay + " cannot be completed because Session #" + sessionId
                + " on Terminal " + terminalId + " is still " + status + ".\n"
                + "Session ID : " + sessionId + "\n"
                + "Terminal : " + terminalId + "\n"
                + "Status : " + status + "\n"
                + "Business Day : " + businessDay + "\n"
                + "Please close the previous Business Day session and complete Day Close before continuing.";
    }

    /** Same flow, but every session on the blocking day is already closed — only Day
     *  Close itself is outstanding, so there is no session/terminal to name. */
    public static String buildDayNotClosedMessage(LocalDate businessDay) {
        return "PREVIOUS_DAY_SESSION_OPEN: "
                + "Business Day " + businessDay + " cannot be completed because Day Close has not been run.\n"
                + "Business Day : " + businessDay + "\n"
                + "All sessions for this Business Day are already closed.\n"
                + "Please complete Day Close (Z Report) before continuing.";
    }

    public Long getSessionId() { return sessionId; }
    public String getTerminalId() { return terminalId; }
    public String getSessionStatus() { return sessionStatus; }
    public LocalDate getPreviousBusinessDay() { return previousBusinessDay; }
}
