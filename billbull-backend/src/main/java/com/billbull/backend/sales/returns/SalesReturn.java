package com.billbull.backend.sales.returns;

import com.billbull.backend.settings.branch.Branch;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Entity
@Table(name = "sales_returns", indexes = {
    @Index(name = "idx_sales_return_branch", columnList = "branch_id"),
    // Speeds the date-bounded sales-report loader.
    @Index(name = "idx_sales_return_date", columnList = "return_date")
})
@JsonIgnoreProperties({ "hibernateLazyInitializer", "handler" })
@jakarta.persistence.EntityListeners(com.billbull.backend.common.ownership.OwnershipAuditListener.class)
@org.hibernate.annotations.Filter(name = "ownerFilter", condition = "created_by_user_id = :ownerId")
public class SalesReturn  implements com.billbull.backend.common.ownership.OwnedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Stable owner id for ownership filtering; stamped on persist by OwnershipAuditListener. Nullable forever. */
    @jakarta.persistence.Column(name = "created_by_user_id", updatable = false)
    private Long createdByUserId;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "branch_id")
    private Branch branch;

    @Column(unique = true)
    private String returnNumber;

    private LocalDate returnDate;
    private String customerCode;
    private String customerName;
    private String linkedInvoice;

    @Column(precision = 15, scale = 2)
    private BigDecimal subTotal;
    @Column(precision = 15, scale = 2)
    private BigDecimal taxAmount;
    @Column(precision = 15, scale = 2)
    private BigDecimal totalAmount;

    // Snapshot of the linked invoice's VAT mode at return-creation time, so the
    // UI can restore the correct Inclusive/Exclusive interpretation when a
    // draft return is reopened for editing without re-fetching the invoice.
    private Boolean taxInclusive;

    private String reason;
    private String returnAction; // Credit Note, Refund, Replacement

    // ----- §14 Refund settlement -------------------------------------------------
    // Previously the refund method lived inside internalNotes as prose, which made it
    // impossible to report or reconcile on. Stored structurally from here on; historic
    // rows stay null and are read through SalesReturnRefundMethod.fromLegacyLabel().

    @Enumerated(EnumType.STRING)
    @Column(name = "refund_method", length = 30)
    private SalesReturnRefundMethod refundMethod;

    /** Cash/card/voucher value actually refunded. Equals totalAmount unless partially settled. */
    @Column(name = "refund_amount", precision = 15, scale = 2)
    private BigDecimal refundAmount;

    // ----- §6/§20 Entry-point provenance and POS context -------------------------

    @Enumerated(EnumType.STRING)
    @Column(name = "entry_point", length = 20)
    private SalesReturnEntryPoint entryPoint;

    /** POS session the return was raised in. Null for back-office returns. */
    @Column(name = "pos_session_id")
    private Long posSessionId;

    /** POS terminal identifier, mirroring SalesInvoice.posTerminalId. */
    @Column(name = "pos_terminal_id", length = 100)
    private String posTerminalId;

    @Column(name = "pos_counter_name", length = 100)
    private String posCounterName;

    /** Trading/business date of the POS session, which can differ from returnDate at day boundaries. */
    @Column(name = "trading_date")
    private LocalDate tradingDate;

    // ----- Customer contact snapshot (§8 search by mobile, §30 voucher print) -----

    @Column(name = "customer_mobile", length = 50)
    private String customerMobile;

    /** Receipt number of the original POS sale, when the linked invoice was a POS transaction. */
    @Column(name = "linked_receipt_number", length = 100)
    private String linkedReceiptNumber;

    // ----- §15 Authorization ------------------------------------------------------

    @Column(name = "authorized_by_user_id")
    private Long authorizedByUserId;

    @Column(name = "authorized_by_username", length = 150)
    private String authorizedByUsername;

    @Column(name = "authorized_at")
    private java.time.LocalDateTime authorizedAt;

    /** Why approval was required (e.g. HIGH_VALUE_CASH_REFUND, RETURN_WINDOW_EXPIRED). */
    @Column(name = "authorization_reason", length = 100)
    private String authorizationReason;

    @Column(length = 1000)
    private String internalNotes;

    @Enumerated(EnumType.STRING)
    private SalesReturnStatus status;

    // ARCHFIX §1.6: LAZY (was EAGER). Read paths that serialize items use a JOIN FETCH finder
    // (findAllWithItems / findByIdWithItems); the nested batches load via @BatchSize on the item.
    @OneToMany(mappedBy = "salesReturn", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @JsonManagedReference
    @org.hibernate.annotations.BatchSize(size = 50)
    private List<SalesReturnItem> items;

    /* ===== GETTERS & SETTERS ===== */

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Branch getBranch() { return branch; }
    public void setBranch(Branch branch) { this.branch = branch; }

    public String getReturnNumber() {
        return returnNumber;
    }

    public void setReturnNumber(String returnNumber) {
        this.returnNumber = returnNumber;
    }

    public LocalDate getReturnDate() {
        return returnDate;
    }

    public void setReturnDate(LocalDate returnDate) {
        this.returnDate = returnDate;
    }

    public String getCustomerCode() {
        return customerCode;
    }

    public void setCustomerCode(String customerCode) {
        this.customerCode = customerCode;
    }

    public String getCustomerName() {
        return customerName;
    }

    public void setCustomerName(String customerName) {
        this.customerName = customerName;
    }

    public String getLinkedInvoice() {
        return linkedInvoice;
    }

    public void setLinkedInvoice(String linkedInvoice) {
        this.linkedInvoice = linkedInvoice;
    }

    public BigDecimal getSubTotal() {
        return subTotal;
    }

    public void setSubTotal(BigDecimal subTotal) {
        this.subTotal = subTotal;
    }

    public BigDecimal getTaxAmount() {
        return taxAmount;
    }

    public void setTaxAmount(BigDecimal taxAmount) {
        this.taxAmount = taxAmount;
    }

    public BigDecimal getTotalAmount() {
        return totalAmount;
    }

    public void setTotalAmount(BigDecimal totalAmount) {
        this.totalAmount = totalAmount;
    }

    public Boolean getTaxInclusive() {
        return taxInclusive;
    }

    public void setTaxInclusive(Boolean taxInclusive) {
        this.taxInclusive = taxInclusive;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public String getReturnAction() {
        return returnAction;
    }

    public void setReturnAction(String returnAction) {
        this.returnAction = returnAction;
    }

    public String getInternalNotes() {
        return internalNotes;
    }

    public void setInternalNotes(String internalNotes) {
        this.internalNotes = internalNotes;
    }

    public SalesReturnRefundMethod getRefundMethod() { return refundMethod; }
    public void setRefundMethod(SalesReturnRefundMethod refundMethod) { this.refundMethod = refundMethod; }

    public BigDecimal getRefundAmount() { return refundAmount; }
    public void setRefundAmount(BigDecimal refundAmount) { this.refundAmount = refundAmount; }

    public SalesReturnEntryPoint getEntryPoint() { return entryPoint; }
    public void setEntryPoint(SalesReturnEntryPoint entryPoint) { this.entryPoint = entryPoint; }

    public Long getPosSessionId() { return posSessionId; }
    public void setPosSessionId(Long posSessionId) { this.posSessionId = posSessionId; }

    public String getPosTerminalId() { return posTerminalId; }
    public void setPosTerminalId(String posTerminalId) { this.posTerminalId = posTerminalId; }

    public String getPosCounterName() { return posCounterName; }
    public void setPosCounterName(String posCounterName) { this.posCounterName = posCounterName; }

    public LocalDate getTradingDate() { return tradingDate; }
    public void setTradingDate(LocalDate tradingDate) { this.tradingDate = tradingDate; }

    public String getCustomerMobile() { return customerMobile; }
    public void setCustomerMobile(String customerMobile) { this.customerMobile = customerMobile; }

    public String getLinkedReceiptNumber() { return linkedReceiptNumber; }
    public void setLinkedReceiptNumber(String linkedReceiptNumber) { this.linkedReceiptNumber = linkedReceiptNumber; }

    public Long getAuthorizedByUserId() { return authorizedByUserId; }
    public void setAuthorizedByUserId(Long authorizedByUserId) { this.authorizedByUserId = authorizedByUserId; }

    public String getAuthorizedByUsername() { return authorizedByUsername; }
    public void setAuthorizedByUsername(String authorizedByUsername) { this.authorizedByUsername = authorizedByUsername; }

    public java.time.LocalDateTime getAuthorizedAt() { return authorizedAt; }
    public void setAuthorizedAt(java.time.LocalDateTime authorizedAt) { this.authorizedAt = authorizedAt; }

    public String getAuthorizationReason() { return authorizationReason; }
    public void setAuthorizationReason(String authorizationReason) { this.authorizationReason = authorizationReason; }

    /**
     * The credit voucher issued by this return, populated only in the response to the approval
     * that created it. Transient — the voucher is its own persisted entity, linked back by
     * {@code sourceReturnNumber}; this just saves the client a second round trip to fetch the
     * code, balance and expiry it needs to display and print immediately.
     */
    @Transient
    private com.billbull.backend.sales.voucher.CreditVoucherResponse issuedVoucher;

    public com.billbull.backend.sales.voucher.CreditVoucherResponse getIssuedVoucher() { return issuedVoucher; }
    public void setIssuedVoucher(com.billbull.backend.sales.voucher.CreditVoucherResponse issuedVoucher) {
        this.issuedVoucher = issuedVoucher;
    }

    public SalesReturnStatus getStatus() {
        return status;
    }

    public void setStatus(SalesReturnStatus status) {
        this.status = status;
    }

    public List<SalesReturnItem> getItems() {
        return items;
    }

    public void setItems(List<SalesReturnItem> items) {
        this.items = items;
    }

    @Override
    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    @Override
    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }
}
