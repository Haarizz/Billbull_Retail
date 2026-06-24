package com.billbull.backend.financials.reports;

import com.billbull.backend.security.ModulePermissionService;
import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller for IFRS/GAAP financial reports.
 */
@RestController
@RequestMapping("/api/financials/reports")
public class FinancialReportController {

    private static final String MODULE = "finance";

    private final FinancialReportService reportService;
    private final SubLedgerReconciliationService reconciliationService;
    private final ModulePermissionService modulePermissionService;

    public FinancialReportController(FinancialReportService reportService,
                                     SubLedgerReconciliationService reconciliationService,
                                     ModulePermissionService modulePermissionService) {
        this.reportService         = reportService;
        this.reconciliationService = reconciliationService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping("/trial-balance")
    public TrialBalanceDTO getTrialBalance(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) Long branchId) {
        modulePermissionService.requireCanView(MODULE);
        return reportService.generateTrialBalance(startDate, endDate, branchId);
    }

    @GetMapping("/profit-loss")
    public ProfitLossDTO getProfitLoss(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) String costCenter) {
        modulePermissionService.requireCanView(MODULE);
        return reportService.generateProfitLoss(startDate, endDate, branchId, costCenter);
    }

    @GetMapping("/balance-sheet")
    public BalanceSheetDTO getBalanceSheet(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOfDate,
            @RequestParam(required = false) Long branchId) {
        modulePermissionService.requireCanView(MODULE);
        return reportService.generateBalanceSheet(asOfDate != null ? asOfDate : LocalDate.now(), branchId);
    }

    @GetMapping("/cash-flow")
    public CashFlowDTO getCashFlow(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) Long branchId) {
        modulePermissionService.requireCanView(MODULE);
        return reportService.generateCashFlow(startDate, endDate, branchId);
    }

    @GetMapping("/expense-analysis")
    public ExpenseAnalysisDTO getExpenseAnalysis(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) Long branchId) {
        modulePermissionService.requireCanView(MODULE);
        return reportService.generateExpenseAnalysis(startDate, endDate, branchId);
    }

    @GetMapping("/tax-dashboard")
    public TaxDashboardDTO getTaxDashboard(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) Long branchId) {
        modulePermissionService.requireCanView(MODULE);
        return reportService.generateTaxDashboard(startDate, endDate, branchId);
    }

    @GetMapping("/tax-reconciliation")
    public TaxReconciliationDTO getTaxReconciliation(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) Long branchId) {
        modulePermissionService.requireCanView(MODULE);
        return reportService.generateTaxReconciliation(startDate, endDate, branchId);
    }

    @GetMapping("/ar-aging")
    public Object getARAgingReport(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOfDate) {
        modulePermissionService.requireCanView(MODULE);
        return reportService.generateARAgingReport(asOfDate != null ? asOfDate : LocalDate.now());
    }

    @GetMapping("/ap-aging")
    public Object getAPAgingReport(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOfDate) {
        modulePermissionService.requireCanView(MODULE);
        return reportService.generateAPAgingReport(asOfDate != null ? asOfDate : LocalDate.now());
    }

    @GetMapping("/ledger-statement")
    public Object getLedgerStatement(
            @RequestParam String accountCode,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long branchId) {
        modulePermissionService.requireCanView(MODULE);
        return reportService.generateLedgerStatement(accountCode, from, to, branchId);
    }

    /** Sub-ledger ↔ GL reconciliation health check (PDF §17 / Phase 7.1). */
    @GetMapping("/reconciliation")
    public SubLedgerReconciliationService.ReconciliationReport getReconciliation() {
        modulePermissionService.requireCanView(MODULE);
        return reconciliationService.reconcileAll();
    }

    /** VAT Return Report — Output vs. Input for the period (F-16 / RPTGAP-008). */
    @GetMapping("/vat-return")
    public Object getVatReturn(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) Long branchId) {
        modulePermissionService.requireCanView(MODULE);
        return reportService.generateVatReturnReport(startDate, endDate, branchId);
    }

    /** Detailed Trial Balance — one row per journal line (F-15 / RPTGAP-010). */
    @GetMapping("/detailed-trial-balance")
    public Object getDetailedTrialBalance(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) Long branchId) {
        modulePermissionService.requireCanView(MODULE);
        return reportService.generateDetailedTrialBalance(startDate, endDate, branchId);
    }

    /** Commitment Report — open LPO obligations not yet received (F-14 / RPTGAP-009). */
    @GetMapping("/commitment")
    public Object getCommitmentReport(
            @RequestParam(required = false) Long branchId) {
        modulePermissionService.requireCanView(MODULE);
        return reportService.generateCommitmentReport(branchId);
    }
}
