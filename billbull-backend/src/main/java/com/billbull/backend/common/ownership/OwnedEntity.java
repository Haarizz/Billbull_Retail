package com.billbull.backend.common.ownership;

/**
 * Marks an entity that carries a stable ownership owner id for user-based data visibility
 * (ownership filtering). Implemented by {@code common.BaseEntity} AND by the several standalone
 * transactional aggregate roots that do NOT extend BaseEntity (SalesInvoice, SalesOrder, Quotation,
 * ProformaInvoice, DeliveryNote, SalesReturn, Payment, JournalEntry, Expense, PaymentVoucher) —
 * these declare their own {@code @Id}/audit fields and so cannot inherit the owner column from
 * BaseEntity.
 *
 * <p>{@link OwnershipAuditListener} stamps {@code createdByUserId} on persist for any entity that
 * implements this interface, so the write-path owner capture is uniform across both entity families.
 * The read-path enforcement ({@code OwnershipAccessService.assertCanAccessRecord} /
 * {@code filterOwned}) simply reads {@link #getCreatedByUserId()}.
 *
 * <p>Nullable forever: system/seeder/unauthenticated writes leave it null (treated as "unowned").
 */
public interface OwnedEntity {

    Long getCreatedByUserId();

    void setCreatedByUserId(Long createdByUserId);
}
