package com.billbull.backend.financials.reports;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.financials.expense.ExpenseRepository;
import com.billbull.backend.financials.generalledger.LedgerEntry;
import com.billbull.backend.financials.generalledger.LedgerEntryRepository;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.customerledger.OpeningInvoice;
import com.billbull.backend.sales.customerledger.OpeningInvoiceRepository;
import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.financials.chartofaccounts.CostCenter;
import com.billbull.backend.financials.chartofaccounts.CostCenterRepository;
import com.billbull.backend.purchase.invoice.PurchaseInvoice;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.purchase.lpo.Lpo;
import com.billbull.backend.purchase.lpo.LpoRepository;
import com.billbull.backend.purchase.lpo.LpoStatus;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * Service for generating IFRS/GAAP-compliant financial reports.
 * All reports are computed server-side from permanent Ledger Entry data.
 */
@Service
public class FinancialReportService {

    private final AccountRepository accountRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final ExpenseRepository expenseRepository;
    private final SalesInvoiceRepository salesInvoiceRepository;
    private final PurchaseInvoiceRepository purchaseInvoiceRepository;
    private final OpeningInvoiceRepository openingInvoiceRepository;
    private final CustomerRepository customerRepository;
    private final LpoRepository lpoRepository;
    private final CostCenterRepository costCenterRepository;
    private final BranchAccessService branchAccessService;

    public FinancialReportService(
            AccountRepository accountRepository,
            LedgerEntryRepository ledgerEntryRepository,
            ExpenseRepository expenseRepository,
            SalesInvoiceRepository salesInvoiceRepository,
            PurchaseInvoiceRepository purchaseInvoiceRepository,
            OpeningInvoiceRepository openingInvoiceRepository,
            CustomerRepository customerRepository,
            LpoRepository lpoRepository,
            CostCenterRepository costCenterRepository,
            BranchAccessService branchAccessService) {
        this.accountRepository = accountRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.expenseRepository = expenseRepository;
        this.salesInvoiceRepository = salesInvoiceRepository;
        this.purchaseInvoiceRepository = purchaseInvoiceRepository;
        this.openingInvoiceRepository = openingInvoiceRepository;
        this.customerRepository = customerRepository;
        this.lpoRepository = lpoRepository;
        this.costCenterRepository = costCenterRepository;
        this.branchAccessService = branchAccessService;
    }

    // ==================== BRANCH FILTER HELPER ====================

    private List<LedgerEntry> fetchEntries(Long branchId, LocalDate start, LocalDate end) {
        if (branchId != null) {
            return ledgerEntryRepository
                    .findByBranchIdAndTransactionDateBetweenOrderByTransactionDateAsc(branchId, start, end);
        }
        return ledgerEntryRepository
                .findByTransactionDateBetweenOrderByTransactionDateAsc(start, end);
    }

    private List<LedgerEntry> fetchEntriesBefore(Long branchId, LocalDate before) {
        List<LedgerEntry> all = ledgerEntryRepository.findByTransactionDateBefore(before);
        if (branchId != null) {
            return all.stream().filter(e -> e.getBranch() != null && branchId.equals(e.getBranch().getId()))
                    .collect(Collectors.toList());
        }
        return all;
    }

    // ==================== TRIAL BALANCE ====================

    /**
     * Generates a Trial Balance from the Ledger.
     * Groups debit/credit totals by account.
     */
    public TrialBalanceDTO generateTrialBalance(LocalDate startDate, LocalDate endDate) {
        return generateTrialBalance(startDate, endDate, null);
    }

    public TrialBalanceDTO generateTrialBalance(LocalDate startDate, LocalDate endDate, Long branchId) {
        if (startDate == null)
            startDate = LocalDate.of(1970, 1, 1);
        if (endDate == null)
            endDate = LocalDate.now();

        // ARCHFIX §4.1: aggregate SUM(debit)/SUM(credit) GROUP BY account_code in SQL instead of
        // loading every ledger entry and folding in Java. One row per account, not per entry.
        List<LedgerEntryRepository.AccountAggregate> aggregates =
                ledgerEntryRepository.aggregateByAccountCode(branchId, startDate, endDate);

        Map<String, BigDecimal> debitMap = new LinkedHashMap<>();
        Map<String, BigDecimal> creditMap = new LinkedHashMap<>();
        Map<String, String> accountNameMap = new LinkedHashMap<>();
        Map<String, String> accountGroupMap = new LinkedHashMap<>();

        for (LedgerEntryRepository.AccountAggregate agg : aggregates) {
            String key = agg.getAccountCode();
            accountNameMap.putIfAbsent(key, agg.getAccountName());
            debitMap.merge(key, safe(agg.getSumDebit()), BigDecimal::add);
            creditMap.merge(key, safe(agg.getSumCredit()), BigDecimal::add);
        }

        List<Account> allAccounts = accountRepository.findAll();
        for (Account acc : allAccounts) {
            if (acc.getAccountGroup() != null) {
                accountGroupMap.put(acc.getCode(), acc.getAccountGroup());
            }
        }

        List<TrialBalanceLineDTO> lines = new ArrayList<>();
        BigDecimal totalDebit = BigDecimal.ZERO;
        BigDecimal totalCredit = BigDecimal.ZERO;

        Set<String> allKeys = new LinkedHashSet<>();
        allKeys.addAll(debitMap.keySet());
        allKeys.addAll(creditMap.keySet());

        for (String key : allKeys) {
            BigDecimal debit = debitMap.getOrDefault(key, BigDecimal.ZERO);
            BigDecimal credit = creditMap.getOrDefault(key, BigDecimal.ZERO);

            BigDecimal netDebit = BigDecimal.ZERO;
            BigDecimal netCredit = BigDecimal.ZERO;

            if (debit.compareTo(credit) >= 0) {
                netDebit = debit.subtract(credit);
            } else {
                netCredit = credit.subtract(debit);
            }

            if (netDebit.compareTo(BigDecimal.ZERO) > 0 || netCredit.compareTo(BigDecimal.ZERO) > 0) {
                String accName = accountNameMap.getOrDefault(key, key);
                String accGroup = accountGroupMap.getOrDefault(key, "");

                lines.add(new TrialBalanceLineDTO(key, accName, accGroup, netDebit, netCredit));
                totalDebit = totalDebit.add(netDebit);
                totalCredit = totalCredit.add(netCredit);
            }
        }

        TrialBalanceDTO dto = new TrialBalanceDTO();
        dto.setLines(lines);
        dto.setTotalDebit(totalDebit);
        dto.setTotalCredit(totalCredit);
        dto.setBalanced(totalDebit.compareTo(totalCredit) == 0);
        dto.setAsOfDate(endDate.toString());

        return dto;
    }

