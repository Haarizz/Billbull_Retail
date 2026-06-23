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

        // ── BillBull Standard COA codes (PDF key account codes table) ─────────
        public static final String ACC_CASH                = "1001";  // Cash in Hand
        public static final String ACC_BANK                = "1010";  // Bank Account (Main)
        public static final String ACC_BANK_COLLECTION     = "1011";  // Bank Account (Collection)
        public static final String ACC_PETTY_CASH          = "1012";  // Petty Cash
        public static final String ACC_MERCHANT_CLEARING   = "1013";  // Merchant Clearing
        public static final String ACC_ACCOUNTS_RECEIVABLE = "1100";  // Accounts Receivable Control
        public static final String ACC_CUC                 = "1101";  // AR – Post-Dated Cheques (Cheques Under Collection)
        public static final String ACC_VENDOR_ADVANCES     = "1105";  // Vendor Advances Paid
        public static final String ACC_SALARY_ADVANCES     = "1106";  // Salary Advances – Employees
        public static final String ACC_INVENTORY           = "1200";  // Inventory – Raw / Retail
        public static final String ACC_VAT_INPUT           = "1310";  // VAT Input Tax
        public static final String ACC_ACCOUNTS_PAYABLE    = "2001";  // Accounts Payable Control
        public static final String ACC_GRN_CLEARING        = "2002";  // GRN Clearing
        public static final String ACC_CUSTOMER_ADVANCE    = "2060";  // Customer Advances Received
        public static final String ACC_DEFERRED_REVENUE    = "2051";  // Deferred Revenue
        public static final String ACC_VAT_OUTPUT          = "2100";  // VAT Output Tax
        public static final String ACC_VAT_PAYABLE         = "2101";  // VAT Payable (Net) — FTA settlement account
        public static final String ACC_SALARY_PAYABLE      = "2200";  // Salary Payable
        public static final String ACC_OTHER_DEDUCTIONS    = "2201";  // Other Deductions Payable
        public static final String ACC_SALES_REVENUE       = "4001";  // Sales Revenue
        public static final String ACC_SALES_RETURNS       = "4002";  // Sales Returns
        public static final String ACC_TRADE_DISC_GIVEN    = "4003";  // Trade Discounts Given (contra-revenue)
        public static final String ACC_DELIVERY_INCOME     = "4004";  // Delivery Income
        public static final String ACC_DISCOUNT_RECEIVED   = "7001";  // Discount Received (Purchase)
        public static final String ACC_INTEREST_INCOME     = "7002";  // Interest Income
        public static final String ACC_COGS                = "5001";  // Purchase / COGS
        public static final String ACC_EXPENSE_GENERAL     = "6099";  // General Expense
        public static final String ACC_ROUNDING            = "5999";  // Rounding Adjustment
        public static final String ACC_DISCOUNT_ALLOWED    = "6050";  // Discount Allowed (Sales)
        public static final String ACC_SALARY_EXPENSE      = "6010";  // Salary Expense
        public static final String ACC_BANK_CHARGES        = "7501";  // Bank Charges
        public static final String ACC_INVENTORY_WRITEOFF  = "7502";  // Inventory Write-off / Shrinkage

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
        private final com.billbull.backend.financials.currency.CurrencyService currencyService;
        private final com.billbull.backend.settings.outlet.OutletRepository outletRepository;

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
                        com.billbull.backend.sales.settings.SalesSettingsService salesSettingsService,
                        com.billbull.backend.financials.currency.CurrencyService currencyService,
                        com.billbull.backend.settings.outlet.OutletRepository outletRepository) {
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
                this.currencyService         = currencyService;
                this.outletRepository        = outletRepository;
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
        private static final String TX_VAT_SETTLEMENT   = "VATS";  // VAT return settlement
        private static final String TX_CONTRA           = "CONT";  // contra voucher (cash↔bank)

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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                JournalEntry entry = createBaseEntry(invoice.getInvoiceDate(), ref,
                                "Purchase Invoice " + ref, TX_PURCHASE_INVOICE, invoice.getBranchEntity());

                BigDecimal taxTotal   = nvl(invoice.getTaxTotal());
                BigDecimal landedCost = nvl(invoice.getLandedCost());
                BigDecimal grandTotal = nvl(invoice.getGrandTotal());

                boolean isAgainstGrn = "AGAINST_GRN".equalsIgnoreCase(invoice.getSourceType())
                                && invoice.getGrnId() != null;

                if (isAgainstGrn) {
                        // GRN value = what was accrued at receipt time (GRN grandTotal).
                        // piNetGoods = vendor goods charge excluding VAT and landed costs.
                        // PPV = difference between piNetGoods and GRN accrual (goods-only variance).
                        // Landed cost is capitalised separately to Inventory; must not inflate piNet
                        // used for PPV or the journal will be out of balance by the landed cost amount.
                        BigDecimal grnValue = BigDecimal.ZERO;
                        com.billbull.backend.purchase.grn.GrnEntity grn =
                                        grnRepository.findById(invoice.getGrnId()).orElse(null);
                        if (grn != null && grn.getGrandTotal() != null) {
                                grnValue = grn.getGrandTotal();
                        }
                        BigDecimal piNetGoods = grandTotal.subtract(taxTotal).subtract(landedCost);
                        BigDecimal ppv        = piNetGoods.subtract(grnValue);

                        BigDecimal grnClearingAmt = grnValue.max(BigDecimal.ZERO);

                        addLine(entry, "GRN Clearing", ACC_GRN_CLEARING,
                                        "Clear GRN Liability - " + ref,
                                        grnClearingAmt, BigDecimal.ZERO);

                        // PPV: positive → invoice higher than GRN (extra cost); negative → invoice lower (gain)
                        if (ppv.abs().compareTo(new BigDecimal("0.005")) > 0) {
                                if (ppv.signum() > 0) {
                                        addLine(entry, "Purchase Price Variance", "5003",
                                                        "PPV - " + ref, ppv, BigDecimal.ZERO);
                                } else {
                                        addLine(entry, "Purchase Price Variance", "5003",
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
         * Cr Deferred Revenue (2107)    [subTotal - billDiscountAmount]
         * Cr VAT Output (2102)          [taxTotal]  (if > 0)
         *
         * Deferred Revenue is posted net of footer/bill discount so it exactly matches
         * the sum of item netAmounts that DeliveryNoteService recognises into Sales Revenue.
         * Revenue is recognized only upon physical delivery.
         */
        @Transactional
        public JournalEntry createJournalFromInvoicePosting(SalesInvoice invoice) {
                String ref = invoice.getInvoiceNumber();
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                // Credit-limit guard: only enforce when the policy is BLOCK; NO_IMPACT and
                // WARNING both allow posting (WARNING UX is handled in SalesInvoiceService).
                com.billbull.backend.sales.settings.CreditLimitPolicy creditPolicy =
                                salesSettingsService.getSettings().getCreditLimitPolicy();
                if (creditPolicy == com.billbull.backend.sales.settings.CreditLimitPolicy.BLOCK) {
                        customerCreditService.assertWithinLimit(
                                        invoice.getCustomerCode(),
                                        nvl(invoice.getInvoiceTotal()));
                }

                JournalEntry entry = createBaseEntry(invoice.getInvoiceDate(), ref,
                                "Sales Invoice " + ref, TX_SALES_INVOICE, invoice.getBranchEntity());

                // Deferred Revenue is posted net of footer/bill discount so it matches the
                // item netAmounts that DeliveryNoteService will recognise into Sales Revenue.
                // Trade discounts reduce the transaction price (IFRS 15 §47) — no separate
                // Discount Allowed account is needed; the revenue is simply measured net.
                BigDecimal billDiscAmt = nvl(invoice.getBillDiscountAmount());
                BigDecimal subTotalBD = nvl(invoice.getSubTotal());
                BigDecimal deferredRevenue = subTotalBD.subtract(billDiscAmt);

                // For POS cash sales, debit Cash directly instead of AR (PDF §05 / GAP-002).
                // Card POS goes through Merchant Clearing (ACC_MERCHANT_CLEARING).
                // All other flows (credit sales, workflow-driven) use AR.
                String debitAccount;
                String debitAccountName;
                String payMode = invoice.getPaymentMode() != null
                                ? invoice.getPaymentMode().trim().toUpperCase() : "";
                com.billbull.backend.sales.invoice.SalesType salesType = invoice.getSalesType();
                boolean isPosCard = "CARD".equals(payMode) || "CREDIT_CARD".equals(payMode);
                boolean isPosCash = "CASH".equals(payMode)
                                || salesType == com.billbull.backend.sales.invoice.SalesType.POS_SALE;

                if (isPosCash) {
                        debitAccount = ACC_CASH;
                        debitAccountName = "Cash";
                } else if (isPosCard) {
                        debitAccount = ACC_MERCHANT_CLEARING;
                        debitAccountName = "Merchant Clearing";
                } else {
                        debitAccount = ACC_ACCOUNTS_RECEIVABLE;
                        debitAccountName = "Accounts Receivable";
                }

                addLine(entry, debitAccountName, debitAccount,
                                "Sales - " + ref,
                                nvl(invoice.getInvoiceTotal()), BigDecimal.ZERO);
                addLine(entry, "Deferred Revenue", ACC_DEFERRED_REVENUE,
                                "Deferred - " + ref,
                                BigDecimal.ZERO, deferredRevenue);
                if (invoice.getTaxTotal() != null && invoice.getTaxTotal().signum() > 0) {
                        addLine(entry, "VAT Output", ACC_VAT_OUTPUT, "VAT - " + ref,
                                        BigDecimal.ZERO, nvl(invoice.getTaxTotal()));
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
        // FAST SALE — single combined entry (F-13 / PDF §05 / GAP-001)
        // =========================================================

        /**
         * Posts a single combined journal for a Fast Sale (POS FAST_SALE mode).
         *
         * Instead of the normal two-step sequence:
         *   Invoice:   Dr Cash / Cr Deferred Revenue / Cr VAT Output
         *   DN:        Dr Deferred Revenue / Cr Sales Revenue  +  Dr COGS / Cr Inventory
         *
         * This collapses into one balanced entry:
         *   Dr Cash / Merchant Clearing / AR  [invoiceTotal]
         *   Cr Sales Revenue (4101)            [netRevenue]
         *   Cr VAT Output (2102)               [taxTotal]   (if > 0)
         *   Cr Delivery Income (4103)          [deliveryCharge] (if > 0)
         *   Rounding line                      (if roundOff ≠ 0)
         *   Dr COGS (5101)                     [cogs]       (if > 0)
         *   Cr Inventory (1120)                [cogs]       (if > 0)
         *
         * Idempotent: reference = "FS-{invoiceNumber}".
         *
         * @param invoice   the FAST_SALE invoice (provides totals + payment mode)
         * @param cogs      total COGS computed by DeliveryNoteService at delivery
         * @param branch    branch dimension
         */
        @Transactional
        public JournalEntry createJournalFromFastSaleDelivered(
                        SalesInvoice invoice,
                        BigDecimal cogs,
                        com.billbull.backend.settings.branch.Branch branch) {

                String ref = "FS-" + invoice.getInvoiceNumber();
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                LocalDate date = invoice.getInvoiceDate() != null ? invoice.getInvoiceDate() : LocalDate.now();
                JournalEntry entry = createBaseEntry(date, ref,
                                "Fast Sale - " + invoice.getInvoiceNumber(), TX_SALES_INVOICE, branch);

                // Resolve debit account from payment mode (same logic as createJournalFromInvoicePosting)
                String payMode = invoice.getPaymentMode() != null
                                ? invoice.getPaymentMode().trim().toUpperCase() : "";
                com.billbull.backend.sales.invoice.SalesType salesType = invoice.getSalesType();
                boolean isPosCard = "CARD".equals(payMode) || "CREDIT_CARD".equals(payMode);
                boolean isPosCash = "CASH".equals(payMode)
                                || salesType == com.billbull.backend.sales.invoice.SalesType.POS_SALE;

                String debitAccount     = isPosCard ? ACC_MERCHANT_CLEARING
                                        : isPosCash ? ACC_CASH
                                        : ACC_ACCOUNTS_RECEIVABLE;
                String debitAccountName = isPosCard ? "Merchant Clearing"
                                        : isPosCash ? "Cash"
                                        : "Accounts Receivable";

                BigDecimal invoiceTotal = nvl(invoice.getInvoiceTotal());
                BigDecimal taxTotal     = nvl(invoice.getTaxTotal());
                BigDecimal delivery     = nvl(invoice.getDeliveryCharge());
                BigDecimal billDisc     = nvl(invoice.getBillDiscountAmount());
                BigDecimal subTotal     = nvl(invoice.getSubTotal());
                BigDecimal netRevenue   = subTotal.subtract(billDisc);

                // Debit: cash / card / AR
                addLine(entry, debitAccountName, debitAccount,
                                "Fast Sale - " + ref, invoiceTotal, BigDecimal.ZERO);

                // Credits: revenue, VAT, delivery, rounding
                addLine(entry, "Sales Revenue", ACC_SALES_REVENUE,
                                "Revenue - " + ref, BigDecimal.ZERO, netRevenue);
                if (taxTotal.compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "VAT Output", ACC_VAT_OUTPUT,
                                        "VAT - " + ref, BigDecimal.ZERO, taxTotal);
                }
                if (delivery.signum() != 0) {
                        addLine(entry, "Delivery Income", ACC_DELIVERY_INCOME,
                                        "Delivery - " + ref, BigDecimal.ZERO, delivery);
                }
                addRoundOffLine(entry, nz(invoice.getRoundOff()), "Round off - " + ref, false);

                // COGS + Inventory (if stock items present)
                BigDecimal cogsAmt = cogs != null ? cogs : BigDecimal.ZERO;
                if (cogsAmt.compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "COGS", ACC_COGS,
                                        "COGS - " + ref, cogsAmt, BigDecimal.ZERO);
                        addLine(entry, "Inventory", ACC_INVENTORY,
                                        "Stock reduction - " + ref, BigDecimal.ZERO, cogsAmt);
                }

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
                createJournalFromDeliveryNoteDelivered(referenceKey, date, narration, recognizedRevenue, cogs, null);
        }

        @Transactional
        public void createJournalFromDeliveryNoteDelivered(
                        String referenceKey,
                        LocalDate date,
                        String narration,
                        BigDecimal recognizedRevenue,
                        BigDecimal cogs,
                        com.billbull.backend.settings.branch.Branch branch) {

                if (journalEntryRepository.existsByReference(referenceKey)) {
                        log.warn("[PostingEngine] Duplicate DN posting blocked — reference '{}' already exists. " +
                                         "No journal created.", referenceKey);
                        return;
                }

                if (recognizedRevenue != null && recognizedRevenue.compareTo(BigDecimal.ZERO) > 0) {
                        JournalEntry revenueEntry = createBaseEntry(date, referenceKey,
                                        "Revenue recognition - " + narration, TX_DELIVERY_NOTE, branch);
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
                                        "COGS - " + narration, TX_DELIVERY_NOTE, branch);
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
         * Reverses the invoice posting journal when an invoice is cancelled.
         *
         * For FAST_SALE (already delivered, FS- journal exists): reverses the combined entry.
         *   Dr Sales Revenue (4101) / Dr VAT Output / Dr COGS / Cr Inventory / Cr Cash/AR
         *
         * For normal invoices cancelled before delivery (Deferred Revenue outstanding):
         *   Dr Deferred Revenue (2107) / Dr VAT Output / Cr AR
         *
         * For normal invoices cancelled after delivery (revenue already recognized):
         *   handled via reverseJournalFromDeliveryNoteCancellation on the DN side.
         */
        @Transactional
        public void reverseJournalFromInvoiceCancellation(SalesInvoice invoice) {
                String refKey = "CANCEL-" + invoice.getInvoiceNumber();
                if (findDuplicate(refKey) != null) return;

                BigDecimal subTotal     = nz(invoice.getSubTotal());
                BigDecimal taxTotal     = nz(invoice.getTaxTotal());
                BigDecimal invoiceTotal = nz(invoice.getInvoiceTotal());
                BigDecimal delivery     = nz(invoice.getDeliveryCharge());
                BigDecimal billDisc     = nz(invoice.getBillDiscountAmount());
                BigDecimal netRevenue   = subTotal.subtract(billDisc);

                JournalEntry entry = createBaseEntry(LocalDate.now(), refKey,
                                "Cancellation reversal - " + invoice.getInvoiceNumber(),
                                TX_MANUAL_JOURNAL, invoice.getBranchEntity());

                boolean fastSalePosted = invoice.isFastSale()
                                && journalEntryRepository.existsByReference("FS-" + invoice.getInvoiceNumber());

                if (fastSalePosted) {
                        // Reverse the combined Fast Sale entry
                        String payMode   = invoice.getPaymentMode() != null
                                        ? invoice.getPaymentMode().trim().toUpperCase() : "";
                        com.billbull.backend.sales.invoice.SalesType salesType = invoice.getSalesType();
                        boolean isPosCard = "CARD".equals(payMode) || "CREDIT_CARD".equals(payMode);
                        boolean isPosCash = "CASH".equals(payMode)
                                        || salesType == com.billbull.backend.sales.invoice.SalesType.POS_SALE;
                        String creditAccount = isPosCard ? ACC_MERCHANT_CLEARING
                                        : isPosCash ? ACC_CASH : ACC_ACCOUNTS_RECEIVABLE;
                        String creditName    = isPosCard ? "Merchant Clearing"
                                        : isPosCash ? "Cash" : "Accounts Receivable";

                        addLine(entry, "Sales Revenue", ACC_SALES_REVENUE,
                                        "Cancel revenue - " + invoice.getInvoiceNumber(),
                                        netRevenue, BigDecimal.ZERO);
                        if (taxTotal.compareTo(BigDecimal.ZERO) > 0) {
                                addLine(entry, "VAT Output", ACC_VAT_OUTPUT,
                                                "Cancel VAT - " + invoice.getInvoiceNumber(),
                                                taxTotal, BigDecimal.ZERO);
                        }
                        if (delivery.signum() != 0) {
                                addLine(entry, "Delivery Income", ACC_DELIVERY_INCOME,
                                                "Cancel delivery - " + invoice.getInvoiceNumber(),
                                                delivery, BigDecimal.ZERO);
                        }
                        addRoundOffLine(entry, nz(invoice.getRoundOff()),
                                        "Cancel round off - " + invoice.getInvoiceNumber(), true);
                        // COGS reversal is handled via the DN cancellation path (stock is restored there)
                        addLine(entry, creditName, creditAccount,
                                        "Cancel settlement - " + invoice.getInvoiceNumber(),
                                        BigDecimal.ZERO, invoiceTotal);
                } else {
                        // Normal path: invoice was posted via Deferred Revenue
                        if (netRevenue.compareTo(BigDecimal.ZERO) > 0) {
                                addLine(entry, "Deferred Revenue", ACC_DEFERRED_REVENUE,
                                                "Cancel deferred - " + invoice.getInvoiceNumber(),
                                                netRevenue, BigDecimal.ZERO);
                        }
                        if (taxTotal.compareTo(BigDecimal.ZERO) > 0) {
                                addLine(entry, "VAT Output", ACC_VAT_OUTPUT,
                                                "Cancel VAT - " + invoice.getInvoiceNumber(),
                                                taxTotal, BigDecimal.ZERO);
                        }
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
                }

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
                if (findDuplicate(refKey) != null) return;

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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                // Use subtotal (ex-VAT) for inventory; separate VAT Input line if tax is present.
                // grandTotal includes VAT — using it would overstate inventory (PDF §09 / GAP-006).
                BigDecimal subAmt  = grn.getSubtotal()   != null ? grn.getSubtotal()   : BigDecimal.ZERO;
                BigDecimal taxAmt  = grn.getTaxAmount()  != null ? grn.getTaxAmount()  : BigDecimal.ZERO;
                BigDecimal amount  = subAmt.add(taxAmt); // total cleared = grandTotal equivalent

                if (subAmt.compareTo(BigDecimal.ZERO) == 0 && taxAmt.compareTo(BigDecimal.ZERO) == 0) {
                        log.warn("[PostingEngine] GRN {} has zero/null amount — no journal created.", ref);
                        return null;
                }

                JournalEntry entry = createBaseEntry(grn.getGrnDate(), ref, "GRN Receipt " + ref, TX_GRN,
                                grn.getBranchEntity());
                addLine(entry, "Inventory",    ACC_INVENTORY,    "GRN Receipt - "  + ref, subAmt, BigDecimal.ZERO);
                if (taxAmt.compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "VAT Input", ACC_VAT_INPUT, "GRN VAT Input - " + ref, taxAmt, BigDecimal.ZERO);
                }
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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

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
                                "Expense - " + expense.getCategory(), TX_EXPENSE, expense.getBranch());
                addLine(entry, expenseAccountName, expenseAccountCode,
                                expense.getNotes() != null ? expense.getNotes() : "",
                                expense.getAmount(), BigDecimal.ZERO);
                if (expense.getTaxAmount() != null && expense.getTaxAmount().signum() > 0) {
                        addLine(entry, "VAT Input", ACC_VAT_INPUT, "VAT on expense",
                                        expense.getTaxAmount(), BigDecimal.ZERO);
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
                                BigDecimal.ZERO, expense.getTotal());
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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                AccountSelection settlementAccount = resolveOutgoingPaymentAccount(voucher);
                JournalEntry entry = createBaseEntry(voucher.getPaymentDate(), ref,
                                "Payment to " + vendorName, TX_PAYMENT_VOUCHER, voucher.getBranch());

                BigDecimal paid     = voucher.getAmount() != null ? voucher.getAmount() : BigDecimal.ZERO;
                BigDecimal discount = voucher.getDiscountAmount() != null
                                && voucher.getDiscountAmount().compareTo(BigDecimal.ZERO) > 0
                                        ? voucher.getDiscountAmount() : BigDecimal.ZERO;
                BigDecimal totalDebit = paid.add(discount);
                boolean vendorAdvance = voucher.getLpoId() != null && voucher.getInvoiceId() == null;
                String debitAccountName = vendorAdvance ? "Vendor Advances Paid" : "Accounts Payable";
                String debitAccountCode = vendorAdvance ? ACC_VENDOR_ADVANCES : ACC_ACCOUNTS_PAYABLE;

                addLine(entry, debitAccountName, debitAccountCode,
                                "Payment - " + ref, totalDebit, BigDecimal.ZERO);
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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                AccountSelection settlementAccount = resolveIncomingPaymentAccount(receipt.getPaymentMode());
                JournalEntry entry = createBaseEntry(receipt.getDate(), ref,
                                "Receipt from " + receipt.getMemberName(), TX_RECEIPT_VOUCHER,
                                receipt.getBranchEntity());

                BigDecimal received = receipt.getAmount() != null ? receipt.getAmount() : BigDecimal.ZERO;
                BigDecimal discount = receipt.getDiscountAmount() != null
                                && receipt.getDiscountAmount().compareTo(BigDecimal.ZERO) > 0
                                        ? receipt.getDiscountAmount() : BigDecimal.ZERO;
                BigDecimal totalAR  = received.add(discount); // full invoice amount cleared

                addLine(entry, settlementAccount.name, settlementAccount.code,
                                "Receipt - " + ref, received, BigDecimal.ZERO);

                // Settlement discount (PDF §7 / Phase 4.3).
                // F-11: UAE FTA requires VAT Output reduction when consideration is reduced.
                // VAT component of discount = discount * 5/105 (tax-inclusive gross discount).
                // Net discount = discount - vatOnDiscount.
                // Entry: Dr Discount Allowed (net) + Dr VAT Output (reduce liability) / both balanced by Cr AR.
                if (discount.compareTo(BigDecimal.ZERO) > 0) {
                        if (receipt.getPurpose() != com.billbull.backend.financials.receiptvoucher.ReceiptPurpose.ADVANCE_RECEIVED) {
                                BigDecimal vatOnDiscount = discount
                                                .multiply(new BigDecimal("5"))
                                                .divide(new BigDecimal("105"), 2, java.math.RoundingMode.HALF_UP);
                                BigDecimal netDiscount = discount.subtract(vatOnDiscount);
                                if (netDiscount.compareTo(BigDecimal.ZERO) > 0) {
                                        addLine(entry, "Discount Allowed", ACC_DISCOUNT_ALLOWED,
                                                        "Early payment discount (net) - " + ref, netDiscount, BigDecimal.ZERO);
                                }
                                if (vatOnDiscount.compareTo(BigDecimal.ZERO) > 0) {
                                        // Debit VAT Output to reduce the output tax liability
                                        addLine(entry, "VAT Output (Discount Adj)", ACC_VAT_OUTPUT,
                                                        "VAT adjustment on settlement discount - " + ref,
                                                        vatOnDiscount, BigDecimal.ZERO);
                                }
                        } else {
                                // Advance receipts: no VAT adjustment, full discount to Discount Allowed
                                addLine(entry, "Discount Allowed", ACC_DISCOUNT_ALLOWED,
                                                "Early payment discount - " + ref, discount, BigDecimal.ZERO);
                        }
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

        /**
         * Reverses the original GL posting for a receipt voucher and re-posts it
         * with the updated amount. Called when a completed receipt is edited.
         *
         * Reversal entry ref: VOID-{voucherId}
         * New entry ref:      {voucherId} (original ref is freed by voiding the old entry's reference)
         */
        /**
         * Posts a corrective adjustment when a completed receipt's amount is edited.
         *
         * Rather than voiding and reposting (which compounds across multiple edits),
         * this computes the net amount already in the GL for this RV (original + all
         * prior adjustments) and posts a single delta entry to bring the balance to
         * the new amount.
         *
         * Corrective entry ref: ADJ-{voucherId}-{n} where n increments per edit.
         */
        @Transactional
        public void reverseAndRepostReceiptVoucher(ReceiptVoucher receipt, BigDecimal previousAmount) {
                String originalRef = receipt.getVoucherId();
                BigDecimal newAmount = receipt.getAmount() != null ? receipt.getAmount() : BigDecimal.ZERO;

                // Compute the net cash/bank debit already posted for this RV across
                // the original entry + all prior ADJ entries.
                AccountSelection settlementAccount = resolveIncomingPaymentAccount(receipt.getPaymentMode());
                boolean isAdvance = receipt.getPurpose() ==
                                com.billbull.backend.financials.receiptvoucher.ReceiptPurpose.ADVANCE_RECEIVED;
                String creditAccount = isAdvance ? ACC_CUSTOMER_ADVANCE : ACC_ACCOUNTS_RECEIVABLE;
                String creditName    = isAdvance ? "Customer Advance"   : "Accounts Receivable";

                // Sum net debit on the settlement account across the original entry,
                // legacy VOID-*/REPOST-* entries (from the old reversal scheme), and
                // any ADJ-* entries created by this scheme.
                BigDecimal alreadyPosted = BigDecimal.ZERO;
                for (String ref : new String[]{ originalRef, "VOID-" + originalRef, "REPOST-" + originalRef }) {
                        java.util.Optional<JournalEntry> e = journalEntryRepository.findByReference(ref);
                        if (e.isPresent()) alreadyPosted = alreadyPosted.add(netDebitForAccount(e.get(), settlementAccount.code));
                }
                for (int i = 1; i <= 99; i++) {
                        String adjRef = "ADJ-" + originalRef + "-" + i;
                        java.util.Optional<JournalEntry> adjEntry = journalEntryRepository.findByReference(adjRef);
                        if (adjEntry.isEmpty()) break;
                        alreadyPosted = alreadyPosted.add(netDebitForAccount(adjEntry.get(), settlementAccount.code));
                }

                BigDecimal delta = newAmount.subtract(alreadyPosted).setScale(2, java.math.RoundingMode.HALF_UP);
                if (delta.compareTo(BigDecimal.ZERO) == 0) return;

                // Find the next unused ADJ-{n} sequence number
                String adjRef = null;
                for (int i = 1; i <= 99; i++) {
                        String candidate = "ADJ-" + originalRef + "-" + i;
                        if (!journalEntryRepository.existsByReference(candidate)) {
                                adjRef = candidate;
                                break;
                        }
                }
                if (adjRef == null) {
                        log.warn("[PostingEngine] Cannot create adjustment for {} — ADJ sequence exhausted.", originalRef);
                        return;
                }

                JournalEntry adj = createBaseEntry(receipt.getDate(), adjRef,
                                "Amount adjustment - " + originalRef, TX_RECEIPT_VOUCHER,
                                receipt.getBranchEntity());

                if (delta.compareTo(BigDecimal.ZERO) > 0) {
                        // Amount increased — Dr settlement, Cr liability
                        addLine(adj, settlementAccount.name, settlementAccount.code,
                                        "Adjustment - " + originalRef, delta, BigDecimal.ZERO);
                        addLine(adj, creditName, creditAccount,
                                        "Adjustment - " + originalRef, BigDecimal.ZERO, delta);
                } else {
                        // Amount decreased — Cr settlement, Dr liability
                        BigDecimal abs = delta.abs();
                        addLine(adj, settlementAccount.name, settlementAccount.code,
                                        "Adjustment - " + originalRef, BigDecimal.ZERO, abs);
                        addLine(adj, creditName, creditAccount,
                                        "Adjustment - " + originalRef, abs, BigDecimal.ZERO);
                }
                post(adj);
        }

        /** Sum of (debit - credit) for a given account code across all lines in an entry. */
        private BigDecimal netDebitForAccount(JournalEntry entry, String accountCode) {
                return entry.getLines().stream()
                                .filter(l -> accountCode.equals(l.getAccountCode()))
                                .map(l -> {
                                        BigDecimal d = l.getDebit()  != null ? l.getDebit()  : BigDecimal.ZERO;
                                        BigDecimal c = l.getCredit() != null ? l.getCredit() : BigDecimal.ZERO;
                                        return d.subtract(c);
                                })
                                .reduce(BigDecimal.ZERO, BigDecimal::add);
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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                JournalEntry entry = createBaseEntry(salesReturn.getReturnDate(), ref,
                                "Sales Return " + ref, TX_CREDIT_NOTE, salesReturn.getBranch());

                BigDecimal subTotal   = nz(salesReturn.getSubTotal());
                BigDecimal taxAmount  = nz(salesReturn.getTaxAmount());
                BigDecimal totalAmount = nz(salesReturn.getTotalAmount());

                // Debit the correct revenue account
                String revenueAccount     = revenueWasRecognized ? ACC_SALES_REVENUE     : ACC_DEFERRED_REVENUE;
                String revenueAccountName = revenueWasRecognized ? "Sales Revenue"        : "Deferred Revenue";
                addLine(entry, revenueAccountName, revenueAccount, "Return Revenue Reversal", subTotal, BigDecimal.ZERO);

                if (taxAmount.compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "VAT Output", ACC_VAT_OUTPUT, "VAT Refund", taxAmount, BigDecimal.ZERO);
                }
                addLine(entry, "Accounts Receivable", ACC_ACCOUNTS_RECEIVABLE,
                                "Return Credit Note", BigDecimal.ZERO, totalAmount);

                // COGS reversal — cost is required; reject the return if unavailable to prevent BS/PL imbalance.
                if (costOfGoodsReturned == null || costOfGoodsReturned.compareTo(BigDecimal.ZERO) <= 0) {
                        throw new PostingException(PostingErrorCode.UNBALANCED_ENTRY,
                                "Sales Return " + ref + ": cannot post without product cost — COGS and Inventory "
                                + "would be left unreconciled. Resolve the product WAC before approving this return.");
                }
                JournalEntry invEntry = createBaseEntry(salesReturn.getReturnDate(),
                                ref + "-INV",
                                "Stock return - " + ref, TX_CREDIT_NOTE, salesReturn.getBranch());
                addLine(invEntry, "Inventory", ACC_INVENTORY, "Inventory increase", costOfGoodsReturned, BigDecimal.ZERO);
                addLine(invEntry, "COGS",      ACC_COGS,      "COGS reversal",      BigDecimal.ZERO, costOfGoodsReturned);
                post(invEntry);

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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                JournalEntry entry = createBaseEntry(settlement.getSettlementDate(), ref,
                                "Card Settlement", TX_CARD_SETTLEMENT);
                addLine(entry, "Bank",              ACC_BANK,               "Settled funds",          settlement.getNetAmount(),   BigDecimal.ZERO);
                addLine(entry, "Merchant Clearing", ACC_MERCHANT_CLEARING,  "Clear merchant suspense", BigDecimal.ZERO,            settlement.getGrossAmount());
                if (settlement.getFeeAmount() != null && settlement.getFeeAmount().compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "Bank Charges", ACC_BANK_CHARGES, "Merchant fees", settlement.getFeeAmount(), BigDecimal.ZERO);
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
                        if (findDuplicate(ref) == null) {
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
                        if (findDuplicate(ref) == null) {
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
                        if (journalEntryRepository.existsByReference(clearRef) && findDuplicate(bounceRef + "-CLEAR") == null) {
                                JournalEntry rev = createBaseEntry(LocalDate.now(), bounceRef + "-CLEAR",
                                                "Reverse cleared PDC - " + pdc.getChequeNumber(), TX_RECEIPT_VOUCHER);
                                addLine(rev, "Cheques Under Collection", ACC_CUC,  "Reverse CUC",
                                                pdc.getAmount(), BigDecimal.ZERO);
                                addLine(rev, "Bank",                    ACC_BANK, "Reverse bank",
                                                BigDecimal.ZERO, pdc.getAmount());
                                post(rev);
                        }
                        // Reverse RECEIVED: re-open AR
                        if (findDuplicate(bounceRef) == null) {
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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }
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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }
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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                JournalEntry entry = createBaseEntry(postingDate != null ? postingDate : LocalDate.now(), ref,
                                "Inventory write-off: " + description, TX_MANUAL_JOURNAL);
                addLine(entry, "Inventory Write-off / Shrinkage", ACC_INVENTORY_WRITEOFF, "Write-off: " + description, cost, BigDecimal.ZERO);
                addLine(entry, "Inventory",           ACC_INVENTORY, "Inventory reduction: " + description, BigDecimal.ZERO, cost);
                return post(entry);
        }

        // =========================================================
        // PURCHASE RETURN / DEBIT NOTE (PDF §11 / GAP-007)
        // =========================================================

        /**
         * Posts the GL journal for an approved purchase return (Debit Note).
         *
         * Dr Accounts Payable (2101) [grandTotal]            — reduces vendor liability
         * Cr Inventory (1120)        [originalInventoryCost] — removes stock at original GRN receipt cost
         * Cr/Dr PPV (5110)           [difference]            — absorbs price variance vs original cost
         * Cr VAT Input (1130)        [taxTotal]              — reverses the input VAT claimed
         *
         * @param purchaseReturn       the approved purchase return entity
         * @param originalInventoryCost cost from the original GRN items; null = fall back to subTotal
         */
        @Transactional
        public JournalEntry createJournalFromPurchaseReturn(
                        com.billbull.backend.purchase.returns.PurchaseReturn purchaseReturn,
                        BigDecimal originalInventoryCost) {

                String ref = "DN-" + purchaseReturn.getDebitNoteNumber();
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                BigDecimal taxTotal   = purchaseReturn.getTaxTotal()   != null ? purchaseReturn.getTaxTotal()   : BigDecimal.ZERO;
                BigDecimal grandTotal = purchaseReturn.getGrandTotal() != null ? purchaseReturn.getGrandTotal() : BigDecimal.ZERO;
                BigDecimal subTotal   = purchaseReturn.getSubTotal()   != null ? purchaseReturn.getSubTotal()   : BigDecimal.ZERO;

                if (grandTotal.compareTo(BigDecimal.ZERO) <= 0) {
                        log.warn("[PostingEngine] Purchase Return {}: zero/null grandTotal — no journal created.", ref);
                        return null;
                }

                // PDF §11: inventory credit must use original GRN receipt cost, not re-negotiated return price.
                BigDecimal inventoryCost = (originalInventoryCost != null && originalInventoryCost.compareTo(BigDecimal.ZERO) > 0)
                        ? originalInventoryCost : subTotal;
                BigDecimal ppvVariance = subTotal.subtract(inventoryCost); // positive = debit PPV; negative = credit PPV

                JournalEntry entry = createBaseEntry(purchaseReturn.getReturnDate(), ref,
                                "Purchase Return (Debit Note) " + purchaseReturn.getDebitNoteNumber(),
                                TX_PURCHASE_INVOICE, purchaseReturn.getBranch());

                addLine(entry, "Accounts Payable - " + purchaseReturn.getVendorName(), ACC_ACCOUNTS_PAYABLE,
                                "AP reduction - " + ref, grandTotal, BigDecimal.ZERO);
                addLine(entry, "Inventory", ACC_INVENTORY,
                                "Inventory returned to vendor at GRN cost - " + ref, BigDecimal.ZERO, inventoryCost);
                // Absorb variance between return price and original GRN cost in PPV-Returns (5004)
                if (ppvVariance.abs().compareTo(new BigDecimal("0.005")) > 0) {
                        if (ppvVariance.compareTo(BigDecimal.ZERO) > 0) {
                                addLine(entry, "Purchase Price Variance", "5004",
                                        "Return price > GRN cost variance - " + ref, ppvVariance, BigDecimal.ZERO);
                        } else {
                                addLine(entry, "Purchase Price Variance", "5004",
                                        "Return price < GRN cost variance - " + ref, BigDecimal.ZERO, ppvVariance.negate());
                        }
                }
                if (taxTotal.compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "VAT Input", ACC_VAT_INPUT,
                                        "VAT Input reversal - " + ref, BigDecimal.ZERO, taxTotal);
                }

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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }
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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }
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
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }
                JournalEntry entry = createBaseEntry(LocalDate.now(), ref,
                                "Vendor advance refund - " + advance.getVendorName(), TX_VENDOR_ADVANCE);
                addLine(entry, "Bank",                 ACC_BANK,            "Advance refunded", advance.getAmount(), BigDecimal.ZERO);
                addLine(entry, "Vendor Advances Paid", ACC_VENDOR_ADVANCES, "Advance cleared",  BigDecimal.ZERO, advance.getAmount());
                return post(entry);
        }

        // =========================================================
        // VAT SETTLEMENT (PDF §07 / GAP-008)
        // =========================================================

        /**
         * Posts the VAT return settlement journal — nets VAT Output and VAT Input
         * into VAT Payable, ready for FTA payment.
         *
         * When Output > Input (VAT due):
         *   Dr VAT Output (2102) [outputTotal]
         *   Cr VAT Input  (1130) [inputTotal]
         *   Cr VAT Payable (2108) [outputTotal - inputTotal]
         *
         * When Input > Output (VAT refund claim):
         *   Dr VAT Output (2102)  [outputTotal]
         *   Dr VAT Payable (2108) [inputTotal - outputTotal]
         *   Cr VAT Input (1130)   [inputTotal]
         *
         * Idempotent: reference = "VATSETTL-{period}" (e.g. "VATSETTL-2025-Q1").
         *
         * @param outputVat   total VAT Output (2102) to clear for the period
         * @param inputVat    total VAT Input (1130) to clear for the period
         * @param period      period identifier used in the reference, e.g. "2025-Q1"
         * @param settlementDate  effective date of the VAT return filing
         * @param branch      branch posting this settlement
         */
        @Transactional
        public JournalEntry createJournalFromVatSettlement(
                        BigDecimal outputVat, BigDecimal inputVat,
                        String period, LocalDate settlementDate,
                        com.billbull.backend.settings.branch.Branch branch) {

                String ref = "VATSETTL-" + period;
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                BigDecimal output = outputVat != null ? outputVat.abs() : BigDecimal.ZERO;
                BigDecimal input  = inputVat  != null ? inputVat.abs()  : BigDecimal.ZERO;

                if (output.compareTo(BigDecimal.ZERO) == 0 && input.compareTo(BigDecimal.ZERO) == 0) {
                        log.warn("[PostingEngine] VAT settlement {}: both VAT amounts are zero — no journal created.", ref);
                        return null;
                }

                JournalEntry entry = createBaseEntry(settlementDate, ref,
                                "VAT Return Settlement - " + period, TX_VAT_SETTLEMENT, branch);

                // Clear VAT Output liability (Dr reduces the liability)
                addLine(entry, "VAT Output Tax", ACC_VAT_OUTPUT,
                                "Clear VAT Output for " + period, output, BigDecimal.ZERO);

                // Clear VAT Input asset (Cr reduces the asset)
                addLine(entry, "VAT Input Tax", ACC_VAT_INPUT,
                                "Clear VAT Input for " + period, BigDecimal.ZERO, input);

                BigDecimal netPayable = output.subtract(input);
                if (netPayable.compareTo(BigDecimal.ZERO) > 0) {
                        // Net VAT due to FTA
                        addLine(entry, "VAT Payable", ACC_VAT_PAYABLE,
                                        "Net VAT payable to FTA - " + period, BigDecimal.ZERO, netPayable);
                } else if (netPayable.compareTo(BigDecimal.ZERO) < 0) {
                        // Net VAT refund claim from FTA
                        addLine(entry, "VAT Payable (Refund Claim)", ACC_VAT_PAYABLE,
                                        "Net VAT refund claim from FTA - " + period, netPayable.abs(), BigDecimal.ZERO);
                }
                // If net is exactly zero the two lines already balance.

                return post(entry);
        }

        /**
         * Posts the FTA payment entry after the VAT Payable amount is settled.
         *
         * Dr VAT Payable (2108) [amount]
         * Cr Bank (1102)        [amount]
         *
         * Idempotent: reference = "VATPAY-{period}".
         */
        @Transactional
        public JournalEntry createJournalFromVatPayment(
                        BigDecimal amount, String period, LocalDate paymentDate,
                        com.billbull.backend.settings.branch.Branch branch) {

                String ref = "VATPAY-" + period;
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) return null;

                JournalEntry entry = createBaseEntry(paymentDate, ref,
                                "VAT Payment to FTA - " + period, TX_VAT_SETTLEMENT, branch);
                addLine(entry, "VAT Payable", ACC_VAT_PAYABLE,
                                "Clear VAT payable - " + period, amount, BigDecimal.ZERO);
                addLine(entry, "Bank", ACC_BANK,
                                "Bank payment for VAT - " + period, BigDecimal.ZERO, amount);
                return post(entry);
        }

        // =========================================================
        // CONTRA VOUCHER (PDF §14 / GAP-009)
        // =========================================================

        /**
         * Contra Voucher: transfer cash between Cash and Bank accounts.
         *
         * Cash Deposit (cash → bank):
         *   Dr Bank (1102) / Cr Cash (1101)
         *
         * Cash Withdrawal (bank → cash):
         *   Dr Cash (1101) / Cr Bank (1102)
         *
         * Idempotent: reference = "CONT-{contraNumber}".
         *
         * @param contraNumber  unique reference for this contra entry
         * @param amount        transfer amount (positive)
         * @param isDeposit     true = Cash→Bank (deposit), false = Bank→Cash (withdrawal)
         * @param date          transfer date
         * @param narration     description
         * @param branch        branch dimension
         */
        @Transactional
        public JournalEntry createJournalFromContraVoucher(
                        String contraNumber, BigDecimal amount, boolean isDeposit,
                        LocalDate date, String narration,
                        com.billbull.backend.settings.branch.Branch branch) {

                String ref = "CONT-" + contraNumber;
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) return null;

                JournalEntry entry = createBaseEntry(date, ref,
                                narration != null ? narration : (isDeposit ? "Cash Deposit" : "Cash Withdrawal"),
                                TX_CONTRA, branch);

                if (isDeposit) {
                        addLine(entry, "Bank",  ACC_BANK,       "Cash deposit to bank",  amount,          BigDecimal.ZERO);
                        addLine(entry, "Cash",  ACC_CASH,       "Cash withdrawn",         BigDecimal.ZERO, amount);
                } else {
                        addLine(entry, "Cash",  ACC_CASH,       "Cash from bank",         amount,          BigDecimal.ZERO);
                        addLine(entry, "Bank",  ACC_BANK,       "Bank withdrawal",        BigDecimal.ZERO, amount);
                }
                return post(entry);
        }

        // =========================================================
        // OPENING BALANCES (PDF §19 / GAP-015)
        // =========================================================

        /**
         * Posts opening balances as a proper double-entry GL journal so they are
         * visible in Trial Balance, Balance Sheet, and all ledger reports.
         *
         * Convention: debit-normal accounts (Assets, Expenses) are Dr with their opening
         * balance; credit-normal accounts (Liabilities, Equity, Income) are Cr.
         * The contra entry for the net of all opening balances goes to Retained Earnings
         * (account 3000) — or to the Owner's Equity account if the net is negative
         * (accumulated losses). This follows the standard "Opening Entry" model.
         *
         * Idempotent: posting for the same fiscal year is blocked if already done.
         *
         * @param requests  list of account code + balance type + amount
         * @param asOfDate  the opening balance date (first day of fiscal year)
         * @return the posted JournalEntry, or null if there was nothing to post
         */
        @Transactional
        public JournalEntry postOpeningBalances(
                        List<com.billbull.backend.financials.generalledger.OpeningBalanceRequest> requests,
                        LocalDate asOfDate) {

                if (requests == null || requests.isEmpty()) return null;

                String ref = "OB-" + asOfDate.getYear();
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                JournalEntry entry = createBaseEntry(asOfDate, ref,
                                "Opening Balances " + asOfDate.getYear(), TX_MANUAL_JOURNAL);

                BigDecimal netDebit  = BigDecimal.ZERO;
                BigDecimal netCredit = BigDecimal.ZERO;

                for (com.billbull.backend.financials.generalledger.OpeningBalanceRequest req : requests) {
                        if (req == null || req.getAccountCode() == null || req.getAmount() == null
                                        || req.getAmount().compareTo(BigDecimal.ZERO) <= 0) continue;

                        Account acc = accountRepository.findByCode(req.getAccountCode());
                        if (acc == null || Boolean.TRUE.equals(acc.getIsGroup())) continue;

                        String balType = req.getBalanceType() != null
                                        && "Cr".equalsIgnoreCase(req.getBalanceType().trim()) ? "Cr" : "Dr";

                        if ("Dr".equals(balType)) {
                                addLine(entry, acc.getName() != null ? acc.getName() : req.getAccountCode(),
                                                req.getAccountCode(),
                                                "Opening balance - " + req.getAccountCode(),
                                                req.getAmount().abs(), BigDecimal.ZERO);
                                netDebit = netDebit.add(req.getAmount().abs());
                        } else {
                                addLine(entry, acc.getName() != null ? acc.getName() : req.getAccountCode(),
                                                req.getAccountCode(),
                                                "Opening balance - " + req.getAccountCode(),
                                                BigDecimal.ZERO, req.getAmount().abs());
                                netCredit = netCredit.add(req.getAmount().abs());
                        }
                }

                if (entry.getLines().isEmpty()) return null;

                // Plug the imbalance into Retained Earnings / Owner's Equity
                BigDecimal diff = netDebit.subtract(netCredit);
                if (diff.abs().compareTo(new BigDecimal("0.005")) > 0) {
                        // Net debit > net credit → equity = credit side plug (normal for profitable entity)
                        // Net credit > net debit → equity = debit side plug (accumulated losses)
                        if (diff.signum() > 0) {
                                addLine(entry, "Retained Earnings", "3100",
                                                "Plug - Opening Entry " + asOfDate.getYear(),
                                                BigDecimal.ZERO, diff);
                        } else {
                                addLine(entry, "Retained Earnings", "3100",
                                                "Plug - Opening Entry " + asOfDate.getYear(),
                                                diff.abs(), BigDecimal.ZERO);
                        }
                }

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
         * Returns the existing journal when the reference is already in the GL, or null
         * when no duplicate exists (caller should proceed with posting).
         *
         * Callers use the idiom:
         * <pre>
         *   JournalEntry dup = findDuplicate(ref);
         *   if (dup != null) return dup;   // idempotent — already posted
         * </pre>
         * This makes retries (network timeouts, double-clicks, scheduler re-runs) safe:
         * callers receive the real journal entry instead of null, so downstream state
         * updates (e.g. amortization counters, prepaid status) are not skipped.
         */
        private JournalEntry findDuplicate(String reference) {
                return journalEntryRepository.findByReference(reference).orElse(null);
        }

        private boolean isControlAccount(String accountCode) {
                return CONTROL_ACCOUNTS.contains(accountCode);
        }

        private JournalEntry createBaseEntry(LocalDate date, String reference, String narration, String txType) {
                return createBaseEntry(date, reference, narration, txType, null);
        }

        private JournalEntry createBaseEntry(LocalDate date, String reference, String narration, String txType,
                        com.billbull.backend.settings.branch.Branch branch) {
                JournalEntry entry = new JournalEntry();
                LocalDate effectiveDate = date != null ? date : LocalDate.now();
                entry.setDate(effectiveDate);
                entry.setReference(reference);
                entry.setNarration(narration);
                entry.setStatus(JournalEntry.STATUS_DRAFT);
                entry.setPreparedBy("System");
                entry.setBranch(branch);
                String branchCode = (branch != null && branch.getCode() != null && !branch.getCode().isBlank())
                                ? branch.getCode() : VoucherSequenceService.DEFAULT_BRANCH_CODE;
                entry.setEntryNumber(voucherSequenceService.nextVoucherNumber(txType, branchCode, effectiveDate));
                return entry;
        }

        private void addLine(JournalEntry entry, String accountName, String accountCode,
                        String description, BigDecimal debit, BigDecimal credit) {
                addLine(entry, accountName, accountCode, description, debit, credit, null);
        }

        private void addLine(JournalEntry entry, String accountName, String accountCode,
                        String description, BigDecimal debit, BigDecimal credit, String costCenter) {
                addLine(entry, accountName, accountCode, description, debit, credit, costCenter, "AED");
        }

        /**
         * Core line-builder (F-20). Supports multi-currency: pass a non-AED currency code
         * and the amounts are treated as foreign-currency amounts. The base-currency
         * equivalents (baseDebit/baseCredit) are derived from CurrencyService on the
         * journal entry date. For AED (or when the rate is unavailable) fxRate = 1.0.
         */
        private void addLine(JournalEntry entry, String accountName, String accountCode,
                        String description, BigDecimal debit, BigDecimal credit,
                        String costCenter, String currency) {
                JournalLine line = new JournalLine();
                line.setAccount(accountName);
                line.setAccountCode(accountCode);
                line.setDescription(description);
                BigDecimal dr = debit  != null ? debit  : BigDecimal.ZERO;
                BigDecimal cr = credit != null ? credit : BigDecimal.ZERO;
                line.setDebit(dr);
                line.setCredit(cr);
                line.setCostCenter(costCenter);
                // Propagate branch from journal header to each line for dimensional reporting.
                if (entry.getBranch() != null) {
                        line.setBranch(entry.getBranch());
                        // PDF §4: revenue (4xxx) and COGS (5xxx) lines require an outlet dimension.
                        // Auto-resolve to the first active outlet for the branch if available.
                        if (accountCode != null && (accountCode.startsWith("4") || accountCode.startsWith("5"))) {
                                List<com.billbull.backend.settings.outlet.Outlet> outlets =
                                        outletRepository.findByBranchIdAndIsActiveTrue(entry.getBranch().getId());
                                if (!outlets.isEmpty()) {
                                        line.setOutlet(outlets.get(0));
                                } else {
                                        log.debug("[PostingEngine] No active outlet for branch {} — revenue/COGS line {} has no outlet dimension.",
                                                entry.getBranch().getId(), accountCode);
                                }
                        }
                }
                // Populate Cash Flow bucket from Account master (PDF §15 / Phase 7.4).
                if (accountCode != null && !accountCode.isBlank()) {
                        Account acct = accountRepository.findByCode(accountCode);
                        if (acct != null && acct.getCashFlowSection() != null) {
                                line.setCfBucket(acct.getCashFlowSection());
                        }
                }
                // F-20: Resolve FX rate from CurrencyService for dated, multi-currency support.
                String txCurrency = (currency == null || currency.isBlank()) ? "AED" : currency.trim().toUpperCase();
                BigDecimal fxRate = BigDecimal.ONE;
                if (!"AED".equals(txCurrency)) {
                        LocalDate rateDate = entry.getDate() != null ? entry.getDate() : LocalDate.now();
                        fxRate = currencyService.getRate(txCurrency, "AED", rateDate)
                                        .orElseThrow(() -> new PostingException(PostingErrorCode.INVALID_FX_RATE,
                                                "No exchange rate found for " + txCurrency + " → AED on " + rateDate
                                                + " (ref=" + entry.getReference() + "). Add the rate before posting."));
                }
                line.setCurrency(txCurrency);
                line.setFxRate(fxRate);
                line.setBaseDebit(dr.multiply(fxRate).setScale(2, java.math.RoundingMode.HALF_UP));
                line.setBaseCredit(cr.multiply(fxRate).setScale(2, java.math.RoundingMode.HALF_UP));
                entry.addLine(line);
        }

        /** Null-safe BigDecimal from a possibly-null Double amount. */
        private BigDecimal nz(Double value) {
                return value != null ? BigDecimal.valueOf(value) : BigDecimal.ZERO;
        }

        /** Null-safe BigDecimal from a possibly-null BigDecimal amount (treats null as zero). */
        private BigDecimal nz(BigDecimal value) {
                return value != null ? value : BigDecimal.ZERO;
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

                        applyGlBalanceDelta(code, periodId, branchId, dr, cr);
                }
        }

        /**
         * Atomically applies a (debit, credit) delta to the GlAccountBalance row for a
         * (accountCode, periodId, branchId) triple, creating it if absent.
         *
         * Concurrency (ARCHFIX P0 §1.3): the row is read through a PESSIMISTIC_WRITE lock so
         * two concurrent postings to the same triple are serialized and no increment is lost.
         * The first-ever insert for a triple is guarded with a flush + retry: if a concurrent
         * thread wins the insert, we fall back to the now-existing locked row and re-apply.
         */
        private void applyGlBalanceDelta(String code, Long periodId, Long branchId,
                        BigDecimal dr, BigDecimal cr) {
                java.util.Optional<com.billbull.backend.financials.generalledger.GlAccountBalance> existing =
                                glBalanceRepository.findForUpdate(code, periodId, branchId);

                if (existing.isPresent()) {
                        com.billbull.backend.financials.generalledger.GlAccountBalance bal = existing.get();
                        bal.setDebitTotal(nvl(bal.getDebitTotal()).add(dr));
                        bal.setCreditTotal(nvl(bal.getCreditTotal()).add(cr));
                        bal.setClosingBalance(bal.getDebitTotal().subtract(bal.getCreditTotal()));
                        glBalanceRepository.save(bal);
                        return;
                }

                com.billbull.backend.financials.generalledger.GlAccountBalance b
                                = new com.billbull.backend.financials.generalledger.GlAccountBalance();
                b.setAccountCode(code);
                b.setFiscalPeriodId(periodId);
                b.setBranchId(branchId);
                b.setDebitTotal(dr);
                b.setCreditTotal(cr);
                b.setClosingBalance(dr.subtract(cr));
                try {
                        glBalanceRepository.saveAndFlush(b);
                } catch (org.springframework.dao.DataIntegrityViolationException raceLost) {
                        // A concurrent posting inserted the row first. Re-read under lock and re-apply.
                        com.billbull.backend.financials.generalledger.GlAccountBalance bal =
                                        glBalanceRepository.findForUpdate(code, periodId, branchId)
                                                .orElseThrow(() -> raceLost);
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
                        case "CASH"    -> new AccountSelection("Petty Cash",  ACC_PETTY_CASH);
                        case "CHEQUE"  -> new AccountSelection("Bank",  ACC_BANK); // Cheque clears via bank
                        case "CARD"    -> new AccountSelection("Bank",  ACC_BANK); // Card payment debits bank
                        default        -> new AccountSelection("Bank",  ACC_BANK);
                };
        }

        private AccountSelection resolveOutgoingPaymentAccount(PaymentVoucher voucher) {
                AccountSelection selectedAccount = resolveSelectedPaymentAccount(
                                voucher != null ? voucher.getBankAccount() : null);
                if (selectedAccount != null) {
                        return selectedAccount;
                }
                return resolveOutgoingPaymentAccount(
                                voucher != null && voucher.getPaymentMode() != null
                                                ? voucher.getPaymentMode().name() : null);
        }

        private AccountSelection resolveSelectedPaymentAccount(String accountText) {
                if (accountText == null || accountText.isBlank()) {
                        return null;
                }

                String value = accountText.trim();
                String firstToken = value.split("\\s+", 2)[0].replaceAll("[^0-9A-Za-z]", "");
                Account account = !firstToken.isBlank() ? accountRepository.findByCode(firstToken) : null;
                if (account == null) {
                        account = accountRepository.findByName(value);
                }
                if (account == null && value.toLowerCase(java.util.Locale.ROOT).contains("petty cash")) {
                        account = accountRepository.findByCode(ACC_PETTY_CASH);
                }
                if (account == null) {
                        return null;
                }

                String name = account.getName() != null && !account.getName().isBlank()
                                ? account.getName() : value;
                String code = account.getCode() != null && !account.getCode().isBlank()
                                ? account.getCode() : firstToken;
                return new AccountSelection(name, code);
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

        // =========================================================
        // FIXED ASSET — DEPRECIATION (PDF §14)
        // Dr Depreciation Expense (6030) / Cr Accumulated Depreciation (1450)
        // Reference: "DEP-{assetCode}-{YYYY-MM}" — idempotent
        // =========================================================

        private static final String ACC_DEPRECIATION_EXPENSE = "6030";  // unchanged
        private static final String ACC_ACCUM_DEPRECIATION   = "1450";  // unchanged
        private static final String ACC_FIXED_ASSET          = "1400";  // unchanged
        private static final String TX_DEPRECIATION          = "DEP";
        private static final String TX_ASSET_DISPOSAL        = "DISP";

        @Transactional
        public JournalEntry createJournalFromDepreciation(
                        String ref, java.time.LocalDate runDate, String assetName,
                        BigDecimal amount,
                        String depExpenseCode, String accumDeprecCode,
                        String costCenter,
                        com.billbull.backend.settings.branch.Branch branch) {
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                JournalEntry entry = createBaseEntry(runDate, ref,
                                "Depreciation — " + assetName, TX_DEPRECIATION, branch);

                String expCode = depExpenseCode != null ? depExpenseCode : ACC_DEPRECIATION_EXPENSE;
                String accCode = accumDeprecCode != null ? accumDeprecCode : ACC_ACCUM_DEPRECIATION;

                addLine(entry, "Depreciation Expense", expCode,
                                "Depreciation " + assetName, amount, BigDecimal.ZERO, costCenter);
                addLine(entry, "Accumulated Depreciation", accCode,
                                "Depreciation " + assetName, BigDecimal.ZERO, amount, costCenter);

                return post(entry);
        }

        // =========================================================
        // FIXED ASSET — DISPOSAL (PDF §14 / §17 Investing)
        // Dr Accumulated Depreciation / Dr Loss (or Cr Gain) / Cr Fixed Asset / Dr/Cr Cash (proceeds)
        // =========================================================

        @Transactional
        public JournalEntry createJournalFromAssetDisposal(
                        String ref, java.time.LocalDate disposalDate, String assetName,
                        BigDecimal cost, BigDecimal accumDeprec, BigDecimal proceeds,
                        BigDecimal gainLoss,
                        String assetAccountCode, String accumDeprecCode,
                        com.billbull.backend.settings.branch.Branch branch) {
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                JournalEntry entry = createBaseEntry(disposalDate, ref,
                                "Asset Disposal — " + assetName, TX_ASSET_DISPOSAL, branch);

                String assetCode = assetAccountCode != null ? assetAccountCode : ACC_FIXED_ASSET;
                String accCode   = accumDeprecCode  != null ? accumDeprecCode  : ACC_ACCUM_DEPRECIATION;

                // Clear accumulated depreciation: Dr Accum Depreciation
                addLine(entry, "Accumulated Depreciation", accCode,
                                "Disposal " + assetName, accumDeprec, BigDecimal.ZERO, null);

                // Record proceeds received (if any): Dr Cash
                if (proceeds != null && proceeds.compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "Cash on Hand", ACC_CASH,
                                        "Disposal proceeds " + assetName, proceeds, BigDecimal.ZERO, null);
                }

                // Remove asset at cost: Cr Fixed Asset
                addLine(entry, "Fixed Assets", assetCode,
                                "Disposal " + assetName, BigDecimal.ZERO, cost, null);

                // Gain or Loss on disposal
                if (gainLoss != null && gainLoss.compareTo(BigDecimal.ZERO) != 0) {
                        if (gainLoss.compareTo(BigDecimal.ZERO) > 0) {
                                addLine(entry, "Gain on Disposal", "7004",
                                                "Gain on disposal " + assetName, BigDecimal.ZERO, gainLoss, null);
                        } else {
                                addLine(entry, "Loss on Disposal", "6040",
                                                "Loss on disposal " + assetName, gainLoss.abs(), BigDecimal.ZERO, null);
                        }
                }

                return post(entry);
        }

        // =========================================================
        // PREPAID EXPENSE — AMORTIZATION (PDF §14)
        // Dr Expense Account / Cr Prepaid Expenses (1320)
        // Reference: "PRPD-{prepaidCode}-{YYYY-MM}" — idempotent
        // =========================================================

        private static final String ACC_PREPAID_EXPENSES = "1320";
        private static final String TX_PREPAID_AMORT    = "PRPD";

        @Transactional
        public JournalEntry createJournalFromPrepaidAmortization(
                        String ref, java.time.LocalDate runDate, String description,
                        BigDecimal amount, String expenseAccountCode, String costCenter,
                        com.billbull.backend.settings.branch.Branch branch) {
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                JournalEntry entry = createBaseEntry(runDate, ref,
                                "Prepaid Amortization — " + description, TX_PREPAID_AMORT, branch);

                String expCode = expenseAccountCode != null ? expenseAccountCode : ACC_EXPENSE_GENERAL;

                addLine(entry, "Expense", expCode,
                                description, amount, BigDecimal.ZERO, costCenter);
                addLine(entry, "Prepaid Expenses", ACC_PREPAID_EXPENSES,
                                description, BigDecimal.ZERO, amount, costCenter);

                return post(entry);
        }

        // =========================================================
        // GRATUITY PROVISION — UAE End-of-Service Benefit (PDF §13)
        // Dr Gratuity Expense (6020) / Cr Gratuity Payable (2210)
        // Reference: "GRAT-{employeeId}-{year}-{month}" — idempotent
        // =========================================================

        public static final String ACC_GRATUITY_EXPENSE = "6020";  // unchanged
        public static final String ACC_GRATUITY_PAYABLE = "2210";  // unchanged
        private static final String TX_GRATUITY = "GRAT";

        /**
         * Monthly gratuity provision for UAE labour law compliance.
         *
         * Dr Gratuity Expense (6020) [monthlyProvision]
         * Cr Gratuity Payable (2210) [monthlyProvision]
         *
         * @param employeeId       employee identifier (for idempotency key)
         * @param employeeName     name for narration
         * @param monthlyProvision accrual amount for the month
         * @param year             year of provision
         * @param month            month of provision (1–12)
         * @param costCenter       department cost center
         * @param provisionDate    effective date of the accrual
         */
        @Transactional
        public JournalEntry createJournalFromGratuityProvision(
                        String employeeId, String employeeName,
                        BigDecimal monthlyProvision, int year, int month,
                        String costCenter, LocalDate provisionDate) {

                String ref = "GRAT-" + employeeId + "-" + year + "-" + String.format("%02d", month);
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                if (monthlyProvision == null || monthlyProvision.compareTo(BigDecimal.ZERO) <= 0) return null;

                JournalEntry entry = createBaseEntry(
                                provisionDate != null ? provisionDate : LocalDate.now(), ref,
                                "Gratuity provision - " + employeeName + " " + year + "/" + String.format("%02d", month),
                                TX_GRATUITY);
                addLine(entry, "Gratuity Expense", ACC_GRATUITY_EXPENSE,
                                "Gratuity accrual - " + employeeName, monthlyProvision, BigDecimal.ZERO, costCenter);
                addLine(entry, "Gratuity Payable", ACC_GRATUITY_PAYABLE,
                                "Gratuity payable - " + employeeName, BigDecimal.ZERO, monthlyProvision);
                return post(entry);
        }

        /**
         * Gratuity settlement on employee exit (full or partial).
         *
         * Dr Gratuity Payable (2210) [settlementAmount]
         * Cr Bank / Cash             [settlementAmount]
         */
        @Transactional
        public JournalEntry createJournalFromGratuitySettlement(
                        String employeeId, String employeeName,
                        BigDecimal settlementAmount, String paymentMode, LocalDate settlementDate) {

                String ref = "GRATSETL-" + employeeId;
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                if (settlementAmount == null || settlementAmount.compareTo(BigDecimal.ZERO) <= 0) return null;

                AccountSelection settlement = resolveOutgoingPaymentAccount(paymentMode);
                JournalEntry entry = createBaseEntry(
                                settlementDate != null ? settlementDate : LocalDate.now(), ref,
                                "Gratuity settlement - " + employeeName, TX_GRATUITY);
                addLine(entry, "Gratuity Payable", ACC_GRATUITY_PAYABLE,
                                "Gratuity settled - " + employeeName, settlementAmount, BigDecimal.ZERO);
                addLine(entry, settlement.name, settlement.code,
                                "Gratuity payment - " + employeeName, BigDecimal.ZERO, settlementAmount);
                return post(entry);
        }

        // =========================================================
        // EXPENSE VOUCHER — Multi-line approved expense (PDF §08)
        // Supports line-level GL account assignment
        // Reference: "EV-{voucherId}" — idempotent
        // =========================================================

        private static final String TX_EXPENSE_VOUCHER = "EV";

        /**
         * Posts an approved expense voucher with multiple line items.
         * Each line carries its own GL account and cost center.
         *
         * Dr [various expense accounts] [line amounts]
         * Dr VAT Input (1130)           [total VAT]   (if > 0)
         * Cr Bank / Cash / AP           [total amount]
         *
         * @param voucherId       unique voucher ID for idempotency
         * @param voucherDate     date of the voucher
         * @param payee           payee name for narration
         * @param lines           list of line items (each with amount, glAccount, costCenter, description)
         * @param totalVat        total VAT on this voucher
         * @param totalAmount     grand total to credit
         * @param paymentMode     CASH | BANK | CREDIT (AP)
         * @param branch          branch dimension
         */
        @Transactional
        public JournalEntry createJournalFromExpenseVoucher(
                        String voucherId, LocalDate voucherDate, String payee,
                        List<ExpenseVoucherLine> lines, BigDecimal totalVat,
                        BigDecimal totalAmount, String paymentMode,
                        com.billbull.backend.settings.branch.Branch branch) {

                String ref = "EV-" + voucherId;
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                if (lines == null || lines.isEmpty()) return null;

                JournalEntry entry = createBaseEntry(
                                voucherDate != null ? voucherDate : LocalDate.now(),
                                ref, "Expense Voucher - " + payee, TX_EXPENSE_VOUCHER, branch);

                for (ExpenseVoucherLine l : lines) {
                        if (l.amount() == null || l.amount().compareTo(BigDecimal.ZERO) <= 0) continue;
                        String accCode = (l.glAccountCode() != null && !l.glAccountCode().isBlank())
                                        ? l.glAccountCode() : ACC_EXPENSE_GENERAL;
                        String accName = l.accountName() != null ? l.accountName() : "Expense";
                        addLine(entry, accName, accCode, l.description(), l.amount(), BigDecimal.ZERO, l.costCenter());
                }

                BigDecimal vat = totalVat != null ? totalVat : BigDecimal.ZERO;
                if (vat.compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "VAT Input", ACC_VAT_INPUT, "VAT on " + payee, vat, BigDecimal.ZERO);
                }

                AccountSelection payAccount = resolveExpenseSettlementAccount(paymentMode);
                BigDecimal total = totalAmount != null ? totalAmount : BigDecimal.ZERO;
                addLine(entry, payAccount.name, payAccount.code, "Payment to " + payee, BigDecimal.ZERO, total);

                return post(entry);
        }

        /** Line item carrier for createJournalFromExpenseVoucher. */
        public record ExpenseVoucherLine(
                        BigDecimal amount,
                        String glAccountCode,
                        String accountName,
                        String description,
                        String costCenter) {}

        // =========================================================
        // PERIOD CLOSE — Profit & Loss transfer to Retained Earnings
        // Dr Revenue accounts (4xxx) / Cr Retained Earnings (3000)
        // Dr Retained Earnings (3000) / Cr Expense accounts (5xxx/6xxx/7xxx)
        // Reference: "CLOSE-{year}-{month}" — idempotent
        // =========================================================

        public static final String ACC_RETAINED_EARNINGS = "3100";  // Retained Earnings (PDF §03)
        private static final String TX_PERIOD_CLOSE = "CLOS";

        /**
         * Posts a period-close (P&L to Retained Earnings) journal.
         * Zeros out all income and expense balances into Retained Earnings (3000).
         *
         * Positive netIncome → Dr Revenue accounts / Cr Retained Earnings
         * Negative netIncome → Dr Retained Earnings / Cr Expense accounts (loss)
         *
         * @param periodLabel  human label for the period, e.g. "2025-12"
         * @param closeDate    effective date of the close
         * @param netIncome    net profit (positive) or net loss (negative)
         * @param revenueTotal total revenue to zero-out
         * @param expenseTotal total expense to zero-out
         * @param branch       branch dimension
         */
        @Transactional
        public JournalEntry createJournalFromPeriodClose(
                        String periodLabel, LocalDate closeDate,
                        BigDecimal netIncome, BigDecimal revenueTotal, BigDecimal expenseTotal,
                        com.billbull.backend.settings.branch.Branch branch) {

                String ref = "CLOSE-" + periodLabel;
                { JournalEntry _dup = findDuplicate(ref); if (_dup != null) return _dup; }

                BigDecimal rev = nvl(revenueTotal);
                BigDecimal exp = nvl(expenseTotal);
                BigDecimal net = nvl(netIncome);

                if (rev.compareTo(BigDecimal.ZERO) == 0 && exp.compareTo(BigDecimal.ZERO) == 0) return null;

                JournalEntry entry = createBaseEntry(
                                closeDate != null ? closeDate : LocalDate.now(),
                                ref, "Period Close - " + periodLabel, TX_PERIOD_CLOSE, branch);

                // Clear revenue (debit to zero, credit goes to RE)
                if (rev.compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "Sales Revenue (Close)", ACC_SALES_REVENUE,
                                        "Close revenue - " + periodLabel, rev, BigDecimal.ZERO);
                }
                // Clear expenses (credit to zero, debit comes from RE)
                if (exp.compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "Expense (Close)", ACC_EXPENSE_GENERAL,
                                        "Close expenses - " + periodLabel, BigDecimal.ZERO, exp);
                }
                // Plug into Retained Earnings
                if (net.compareTo(BigDecimal.ZERO) > 0) {
                        // Profit: credit RE
                        addLine(entry, "Retained Earnings", ACC_RETAINED_EARNINGS,
                                        "Net profit transfer - " + periodLabel, BigDecimal.ZERO, net);
                } else if (net.compareTo(BigDecimal.ZERO) < 0) {
                        // Loss: debit RE
                        addLine(entry, "Retained Earnings", ACC_RETAINED_EARNINGS,
                                        "Net loss transfer - " + periodLabel, net.abs(), BigDecimal.ZERO);
                }

                return post(entry);
        }

        // =========================================================
        // EQUITY INJECTION — Share Capital / Opening Equity (PDF §03)
        // Dr Cash/Bank / Cr Share Capital (3001)
        // Reference: "EQ-{ref}" — idempotent
        // =========================================================

        private static final String ACC_SHARE_CAPITAL = "3001";
        private static final String TX_EQUITY         = "EQ";

        @Transactional
        public JournalEntry createJournalFromEquityInjection(
                        String ref, java.time.LocalDate date, String narration,
                        BigDecimal amount, String paymentMode,
                        com.billbull.backend.settings.branch.Branch branch) {
                String fullRef = "EQ-" + ref;
                { JournalEntry _dup = findDuplicate(fullRef); if (_dup != null) return _dup; }

                JournalEntry entry = createBaseEntry(date, fullRef, narration, TX_EQUITY, branch);

                AccountSelection cashAcc = resolveIncomingPaymentAccount(paymentMode);
                addLine(entry, cashAcc.name, cashAcc.code, narration, amount, BigDecimal.ZERO, null);
                addLine(entry, "Share Capital", ACC_SHARE_CAPITAL, narration, BigDecimal.ZERO, amount, null);

                return post(entry);
        }
}
