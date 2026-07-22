package com.billbull.backend.financials.generalledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * Regression coverage for the COA tree's per-account balance: the tree structure
 * (which accounts exist) is company-wide, but the balance shown per account must
 * reflect only the currently active branch's posted ledger entries, not the
 * single non-branch-scoped {@code Account.balanceAmount} field.
 */
@ExtendWith(MockitoExtension.class)
class LedgerServiceAccountTreeBranchBalanceTest {

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private BranchAccessService branchAccessService;

    @Mock
    private LedgerEntryRepository entryRepo;

    @InjectMocks
    private LedgerService ledgerService;

    @Test
    void accountWithNoPostingsInActiveBranchShowsZeroEvenWithCompanyWideActivity() {
        when(accountRepository.findAll()).thenReturn(List.of(
                account("1000", "Cash", null)));

        // Specific branch selected (id=7): no ledger activity for this branch at all.
        when(branchAccessService.currentExactScope())
                .thenReturn(new BranchAccessService.ListScope(false, Set.of(7L)));
        when(entryRepo.aggregateByAccountCodeBefore(eq(7L), any())).thenReturn(List.of());

        List<Map<String, Object>> tree = ledgerService.getAccountTree();

        assertThat(tree).hasSize(1);
        assertThat(tree.get(0).get("balanceAmount")).isEqualTo(BigDecimal.ZERO);
    }

    @Test
    void allBranchesShowsCompanyWideAggregateIgnoringBranchId() {
        when(accountRepository.findAll()).thenReturn(List.of(
                account("1000", "Cash", null)));

        when(branchAccessService.currentExactScope())
                .thenReturn(new BranchAccessService.ListScope(true, Set.of(-1L)));
        when(entryRepo.aggregateByAccountCodeBefore(isNull(), any())).thenReturn(List.of(
                aggregate("1000", "Cash", new BigDecimal("500.00"), BigDecimal.ZERO)));

        List<Map<String, Object>> tree = ledgerService.getAccountTree();

        assertThat(tree.get(0).get("balanceAmount")).isEqualTo(new BigDecimal("500.00"));
        assertThat(tree.get(0).get("balanceType")).isEqualTo("Dr");
    }

    private Account account(String code, String name, String parentCode) {
        Account account = new Account();
        account.setId("ID-" + code);
        account.setCode(code);
        account.setName(name != null ? name : code);
        account.setParentCode(parentCode);
        account.setStatus("active");
        // Stale company-wide field left populated on purpose: the tree must NOT
        // fall back to this value once branch-scoped ledger data is available.
        account.setBalanceAmount(new BigDecimal("999999.00"));
        account.setBalanceType("Dr");
        return account;
    }

    private LedgerEntryRepository.AccountAggregate aggregate(String code, String name,
            BigDecimal debit, BigDecimal credit) {
        return new LedgerEntryRepository.AccountAggregate() {
            @Override public String getAccountCode() { return code; }
            @Override public String getAccountName() { return name; }
            @Override public BigDecimal getSumDebit() { return debit; }
            @Override public BigDecimal getSumCredit() { return credit; }
        };
    }
}
