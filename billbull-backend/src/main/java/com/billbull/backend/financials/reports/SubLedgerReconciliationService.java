package com.billbull.backend.financials.reports;

import com.billbull.backend.financials.generalledger.LedgerEntryRepository;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Sub-ledger ↔ GL control-account reconciliation (PDF §17 / Phase 7.1).
 *
 * For each control account, computes:
 *  - GL balance  = SUM(debit) - SUM(credit) from LedgerEntry for that account code
 *  - Sub-ledger  = sum of open amounts from the operational module (invoices, stock movements)
 *  - Difference  = GL - SubLedger (should be zero; non-zero means a gap)
 */
@Service
@Transactional(readOnly = true)
public class SubLedgerReconciliationService {

    private final LedgerEntryRepository ledgerRepo;
    private final SalesInvoiceRepository salesInvoiceRepo;
    private final PurchaseInvoiceRepository purchaseInvoiceRepo;
    private final StockMovementRepository stockMovementRepo;

    public SubLedgerReconciliationService(
            LedgerEntryRepository ledgerRepo,
            SalesInvoiceRepository salesInvoiceRepo,
            PurchaseInvoiceRepository purchaseInvoiceRepo,
            StockMovementRepository stockMovementRepo) {
        this.ledgerRepo          = ledgerRepo;
        this.salesInvoiceRepo    = salesInvoiceRepo;
        this.purchaseInvoiceRepo = purchaseInvoiceRepo;
        this.stockMovementRepo   = stockMovementRepo;
    }

    public ReconciliationReport reconcileAll() {
        return new ReconciliationReport(reconcileAR(), reconcileAP(), reconcileInventory());
    }

    /** AR control (1110) vs sum of open SalesInvoice balances. */
    public ReconciliationLine reconcileAR() {
        BigDecimal glBalance  = safe(ledgerRepo.netBalanceByAccountCode(PostingEngineService.ACC_ACCOUNTS_RECEIVABLE));
        BigDecimal subLedger  = safe(salesInvoiceRepo.sumGlobalOutstandingBalance());
        return new ReconciliationLine("Accounts Receivable", PostingEngineService.ACC_ACCOUNTS_RECEIVABLE,
                glBalance, subLedger);
    }

    /** AP control (2101) vs sum of unpaid PurchaseInvoice grandTotals. */
    public ReconciliationLine reconcileAP() {
        BigDecimal glBalance  = safe(ledgerRepo.netBalanceByAccountCode(PostingEngineService.ACC_ACCOUNTS_PAYABLE));
        // AP is a credit-normal account; negate the net GL balance to compare with sub-ledger (positive amount)
        BigDecimal glAP       = glBalance.negate();
        BigDecimal subLedger  = safe(purchaseInvoiceRepo.sumGlobalOutstandingAP());
        return new ReconciliationLine("Accounts Payable", PostingEngineService.ACC_ACCOUNTS_PAYABLE,
                glAP, subLedger);
    }

    /** Inventory control (1120) vs sum of on-hand stock valued at WAC from StockMovement. */
    public ReconciliationLine reconcileInventory() {
        BigDecimal glBalance  = safe(ledgerRepo.netBalanceByAccountCode(PostingEngineService.ACC_INVENTORY));
        BigDecimal subLedger  = safe(stockMovementRepo.sumGlobalInventoryValue());
        return new ReconciliationLine("Inventory", PostingEngineService.ACC_INVENTORY, glBalance, subLedger);
    }

    private BigDecimal safe(BigDecimal v) {
        return v != null ? v.setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO;
    }
    private BigDecimal safe(Double v) {
        return v != null ? BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO;
    }

    // ── DTOs ─────────────────────────────────────────────────────────────────

    public record ReconciliationLine(
        String accountName,
        String accountCode,
        BigDecimal glBalance,
        BigDecimal subLedgerBalance
    ) {
        public BigDecimal difference() { return glBalance.subtract(subLedgerBalance); }
        public boolean isBalanced() { return difference().abs().compareTo(new BigDecimal("1.00")) <= 0; }
    }

    public record ReconciliationReport(
        ReconciliationLine ar,
        ReconciliationLine ap,
        ReconciliationLine inventory
    ) {
        public boolean allBalanced() { return ar.isBalanced() && ap.isBalanced() && inventory.isBalanced(); }
    }
}
