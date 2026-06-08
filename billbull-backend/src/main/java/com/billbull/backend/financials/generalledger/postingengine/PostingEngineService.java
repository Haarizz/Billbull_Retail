package com.billbull.backend.financials.generalledger.postingengine;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.financials.generalledger.voucher.VoucherSequenceService;
import com.billbull.backend.financials.period.AccountingPeriodService;
import com.billbull.backend.financials.expense.Expense;
import com.billbull.backend.financials.generalledger.JournalEntry;
import com.billbull.backend.financials.generalledger.EntryType;
import com.billbull.backend.financials.generalledger.JournalLine;
import com.billbull.backend.financials.generalledger.JournalEntryRepository;
import com.billbull.backend.financials.generalledger.JournalEntryService;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.inventory.stocktransfer.StockTransfer;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.purchase.grn.GrnEntity;
import com.billbull.backend.purchase.invoice.PurchaseInvoice;
import com.billbull.backend.purchase.payment.PaymentVoucher;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.returns.SalesReturn;
import com.billbull.backend.financials.settlement.CardSettlement;
import com.billbull.backend.financials.pdc.PdcEntry;
import com.billbull.backend.financials.pdc.PdcStatus;

/**
 * Central engine for auto-generating journal entries from business documents.
 *
 * IDEMPOTENCY RULE: Every posting method checks whether a journal with the
 * same reference already exists before creating a new one.  If it does, the
 * method logs a warning and returns without creating a duplicate entry.
 * This ensures that retries (network timeouts, UI double-clicks, etc.)
 * never produce duplicate GL postings.
 *
 * REFERENCE KEY CONVENTIONS:
 *   Purchase Invoice  → invoice.getInvoiceNumber()
 *   Sales Invoice     → invoice.getInvoiceNumber()
 *   GRN               → grn.getGrnNo()
 *   Delivery Note     → "DN-{dnNumber}"   (caller provides full key)
 *   Payment Voucher   → voucher.getVoucherNumber()
 *   Receipt Voucher   → receipt.getVoucherId()
 *   Expense           → "EXP-{expense.getId()}"
 *   Sales Return      → salesReturn.getReturnNumber()
 *   Card Settlement   → "SETTLE-{settlement.getId()}"
 *   Cancellations     → "CANCEL-{invoiceNumber}"
 *   DN Reversals      → "REV-DN-{dnNumber}"
 */
@Service
@Slf4j
public class PostingEngineService {

        public static final String ACC_CASH                = "1101";
        public static final String ACC_BANK                = "1102";
        public static final String ACC_PETTY_CASH          = "1103";
        public static final String ACC_MERCHANT_CLEARING   = "1104";
        public static final String ACC_ACCOUNTS_RECEIVABLE = "1110";
        public static final String ACC_INVENTORY           = "1120";
        public static final String ACC_VAT_INPUT           = "1130";
        public static final String ACC_ACCOUNTS_PAYABLE    = "2101";
        public static final String ACC_VAT_OUTPUT          = "2102";
        public static final String ACC_GRN_CLEARING        = "2103";
        public static final String ACC_CUSTOMER_ADVANCE    = "2104";
        public static final String ACC_DEFERRED_REVENUE    = "2107";
        public static final String ACC_SALES_REVENUE       = "4101";
        public static final String ACC_SALES_RETURNS       = "4102";
        public static final String ACC_DELIVERY_INCOME     = "4103";
        public static final String ACC_COGS                = "5101";
        public static final String ACC_EXPENSE_GENERAL     = "5403";
        public static final String ACC_ROUNDING            = "5999";
        public static final String ACC_VENDOR_ADVANCES     = "1105";  // Vendor Advances Paid
        public static final String ACC_SALARY_ADVANCES     = "1106";  // Employee salary advances (current asset)
        public static final String ACC_CUC                 = "1107";  // Cheques Under Collection
        public static final String ACC_DISCOUNT_ALLOWED    = "6050";  // Settlement discount granted to customer
        public static final String ACC_DISCOUNT_RECEIVED   = "7001";  // Settlement discount received from vendor
        public static final String ACC_SALARY_EXPENSE      = "6010";  // Salary / wage expense
        public static final String ACC_SALARY_PAYABLE      = "2200";  // Salary payable (net to employee)
        public static final String ACC_OTHER_DEDUCTIONS    = "2201";  // Other deductions payable
        public static final String ACC_BANK_CHARGES        = "7501";  // Bank service charges (expense)
        public static final String ACC_INTEREST_INCOME     = "7002";  // Bank interest income

        /** Max |Σdebit − Σcredit| absorbed into the rounding account instead of rejected. */
        private static final BigDecimal ROUNDING_TOLERANCE = new BigDecimal("0.01");

        public static final List<String> CONTROL_ACCOUNTS = java.util.Arrays.asList(
                        ACC_ACCOUNTS_RECEIVABLE,
                        ACC_ACCOUNTS_PAYABLE,
                        ACC_INVENTORY,
                        ACC_VAT_OUTPUT,
                        ACC_VAT_INPUT);

        private final JournalEntryRepository  journalEntryRepository;
        private final JournalEntryService     journalEntryService;
        private final AccountRepository       accountRepository;
        private final AccountingPeriodService accountingPeriodService;
        private final DimensionMatrixService  dimensionMatrixService;
        private final VoucherSequenceService  voucherSequenceService;
        private final com.billbull.backend.sales.customerledger.CustomerCreditService customerCreditService;
        private final com.billbull.backend.purchase.grn.GrnRepository grnRepository;
        private final com.billbull.backend.financials.generalledger.GlAccountBalanceRepository glBalanceRepository;
        private final com.billbull.backend.sales.settings.SalesSettingsService salesSettingsService;

        public PostingEngineService(
                        JournalEntryRepository  journalEntryRepository,
                        JournalEntryService     journalEntryService,
                        AccountRepository       accountRepository,
                        AccountingPeriodService accountingPeriodService,
                        DimensionMatrixService  dimensionMatrixService,
                        VoucherSequenceService  voucherSequenceService,
                        com.billbull.backend.sales.customerledger.CustomerCreditService customerCreditService,
                        com.billbull.backend.purchase.grn.GrnRepository grnRepository,
                        com.billbull.backend.financials.generalledger.GlAccountBalanceRepository glBalanceRepository,
                        com.billbull.backend.sales.settings.SalesSettingsService salesSettingsService) {
                this.journalEntryRepository  = journalEntryRepository;
                this.journalEntryService     = journalEntryService;
                this.accountRepository       = accountRepository;
                this.accountingPeriodService = accountingPeriodService;
                this.dimensionMatrixService  = dimensionMatrixService;
                this.voucherSequenceService  = voucherSequenceService;
                this.customerCreditService   = customerCreditService;
                this.grnRepository           = grnRepository;
                this.glBalanceRepository     = glBalanceRepository;
                this.salesSettingsService    = salesSettingsService;
        }

        // Transaction-type prefixes for voucher numbering (PDF §1).
        private static final String TX_PURCHASE_INVOICE = "PI";
        private static final String TX_SALES_INVOICE    = "SI";
        private static final String TX_DELIVERY_NOTE    = "DN";
        private static final String TX_GRN              = "GRN";
        private static final String TX_STOCK_TRANSFER   = "ST";
        private static final String TX_EXPENSE          = "EXP";
        private static final String TX_PAYMENT_VOUCHER  = "PV";
        private static final String TX_RECEIPT_VOUCHER  = "RV";
        private static final String TX_CREDIT_NOTE      = "CN";
        private static final String TX_CARD_SETTLEMENT  = "CARD";
        private static final String TX_MANUAL_JOURNAL   = "JV";
        private static final String TX_ADVANCE_APP      = "ADVA";  // customer advance application
        private static final String TX_ADVANCE_REFUND   = "ADVR";  // customer advance refund
        private static final String TX_VENDOR_ADVANCE   = "VADV";  // vendor advance pay/apply/refund
        private static final String TX_PAYROLL          = "PAY";   // salary journal / WPS
        private static final String TX_SALARY_ADVANCE   = "SADV";  // employee salary advance

        // =========================================================
        // PURCHASE INVOICE
        // =========================================================

