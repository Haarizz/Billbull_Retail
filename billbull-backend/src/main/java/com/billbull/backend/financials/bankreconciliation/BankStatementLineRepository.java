package com.billbull.backend.financials.bankreconciliation;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface BankStatementLineRepository extends JpaRepository<BankStatementLine, Long> {
    List<BankStatementLine> findByBankStatementId(Long statementId);
    List<BankStatementLine> findByBankStatementIdAndMatchStatus(Long statementId, BankStatementLine.MatchStatus status);
}
