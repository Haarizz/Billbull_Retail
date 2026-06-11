package com.billbull.backend.financials.bankreconciliation;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Individual line on a bank statement (PDF §15).
 * Each line is matched against a journal line in BillBull's books.
 */
@Entity
@Table(name = "bank_statement_lines")
public class BankStatementLine extends BaseEntity {

    public enum LineType { DEBIT, CREDIT }
    public enum MatchStatus { UNMATCHED, MATCHED, POSTED_BY_SYSTEM }

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bank_statement_id", nullable = false)
    private BankStatement bankStatement;

    @Column(nullable = false)
    private LocalDate valueDate;

    private String reference;
    private String description;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private LineType lineType; // DEBIT = money out, CREDIT = money in

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MatchStatus matchStatus = MatchStatus.UNMATCHED;

    /** ID of the JournalLine this statement line is matched to. */
    private Long matchedJournalLineId;

    /** If a system posting was generated (e.g. bank charges), store the journal entry reference. */
    private String systemJournalRef;

    // ── getters / setters ──────────────────────────────────────────────────

    public BankStatement getBankStatement() { return bankStatement; }
    public void setBankStatement(BankStatement bankStatement) { this.bankStatement = bankStatement; }

    public LocalDate getValueDate() { return valueDate; }
    public void setValueDate(LocalDate valueDate) { this.valueDate = valueDate; }

    public String getReference() { return reference; }
    public void setReference(String reference) { this.reference = reference; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public LineType getLineType() { return lineType; }
    public void setLineType(LineType lineType) { this.lineType = lineType; }

    public MatchStatus getMatchStatus() { return matchStatus; }
    public void setMatchStatus(MatchStatus matchStatus) { this.matchStatus = matchStatus; }

    public Long getMatchedJournalLineId() { return matchedJournalLineId; }
    public void setMatchedJournalLineId(Long matchedJournalLineId) { this.matchedJournalLineId = matchedJournalLineId; }

    public String getSystemJournalRef() { return systemJournalRef; }
    public void setSystemJournalRef(String systemJournalRef) { this.systemJournalRef = systemJournalRef; }
}
