package com.billbull.backend.pos.checkout.attempt;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One row of {@code pos_checkout_attempts}, read through JDBC (Phase 0 / M2).
 *
 * <p>Not a JPA entity and not a {@code BaseEntity}, deliberately. The journal's correctness rests
 * on exact SQL: a {@code FOR UPDATE} on the session row, {@code INSERT ... ON CONFLICT DO NOTHING},
 * {@code FOR UPDATE NOWAIT} on the attempt row, and fenced {@code UPDATE ... WHERE owner_token = ?
 * AND fence = ?} statements whose row count is the ownership proof. A managed entity would add a
 * persistence-context copy that can be stale relative to the row lock, and dirty checking that
 * could write a row the caller no longer owns.
 *
 * <p>{@code leaseExpired} is computed by the database ({@code lease_expires_at < now()}) in the
 * same statement that read the row, so it never depends on a JVM clock.
 */
public record PosCheckoutAttempt(
        UUID id,
        String checkoutKey,
        String keySource,
        String requestHash,
        int hashVersion,
        String tenantDb,
        Long branchId,
        Long sessionId,
        String terminalId,
        String initiatedBy,
        PosCheckoutAttemptState state,
        UUID ownerToken,
        long fence,
        String ownerInstance,
        OffsetDateTime leaseExpiresAt,
        boolean leaseExpired,
        int attemptCount,
        String lastStep,
        Long invoiceId,
        String invoiceNumber,
        OffsetDateTime invoiceSavedAt,
        OffsetDateTime invoicePostedAt,
        Integer paymentLegsExpected,
        int paymentLegsRecorded,
        Boolean sessionStepRequired,
        OffsetDateTime sessionRecordedAt,
        OffsetDateTime completedAt,
        Boolean serialsStepRequired,
        OffsetDateTime serialsMarkedAt,
        Boolean salesOrderStepRequired,
        OffsetDateTime salesOrderCompletedAt,
        String salesOrderOutcome,
        OffsetDateTime qrArchivedAt,
        OffsetDateTime statsRecordedAt,
        String outcomeDetail,
        String resolvedBy,
        String resolutionReason) {

    /** Any business write under this attempt has been committed. */
    public boolean hasWriteEvidence() {
        return invoiceId != null || invoiceSavedAt != null;
    }

    /** Every step this attempt needs has committed its evidence. */
    public boolean allStepsRecorded() {
        if (invoicePostedAt == null) return false;
        if (paymentLegsExpected != null && paymentLegsRecorded < paymentLegsExpected) return false;
        if (Boolean.TRUE.equals(sessionStepRequired) && sessionRecordedAt == null) return false;
        if (Boolean.TRUE.equals(serialsStepRequired) && serialsMarkedAt == null) return false;
        // A Sales Order conversion that failed is still decided: the sale stands with a visible
        // balance, exactly as before M2. Only an undecided one keeps the attempt incomplete.
        return !Boolean.TRUE.equals(salesOrderStepRequired) || salesOrderCompletedAt != null || salesOrderOutcome != null;
    }
}
