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
import com.billbull.backend.financials.generalledger.LedgerEntry;
import com.billbull.backend.financials.chartofaccounts.CostCenterRepository;
import com.billbull.backend.financials.generalledger.LedgerEntryRepository;
import com.billbull.backend.financials.generalledger.LedgerEntryRepository.AccountAggregate;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.purchase.lpo.LpoRepository;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.customerledger.OpeningInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.settings.branch.BranchAccessService;

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
    @Mock private CostCenterRepository costCenterRepository;
    @Mock private BranchAccessService branchAccessService;

    private FinancialReportService service;

    @BeforeEach
    void setUp() {
        service = new FinancialReportService(accountRepository, ledgerEntryRepository, expenseRepository,
                salesInvoiceRepository, purchaseInvoiceRepository, openingInvoiceRepository,
                customerRepository, lpoRepository, costCenterRepository, branchAccessService);
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

    private static Account taxAccount(String code, String name, String taxRole) {
        Account a = new Account();
        a.setCode(code);
        a.setName(name);
        a.setTaxRole(taxRole);
        return a;
    }

    private static LedgerEntry ledgerEntry(String voucherNo, String accountCode, String accountName,
            String debit, String credit) {
        LedgerEntry e = new LedgerEntry();
        e.setVoucherNo(voucherNo);
        e.setAccountCode(accountCode);
        e.setAccountName(accountName);
        e.setDebitAmount(new BigDecimal(debit));
        e.setCreditAmount(new BigDecimal(credit));
        return e;
    }

    private static LedgerEntry dated(LedgerEntry e, LocalDate date) {
        e.setTransactionDate(date);
        return e;
    }

    private static Account coaAccount(String code, String name, String group, String reportGroup) {
        Account a = account(code, group, name);
        a.setReportGroup(reportGroup);
        return a;
    }

    /**
     * VAT buckets are net movements, not one-sided totals. A credit note debits output
     * VAT and taxable sales; a purchase return credits input VAT and taxable purchases.
     * Summing only the "natural" side ignored every reversal and overstated the return.
     */
    @Test
    void taxDashboardNetsReversalsAgainstEachVatBucket() {
        LocalDate start = LocalDate.of(2026, 1, 1);
        LocalDate end = LocalDate.of(2026, 3, 31);

        when(accountRepository.findAll()).thenReturn(List.of(
                taxAccount("2110", "Output VAT", "OUTPUT_TAX"),
                taxAccount("1170", "Input VAT", "INPUT_TAX"),
                taxAccount("4001", "Sales", "TAXABLE_SALES"),
                taxAccount("5001", "Purchases", "TAXABLE_PURCHASE")));

        when(ledgerEntryRepository.findByTransactionDateBetweenOrderByTransactionDateAsc(start, end))
                .thenReturn(List.of(
                        // Sale of 1000 + 50 VAT
                        ledgerEntry("INV-1", "4001", "Sales", "0.00", "1000.00"),
                        ledgerEntry("INV-1", "2110", "Output VAT", "0.00", "50.00"),
                        // Credit note reversing 200 + 10 VAT of that sale
                        ledgerEntry("CN-1", "4001", "Sales", "200.00", "0.00"),
                        ledgerEntry("CN-1", "2110", "Output VAT", "10.00", "0.00"),
                        // Purchase of 400 + 20 VAT
                        ledgerEntry("PI-1", "5001", "Purchases", "400.00", "0.00"),
                        ledgerEntry("PI-1", "1170", "Input VAT", "20.00", "0.00"),
                        // Purchase return of 100 + 5 VAT
                        ledgerEntry("PR-1", "5001", "Purchases", "0.00", "100.00"),
                        ledgerEntry("PR-1", "1170", "Input VAT", "0.00", "5.00")));

        TaxDashboardDTO dto = service.generateTaxDashboard(start, end, null);

        assertEquals(0, new BigDecimal("40.00").compareTo(dto.getOutputTax()));           // 50 - 10
        assertEquals(0, new BigDecimal("15.00").compareTo(dto.getInputTax()));            // 20 - 5
        assertEquals(0, new BigDecimal("800.00").compareTo(dto.getTaxableSalesBase()));   // 1000 - 200
        assertEquals(0, new BigDecimal("300.00").compareTo(dto.getTaxablePurchaseBase()));// 400 - 100
        assertEquals(0, new BigDecimal("25.00").compareTo(dto.getNetTaxPayable()));       // 40 - 15
    }

    /**
     * A reversing voucher must report as negative base/VAT rather than being abs()-ed
     * into a second positive line that inflates the reconciliation.
     */
    @Test
    void taxReconciliationSignsReversingVouchersNegative() {
        LocalDate start = LocalDate.of(2026, 1, 1);
        LocalDate end = LocalDate.of(2026, 3, 31);

        when(accountRepository.findAll()).thenReturn(List.of(
                taxAccount("2110", "Output VAT", "OUTPUT_TAX"),
                taxAccount("4001", "Sales", "TAXABLE_SALES")));

        when(ledgerEntryRepository.findByTransactionDateBetweenOrderByTransactionDateAsc(start, end))
                .thenReturn(List.of(
                        ledgerEntry("INV-1", "4001", "Sales", "0.00", "1000.00"),
                        ledgerEntry("INV-1", "2110", "Output VAT", "0.00", "50.00"),
                        ledgerEntry("CN-1", "4001", "Sales", "200.00", "0.00"),
                        ledgerEntry("CN-1", "2110", "Output VAT", "10.00", "0.00")));

        TaxReconciliationDTO dto = service.generateTaxReconciliation(start, end, null);

        TaxReconciliationDTO.TaxAuditLine invoice = dto.getLines().stream()
                .filter(l -> "INV-1".equals(l.getDocumentNumber())).findFirst().orElseThrow();
        TaxReconciliationDTO.TaxAuditLine creditNote = dto.getLines().stream()
                .filter(l -> "CN-1".equals(l.getDocumentNumber())).findFirst().orElseThrow();

        assertEquals(0, new BigDecimal("1000.00").compareTo(invoice.getBaseAmount()));
        assertEquals(0, new BigDecimal("50.00").compareTo(invoice.getTaxAmount()));
        assertEquals(0, new BigDecimal("-200.00").compareTo(creditNote.getBaseAmount()));
        assertEquals(0, new BigDecimal("-10.00").compareTo(creditNote.getTaxAmount()));
        assertEquals("SALES", creditNote.getType());
    }

    /**
     * Account.taxRole is never written by any seeder, migration or endpoint, so on a live
     * database it is null on every row and the whole VAT return came back as zero. The
     * roles must therefore be derivable from the seeded Chart of Accounts alone.
     */
    @Test
    void taxDashboardClassifiesSeededAccountsWhenTaxRoleIsUnset() {
        LocalDate start = LocalDate.of(2026, 1, 1);
        LocalDate end = LocalDate.of(2026, 3, 31);
        LocalDate day = LocalDate.of(2026, 2, 10);

        // Exactly as SystemAccountSeeder writes them: no taxRole anywhere.
        when(accountRepository.findAll()).thenReturn(List.of(
                coaAccount("1100", "Accounts Receivable Control", "Assets", "ACCOUNTS_RECEIVABLE"),
                coaAccount("2051", "Deferred Revenue", "Liabilities", "CURRENT_LIABILITIES"),
                coaAccount("2100", "VAT Output Tax", "Liabilities", "TAX_LIABILITIES"),
                coaAccount("1310", "VAT Input Tax", "Assets", "TAX_ASSETS"),
                coaAccount("1200", "Inventory - Raw / Retail", "Assets", "INVENTORY"),
                coaAccount("2002", "GRN Clearing", "Liabilities", "CURRENT_LIABILITIES"),
                coaAccount("2001", "Accounts Payable Control", "Liabilities", "ACCOUNTS_PAYABLE")));

        when(ledgerEntryRepository.findByTransactionDateBetweenOrderByTransactionDateAsc(start, end))
                .thenReturn(List.of(
                        // Sales invoice: Dr AR 1050 / Cr Deferred Revenue 1000 / Cr VAT Output 50
                        dated(ledgerEntry("INV-1", "1100", "Accounts Receivable", "1050.00", "0.00"), day),
                        dated(ledgerEntry("INV-1", "2051", "Deferred Revenue", "0.00", "1000.00"), day),
                        dated(ledgerEntry("INV-1", "2100", "VAT Output", "0.00", "50.00"), day),
                        // Revenue recognition carries no VAT and must stay out of the return
                        dated(ledgerEntry("DN-1", "2051", "Deferred Revenue", "1000.00", "0.00"), day),
                        // Purchase invoice: Dr Inventory 400 / Dr VAT Input 20 / Cr AP 420
                        dated(ledgerEntry("PI-1", "1200", "Inventory", "400.00", "0.00"), day),
                        dated(ledgerEntry("PI-1", "1310", "VAT Input", "20.00", "0.00"), day),
                        dated(ledgerEntry("PI-1", "2001", "Accounts Payable - ACME Trading", "0.00", "420.00"),
                                day)));

        TaxDashboardDTO dto = service.generateTaxDashboard(start, end, null);

        assertEquals(0, new BigDecimal("50.00").compareTo(dto.getOutputTax()));
        assertEquals(0, new BigDecimal("20.00").compareTo(dto.getInputTax()));
        assertEquals(0, new BigDecimal("1000.00").compareTo(dto.getTaxableSalesBase()));
        assertEquals(0, new BigDecimal("400.00").compareTo(dto.getTaxablePurchaseBase()));
        assertEquals(0, new BigDecimal("30.00").compareTo(dto.getNetTaxPayable()));
    }

    /**
     * The registers only list vouchers that actually moved VAT, and each carries the
     * voucher date plus the counterparty taken from the AR/AP line name.
     */
    @Test
    void taxReconciliationReportsOnlyVatBearingVouchersWithDateAndParty() {
        LocalDate start = LocalDate.of(2026, 1, 1);
        LocalDate end = LocalDate.of(2026, 3, 31);
        LocalDate day = LocalDate.of(2026, 2, 10);

        when(accountRepository.findAll()).thenReturn(List.of(
                coaAccount("2051", "Deferred Revenue", "Liabilities", "CURRENT_LIABILITIES"),
                coaAccount("2100", "VAT Output Tax", "Liabilities", "TAX_LIABILITIES"),
                coaAccount("1310", "VAT Input Tax", "Assets", "TAX_ASSETS"),
                coaAccount("1200", "Inventory - Raw / Retail", "Assets", "INVENTORY"),
                coaAccount("2001", "Accounts Payable Control", "Liabilities", "ACCOUNTS_PAYABLE"),
                coaAccount("6100", "Salaries", "Expenses", "OPERATING_EXPENSES"),
                coaAccount("2200", "Salary Payable", "Liabilities", "CURRENT_LIABILITIES")));

        when(ledgerEntryRepository.findByTransactionDateBetweenOrderByTransactionDateAsc(start, end))
                .thenReturn(List.of(
                        dated(ledgerEntry("INV-1", "2051", "Deferred Revenue", "0.00", "1000.00"), day),
                        dated(ledgerEntry("INV-1", "2100", "VAT Output", "0.00", "50.00"), day),
                        dated(ledgerEntry("PI-1", "1200", "Inventory", "400.00", "0.00"), day),
                        dated(ledgerEntry("PI-1", "1310", "VAT Input", "20.00", "0.00"), day),
                        dated(ledgerEntry("PI-1", "2001", "Accounts Payable - ACME Trading", "0.00", "420.00"),
                                day),
                        // Payroll: an expense voucher with no VAT at all
                        dated(ledgerEntry("PAY-1", "6100", "Salaries", "5000.00", "0.00"), day),
                        dated(ledgerEntry("PAY-1", "2200", "Salary Payable", "0.00", "5000.00"), day)));

        TaxReconciliationDTO dto = service.generateTaxReconciliation(start, end, null);

        assertEquals(2, dto.getLines().size());
        TaxReconciliationDTO.TaxAuditLine sale = dto.getLines().stream()
                .filter(l -> "SALES".equals(l.getType())).findFirst().orElseThrow();
        TaxReconciliationDTO.TaxAuditLine purchase = dto.getLines().stream()
                .filter(l -> "PURCHASE".equals(l.getType())).findFirst().orElseThrow();

        assertEquals("2026-02-10", sale.getDate());
        assertEquals(0, new BigDecimal("1000.00").compareTo(sale.getBaseAmount()));
        assertEquals(0, new BigDecimal("50.00").compareTo(sale.getTaxAmount()));
        assertEquals("ACME Trading", purchase.getAccountName());
        assertEquals(0, new BigDecimal("400.00").compareTo(purchase.getBaseAmount()));
        assertEquals(0, new BigDecimal("20.00").compareTo(purchase.getTaxAmount()));
    }
}