        /**
         * Purchase Invoice posting.
         *
         * AGAINST_GRN scenario (invoice received after GRN):
         *   Dr GRN Clearing (2103) [grandTotal - landedCost] — clears the GRN accrual
         *   Dr Inventory (1120)    [landedCost]              — capitalizes landed cost
         *   Cr Accounts Payable (2101) [grandTotal]
         *
         * DIRECT / AGAINST_LPO scenario:
         *   Dr Inventory (1120) [grandTotal - taxTotal]
         *   Dr VAT Input (1130) [taxTotal]  (if > 0)
         *   Cr Accounts Payable (2101) [grandTotal]
         */
        @Transactional
        public JournalEntry createJournalFromPurchaseInvoice(PurchaseInvoice invoice) {
                String ref = invoice.getInvoiceNumber();
                if (isDuplicate(ref)) return null;

                JournalEntry entry = createBaseEntry(invoice.getInvoiceDate(), ref,
                                "Purchase Invoice " + ref, TX_PURCHASE_INVOICE);

                BigDecimal taxTotal   = nvl(invoice.getTaxTotal());
                BigDecimal landedCost = nvl(invoice.getLandedCost());
                BigDecimal grandTotal = nvl(invoice.getGrandTotal());

                boolean isAgainstGrn = "AGAINST_GRN".equalsIgnoreCase(invoice.getSourceType())
                                && invoice.getGrnId() != null;

                if (isAgainstGrn) {
                        // GRN value = what was accrued at receipt time (GRN grandTotal).
                        // PI net = what the vendor charges (grandTotal - taxTotal).
                        // Variance = PI net - GRN value → posted to Purchase Price Variance (5103).
                        BigDecimal grnValue = BigDecimal.ZERO;
                        com.billbull.backend.purchase.grn.GrnEntity grn =
                                        grnRepository.findById(invoice.getGrnId()).orElse(null);
                        if (grn != null && grn.getGrandTotal() != null) {
                                grnValue = grn.getGrandTotal();
                        }
                        BigDecimal piNet   = grandTotal.subtract(taxTotal);
                        BigDecimal ppv     = piNet.subtract(grnValue);

                        BigDecimal grnClearingAmt = grnValue; // clear exactly what was accrued
                        if (grnClearingAmt.compareTo(BigDecimal.ZERO) < 0) grnClearingAmt = BigDecimal.ZERO;

                        addLine(entry, "GRN Clearing", ACC_GRN_CLEARING,
                                        "Clear GRN Liability - " + ref,
                                        grnClearingAmt, BigDecimal.ZERO);

                        // PPV: positive → invoice higher than GRN (extra cost); negative → invoice lower (gain)
                        if (ppv.abs().compareTo(new BigDecimal("0.005")) > 0) {
                                if (ppv.signum() > 0) {
                                        addLine(entry, "Purchase Price Variance", "5103",
                                                        "PPV - " + ref, ppv, BigDecimal.ZERO);
                                } else {
                                        addLine(entry, "Purchase Price Variance", "5103",
                                                        "PPV gain - " + ref, BigDecimal.ZERO, ppv.abs());
                                }
                        }

                        if (landedCost.compareTo(BigDecimal.ZERO) > 0) {
                                addLine(entry, "Inventory", ACC_INVENTORY,
                                                "Capitalize landed cost - " + ref,
                                                landedCost, BigDecimal.ZERO);
                        }

                        if (taxTotal.compareTo(BigDecimal.ZERO) > 0) {
                                addLine(entry, "VAT Input", ACC_VAT_INPUT, "VAT - " + ref,
                                                taxTotal, BigDecimal.ZERO);
                        }
                } else {
                        BigDecimal inventoryAmt = grandTotal.subtract(taxTotal);
                        if (inventoryAmt.compareTo(BigDecimal.ZERO) < 0) {
                                inventoryAmt = BigDecimal.ZERO;
                        }
                        addLine(entry, "Inventory", ACC_INVENTORY,
                                        "Direct inventory purchase - " + ref,
                                        inventoryAmt, BigDecimal.ZERO);
                        if (taxTotal.compareTo(BigDecimal.ZERO) > 0) {
                                addLine(entry, "VAT Input", ACC_VAT_INPUT,
                                                "VAT - " + ref,
                                                taxTotal, BigDecimal.ZERO);
                        }
                }

                addLine(entry, "Accounts Payable - " + invoice.getVendorName(), ACC_ACCOUNTS_PAYABLE,
                                "Payable - " + ref, BigDecimal.ZERO, grandTotal);

                return post(entry);
        }

        // =========================================================
        // SALES INVOICE  (IFRS 15 — revenue deferred)
        // =========================================================

        /**
         * Dr Accounts Receivable (1110) [invoiceTotal]
         * Cr Deferred Revenue (2107)    [subTotal]
         * Cr VAT Output (2102)          [taxTotal]  (if > 0)
         *
         * Revenue is recognized only upon physical delivery.
         */
        @Transactional
        public JournalEntry createJournalFromInvoicePosting(SalesInvoice invoice) {
                String ref = invoice.getInvoiceNumber();
                if (isDuplicate(ref)) return null;

                // Credit-limit guard: only enforce when the policy is BLOCK; NO_IMPACT and
                // WARNING both allow posting (WARNING UX is handled in SalesInvoiceService).
                com.billbull.backend.sales.settings.CreditLimitPolicy creditPolicy =
                                salesSettingsService.getSettings().getCreditLimitPolicy();
                if (creditPolicy == com.billbull.backend.sales.settings.CreditLimitPolicy.BLOCK) {
                        customerCreditService.assertWithinLimit(
                                        invoice.getCustomerCode(),
                                        invoice.getInvoiceTotal() != null
                                                ? java.math.BigDecimal.valueOf(invoice.getInvoiceTotal())
                                                : java.math.BigDecimal.ZERO);
                }

                JournalEntry entry = createBaseEntry(invoice.getInvoiceDate(), ref,
                                "Sales Invoice " + ref, TX_SALES_INVOICE);

                addLine(entry, "Accounts Receivable", ACC_ACCOUNTS_RECEIVABLE,
                                "Sales - " + ref,
                                BigDecimal.valueOf(invoice.getInvoiceTotal()), BigDecimal.ZERO);
                addLine(entry, "Deferred Revenue", ACC_DEFERRED_REVENUE,
                                "Deferred - " + ref,
                                BigDecimal.ZERO, BigDecimal.valueOf(invoice.getSubTotal()));
                if (invoice.getTaxTotal() != null && invoice.getTaxTotal() > 0) {
                        addLine(entry, "VAT Output", ACC_VAT_OUTPUT, "VAT - " + ref,
                                        BigDecimal.ZERO, BigDecimal.valueOf(invoice.getTaxTotal()));
                }

                // Delivery charge is recognized as income immediately (not deferred like
                // product revenue, which the Delivery Note recognizes from item amounts).
                BigDecimal delivery = nz(invoice.getDeliveryCharge());
                if (delivery.signum() != 0) {
                        addLine(entry, "Delivery Income", ACC_DELIVERY_INCOME, "Delivery - " + ref,
                                        BigDecimal.ZERO, delivery);
                }

                // Manual/auto round-off lands in the Rounding Adjustment account so the
                // invoice total stays a clean figure without distorting revenue.
                addRoundOffLine(entry, nz(invoice.getRoundOff()), "Round off - " + ref, false);

                return post(entry);
        }

        // =========================================================
        // DELIVERY NOTE — revenue + COGS recognition
        // =========================================================

        /**
         * Called by DeliveryNoteService.markDelivered() and by SalesInvoiceService
         * for Before-Sale invoices.
         *
         * Entry 1 (Revenue recognition):
         *   Dr Deferred Revenue (2107) / Cr Sales Revenue (4101)
         *
         * Entry 2 (COGS recognition, only if cogs > 0):
         *   Dr COGS (5101) / Cr Inventory (1120)
         *
         * IDEMPOTENCY: If the reference already exists, logs a warning and
         * returns without throwing — the financialPosted flag in DeliveryNoteService
         * is the primary guard; this is the backstop for race conditions.
         */
        @Transactional
        public void createJournalFromDeliveryNoteDelivered(
                        String referenceKey,
                        LocalDate date,
                        String narration,
                        BigDecimal recognizedRevenue,
                        BigDecimal cogs) {

                if (journalEntryRepository.existsByReference(referenceKey)) {
                        log.warn("[PostingEngine] Duplicate DN posting blocked — reference '{}' already exists. " +
                                         "No journal created.", referenceKey);
                        return;
                }

                if (recognizedRevenue != null && recognizedRevenue.compareTo(BigDecimal.ZERO) > 0) {
                        JournalEntry revenueEntry = createBaseEntry(date, referenceKey,
                                        "Revenue recognition - " + narration, TX_DELIVERY_NOTE);
                        addLine(revenueEntry, "Deferred Revenue", ACC_DEFERRED_REVENUE,
                                        "Recognize deferred - " + narration,
                                        recognizedRevenue, BigDecimal.ZERO);
                        addLine(revenueEntry, "Sales Revenue", ACC_SALES_REVENUE,
                                        "Revenue - " + narration,
                                        BigDecimal.ZERO, recognizedRevenue);
                        post(revenueEntry);
                }

                if (cogs != null && cogs.compareTo(BigDecimal.ZERO) > 0) {
                        JournalEntry cogsEntry = createBaseEntry(date, referenceKey + "-COGS",
                                        "COGS - " + narration, TX_DELIVERY_NOTE);
                        addLine(cogsEntry, "COGS", ACC_COGS, "COGS - " + narration,
                                        cogs, BigDecimal.ZERO);
                        addLine(cogsEntry, "Inventory", ACC_INVENTORY, "Inventory reduction - " + narration,
                                        BigDecimal.ZERO, cogs);
                        post(cogsEntry);
                }

                log.info("[PostingEngine] DN delivery journals posted — ref='{}', revenue={}, cogs={}",
                                referenceKey, recognizedRevenue, cogs);
        }

