package com.billbull.backend.financials.generalledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.util.SearchLimit;

/**
 * Account summary + recent-transaction reads behind the global search details panel.
 *
 * <p>These two reads are what keep the panel off the whole-ledger endpoints, so the
 * assertions here are as much about <em>which</em> repository is touched as about the
 * numbers that come back.
 */
@ExtendWith(MockitoExtension.class)
class LedgerServiceAccountDetailTest {

    @Mock
    private AccountRepository accountRepo;

    @Mock
    private GlAccountBalanceRepository glAccountBalanceRepo;

    @Mock
    private LedgerEntryRepository entryRepo;

    @Mock
    private BranchRepository branchRepository;

    @Mock
    private com.billbull.backend.settings.branch.BranchAccessService branchAccessService;

    @InjectMocks
    private LedgerService ledgerService;

    // ==================== SUMMARY ====================

    /**
     * The summary read is branch-scoped through the same resolver its sibling
     * transactions read uses, so every summary test has to say which scope it runs under.
     */
    private void summaryAsAllBranchCaller() {
        when(branchAccessService.currentSearchScope())
                .thenReturn(new com.billbull.backend.settings.branch.BranchAccessService.ListScope(
                        true, java.util.Set.of(-1L)));
    }

    private void summaryAsCallerRestrictedTo(Long... branchIds) {
        when(branchAccessService.currentSearchScope())
                .thenReturn(new com.billbull.backend.settings.branch.BranchAccessService.ListScope(
                        false, java.util.Set.of(branchIds)));
    }

    @Test
    void summaryAggregatesBalanceRowsAndResolvesBranchNames() {
        summaryAsAllBranchCaller();
        when(accountRepo.findByCode("1100")).thenReturn(account("1100", "Accounts Receivable"));
        when(glAccountBalanceRepo.findByAccountCodeScoped(eq("1100"), anyBoolean(), any())).thenReturn(List.of(
                balance(1L, "4000.00", "1000.00", "3000.00"),
                balance(2L, "1500.00", "500.00", "1000.00")));
        when(branchRepository.findAllById(any())).thenReturn(List.of(branch(1L, "Dubai"), branch(2L, "Sharjah")));

        LedgerAccountSummaryResponse summary = ledgerService.getAccountSummary("1100");

        assertThat(summary.getAccountCode()).isEqualTo("1100");
        assertThat(summary.getAccountName()).isEqualTo("Accounts Receivable");
        assertThat(summary.getAccountType()).isEqualTo("Asset");
        assertThat(summary.getDebitTotal()).isEqualByComparingTo("5500.00");
        assertThat(summary.getCreditTotal()).isEqualByComparingTo("1500.00");
        assertThat(summary.getClosingBalance()).isEqualByComparingTo("4000.00");
        assertThat(summary.getBranchBalances())
                .extracting(LedgerAccountSummaryResponse.BranchBalance::getBranchName)
                .containsExactly("Dubai", "Sharjah");
    }

    @Test
    void summaryKeepsUnattributedBalanceRowsRatherThanDroppingThem() {
        summaryAsAllBranchCaller();
        when(accountRepo.findByCode("4000")).thenReturn(account("4000", "Sales Revenue"));
        when(glAccountBalanceRepo.findByAccountCodeScoped(eq("4000"), anyBoolean(), any())).thenReturn(List.of(
                balance(1L, "0.00", "900.00", "-900.00"),
                balance(null, "0.00", "100.00", "-100.00")));
        when(branchRepository.findAllById(any())).thenReturn(List.of(branch(1L, "Dubai")));

        LedgerAccountSummaryResponse summary = ledgerService.getAccountSummary("4000");

        // The branch-less row must still be counted, or the branch rows stop adding up.
        assertThat(summary.getCreditTotal()).isEqualByComparingTo("1000.00");
        assertThat(summary.getBranchBalances()).hasSize(2);
        LedgerAccountSummaryResponse.BranchBalance unattributed = summary.getBranchBalances().stream()
                .filter(b -> b.getBranchId() == null)
                .findFirst()
                .orElseThrow();
        assertThat(unattributed.getBranchName()).isEqualTo("Unattributed");
        assertThat(unattributed.getClosingBalance()).isEqualByComparingTo("-100.00");
    }

