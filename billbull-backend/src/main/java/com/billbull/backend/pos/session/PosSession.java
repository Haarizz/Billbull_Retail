package com.billbull.backend.pos.session;

import com.billbull.backend.common.BaseEntity;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "pos_sessions", indexes = {
    @Index(name = "idx_pos_session_branch", columnList = "branch_id"),
    @Index(name = "idx_pos_session_date",   columnList = "session_date"),
    @Index(name = "idx_pos_session_status", columnList = "status"),
    // ARCHFIX §3 — hot session lookup; name matches V3__missing_indexes.sql.
    @Index(name = "idx_pos_sess_lookup",    columnList = "branch_id, terminal_id, status"),
    // Day Close domain lookup — PosPendingDayCloseResolver / resolveSessionRange();
    // name matches V68__pos_session_trading_date.sql.
    @Index(name = "idx_pos_session_trading_date", columnList = "branch_id, trading_date")
})
public class PosSession extends BaseEntity {

    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "branch_name")
    private String branchName;

    @Column(name = "terminal_id")
    private String terminalId;

    @Column(name = "counter_name")
    private String counterName;

    @Column(name = "opened_by")
    private String openedBy;

    @Column(name = "closed_by")
    private String closedBy;

    /** Resolved employee full name (User.getResolvedDisplayName()) captured at the moment
     *  openedBy/closedBy/xReportGeneratedBy were set — display-only, never used for
     *  identity/ownership/locking/audit, which continue to rely solely on the username
     *  columns above. Null on sessions written before this field existed. */
    @Column(name = "opened_by_display_name")
    private String openedByDisplayName;

    @Column(name = "closed_by_display_name")
    private String closedByDisplayName;

    /** Accounting bucket — copied from the Business Date pointer at open time
     *  ({@code PosBusinessDateService.getCurrentBusinessDate}). Drives everything
     *  outside the Day Close domain (cash-movement businessDate/GL date, X-Report
     *  numbering/snapshot date, advance-receipt date, session history). Intentionally
     *  left as-is by the Day Close session-driven resolution work — see
     *  {@link #tradingDate} for that. */
    @Column(name = "session_date")
    private LocalDate sessionDate;

    /** The Business Day this session belongs to — resolved once, at creation, via
     *  {@code BusinessDayResolver.resolve(openedAt, BusinessDaySettings)} (the
     *  branch's configured operating-hours window), and never modified afterward.
     *  For a branch with no operating hours configured (the default), this equals
     *  {@code openedAt.toLocalDate()}. Immutable by design: if Business Day
     *  Settings change later, only sessions created after the change use the new
     *  configuration — this value never gets recalculated retroactively.
     *
     *  <p>Single source of truth for the Day Close domain only
     *  ({@code PosPendingDayCloseResolver}, {@code closeDay()}, Day Close Summary,
     *  dynamic Z-Report session grouping) — deliberately independent of the
     *  Business Date pointer so a calendar gap with no sessions is simply never
     *  surfaced as a date requiring Day Close. Not used outside the Day Close
     *  domain; see {@link #sessionDate} for the accounting-bucket concept those
     *  other consumers still rely on. See {@code docs/business-day-architecture.md}. */
    @Column(name = "trading_date")
    private LocalDate tradingDate;

    @Column(name = "opened_at")
    private LocalDateTime openedAt;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    @Column(name = "duration_seconds")
    private Long durationSeconds;

    // FK to pos_terminals.id — nullable for sessions created before the counter entity existed.
    @Column(name = "terminal_pk")
    private Long terminalPk;

    // FK to pos_counters.id — nullable for sessions created before counter entity existed.
    @Column(name = "counter_id")
    private Long counterId;

    // Updated on every sale/movement to drive idle-timeout detection.
    @Column(name = "last_activity_at")
    private LocalDateTime lastActivityAt;

    // Snapshot of PosSettings.sessionIdleTimeoutMinutes at session open time.
    @Column(name = "idle_timeout_minutes")
    private Integer idleTimeoutMinutes;

    // Absolute session expiry (now + max_session_duration_hours). Null = no hard limit.
    @Column(name = "session_timeout_at")
    private LocalDateTime sessionTimeoutAt;

    /** FK to pos_day_closes.id — set once this session is stamped into a Day Close's
     *  resolved session range. Null while the session's business date is still open,
     *  or if the session was explicitly excluded from a supervisor-adjusted range. */
    @Column(name = "day_close_id")
    private Long dayCloseId;

    /** Session Roaming Phase 1 (schema foundation only — unused by any service yet). Stable
     *  owner of this session, independent of which terminal currently hosts it. Null on every
     *  session created before this feature existed and never backfilled by this phase. */
    @Column(name = "owner_user_id")
    private Long ownerUserId;

    /** Session Roaming Phase 1 (schema foundation only — unused by any service yet). Last time
     *  the session's current-terminal "hosting" pointer was refreshed. Null until a later phase
     *  starts writing it. */
    @Column(name = "current_hosting_refreshed_at")
    private LocalDateTime currentHostingRefreshedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PosSessionStatus status = PosSessionStatus.OPEN;

    @Column(name = "opening_cash", precision = 15, scale = 2)
    private BigDecimal openingCash = BigDecimal.ZERO;

    @Column(name = "closing_cash", precision = 15, scale = 2)
    private BigDecimal closingCash;

    @Column(name = "expected_cash", precision = 15, scale = 2)
    private BigDecimal expectedCash;

    @Column(name = "cash_difference", precision = 15, scale = 2)
    private BigDecimal cashDifference;

    @Column(name = "total_sales", precision = 15, scale = 2)
    private BigDecimal totalSales = BigDecimal.ZERO;

    @Column(name = "total_cash_sales", precision = 15, scale = 2)
    private BigDecimal totalCashSales = BigDecimal.ZERO;

    @Column(name = "total_card_sales", precision = 15, scale = 2)
    private BigDecimal totalCardSales = BigDecimal.ZERO;

    @Column(name = "total_credit_sales", precision = 15, scale = 2)
    private BigDecimal totalCreditSales = BigDecimal.ZERO;

    /**
     * @deprecated Historical only. Under the payment-allocation architecture a sale paid more
     *     than one way is split across {@code totalCashSales} / {@code totalCardSales} /
     *     {@code totalOnlineSales} / {@code totalCreditSales} by the amount each tender took, so
     *     nothing increments this counter any more (see
     *     {@code PosSessionService.recordInvoiceOnSession}). It is kept, and kept readable, only
     *     so sessions closed before Phase 10 still report the totals they were closed with.
     *     Never read it to build a new figure — aggregate the {@code sales_payments} rows.
     */
    @Deprecated
    @Column(name = "total_mixed_sales", precision = 15, scale = 2)
    private BigDecimal totalMixedSales = BigDecimal.ZERO;

    @Column(name = "total_online_sales", precision = 15, scale = 2)
    private BigDecimal totalOnlineSales = BigDecimal.ZERO;

    @Column(name = "total_refunds", precision = 15, scale = 2)
    private BigDecimal totalRefunds = BigDecimal.ZERO;

    @Column(name = "total_voids")
    private Integer totalVoids = 0;

    @Column(name = "invoice_count")
    private Integer invoiceCount = 0;

    @Column(name = "x_report_printed")
    private Boolean xReportPrinted = false;

    /** When this terminal's cashier explicitly generated its X-Report for the shift.
     *  Null while the session is open and no X-Report has been run yet. The end-of-day
     *  Z-Report is blocked until every still-open terminal for the branch has this set
     *  (see {@code PosSessionService.getZReport}). Closing the session also stamps it. */
    @Column(name = "x_report_generated_at")
    private LocalDateTime xReportGeneratedAt;

    @Column(name = "x_report_generated_by")
    private String xReportGeneratedBy;

    /** See {@link #openedByDisplayName} doc — display-only resolved name. */
    @Column(name = "x_report_generated_by_display_name")
    private String xReportGeneratedByDisplayName;

    /** When the operator explicitly started this session's closure workflow, via
     *  {@code POST /api/pos/sessions/{id}/begin-closure} — the "Close Session" action, and
     *  nothing else. Null on a normal active session.
     *
     *  <p>While this is set the session is still genuinely {@link PosSessionStatus#OPEN} —
     *  it must be, because the X-Report and every close validation operate on the open
     *  session — but normal POS work (selling, checkout, cash movements, resume) is refused
     *  by {@link PosSessionClosureWorkflowGate}. Everything the closure itself needs stays
     *  available. Cleared only by the supervisor-authorized cancel-closure action.
     *
     *  <p>Deliberately NOT {@link #xReportGeneratedAt}: the X-Report is an informational,
     *  optional, mid-shift read that must never lock a till. See V77 for the full rationale. */
    @Column(name = "closing_started_at")
    private LocalDateTime closingStartedAt;

    /** Username of whoever started the closure workflow. Matches the identity convention of
     *  {@code openedBy}/{@code closedBy}/{@code xReportGeneratedBy} (username, app-level
     *  only). Never overwritten once set — a second begin-closure call is a no-op. */
    @Column(name = "closing_started_by")
    private String closingStartedBy;

    @Column(name = "z_report_printed")
    private Boolean zReportPrinted = false;

    @Column(name = "notes", length = 1000)
    private String notes;

    /** Immutable JSON snapshot of the Z-Report summary captured when this session was closed.
     *  Null while the session is open. Written once by closeSession(), never overwritten. */
    @Column(name = "z_report_json", columnDefinition = "TEXT")
    private String zReportJson;

    @Column(name = "closing_denominations_json", columnDefinition = "TEXT")
    private String closingDenominationsJson;

    /** When the drawer was physically counted. Distinct from {@link #closedAt}: that is when the
     *  session ended, this is when someone counted the notes. It is what separates "not counted"
     *  from "counted and found empty" — a distinction {@code closingCash == 0} cannot make.
     *  Null on sessions closed before server-side counting existed; readers fall back to
     *  {@code closedAt} when a denomination snapshot is present. */
    @Column(name = "counted_at")
    private LocalDateTime countedAt;

    /** The currency the count was validated against, so the snapshot is self-describing — a
     *  "500" key means different money in different currencies. */
    @Column(name = "counted_currency_code", length = 3)
    private String countedCurrencyCode;

    // ── Variance approval ────────────────────────────────────────────────────────────────
    // Who authorized this discrepancy, and on what basis. Previously the gate was a client
    // boolean with no identity attached, so an approved variance left no record of approval.

    /** NOT_REQUIRED / REQUIRED / APPROVED. Null on sessions closed before this existed. */
    @Column(name = "variance_approval_status", length = 20)
    private String varianceApprovalStatus;

    /** Resolved server-side from verified credentials — never a name sent by the client. */
    @Column(name = "variance_approved_by", length = 100)
    private String varianceApprovedBy;

    @Column(name = "variance_approved_by_user_id")
    private Long varianceApprovedByUserId;

    @Column(name = "variance_approved_at")
    private LocalDateTime varianceApprovedAt;

    @Column(name = "variance_approval_reason", length = 500)
    private String varianceApprovalReason;

    // ── Accounting posting state ─────────────────────────────────────────────────────────
    // The close journal used to be wrapped in an empty catch, so a session could report itself
    // reconciled while no entry existed. These make that state visible and recoverable.

    /** PENDING / POSTED / FAILED / NOT_REQUIRED. */
    @Column(name = "gl_posting_status", length = 20)
    private String glPostingStatus;

    /** The journal reference, so a close is traceable to its entry without parsing anything. */
    @Column(name = "gl_posting_reference", length = 100)
    private String glPostingReference;

    @Column(name = "gl_posting_error", length = 1000)
    private String glPostingError;

    @Column(name = "gl_posted_at")
    private LocalDateTime glPostedAt;

    @Column(name = "card_batch_no")
    private String cardBatchNo;

    @Column(name = "card_settlement_verified")
    private Boolean cardSettlementVerified = false;

    /** Counted/declared card terminal settlement amount entered by the cashier at close,
     *  mirroring closingCash's role for cash. Null if the cashier never entered one. */
    @Column(name = "card_closing_cash", precision = 15, scale = 2)
    private BigDecimal cardClosingCash;

    /** cardClosingCash - totalCardSales, mirroring cashDifference. Null until computed. */
    @Column(name = "card_difference", precision = 15, scale = 2)
    private BigDecimal cardDifference;

    @Column(name = "closing_cashier_name")
    private String closingCashierName;

    @Column(name = "closing_supervisor_name")
    private String closingSupervisorName;

    @Column(name = "closing_remarks", length = 1000)
    private String closingRemarks;

    @JsonIgnore
    @OneToMany(mappedBy = "posSession", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<PosCashMovement> cashMovements = new ArrayList<>();

    // Getters & Setters

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }

    public String getTerminalId() { return terminalId; }
    public void setTerminalId(String terminalId) { this.terminalId = terminalId; }

    public String getCounterName() { return counterName; }
    public void setCounterName(String counterName) { this.counterName = counterName; }

    public String getOpenedBy() { return openedBy; }
    public void setOpenedBy(String openedBy) { this.openedBy = openedBy; }

    public String getClosedBy() { return closedBy; }
    public void setClosedBy(String closedBy) { this.closedBy = closedBy; }

    public String getOpenedByDisplayName() { return openedByDisplayName; }
    public void setOpenedByDisplayName(String openedByDisplayName) { this.openedByDisplayName = openedByDisplayName; }

    public String getClosedByDisplayName() { return closedByDisplayName; }
    public void setClosedByDisplayName(String closedByDisplayName) { this.closedByDisplayName = closedByDisplayName; }

    public LocalDate getSessionDate() { return sessionDate; }
    public void setSessionDate(LocalDate sessionDate) { this.sessionDate = sessionDate; }

    public LocalDate getTradingDate() { return tradingDate; }
    public void setTradingDate(LocalDate tradingDate) { this.tradingDate = tradingDate; }

    @JsonIgnore
    public LocalDateTime getOpenedAt() { return openedAt; }
    public void setOpenedAt(LocalDateTime openedAt) { this.openedAt = openedAt; }

    /** Serialized with the <b>Business Day</b> zone, never {@code ZoneId.systemDefault()}:
     *  {@link #openedAt} is a wall-clock reading taken by {@code BusinessDayClock.now()}
     *  in {@code pos.businessday.timezone}, so that is the only zone under which it
     *  denotes the moment it was stamped. See {@code BusinessDayClock#presentationZone()}. */
    @com.fasterxml.jackson.annotation.JsonProperty("openedAt")
    public java.time.ZonedDateTime getOpenedAtZoned() {
        return openedAt != null ? openedAt.atZone(businessDayZone()) : null;
    }

    @JsonIgnore
    public LocalDateTime getClosedAt() { return closedAt; }
    public void setClosedAt(LocalDateTime closedAt) { this.closedAt = closedAt; }

    /** Business Day zone, for the same reason as {@link #getOpenedAtZoned()}. */
    @com.fasterxml.jackson.annotation.JsonProperty("closedAt")
    public java.time.ZonedDateTime getClosedAtZoned() {
        return closedAt != null ? closedAt.atZone(businessDayZone()) : null;
    }

    private static java.time.ZoneId businessDayZone() {
        return com.billbull.backend.pos.businessdate.BusinessDayClock.presentationZone();
    }

    public Long getDurationSeconds() { return durationSeconds; }
    public void setDurationSeconds(Long durationSeconds) { this.durationSeconds = durationSeconds; }

    public PosSessionStatus getStatus() { return status; }
    public void setStatus(PosSessionStatus status) { this.status = status; }

    public BigDecimal getOpeningCash() { return openingCash; }
    public void setOpeningCash(BigDecimal openingCash) { this.openingCash = openingCash; }

    public BigDecimal getClosingCash() { return closingCash; }
    public void setClosingCash(BigDecimal closingCash) { this.closingCash = closingCash; }

    public BigDecimal getExpectedCash() { return expectedCash; }
    public void setExpectedCash(BigDecimal expectedCash) { this.expectedCash = expectedCash; }

    public BigDecimal getCashDifference() { return cashDifference; }
    public void setCashDifference(BigDecimal cashDifference) { this.cashDifference = cashDifference; }

    public BigDecimal getTotalSales() { return totalSales; }
    public void setTotalSales(BigDecimal totalSales) { this.totalSales = totalSales; }

    public BigDecimal getTotalCashSales() { return totalCashSales; }
    public void setTotalCashSales(BigDecimal totalCashSales) { this.totalCashSales = totalCashSales; }

    public BigDecimal getTotalCardSales() { return totalCardSales; }
    public void setTotalCardSales(BigDecimal totalCardSales) { this.totalCardSales = totalCardSales; }

    public BigDecimal getTotalCreditSales() { return totalCreditSales; }
    public void setTotalCreditSales(BigDecimal totalCreditSales) { this.totalCreditSales = totalCreditSales; }

    /** @deprecated see {@link #totalMixedSales} — historical sessions only. */
    @Deprecated
    public BigDecimal getTotalMixedSales() { return totalMixedSales; }
    /** @deprecated see {@link #totalMixedSales} — historical sessions only. */
    @Deprecated
    public void setTotalMixedSales(BigDecimal totalMixedSales) { this.totalMixedSales = totalMixedSales; }

    public BigDecimal getTotalOnlineSales() { return totalOnlineSales; }
    public void setTotalOnlineSales(BigDecimal totalOnlineSales) { this.totalOnlineSales = totalOnlineSales; }

    public BigDecimal getTotalRefunds() { return totalRefunds; }
    public void setTotalRefunds(BigDecimal totalRefunds) { this.totalRefunds = totalRefunds; }

    public Integer getTotalVoids() { return totalVoids; }
    public void setTotalVoids(Integer totalVoids) { this.totalVoids = totalVoids; }

    public Integer getInvoiceCount() { return invoiceCount; }
    public void setInvoiceCount(Integer invoiceCount) { this.invoiceCount = invoiceCount; }

    public Boolean getXReportPrinted() { return xReportPrinted; }
    public void setXReportPrinted(Boolean xReportPrinted) { this.xReportPrinted = xReportPrinted; }

    public LocalDateTime getXReportGeneratedAt() { return xReportGeneratedAt; }
    public void setXReportGeneratedAt(LocalDateTime xReportGeneratedAt) { this.xReportGeneratedAt = xReportGeneratedAt; }

    public String getXReportGeneratedBy() { return xReportGeneratedBy; }
    public void setXReportGeneratedBy(String xReportGeneratedBy) { this.xReportGeneratedBy = xReportGeneratedBy; }

    public String getXReportGeneratedByDisplayName() { return xReportGeneratedByDisplayName; }
    public void setXReportGeneratedByDisplayName(String xReportGeneratedByDisplayName) { this.xReportGeneratedByDisplayName = xReportGeneratedByDisplayName; }

    /** Display-only view for the POS dashboard: the operator has explicitly started this
     *  session's closure workflow but it is not yet CLOSED, so it must be offered as
     *  "Session Closure Required" rather than "Continue Session".
     *
     *  <p>Reads {@link #closingStartedAt} — never {@code xReportGeneratedAt}, which is an
     *  informational mid-shift report and says nothing about closure.
     *
     *  <p>Serialized under a stable, explicit name so the frontend never has to guess how
     *  Jackson decapitalizes the getter. Rendering convenience only —
     *  {@code PosSessionClosureWorkflowGate} is the authority and is what actually refuses
     *  the operation server-side. Kept in sync with that gate's {@code isInClosureWorkflow}. */
    @Transient
    @com.fasterxml.jackson.annotation.JsonProperty("awaitingClosure")
    public boolean isAwaitingClosure() {
        return (status == PosSessionStatus.OPEN || status == PosSessionStatus.SUSPENDED)
                && closingStartedAt != null;
    }

    public LocalDateTime getClosingStartedAt() { return closingStartedAt; }
    public void setClosingStartedAt(LocalDateTime closingStartedAt) { this.closingStartedAt = closingStartedAt; }

    public String getClosingStartedBy() { return closingStartedBy; }
    public void setClosingStartedBy(String closingStartedBy) { this.closingStartedBy = closingStartedBy; }

    public Boolean getZReportPrinted() { return zReportPrinted; }
    public void setZReportPrinted(Boolean zReportPrinted) { this.zReportPrinted = zReportPrinted; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public String getZReportJson() { return zReportJson; }
    public void setZReportJson(String zReportJson) { this.zReportJson = zReportJson; }

    public String getVarianceApprovalStatus() { return varianceApprovalStatus; }
    public void setVarianceApprovalStatus(String varianceApprovalStatus) { this.varianceApprovalStatus = varianceApprovalStatus; }

    public String getVarianceApprovedBy() { return varianceApprovedBy; }
    public void setVarianceApprovedBy(String varianceApprovedBy) { this.varianceApprovedBy = varianceApprovedBy; }

    public Long getVarianceApprovedByUserId() { return varianceApprovedByUserId; }
    public void setVarianceApprovedByUserId(Long varianceApprovedByUserId) { this.varianceApprovedByUserId = varianceApprovedByUserId; }

    public LocalDateTime getVarianceApprovedAt() { return varianceApprovedAt; }
    public void setVarianceApprovedAt(LocalDateTime varianceApprovedAt) { this.varianceApprovedAt = varianceApprovedAt; }

    public String getVarianceApprovalReason() { return varianceApprovalReason; }
    public void setVarianceApprovalReason(String varianceApprovalReason) { this.varianceApprovalReason = varianceApprovalReason; }

    public String getGlPostingStatus() { return glPostingStatus; }
    public void setGlPostingStatus(String glPostingStatus) { this.glPostingStatus = glPostingStatus; }

    public String getGlPostingReference() { return glPostingReference; }
    public void setGlPostingReference(String glPostingReference) { this.glPostingReference = glPostingReference; }

    public String getGlPostingError() { return glPostingError; }
    public void setGlPostingError(String glPostingError) { this.glPostingError = glPostingError; }

    public LocalDateTime getGlPostedAt() { return glPostedAt; }
    public void setGlPostedAt(LocalDateTime glPostedAt) { this.glPostedAt = glPostedAt; }

    public LocalDateTime getCountedAt() { return countedAt; }
    public void setCountedAt(LocalDateTime countedAt) { this.countedAt = countedAt; }

    public String getCountedCurrencyCode() { return countedCurrencyCode; }
    public void setCountedCurrencyCode(String countedCurrencyCode) { this.countedCurrencyCode = countedCurrencyCode; }

    public String getClosingDenominationsJson() { return closingDenominationsJson; }
    public void setClosingDenominationsJson(String closingDenominationsJson) { this.closingDenominationsJson = closingDenominationsJson; }

    public String getCardBatchNo() { return cardBatchNo; }
    public void setCardBatchNo(String cardBatchNo) { this.cardBatchNo = cardBatchNo; }

    public Boolean getCardSettlementVerified() { return cardSettlementVerified; }
    public void setCardSettlementVerified(Boolean cardSettlementVerified) { this.cardSettlementVerified = cardSettlementVerified; }

    public BigDecimal getCardClosingCash() { return cardClosingCash; }
    public void setCardClosingCash(BigDecimal cardClosingCash) { this.cardClosingCash = cardClosingCash; }

    public BigDecimal getCardDifference() { return cardDifference; }
    public void setCardDifference(BigDecimal cardDifference) { this.cardDifference = cardDifference; }

    public String getClosingCashierName() { return closingCashierName; }
    public void setClosingCashierName(String closingCashierName) { this.closingCashierName = closingCashierName; }

    public String getClosingSupervisorName() { return closingSupervisorName; }
    public void setClosingSupervisorName(String closingSupervisorName) { this.closingSupervisorName = closingSupervisorName; }

    public String getClosingRemarks() { return closingRemarks; }
    public void setClosingRemarks(String closingRemarks) { this.closingRemarks = closingRemarks; }

    public List<PosCashMovement> getCashMovements() { return cashMovements; }
    public void setCashMovements(List<PosCashMovement> cashMovements) { this.cashMovements = cashMovements; }

    public Long getTerminalPk() { return terminalPk; }
    public void setTerminalPk(Long terminalPk) { this.terminalPk = terminalPk; }

    public Long getCounterId() { return counterId; }
    public void setCounterId(Long counterId) { this.counterId = counterId; }

    public LocalDateTime getLastActivityAt() { return lastActivityAt; }
    public void setLastActivityAt(LocalDateTime lastActivityAt) { this.lastActivityAt = lastActivityAt; }

    public Integer getIdleTimeoutMinutes() { return idleTimeoutMinutes; }
    public void setIdleTimeoutMinutes(Integer idleTimeoutMinutes) { this.idleTimeoutMinutes = idleTimeoutMinutes; }

    public LocalDateTime getSessionTimeoutAt() { return sessionTimeoutAt; }
    public void setSessionTimeoutAt(LocalDateTime sessionTimeoutAt) { this.sessionTimeoutAt = sessionTimeoutAt; }

    public Long getDayCloseId() { return dayCloseId; }
    public void setDayCloseId(Long dayCloseId) { this.dayCloseId = dayCloseId; }

    public Long getOwnerUserId() { return ownerUserId; }
    public void setOwnerUserId(Long ownerUserId) { this.ownerUserId = ownerUserId; }

    public LocalDateTime getCurrentHostingRefreshedAt() { return currentHostingRefreshedAt; }
    public void setCurrentHostingRefreshedAt(LocalDateTime currentHostingRefreshedAt) { this.currentHostingRefreshedAt = currentHostingRefreshedAt; }
}
