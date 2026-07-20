package com.billbull.backend.sales.invoice.history;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * One row of an invoice's activity timeline.
 *
 * `timestamp` is intentionally nullable: derived document-lineage events (the invoice
 * carries a linked SO/DN/PI/QT number, but nothing recorded WHEN it was linked) have no
 * honest time. Those come back with timestamp=null and derived=true so the UI can render
 * "Time not recorded" instead of inventing one.
 */
public class SalesInvoiceHistoryResponse {

    private Long id;
    private String eventType;
    private String title;
    private String linkedDocumentNumber;
    private String linkedDocumentType;
    private BigDecimal amount;
    private List<String> changes;
    private String username;
    private LocalDateTime timestamp;
    private boolean derived;

    public SalesInvoiceHistoryResponse() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String eventType) {
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

    public List<String> getChanges() {
        return changes;
    }

    public void setChanges(List<String> changes) {
        this.changes = changes;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }

    public boolean isDerived() {
        return derived;
    }

    public void setDerived(boolean derived) {
        this.derived = derived;
    }
}