    @Test
    void summaryFoldsSeveralFiscalPeriodRowsOfOneBranchTogether() {
        summaryAsAllBranchCaller();
        when(accountRepo.findByCode("5000")).thenReturn(account("5000", "Rent Expense"));
        when(glAccountBalanceRepo.findByAccountCodeScoped(eq("5000"), anyBoolean(), any())).thenReturn(List.of(
                balance(7L, "100.00", "0.00", "100.00"),
                balance(7L, "250.00", "0.00", "250.00")));
        when(branchRepository.findAllById(any())).thenReturn(List.of(branch(7L, "Abu Dhabi")));

        LedgerAccountSummaryResponse summary = ledgerService.getAccountSummary("5000");

        assertThat(summary.getBranchBalances()).hasSize(1);
        assertThat(summary.getBranchBalances().get(0).getDebitTotal()).isEqualByComparingTo("350.00");
    }

    @Test
    void summaryOfAnAccountWithNoBalanceRowsIsZeroedRatherThanNull() {
        summaryAsAllBranchCaller();
        when(accountRepo.findByCode("9999")).thenReturn(account("9999", "Suspense"));
        when(glAccountBalanceRepo.findByAccountCodeScoped(eq("9999"), anyBoolean(), any())).thenReturn(List.of());

        LedgerAccountSummaryResponse summary = ledgerService.getAccountSummary("9999");

        assertThat(summary.getDebitTotal()).isEqualByComparingTo("0");
        assertThat(summary.getCreditTotal()).isEqualByComparingTo("0");
        assertThat(summary.getClosingBalance()).isEqualByComparingTo("0");
        assertThat(summary.getBranchBalances()).isEmpty();
        verifyNoInteractions(branchRepository);
    }

    @Test
    void summaryOfAnUnknownCodeIsNullAndReadsNoBalances() {
        when(accountRepo.findByCode("0000")).thenReturn(null);

        assertThat(ledgerService.getAccountSummary("0000")).isNull();
        verifyNoInteractions(glAccountBalanceRepo);
    }

    @Test
    void summaryOfABlankCodeHitsNoRepository() {
        assertThat(ledgerService.getAccountSummary("  ")).isNull();
        assertThat(ledgerService.getAccountSummary(null)).isNull();
        verifyNoInteractions(accountRepo, glAccountBalanceRepo, branchRepository);
    }

    // ==================== RECENT TRANSACTIONS ====================

    /**
     * The recent-entries read is branch-scoped, so every test of it has to say which scope
     * it runs under. This is the unrestricted one; {@link #transactionsAreScopedToTheBranchesTheCallerCanReach}
     * covers the restricted case.
     */
    private void asAllBranchCaller() {
        when(branchAccessService.currentSearchScope())
                .thenReturn(new com.billbull.backend.settings.branch.BranchAccessService.ListScope(
                        true, java.util.Set.of(-1L)));
    }


    @Test
    void transactionsAreFilteredByAccountAndReturnedNewestFirst() {
        asAllBranchCaller();
        when(entryRepo.findRecentByAccountCodeScoped(eq("1100"), eq(true), any(), any(Pageable.class)))
                .thenReturn(List.of(
                        entry("le-2", LocalDate.of(2026, 3, 2), "JV-002", "200.00"),
                        entry("le-1", LocalDate.of(2026, 3, 1), "JV-001", "100.00")));

        List<LedgerAccountTransactionResponse> rows = ledgerService.getAccountTransactions("1100", 5);

        assertThat(rows).extracting(LedgerAccountTransactionResponse::getVoucherNo)
                .containsExactly("JV-002", "JV-001");
        assertThat(rows.get(0).getDebitAmount()).isEqualByComparingTo("200.00");
        assertThat(rows.get(0).getBranchName()).isEqualTo("Dubai");
        // Running balance is the stored value, never recomputed.
        assertThat(rows.get(0).getRunningBalance()).isEqualByComparingTo("200.00");
    }

    @Test
    void transactionSizeIsClampedServerSide() {
        asAllBranchCaller();
        when(entryRepo.findRecentByAccountCodeScoped(eq("1100"), eq(true), any(), any(Pageable.class)))
                .thenReturn(List.of());

        ledgerService.getAccountTransactions("1100", 10_000);

        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(entryRepo).findRecentByAccountCodeScoped(eq("1100"), eq(true), any(), pageable.capture());
        assertThat(pageable.getValue().getPageSize()).isEqualTo(SearchLimit.MAX_SIZE);
    }

    @Test
    void transactionSizeFallsBackToTheDefaultForANonPositiveRequest() {
        asAllBranchCaller();
        when(entryRepo.findRecentByAccountCodeScoped(eq("1100"), eq(true), any(), any(Pageable.class)))
                .thenReturn(List.of());

        ledgerService.getAccountTransactions("1100", 0);

        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(entryRepo).findRecentByAccountCodeScoped(eq("1100"), eq(true), any(), pageable.capture());
        assertThat(pageable.getValue().getPageSize()).isEqualTo(SearchLimit.DEFAULT_SIZE);
    }

