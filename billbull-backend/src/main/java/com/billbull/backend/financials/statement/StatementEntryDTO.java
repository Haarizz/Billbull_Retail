package com.billbull.backend.financials.statement;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public class StatementEntryDTO {

    private LocalDate transactionDate;
    private LocalDateTime transactionDateTime; // For sorting accurate intra-day
    private String documentNo;
    private String type; // INVOICE, PAYMENT, OPENING, CANCELLED, etc.
    private BigDecimal debit;
    private BigDecimal credit;
    private BigDecimal runningBalance;
    private String status;
    // QA-018: narration + cross-ref shown in Customer/Vendor SoA.
    private String description;
    private String reference;
    // Display-order priority (0 = first, 99 = last). Set during enrichment before sorting.
    private int sortPriority = 4;

    public StatementEntryDTO() {
    }

    public StatementEntryDTO(LocalDate transactionDate, LocalDateTime transactionDateTime, String documentNo,
            String type, BigDecimal debit, BigDecimal credit) {
        this.transactionDate = transactionDate;
        this.transactionDateTime = transactionDateTime != null ? transactionDateTime : transactionDate.atStartOfDay();
        this.documentNo = documentNo;
        this.type = type;
        this.debit = debit != null ? debit : BigDecimal.ZERO; // Prevent nulls
        this.credit = credit != null ? credit : BigDecimal.ZERO;
    }

    public StatementEntryDTO(LocalDate transactionDate, LocalDateTime transactionDateTime, String documentNo,
            String type, BigDecimal debit, BigDecimal credit, String status) {
        this(transactionDate, transactionDateTime, documentNo, type, debit, credit);
        this.status = status;
    }

    public StatementEntryDTO(LocalDate transactionDate, LocalDateTime transactionDateTime, String documentNo,
            String type, Double debit, Double credit, String status) {
        this(transactionDate, transactionDateTime, documentNo, type,
                debit != null ? BigDecimal.valueOf(debit) : BigDecimal.ZERO,
                credit != null ? BigDecimal.valueOf(credit) : BigDecimal.ZERO);
        this.status = status;
    }

    public StatementEntryDTO(LocalDate transactionDate, String documentNo, String type, Double debit, Double credit,
            String status) {
        this(transactionDate, null, documentNo, type, debit, credit, status);
    }

    public StatementEntryDTO(LocalDate transactionDate, String documentNo, String type, BigDecimal debit,
            BigDecimal credit, String status) {
        this(transactionDate, null, documentNo, type, debit, credit, status);
    }

    // Getters and Setters
    public LocalDate getTransactionDate() {
        return transactionDate;
    }

    public void setTransactionDate(LocalDate transactionDate) {
        this.transactionDate = transactionDate;
    }

    public LocalDateTime getTransactionDateTime() {
        return transactionDateTime;
    }

    public void setTransactionDateTime(LocalDateTime transactionDateTime) {
        this.transactionDateTime = transactionDateTime;
    }

    public String getDocumentNo() {
        return documentNo;
    }

    public void setDocumentNo(String documentNo) {
        this.documentNo = documentNo;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public BigDecimal getDebit() {
        return debit;
    }

    public void setDebit(BigDecimal debit) {
        this.debit = debit;
    }

    public BigDecimal getCredit() {
        return credit;
    }

    public void setCredit(BigDecimal credit) {
        this.credit = credit;
    }

    public BigDecimal getRunningBalance() {
        return runningBalance;
    }

    public void setRunningBalance(BigDecimal runningBalance) {
        this.runningBalance = runningBalance;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getReference() {
        return reference;
    }

    public void setReference(String reference) {
        this.reference = reference;
    }

    public int getSortPriority() {
        return sortPriority;
    }

    public void setSortPriority(int sortPriority) {
        this.sortPriority = sortPriority;
    }
}