    // ==================== PROFIT & LOSS ====================

    public ProfitLossDTO generateProfitLoss(LocalDate startDate, LocalDate endDate) {
        return generateProfitLoss(startDate, endDate, null, null);
    }

    /**
     * Cost centers offered by the report filter, each flagged with whether any ledger entry in
     * the period actually carries it.
     *
     * <p>Combines the cost-center master with the labels the posting engine stamped on ledger
     * lines, because the two drift: auto-postings often leave the dimension blank, and some
     * write a label that was never a cost center at all. Surfacing {@code hasData} is what
     * stops a filter selection from silently producing an empty statement.
     */
    public List<CostCenterOptionDTO> getCostCenterOptions(LocalDate startDate, LocalDate endDate, Long branchId) {
        if (startDate == null) startDate = LocalDate.now().withDayOfMonth(1);
        if (endDate == null) endDate = LocalDate.now();

        Set<String> used = new HashSet<>();
        for (String label : ledgerEntryRepository.findUsedCostCenters(branchId, startDate, endDate)) {
            if (label != null && !label.isBlank()) used.add(label.trim().toLowerCase());
        }

        List<CostCenterOptionDTO> options = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (CostCenter cc : costCenterRepository.findAll()) {
            if (cc.getCode() == null || "archived".equalsIgnoreCase(cc.getStatus())) continue;
            String code = cc.getCode().trim();
            if (!seen.add(code.toLowerCase())) continue;
            boolean hasData = used.contains(code.toLowerCase())
                    || (cc.getName() != null && used.contains(cc.getName().trim().toLowerCase()));
            options.add(new CostCenterOptionDTO(code, cc.getName(), hasData));
        }
        options.sort(Comparator.comparing(CostCenterOptionDTO::getCode, String.CASE_INSENSITIVE_ORDER));
        return options;
    }

    public ProfitLossDTO generateProfitLoss(LocalDate startDate, LocalDate endDate, Long branchId) {
        return generateProfitLoss(startDate, endDate, branchId, null);
    }

    public ProfitLossDTO generateProfitLoss(LocalDate startDate, LocalDate endDate, Long branchId, String costCenter) {
        if (startDate == null)
            startDate = LocalDate.now().withDayOfMonth(1); // Default to this month start
        if (endDate == null)
            endDate = LocalDate.now();

        // ARCHFIX §4.1: SQL-side per-account aggregation (with optional cost-center filter) instead
        // of loading every ledger entry and folding in Java.
        boolean byCostCenter = costCenter != null && !costCenter.isBlank();
        // Ledger lines carry the cost center as free text, so a filter on "CC-001" must also
        // match lines stamped with that cost center's name (and vice versa).
        String costCenterName = null;
        if (byCostCenter) {
            CostCenter cc = costCenterRepository.findByCode(costCenter.trim());
            costCenterName = cc != null ? cc.getName() : null;
        }
        List<LedgerEntryRepository.AccountAggregate> aggregates = byCostCenter
                ? ledgerEntryRepository.aggregateByAccountCodeAndCostCenter(
                        branchId, startDate, endDate, costCenter.trim(), costCenterName)
                : ledgerEntryRepository.aggregateByAccountCode(branchId, startDate, endDate);

        Map<String, BigDecimal> accountBalances = new LinkedHashMap<>();
        Map<String, String> accountNames = new HashMap<>();
        Map<String, String> accountReportGroup = new HashMap<>();
        Map<String, String> accountGroupMap = new HashMap<>();

        List<Account> allAccounts = accountRepository.findAll();
        for (Account acc : allAccounts) {
            accountReportGroup.put(acc.getCode(),
                    acc.getReportGroup() != null ? acc.getReportGroup() : "UNCATEGORIZED");
            accountGroupMap.put(acc.getCode(), acc.getAccountGroup());
        }

        for (LedgerEntryRepository.AccountAggregate agg : aggregates) {
            // netBal = SUM(credit) - SUM(debit), preserving the previous per-entry fold semantics.
            accountBalances.merge(agg.getAccountCode(),
                    safe(agg.getSumCredit()).subtract(safe(agg.getSumDebit())),
                    BigDecimal::add);
            accountNames.put(agg.getAccountCode(), agg.getAccountName());
        }

        List<ReportLineDTO> revenueItems = new ArrayList<>();
        List<ReportLineDTO> cogsItems = new ArrayList<>();
        List<ReportLineDTO> opexItems = new ArrayList<>();
        List<ReportLineDTO> otherIncomeItems = new ArrayList<>();

        BigDecimal totalRevenue = BigDecimal.ZERO;
        BigDecimal totalCogs = BigDecimal.ZERO;
        BigDecimal totalOpex = BigDecimal.ZERO;
        BigDecimal totalOtherIncome = BigDecimal.ZERO;

        for (Map.Entry<String, BigDecimal> balanceEntry : accountBalances.entrySet()) {
            String code = balanceEntry.getKey();
            BigDecimal netBal = balanceEntry.getValue();
            String group = normalizeProfitLossGroup(
                    accountReportGroup.getOrDefault(code, "UNCATEGORIZED"),
                    accountGroupMap.get(code));
            String name = accountNames.get(code);

            ReportLineDTO line = new ReportLineDTO(code, name, group, netBal.abs());

            switch (group) {
                case "REVENUE":
                    revenueItems.add(line);
                    totalRevenue = totalRevenue.add(netBal.negate()); // Revenue is normally Credit, but if we want
                                                                      // positive display
                    break;
                case "COGS":
                    cogsItems.add(line);
                    totalCogs = totalCogs.add(netBal); // COGS is normally Debit, netBal (Cr-Dr) will be negative
                    break;
                case "OPERATING_EXPENSES":
                case "ADMIN_EXPENSES":
                    opexItems.add(line);
                    totalOpex = totalOpex.add(netBal);
                    break;
                case "OTHER_INCOME":
                    otherIncomeItems.add(line);
                    totalOtherIncome = totalOtherIncome.add(netBal.negate());
                    break;
            }
        }

        // Convert expense totals to positive display values using sign semantics instead of .abs().
        // .abs() would mask abnormal balances (e.g. net Cr on COGS from excessive returns).
        // COGS and OPEX are Dr-normal: netBal is (Cr-Dr), so negate to get a positive display amount.
        // Revenue totals are already positive from the negate() above.
        totalCogs = totalCogs.negate();
        totalOpex = totalOpex.negate();

        BigDecimal grossProfit = totalRevenue.subtract(totalCogs);
        BigDecimal netProfit = grossProfit.subtract(totalOpex).add(totalOtherIncome);

        ProfitLossDTO dto = new ProfitLossDTO();
        dto.setRevenueItems(revenueItems);
        dto.setTotalRevenue(totalRevenue);
        dto.setCogsItems(cogsItems);
        dto.setTotalCogs(totalCogs);
        dto.setGrossProfit(grossProfit);
        dto.setOperatingExpenseItems(opexItems);
        dto.setTotalOperatingExpenses(totalOpex);
        dto.setOtherIncomeItems(otherIncomeItems);
        dto.setTotalOtherIncome(totalOtherIncome);
        dto.setNetProfit(netProfit);

        // Backward compatibility for existing simple expenseItems list
        List<ReportLineDTO> allExpenses = new ArrayList<>(cogsItems);
        allExpenses.addAll(opexItems);
        dto.setExpenseItems(allExpenses);
        dto.setTotalExpenses(totalCogs.add(totalOpex));

        dto.setStartDate(startDate.toString());
        dto.setEndDate(endDate.toString());

        return dto;
    }

