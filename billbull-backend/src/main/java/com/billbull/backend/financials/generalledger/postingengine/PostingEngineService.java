package com.billbull.backend.financials.generalledger.postingengine;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;

import com.billbull.backend.financials.expense.Expense;
import com.billbull.backend.financials.generalledger.JournalEntry;
import com.billbull.backend.financials.generalledger.EntryType;
import com.billbull.backend.financials.generalledger.JournalLine;
import com.billbull.backend.financials.generalledger.JournalEntryRepository;
import com.billbull.backend.financials.generalledger.JournalEntryService;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
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
 * Renamed from JournalEntryGeneratorService and moved to GL module.
 */
@Service
@Slf4j
public class PostingEngineService {

        public static final String ACC_CASH = "1101";
        public static final String ACC_BANK = "1102";
        public static final String ACC_PETTY_CASH = "1103";
        public static final String ACC_MERCHANT_CLEARING = "1104";
        public static final String ACC_ACCOUNTS_RECEIVABLE = "1110";
        public static final String ACC_INVENTORY = "1120";
        public static final String ACC_VAT_INPUT = "1130";
        public static final String ACC_ACCOUNTS_PAYABLE = "2101";
        public static final String ACC_VAT_OUTPUT = "2102";
        public static final String ACC_GRN_CLEARING = "2103";
        public static final String ACC_CUSTOMER_ADVANCE = "2104";
        public static final String ACC_DEFERRED_REVENUE = "2107";
        public static final String ACC_SALES_REVENUE = "4101";
        public static final String ACC_SALES_RETURNS = "4102";
        public static final String ACC_COGS = "5101";
        public static final String ACC_EXPENSE_GENERAL = "5403";

        public static final List<String> CONTROL_ACCOUNTS = java.util.Arrays.asList(
                        ACC_ACCOUNTS_RECEIVABLE,
                        ACC_ACCOUNTS_PAYABLE,
                        ACC_INVENTORY,
                        ACC_VAT_OUTPUT,
                        ACC_VAT_INPUT);

        private final JournalEntryRepository journalEntryRepository;
        private final JournalEntryService journalEntryService;

        public PostingEngineService(
                        JournalEntryRepository journalEntryRepository,
                        JournalEntryService journalEntryService) {
                this.journalEntryRepository = journalEntryRepository;
                this.journalEntryService = journalEntryService;
        }

        @Transactional
        public JournalEntry createJournalFromPurchaseInvoice(PurchaseInvoice invoice) {
                JournalEntry entry = createBaseEntry(invoice.getInvoiceDate(), invoice.getInvoiceNumber(),
                                "Purchase Invoice " + invoice.getInvoiceNumber());

                BigDecimal subTotal = invoice.getSubTotal() != null ? invoice.getSubTotal() : BigDecimal.ZERO;
                BigDecimal taxTotal = invoice.getTaxTotal() != null ? invoice.getTaxTotal() : BigDecimal.ZERO;
                BigDecimal landedCost = invoice.getLandedCost() != null ? invoice.getLandedCost() : BigDecimal.ZERO;

                boolean isAgainstGrn = "AGAINST_GRN".equalsIgnoreCase(invoice.getSourceType())
                                && invoice.getGrnId() != null;

                BigDecimal grandTotal = invoice.getGrandTotal() != null ? invoice.getGrandTotal() : BigDecimal.ZERO;

                if (isAgainstGrn) {
                        // AGAINST_GRN: Dr. GRN Clearing (grandTotal) — matches what was posted at GRN
                        // No VAT Input line here: VAT was not in the GRN Clearing accrual
                        addLine(entry, "GRN Clearing", ACC_GRN_CLEARING,
                                        "Clear GRN Liability - " + invoice.getInvoiceNumber(),
                                        grandTotal, BigDecimal.ZERO);
                } else {
                        // DIRECT / AGAINST_LPO: Dr. Inventory (subTotal + landedCost) + Dr. VAT Input
                        addLine(entry, "Inventory", ACC_INVENTORY,
                                        "Direct inventory purchase - " + invoice.getInvoiceNumber(),
                                        subTotal.add(landedCost), BigDecimal.ZERO);
                        if (taxTotal.compareTo(BigDecimal.ZERO) > 0) {
                                addLine(entry, "VAT Input", ACC_VAT_INPUT,
                                                "VAT - " + invoice.getInvoiceNumber(),
                                                taxTotal, BigDecimal.ZERO);
                        }
                }

                addLine(entry, "Accounts Payable - " + invoice.getVendorName(), ACC_ACCOUNTS_PAYABLE,
                                "Payable - " + invoice.getInvoiceNumber(), BigDecimal.ZERO, grandTotal);

                return post(entry);
        }