    /**
     * A caller who cannot reach every branch must not read another branch's postings here.
     * Every other read of LedgerEntry is scoped ({@code getTransactionHistory},
     * {@code resolveBranchScopedBalances}); this one is no exception.
     */
    @Test
    void transactionsAreScopedToTheBranchesTheCallerCanReach() {
        when(branchAccessService.currentSearchScope())
                .thenReturn(new com.billbull.backend.settings.branch.BranchAccessService.ListScope(
                        false, java.util.Set.of(3L, 8L)));
        when(entryRepo.findRecentByAccountCodeScoped(eq("1100"), eq(false), any(), any(Pageable.class)))
                .thenReturn(List.of());

        ledgerService.getAccountTransactions("1100", 5);

        ArgumentCaptor<java.util.Collection<Long>> ids = ArgumentCaptor.forClass(java.util.Collection.class);
        verify(entryRepo).findRecentByAccountCodeScoped(eq("1100"), eq(false), ids.capture(),
                any(Pageable.class));
        assertThat(ids.getValue()).containsExactlyInAnyOrder(3L, 8L);
    }

    @Test
    void transactionsForABlankCodeHitNoRepository() {
        assertThat(ledgerService.getAccountTransactions("", 5)).isEmpty();
        assertThat(ledgerService.getAccountTransactions(null, 5)).isEmpty();
        verifyNoInteractions(entryRepo);
    }

    // ==================== SUMMARY BRANCH SCOPE ====================

    /**
     * An unrestricted caller (ADMIN / SUPER_ADMIN carry the {@code isAllBranches} JWT claim)
     * must keep the company-wide view: the scoped finder is asked to apply no branch predicate.
     */
    @Test
    void summaryAppliesNoBranchPredicateForAnUnrestrictedCaller() {
        summaryAsAllBranchCaller();
        when(accountRepo.findByCode("1100")).thenReturn(account("1100", "Accounts Receivable"));
        when(glAccountBalanceRepo.findByAccountCodeScoped(eq("1100"), anyBoolean(), any()))
                .thenReturn(List.of(
                        balance(1L, "4000.00", "1000.00", "3000.00"),
                        balance(2L, "1500.00", "500.00", "1000.00")));
        when(branchRepository.findAllById(any())).thenReturn(List.of(branch(1L, "Dubai"), branch(2L, "Sharjah")));

        LedgerAccountSummaryResponse summary = ledgerService.getAccountSummary("1100");

        verify(glAccountBalanceRepo).findByAccountCodeScoped(eq("1100"), eq(true), any());
        assertThat(summary.getBranchBalances()).hasSize(2);
        assertThat(summary.getDebitTotal()).isEqualByComparingTo("5500.00");
    }

    /**
     * The security case. A caller confined to one branch must not receive another branch's
     * balance — the predicate is pushed into SQL, so the prohibited row never reaches the
     * service, and the totals therefore describe only the permitted branch.
     */
    @Test
    void summaryIsScopedToTheBranchesTheCallerCanReach() {
        summaryAsCallerRestrictedTo(3L);
        when(accountRepo.findByCode("1100")).thenReturn(account("1100", "Accounts Receivable"));
        // What the scoped query returns for this caller: branch 8's row is excluded in SQL.
        when(glAccountBalanceRepo.findByAccountCodeScoped(eq("1100"), anyBoolean(), any()))
                .thenReturn(List.of(balance(3L, "900.00", "100.00", "800.00")));
        when(branchRepository.findAllById(any())).thenReturn(List.of(branch(3L, "Deira")));

        LedgerAccountSummaryResponse summary = ledgerService.getAccountSummary("1100");

        ArgumentCaptor<java.util.Collection<Long>> ids = ArgumentCaptor.forClass(java.util.Collection.class);
        verify(glAccountBalanceRepo).findByAccountCodeScoped(eq("1100"), eq(false), ids.capture());
        assertThat(ids.getValue()).containsExactly(3L);

        assertThat(summary.getBranchBalances())
                .extracting(LedgerAccountSummaryResponse.BranchBalance::getBranchId)
                .containsExactly(3L);
        // No company-wide figure leaks into a branch-scoped response.
        assertThat(summary.getDebitTotal()).isEqualByComparingTo("900.00");
        assertThat(summary.getCreditTotal()).isEqualByComparingTo("100.00");
        assertThat(summary.getClosingBalance()).isEqualByComparingTo("800.00");
    }

