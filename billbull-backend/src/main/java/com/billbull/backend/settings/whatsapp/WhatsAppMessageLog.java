package com.billbull.backend.settings.whatsapp;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * One row per document sent over WhatsApp — the audit trail and the target of webhook status
 * updates (matched on {@link #wamid}). A failed attempt is logged too, with the Meta error, so
 * "why didn't the customer get it" is answerable from the quotation itself.
 */
@Entity
// Indexes (document lookup + unique wamid) are created by V110__whatsapp_integration.sql.
@Table(name = "whatsapp_message_logs")
public class WhatsAppMessageLog extends BaseEntity {

    /** QUOTATION, SALES_INVOICE, ... — free text so new document types need no migration. */
    @Column(name = "document_type", length = 40, nullable = false)
    private String documentType;

    @Column(name = "document_id")
    private Long documentId;

    @Column(name = "document_no", length = 100)
    private String documentNo;

    @Column(name = "branch_id")
    private Long branchId;

    /** Digits-only international number the message was sent to. */
    @Column(name = "to_phone", length = 20, nullable = false)
    private String toPhone;

    @Column(name = "template_name", length = 512)
    private String templateName;

    /** WhatsApp message id returned by Meta; null when the send failed before Meta accepted it. */
    @Column(name = "wamid", length = 128)
    private String wamid;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 20, nullable = false)
    private WhatsAppMessageStatus status;

    @Column(name = "error_code")
    private Integer errorCode;

    @Column(name = "error_message", length = 1000)
    private String errorMessage;

    @Column(name = "status_updated_at")
    private LocalDateTime statusUpdatedAt;

    public String getDocumentType() { return documentType; }
    public void setDocumentType(String documentType) { this.documentType = documentType; }

    public Long getDocumentId() { return documentId; }
    public void setDocumentId(Long documentId) { this.documentId = documentId; }

    public String getDocumentNo() { return documentNo; }
    public void setDocumentNo(String documentNo) { this.documentNo = documentNo; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getToPhone() { return toPhone; }
    public void setToPhone(String toPhone) { this.toPhone = toPhone; }

    public String getTemplateName() { return templateName; }
    public void setTemplateName(String templateName) { this.templateName = templateName; }

    public String getWamid() { return wamid; }
    public void setWamid(String wamid) { this.wamid = wamid; }

    public WhatsAppMessageStatus getStatus() { return status; }
    public void setStatus(WhatsAppMessageStatus status) { this.status = status; }

    public Integer getErrorCode() { return errorCode; }
    public void setErrorCode(Integer errorCode) { this.errorCode = errorCode; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage != null && errorMessage.length() > 1000 ? errorMessage.substring(0, 1000) : errorMessage;
    }

    public LocalDateTime getStatusUpdatedAt() { return statusUpdatedAt; }
    public void setStatusUpdatedAt(LocalDateTime statusUpdatedAt) { this.statusUpdatedAt = statusUpdatedAt; }
}