        // =========================================================
        // SALES INVOICE CANCELLATION REVERSAL
        // =========================================================

        /**
         * Reverses the invoice posting journal when an invoice is cancelled
         * before delivery (Deferred Revenue outstanding).
         *
         * Dr Deferred Revenue (2107) [subTotal]
         * Dr VAT Output (2102)       [taxTotal] (if > 0)
         * Cr Accounts Receivable (1110) [invoiceTotal]
         */
        @Transactional
        public void reverseJournalFromInvoiceCancellation(SalesInvoice invoice) {
                String refKey = "CANCEL-" + invoice.getInvoiceNumber();
                if (isDuplicate(refKey)) return;

                JournalEntry entry = createBaseEntry(LocalDate.now(), refKey,
                                "Cancellation reversal - " + invoice.getInvoiceNumber(), TX_MANUAL_JOURNAL);

                BigDecimal subTotal    = invoice.getSubTotal()    != null ? BigDecimal.valueOf(invoice.getSubTotal())    : BigDecimal.ZERO;
                BigDecimal taxTotal    = invoice.getTaxTotal()    != null ? BigDecimal.valueOf(invoice.getTaxTotal())    : BigDecimal.ZERO;
                BigDecimal invoiceTotal = invoice.getInvoiceTotal() != null ? BigDecimal.valueOf(invoice.getInvoiceTotal()) : BigDecimal.ZERO;

                if (subTotal.compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "Deferred Revenue", ACC_DEFERRED_REVENUE,
                                        "Cancel deferred - " + invoice.getInvoiceNumber(),
                                        subTotal, BigDecimal.ZERO);
                }
                if (taxTotal.compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "VAT Output", ACC_VAT_OUTPUT,
                                        "Cancel VAT - " + invoice.getInvoiceNumber(),
                                        taxTotal, BigDecimal.ZERO);
                }
                BigDecimal delivery = nz(invoice.getDeliveryCharge());
                if (delivery.signum() != 0) {
                        addLine(entry, "Delivery Income", ACC_DELIVERY_INCOME,
                                        "Cancel delivery - " + invoice.getInvoiceNumber(),
                                        delivery, BigDecimal.ZERO);
                }
                addRoundOffLine(entry, nz(invoice.getRoundOff()),
                                "Cancel round off - " + invoice.getInvoiceNumber(), true);
                addLine(entry, "Accounts Receivable", ACC_ACCOUNTS_RECEIVABLE,
                                "Cancel AR - " + invoice.getInvoiceNumber(),
                                BigDecimal.ZERO, invoiceTotal);

                if (!entry.getLines().isEmpty()) {
                        post(entry);
                }
        }

        // =========================================================
        // DELIVERY NOTE CANCELLATION REVERSAL
        // =========================================================

        /**
         * Reverses the revenue + COGS recognized when a delivered DN is cancelled.
         *
         * Entry 1: Dr Sales Revenue (4101) / Cr Deferred Revenue (2107)
         * Entry 2: Dr Inventory (1120)     / Cr COGS (5101)   (if cogs > 0)
         */
        @Transactional
        public void reverseJournalFromDeliveryNoteCancellation(
                        String dnNumber,
                        LocalDate date,
                        BigDecimal recognizedRevenue,
                        BigDecimal cogs) {

                String refKey = "REV-DN-" + dnNumber;
                if (isDuplicate(refKey)) return;

                if (recognizedRevenue != null && recognizedRevenue.compareTo(BigDecimal.ZERO) > 0) {
                        JournalEntry revenueRev = createBaseEntry(date, refKey,
                                        "Revenue reversal - DN " + dnNumber, TX_MANUAL_JOURNAL);
                        addLine(revenueRev, "Sales Revenue", ACC_SALES_REVENUE,
                                        "Revenue reversal - " + dnNumber,
                                        recognizedRevenue, BigDecimal.ZERO);
                        addLine(revenueRev, "Deferred Revenue", ACC_DEFERRED_REVENUE,
                                        "Restore deferred - " + dnNumber,
                                        BigDecimal.ZERO, recognizedRevenue);
                        post(revenueRev);
                }

                if (cogs != null && cogs.compareTo(BigDecimal.ZERO) > 0) {
                        JournalEntry cogsRev = createBaseEntry(date, refKey + "-COGS",
                                        "COGS reversal - DN " + dnNumber, TX_MANUAL_JOURNAL);
                        addLine(cogsRev, "Inventory", ACC_INVENTORY,
                                        "Inventory restore - " + dnNumber,
                                        cogs, BigDecimal.ZERO);
                        addLine(cogsRev, "COGS", ACC_COGS,
                                        "COGS reversal - " + dnNumber,
                                        BigDecimal.ZERO, cogs);
                        post(cogsRev);
                }
        }

        // =========================================================
        // GRN
        // =========================================================

        /**
         * Dr Inventory (1120)     [grandTotal or subTotal]
         * Cr GRN Clearing (2103)  [same amount]
         *
         * The GRN Clearing accrual is cleared when the purchase invoice
         * is received against this GRN.
         */
        @Transactional
        public JournalEntry createJournalFromGRN(GrnEntity grn) {
                String ref = grn.getGrnNo();
                if (isDuplicate(ref)) return null;

                BigDecimal amount = grn.getGrandTotal() != null ? grn.getGrandTotal() : grn.getSubtotal();
                if (amount == null || amount.compareTo(BigDecimal.ZERO) == 0) {
                        log.warn("[PostingEngine] GRN {} has zero/null amount — no journal created.", ref);
                        return null;
                }

                JournalEntry entry = createBaseEntry(grn.getGrnDate(), ref, "GRN Receipt " + ref, TX_GRN);
                addLine(entry, "Inventory",    ACC_INVENTORY,    "GRN Receipt - "  + ref, amount,        BigDecimal.ZERO);
                addLine(entry, "GRN Clearing", ACC_GRN_CLEARING, "GRN Clearing - " + ref, BigDecimal.ZERO, amount);

                return post(entry);
        }

        // =========================================================
        // STOCK TRANSFER
        // =========================================================

        /**
         * Inter-branch stock transfer send (PDF §16 / Phase 5.3).
         *
         * CHOSEN MODEL: single Inventory (1120) account with cost-center dimension.
         *   Dr Inventory (1120) [Transit cost center]
         *   Cr Inventory (1120) [Source branch cost center]
         *
         * This preserves total inventory value at the entity level. The dimensional
         * model (branch/cost-center) is the PDF-endorsed approach for sub-ledger
         * analysis. The alternative — Inter-Branch Receivable (1150) / Payable (2150)
         * accounts — is only needed if statutory consolidation requires elimination
         * entries, which is not required for BillBull's current scope.
         *
         * To switch to the strict dual-account model, replace the cost-center lines
         * with Dr Inter-Branch Receivable (1150) / Cr Inventory on send and
         * Dr Inventory / Cr Inter-Branch Payable (2150) on receive, and add an
         * inter-branch reconciliation report.
         */
        @Transactional
        public JournalEntry createJournalFromStockTransferSent(StockTransfer transfer) {
                BigDecimal inventoryValue = nvl(transfer.getInventoryValue());
                if (!isInterBranchTransfer(transfer) || inventoryValue.compareTo(BigDecimal.ZERO) <= 0) {
                        return null;
                }

                String ref = "ST-SEND-" + transfer.getTransferNo();
                if (isDuplicate(ref)) return null;

                String sourceCostCenter = resolveWarehouseCostCenter(transfer.getFromWarehouse());
                String transitCostCenter = resolveTransitCostCenter(transfer);
                JournalEntry entry = createBaseEntry(
                                transfer.getDispatchDate() != null ? transfer.getDispatchDate() : LocalDate.now(),
                                ref,
                                "Stock Transfer Sent " + transfer.getTransferNo(), TX_STOCK_TRANSFER);
                entry.setReferenceType("STOCK_TRANSFER_SEND");
                entry.setReferenceId(transfer.getId());

                addLine(entry, "Inventory", ACC_INVENTORY,
                                "Inventory in transit - " + transfer.getTransferNo(),
                                inventoryValue, BigDecimal.ZERO, transitCostCenter);
                addLine(entry, "Inventory", ACC_INVENTORY,
                                "Source inventory relief - " + transfer.getTransferNo(),
                                BigDecimal.ZERO, inventoryValue, sourceCostCenter);

                return post(entry);
        }

        /**
         * Stock transfer receipt:
         *   Inter-branch receipt:
         *     Dr Inventory (1120) [Destination branch cost center]
         *     Cr Inventory (1120) [Transit cost center]
         *
         *   Capitalized logistics:
         *     Dr Inventory (1120) [Destination branch cost center]
         *     Cr Accounts Payable (2101)
         */
        @Transactional
        public JournalEntry createJournalFromStockTransferReceived(StockTransfer transfer) {
                BigDecimal inventoryValue = nvl(transfer.getInventoryValue());
                BigDecimal charges = nvl(transfer.getTransportCharge()).add(nvl(transfer.getAdditionalCharges()));

                if (inventoryValue.compareTo(BigDecimal.ZERO) <= 0 && charges.compareTo(BigDecimal.ZERO) <= 0) {
                        return null;
                }

                String ref = "ST-RECV-" + transfer.getTransferNo();
                if (isDuplicate(ref)) return null;

                String destinationCostCenter = resolveWarehouseCostCenter(transfer.getToWarehouse());
                JournalEntry entry = createBaseEntry(
                                transfer.getArrivalDate() != null ? transfer.getArrivalDate() : LocalDate.now(),
                                ref,
                                "Stock Transfer Received " + transfer.getTransferNo(), TX_STOCK_TRANSFER);
                entry.setReferenceType("STOCK_TRANSFER_RECEIVE");
                entry.setReferenceId(transfer.getId());

                if (isInterBranchTransfer(transfer) && inventoryValue.compareTo(BigDecimal.ZERO) > 0) {
                        String transitCostCenter = resolveTransitCostCenter(transfer);
                        addLine(entry, "Inventory", ACC_INVENTORY,
                                        "Destination inventory receipt - " + transfer.getTransferNo(),
                                        inventoryValue, BigDecimal.ZERO, destinationCostCenter);
                        addLine(entry, "Inventory", ACC_INVENTORY,
                                        "Clear in-transit inventory - " + transfer.getTransferNo(),
                                        BigDecimal.ZERO, inventoryValue, transitCostCenter);
                }

                if (charges.compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "Inventory", ACC_INVENTORY,
                                        "Capitalize transfer charges - " + transfer.getTransferNo(),
                                        charges, BigDecimal.ZERO, destinationCostCenter);
                        addLine(entry, "Accounts Payable", ACC_ACCOUNTS_PAYABLE,
                                        "Accrue transfer charges - " + transfer.getTransferNo(),
                                        BigDecimal.ZERO, charges, destinationCostCenter);
                }

                return entry.getLines().isEmpty() ? null : post(entry);
        }

        // =========================================================
        // EXPENSE
        // =========================================================

        /**
         * Dr Expense (5403)   [amount]
         * Dr VAT Input (1130) [taxAmount]  (if > 0)
         * Cr Bank (1102)      [total]
         */
        @Transactional
        public JournalEntry createJournalFromExpense(Expense expense) {
                String ref = "EXP-" + expense.getId();
                if (isDuplicate(ref)) return null;

                // Resolve the selected GL account; fall back to the default expense account
                String expenseAccountCode = ACC_EXPENSE_GENERAL;
                String expenseAccountName = expense.getCategory();
                if (expense.getGlAccountId() != null && !expense.getGlAccountId().isBlank()) {
                        Account glAccount = accountRepository.findById(expense.getGlAccountId()).orElse(null);
                        if (glAccount != null) {
                                expenseAccountCode = glAccount.getCode();
                                expenseAccountName = glAccount.getName();
                        }
                }

                JournalEntry entry = createBaseEntry(expense.getDate(), ref,
                                "Expense - " + expense.getCategory(), TX_EXPENSE);
                addLine(entry, expenseAccountName, expenseAccountCode,
                                expense.getNotes() != null ? expense.getNotes() : "",
                                BigDecimal.valueOf(expense.getAmount()), BigDecimal.ZERO);
                if (expense.getTaxAmount() > 0) {
                        addLine(entry, "VAT Input", ACC_VAT_INPUT, "VAT on expense",
                                        BigDecimal.valueOf(expense.getTaxAmount()), BigDecimal.ZERO);
                }

                // QA-054: credit the pay-ledger the user selected on the expense entry.
                // Explicit paymentAccountId wins; otherwise resolve via paymentMode
                // (Cash → Cash GL, Credit → Accounts Payable, else → Bank). Final
                // fallback keeps the legacy "Bank/Cash" line so historic expenses
                // continue to post the same way.
                String payCode = ACC_BANK;
                String payName = "Bank/Cash";
                if (expense.getPaymentAccountId() != null && !expense.getPaymentAccountId().isBlank()) {
                        Account payAccount = accountRepository.findById(expense.getPaymentAccountId()).orElse(null);
                        if (payAccount != null) {
                                payCode = payAccount.getCode();
                                payName = payAccount.getName();
                        }
                } else if (expense.getPaymentMode() != null && !expense.getPaymentMode().isBlank()) {
                        AccountSelection sel = resolveExpenseSettlementAccount(expense.getPaymentMode());
                        payCode = sel.code;
                        payName = sel.name;
                }
                addLine(entry, payName, payCode, "Payment for expense",
                                BigDecimal.ZERO, BigDecimal.valueOf(expense.getTotal()));
                return post(entry);
        }

        /**
         * QA-054: map an expense pay-mode label to a default settlement account
         * when the user hasn't explicitly picked a ledger. Matches the labels
         * used in the Expense entry UI (Cash / Card / Credit / Bank Transfer /
         * Online Payment) case-insensitively.
         */
        private AccountSelection resolveExpenseSettlementAccount(String paymentMode) {
                String mode = paymentMode == null ? "" : paymentMode.trim().toUpperCase();
                return switch (mode) {
                        case "CASH"                                  -> new AccountSelection("Cash",            ACC_CASH);
                        case "CREDIT"                                -> new AccountSelection("Accounts Payable", ACC_ACCOUNTS_PAYABLE);
                        case "CARD", "BANK TRANSFER", "ONLINE PAYMENT"
                                                                     -> new AccountSelection("Bank",            ACC_BANK);
                        default                                      -> new AccountSelection("Bank/Cash",       ACC_BANK);
                };
        }

        // =========================================================
        // PAYMENT VOUCHER (outgoing vendor payment)
        // =========================================================

        /**
         * Dr Accounts Payable (2101) [amount]
         * Cr Cash / Bank             [amount]   (based on payment mode)
         */
        @Transactional
        public JournalEntry createJournalFromPaymentVoucher(PaymentVoucher voucher, String vendorName) {
                String ref = voucher.getVoucherNumber();
                if (isDuplicate(ref)) return null;

                AccountSelection settlementAccount = resolveOutgoingPaymentAccount(
                                voucher.getPaymentMode() != null ? voucher.getPaymentMode().name() : null);
                JournalEntry entry = createBaseEntry(voucher.getPaymentDate(), ref,
                                "Payment to " + vendorName, TX_PAYMENT_VOUCHER);

                BigDecimal paid     = voucher.getAmount() != null ? voucher.getAmount() : BigDecimal.ZERO;
                BigDecimal discount = voucher.getDiscountAmount() != null
                                && voucher.getDiscountAmount().compareTo(BigDecimal.ZERO) > 0
                                        ? voucher.getDiscountAmount() : BigDecimal.ZERO;
                BigDecimal totalAP  = paid.add(discount); // full AP amount cleared

                addLine(entry, "Accounts Payable", ACC_ACCOUNTS_PAYABLE,
                                "Payment - " + ref, totalAP, BigDecimal.ZERO);
                addLine(entry, settlementAccount.name, settlementAccount.code,
                                settlementAccount.name + " payment", BigDecimal.ZERO, paid);

                // Settlement discount received from vendor (PDF §12 / Phase 4.4)
                if (discount.compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "Discount Received", ACC_DISCOUNT_RECEIVED,
                                        "Early payment discount - " + ref, BigDecimal.ZERO, discount);
                }

                return post(entry);
        }

        // =========================================================
        // RECEIPT VOUCHER (incoming customer payment)
        // =========================================================

        /**
         * Dr Cash / Bank / Merchant Clearing  [amount]  (based on payment mode)
         * Cr Accounts Receivable (1110)        [amount]
         */
        @Transactional
        public JournalEntry createJournalFromReceiptVoucher(ReceiptVoucher receipt) {
                String ref = receipt.getVoucherId();
                if (isDuplicate(ref)) return null;

                AccountSelection settlementAccount = resolveIncomingPaymentAccount(receipt.getPaymentMode());
                JournalEntry entry = createBaseEntry(receipt.getDate(), ref,
                                "Receipt from " + receipt.getMemberName(), TX_RECEIPT_VOUCHER);

                BigDecimal received = receipt.getAmount() != null ? receipt.getAmount() : BigDecimal.ZERO;
                BigDecimal discount = receipt.getDiscountAmount() != null
                                && receipt.getDiscountAmount().compareTo(BigDecimal.ZERO) > 0
                                        ? receipt.getDiscountAmount() : BigDecimal.ZERO;
                BigDecimal totalAR  = received.add(discount); // full invoice amount cleared

                addLine(entry, settlementAccount.name, settlementAccount.code,
                                "Receipt - " + ref, received, BigDecimal.ZERO);

                // Settlement discount (PDF §7 / Phase 4.3): Dr Discount Allowed / Cr AR for discount portion
                if (discount.compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "Discount Allowed", ACC_DISCOUNT_ALLOWED,
                                        "Early payment discount - " + ref, discount, BigDecimal.ZERO);
                }

                // Use Customer Advance account for advances, otherwise use AR
                String creditAccount = ACC_ACCOUNTS_RECEIVABLE;
                String creditName    = "Accounts Receivable";
                if (receipt.getPurpose() == com.billbull.backend.financials.receiptvoucher.ReceiptPurpose.ADVANCE_RECEIVED) {
                        creditAccount = ACC_CUSTOMER_ADVANCE;
                        creditName    = "Customer Advance";
                        totalAR       = received; // advances have no discount
                }

                addLine(entry, creditName, creditAccount,
                                "Customer payment - " + receipt.getPurpose(), BigDecimal.ZERO, totalAR);
                return post(entry);
        }

        // =========================================================
        // SALES RETURN
        // =========================================================

        /**
         * Generates the accounting entry for an approved sales return.
         *
         * The revenue account to reverse depends on whether revenue was
         * already recognized (DN was delivered) or is still deferred:
         *
         *   revenueWasRecognized = true  (DN already delivered):
         *     Dr Sales Revenue (4101) [subTotal]
         *     Dr VAT Output (2102)    [taxAmount]  (if > 0)
         *     Cr Accounts Receivable (1110) [totalAmount]
         *
         *   revenueWasRecognized = false (DN not yet delivered / revenue deferred):
         *     Dr Deferred Revenue (2107) [subTotal]
         *     Dr VAT Output (2102)       [taxAmount]  (if > 0)
         *     Cr Accounts Receivable (1110) [totalAmount]
         *
         * COGS reversal (only if costOfGoodsReturned > 0):
         *   Dr Inventory (1120) / Cr COGS (5101)
         *
         * @param salesReturn           the approved sales return entity
         * @param costOfGoodsReturned   actual cost from product master (0 if unknown)
         * @param revenueWasRecognized  true if revenue was already recognized at DN delivery
         */
        @Transactional
        public JournalEntry createJournalFromSalesReturn(
                        SalesReturn salesReturn,
                        BigDecimal costOfGoodsReturned,
                        boolean revenueWasRecognized) {

                String ref = salesReturn.getReturnNumber();
                if (isDuplicate(ref)) return null;

                JournalEntry entry = createBaseEntry(salesReturn.getReturnDate(), ref,
                                "Sales Return " + ref, TX_CREDIT_NOTE);

                BigDecimal subTotal   = salesReturn.getSubTotal()   != null ? BigDecimal.valueOf(salesReturn.getSubTotal())   : BigDecimal.ZERO;
                BigDecimal taxAmount  = salesReturn.getTaxAmount()  != null ? BigDecimal.valueOf(salesReturn.getTaxAmount())  : BigDecimal.ZERO;
                BigDecimal totalAmount = salesReturn.getTotalAmount() != null ? BigDecimal.valueOf(salesReturn.getTotalAmount()) : BigDecimal.ZERO;

                // Debit the correct revenue account
                String revenueAccount     = revenueWasRecognized ? ACC_SALES_REVENUE     : ACC_DEFERRED_REVENUE;
                String revenueAccountName = revenueWasRecognized ? "Sales Revenue"        : "Deferred Revenue";
                addLine(entry, revenueAccountName, revenueAccount, "Return Revenue Reversal", subTotal, BigDecimal.ZERO);

                if (taxAmount.compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "VAT Output", ACC_VAT_OUTPUT, "VAT Refund", taxAmount, BigDecimal.ZERO);
                }
                addLine(entry, "Accounts Receivable", ACC_ACCOUNTS_RECEIVABLE,
                                "Return Credit Note", BigDecimal.ZERO, totalAmount);

                // COGS reversal — only if we have an actual cost
                if (costOfGoodsReturned != null && costOfGoodsReturned.compareTo(BigDecimal.ZERO) > 0) {
                        JournalEntry invEntry = createBaseEntry(salesReturn.getReturnDate(),
                                        ref + "-INV",
                                        "Stock return - " + ref, TX_CREDIT_NOTE);
                        addLine(invEntry, "Inventory", ACC_INVENTORY, "Inventory increase", costOfGoodsReturned, BigDecimal.ZERO);
                        addLine(invEntry, "COGS",      ACC_COGS,      "COGS reversal",      BigDecimal.ZERO, costOfGoodsReturned);
                        post(invEntry);
                } else {
                        log.warn("[PostingEngine] Sales Return {}: COGS reversal skipped — no product cost available. " +
                                         "Post a manual journal to adjust COGS and Inventory.", ref);
                }

                return post(entry);
        }

        // =========================================================
        // CARD SETTLEMENT
        // =========================================================

        /**
         * Dr Bank (1102)              [netAmount]
         * Dr Bank Charges (5403)      [feeAmount]  (if > 0)
         * Cr Merchant Clearing (1104) [grossAmount]
         */
        @Transactional
        public JournalEntry createJournalFromCardSettlement(CardSettlement settlement) {
                String ref = "SETTLE-" + settlement.getId();
                if (isDuplicate(ref)) return null;

                JournalEntry entry = createBaseEntry(settlement.getSettlementDate(), ref,
                                "Card Settlement", TX_CARD_SETTLEMENT);
                addLine(entry, "Bank",              ACC_BANK,               "Settled funds",          settlement.getNetAmount(),   BigDecimal.ZERO);
                addLine(entry, "Merchant Clearing", ACC_MERCHANT_CLEARING,  "Clear merchant suspense", BigDecimal.ZERO,            settlement.getGrossAmount());
                if (settlement.getFeeAmount() != null && settlement.getFeeAmount().compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "Bank Charges", ACC_EXPENSE_GENERAL, "Merchant fees", settlement.getFeeAmount(), BigDecimal.ZERO);
                }
                return post(entry);
        }

        // =========================================================
        // PDC (Post-Dated Cheque)
        // =========================================================

        /**
         * PDC GL posting (PDF §11 / Phase 4.5).
         *
         * RECEIVED   → Dr CUC (1107) / Cr Accounts Receivable (1110)   Ref: PDC-RECV-{id}
         * DEPOSITED  → no posting (in-flight; still in CUC)
         * CLEARED    → Dr Bank (1102) / Cr CUC (1107)                  Ref: PDC-CLEAR-{id}
         * BOUNCED    → Reverse CLEARED (if exists), then reverse RECEIVED:
         *              Dr AR (1110) / Cr CUC (1107)                     Ref: PDC-BOUNCE-{id}
         */
        @Transactional
        public void createJournalFromPdcTransition(PdcEntry pdc, PdcStatus oldStatus, PdcStatus newStatus) {
                if (newStatus == PdcStatus.RECEIVED) {
                        String ref = "PDC-RECV-" + pdc.getId();
                        if (!isDuplicate(ref)) {
                                JournalEntry entry = createBaseEntry(pdc.getReceivedDate(), ref,
                                                "PDC received - cheque " + pdc.getChequeNumber(), TX_RECEIPT_VOUCHER);
                                addLine(entry, "Cheques Under Collection", ACC_CUC, "PDC received",
                                                pdc.getAmount(), BigDecimal.ZERO);
                                addLine(entry, "Accounts Receivable", ACC_ACCOUNTS_RECEIVABLE, "CUC from " + pdc.getCustomerName(),
                                                BigDecimal.ZERO, pdc.getAmount());
                                post(entry);
                        }
                } else if (newStatus == PdcStatus.CLEARED) {
                        String ref = "PDC-CLEAR-" + pdc.getId();
                        if (!isDuplicate(ref)) {
                                JournalEntry entry = createBaseEntry(pdc.getChequeDate(), ref,
                                                "PDC cleared - cheque " + pdc.getChequeNumber(), TX_RECEIPT_VOUCHER);
                                addLine(entry, "Bank",                    ACC_BANK, "PDC cleared to bank",
                                                pdc.getAmount(), BigDecimal.ZERO);
                                addLine(entry, "Cheques Under Collection", ACC_CUC,  "CUC cleared",
                                                BigDecimal.ZERO, pdc.getAmount());
                                post(entry);
                        }
                } else if (newStatus == PdcStatus.BOUNCED) {
                        // Reverse CLEARED if it was posted
                        String clearRef   = "PDC-CLEAR-"  + pdc.getId();
                        String bounceRef  = "PDC-BOUNCE-" + pdc.getId();
                        if (journalEntryRepository.existsByReference(clearRef) && !isDuplicate(bounceRef + "-CLEAR")) {
                                JournalEntry rev = createBaseEntry(LocalDate.now(), bounceRef + "-CLEAR",
                                                "Reverse cleared PDC - " + pdc.getChequeNumber(), TX_RECEIPT_VOUCHER);
                                addLine(rev, "Cheques Under Collection", ACC_CUC,  "Reverse CUC",
                                                pdc.getAmount(), BigDecimal.ZERO);
                                addLine(rev, "Bank",                    ACC_BANK, "Reverse bank",
                                                BigDecimal.ZERO, pdc.getAmount());
                                post(rev);
                        }
                        // Reverse RECEIVED: re-open AR
                        if (!isDuplicate(bounceRef)) {
                                JournalEntry bounce = createBaseEntry(LocalDate.now(), bounceRef,
                                                "Bounced PDC - " + pdc.getChequeNumber(), TX_RECEIPT_VOUCHER);
                                addLine(bounce, "Accounts Receivable",   ACC_ACCOUNTS_RECEIVABLE, "AR re-opened",
                                                pdc.getAmount(), BigDecimal.ZERO);
                                addLine(bounce, "Cheques Under Collection", ACC_CUC, "CUC reversed",
                                                BigDecimal.ZERO, pdc.getAmount());
                                post(bounce);
                        }
                } else {
                        log.info("[PostingEngine] PDC {} transitioned {} → {} — no GL action required.",
                                        pdc.getId(), oldStatus, newStatus);
                }
        }

        // =========================================================
        // CUSTOMER ADVANCE APPLICATION & REFUND
        // =========================================================

        /**
         * Applies a customer advance against a sales invoice (PDF §5).
         *
         * Dr Customer Advance (2104) [amount]
         * Cr Accounts Receivable (1110) [amount]
         */
        @Transactional
        public JournalEntry createJournalFromAdvanceApplication(
                        Long advanceReceiptId, String invoiceNumber,
                        BigDecimal amount, java.time.LocalDate appliedDate) {
                String ref = "APPLY-ADV-" + advanceReceiptId + "-INV-" + invoiceNumber;
                if (isDuplicate(ref)) return null;

                JournalEntry entry = createBaseEntry(
                                appliedDate != null ? appliedDate : LocalDate.now(),
                                ref, "Advance application: " + invoiceNumber, TX_ADVANCE_APP);
                addLine(entry, "Customer Advance",    ACC_CUSTOMER_ADVANCE,    "Advance applied", amount, BigDecimal.ZERO);
                addLine(entry, "Accounts Receivable", ACC_ACCOUNTS_RECEIVABLE, "Invoice settled",  BigDecimal.ZERO, amount);
                return post(entry);
        }

        /**
         * Refunds an unused customer advance back to bank/cash (PDF §5).
         *
         * Dr Customer Advance (2104) [refundAmount]
         * Cr Bank/Cash              [refundAmount]
         */
        @Transactional
        public JournalEntry createJournalFromAdvanceRefund(
                        Long advanceReceiptId, BigDecimal refundAmount, String paymentMode) {
                String ref = "REFUND-ADV-" + advanceReceiptId;
                if (isDuplicate(ref)) return null;

                AccountSelection settlement = resolveIncomingPaymentAccount(paymentMode);
                JournalEntry entry = createBaseEntry(LocalDate.now(), ref,
                                "Advance refund for receipt " + advanceReceiptId, TX_ADVANCE_REFUND);
                addLine(entry, "Customer Advance", ACC_CUSTOMER_ADVANCE, "Advance refunded", refundAmount, BigDecimal.ZERO);
                addLine(entry, settlement.name, settlement.code, "Refund paid out", BigDecimal.ZERO, refundAmount);
                return post(entry);
        }

        // =========================================================
        // PAYROLL — Salary JV, Salary Advance, WPS (PDF §13 / Phase 6)
        // =========================================================

        /**
         * End-of-month payroll run journal (PDF §13 / Phase 6.1).
         *
         * Dr Salary Expense (6010)           [grossSalary]
         * Cr Salary Payable (2200)           [netPayable]
         * Cr Salary Advances (1106)          [advanceDeducted]   (if > 0)
         * Cr Other Deductions Payable (2201) [otherDeductions]   (if > 0)
         *
         * Idempotency key: "PAYROLL-{employeeId}-{year}-{month}"
         * Department cost center on expense line enables departmental P&L.
         */
        @Transactional
        public JournalEntry createJournalFromPayrollRun(
                        String employeeId, String employeeName,
                        BigDecimal grossSalary, BigDecimal netPayable,
                        BigDecimal advanceDeducted, BigDecimal otherDeductions,
                        int year, int month, String costCenter, LocalDate paymentDate) {

                String ref = "PAYROLL-" + employeeId + "-" + year + "-" + String.format("%02d", month);
                if (isDuplicate(ref)) return null;

                BigDecimal gross = grossSalary  != null ? grossSalary  : BigDecimal.ZERO;
                BigDecimal net   = netPayable   != null ? netPayable   : BigDecimal.ZERO;
                BigDecimal adv   = advanceDeducted != null ? advanceDeducted : BigDecimal.ZERO;
                BigDecimal ded   = otherDeductions != null ? otherDeductions : BigDecimal.ZERO;

                JournalEntry entry = createBaseEntry(paymentDate != null ? paymentDate : LocalDate.now(),
                                ref, "Salary - " + employeeName + " " + year + "/" + String.format("%02d", month),
                                TX_PAYROLL);

                addLine(entry, "Salary Expense",           ACC_SALARY_EXPENSE,  "Gross salary - " + employeeName,
                                gross, BigDecimal.ZERO, costCenter);
                addLine(entry, "Salary Payable",           ACC_SALARY_PAYABLE,  "Net payable - " + employeeName,
                                BigDecimal.ZERO, net);
                if (adv.compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "Salary Advances", ACC_SALARY_ADVANCES, "Advance recovery - " + employeeName,
                                        BigDecimal.ZERO, adv);
                }
                if (ded.compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "Other Deductions Payable", ACC_OTHER_DEDUCTIONS, "Deductions - " + employeeName,
                                        BigDecimal.ZERO, ded);
                }

                return post(entry);
        }

        /**
         * Salary advance disbursement to employee (PDF §13 / Phase 6.2).
         *
         * Dr Salary Advances (1106) / Cr Cash / Bank
         */
        @Transactional
        public JournalEntry createJournalFromSalaryAdvance(
                        Long advanceId, String employeeId, String employeeName,
                        BigDecimal amount, String paymentMode, LocalDate advanceDate) {
                String ref = "SADV-" + advanceId;
                if (isDuplicate(ref)) return null;

                AccountSelection settlement = resolveOutgoingPaymentAccount(paymentMode);
                JournalEntry entry = createBaseEntry(advanceDate != null ? advanceDate : LocalDate.now(), ref,
                                "Salary advance - " + employeeName, TX_SALARY_ADVANCE);
                addLine(entry, "Salary Advances", ACC_SALARY_ADVANCES, "Advance to " + employeeName,
                                amount, BigDecimal.ZERO);
                addLine(entry, settlement.name, settlement.code, "Payment for advance",
                                BigDecimal.ZERO, amount);
                return post(entry);
        }

        /**
         * WPS disbursement confirmation — net salary paid to bank (PDF §13 / Phase 6.3).
         *
         * Dr Salary Payable (2200) / Cr Bank (1102)
         */
        @Transactional
        public JournalEntry createJournalFromWpsDisbursement(
                        String wpsRunId, String periodLabel,
                        BigDecimal totalNet, LocalDate disbursementDate) {
                String ref = "WPS-" + wpsRunId + "-" + disbursementDate;
                if (isDuplicate(ref)) return null;

                JournalEntry entry = createBaseEntry(disbursementDate != null ? disbursementDate : LocalDate.now(),
                                ref, "WPS disbursement - " + periodLabel, TX_PAYROLL);
                addLine(entry, "Salary Payable", ACC_SALARY_PAYABLE, "Clear salary payable - " + periodLabel,
                                totalNet, BigDecimal.ZERO);
                addLine(entry, "Bank", ACC_BANK, "WPS bank transfer", BigDecimal.ZERO, totalNet);
                return post(entry);
        }

        // =========================================================
        // BANK RECONCILIATION HELPERS (PDF §17 / Phase 7.2)
        // =========================================================

        /** Dr Bank Charges (7501) / Cr Bank (1102) — for unmatched statement fee lines. */
        @Transactional
        public JournalEntry createJournalFromBankCharge(
                        String ref, BigDecimal amount, String description, LocalDate date) {
                if (isDuplicate(ref)) return null;
                JournalEntry entry = createBaseEntry(date != null ? date : LocalDate.now(), ref,
                                description != null ? description : "Bank charge", TX_MANUAL_JOURNAL);
                addLine(entry, "Bank Charges", ACC_BANK_CHARGES, description, amount, BigDecimal.ZERO);
                addLine(entry, "Bank",         ACC_BANK,         description, BigDecimal.ZERO, amount);
                return post(entry);
        }

        /** Dr Bank (1102) / Cr Interest Income (7002) — for unmatched statement interest lines. */
        @Transactional
        public JournalEntry createJournalFromBankInterest(
                        String ref, BigDecimal amount, String description, LocalDate date) {
                if (isDuplicate(ref)) return null;
                JournalEntry entry = createBaseEntry(date != null ? date : LocalDate.now(), ref,
                                description != null ? description : "Bank interest", TX_MANUAL_JOURNAL);
                addLine(entry, "Bank",            ACC_BANK,            description, amount, BigDecimal.ZERO);
                addLine(entry, "Interest Income", ACC_INTEREST_INCOME, description, BigDecimal.ZERO, amount);
                return post(entry);
        }

        // =========================================================
        // INVENTORY WRITE-OFF (PDF §16 / Phase 5.4)
        // =========================================================

        /**
         * Posts an inventory write-off journal at the specific batch cost (PDF §16).
         *
         * Dr Inventory Write-off (5104) [cost]
         * Cr Inventory (1120)          [cost]
         *
         * @param stockTakeId  stock-take session or item id (for reference uniqueness)
         * @param lineId       stock-take item or batch id
         * @param description  item code / batch number for narration
         * @param cost         total cost of the expired/written-off units
         * @param postingDate  date of the write-off
         */
        @Transactional
        public JournalEntry createJournalFromInventoryWriteoff(
                        String stockTakeId, Long lineId, String description,
                        BigDecimal cost, LocalDate postingDate) {
                if (cost == null || cost.compareTo(BigDecimal.ZERO) <= 0) return null;
                String ref = "WRITEOFF-" + stockTakeId + "-" + lineId;
                if (isDuplicate(ref)) return null;

                JournalEntry entry = createBaseEntry(postingDate != null ? postingDate : LocalDate.now(), ref,
                                "Inventory write-off: " + description, TX_MANUAL_JOURNAL);
                addLine(entry, "Inventory Write-off", "5104", "Write-off: " + description, cost, BigDecimal.ZERO);
                addLine(entry, "Inventory",           ACC_INVENTORY, "Inventory reduction: " + description, BigDecimal.ZERO, cost);
                return post(entry);
        }

        // =========================================================
        // VENDOR ADVANCE (PDF §10 / Phase 4.1)
        // =========================================================

        /**
         * Pay a vendor advance.
         * Dr Vendor Advances Paid (1105) / Cr Bank (1102)
         */
        @Transactional
        public JournalEntry createJournalFromVendorAdvancePay(com.billbull.backend.purchase.advance.VendorAdvance advance) {
                String ref = "VADV-" + advance.getId();
                if (isDuplicate(ref)) return null;
                JournalEntry entry = createBaseEntry(advance.getPaidDate(), ref,
                                "Vendor advance - " + advance.getVendorName(), TX_VENDOR_ADVANCE);
                addLine(entry, "Vendor Advances Paid", ACC_VENDOR_ADVANCES, "Advance paid", advance.getAmount(), BigDecimal.ZERO);
                addLine(entry, "Bank",                 ACC_BANK,            "Bank payment", BigDecimal.ZERO, advance.getAmount());
                return post(entry);
        }

        /**
         * Apply a vendor advance against a purchase invoice.
         * Dr Accounts Payable (2101) / Cr Vendor Advances Paid (1105)
         */
        @Transactional
        public JournalEntry createJournalFromVendorAdvanceApply(
                        com.billbull.backend.purchase.advance.VendorAdvance advance,
                        String piNumber, BigDecimal amount) {
                String ref = "APPLY-VADV-" + advance.getId() + "-PI-" + piNumber;
                if (isDuplicate(ref)) return null;
                JournalEntry entry = createBaseEntry(LocalDate.now(), ref,
                                "Advance applied to " + piNumber, TX_VENDOR_ADVANCE);
                addLine(entry, "Accounts Payable",     ACC_ACCOUNTS_PAYABLE, "Apply advance", amount, BigDecimal.ZERO);
                addLine(entry, "Vendor Advances Paid", ACC_VENDOR_ADVANCES,  "Advance consumed", BigDecimal.ZERO, amount);
                return post(entry);
        }

        /**
         * Refund an unused vendor advance.
         * Dr Bank (1102) / Cr Vendor Advances Paid (1105)
         */
        @Transactional
        public JournalEntry createJournalFromVendorAdvanceRefund(com.billbull.backend.purchase.advance.VendorAdvance advance) {
                String ref = "REFUND-VADV-" + advance.getId();
                if (isDuplicate(ref)) return null;
                JournalEntry entry = createBaseEntry(LocalDate.now(), ref,
                                "Vendor advance refund - " + advance.getVendorName(), TX_VENDOR_ADVANCE);
                addLine(entry, "Bank",                 ACC_BANK,            "Advance refunded", advance.getAmount(), BigDecimal.ZERO);
                addLine(entry, "Vendor Advances Paid", ACC_VENDOR_ADVANCES, "Advance cleared",  BigDecimal.ZERO, advance.getAmount());
                return post(entry);
        }

        // =========================================================
        // Reconciliation helpers
        // =========================================================

        /**
         * Returns true if a GL journal exists for the given reference key.
         */
        public boolean hasJournalForReference(String reference) {
                return journalEntryRepository.existsByReference(reference);
        }

        // =========================================================
        // Manual entry validation
        // =========================================================

        public void validateManualEntry(JournalEntry entry) {
                if (entry.getEntryType() == EntryType.MANUAL) {
                        for (JournalLine line : entry.getLines()) {
                                if (isControlAccount(line.getAccountCode())) {
                                        throw new RuntimeException("Manual entry to control account NOT allowed: "
                                                        + line.getAccountCode());
                                }
                        }
                }
        }

        // =========================================================
        // Private helpers
        // =========================================================

        /**
         * Returns true and logs a warning when the reference already has a journal.
         * Callers should return early without creating a new entry.
         */
        private boolean isDuplicate(String reference) {
                if (journalEntryRepository.existsByReference(reference)) {
                        log.warn("[PostingEngine] Duplicate posting blocked — reference '{}' already exists in GL. " +
                                         "No new journal created.", reference);
                        return true;
                }
                return false;
        }

        private boolean isControlAccount(String accountCode) {
                return CONTROL_ACCOUNTS.contains(accountCode);
        }

        private JournalEntry createBaseEntry(LocalDate date, String reference, String narration, String txType) {
                JournalEntry entry = new JournalEntry();
                LocalDate effectiveDate = date != null ? date : LocalDate.now();
                entry.setDate(effectiveDate);
                entry.setReference(reference);
                entry.setNarration(narration);
                entry.setStatus("Draft");
                entry.setPreparedBy("System");
                // Per-branch / per-type / per-fiscal-year voucher number (PDF §1).
                // Branch is not known at this point for most system flows, so the
                // default branch code is used; voucher format remains stable.
                entry.setEntryNumber(voucherSequenceService.nextVoucherNumber(
                                txType, VoucherSequenceService.DEFAULT_BRANCH_CODE, effectiveDate));
                return entry;
        }

        private void addLine(JournalEntry entry, String accountName, String accountCode,
                        String description, BigDecimal debit, BigDecimal credit) {
                addLine(entry, accountName, accountCode, description, debit, credit, null);
        }

        private void addLine(JournalEntry entry, String accountName, String accountCode,
                        String description, BigDecimal debit, BigDecimal credit, String costCenter) {
                JournalLine line = new JournalLine();
                line.setAccount(accountName);
                line.setAccountCode(accountCode);
                line.setDescription(description);
                BigDecimal dr = debit  != null ? debit  : BigDecimal.ZERO;
                BigDecimal cr = credit != null ? credit : BigDecimal.ZERO;
                line.setDebit(dr);
                line.setCredit(cr);
                line.setCostCenter(costCenter);
                // AED-only MVP: populate currency/FX columns so the schema is non-null.
                // Replace with CurrencyService.getRate() lookup when multi-currency is scoped.
                line.setCurrency("AED");
                line.setFxRate(BigDecimal.ONE);
                line.setBaseDebit(dr);
                line.setBaseCredit(cr);
                entry.addLine(line);
        }

        /** Null-safe BigDecimal from a possibly-null Double amount. */
        private BigDecimal nz(Double value) {
                return value != null ? BigDecimal.valueOf(value) : BigDecimal.ZERO;
        }

        /**
         * Posts a round-off adjustment to {@link #ACC_ROUNDING}. A positive roundOff
         * (total rounded up) is a rounding gain → credit; negative (rounded down) is a
         * rounding loss → debit. Pass {@code reverse=true} to swap sides (cancellation).
         * No-ops when roundOff is zero.
         */
        private void addRoundOffLine(JournalEntry entry, BigDecimal roundOff, String description, boolean reverse) {
                if (roundOff == null || roundOff.signum() == 0) return;
                BigDecimal magnitude = roundOff.abs();
                boolean credit = roundOff.signum() > 0;
                if (reverse) credit = !credit;
                addLine(entry, "Rounding Adjustment", ACC_ROUNDING, description,
                                credit ? BigDecimal.ZERO : magnitude,
                                credit ? magnitude : BigDecimal.ZERO);
        }

        /**
         * Single posting gateway (PDF §1). Runs the full pre-validation pipeline,
         * persists header + lines + ledger, then notifies. Any guard failure raises
         * a {@link PostingException} with a stable code and rolls back the enclosing
         * transaction (callers are {@code @Transactional}).
         */
        private JournalEntry post(JournalEntry entry) {
                validate(entry);
                JournalEntry saved = persist(entry);
                notifyPosted(saved);
                return saved;
        }

        /**
         * Pre-validation pipeline. Order matters: period lock first (cheapest, most
         * common rejection), then balance (may inject a rounding line), then account
         * status, then dimensions (warn-only in Phase 1).
         *
         * Package-private so {@code PostingEngineServiceTest} can exercise each guard
         * directly without a full posting round-trip.
         */
        void validate(JournalEntry entry) {
                accountingPeriodService.assertOpen(entry.getDate());   // PERIOD_LOCKED
                balanceGuard(entry);                                   // UNBALANCED_ENTRY (+ rounding absorption)
                accountActiveGuard(entry);                             // ACCOUNT_INACTIVE
                dimensionMatrixService.validate(entry);                // MISSING_DIMENSION (warn-only)
        }

        /**
         * Hard double-entry guard. Rejects any imbalance beyond
         * {@link #ROUNDING_TOLERANCE}; absorbs a sub-tolerance residual (FX/tax
         * rounding) into the Rounding Adjustment account (5999) so the entry posts
         * balanced.
         */
        private void balanceGuard(JournalEntry entry) {
                BigDecimal totalDebit  = BigDecimal.ZERO;
                BigDecimal totalCredit = BigDecimal.ZERO;
                for (JournalLine line : entry.getLines()) {
                        totalDebit  = totalDebit.add(nvl(line.getDebit()));
                        totalCredit = totalCredit.add(nvl(line.getCredit()));
                }

                BigDecimal diff = totalDebit.subtract(totalCredit);
                BigDecimal absDiff = diff.abs();

                if (absDiff.compareTo(ROUNDING_TOLERANCE) > 0) {
                        throw new PostingException(PostingErrorCode.UNBALANCED_ENTRY,
                                        "Journal not balanced (ref=" + entry.getReference() + "). Debit="
                                                        + totalDebit + ", Credit=" + totalCredit);
                }

                if (absDiff.compareTo(BigDecimal.ZERO) > 0) {
                        if (diff.compareTo(BigDecimal.ZERO) > 0) {
                                // Debit heavy → credit the residual to rounding.
                                addLine(entry, "Rounding Adjustment", ACC_ROUNDING,
                                                "Rounding absorption - " + entry.getReference(),
                                                BigDecimal.ZERO, absDiff);
                        } else {
                                addLine(entry, "Rounding Adjustment", ACC_ROUNDING,
                                                "Rounding absorption - " + entry.getReference(),
                                                absDiff, BigDecimal.ZERO);
                        }
                        log.info("[PostingEngine] Absorbed rounding residual {} into {} for ref '{}'.",
                                        absDiff, ACC_ROUNDING, entry.getReference());
                }
        }

        /**
         * Rejects postings that reference an inactive GL account. Unknown codes are
         * warned (not blocked) — some flows post to dynamically resolved accounts
         * that may not be in the seeded COA.
         */
        private void accountActiveGuard(JournalEntry entry) {
                for (JournalLine line : entry.getLines()) {
                        String code = line.getAccountCode();
                        if (code == null || code.isBlank()) continue;
                        Account account = accountRepository.findByCode(code);
                        if (account == null) {
                                log.warn("[PostingEngine] Unknown account code '{}' on ref '{}' — skipping active check.",
                                                code, entry.getReference());
                                continue;
                        }
                        String status = account.getStatus();
                        if (status != null && !"active".equalsIgnoreCase(status)) {
                                throw new PostingException(PostingErrorCode.ACCOUNT_INACTIVE,
                                                "Account " + code + " ('" + account.getName() + "') is not active (status="
                                                                + status + ").");
                        }
                }
        }

        private JournalEntry persist(JournalEntry entry) {
                JournalEntry saved = journalEntryRepository.save(entry);
                journalEntryService.postEntry(saved.getId(), "System");
                // Atomically upsert the pre-aggregated GL balance rows (PDF §20 / Phase 8.1).
                // Keeps gl_account_balances in sync with every posting without a full ledger scan.
                upsertGlBalances(saved);
                return saved;
        }

        /**
         * Upserts one {@link GlAccountBalance} row per (accountCode, periodId, branchId) triple
         * for each line in the just-posted entry. Runs inside the same transaction as persist().
         */
        private void upsertGlBalances(JournalEntry entry) {
                Long branchId   = entry.getBranch() != null ? entry.getBranch().getId() : null;
                Long periodId   = accountingPeriodService.findCoveringPeriod(entry.getDate()) != null
                                ? accountingPeriodService.findCoveringPeriod(entry.getDate()).getId() : null;

                for (JournalLine line : entry.getLines()) {
                        String code = line.getAccountCode();
                        if (code == null || code.isBlank()) continue;

                        BigDecimal dr = nvl(line.getDebit());
                        BigDecimal cr = nvl(line.getCredit());

                        com.billbull.backend.financials.generalledger.GlAccountBalance bal =
                                glBalanceRepository.findByAccountCodeAndFiscalPeriodIdAndBranchId(code, periodId, branchId)
                                        .orElseGet(() -> {
                                                com.billbull.backend.financials.generalledger.GlAccountBalance b
                                                        = new com.billbull.backend.financials.generalledger.GlAccountBalance();
                                                b.setAccountCode(code);
                                                b.setFiscalPeriodId(periodId);
                                                b.setBranchId(branchId);
                                                return b;
                                        });

                        bal.setDebitTotal(nvl(bal.getDebitTotal()).add(dr));
                        bal.setCreditTotal(nvl(bal.getCreditTotal()).add(cr));
                        bal.setClosingBalance(bal.getDebitTotal().subtract(bal.getCreditTotal()));
                        glBalanceRepository.save(bal);
                }
        }

        private void notifyPosted(JournalEntry entry) {
                log.info("[PostingEngine] Posted {} (ref='{}', {} lines).",
                                entry.getEntryNumber(), entry.getReference(), entry.getLines().size());
        }

        /** Null-safe BigDecimal — returns ZERO when source is null. */
        private static BigDecimal nvl(BigDecimal value) {
                return value != null ? value : BigDecimal.ZERO;
        }

        private boolean isInterBranchTransfer(StockTransfer transfer) {
                if (transfer == null || transfer.getFromWarehouse() == null || transfer.getToWarehouse() == null) {
                        return false;
                }

                if (transfer.getFromWarehouse().getBranch() == null || transfer.getToWarehouse().getBranch() == null) {
                        return false;
                }

                return !java.util.Objects.equals(
                                transfer.getFromWarehouse().getBranch().getId(),
                                transfer.getToWarehouse().getBranch().getId());
        }

        private String resolveWarehouseCostCenter(Warehouse warehouse) {
                if (warehouse == null) {
                        return "Unassigned";
                }
                if (warehouse.getBranch() == null) {
                        return warehouse.getName() != null ? warehouse.getName() : "Unassigned";
                }

                String branchCode = warehouse.getBranch().getCode();
                String branchName = warehouse.getBranch().getName();
                if (branchCode != null && !branchCode.isBlank()) {
                        return branchName != null && !branchName.isBlank()
                                        ? branchCode + " - " + branchName
                                        : branchCode;
                }
                return branchName != null && !branchName.isBlank() ? branchName : warehouse.getName();
        }

        private String resolveTransitCostCenter(StockTransfer transfer) {
                return "IN_TRANSIT: "
                                + resolveWarehouseCostCenter(transfer.getFromWarehouse())
                                + " -> "
                                + resolveWarehouseCostCenter(transfer.getToWarehouse());
        }

        private AccountSelection resolveIncomingPaymentAccount(String paymentMode) {
                String mode = normalizePaymentMode(paymentMode);
                return switch (mode) {
                        case "CASH"                    -> new AccountSelection("Cash",              ACC_CASH);
                        case "CARD", "CREDIT_CARD"     -> new AccountSelection("Merchant Clearing", ACC_MERCHANT_CLEARING);
                        default                        -> new AccountSelection("Bank",              ACC_BANK);
                };
        }

        private AccountSelection resolveOutgoingPaymentAccount(String paymentMode) {
                String mode = normalizePaymentMode(paymentMode);
                return switch (mode) {
                        case "CASH"    -> new AccountSelection("Cash",  ACC_CASH);
                        case "CHEQUE"  -> new AccountSelection("Bank",  ACC_BANK); // Cheque clears via bank
                        case "CARD"    -> new AccountSelection("Bank",  ACC_BANK); // Card payment debits bank
                        default        -> new AccountSelection("Bank",  ACC_BANK);
                };
        }

        private String normalizePaymentMode(String paymentMode) {
                if (paymentMode == null) return "";
                return paymentMode.trim()
                                .toUpperCase(java.util.Locale.ROOT)
                                .replace(' ', '_')
                                .replace('-', '_');
        }

        private static final class AccountSelection {
                private final String name;
                private final String code;

                private AccountSelection(String name, String code) {
                        this.name = name;
                        this.code = code;
                }
        }
}