    /** Several permitted branches all contribute, and the totals are their sum. */
    @Test
    void summaryIncludesEveryPermittedBranchAndTotalsThem() {
        summaryAsCallerRestrictedTo(3L, 8L);
        when(accountRepo.findByCode("1100")).thenReturn(account("1100", "Accounts Receivable"));
        when(glAccountBalanceRepo.findByAccountCodeScoped(eq("1100"), anyBoolean(), any()))
                .thenReturn(List.of(
                        balance(3L, "900.00", "100.00", "800.00"),
                        balance(8L, "600.00", "50.00", "550.00")));
        when(branchRepository.findAllById(any())).thenReturn(List.of(branch(3L, "Deira"), branch(8L, "Karama")));

        LedgerAccountSummaryResponse summary = ledgerService.getAccountSummary("1100");

        ArgumentCaptor<java.util.Collection<Long>> ids = ArgumentCaptor.forClass(java.util.Collection.class);
        verify(glAccountBalanceRepo).findByAccountCodeScoped(eq("1100"), eq(false), ids.capture());
        assertThat(ids.getValue()).containsExactlyInAnyOrder(3L, 8L);

        assertThat(summary.getBranchBalances())
                .extracting(LedgerAccountSummaryResponse.BranchBalance::getBranchId)
                .containsExactlyInAnyOrder(3L, 8L);
        assertBranchRowsAddUpToTotals(summary);
        assertThat(summary.getDebitTotal()).isEqualByComparingTo("1500.00");
        assertThat(summary.getCreditTotal()).isEqualByComparingTo("150.00");
        assertThat(summary.getClosingBalance()).isEqualByComparingTo("1350.00");
    }

    /**
     * Branch A's user opening the details panel for an account that also carries Branch B
     * balances: nothing of Branch B's figures may appear anywhere in the response. The stub
     * applies the repository's own predicate, so this exercises the filter, not a hand-picked
     * result set.
     */
    @Test
    void summaryNeverDisclosesAProhibitedBranchesFigures() {
        summaryAsCallerRestrictedTo(3L);
        when(accountRepo.findByCode("1100")).thenReturn(account("1100", "Accounts Receivable"));
        when(glAccountBalanceRepo.findByAccountCodeScoped(eq("1100"), anyBoolean(), any()))
                .thenAnswer(invocation -> {
                    boolean allBranches = invocation.getArgument(1);
                    java.util.Collection<Long> permitted = invocation.getArgument(2);
                    // Stands in for the SQL predicate over branch 8 (prohibited) plus branch 3.
                    return java.util.stream.Stream.of(
                                    balance(3L, "900.00", "100.00", "800.00"),
                                    balance(8L, "7777.00", "6666.00", "1111.00"))
                            .filter(b -> allBranches || b.getBranchId() == null
                                    || permitted.contains(b.getBranchId()))
                            .toList();
                });
        when(branchRepository.findAllById(any())).thenReturn(List.of(branch(3L, "Deira")));

        LedgerAccountSummaryResponse summary = ledgerService.getAccountSummary("1100");

        assertThat(summary.getBranchBalances())
                .extracting(LedgerAccountSummaryResponse.BranchBalance::getBranchId)
                .doesNotContain(8L);
        assertThat(summary.getBranchBalances())
                .noneSatisfy(row -> assertThat(row.getDebitTotal()).isEqualByComparingTo("7777.00"));
        assertThat(summary.getDebitTotal()).isEqualByComparingTo("900.00");
        assertThat(summary.getCreditTotal()).isEqualByComparingTo("100.00");
        assertThat(summary.getClosingBalance()).isEqualByComparingTo("800.00");
        assertBranchRowsAddUpToTotals(summary);
    }

    /**
     * Null-branch rows follow the policy the rest of the branch scoping uses — and that the
     * sibling transactions read uses via {@code findRecentByAccountCodeScoped}: they stay
     * visible to a restricted caller too, still labelled "Unattributed", and still counted
     * into the totals so the breakdown adds up.
     */
    @Test
    void summaryKeepsTheUnattributedRowForARestrictedCaller() {
        summaryAsCallerRestrictedTo(3L);
        when(accountRepo.findByCode("4000")).thenReturn(account("4000", "Sales Revenue"));
        when(glAccountBalanceRepo.findByAccountCodeScoped(eq("4000"), anyBoolean(), any()))
                .thenReturn(List.of(
                        balance(3L, "0.00", "900.00", "-900.00"),
                        balance(null, "0.00", "100.00", "-100.00")));
        when(branchRepository.findAllById(any())).thenReturn(List.of(branch(3L, "Deira")));

        LedgerAccountSummaryResponse summary = ledgerService.getAccountSummary("4000");

        assertThat(summary.getBranchBalances()).hasSize(2);
        LedgerAccountSummaryResponse.BranchBalance unattributed = summary.getBranchBalances().stream()
                .filter(b -> b.getBranchId() == null)
                .findFirst()
                .orElseThrow();
        assertThat(unattributed.getBranchName()).isEqualTo("Unattributed");
        assertThat(unattributed.getClosingBalance()).isEqualByComparingTo("-100.00");
        assertThat(summary.getCreditTotal()).isEqualByComparingTo("1000.00");
        assertBranchRowsAddUpToTotals(summary);
    }

