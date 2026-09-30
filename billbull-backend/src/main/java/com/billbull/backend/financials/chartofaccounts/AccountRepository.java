package com.billbull.backend.financials.chartofaccounts;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface AccountRepository extends JpaRepository<Account, String> {

    /**
     * Typeahead search for the global search modal. Matches account code and
     * name only — the two identifying fields the chart of accounts is navigated
     * by. Returns a constructor projection so no Account entity is hydrated, and
     * the row cap is applied by the database via {@code Pageable}.
     *
     * <p>Like {@code getAllAccounts()}, this is not branch-scoped: the accounts
     * list endpoint is a plain {@code findAll()}, so search matches it rather
     * than introducing a scope the list does not have.
     */
    @Query("SELECT new com.billbull.backend.financials.chartofaccounts.AccountSearchResponse("
            + "a.id, a.code, a.name, a.accountType, a.accountGroup, a.status, a.isGroup) "
            + "FROM Account a "
            + "WHERE LOWER(a.code) LIKE LOWER(CONCAT('%', :q, '%')) "
            + "   OR LOWER(a.name) LIKE LOWER(CONCAT('%', :q, '%')) "
            + "ORDER BY a.code ASC")
    List<AccountSearchResponse> searchAccounts(@Param("q") String q, Pageable pageable);

    /**
     * The first few accounts, for the global search modal's empty-query preview.
     *
     * <p>Same projection and same {@code code} ordering as {@link #searchAccounts}, with
     * the match clause dropped rather than matched against an empty string, and the row
     * cap applied by the database via {@code Pageable}. Not branch-scoped, for the same
     * reason the search is not.
     */
    @Query("SELECT new com.billbull.backend.financials.chartofaccounts.AccountSearchResponse("
            + "a.id, a.code, a.name, a.accountType, a.accountGroup, a.status, a.isGroup) "
            + "FROM Account a "
            + "ORDER BY a.code ASC")
    List<AccountSearchResponse> previewAccounts(Pageable pageable);

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
