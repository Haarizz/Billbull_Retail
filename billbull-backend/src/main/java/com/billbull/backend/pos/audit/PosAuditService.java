package com.billbull.backend.pos.audit;

import org.springframework.scheduling.annotation.Async;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Fire-and-forget POS audit logging.
 *
 * Each method runs in a separate transaction (@Async + NEW propagation) so a
 * failure here never rolls back the caller's business transaction.
 */
@Service
public class PosAuditService {

    private final PosAuditLogRepository repo;
    /** A POS audit entry records when a business operation happened, so it is stamped in
     *  the Business Day timezone — the same clock as the session/checkout events it
     *  describes. The entity's field initializer remains only as a safety default for rows
     *  constructed outside this service. */
    private final com.billbull.backend.pos.businessdate.BusinessDayClock clock;

    public PosAuditService(PosAuditLogRepository repo,
                           com.billbull.backend.pos.businessdate.BusinessDayClock clock) {
        this.clock = clock;
        this.repo = repo;
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logCheckoutCompleted(Long sessionId, String terminalId, Long branchId,
                                     Long invoiceId, String invoiceNumber) {
        save(sessionId, terminalId, branchId,
                PosAuditAction.CHECKOUT_COMPLETED, "INVOICE", String.valueOf(invoiceId),
                "Checkout completed: " + invoiceNumber, null, null);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logItemVoided(Long sessionId, String terminalId, Long branchId,
                              String itemCode, String itemName, String voidReason) {
        save(sessionId, terminalId, branchId,
                PosAuditAction.ITEM_VOIDED, "INVOICE_ITEM", itemCode,
                "Item voided: " + itemName + (voidReason != null ? " — " + voidReason : ""),
                null, null);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logSessionOpened(Long sessionId, String terminalId, Long branchId) {
        save(sessionId, terminalId, branchId,
                PosAuditAction.SESSION_OPENED, "SESSION", String.valueOf(sessionId),
                "POS session opened on terminal " + terminalId, null, null);
    }

    /** Closure workflow started — the session is locked to closure operations but is still
     *  OPEN. {@code startedBy} is the identity the closure was authorized against, which is
     *  not necessarily the logged-in operator {@link #save} records. */
    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logSessionClosureStarted(Long sessionId, String terminalId, Long branchId,
                                          String startedBy) {
        save(sessionId, terminalId, branchId,
                PosAuditAction.SESSION_CLOSURE_STARTED, "SESSION", String.valueOf(sessionId),
                "POS session closure workflow started by " + startedBy
                        + ". Session remains OPEN; normal sales are locked until it is closed.",
                null, null);
    }

    /** Closure workflow cancelled by a supervisor — the session returns to normal
     *  operation. {@code reason} is free text from the supervisor; null when not supplied. */
    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logSessionClosureCancelled(Long sessionId, String terminalId, Long branchId,
                                            String startedBy, String startedAt, String reason) {
        save(sessionId, terminalId, branchId,
                PosAuditAction.SESSION_CLOSURE_CANCELLED, "SESSION", String.valueOf(sessionId),
                "POS session closure cancelled by supervisor. Closure had been started by "
                        + (startedBy != null ? startedBy : "—") + " at "
                        + (startedAt != null ? startedAt : "—")
                        + (reason != null && !reason.isBlank() ? ". Reason: " + reason : "")
                        + ". Session returned to normal operation.",
                startedAt, null);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logSessionClosed(Long sessionId, String terminalId, Long branchId,
                                  String variance) {
        save(sessionId, terminalId, branchId,
                PosAuditAction.SESSION_CLOSED, "SESSION", String.valueOf(sessionId),
                "POS session closed. Cash variance: " + variance, null, null);
    }

    /**
     * A structured session event with its financial detail carried as a parseable payload.
     *
     * <p>Cash variance events need their figures machine-readable — an auditor asking "which
     * sessions closed short above threshold last month" cannot get an answer out of a free-text
     * sentence. {@code detail} is written as {@code key=value} pairs for that reason.
     */
    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logSessionEvent(Long sessionId, String terminalId, Long branchId,
                                 String action, String detail) {
        PosAuditAction resolved;
        try {
            resolved = PosAuditAction.valueOf(action);
        } catch (IllegalArgumentException e) {
            resolved = PosAuditAction.SUPERVISOR_OVERRIDE;
        }
        save(sessionId, terminalId, branchId,
                resolved, "SESSION", String.valueOf(sessionId), detail, null, null);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logCashMovement(Long sessionId, String terminalId, Long branchId,
                                 String movementType, String amount) {
        PosAuditAction action = "DROP_IN".equals(movementType)
                ? PosAuditAction.CASH_DROP_IN : PosAuditAction.CASH_DROP_OUT;
        save(sessionId, terminalId, branchId,
                action, "SESSION", String.valueOf(sessionId),
                movementType + " of " + amount, null, null);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logCashMovementEdited(Long sessionId, String terminalId, Long branchId,
                                       Long movementId, String oldJson, String newJson) {
        save(sessionId, terminalId, branchId,
                PosAuditAction.CASH_MOVEMENT_EDITED, "CASH_MOVEMENT", String.valueOf(movementId),
                "Cash movement description/reference edited", oldJson, newJson);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logCashMovementVoided(Long sessionId, String terminalId, Long branchId,
                                       Long movementId, String voidReason, String oldJson, String newJson) {
        save(sessionId, terminalId, branchId,
                PosAuditAction.CASH_MOVEMENT_VOIDED, "CASH_MOVEMENT", String.valueOf(movementId),
                "Cash movement voided: " + voidReason, oldJson, newJson);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logLayawayCreated(Long sessionId, String terminalId, Long branchId,
                                   Long layawayId, String layawayNumber) {
        save(sessionId, terminalId, branchId,
                PosAuditAction.LAYAWAY_CREATED, "LAYAWAY", String.valueOf(layawayId),
                "Layaway created: " + layawayNumber, null, null);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logLayawayCancelled(Long sessionId, String terminalId, Long branchId,
                                     Long layawayId, String layawayNumber) {
        save(sessionId, terminalId, branchId,
                PosAuditAction.LAYAWAY_CANCELLED, "LAYAWAY", String.valueOf(layawayId),
                "Layaway cancelled: " + layawayNumber, null, null);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logReturnInitiated(Long sessionId, String terminalId, Long branchId,
                                    Long returnId, String originalInvoiceNumber) {
        save(sessionId, terminalId, branchId,
                PosAuditAction.RETURN_INITIATED, "RETURN", String.valueOf(returnId),
                "Return initiated for invoice: " + originalInvoiceNumber, null, null);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logReceiptReprinted(Long sessionId, String terminalId, Long branchId,
                                     Long invoiceId, String invoiceNumber) {
        save(sessionId, terminalId, branchId,
                PosAuditAction.RECEIPT_REPRINTED, "INVOICE", String.valueOf(invoiceId),
                "Receipt reprinted for invoice: " + invoiceNumber, null, null);
    }

    /**
     * Reprint audit with the reprinting operator passed in explicitly.
     *
     * <p>A reprint is routinely performed by someone other than the cashier who created the
     * invoice, so the entry has to name the person who pressed Print — and {@link #save}'s own
     * {@code currentUser()} cannot supply it: this method is {@code @Async} and no
     * SecurityContext is propagated to the executor thread, so the ambient principal there is
     * empty. The caller captures the username on the request thread and hands it over.
     * The invoice's own createdBy is never touched by this trail.
     */
    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logReceiptReprinted(Long sessionId, String terminalId, Long branchId,
                                     Long invoiceId, String invoiceNumber, String reprintedBy) {
        save(sessionId, terminalId, branchId,
                PosAuditAction.RECEIPT_REPRINTED, "INVOICE", String.valueOf(invoiceId),
                "Receipt reprinted for invoice: " + invoiceNumber
                        + (reprintedBy != null && !reprintedBy.isBlank() ? " by " + reprintedBy : ""),
                null, null, reprintedBy);
    }

    /**
     * A supervisor authorized one pending checkout to complete after the Business
     * Day had already closed.
     *
     * <p>Synchronous and unconditional: a sale rung
     * up after normal selling stopped must never be indistinguishable from one rung
     * up during trading. Its invoice still carries the closed Business Day's Trading
     * Date, so this entry is what explains, at Day Close or in a later audit, why a
     * transaction exists past the closure time.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logBusinessDayClosedCheckoutAuthorized(Long branchId, Long sessionId, String terminalId,
                                                        String tradingDate, String closedAt) {
        save(sessionId, terminalId, branchId,
                PosAuditAction.BUSINESS_DAY_CLOSED_CHECKOUT_AUTHORIZED, "BUSINESS_DAY", tradingDate,
                "Supervisor authorized a pending checkout after Business Day " + tradingDate
                        + " closed at " + closedAt,
                closedAt, null);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logDeliverySettlementAuthorized(Long sessionId, String terminalId, Long branchId, Long invoiceId, String invoiceNumber) {
        save(sessionId, terminalId, branchId, PosAuditAction.DELIVERY_SETTLEMENT_AUTHORIZED, "SALES_INVOICE", String.valueOf(invoiceId),
                "Supervisor authorized delivery settlement for invoice " + invoiceNumber, null, null);
    }

    // ── Terminal Auto-Archive lifecycle ─────────────────────────────────────

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logTerminalStale(String terminalId, Long branchId, int daysInactive) {
        save(null, terminalId, branchId, PosAuditAction.TERMINAL_STALE, "TERMINAL", terminalId,
                "Terminal marked STALE after " + daysInactive + " day(s) of inactivity", null, null);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logTerminalStaleWarningSent(String terminalId, Long branchId, int daysInactive, int daysUntilArchive) {
        save(null, terminalId, branchId, PosAuditAction.TERMINAL_STALE_WARNING_SENT, "TERMINAL", terminalId,
                "Stale warning sent: inactive " + daysInactive + " day(s), archiving in " + daysUntilArchive + " day(s)",
                null, null);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logTerminalRecoveredFromStale(String terminalId, Long branchId, String source) {
        save(null, terminalId, branchId, PosAuditAction.TERMINAL_RECOVERED_FROM_STALE, "TERMINAL", terminalId,
                "Terminal recovered from STALE due to new activity (" + source + ")", null, null);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logTerminalAutoArchived(String terminalId, Long branchId, String reason) {
        save(null, terminalId, branchId, PosAuditAction.TERMINAL_AUTO_ARCHIVED, "TERMINAL", terminalId,
                reason, null, null);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logTerminalManualArchived(String terminalId, Long branchId, String adminUser, String reason) {
        save(null, terminalId, branchId, PosAuditAction.TERMINAL_MANUAL_ARCHIVED, "TERMINAL", terminalId,
                reason + " (by " + adminUser + ")", null, null);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logTerminalRestored(String terminalId, Long branchId, String adminUser) {
        save(null, terminalId, branchId, PosAuditAction.TERMINAL_RESTORED, "TERMINAL", terminalId,
                "Terminal restored by " + adminUser, null, null);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logTerminalKeptActive(String terminalId, Long branchId, String adminUser) {
        save(null, terminalId, branchId, PosAuditAction.TERMINAL_KEPT_ACTIVE, "TERMINAL", terminalId,
                "Terminal kept active by " + adminUser, null, null);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logTerminalExemptChanged(String terminalId, Long branchId, String adminUser, boolean exempt) {
        save(null, terminalId, branchId, PosAuditAction.TERMINAL_EXEMPT_CHANGED, "TERMINAL", terminalId,
                (exempt ? "Exempted from auto-archive" : "Auto-archive exemption removed") + " by " + adminUser,
                null, null);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logTerminalDecommissioned(String terminalId, Long branchId, String adminUser, String reason) {
        save(null, terminalId, branchId, PosAuditAction.TERMINAL_DECOMMISSIONED, "TERMINAL", terminalId,
                reason + " (by " + adminUser + ")", null, null);
    }

    // ── core save ────────────────────────────────────────────────────────────

    private void save(Long sessionId, String terminalId, Long branchId,
                      PosAuditAction action, String entityType, String entityId,
                      String description, String oldJson, String newJson) {
        save(sessionId, terminalId, branchId, action, entityType, entityId,
                description, oldJson, newJson, null);
    }

    /** {@code userId} overrides the ambient principal — see the reprint overload for why. */
    private void save(Long sessionId, String terminalId, Long branchId,
                      PosAuditAction action, String entityType, String entityId,
                      String description, String oldJson, String newJson, String userId) {
        try {
            PosAuditLog log = new PosAuditLog();
            log.setSessionId(sessionId);
            log.setTerminalId(terminalId);
            log.setBranchId(branchId);
            log.setUserId(userId != null && !userId.isBlank() ? userId : currentUser());
            log.setAction(action);
            log.setEntityType(entityType);
            log.setEntityId(entityId);
            log.setDescription(description);
            log.setOldValueJson(oldJson);
            log.setNewValueJson(newJson);
            log.setCreatedAt(clock.now());
            repo.save(log);
        } catch (Exception e) {
            // Audit failures must never propagate to the caller.
        }
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }
}
