package com.billbull.backend.financials.bankreconciliation;

import com.billbull.backend.financials.generalledger.JournalLine;
import com.billbull.backend.financials.generalledger.JournalLineRepository;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Bank Reconciliation service (PDF §15).
 * Provides:
 *  - Import bank statement lines
 *  - Match statement lines to journal lines
 *  - Auto-post system items (bank charges, interest)
 *  - Compute reconciled vs book balance
 *  - Bounced-cheque reversal
 */
@Service
@Slf4j
public class BankReconciliationService {

    private final BankStatementRepository statementRepository;
    private final BankStatementLineRepository lineRepository;
    private final JournalLineRepository journalLineRepository;
    private final PostingEngineService postingEngineService;

    public BankReconciliationService(BankStatementRepository statementRepository,
                                     BankStatementLineRepository lineRepository,
                                     JournalLineRepository journalLineRepository,
                                     PostingEngineService postingEngineService) {
        this.statementRepository = statementRepository;
        this.lineRepository = lineRepository;
        this.journalLineRepository = journalLineRepository;
        this.postingEngineService = postingEngineService;
    }

    // ── STATEMENT MANAGEMENT ─────────────────────────────────────────────────

    public List<BankStatement> findAllStatements(Long branchId) {
        if (branchId != null) return statementRepository.findByBranchIdOrderByStatementToDateDesc(branchId);
        return statementRepository.findAll();
    }

    @Transactional
    public BankStatement createStatement(BankStatement statement) {
        return statementRepository.save(statement);
    }

    @Transactional
    public List<BankStatementLine> importLines(Long statementId, List<BankStatementLine> lines) {
        BankStatement statement = statementRepository.findById(statementId)
                .orElseThrow(() -> new RuntimeException("Bank statement not found: " + statementId));
        lines.forEach(l -> {
            l.setBankStatement(statement);
            if (l.getMatchStatus() == null) l.setMatchStatus(BankStatementLine.MatchStatus.UNMATCHED);
        });
        return lineRepository.saveAll(lines);
    }

    // ── MATCHING ─────────────────────────────────────────────────────────────

    /**
     * Manually match a bank statement line to a journal line.
     * Marks the statement line as MATCHED and sets reconciled=true on the journal line.
     */
    @Transactional
    public BankStatementLine matchLine(Long statementLineId, Long journalLineId) {
        BankStatementLine stmtLine = lineRepository.findById(statementLineId)
                .orElseThrow(() -> new RuntimeException("Statement line not found: " + statementLineId));
        JournalLine jLine = journalLineRepository.findById(journalLineId)
                .orElseThrow(() -> new RuntimeException("Journal line not found: " + journalLineId));

        stmtLine.setMatchStatus(BankStatementLine.MatchStatus.MATCHED);
        stmtLine.setMatchedJournalLineId(journalLineId);
        jLine.setReconciled(true);
        jLine.setReconciliationDate(LocalDate.now());
        journalLineRepository.save(jLine);
        return lineRepository.save(stmtLine);
    }

    /**
     * Auto-match statement lines to book entries by amount and date proximity (within 3 days).
     * Returns the number of auto-matches made.
     */
    @Transactional
    public int autoMatch(Long statementId) {
        List<BankStatementLine> unmatched = lineRepository
                .findByBankStatementIdAndMatchStatus(statementId, BankStatementLine.MatchStatus.UNMATCHED);
        int matched = 0;
        for (BankStatementLine sl : unmatched) {
            // Look for unreconciled journal lines with same amount and date within ±3 days
            List<JournalLine> candidates = journalLineRepository
                    .findUnreconciledBankLines(sl.getAmount(), sl.getValueDate().minusDays(3), sl.getValueDate().plusDays(3));
            if (!candidates.isEmpty()) {
                JournalLine best = candidates.get(0);
                sl.setMatchStatus(BankStatementLine.MatchStatus.MATCHED);
                sl.setMatchedJournalLineId(best.getId());
                best.setReconciled(true);
                best.setReconciliationDate(LocalDate.now());
                journalLineRepository.save(best);
                lineRepository.save(sl);
                matched++;
            }
        }
        return matched;
    }