        /**
         * Invoice Posting (IFRS 15 compliant).
         * Revenue is DEFERRED — recognized only when goods are physically delivered.
         *
         * Entry: Dr Accounts Receivable / Cr Deferred Revenue / Cr VAT Output
         *
         * Cash / bank movement is handled only by Receipt Voucher posting so we do not
         * double-count immediate-mode invoices.
         *
         * Note: VAT stays at invoice date per UAE VAT law (tax point = invoice date).
         */
        @Transactional
        public JournalEntry createJournalFromInvoicePosting(SalesInvoice invoice) {
                JournalEntry entry = createBaseEntry(invoice.getInvoiceDate(), invoice.getInvoiceNumber(),
                                "Sales Invoice " + invoice.getInvoiceNumber());

                addLine(entry, "Accounts Receivable", ACC_ACCOUNTS_RECEIVABLE,
                                "Sales - " + invoice.getInvoiceNumber(),
                                BigDecimal.valueOf(invoice.getInvoiceTotal()), BigDecimal.ZERO);
                addLine(entry, "Deferred Revenue", ACC_DEFERRED_REVENUE,
                                "Deferred - " + invoice.getInvoiceNumber(),
                                BigDecimal.ZERO, BigDecimal.valueOf(invoice.getSubTotal()));
                if (invoice.getTaxTotal() != null && invoice.getTaxTotal() > 0) {
                        addLine(entry, "VAT Output", ACC_VAT_OUTPUT, "VAT - " + invoice.getInvoiceNumber(),
                                        BigDecimal.ZERO, BigDecimal.valueOf(invoice.getTaxTotal()));
                }

                return post(entry);
        }

