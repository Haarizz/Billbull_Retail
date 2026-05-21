package com.billbull.backend.financials.generalledger.postingengine;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
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
        public static final String ACC_COGS                = "5101";
        public static final String ACC_EXPENSE_GENERAL     = "5403";

        public static final List<String> CONTROL_ACCOUNTS = java.util.Arrays.asList(
                        ACC_ACCOUNTS_RECEIVABLE,
                        ACC_ACCOUNTS_PAYABLE,
                        ACC_INVENTORY,
                        ACC_VAT_OUTPUT,
                        ACC_VAT_INPUT);

        private final JournalEntryRepository journalEntryRepository;
        private final JournalEntryService    journalEntryService;
        private final AccountRepository      accountRepository;

        public PostingEngineService(
                        JournalEntryRepository journalEntryRepository,
                        JournalEntryService    journalEntryService,
                        AccountRepository      accountRepository) {
                this.journalEntryRepository = journalEntryRepository;
                this.journalEntryService    = journalEntryService;
                this.accountRepository      = accountRepository;
        }

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
                                "Purchase Invoice " + ref);

                BigDecimal taxTotal   = nvl(invoice.getTaxTotal());
                BigDecimal landedCost = nvl(invoice.getLandedCost());
                BigDecimal grandTotal = nvl(invoice.getGrandTotal());

                boolean isAgainstGrn = "AGAINST_GRN".equalsIgnoreCase(invoice.getSourceType())
                                && invoice.getGrnId() != null;

                if (isAgainstGrn) {
                        BigDecimal grnClearingAmt = grandTotal.subtract(landedCost);
                        if (grnClearingAmt.compareTo(BigDecimal.ZERO) < 0) {
                                grnClearingAmt = BigDecimal.ZERO;
                        }
                        addLine(entry, "GRN Clearing", ACC_GRN_CLEARING,
                                        "Clear GRN Liability - " + ref,
                                        grnClearingAmt, BigDecimal.ZERO);
                        if (landedCost.compareTo(BigDecimal.ZERO) > 0) {
                                addLine(entry, "Inventory", ACC_INVENTORY,
                                                "Capitalize landed cost - " + ref,
                                                landedCost, BigDecimal.ZERO);
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

                JournalEntry entry = createBaseEntry(invoice.getInvoiceDate(), ref,
                                "Sales Invoice " + ref);

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
                                        "Revenue recognition - " + narration);
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
                                        "COGS - " + narration);
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
                                "Cancellation reversal - " + invoice.getInvoiceNumber());

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
                                        "Revenue reversal - DN " + dnNumber);
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
                                        "COGS reversal - DN " + dnNumber);
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

                JournalEntry entry = createBaseEntry(grn.getGrnDate(), ref, "GRN Receipt " + ref);
                addLine(entry, "Inventory",    ACC_INVENTORY,    "GRN Receipt - "  + ref, amount,        BigDecimal.ZERO);
                addLine(entry, "GRN Clearing", ACC_GRN_CLEARING, "GRN Clearing - " + ref, BigDecimal.ZERO, amount);

                return post(entry);
        }

        // =========================================================
        // STOCK TRANSFER
        // =========================================================

        /**
         * Inter-branch stock transfer send:
         *   Dr Inventory (1120) [Transit cost center]
         *   Cr Inventory (1120) [Source branch cost center]
         *
         * Total inventory stays unchanged at entity level, but the branch
         * dimension moves the value into an in-transit bucket until receipt.
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
                                "Stock Transfer Sent " + transfer.getTransferNo());
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
                                "Stock Transfer Received " + transfer.getTransferNo());
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
                                "Expense - " + expense.getCategory());
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
                                "Payment to " + vendorName);
                addLine(entry, "Accounts Payable", ACC_ACCOUNTS_PAYABLE,
                                "Payment - " + ref, voucher.getAmount(), BigDecimal.ZERO);
                addLine(entry, settlementAccount.name, settlementAccount.code,
                                settlementAccount.name + " payment", BigDecimal.ZERO, voucher.getAmount());
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
                                "Receipt from " + receipt.getMemberName());
                addLine(entry, settlementAccount.name, settlementAccount.code,
                                "Receipt - " + ref, receipt.getAmount(), BigDecimal.ZERO);

                // Use Customer Advance account for advances, otherwise use AR
                String creditAccount = ACC_ACCOUNTS_RECEIVABLE;
                String creditName    = "Accounts Receivable";
                if (receipt.getPurpose() == com.billbull.backend.financials.receiptvoucher.ReceiptPurpose.ADVANCE_RECEIVED) {
                        creditAccount = ACC_CUSTOMER_ADVANCE;
                        creditName    = "Customer Advance";
                }

                addLine(entry, creditName, creditAccount,
                                "Customer payment - " + receipt.getPurpose(), BigDecimal.ZERO, receipt.getAmount());
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
                                "Sales Return " + ref);

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
                                        "Stock return - " + ref);
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
                                "Card Settlement");
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
         * PDC transitions are informational events — no GL posting occurs
         * until the cheque actually clears or bounces.
         *
         * RECEIVED   → no posting (not yet a financial event)
         * PRESENTED  → no posting (in-flight)
         * CLEARED    → same as bank receipt: Dr Bank / Cr AR
         * BOUNCED    → reverse any posting if CLEARED entry was made
         */
        @Transactional
        public void createJournalFromPdcTransition(PdcEntry pdc, PdcStatus oldStatus, PdcStatus newStatus) {
                log.info("[PostingEngine] PDC {} transitioned {} → {}. No automated journal posted at this stage.",
                                pdc.getId(), oldStatus, newStatus);
                // CLEARED and BOUNCED handling to be implemented per business rules.
                // Do NOT post empty journals — that creates unbalanced phantom entries in GL.
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

        private JournalEntry createBaseEntry(LocalDate date, String reference, String narration) {
                JournalEntry entry = new JournalEntry();
                entry.setDate(date != null ? date : LocalDate.now());
                entry.setReference(reference);
                entry.setNarration(narration);
                entry.setStatus("Draft");
                entry.setPreparedBy("System");
                entry.setEntryNumber(journalEntryService.generateEntryNumber());
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
                line.setDebit(debit   != null ? debit   : BigDecimal.ZERO);
                line.setCredit(credit != null ? credit  : BigDecimal.ZERO);
                line.setCostCenter(costCenter);
                entry.addLine(line);
        }

        private JournalEntry post(JournalEntry entry) {
                JournalEntry saved = journalEntryRepository.save(entry);
                journalEntryService.postEntry(saved.getId(), "System");
                return saved;
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
