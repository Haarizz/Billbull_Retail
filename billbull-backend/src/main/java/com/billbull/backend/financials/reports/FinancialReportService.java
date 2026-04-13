package com.billbull.backend.financials.reports;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
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
import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.purchase.invoice.PurchaseInvoice;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;

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

    public FinancialReportService(
            AccountRepository accountRepository,
            LedgerEntryRepository ledgerEntryRepository,
            ExpenseRepository expenseRepository,
            SalesInvoiceRepository salesInvoiceRepository,
            PurchaseInvoiceRepository purchaseInvoiceRepository) {
        this.accountRepository = accountRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.expenseRepository = expenseRepository;
        this.salesInvoiceRepository = salesInvoiceRepository;
        this.purchaseInvoiceRepository = purchaseInvoiceRepository;
    }

    // ==================== TRIAL BALANCE ====================

    /**
     * Generates a Trial Balance from the Ledger.
     * Groups debit/credit totals by account.
     */
    public TrialBalanceDTO generateTrialBalance(LocalDate startDate, LocalDate endDate) {
        if (startDate == null)
            startDate = LocalDate.of(1970, 1, 1);
        if (endDate == null)
            endDate = LocalDate.now();

        List<LedgerEntry> entries = ledgerEntryRepository
                .findByTransactionDateBetweenOrderByTransactionDateAsc(startDate, endDate);

        Map<String, BigDecimal> debitMap = new LinkedHashMap<>();
        Map<String, BigDecimal> creditMap = new LinkedHashMap<>();
        Map<String, String> accountNameMap = new LinkedHashMap<>();
        Map<String, String> accountGroupMap = new LinkedHashMap<>();

        for (LedgerEntry entry : entries) {
            String key = entry.getAccountCode();
            accountNameMap.putIfAbsent(key, entry.getAccountName());

            debitMap.merge(key, entry.getDebitAmount() != null ? entry.getDebitAmount() : BigDecimal.ZERO,
                    BigDecimal::add);
            creditMap.merge(key, entry.getCreditAmount() != null ? entry.getCreditAmount() : BigDecimal.ZERO,
                    BigDecimal::add);
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
        if (startDate == null)
            startDate = LocalDate.now().withDayOfMonth(1); // Default to this month start
        if (endDate == null)
            endDate = LocalDate.now();

        List<LedgerEntry> entries = ledgerEntryRepository
                .findByTransactionDateBetweenOrderByTransactionDateAsc(startDate, endDate);

        Map<String, BigDecimal> accountBalances = new LinkedHashMap<>();
        Map<String, String> accountNames = new HashMap<>();
        Map<String, String> accountReportGroup = new HashMap<>();

        List<Account> allAccounts = accountRepository.findAll();
        for (Account acc : allAccounts) {
            accountReportGroup.put(acc.getCode(),
                    acc.getReportGroup() != null ? acc.getReportGroup() : "UNCATEGORIZED");
        }

        for (LedgerEntry entry : entries) {
            accountBalances.merge(entry.getAccountCode(),
                    safe(entry.getCreditAmount()).subtract(safe(entry.getDebitAmount())),
                    BigDecimal::add);
            accountNames.put(entry.getAccountCode(), entry.getAccountName());
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
            String group = accountReportGroup.getOrDefault(code, "UNCATEGORIZED");
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

        // Adjust totals to be positive for report display
        totalRevenue = totalRevenue.abs();
        totalCogs = totalCogs.abs();
        totalOpex = totalOpex.abs();
        totalOtherIncome = totalOtherIncome.abs();

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
        if (asOfDate == null)
            asOfDate = LocalDate.now();

        BalanceSheetDTO dto = new BalanceSheetDTO();
        dto.setAsOfDate(asOfDate.toString());

        List<LedgerEntry> entries = ledgerEntryRepository.findByTransactionDateBefore(asOfDate.plusDays(1));
        Map<String, BigDecimal> computedBalances = new HashMap<>();

        for (LedgerEntry entry : entries) {
            BigDecimal debit = entry.getDebitAmount() != null ? entry.getDebitAmount() : BigDecimal.ZERO;
            BigDecimal credit = entry.getCreditAmount() != null ? entry.getCreditAmount() : BigDecimal.ZERO;
            BigDecimal net = debit.subtract(credit);
            computedBalances.put(entry.getAccountCode(),
                    computedBalances.getOrDefault(entry.getAccountCode(), BigDecimal.ZERO).add(net));
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

        ProfitLossDTO pl = generateProfitLoss(null, asOfDate);
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
        if (startDate == null)
            startDate = LocalDate.of(1970, 1, 1);
        if (endDate == null)
            endDate = LocalDate.now();

        List<LedgerEntry> entries = ledgerEntryRepository
                .findByTransactionDateBetweenOrderByTransactionDateAsc(startDate, endDate);

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
                ReportLineDTO line = new ReportLineDTO(entry.getAccountCode(), entry.getVoucherNo(), bucket,
                        cashEffect);

                if ("OPERATING".equals(bucket)) {
                    operatingItems.add(line);
                    totalOperating = totalOperating.add(cashEffect);
                } else if ("INVESTING".equals(bucket)) {
                    investingItems.add(line);
                    totalInvesting = totalInvesting.add(cashEffect);
                } else if ("FINANCING".equals(bucket)) {
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
        dto.setNetCashFlow(totalOperating.add(totalInvesting).add(totalFinancing));
        dto.setStartDate(startDate.toString());
        dto.setEndDate(endDate.toString());

        return dto;
    }

    // ==================== EXPENSE ANALYSIS ====================

    public ExpenseAnalysisDTO generateExpenseAnalysis(LocalDate startDate, LocalDate endDate) {
        if (startDate == null)
            startDate = LocalDate.of(1970, 1, 1);
        if (endDate == null)
            endDate = LocalDate.now();

        List<LedgerEntry> entries = ledgerEntryRepository
                .findByTransactionDateBetweenOrderByTransactionDateAsc(startDate, endDate);

        Map<String, BigDecimal> byCategoryMap = new LinkedHashMap<>();
        Map<String, Integer> byCategoryCount = new LinkedHashMap<>();
        Map<String, BigDecimal> byCostCenterMap = new LinkedHashMap<>();
        Map<String, Integer> byCostCenterCount = new LinkedHashMap<>();
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
        dto.setTotalExpenses(totalExpenses);
        dto.setStartDate(startDate.toString());
        dto.setEndDate(endDate.toString());

        return dto;
    }

    // ==================== TAX DASHBOARD ====================

    public TaxDashboardDTO generateTaxDashboard(LocalDate startDate, LocalDate endDate) {
        if (startDate == null)
            startDate = LocalDate.of(1970, 1, 1);
        if (endDate == null)
            endDate = LocalDate.now();

        List<LedgerEntry> entries = ledgerEntryRepository
                .findByTransactionDateBetweenOrderByTransactionDateAsc(startDate, endDate);

        BigDecimal outputTax = BigDecimal.ZERO;
        BigDecimal inputTax = BigDecimal.ZERO;
        BigDecimal taxableSalesBase = BigDecimal.ZERO;
        BigDecimal taxablePurchaseBase = BigDecimal.ZERO;

        List<Account> allAccounts = accountRepository.findAll();
        Map<String, String> taxRoleMap = allAccounts.stream()
                .filter(a -> a.getTaxRole() != null)
                .collect(Collectors.toMap(Account::getCode, Account::getTaxRole, (v1, v2) -> v1));

        for (LedgerEntry entry : entries) {
            String role = taxRoleMap.get(entry.getAccountCode());
            if ("OUTPUT_TAX".equals(role)) {
                outputTax = outputTax.add(safe(entry.getCreditAmount()));
            } else if ("INPUT_TAX".equals(role)) {
                inputTax = inputTax.add(safe(entry.getDebitAmount()));
            } else if ("TAXABLE_SALES".equals(role)) {
                taxableSalesBase = taxableSalesBase
                        .add(safe(entry.getCreditAmount()));
            } else if ("TAXABLE_PURCHASE".equals(role)) {
                taxablePurchaseBase = taxablePurchaseBase
                        .add(safe(entry.getDebitAmount()));
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

    public TaxReconciliationDTO generateTaxReconciliation(LocalDate startDate, LocalDate endDate) {
        if (startDate == null)
            startDate = LocalDate.of(1970, 1, 1);
        if (endDate == null)
            endDate = LocalDate.now();

        List<LedgerEntry> entries = ledgerEntryRepository
                .findByTransactionDateBetweenOrderByTransactionDateAsc(startDate, endDate);
        List<Account> allAccounts = accountRepository.findAll();
        Map<String, String> taxRoleMap = allAccounts.stream()
                .filter(a -> a.getTaxRole() != null)
                .collect(Collectors.toMap(Account::getCode, Account::getTaxRole, (v1, v2) -> v1));

        Map<String, List<LedgerEntry>> groupedByRef = entries.stream()
                .collect(Collectors.groupingBy(LedgerEntry::getVoucherNo));
        List<TaxReconciliationDTO.TaxAuditLine> auditLines = new ArrayList<>();

        for (Map.Entry<String, List<LedgerEntry>> entrySet : groupedByRef.entrySet()) {
            BigDecimal jvBase = BigDecimal.ZERO;
            BigDecimal jvTax = BigDecimal.ZERO;
            String mode = "NONE";
            String accName = "";

            for (LedgerEntry line : entrySet.getValue()) {
                String role = taxRoleMap.get(line.getAccountCode());
                if (role == null)
                    continue;

                if (role.contains("TAXABLE")) {
                    jvBase = jvBase
                            .add(safe(line.getCreditAmount()).compareTo(BigDecimal.ZERO) > 0
                                    ? safe(line.getCreditAmount())
                                    : safe(line.getDebitAmount()));
                    mode = role.contains("SALES") ? "SALES" : "PURCHASE";
                    accName = line.getAccountName();
                } else if (role.contains("TAX")) {
                    jvTax = jvTax
                            .add(safe(line.getCreditAmount()).compareTo(BigDecimal.ZERO) > 0
                                    ? safe(line.getCreditAmount())
                                    : safe(line.getDebitAmount()));
                }
            }

            if (jvBase.compareTo(BigDecimal.ZERO) != 0 || jvTax.compareTo(BigDecimal.ZERO) != 0) {
                auditLines.add(new TaxReconciliationDTO.TaxAuditLine(entrySet.getKey(), mode, jvBase.abs(), jvTax.abs(),
                        accName));
            }
        }

        TaxReconciliationDTO dto = new TaxReconciliationDTO();
        dto.setPeriod(startDate.toString() + " to " + endDate.toString());
        dto.setLines(auditLines);
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

            Double bal = inv.getBalance();
            if (bal == null || bal <= 0)
                continue;

            LocalDate date = inv.getInvoiceDate() != null ? inv.getInvoiceDate() : asOfDate;
            long daysOld = java.time.temporal.ChronoUnit.DAYS.between(date, asOfDate);
            if (daysOld < 0)
                daysOld = 0;

            String customer = inv.getCustomerName() != null ? inv.getCustomerName() : "Unknown Customer";

            Map<String, Object> bucket = agingByCustomer.computeIfAbsent(customer, k -> {
                Map<String, Object> map = new HashMap<>();
                map.put("partnerName", k);
                map.put("amount0to30", BigDecimal.ZERO);
                map.put("amount31to60", BigDecimal.ZERO);
                map.put("amount61to90", BigDecimal.ZERO);
                map.put("amount90Plus", BigDecimal.ZERO);
                map.put("total", BigDecimal.ZERO);
                return map;
            });

            BigDecimal bdBal = BigDecimal.valueOf(bal);
            bucket.put("total", ((BigDecimal) bucket.get("total")).add(bdBal));

            if (daysOld <= 30) {
                bucket.put("amount0to30", ((BigDecimal) bucket.get("amount0to30")).add(bdBal));
            } else if (daysOld <= 60) {
                bucket.put("amount31to60", ((BigDecimal) bucket.get("amount31to60")).add(bdBal));
            } else if (daysOld <= 90) {
                bucket.put("amount61to90", ((BigDecimal) bucket.get("amount61to90")).add(bdBal));
            } else {
                bucket.put("amount90Plus", ((BigDecimal) bucket.get("amount90Plus")).add(bdBal));
            }
        }
        return agingByCustomer.values();
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
        if (from == null)
            from = LocalDate.now().withDayOfMonth(1);
        if (to == null)
            to = LocalDate.now();

        List<LedgerEntry> entries = ledgerEntryRepository.findByTransactionDateBetweenOrderByTransactionDateAsc(from,
                to);
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

    private BigDecimal safe(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