    // ==================== BALANCE SHEET ====================

    public BalanceSheetDTO generateBalanceSheet(LocalDate asOfDate) {
        return generateBalanceSheet(asOfDate, null);
    }

    public BalanceSheetDTO generateBalanceSheet(LocalDate asOfDate, Long branchId) {
        if (asOfDate == null)
            asOfDate = LocalDate.now();

        BalanceSheetDTO dto = new BalanceSheetDTO();
        dto.setAsOfDate(asOfDate.toString());

        // ARCHFIX §4.1: SQL-side per-account cumulative balance (debit - credit) for all entries up to
        // and including asOfDate, instead of loading every prior ledger entry and folding in Java.
        // fetchEntriesBefore used transactionDate < asOfDate.plusDays(1) (i.e. <= asOfDate); preserved.
        List<LedgerEntryRepository.AccountAggregate> aggregates =
                ledgerEntryRepository.aggregateByAccountCodeBefore(branchId, asOfDate.plusDays(1));
        Map<String, BigDecimal> computedBalances = new HashMap<>();
        for (LedgerEntryRepository.AccountAggregate agg : aggregates) {
            computedBalances.merge(agg.getAccountCode(),
                    safe(agg.getSumDebit()).subtract(safe(agg.getSumCredit())),
                    BigDecimal::add);
        }

        List<Account> allAccounts = accountRepository.findAll();
        List<ReportLineDTO> assetItems = new ArrayList<>();
        List<ReportLineDTO> liabilityItems = new ArrayList<>();
        List<ReportLineDTO> equityItems = new ArrayList<>();

        BigDecimal totalAssets = BigDecimal.ZERO;
        BigDecimal totalLiabilities = BigDecimal.ZERO;
        BigDecimal totalEquity = BigDecimal.ZERO;

        for (Account account : allAccounts) {
            if (Boolean.TRUE.equals(account.getIsGroup()))
                continue;

            BigDecimal rawBalance = computedBalances.getOrDefault(account.getCode(), BigDecimal.ZERO);
            // Include zero balance accounts if needed for structure, but usually BS skips
            // zeros
            if (rawBalance.compareTo(BigDecimal.ZERO) == 0)
                continue;

            boolean isDebitNormal = "Assets".equalsIgnoreCase(account.getAccountGroup())
                    || "Expenses".equalsIgnoreCase(account.getAccountGroup());
            BigDecimal displayBalance = isDebitNormal ? rawBalance : rawBalance.negate();

            String reportGroupCode = account.getReportGroup() != null ? account.getReportGroup() : "UNCATEGORIZED";
            String category = mapReportGroup(reportGroupCode);

            // Override for Cash & Cash Equivalents as per Excel (cash_flag is the key)
            if (Boolean.TRUE.equals(account.getCashFlag())) {
                category = "Cash & Cash Equivalents";
            }

            if ("Assets".equalsIgnoreCase(account.getAccountGroup())) {
                assetItems.add(new ReportLineDTO(account.getCode(), account.getName(), category, displayBalance));
                totalAssets = totalAssets.add(displayBalance);
            } else if ("Liabilities".equalsIgnoreCase(account.getAccountGroup())) {
                liabilityItems.add(new ReportLineDTO(account.getCode(), account.getName(), category, displayBalance));
                totalLiabilities = totalLiabilities.add(displayBalance);
            } else if ("Equity".equalsIgnoreCase(account.getAccountGroup())) {
                equityItems.add(new ReportLineDTO(account.getCode(), account.getName(), category, displayBalance));
                totalEquity = totalEquity.add(displayBalance);
            }
        }

        ProfitLossDTO pl = generateProfitLoss(LocalDate.of(1970, 1, 1), asOfDate, branchId);
        if (pl.getNetProfit() != null && pl.getNetProfit().compareTo(BigDecimal.ZERO) != 0) {
            BigDecimal displayRetained = pl.getNetProfit();
            equityItems.add(new ReportLineDTO("3999", "Retained Earnings", "Retained Earnings", displayRetained));
            totalEquity = totalEquity.add(displayRetained);
        }

        dto.setTotalAssets(totalAssets);
        dto.setTotalLiabilities(totalLiabilities);
        dto.setTotalEquity(totalEquity);
        dto.setAssetItems(assetItems);
        dto.setLiabilityItems(liabilityItems);
        dto.setEquityItems(equityItems);
        dto.setBalanced(totalAssets.compareTo(totalLiabilities.add(totalEquity)) == 0);

        return dto;
    }

    // ==================== CASH FLOW ====================

    public CashFlowDTO generateCashFlow(LocalDate startDate, LocalDate endDate) {
        return generateCashFlow(startDate, endDate, null);
    }

