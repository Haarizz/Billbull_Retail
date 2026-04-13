package com.billbull.backend.financials.chartofaccounts;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface AccountRepository extends JpaRepository<Account, String> {

    // Find specific account by unique code (e.g. "1000")
    Account findByCode(String code);

    Account findByName(String name);

    // ===== COA TREE QUERIES =====
    List<Account> findByParentCode(String parentCode);

    List<Account> findByLevel(Integer level);

    List<Account> findByAccountType(String accountType);

    List<Account> findByParentCodeIsNull();

    List<Account> findByIsGroupFalseAndStatusNot(String status);

    List<Account> findByAccountGroupAndStatusNot(String accountGroup, String status);
}
