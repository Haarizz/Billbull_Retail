package com.billbull.backend.pos.businessdate;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Structured body returned when an operation is refused because the Business Day
 * has closed and the branch is waiting for the next configured start time.
 *
 * <p>Deliberately structured rather than a formatted message string: the POS has to
 * render "The current Business Day ended at 23:00. The next Business Day will start
 * at 09:00." with live times, and parsing those back out of prose would be brittle.
 * The {@code code} lets the client branch on the condition without string matching.
 *
 * <p>This describes a <b>scheduled, self-resolving</b> state — the operator has done
 * nothing wrong; normal trading resumes at the next configured start time, and until
 * then the remaining work is session closure and Day Close. There is no supervisor
 * path that reopens the Business Day. Clients must present it as a scheduled closure,
 * never as an error or a generic failure page.
 */
public class BusinessDayClosedResponse {

    public static final String CODE = "BUSINESS_DAY_CLOSED";

    private String code = CODE;
    private String message;
    /** The Business Day that closed — still the authoritative Trading Date for any
     *  session opened during it, and the day Day Close/Z-Report applies to. */
    private LocalDate tradingDate;
    /** The configured Scheduled End Time of the Business Day that closed. */
    private LocalDateTime scheduledEndAt;
    /** When the Business Day actually closed (Scheduled End + the configured
     *  extension). */
    private LocalDateTime closedAt;
    /** When the next Business Day begins and normal operation resumes. */
    private LocalDateTime nextStartAt;
    /**
     * Set on a refused <b>checkout</b> (never on a refused session-open): tells the
     * POS that this one pending transaction can still be completed through the
     * existing per-transaction supervisor authorization already built into checkout,
     * so it can raise that dialog instead of a dead end.
     *
     * <p>Deliberately per-transaction. Authorizing one sale grants nothing beyond
     * that sale — there is no window afterwards in which further sales can be rung
     * up, which is exactly what distinguishes this from a grace period.
     */
    private boolean supervisorAuthorizationAvailable;

    public BusinessDayClosedResponse() {}

    public static BusinessDayClosedResponse from(BusinessDayState state) {
        BusinessDayWindow window = state.window();
        BusinessDayClosedResponse response = new BusinessDayClosedResponse();
        response.tradingDate = window.tradingDate();
        response.scheduledEndAt = window.scheduledEnd();
        response.closedAt = window.closureAt();
        response.nextStartAt = window.nextWindowStart();
        response.message = "Business Day " + window.tradingDate() + " closed at "
                + (window.closureAt() != null ? window.closureAt().toLocalTime() : "?")
                + ". The next Business Day starts at "
                + (window.nextWindowStart() != null ? window.nextWindowStart().toLocalTime() : "?")
                + ". No new POS sessions can be opened during this period.";
        return response;
    }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    public LocalDate getTradingDate() { return tradingDate; }
    public void setTradingDate(LocalDate tradingDate) { this.tradingDate = tradingDate; }

    public LocalDateTime getScheduledEndAt() { return scheduledEndAt; }
    public void setScheduledEndAt(LocalDateTime scheduledEndAt) { this.scheduledEndAt = scheduledEndAt; }

    public LocalDateTime getClosedAt() { return closedAt; }
    public void setClosedAt(LocalDateTime closedAt) { this.closedAt = closedAt; }

    public LocalDateTime getNextStartAt() { return nextStartAt; }
    public void setNextStartAt(LocalDateTime nextStartAt) { this.nextStartAt = nextStartAt; }

    public boolean isSupervisorAuthorizationAvailable() { return supervisorAuthorizationAvailable; }
    public void setSupervisorAuthorizationAvailable(boolean supervisorAuthorizationAvailable) {
        this.supervisorAuthorizationAvailable = supervisorAuthorizationAvailable;
    }

    /** Marks this refusal as one a supervisor may release for a single transaction,
     *  and restates the message in checkout terms. */
    public BusinessDayClosedResponse asPendingCheckoutRefusal() {
        this.supervisorAuthorizationAvailable = true;
        this.message = "Business Day " + tradingDate + " closed at "
                + (closedAt != null ? closedAt.toLocalTime() : "?")
                + ". Normal selling has stopped. A supervisor can authorize this pending transaction to complete.";
        return this;
    }
}
