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

    public PosAuditService(PosAuditLogRepository repo) {
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

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logSessionClosed(Long sessionId, String terminalId, Long branchId,
                                  String variance) {
        save(sessionId, terminalId, branchId,
                PosAuditAction.SESSION_CLOSED, "SESSION", String.valueOf(sessionId),
                "POS session closed. Cash variance: " + variance, null, null);
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
        try {
            PosAuditLog log = new PosAuditLog();
            log.setSessionId(sessionId);
            log.setTerminalId(terminalId);
            log.setBranchId(branchId);
            log.setUserId(currentUser());
            log.setAction(action);
            log.setEntityType(entityType);
            log.setEntityId(entityId);
            log.setDescription(description);
            log.setOldValueJson(oldJson);
            log.setNewValueJson(newJson);
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