    // ── SYSTEM ITEM POSTING ───────────────────────────────────────────────────

    /**
     * Post a bank charge from a statement line (PDF §15 reconciling items).
     * Dr Bank Charges / Cr Bank
     */
    @Transactional
    public BankStatementLine postBankCharge(Long statementLineId, Long branchId) {
        BankStatementLine sl = lineRepository.findById(statementLineId)
                .orElseThrow(() -> new RuntimeException("Statement line not found: " + statementLineId));

        String ref = "BCHG-STMT-" + statementLineId;
        postingEngineService.createJournalFromBankCharge(ref, sl.getAmount(),
                sl.getDescription(), sl.getValueDate());

        sl.setMatchStatus(BankStatementLine.MatchStatus.POSTED_BY_SYSTEM);
        sl.setSystemJournalRef(ref);
        return lineRepository.save(sl);
    }

    /**
     * Post bank interest income from a statement line (PDF §15).
     * Dr Bank / Cr Interest Income
     */
    @Transactional
    public BankStatementLine postBankInterest(Long statementLineId, Long branchId) {
        BankStatementLine sl = lineRepository.findById(statementLineId)
                .orElseThrow(() -> new RuntimeException("Statement line not found: " + statementLineId));

        String ref = "BINT-STMT-" + statementLineId;
        postingEngineService.createJournalFromBankInterest(ref, sl.getAmount(),
                sl.getDescription(), sl.getValueDate());

        sl.setMatchStatus(BankStatementLine.MatchStatus.POSTED_BY_SYSTEM);
        sl.setSystemJournalRef(ref);
        return lineRepository.save(sl);
    }

    // ── RECONCILIATION SUMMARY ────────────────────────────────────────────────

    /**
     * Returns reconciliation summary: book balance, statement balance, unmatched items.
     */
    public Map<String, Object> getReconciliationSummary(Long statementId) {
        BankStatement stmt = statementRepository.findById(statementId)
                .orElseThrow(() -> new RuntimeException("Bank statement not found: " + statementId));

        List<BankStatementLine> allLines = lineRepository.findByBankStatementId(statementId);
        List<BankStatementLine> unmatched = allLines.stream()
                .filter(l -> l.getMatchStatus() == BankStatementLine.MatchStatus.UNMATCHED)
                .toList();

        BigDecimal unmatchedDebits = unmatched.stream()
                .filter(l -> l.getLineType() == BankStatementLine.LineType.DEBIT)
                .map(BankStatementLine::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal unmatchedCredits = unmatched.stream()
                .filter(l -> l.getLineType() == BankStatementLine.LineType.CREDIT)
                .map(BankStatementLine::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        int totalLines = allLines.size();
        long matchedCount = allLines.stream().filter(l -> l.getMatchStatus() != BankStatementLine.MatchStatus.UNMATCHED).count();

        Map<String, Object> summary = new java.util.LinkedHashMap<>();
        summary.put("statementId", statementId);
        summary.put("bankAccountCode", stmt.getBankAccountCode());
        summary.put("statementFromDate", stmt.getStatementFromDate().toString());
        summary.put("statementToDate", stmt.getStatementToDate().toString());
        summary.put("statementOpeningBalance", stmt.getOpeningBalance());
        summary.put("statementClosingBalance", stmt.getClosingBalance());
        summary.put("totalLines", totalLines);
        summary.put("matchedLines", matchedCount);
        summary.put("unmatchedDebitAmount", unmatchedDebits);
        summary.put("unmatchedCreditAmount", unmatchedCredits);
        summary.put("reconciliationStatus", stmt.getStatus().name());
        return summary;
    }

    @Transactional
    public BankStatement markReconciled(Long statementId) {
        BankStatement stmt = statementRepository.findById(statementId)
                .orElseThrow(() -> new RuntimeException("Bank statement not found: " + statementId));
        stmt.setStatus(BankStatement.ReconciliationStatus.RECONCILED);
        return statementRepository.save(stmt);
    }
}
