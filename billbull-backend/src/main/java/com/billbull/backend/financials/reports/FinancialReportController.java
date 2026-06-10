package com.billbull.backend.financials.reports;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
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
    private final SubLedgerReconciliationService reconciliationService;

    public FinancialReportController(FinancialReportService reportService,
                                     SubLedgerReconciliationService reconciliationService) {
        this.reportService         = reportService;
        this.reconciliationService = reconciliationService;
    }

    @GetMapping("/trial-balance")
    public TrialBalanceDTO getTrialBalance(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) Long branchId) {
        return reportService.generateTrialBalance(startDate, endDate, branchId);
    }

    @GetMapping("/profit-loss")
    public ProfitLossDTO getProfitLoss(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) String costCenter) {
        return reportService.generateProfitLoss(startDate, endDate, branchId, costCenter);
    }

    @GetMapping("/balance-sheet")
    public BalanceSheetDTO getBalanceSheet(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOfDate,
            @RequestParam(required = false) Long branchId) {
        return reportService.generateBalanceSheet(asOfDate != null ? asOfDate : LocalDate.now(), branchId);
    }

    @GetMapping("/cash-flow")
    public CashFlowDTO getCashFlow(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) Long branchId) {
        return reportService.generateCashFlow(startDate, endDate, branchId);
    }

    @GetMapping("/expense-analysis")
    public ExpenseAnalysisDTO getExpenseAnalysis(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) Long branchId) {
        return reportService.generateExpenseAnalysis(startDate, endDate, branchId);
    }

    @GetMapping("/tax-dashboard")
    public TaxDashboardDTO getTaxDashboard(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) Long branchId) {
        return reportService.generateTaxDashboard(startDate, endDate, branchId);
    }

    @GetMapping("/tax-reconciliation")
    public TaxReconciliationDTO getTaxReconciliation(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) Long branchId) {
        return reportService.generateTaxReconciliation(startDate, endDate, branchId);
    }

    @GetMapping("/ar-aging")
    public Object getARAgingReport(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOfDate) {
        return reportService.generateARAgingReport(asOfDate != null ? asOfDate : LocalDate.now());
    }

    @GetMapping("/ap-aging")
    public Object getAPAgingReport(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOfDate) {
        return reportService.generateAPAgingReport(asOfDate != null ? asOfDate : LocalDate.now());
    }

    @GetMapping("/ledger-statement")
    public Object getLedgerStatement(
            @RequestParam String accountCode,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return reportService.generateLedgerStatement(accountCode, from, to);
    }

    /** Sub-ledger ↔ GL reconciliation health check (PDF §17 / Phase 7.1). */
    @GetMapping("/reconciliation")
    public SubLedgerReconciliationService.ReconciliationReport getReconciliation() {
        return reconciliationService.reconcileAll();
    }
}
