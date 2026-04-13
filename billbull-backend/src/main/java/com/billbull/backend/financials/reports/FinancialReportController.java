package com.billbull.backend.financials.reports;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller for IFRS/GAAP financial reports.
 */
@RestController
@RequestMapping("/api/financials/reports")
@CrossOrigin(origins = "*")
public class FinancialReportController {

    private final FinancialReportService reportService;

    public FinancialReportController(FinancialReportService reportService) {
        this.reportService = reportService;
    }

    @GetMapping("/trial-balance")
    @PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
    public TrialBalanceDTO getTrialBalance(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        System.out.println("Processing Trial Balance request for: "
                + org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication()
                        .getName());
        return reportService.generateTrialBalance(startDate, endDate);
    }

    @GetMapping("/profit-loss")
    @PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
    public ProfitLossDTO getProfitLoss(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        System.out.println("Processing Profit & Loss request for: "
                + org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication()
                        .getName());
        return reportService.generateProfitLoss(startDate, endDate);
    }

    @GetMapping("/balance-sheet")
    @PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
    public BalanceSheetDTO getBalanceSheet(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOfDate) {
        System.out.println("Processing Balance Sheet request for: "
                + org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication()
                        .getName());
        return reportService.generateBalanceSheet(asOfDate != null ? asOfDate : LocalDate.now());
    }

    @GetMapping("/cash-flow")
    @PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
    public CashFlowDTO getCashFlow(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return reportService.generateCashFlow(startDate, endDate);
    }

    @GetMapping("/expense-analysis")
    @PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
    public ExpenseAnalysisDTO getExpenseAnalysis(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return reportService.generateExpenseAnalysis(startDate, endDate);
    }

    @GetMapping("/tax-dashboard")
    @PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
    public TaxDashboardDTO getTaxDashboard(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return reportService.generateTaxDashboard(startDate, endDate);
    }

    @GetMapping("/tax-reconciliation")
    @PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
    public TaxReconciliationDTO getTaxReconciliation(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return reportService.generateTaxReconciliation(startDate, endDate);
    }

    @GetMapping("/ar-aging")
    @PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
    public Object getARAgingReport(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOfDate) {
        return reportService.generateARAgingReport(asOfDate != null ? asOfDate : LocalDate.now());
    }

    @GetMapping("/ap-aging")
    @PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
    public Object getAPAgingReport(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOfDate) {
        return reportService.generateAPAgingReport(asOfDate != null ? asOfDate : LocalDate.now());
    }

    @GetMapping("/ledger-statement")
    @PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
    public Object getLedgerStatement(
            @RequestParam String accountCode,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return reportService.generateLedgerStatement(accountCode, from, to);
    }
}
