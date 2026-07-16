package com.billbull.backend.sales.invoice.history;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Append-only activity trail for a single Sales Invoice — created/edited/confirmed/
 * cancelled/paid/printed plus document-lineage links.
 *
 * Deliberately does NOT extend BaseEntity: that class's @CreatedBy/@LastModifiedBy/
 * isActive auditing semantics are meant for mutable domain rows, whereas these rows
 * are written once and never updated or soft-deleted.
 *
 * Separate from the three existing audit subsystems (financials/audit, security/AuditLog,
 * pos/audit) — those are compliance / RBAC / POS trails with freeform TEXT details.
 * This one carries typed columns (amount, linked document, change list) that a document
 * timeline needs to render without parsing a blob.
 */
@Entity
@Table(
        name = "sales_invoice_history_events",
        indexes = {
                @Index(name = "ix_sales_invoice_history_invoice", columnList = "invoiceId"),
                @Index(name = "ix_sales_invoice_history_invoice_ts", columnList = "invoiceId,eventTimestamp")
        }
)
public class SalesInvoiceHistoryEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long invoiceId;

    private Long branchId;

    /** Stored as VARCHAR — see SalesInvoiceHistoryEventType for why there is no CHECK constraint. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private SalesInvoiceHistoryEventType eventType;

    /** Human-readable summary, e.g. "Invoice confirmed with Credit payment terms". */
    @Column(nullable = false, length = 500)
    private String title;

    /** e.g. "SO-2024-0012" — set for LINKED_DOCUMENT and PAYMENT_RECEIVED (voucher no). */
    private String linkedDocumentNumber;

    /** e.g. "SALES_ORDER", "PROFORMA", "QUOTATION", "DELIVERY_NOTE", "RECEIPT_VOUCHER". */
    private String linkedDocumentType;

    /** Money tied to the event (payment amount); null when not applicable. */
    @Column(precision = 19, scale = 2)
    private BigDecimal amount;

    /** JSON array of "Field: old -> new" strings for UPDATED events. */
    @Column(columnDefinition = "TEXT")
    private String changeDetails;

    private String username;

    @Column(nullable = false)
    private LocalDateTime eventTimestamp;

    @PrePersist
    protected void onCreate() {
        if (eventTimestamp == null) {
            eventTimestamp = LocalDateTime.now();
        }
    }

    public SalesInvoiceHistoryEvent() {
    }

    // --- GETTERS & SETTERS ---
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getInvoiceId() {
        return invoiceId;
    }

    public void setInvoiceId(Long invoiceId) {
        this.invoiceId = invoiceId;
    }

    public Long getBranchId() {
        return branchId;
    }

    public void setBranchId(Long branchId) {
        this.branchId = branchId;
    }

    public SalesInvoiceHistoryEventType getEventType() {
        return eventType;
    }

    public void setEventType(SalesInvoiceHistoryEventType eventType) {
        this.eventType = eventType;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getLinkedDocumentNumber() {
        return linkedDocumentNumber;
    }

    public void setLinkedDocumentNumber(String linkedDocumentNumber) {
        this.linkedDocumentNumber = linkedDocumentNumber;
    }

    public String getLinkedDocumentType() {
        return linkedDocumentType;
    }

    public void setLinkedDocumentType(String linkedDocumentType) {
        this.linkedDocumentType = linkedDocumentType;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public String getChangeDetails() {
        return changeDetails;
    }

    public void setChangeDetails(String changeDetails) {
        this.changeDetails = changeDetails;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public LocalDateTime getEventTimestamp() {
        return eventTimestamp;
    }

    public void setEventTimestamp(LocalDateTime eventTimestamp) {
        this.eventTimestamp = eventTimestamp;
    }
}
