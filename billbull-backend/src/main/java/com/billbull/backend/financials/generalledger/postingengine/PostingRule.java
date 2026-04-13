package com.billbull.backend.financials.generalledger.postingengine;

import jakarta.persistence.*;

@Entity
@Table(name = "posting_rules")
public class PostingRule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String transactionType; // SALES_INVOICE, PURCHASE_INVOICE, PAYMENT_VOUCHER, RECEIPT_VOUCHER, EXPENSE,
                                    // GRN

    @Column(nullable = false)
    private String lineLabel; // e.g. "Accounts Receivable", "Sales Revenue", "VAT Output"

    private String debitAccountCode; // COA code — null if this line is a credit
    private String creditAccountCode; // COA code — null if this line is a debit

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false)
    private Boolean isActive = true;

    private Integer sortOrder;

    public PostingRule() {
    }

    // --- GETTERS & SETTERS ---
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getTransactionType() {
        return transactionType;
    }

    public void setTransactionType(String transactionType) {
        this.transactionType = transactionType;
    }

    public String getLineLabel() {
        return lineLabel;
    }

    public void setLineLabel(String lineLabel) {
        this.lineLabel = lineLabel;
    }

    public String getDebitAccountCode() {
        return debitAccountCode;
    }

    public void setDebitAccountCode(String debitAccountCode) {
        this.debitAccountCode = debitAccountCode;
    }

    public String getCreditAccountCode() {
        return creditAccountCode;
    }

    public void setCreditAccountCode(String creditAccountCode) {
        this.creditAccountCode = creditAccountCode;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Boolean getIsActive() {
        return isActive;
    }

    public void setIsActive(Boolean isActive) {
        this.isActive = isActive;
    }

    public Integer getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
    }
}