    public CashFlowDTO generateCashFlow(LocalDate startDate, LocalDate endDate, Long branchId) {
        if (startDate == null)
            startDate = LocalDate.of(1970, 1, 1);
        if (endDate == null)
            endDate = LocalDate.now();

        List<LedgerEntry> entries = fetchEntries(branchId, startDate, endDate);

        List<ReportLineDTO> operatingItems = new ArrayList<>();
        List<ReportLineDTO> investingItems = new ArrayList<>();
        List<ReportLineDTO> financingItems = new ArrayList<>();

        BigDecimal totalOperating = BigDecimal.ZERO;
        BigDecimal totalInvesting = BigDecimal.ZERO;
        BigDecimal totalFinancing = BigDecimal.ZERO;

        for (LedgerEntry entry : entries) {
            if (entry.getCfBucket() != null && !entry.getCfBucket().isEmpty()) {
                BigDecimal cashEffect = safe(entry.getDebitAmount())
                        .subtract(safe(entry.getCreditAmount()));

                if (cashEffect.compareTo(BigDecimal.ZERO) == 0)
                    continue;

                String bucket = entry.getCfBucket().toUpperCase();
                ReportLineDTO line = new ReportLineDTO(entry.getAccountCode(), entry.getAccountName(), bucket,
                        cashEffect);

                if (bucket.startsWith("OPERATING")) {
                    operatingItems.add(line);
                    totalOperating = totalOperating.add(cashEffect);
                } else if (bucket.startsWith("INVESTING")) {
                    investingItems.add(line);
                    totalInvesting = totalInvesting.add(cashEffect);
                } else if (bucket.startsWith("FINANCING")) {
                    financingItems.add(line);
                    totalFinancing = totalFinancing.add(cashEffect);
                } else {
                    operatingItems.add(line);
                    totalOperating = totalOperating.add(cashEffect);
                }
            }
        }

        CashFlowDTO dto = new CashFlowDTO();
        dto.setOperatingActivities(operatingItems);
        dto.setTotalOperating(totalOperating);
        dto.setInvestingActivities(investingItems);
        dto.setTotalInvesting(totalInvesting);
        dto.setFinancingActivities(financingItems);
        dto.setTotalFinancing(totalFinancing);
        BigDecimal netCashFlow = totalOperating.add(totalInvesting).add(totalFinancing);
        dto.setNetCashFlow(netCashFlow);
        dto.setStartDate(startDate.toString());
        dto.setEndDate(endDate.toString());

        // Cash flow tie-back (PDF §15 / Phase 7.3):
        // Closing cash on the statement should equal Cash (1101) + Bank (1102) on the Balance Sheet.
        BigDecimal bsCash = safe(ledgerEntryRepository.netBalanceByAccountCode("1001"))
                .add(safe(ledgerEntryRepository.netBalanceByAccountCode("1010")));
        // Opening cash = cumulative Cash (1001) + Bank (1010) GL balance before the period start date.
        final LocalDate periodStart = startDate;
        BigDecimal openingCash = safe(ledgerEntryRepository.netBalanceByAccountCodeBefore("1001", periodStart))
                .add(safe(ledgerEntryRepository.netBalanceByAccountCodeBefore("1010", periodStart)));
        BigDecimal closingCF  = openingCash.add(netCashFlow);
        dto.setOpeningCash(openingCash);
        dto.setClosingCashFromBalanceSheet(bsCash);
        dto.setClosingCashFromCashFlow(closingCF);
        boolean pass = bsCash.subtract(closingCF).abs().compareTo(new java.math.BigDecimal("1.00")) <= 0;
        dto.setTieOut(pass ? "PASS" : "FAIL");

        return dto;
    }

    // ==================== EXPENSE ANALYSIS ====================

    public ExpenseAnalysisDTO generateExpenseAnalysis(LocalDate startDate, LocalDate endDate) {
        return generateExpenseAnalysis(startDate, endDate, null);
    }

    public ExpenseAnalysisDTO generateExpenseAnalysis(LocalDate startDate, LocalDate endDate, Long branchId) {
        if (startDate == null)
            startDate = LocalDate.of(1970, 1, 1);
        if (endDate == null)
            endDate = LocalDate.now();

        List<LedgerEntry> entries = fetchEntries(branchId, startDate, endDate);

        Map<String, BigDecimal> byCategoryMap = new LinkedHashMap<>();
        Map<String, Integer> byCategoryCount = new LinkedHashMap<>();
        Map<String, BigDecimal> byCostCenterMap = new LinkedHashMap<>();
        Map<String, Integer> byCostCenterCount = new LinkedHashMap<>();
        List<ExpenseDetailDTO> detailLines = new ArrayList<>();
        BigDecimal totalExpenses = BigDecimal.ZERO;

        List<Account> expenseAccounts = accountRepository.findAll().stream()
                .filter(a -> "Expenses".equalsIgnoreCase(a.getAccountGroup()))
                .collect(Collectors.toList());
        Set<String> expenseAccountCodes = expenseAccounts.stream().map(Account::getCode).collect(Collectors.toSet());

        for (LedgerEntry entry : entries) {
            if (expenseAccountCodes.contains(entry.getAccountCode())) {
                BigDecimal amount = entry.getDebitAmount() != null ? entry.getDebitAmount() : BigDecimal.ZERO;
                if (amount.compareTo(BigDecimal.ZERO) <= 0)
                    continue;

                totalExpenses = totalExpenses.add(amount);

                String category = entry.getAccountName();
                byCategoryMap.merge(category, amount, (a, b) -> a.add(b));
                byCategoryCount.merge(category, 1, (a, b) -> a + b);

                String costCenter = entry.getCostCenter() != null ? entry.getCostCenter() : "Unassigned";
                byCostCenterMap.merge(costCenter, amount, (a, b) -> a.add(b));
                byCostCenterCount.merge(costCenter, 1, (a, b) -> a + b);

                detailLines.add(new ExpenseDetailDTO(
                        entry.getTransactionDate() != null ? entry.getTransactionDate().toString() : null,
                        entry.getVoucherNo(),
                        entry.getAccountCode(),
                        entry.getAccountName(),
                        costCenter,
                        amount));
            }
        }

        List<ExpenseGroupDTO> byCategory = byCategoryMap.entrySet().stream()
                .map(e -> new ExpenseGroupDTO(e.getKey(), e.getValue(), byCategoryCount.getOrDefault(e.getKey(), 0)))
                .sorted((a, b) -> b.getAmount().compareTo(a.getAmount()))
                .collect(Collectors.toList());

        List<ExpenseGroupDTO> byCostCenter = byCostCenterMap.entrySet().stream()
                .map(e -> new ExpenseGroupDTO(e.getKey(), e.getValue(), byCostCenterCount.getOrDefault(e.getKey(), 0)))
                .sorted((a, b) -> b.getAmount().compareTo(a.getAmount()))
                .collect(Collectors.toList());

        ExpenseAnalysisDTO dto = new ExpenseAnalysisDTO();
        dto.setByCategory(byCategory);
        dto.setByCostCenter(byCostCenter);
        dto.setDetailLines(detailLines.stream()
                .sorted((a, b) -> b.getAmount().compareTo(a.getAmount()))
                .collect(Collectors.toList()));
        dto.setTotalExpenses(totalExpenses);
        dto.setStartDate(startDate.toString());
        dto.setEndDate(endDate.toString());

        return dto;
    }