    /**
     * Fiscal-period rows: a restricted caller's several periods per permitted branch fold
     * together and no row silently disappears from the totals.
     */
    @Test
    void summaryFoldsFiscalPeriodRowsPerPermittedBranchWithoutLosingAny() {
        summaryAsCallerRestrictedTo(3L, 8L);
        when(accountRepo.findByCode("5000")).thenReturn(account("5000", "Rent Expense"));
        when(glAccountBalanceRepo.findByAccountCodeScoped(eq("5000"), anyBoolean(), any()))
                .thenReturn(List.of(
                        balance(3L, 101L, "100.00", "0.00", "100.00"),
                        balance(3L, 102L, "250.00", "0.00", "250.00"),
                        balance(8L, 101L, "40.00", "0.00", "40.00"),
                        balance(null, 102L, "10.00", "0.00", "10.00")));
        when(branchRepository.findAllById(any())).thenReturn(List.of(branch(3L, "Deira"), branch(8L, "Karama")));

        LedgerAccountSummaryResponse summary = ledgerService.getAccountSummary("5000");

        assertThat(summary.getBranchBalances()).hasSize(3);
        assertThat(summary.getBranchBalances().stream()
                .filter(b -> Long.valueOf(3L).equals(b.getBranchId()))
                .findFirst().orElseThrow().getDebitTotal()).isEqualByComparingTo("350.00");
        assertThat(summary.getDebitTotal()).isEqualByComparingTo("400.00");
        assertBranchRowsAddUpToTotals(summary);
    }

    /** The response's own invariant: the totals are the sum of the rows it carries. */
    private static void assertBranchRowsAddUpToTotals(LedgerAccountSummaryResponse summary) {
        BigDecimal debit = BigDecimal.ZERO;
        BigDecimal credit = BigDecimal.ZERO;
        BigDecimal closing = BigDecimal.ZERO;
        for (LedgerAccountSummaryResponse.BranchBalance row : summary.getBranchBalances()) {
            debit = debit.add(row.getDebitTotal());
            credit = credit.add(row.getCreditTotal());
            closing = closing.add(row.getClosingBalance());
        }
        assertThat(summary.getDebitTotal()).isEqualByComparingTo(debit);
        assertThat(summary.getCreditTotal()).isEqualByComparingTo(credit);
        assertThat(summary.getClosingBalance()).isEqualByComparingTo(closing);
    }

    // ==================== fixtures ====================

    private static Account account(String code, String name) {
        Account account = new Account();
        account.setCode(code);
        account.setName(name);
        account.setAccountType("Asset");
        account.setAccountGroup("Assets");
        account.setStatus("active");
        return account;
    }

    private static GlAccountBalance balance(Long branchId, Long fiscalPeriodId, String debit, String credit,
            String closing) {
        GlAccountBalance balance = balance(branchId, debit, credit, closing);
        balance.setFiscalPeriodId(fiscalPeriodId);
        return balance;
    }

    private static GlAccountBalance balance(Long branchId, String debit, String credit, String closing) {
        GlAccountBalance balance = new GlAccountBalance();
        balance.setBranchId(branchId);
        balance.setDebitTotal(new BigDecimal(debit));
        balance.setCreditTotal(new BigDecimal(credit));
        balance.setClosingBalance(new BigDecimal(closing));
        return balance;
    }

    private static Branch branch(Long id, String name) {
        Branch branch = new Branch();
        branch.setId(id);
        branch.setName(name);
        return branch;
    }

    private static LedgerEntry entry(String id, LocalDate date, String voucherNo, String debit) {
        LedgerEntry entry = new LedgerEntry();
        entry.setId(id);
        entry.setTransactionDate(date);
        entry.setVoucherNo(voucherNo);
        entry.setDescription("Posting " + voucherNo);
        entry.setDebitAmount(new BigDecimal(debit));
        entry.setCreditAmount(BigDecimal.ZERO);
        entry.setRunningBalance(new BigDecimal(debit));
        entry.setBalanceType("Dr");
        entry.setBranch(branch(1L, "Dubai"));
        return entry;
    }
}
