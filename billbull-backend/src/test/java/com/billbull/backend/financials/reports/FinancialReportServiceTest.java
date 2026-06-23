package com.billbull.backend.financials.reports;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.financials.expense.ExpenseRepository;
import com.billbull.backend.financials.generalledger.LedgerEntryRepository;
import com.billbull.backend.financials.generalledger.LedgerEntryRepository.AccountAggregate;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.purchase.lpo.LpoRepository;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.customerledger.OpeningInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;

/**
 * Characterization tests for the ARCHFIX §4.1 SQL-side aggregation: the trial balance is now built
 * from per-account SUM(debit)/SUM(credit) projections instead of a Java fold over every entry.
 * These lock the net-debit/net-credit derivation and the balanced flag.
 */
@ExtendWith(MockitoExtension.class)
class FinancialReportServiceTest {

    @Mock private AccountRepository accountRepository;
    @Mock private LedgerEntryRepository ledgerEntryRepository;
    @Mock private ExpenseRepository expenseRepository;
    @Mock private SalesInvoiceRepository salesInvoiceRepository;
    @Mock private PurchaseInvoiceRepository purchaseInvoiceRepository;
    @Mock private OpeningInvoiceRepository openingInvoiceRepository;
    @Mock private CustomerRepository customerRepository;
    @Mock private LpoRepository lpoRepository;

    private FinancialReportService service;

    @BeforeEach
    void setUp() {
        service = new FinancialReportService(accountRepository, ledgerEntryRepository, expenseRepository,
                salesInvoiceRepository, purchaseInvoiceRepository, openingInvoiceRepository,
                customerRepository, lpoRepository);
    }

    /** Minimal AccountAggregate projection stub. */
    private static AccountAggregate agg(String code, String name, String debit, String credit) {
        return new AccountAggregate() {
            public String getAccountCode() { return code; }
            public String getAccountName() { return name; }
            public BigDecimal getSumDebit() { return new BigDecimal(debit); }
            public BigDecimal getSumCredit() { return new BigDecimal(credit); }
        };
    }

    private static Account account(String code, String group) {
        Account a = new Account();
        a.setCode(code);
        a.setAccountGroup(group);
        return a;
    }

    private static Account account(String code, String group, String name) {
        Account a = account(code, group);
        a.setName(name);
        return a;
    }

    @Test
    void trialBalanceUsesSqlAggregateAndNetsDebitCreditPerAccount() {
        LocalDate start = LocalDate.of(2026, 1, 1);
        LocalDate end = LocalDate.of(2026, 12, 31);

        // Account A: debit-heavy -> net debit 60; Account B: credit-heavy -> net credit 40.
        when(ledgerEntryRepository.aggregateByAccountCode(isNull(), eq(start), eq(end)))
                .thenReturn(List.of(
                        agg("1001", "Cash", "100.00", "40.00"),
                        agg("4001", "Sales", "10.00", "50.00")));
        when(accountRepository.findAll()).thenReturn(List.of(
                account("1001", "ASSET"), account("4001", "REVENUE")));

        TrialBalanceDTO dto = service.generateTrialBalance(start, end, null);

        // pulled from SQL aggregate, not a per-entry fetch
        verify(ledgerEntryRepository).aggregateByAccountCode(isNull(), eq(start), eq(end));

        assertEquals(2, dto.getLines().size());
        TrialBalanceLineDTO cash = dto.getLines().stream().filter(l -> l.getAccountCode().equals("1001")).findFirst().orElseThrow();
        TrialBalanceLineDTO sales = dto.getLines().stream().filter(l -> l.getAccountCode().equals("4001")).findFirst().orElseThrow();

        assertEquals(0, new BigDecimal("60.00").compareTo(cash.getDebitBalance()));   // 100 - 40
        assertEquals(0, BigDecimal.ZERO.compareTo(cash.getCreditBalance()));
        assertEquals(0, new BigDecimal("40.00").compareTo(sales.getCreditBalance())); // 50 - 10
        assertEquals(0, BigDecimal.ZERO.compareTo(sales.getDebitBalance()));

        // totals: 60 debit vs 40 credit -> not balanced (proves totals are summed from net lines)
        assertEquals(0, new BigDecimal("60.00").compareTo(dto.getTotalDebit()));
        assertEquals(0, new BigDecimal("40.00").compareTo(dto.getTotalCredit()));
    }

    @Test
    void trialBalanceBalancedFlagTrueWhenDebitsEqualCredits() {
        LocalDate start = LocalDate.of(2026, 1, 1);
        LocalDate end = LocalDate.of(2026, 12, 31);

        when(ledgerEntryRepository.aggregateByAccountCode(isNull(), any(), any()))
                .thenReturn(List.of(
                        agg("1001", "Cash", "100.00", "0.00"),
                        agg("4001", "Sales", "0.00", "100.00")));
        when(accountRepository.findAll()).thenReturn(List.of(
                account("1001", "ASSET"), account("4001", "REVENUE")));

        TrialBalanceDTO dto = service.generateTrialBalance(start, end, null);

        assertTrue(dto.isBalanced(), "equal net debits and credits -> balanced");
        assertEquals(0, new BigDecimal("100.00").compareTo(dto.getTotalDebit()));
        assertEquals(0, new BigDecimal("100.00").compareTo(dto.getTotalCredit()));
    }

    // ARCHFIX §4.1 — balance sheet builds cumulative balances from the SQL before-date aggregate.
    @Test
    void balanceSheetUsesBeforeDateAggregateForAssetBalance() {
        LocalDate asOf = LocalDate.of(2026, 6, 30);

        // Asset account 1001 with net debit 500 (1000 debit - 500 credit) up to the as-of date.
        when(ledgerEntryRepository.aggregateByAccountCodeBefore(isNull(), eq(asOf.plusDays(1))))
                .thenReturn(List.of(agg("1001", "Cash", "1000.00", "500.00")));
        // Nested P&L call (retained earnings) — no revenue/expense activity.
        when(ledgerEntryRepository.aggregateByAccountCode(isNull(), any(), any()))
                .thenReturn(List.of());
        when(accountRepository.findAll()).thenReturn(List.of(account("1001", "Assets", "Cash")));

        BalanceSheetDTO dto = service.generateBalanceSheet(asOf, null);

        // pulled from the before-date aggregate, not a per-entry fetch
        verify(ledgerEntryRepository).aggregateByAccountCodeBefore(isNull(), eq(asOf.plusDays(1)));
        assertEquals(1, dto.getAssetItems().size());
        // Assets are debit-normal: display balance = raw net debit = 500.
        assertEquals(0, new BigDecimal("500.00").compareTo(dto.getTotalAssets()));
    }
}