    // ==================== TAX DASHBOARD ====================

    private static final String ACC_VAT_OUTPUT = "2100";
    private static final String ACC_VAT_INPUT = "1310";
    private static final String ACC_DEFERRED_REVENUE = "2051";

    private static final String ROLE_OUTPUT_TAX = "OUTPUT_TAX";
    private static final String ROLE_INPUT_TAX = "INPUT_TAX";
    private static final String ROLE_TAXABLE_SALES = "TAXABLE_SALES";
    private static final String ROLE_TAXABLE_PURCHASE = "TAXABLE_PURCHASE";

    /**
     * Account code to VAT role.
     *
     * {@code Account.taxRole} is honoured when a tenant has populated it, but nothing in
     * the application ever writes that column - no seeder, no migration, no controller -
     * so it is null on every live database and the VAT dashboard/registers computed from
     * it rendered as all-zero. The fallback classifies from the seeded Chart of Accounts
     * instead: the two VAT control accounts by code, and the base accounts by account /
     * report group so tenant-created revenue and expense accounts are picked up too.
     */
    private Map<String, String> buildTaxRoleMap() {
        Map<String, String> map = new HashMap<>();
        for (Account a : accountRepository.findAll()) {
            if (a.getCode() == null)
                continue;
            String explicit = a.getTaxRole();
            String role = (explicit != null && !explicit.isBlank()) ? explicit.trim() : deriveTaxRole(a);
            if (role != null)
                map.putIfAbsent(a.getCode(), role);
        }
        return map;
    }

    private String deriveTaxRole(Account a) {
        String code = a.getCode();
        if (ACC_VAT_OUTPUT.equals(code))
            return ROLE_OUTPUT_TAX;
        if (ACC_VAT_INPUT.equals(code))
            return ROLE_INPUT_TAX;
        // 2101 VAT Payable (Net) is deliberately absent: it carries the net of a filed
        // return, not tax charged on individual supplies.

        // A sales invoice credits Deferred Revenue, not Sales Revenue - the delivery note
        // recognises it into 4001 later. Treating it as a taxable-sales account is what
        // gives the invoice voucher a base to sit against its VAT Output line.
        if (ACC_DEFERRED_REVENUE.equals(code))
            return ROLE_TAXABLE_SALES;

        if ("Income".equalsIgnoreCase(a.getAccountGroup()))
            return ROLE_TAXABLE_SALES;
        if ("Expenses".equalsIgnoreCase(a.getAccountGroup()))
            return ROLE_TAXABLE_PURCHASE;
        // Goods purchases debit Inventory, not COGS, until they are sold.
        if ("INVENTORY".equals(a.getReportGroup()))
            return ROLE_TAXABLE_PURCHASE;
        return null;
    }

    /**
     * One register line per voucher per side. A voucher is only reported when it actually
     * moves VAT, so non-taxable vouchers (payroll, transfers, revenue recognition) stay
     * out of the return, and the dashboard totals are exactly the sum of the register
     * lines the user sees underneath them.
     */
    private List<TaxReconciliationDTO.TaxAuditLine> collectVatLines(List<LedgerEntry> entries,
            Map<String, String> taxRoleMap) {

        Map<String, List<LedgerEntry>> groupedByRef = entries.stream()
                .filter(e -> e.getVoucherNo() != null)
                .collect(Collectors.groupingBy(LedgerEntry::getVoucherNo, LinkedHashMap::new, Collectors.toList()));

        List<TaxReconciliationDTO.TaxAuditLine> lines = new ArrayList<>();

        for (Map.Entry<String, List<LedgerEntry>> voucher : groupedByRef.entrySet()) {
            BigDecimal outputTax = BigDecimal.ZERO;
            BigDecimal inputTax = BigDecimal.ZERO;
            BigDecimal salesBase = BigDecimal.ZERO;
            BigDecimal purchaseBase = BigDecimal.ZERO;
            String salesName = null;
            String purchaseName = null;
            String counterparty = null;
            LocalDate date = null;

            // Signed by the account's natural side, so a reversing line subtracts instead of
            // adding: sales/output VAT are credit-side, purchases/input VAT are debit-side.
            for (LedgerEntry line : voucher.getValue()) {
                LocalDate lineDate = line.getTransactionDate();
                if (lineDate != null && (date == null || lineDate.isBefore(date)))
                    date = lineDate;

                String role = taxRoleMap.get(line.getAccountCode());
                if (role == null) {
                    if (counterparty == null)
                        counterparty = partyName(line);
                    continue;
                }
                if (ROLE_OUTPUT_TAX.equals(role)) {
                    outputTax = outputTax.add(creditLessDebit(line));
                } else if (ROLE_INPUT_TAX.equals(role)) {
                    inputTax = inputTax.add(debitLessCredit(line));
                } else if (ROLE_TAXABLE_SALES.equals(role)) {
                    salesBase = salesBase.add(creditLessDebit(line));
                    if (salesName == null)
                        salesName = line.getAccountName();
                } else if (ROLE_TAXABLE_PURCHASE.equals(role)) {
                    purchaseBase = purchaseBase.add(debitLessCredit(line));
                    if (purchaseName == null)
                        purchaseName = line.getAccountName();
                }
            }

            String dateText = date != null ? date.toString() : null;
            if (outputTax.signum() != 0) {
                lines.add(new TaxReconciliationDTO.TaxAuditLine(voucher.getKey(), dateText, "SALES",
                        salesBase, outputTax, counterparty != null ? counterparty : salesName));
            }
            if (inputTax.signum() != 0) {
                lines.add(new TaxReconciliationDTO.TaxAuditLine(voucher.getKey(), dateText, "PURCHASE",
                        purchaseBase, inputTax, counterparty != null ? counterparty : purchaseName));
            }
        }
        return lines;
    }

    /** "Accounts Payable - ACME Trading" yields "ACME Trading"; plain control names give nothing. */
    private String partyName(LedgerEntry line) {
        String name = line.getAccountName();
        if (name == null)
            return null;
        int sep = name.indexOf(" - ");
        return sep > 0 && sep + 3 < name.length() ? name.substring(sep + 3).trim() : null;
    }

    public TaxDashboardDTO generateTaxDashboard(LocalDate startDate, LocalDate endDate) {
        return generateTaxDashboard(startDate, endDate, null);
    }

