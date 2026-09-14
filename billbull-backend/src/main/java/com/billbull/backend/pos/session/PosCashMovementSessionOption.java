package com.billbull.backend.pos.session;

import com.billbull.backend.pos.businessdate.BusinessDayContinuationGate;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * One selectable session in the Cash Drop / Outs "Add New" session picker.
 *
 * <p>The picker exists so a cash movement can only ever be aimed at a session that
 * {@link PosSessionService#addCashMovement} will actually accept. Previously the form took a
 * free-typed session id and the operator only learned the session was closed (or stale, or
 * mid-closure) after pressing Create. The eligibility rules are not restated here — the list is
 * built by asking the very same guards {@code addCashMovement} enforces.
 */
public class PosCashMovementSessionOption {

    private Long id;
    private Long branchId;
    private String branchName;
    private String counterName;
    private String terminalId;
    /** Resolved employee name where captured, falling back to the username. Display only. */
    private String openedBy;
    /** The session's Business Day (tradingDate, or the legacy sessionDate bucket). */
    private LocalDate businessDate;
    private LocalDateTime openedAt;

    public static PosCashMovementSessionOption from(PosSession s) {
        PosCashMovementSessionOption o = new PosCashMovementSessionOption();
        o.id = s.getId();
        o.branchId = s.getBranchId();
        o.branchName = s.getBranchName();
        o.counterName = s.getCounterName();
        o.terminalId = s.getTerminalId();
        o.openedBy = s.getOpenedByDisplayName() != null && !s.getOpenedByDisplayName().isBlank()
                ? s.getOpenedByDisplayName() : s.getOpenedBy();
        o.businessDate = BusinessDayContinuationGate.sessionBusinessDay(s);
        o.openedAt = s.getOpenedAt();
        return o;
    }

    public Long getId() { return id; }
    public Long getBranchId() { return branchId; }
    public String getBranchName() { return branchName; }
    public String getCounterName() { return counterName; }
    public String getTerminalId() { return terminalId; }
    public String getOpenedBy() { return openedBy; }
    public LocalDate getBusinessDate() { return businessDate; }
    public LocalDateTime getOpenedAt() { return openedAt; }
}
