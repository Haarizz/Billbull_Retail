package com.billbull.backend.financials.bankreconciliation;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface BankStatementRepository extends JpaRepository<BankStatement, Long> {
    List<BankStatement> findByBranchIdOrderByStatementToDateDesc(Long branchId);
    List<BankStatement> findByBankAccountCode(String accountCode);
}