        /**
         * Revenue + COGS recognition at physical delivery.
         * Called by DeliveryNoteService.markDelivered() and by SalesInvoiceService
         * for Before-Sale invoices where delivery precedes invoice posting.
         *
         * Entry 1: Dr Deferred Revenue / Cr Sales Revenue = recognizedRevenue
         * Entry 2: Dr COGS / Cr Inventory = cogs  (only if cogs > 0)
         *
         * Idempotent: throws if a journal for this reference already exists.
         */
        @Transactional
        public void createJournalFromDeliveryNoteDelivered(
                        String referenceKey,
                        java.time.LocalDate date,
                        String narration,
                        BigDecimal recognizedRevenue,
                        BigDecimal cogs) {

                if (journalEntryRepository.existsByReference(referenceKey)) {
                        throw new IllegalStateException(
                                        "Journal already posted for: " + referenceKey + ". Duplicate posting blocked.");
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
        }

        /**
         * Reverses the invoice posting journal when an invoice is cancelled
         * before delivery has occurred (Deferred Revenue still outstanding).
         *
         * Entry: Dr Deferred Revenue + Dr VAT Output / Cr Accounts Receivable
         */
        @Transactional
        public void reverseJournalFromInvoiceCancellation(SalesInvoice invoice) {
                String refKey = "CANCEL-" + invoice.getInvoiceNumber();
                if (journalEntryRepository.existsByReference(refKey)) {
                        return; // Already reversed, skip
                }

                JournalEntry entry = createBaseEntry(
                                java.time.LocalDate.now(),
                                refKey,
                                "Cancellation reversal - " + invoice.getInvoiceNumber());

                BigDecimal subTotal = invoice.getSubTotal() != null
                                ? BigDecimal.valueOf(invoice.getSubTotal()) : BigDecimal.ZERO;
                BigDecimal taxTotal = invoice.getTaxTotal() != null
                                ? BigDecimal.valueOf(invoice.getTaxTotal()) : BigDecimal.ZERO;
                BigDecimal invoiceTotal = invoice.getInvoiceTotal() != null
                                ? BigDecimal.valueOf(invoice.getInvoiceTotal()) : BigDecimal.ZERO;

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

        /**
         * Reverses the revenue + COGS recognized when a delivered DN is cancelled.
         *
         * Entry 1: Dr Sales Revenue / Cr Deferred Revenue = recognizedRevenue
         * Entry 2: Dr Inventory / Cr COGS = cogs  (if cogs > 0)
         */
        @Transactional
        public void reverseJournalFromDeliveryNoteCancellation(
                        String dnNumber,
                        java.time.LocalDate date,
                        BigDecimal recognizedRevenue,
                        BigDecimal cogs) {

                String refKey = "REV-DN-" + dnNumber;
                if (journalEntryRepository.existsByReference(refKey)) {
                        return; // Already reversed
                }

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

        @Transactional
        public JournalEntry createJournalFromGRN(GrnEntity grn) {
                JournalEntry entry = createBaseEntry(grn.getGrnDate(), grn.getGrnNo(), "GRN Receipt " + grn.getGrnNo());
                BigDecimal amount = grn.getGrandTotal() != null ? grn.getGrandTotal() : grn.getSubtotal();

                addLine(entry, "Inventory", ACC_INVENTORY, "GRN Receipt - " + grn.getGrnNo(), amount, BigDecimal.ZERO);
                addLine(entry, "GRN Clearing", ACC_GRN_CLEARING, "GRN Clearing - " + grn.getGrnNo(), BigDecimal.ZERO,
                                amount);

                return post(entry);
        }

        @Transactional
        public JournalEntry createJournalFromExpense(Expense expense) {
                JournalEntry entry = createBaseEntry(expense.getDate(), "EXP-" + expense.getId(),
                                "Expense - " + expense.getCategory());
                addLine(entry, expense.getCategory(), ACC_EXPENSE_GENERAL, expense.getNotes(),
                                BigDecimal.valueOf(expense.getAmount()), BigDecimal.ZERO);
                if (expense.getTaxAmount() > 0) {
                        addLine(entry, "VAT Input", ACC_VAT_INPUT, "VAT on expense",
                                        BigDecimal.valueOf(expense.getTaxAmount()),
                                        BigDecimal.ZERO);
                }
                addLine(entry, "Bank/Cash", ACC_BANK, "Payment for expense", BigDecimal.ZERO,
                                BigDecimal.valueOf(expense.getTotal()));
                return post(entry);
        }

        @Transactional
        public JournalEntry createJournalFromPaymentVoucher(PaymentVoucher voucher, String vendorName) {
                AccountSelection settlementAccount = resolveOutgoingPaymentAccount(
                                voucher.getPaymentMode() != null ? voucher.getPaymentMode().name() : null);
                JournalEntry entry = createBaseEntry(voucher.getPaymentDate(), voucher.getVoucherNumber(),
                                "Payment to " + vendorName);
                addLine(entry, "Accounts Payable", ACC_ACCOUNTS_PAYABLE, "Payment - " + voucher.getVoucherNumber(),
                                voucher.getAmount(), BigDecimal.ZERO);
                addLine(entry, settlementAccount.name, settlementAccount.code,
                                settlementAccount.name + " payment", BigDecimal.ZERO, voucher.getAmount());
                return post(entry);
        }

        @Transactional
        public JournalEntry createJournalFromReceiptVoucher(ReceiptVoucher receipt) {
                AccountSelection settlementAccount = resolveIncomingPaymentAccount(receipt.getPaymentMode());
                JournalEntry entry = createBaseEntry(receipt.getDate(), receipt.getVoucherId(),
                                "Receipt from " + receipt.getMemberName());
                addLine(entry, settlementAccount.name, settlementAccount.code,
                                "Receipt - " + receipt.getVoucherId(), receipt.getAmount(),
                                BigDecimal.ZERO);
                addLine(entry, "Accounts Receivable", ACC_ACCOUNTS_RECEIVABLE, "Customer payment", BigDecimal.ZERO,
                                receipt.getAmount());
                return post(entry);
        }

        @Transactional
        public JournalEntry createJournalFromSalesReturn(SalesReturn salesReturn, BigDecimal costOfGoodsReturned) {
                JournalEntry entry = createBaseEntry(salesReturn.getReturnDate(), salesReturn.getReturnNumber(),
                                "Sales Return " + salesReturn.getReturnNumber());

                BigDecimal subTotal = salesReturn.getSubTotal() != null ? BigDecimal.valueOf(salesReturn.getSubTotal())
                                : BigDecimal.ZERO;
                BigDecimal taxAmount = salesReturn.getTaxAmount() != null
                                ? BigDecimal.valueOf(salesReturn.getTaxAmount())
                                : BigDecimal.ZERO;
                BigDecimal totalAmount = salesReturn.getTotalAmount() != null
                                ? BigDecimal.valueOf(salesReturn.getTotalAmount())
                                : BigDecimal.ZERO;

                addLine(entry, "Sales Revenue", ACC_SALES_REVENUE, "Return Revenue Reversal", subTotal,
                                BigDecimal.ZERO);
                if (taxAmount.compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "VAT Output", ACC_VAT_OUTPUT, "VAT Refund", taxAmount, BigDecimal.ZERO);
                }
                addLine(entry, "Accounts Receivable", ACC_ACCOUNTS_RECEIVABLE, "Return Credit Note", BigDecimal.ZERO,
                                totalAmount);

                if (costOfGoodsReturned != null && costOfGoodsReturned.compareTo(BigDecimal.ZERO) > 0) {
                        JournalEntry invEntry = createBaseEntry(salesReturn.getReturnDate(),
                                        salesReturn.getReturnNumber() + "-INV",
                                        "Stock return for " + salesReturn.getReturnNumber());
                        addLine(invEntry, "Inventory", ACC_INVENTORY, "Inventory increase", costOfGoodsReturned,
                                        BigDecimal.ZERO);
                        addLine(invEntry, "COGS", ACC_COGS, "COGS reversal", BigDecimal.ZERO, costOfGoodsReturned);
                        post(invEntry);
                }
                return post(entry);
        }

        @Transactional
        public JournalEntry createJournalFromCardSettlement(CardSettlement settlement) {
                JournalEntry entry = createBaseEntry(settlement.getSettlementDate(), "SETTLE-" + settlement.getId(),
                                "Card Settlement");
                addLine(entry, "Bank", ACC_BANK, "Settled funds", settlement.getNetAmount(), BigDecimal.ZERO);
                addLine(entry, "Merchant Clearing", ACC_MERCHANT_CLEARING, "Clear merchant suspense", BigDecimal.ZERO,
                                settlement.getGrossAmount());
                if (settlement.getFeeAmount() != null && settlement.getFeeAmount().compareTo(BigDecimal.ZERO) > 0) {
                        addLine(entry, "Bank Charges", ACC_EXPENSE_GENERAL, "Merchant fees", settlement.getFeeAmount(),
                                        BigDecimal.ZERO);
                }
                return post(entry);
        }

        @Transactional
        public JournalEntry createJournalFromPdcTransition(PdcEntry pdcl, PdcStatus oldStatus, PdcStatus newStatus) {
                JournalEntry entry = createBaseEntry(LocalDate.now(), "PDC-" + pdcl.getId(),
                                "PDC Transition: " + oldStatus + " -> " + newStatus);
                // Minimal implementation for now to satisfy calls
                return post(entry);
        }

        // --- Reconciliation Helpers ---

        /**
         * Returns true if a GL journal exists for the given reference key.
         * Used by reconciliation to detect DNs delivered without accounting.
         */
        public boolean hasJournalForReference(String reference) {
                return journalEntryRepository.existsByReference(reference);
        }

        // --- Helpers ---

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

        private boolean isControlAccount(String accountCode) {
                return CONTROL_ACCOUNTS.contains(accountCode);
        }

        private JournalEntry createBaseEntry(LocalDate date, String reference, String narration) {
                JournalEntry entry = new JournalEntry();
                // Discriminator handles EntryType.SYSTEM automatically
                entry.setDate(date != null ? date : LocalDate.now());
                entry.setReference(reference);
                entry.setNarration(narration);
                entry.setStatus("Draft");
                entry.setPreparedBy("System");
                entry.setEntryNumber(journalEntryService.generateEntryNumber());
                return entry;
        }

        private void addLine(JournalEntry entry, String accountName, String accountCode, String description,
                        BigDecimal debit, BigDecimal credit) {
                JournalLine line = new JournalLine();
                line.setAccount(accountName);
                line.setAccountCode(accountCode);
                line.setDescription(description);
                line.setDebit(debit != null ? debit : BigDecimal.ZERO);
                line.setCredit(credit != null ? credit : BigDecimal.ZERO);
                entry.addLine(line);
        }

        private JournalEntry post(JournalEntry entry) {
                JournalEntry saved = journalEntryRepository.save(entry);
                journalEntryService.postEntry(saved.getId(), "System");
                return saved;
        }

        private AccountSelection resolveIncomingPaymentAccount(String paymentMode) {
                String normalizedMode = normalizePaymentMode(paymentMode);
                return switch (normalizedMode) {
                        case "CASH" -> new AccountSelection("Cash", ACC_CASH);
                        case "CARD", "CREDIT_CARD" -> new AccountSelection("Merchant Clearing",
                                        ACC_MERCHANT_CLEARING);
                        default -> new AccountSelection("Bank", ACC_BANK);
                };
        }

        private AccountSelection resolveOutgoingPaymentAccount(String paymentMode) {
                String normalizedMode = normalizePaymentMode(paymentMode);
                return switch (normalizedMode) {
                        case "CASH" -> new AccountSelection("Cash", ACC_CASH);
                        default -> new AccountSelection("Bank", ACC_BANK);
                };
        }

        private String normalizePaymentMode(String paymentMode) {
                if (paymentMode == null) {
                        return "";
                }
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
