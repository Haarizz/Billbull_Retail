package com.billbull.backend.pos.admin;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * One closed-session hit for the Session Denomination Correction picker.
 *
 * <p>Session ids are internal surrogate keys — nobody at a counter knows them. This carries the
 * terminal, closing cashier and close time an operator actually recognises, plus the counted and
 * expected cash so they can confirm they picked the right drawer before restating it.
 *
 * <p>{@code correctable == false} means the session cannot take a new correction right now (a
 * request is already pending, or the drawer was closed without a denomination breakdown to
 * restate); {@code blockReason} says which, so the picker can grey the row instead of letting the
 * request fail on submit.
 */
public class CorrectionSessionTargetResponse {

    private Long sessionId;
    private String terminalId;
    private String counterName;
    private String closedBy;
    private LocalDateTime closedAt;
    private LocalDate sessionDate;
    private BigDecimal closingCash;
    private BigDecimal expectedCash;
    private boolean alreadyCorrected;
    private boolean correctable;
    private String blockReason;

    public Long getSessionId() { return sessionId; }
    public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
    public String getTerminalId() { return terminalId; }
    public void setTerminalId(String terminalId) { this.terminalId = terminalId; }
    public String getCounterName() { return counterName; }
    public void setCounterName(String counterName) { this.counterName = counterName; }
    public String getClosedBy() { return closedBy; }
    public void setClosedBy(String closedBy) { this.closedBy = closedBy; }
    public LocalDateTime getClosedAt() { return closedAt; }
    public void setClosedAt(LocalDateTime closedAt) { this.closedAt = closedAt; }
    public LocalDate getSessionDate() { return sessionDate; }
    public void setSessionDate(LocalDate sessionDate) { this.sessionDate = sessionDate; }
    public BigDecimal getClosingCash() { return closingCash; }
    public void setClosingCash(BigDecimal closingCash) { this.closingCash = closingCash; }
    public BigDecimal getExpectedCash() { return expectedCash; }
    public void setExpectedCash(BigDecimal expectedCash) { this.expectedCash = expectedCash; }
    public boolean isAlreadyCorrected() { return alreadyCorrected; }
    public void setAlreadyCorrected(boolean alreadyCorrected) { this.alreadyCorrected = alreadyCorrected; }
    public boolean isCorrectable() { return correctable; }
    public void setCorrectable(boolean correctable) { this.correctable = correctable; }
    public String getBlockReason() { return blockReason; }
    public void setBlockReason(String blockReason) { this.blockReason = blockReason; }
}