    public TaxDashboardDTO generateTaxDashboard(LocalDate startDate, LocalDate endDate, Long branchId) {
        if (startDate == null)
            startDate = LocalDate.of(1970, 1, 1);
        if (endDate == null)
            endDate = LocalDate.now();

        List<TaxReconciliationDTO.TaxAuditLine> lines =
                collectVatLines(fetchEntries(branchId, startDate, endDate), buildTaxRoleMap());

        BigDecimal outputTax = BigDecimal.ZERO;
        BigDecimal inputTax = BigDecimal.ZERO;
        BigDecimal taxableSalesBase = BigDecimal.ZERO;
        BigDecimal taxablePurchaseBase = BigDecimal.ZERO;

        for (TaxReconciliationDTO.TaxAuditLine line : lines) {
            if ("SALES".equals(line.getType())) {
                outputTax = outputTax.add(line.getTaxAmount());
                taxableSalesBase = taxableSalesBase.add(line.getBaseAmount());
            } else {
                inputTax = inputTax.add(line.getTaxAmount());
                taxablePurchaseBase = taxablePurchaseBase.add(line.getBaseAmount());
            }
        }

        TaxDashboardDTO dto = new TaxDashboardDTO();
        dto.setOutputTax(outputTax);
        dto.setInputTax(inputTax);
        dto.setTaxableSalesBase(taxableSalesBase);
        dto.setTaxablePurchaseBase(taxablePurchaseBase);
        dto.setNetTaxPayable(outputTax.subtract(inputTax));
        dto.setPeriod(startDate.toString() + " to " + endDate.toString());

        return dto;
    }

    /** Net credit movement on a credit-side account (sales revenue, output VAT). */
    private BigDecimal creditLessDebit(LedgerEntry entry) {
        return safe(entry.getCreditAmount()).subtract(safe(entry.getDebitAmount()));
    }

    /** Net debit movement on a debit-side account (purchases, input VAT). */
    private BigDecimal debitLessCredit(LedgerEntry entry) {
        return safe(entry.getDebitAmount()).subtract(safe(entry.getCreditAmount()));
    }

    public TaxReconciliationDTO generateTaxReconciliation(LocalDate startDate, LocalDate endDate) {
        return generateTaxReconciliation(startDate, endDate, null);
    }

    public TaxReconciliationDTO generateTaxReconciliation(LocalDate startDate, LocalDate endDate, Long branchId) {
        if (startDate == null)
            startDate = LocalDate.of(1970, 1, 1);
        if (endDate == null)
            endDate = LocalDate.now();

        TaxReconciliationDTO dto = new TaxReconciliationDTO();
        dto.setPeriod(startDate.toString() + " to " + endDate.toString());
        dto.setLines(collectVatLines(fetchEntries(branchId, startDate, endDate), buildTaxRoleMap()));
        return dto;
    }

    // ==================== AGING & LEDGER ====================

