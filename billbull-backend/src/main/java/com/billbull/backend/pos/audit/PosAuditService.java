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
