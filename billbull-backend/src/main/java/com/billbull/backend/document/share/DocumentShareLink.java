package com.billbull.backend.document.share;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * A public, unguessable link to one sales document — what the WhatsApp message carries when the
 * Meta API is not set up. Only the SHA-256 of the token is stored. The document HTML is a snapshot
 * taken when the link is made; the amounts and status on the page are read live from the document.
 * Clearing {@code isActive} revokes the link. Indexes come from V145__document_share_links.sql.
 */
@Entity
@Table(name = "document_share_links")
public class DocumentShareLink extends BaseEntity {

    @Column(name = "token_hash", length = 64, nullable = false, unique = true)
    private String tokenHash;

    /** A {@code WhatsAppDocumentType} name: QUOTATION, SALES_ORDER, SALES_INVOICE. */
    @Column(name = "document_type", length = 40, nullable = false)
    private String documentType;

    @Column(name = "document_id", nullable = false)
    private Long documentId;

    @Column(name = "document_no", length = 100)
    private String documentNo;

    @Column(name = "branch_id")
    private Long branchId;

    /** Display label overriding the type's own ("Receipt" for a POS sale); null = default. V146. */
    @Column(name = "document_label", length = 40)
    private String documentLabel;

    @Column(name = "html", columnDefinition = "TEXT", nullable = false)
    private String html;

    /** Rendered from {@link #html} on the first PDF request. */
    @Column(name = "pdf", columnDefinition = "bytea")
    private byte[] pdf;

    /** Null = never expires. */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "view_count", nullable = false)
    private int viewCount;

    @Column(name = "last_viewed_at")
    private LocalDateTime lastViewedAt;

    public String getTokenHash() { return tokenHash; }
    public void setTokenHash(String tokenHash) { this.tokenHash = tokenHash; }

    public String getDocumentType() { return documentType; }
    public void setDocumentType(String documentType) { this.documentType = documentType; }

    public Long getDocumentId() { return documentId; }
    public void setDocumentId(Long documentId) { this.documentId = documentId; }

    public String getDocumentNo() { return documentNo; }
    public void setDocumentNo(String documentNo) { this.documentNo = documentNo; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getDocumentLabel() { return documentLabel; }
    public void setDocumentLabel(String documentLabel) { this.documentLabel = documentLabel; }

    public String getHtml() { return html; }
    public void setHtml(String html) { this.html = html; }

    public byte[] getPdf() { return pdf; }
    public void setPdf(byte[] pdf) { this.pdf = pdf; }

    public LocalDateTime getExpiresAt() { return expiresAt; }
    public void setExpiresAt(LocalDateTime expiresAt) { this.expiresAt = expiresAt; }

    public int getViewCount() { return viewCount; }
    public void setViewCount(int viewCount) { this.viewCount = viewCount; }

    public LocalDateTime getLastViewedAt() { return lastViewedAt; }
    public void setLastViewedAt(LocalDateTime lastViewedAt) { this.lastViewedAt = lastViewedAt; }

    public boolean isExpired(LocalDateTime now) {
        return expiresAt != null && !now.isBefore(expiresAt);
    }
}