    @Transactional(readOnly = true)
    public Object generateARAgingReport(LocalDate asOfDate) {
        if (asOfDate == null)
            asOfDate = LocalDate.now();
        List<SalesInvoice> invoices = salesInvoiceRepository.findAll();
        Map<String, Map<String, Object>> agingByCustomer = new HashMap<>();

        for (SalesInvoice inv : invoices) {
            String status = inv.getStatus() != null ? inv.getStatus().name() : "";
            if ("CANCELLED".equalsIgnoreCase(status) || "DRAFT".equalsIgnoreCase(status))
                continue;

            BigDecimal bal = inv.getBalance();
            if (bal == null || bal.signum() <= 0)
                continue;

            String customer = inv.getCustomerName() != null ? inv.getCustomerName() : "Unknown Customer";
            LocalDate date = inv.getInvoiceDate() != null ? inv.getInvoiceDate() : asOfDate;
            addAgingAmount(agingByCustomer, customer, date, bal, asOfDate);
        }

        Set<String> customersWithOpeningInvoices = new LinkedHashSet<>();
        for (OpeningInvoice openingInvoice : openingInvoiceRepository.findAll()) {
            if (openingInvoice.getCustomer() != null && openingInvoice.getCustomer().getCode() != null) {
                customersWithOpeningInvoices.add(openingInvoice.getCustomer().getCode());
            }

            BigDecimal balance = resolveCurrentOpeningOutstanding(openingInvoice);
            if (balance.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }

            String customer = "Unknown Customer";
            if (openingInvoice.getCustomer() != null && openingInvoice.getCustomer().getName() != null) {
                customer = openingInvoice.getCustomer().getName();
            }

            LocalDate date = openingInvoice.getDate() != null ? openingInvoice.getDate() : asOfDate;
            addAgingAmount(agingByCustomer, customer, date, balance, asOfDate);
        }

        for (Customer customer : customerRepository.findAll()) {
            if (customer.getCode() != null && customersWithOpeningInvoices.contains(customer.getCode())) {
                continue;
            }
            BigDecimal balance = customer.getBalance() != null ? customer.getBalance() : BigDecimal.ZERO;
            if (balance.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            String customerName = customer.getName() != null ? customer.getName() : "Unknown Customer";
            addAgingAmount(agingByCustomer, customerName, asOfDate, balance, asOfDate);
        }
        return agingByCustomer.values();
    }

    private void addAgingAmount(
            Map<String, Map<String, Object>> agingByPartner,
            String partnerName,
            LocalDate documentDate,
            BigDecimal balance,
            LocalDate asOfDate) {
        long daysOld = java.time.temporal.ChronoUnit.DAYS.between(documentDate, asOfDate);
        if (daysOld < 0) {
            daysOld = 0;
        }

        Map<String, Object> bucket = agingByPartner.computeIfAbsent(partnerName, k -> {
            Map<String, Object> map = new HashMap<>();
            map.put("partnerName", k);
            map.put("amount0to30", BigDecimal.ZERO);
            map.put("amount31to60", BigDecimal.ZERO);
            map.put("amount61to90", BigDecimal.ZERO);
            map.put("amount90Plus", BigDecimal.ZERO);
            map.put("total", BigDecimal.ZERO);
            return map;
        });

        bucket.put("total", ((BigDecimal) bucket.get("total")).add(balance));

        if (daysOld <= 30) {
            bucket.put("amount0to30", ((BigDecimal) bucket.get("amount0to30")).add(balance));
        } else if (daysOld <= 60) {
            bucket.put("amount31to60", ((BigDecimal) bucket.get("amount31to60")).add(balance));
        } else if (daysOld <= 90) {
            bucket.put("amount61to90", ((BigDecimal) bucket.get("amount61to90")).add(balance));
        } else {
            bucket.put("amount90Plus", ((BigDecimal) bucket.get("amount90Plus")).add(balance));
        }
    }

    private BigDecimal resolveCurrentOpeningOutstanding(OpeningInvoice openingInvoice) {
        BigDecimal outstanding = openingInvoice.getOutstanding();
        if (outstanding != null) {
            return outstanding.compareTo(BigDecimal.ZERO) > 0 ? outstanding : BigDecimal.ZERO;
        }

        BigDecimal amount = openingInvoice.getOpeningBalanceAmount();
        if (amount != null && amount.compareTo(BigDecimal.ZERO) > 0) {
            return amount;
        }

        amount = openingInvoice.getAmount();
        return amount != null ? amount : BigDecimal.ZERO;
    }

    @Transactional(readOnly = true)
    public Object generateAPAgingReport(LocalDate asOfDate) {
        if (asOfDate == null)
            asOfDate = LocalDate.now();
        List<PurchaseInvoice> invoices = purchaseInvoiceRepository.findAll();
        Map<String, Map<String, Object>> agingByVendor = new HashMap<>();

        for (PurchaseInvoice inv : invoices) {
            String status = inv.getStatus() != null ? inv.getStatus().name() : "";
            if ("CANCELLED".equalsIgnoreCase(status) || "DRAFT".equalsIgnoreCase(status))
                continue;

            BigDecimal gTotal = inv.getGrandTotal() != null ? inv.getGrandTotal() : BigDecimal.ZERO;
            BigDecimal paid = BigDecimal.ZERO;
            if (inv.getPayments() != null) {
                for (com.billbull.backend.purchase.invoice.InvoicePayment p : inv.getPayments()) {
                    if (p.getPaidAmount() != null)
                        paid = paid.add(p.getPaidAmount());
                }
            }
            BigDecimal bal = gTotal.subtract(paid);
            if (bal.compareTo(BigDecimal.ZERO) <= 0)
                continue;

            LocalDate date = inv.getInvoiceDate() != null ? inv.getInvoiceDate() : asOfDate;
            long daysOld = java.time.temporal.ChronoUnit.DAYS.between(date, asOfDate);
            if (daysOld < 0)
                daysOld = 0;

            String vendor = inv.getVendorName() != null ? inv.getVendorName() : "Unknown Vendor";

            Map<String, Object> bucket = agingByVendor.computeIfAbsent(vendor, k -> {
                Map<String, Object> map = new HashMap<>();
                map.put("partnerName", k);
                map.put("amount0to30", BigDecimal.ZERO);
                map.put("amount31to60", BigDecimal.ZERO);
                map.put("amount61to90", BigDecimal.ZERO);
                map.put("amount90Plus", BigDecimal.ZERO);
                map.put("total", BigDecimal.ZERO);
                return map;
            });

            bucket.put("total", ((BigDecimal) bucket.get("total")).add(bal));

            if (daysOld <= 30) {
                bucket.put("amount0to30", ((BigDecimal) bucket.get("amount0to30")).add(bal));
            } else if (daysOld <= 60) {
                bucket.put("amount31to60", ((BigDecimal) bucket.get("amount31to60")).add(bal));
            } else if (daysOld <= 90) {
                bucket.put("amount61to90", ((BigDecimal) bucket.get("amount61to90")).add(bal));
            } else {
                bucket.put("amount90Plus", ((BigDecimal) bucket.get("amount90Plus")).add(bal));
            }
        }
        return agingByVendor.values();
    }

    public List<Object> generateLedgerStatement(String accountCode, LocalDate from, LocalDate to) {
        return generateLedgerStatement(accountCode, from, to, null);
    }

    public List<Object> generateLedgerStatement(String accountCode, LocalDate from, LocalDate to, Long branchId) {
        if (from == null)
            from = LocalDate.now().withDayOfMonth(1);
        if (to == null)
            to = LocalDate.now();

        List<LedgerEntry> entries = branchId != null
                ? ledgerEntryRepository.findByBranchIdAndTransactionDateBetweenOrderByTransactionDateAsc(branchId, from, to)
                : branchAccessService.filterExactBranchScopedByBranch(
                        ledgerEntryRepository.findByTransactionDateBetweenOrderByTransactionDateAsc(from, to),
                        LedgerEntry::getBranch);
        List<Object> statementLines = new ArrayList<>();
        BigDecimal runningBalance = BigDecimal.ZERO;

        for (LedgerEntry entry : entries) {
            if (accountCode.equals(entry.getAccountCode())) {
                BigDecimal debit = entry.getDebitAmount() != null ? entry.getDebitAmount() : BigDecimal.ZERO;
                BigDecimal credit = entry.getCreditAmount() != null ? entry.getCreditAmount() : BigDecimal.ZERO;
                runningBalance = runningBalance.add(debit).subtract(credit);

                Map<String, Object> statementLine = new HashMap<>();
                statementLine.put("date", entry.getTransactionDate());
                statementLine.put("jvNumber", entry.getVoucherNo());
                statementLine.put("reference", entry.getJournalId());
                statementLine.put("description", entry.getDescription());
                statementLine.put("debit", debit);
                statementLine.put("credit", credit);
                statementLine.put("balance", runningBalance);

                statementLines.add(statementLine);
            }
        }
        return statementLines;
    }

    private String mapReportGroup(String code) {
        if (code == null)
            return "Uncategorized";
        switch (code.toUpperCase()) {
            case "CURRENT_ASSETS":
                return "Current Assets";
            case "NON_CURRENT_ASSETS":
                return "Non-Current Assets";
            case "CURRENT_LIABILITIES":
                return "Current Liabilities";
            case "NON_CURRENT_LIABILITIES":
                return "Non-Current Liabilities";
            case "EQUITY":
                return "Equity";
            case "REVENUE":
                return "Operating Revenue";
            case "COGS":
                return "Cost of Goods Sold";
            case "OPERATING_EXPENSES":
                return "Operating Expenses";
            case "ADMIN_EXPENSES":
                return "Administrative Expenses";
            case "OTHER_INCOME":
                return "Other Income";
            default:
                return code;
        }
    }

    private String normalizeProfitLossGroup(String reportGroup, String accountGroup) {
        if (reportGroup != null && !"UNCATEGORIZED".equalsIgnoreCase(reportGroup)) {
            return reportGroup;
        }

        if ("Income".equalsIgnoreCase(accountGroup)) {
            return "REVENUE";
        }

        if ("Expenses".equalsIgnoreCase(accountGroup)) {
            return "OPERATING_EXPENSES";
        }

        return reportGroup != null ? reportGroup : "UNCATEGORIZED";
    }

    private BigDecimal safe(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    // ==================== VAT RETURN REPORT (F-16) ====================

    /**
     * Generates a VAT Return summary for the given period by summing debit/credit
     * movements on the VAT Output (2102) and VAT Input (1130) accounts from ledger entries.
     *
     * PDF §07 / RPTGAP-008.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> generateVatReturnReport(LocalDate startDate, LocalDate endDate, Long branchId) {
        if (startDate == null) startDate = LocalDate.now().withDayOfYear(1);
        if (endDate   == null) endDate   = LocalDate.now();

        List<LedgerEntry> entries = fetchEntries(branchId, startDate, endDate);

        BigDecimal outputTax  = BigDecimal.ZERO; // VAT charged on sales (2102 Cr movements)
        BigDecimal inputTax   = BigDecimal.ZERO; // VAT paid on purchases (1130 Dr movements)
        BigDecimal outputAdj  = BigDecimal.ZERO; // Dr movements on 2102 (credit notes, discounts)
        BigDecimal inputAdj   = BigDecimal.ZERO; // Cr movements on 1130 (purchase returns)

        for (LedgerEntry e : entries) {
            String code = e.getAccountCode();
            if ("2100".equals(code)) {
                outputTax = outputTax.add(safe(e.getCreditAmount()));
                outputAdj = outputAdj.add(safe(e.getDebitAmount()));
            } else if ("1310".equals(code)) {
                inputTax = inputTax.add(safe(e.getDebitAmount()));
                inputAdj = inputAdj.add(safe(e.getCreditAmount()));
            }
        }

        BigDecimal netOutput  = outputTax.subtract(outputAdj);
        BigDecimal netInput   = inputTax.subtract(inputAdj);
        BigDecimal netPayable = netOutput.subtract(netInput);

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("period",          startDate + " to " + endDate);
        report.put("outputTaxGross",  outputTax);
        report.put("outputAdjustments", outputAdj);
        report.put("netOutputTax",    netOutput);
        report.put("inputTaxGross",   inputTax);
        report.put("inputAdjustments", inputAdj);
        report.put("netInputTax",     netInput);
        report.put("netVatPayable",   netPayable);
        report.put("status",          netPayable.compareTo(BigDecimal.ZERO) >= 0 ? "PAYABLE" : "REFUND_CLAIM");
        return report;
    }

    // ==================== DETAILED TRIAL BALANCE (F-15) ====================

    /**
     * Detailed Trial Balance: one row per ledger entry line rather than one row per account.
     * Enables drill-down from account totals to individual transactions.
     *
     * PDF §17 / RPTGAP-010.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> generateDetailedTrialBalance(LocalDate startDate, LocalDate endDate, Long branchId) {
        if (startDate == null) startDate = LocalDate.now().withDayOfYear(1);
        if (endDate   == null) endDate   = LocalDate.now();

        List<LedgerEntry> entries = fetchEntries(branchId, startDate, endDate);

        // Build per-account running balance and line list
        Map<String, List<Map<String, Object>>> byAccount = new LinkedHashMap<>();
        Map<String, BigDecimal> accountDr = new LinkedHashMap<>();
        Map<String, BigDecimal> accountCr = new LinkedHashMap<>();

        for (LedgerEntry e : entries) {
            String code = e.getAccountCode() != null ? e.getAccountCode() : "UNKNOWN";
            byAccount.computeIfAbsent(code, k -> new ArrayList<>());
            accountDr.merge(code, safe(e.getDebitAmount()),  BigDecimal::add);
            accountCr.merge(code, safe(e.getCreditAmount()), BigDecimal::add);

            Map<String, Object> line = new LinkedHashMap<>();
            line.put("date",        e.getTransactionDate());
            line.put("voucherNo",   e.getVoucherNo());
            line.put("accountCode", code);
            line.put("accountName", e.getAccountName());
            line.put("description", e.getDescription());
            line.put("debit",       safe(e.getDebitAmount()));
            line.put("credit",      safe(e.getCreditAmount()));
            byAccount.get(code).add(line);
        }

        BigDecimal totalDr = accountDr.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalCr = accountCr.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);

        List<Map<String, Object>> accountSummaries = new ArrayList<>();
        for (String code : byAccount.keySet()) {
            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("accountCode", code);
            summary.put("totalDebit",  accountDr.getOrDefault(code, BigDecimal.ZERO));
            summary.put("totalCredit", accountCr.getOrDefault(code, BigDecimal.ZERO));
            summary.put("lines",       byAccount.get(code));
            accountSummaries.add(summary);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("startDate",   startDate);
        result.put("endDate",     endDate);
        result.put("totalDebit",  totalDr);
        result.put("totalCredit", totalCr);
        result.put("balanced",    totalDr.subtract(totalCr).abs().compareTo(new BigDecimal("0.01")) <= 0);
        result.put("accounts",    accountSummaries);
        return result;
    }

    // ==================== COMMITMENT REPORT (F-14) ====================

    /**
     * Commitment Report: open LPOs represent committed purchase obligations
     * not yet received. Shows outstanding purchase commitments for cash flow forecasting.
     *
     * PDF §09 / RPTGAP-009.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> generateCommitmentReport(Long branchId) {
        // Open LPOs: approved or sent-to-vendor or partially received
        List<Lpo> openLpos = new ArrayList<>();
        openLpos.addAll(lpoRepository.findByStatus(LpoStatus.APPROVED));
        openLpos.addAll(lpoRepository.findByStatus(LpoStatus.SENT_TO_VENDOR));
        openLpos.addAll(lpoRepository.findByStatus(LpoStatus.PARTIALLY_RECEIVED));

        if (branchId != null) {
            openLpos = openLpos.stream()
                    .filter(l -> l.getBranch() != null && branchId.equals(l.getBranch().getId()))
                    .collect(Collectors.toList());
        }

        BigDecimal totalCommitment = BigDecimal.ZERO;
        List<Map<String, Object>> lines = new ArrayList<>();

        for (Lpo lpo : openLpos) {
            BigDecimal committed = lpo.getGrandTotal() != null ? lpo.getGrandTotal() : BigDecimal.ZERO;
            totalCommitment = totalCommitment.add(committed);

            Map<String, Object> line = new LinkedHashMap<>();
            line.put("lpoNumber",    lpo.getLpoNumber());
            line.put("lpoDate",      lpo.getLpoDate());
            line.put("vendorName",   lpo.getVendorName());
            line.put("branchName",   lpo.getBranchName());
            line.put("status",       lpo.getStatus());
            line.put("grandTotal",   committed);
            lines.add(line);
        }

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("reportDate",       LocalDate.now());
        report.put("totalCommitment",  totalCommitment);
        report.put("openLpoCount",     lines.size());
        report.put("commitments",      lines);
        return report;
    }
}
