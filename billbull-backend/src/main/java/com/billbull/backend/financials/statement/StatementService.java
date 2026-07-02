package com.billbull.backend.financials.statement;

import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.purchase.payment.PaymentVoucherRepository;
import com.billbull.backend.purchase.vendor.VendorRepository;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.customerledger.OpeningInvoice;
import com.billbull.backend.sales.customerledger.OpeningInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.purchase.invoice.PurchaseInvoice;
import com.billbull.backend.purchase.payment.PaymentVoucher;

@Service
public class StatementService {

    private static final String OPENING_BALANCE_TYPE = "OPENING_BALANCE";

    // ── Display-order priorities (QA spec rows 1-9) ───────────────────────────
    // Lower number = appears earlier in the SoA.
    private static final int PRI_OPENING_BALANCE      = 0;  // Row 1
    private static final int PRI_SO_ADVANCE_RECEIPT   = 1;  // Row 2 — advance received against SO
    private static final int PRI_INVOICE              = 2;  // Row 3 — sales / purchase invoices
    private static final int PRI_SO_ADVANCE_ADJ       = 3;  // Row 4 — SO advance applied to invoice
    private static final int PRI_PAYMENT_RECEIPT      = 4;  // Row 5 — payment received against invoice
    private static final int PRI_GENERAL_ADVANCE      = 5;  // Row 6 — advance not linked to SO/invoice
    private static final int PRI_RETURN_CREDIT        = 6;  // Row 7 — sales return / credit note
    private static final int PRI_REFUND               = 7;  // Row 8 — refund paid/received
    private static final int PRI_DEFAULT              = 4;  // Fallback (same slot as payment receipts)

    @Autowired
    private SalesInvoiceRepository salesInvoiceRepository;

    @Autowired
    private ReceiptVoucherRepository receiptVoucherRepository;

    @Autowired
    private PurchaseInvoiceRepository purchaseInvoiceRepository;

    @Autowired
    private PaymentVoucherRepository paymentVoucherRepository;

    @Autowired
    private OpeningInvoiceRepository openingInvoiceRepository;

    @Autowired
    private CustomerRepository customerRepository;

    @Autowired
    private VendorRepository vendorRepository;

    public StatementResponse getCustomerStatement(String customerCode, LocalDate startDate, LocalDate endDate) {
        StatementResponse resp = new StatementResponse();
        resp.setAccountCode(customerCode);

        // 1. Calculate Opening Balance
        // QA-002 fix: also include the customer's opening invoice migration amounts,
        // which represent pre-system historical balances not captured in SalesInvoice table.
        Double invBefore = salesInvoiceRepository.calculateOpeningBalance(customerCode, startDate);
        // Use ReceiptVoucher as the authoritative credit source: captures payments recorded
        // via both the Payment module and the Sales Invoice "Record Payment" action.
        java.math.BigDecimal rvBefore = receiptVoucherRepository.sumCompletedAmountBeforeDate(customerCode, startDate);
        Double payBefore = rvBefore != null ? rvBefore.doubleValue() : 0.0;

        BigDecimal dInvBefore = invBefore != null ? BigDecimal.valueOf(invBefore) : BigDecimal.ZERO;
        BigDecimal dPayBefore = payBefore != null ? BigDecimal.valueOf(payBefore) : BigDecimal.ZERO;

        // Sum the original migrated AR balance. Current outstanding is reduced by
        // receipt vouchers, while SoA still needs the opening baseline so dated
        // payments are not double-counted.
        List<OpeningInvoice> openingInvoices = openingInvoiceRepository.findByCustomer_Code(customerCode);
        BigDecimal dOpeningInvBalance = openingInvoices.stream()
                .map(this::resolveOpeningBalanceAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (openingInvoices.isEmpty()) {
            dOpeningInvBalance = customerRepository.findByCode(customerCode)
                    .map(customer -> customer.getBalance() != null ? customer.getBalance() : BigDecimal.ZERO)
                    .orElse(BigDecimal.ZERO);
        }

        BigDecimal openingBalance = dOpeningInvBalance.add(dInvBefore).subtract(dPayBefore);
        resp.setOpeningBalance(openingBalance);

        // 2. Fetch Entries
        List<StatementEntryDTO> invoices = salesInvoiceRepository.findStatementEntries(customerCode, startDate,
                endDate);
        List<StatementEntryDTO> payments = receiptVoucherRepository.findStatementEntriesByCustomerCode(
                customerCode, startDate, endDate);

        List<StatementEntryDTO> combined = new ArrayList<>();
        StatementEntryDTO openingEntry = buildOpeningBalanceEntry(startDate, openingBalance, openingInvoices);
        if (openingEntry != null) {
            combined.add(openingEntry);
        }
        combined.addAll(invoices);
        combined.addAll(payments);

        // 3. Enrich FIRST so sortPriority is set before we sort.
        enrichCustomerEntries(combined);

        // 4. Sort: date → type-display-priority → intra-day time → document sequence.
        //    Opening balance always leads (priority 0, time = startOfDay−1ns).
        combined.sort(Comparator
                .comparing(StatementEntryDTO::getTransactionDate,
                        Comparator.nullsFirst(Comparator.naturalOrder()))
                .thenComparingInt(StatementEntryDTO::getSortPriority)
                .thenComparing(e -> e.getTransactionDateTime() != null
                        ? e.getTransactionDateTime()
                        : (e.getTransactionDate() != null ? e.getTransactionDate().atStartOfDay() : LocalDateTime.MIN))
                .thenComparing(e -> e.getDocumentNo() != null ? e.getDocumentNo() : ""));

        // 5. Calculate Running Balances in display order.
        BigDecimal runningBalance = openingBalance;
        BigDecimal totalDebit = BigDecimal.ZERO;
        BigDecimal totalCredit = BigDecimal.ZERO;

        for (StatementEntryDTO entry : combined) {
            if (isOpeningBalanceEntry(entry)) {
                entry.setRunningBalance(openingBalance);
                continue;
            }

            BigDecimal debit = entry.getDebit() != null ? entry.getDebit() : BigDecimal.ZERO;
            BigDecimal credit = entry.getCredit() != null ? entry.getCredit() : BigDecimal.ZERO;

            totalDebit = totalDebit.add(debit);
            totalCredit = totalCredit.add(credit);

            // AR formula: Balance = Previous + Debit - Credit.
            // Unapplied customer advances are shown as a line item but held as a
            // separate liability (Customer Advance 2104) until applied to an
            // invoice, so they must not net against the AR running balance yet.
            if (!entry.isExcludeFromBalance()) {
                runningBalance = runningBalance.add(debit).subtract(credit);
            }
            entry.setRunningBalance(runningBalance);
        }

        resp.setEntries(combined);
        resp.setTotalDebit(totalDebit);
        resp.setTotalCredit(totalCredit);
        resp.setClosingBalance(runningBalance);

        return resp;
    }

    // QA-018: backfill description + reference per entry by batch-fetching the
    // underlying SalesInvoice / ReceiptVoucher rows. Done as a post-processing
    // step so the existing JPQL constructors stay untouched.
    private void enrichCustomerEntries(List<StatementEntryDTO> entries) {
        if (entries == null || entries.isEmpty()) return;

        List<String> invoiceNumbers = entries.stream()
                .filter(e -> "INVOICE".equals(e.getType()))
                .map(StatementEntryDTO::getDocumentNo)
                .filter(n -> n != null && !n.isBlank())
                .distinct()
                .collect(Collectors.toList());
        List<String> receiptIds = entries.stream()
                .filter(e -> e.getType() != null && e.getType().contains("PAYMENT"))
                .map(StatementEntryDTO::getDocumentNo)
                .filter(n -> n != null && !n.isBlank())
                .distinct()
                .collect(Collectors.toList());

        Map<String, SalesInvoice> invoiceMap = invoiceNumbers.isEmpty()
                ? new HashMap<>()
                : salesInvoiceRepository.findByInvoiceNumberIn(invoiceNumbers).stream()
                        .collect(Collectors.toMap(SalesInvoice::getInvoiceNumber, inv -> inv, (a, b) -> a));
        Map<String, ReceiptVoucher> receiptMap = receiptIds.isEmpty()
                ? new HashMap<>()
                : receiptVoucherRepository.findByVoucherIdIn(receiptIds).stream()
                        .collect(Collectors.toMap(ReceiptVoucher::getVoucherId, rv -> rv, (a, b) -> a));

        // Batch-fetch the sales invoices that receipts were raised against,
        // so we can show the settled invoice number in the Reference column.
        Set<Long> settledInvIds = receiptMap.values().stream()
                .map(ReceiptVoucher::getSalesInvoiceId)
                .filter(id -> id != null)
                .collect(Collectors.toSet());
        Map<Long, String> invNumberById = settledInvIds.isEmpty()
                ? new HashMap<>()
                : salesInvoiceRepository.findAllById(settledInvIds).stream()
                        .collect(Collectors.toMap(SalesInvoice::getId, SalesInvoice::getInvoiceNumber, (a, b) -> a));

        for (StatementEntryDTO entry : entries) {
            String type = entry.getType() == null ? "" : entry.getType();
            if (OPENING_BALANCE_TYPE.equals(type)) {
                entry.setSortPriority(PRI_OPENING_BALANCE);
                if (entry.getDescription() == null) entry.setDescription("Opening Balance");
                if (entry.getReference() == null) entry.setReference("Brought forward");
            } else if ("INVOICE".equals(type)) {
                entry.setSortPriority(PRI_INVOICE);
                SalesInvoice inv = invoiceMap.get(entry.getDocumentNo());
                entry.setDescription("Sales Invoice"
                        + (inv != null && inv.getCustomerName() != null ? " — " + inv.getCustomerName() : ""));
                if (inv != null) {
                    String ref = firstNonBlank(inv.getLinkedSalesOrder(), inv.getLinkedDeliveryNote(),
                            inv.getLinkedProforma(), inv.getLinkedQuotation());
                    entry.setReference(ref != null ? ref : "-");
                } else {
                    entry.setReference("-");
                }
            } else if (type.contains("PAYMENT") || type.contains("RECEIPT")) {
                ReceiptVoucher rv = receiptMap.get(entry.getDocumentNo());
                entry.setDescription("Receipt"
                        + (rv != null && rv.getPaymentMode() != null ? " (" + rv.getPaymentMode() + ")" : ""));

                // ── Assign display-order priority from ReceiptPurpose + linkage ──
                if (rv != null) {
                    com.billbull.backend.financials.receiptvoucher.ReceiptPurpose purpose = rv.getPurpose();
                    boolean hasSO      = rv.getSalesOrderId()  != null;
                    boolean hasInvoice = rv.getSalesInvoiceId() != null;

                    if (purpose == com.billbull.backend.financials.receiptvoucher.ReceiptPurpose.REFUND_IN) {
                        entry.setSortPriority(PRI_REFUND);
                        entry.setDescription("Refund Paid to Customer");
                    } else if (purpose == com.billbull.backend.financials.receiptvoucher.ReceiptPurpose.ADVANCE_RECEIVED) {
                        if (hasSO && hasInvoice) {
                            // SO advance applied against a specific invoice
                            entry.setSortPriority(PRI_SO_ADVANCE_ADJ);
                            entry.setDescription("SO Advance Adjustment"
                                    + (rv.getPaymentMode() != null ? " (" + rv.getPaymentMode() + ")" : ""));
                        } else if (hasSO) {
                            // Advance received against Sales Order, not yet applied
                            entry.setSortPriority(PRI_SO_ADVANCE_RECEIPT);
                            entry.setDescription("SO Advance Receipt"
                                    + (rv.getPaymentMode() != null ? " (" + rv.getPaymentMode() + ")" : ""));
                        } else {
                            // General advance — no SO or invoice link
                            entry.setSortPriority(PRI_GENERAL_ADVANCE);
                            entry.setDescription("Advance Received"
                                    + (rv.getPaymentMode() != null ? " (" + rv.getPaymentMode() + ")" : ""));
                        }
                        // An advance only reduces AR once it's applied to an invoice
                        // (AdvanceApplicationService.apply → Dr Customer Advance / Cr AR).
                        // Until then it's a separate customer-advance liability and must
                        // not net against the invoiced balance shown here.
                        entry.setExcludeFromBalance(!hasInvoice);
                    } else {
                        // AGAINST_INVOICE or any other purpose → payment receipt
                        entry.setSortPriority(PRI_PAYMENT_RECEIPT);
                    }

                    // Show settled invoice number first; fall back to user-entered reference.
                    String settledInvNo = hasInvoice ? invNumberById.get(rv.getSalesInvoiceId()) : null;
                    entry.setReference(firstNonBlank(settledInvNo, rv.getReference(), rv.getNotes(), rv.getPaymentMode(), "-"));
                } else {
                    entry.setSortPriority(PRI_DEFAULT);
                    entry.setReference("-");
                }
            } else {
                entry.setSortPriority(PRI_DEFAULT);
                if (entry.getDescription() == null) entry.setDescription(prettyType(type));
                if (entry.getReference() == null) entry.setReference("-");
            }
        }
    }

    private String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String v : values) {
            if (v != null && !v.isBlank()) return v;
        }
        return null;
    }

    private String prettyType(String type) {
        if (type == null || type.isBlank()) return "-";
        StringBuilder sb = new StringBuilder();
        for (String part : type.split("_")) {
            if (part.isBlank()) continue;
            if (sb.length() > 0) sb.append(' ');
            sb.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1).toLowerCase());
        }
        return sb.toString();
    }

    private StatementEntryDTO buildOpeningBalanceEntry(LocalDate startDate, BigDecimal openingBalance,
            List<OpeningInvoice> openingInvoices) {
        if (openingBalance == null || openingBalance.compareTo(BigDecimal.ZERO) == 0) {
            return null;
        }

        BigDecimal debit = openingBalance.compareTo(BigDecimal.ZERO) > 0 ? openingBalance : BigDecimal.ZERO;
        BigDecimal credit = openingBalance.compareTo(BigDecimal.ZERO) < 0 ? openingBalance.abs() : BigDecimal.ZERO;

        String documentNo = resolveOpeningBalanceDocumentNo(openingInvoices);
        LocalDateTime sortTime = startDate.atStartOfDay().minusNanos(1);
        return new StatementEntryDTO(startDate, sortTime, documentNo, OPENING_BALANCE_TYPE, debit, credit, "OPENING");
    }

    // Vendor (AP) opening-balance row. Positive balance means "We Owe" → credit,
    // matching the AP running-balance formula (running = previous + credit - debit).
    private StatementEntryDTO buildVendorOpeningBalanceEntry(LocalDate startDate, BigDecimal openingBalance) {
        if (openingBalance == null || openingBalance.compareTo(BigDecimal.ZERO) == 0) {
            return null;
        }

        BigDecimal credit = openingBalance.compareTo(BigDecimal.ZERO) > 0 ? openingBalance : BigDecimal.ZERO;
        BigDecimal debit = openingBalance.compareTo(BigDecimal.ZERO) < 0 ? openingBalance.abs() : BigDecimal.ZERO;

        LocalDateTime sortTime = startDate.atStartOfDay().minusNanos(1);
        return new StatementEntryDTO(startDate, sortTime, "Opening Balance", OPENING_BALANCE_TYPE, debit, credit,
                "OPENING");
    }

    private String resolveOpeningBalanceDocumentNo(List<OpeningInvoice> openingInvoices) {
        if (openingInvoices == null || openingInvoices.isEmpty()) {
            return "Opening Balance";
        }

        if (openingInvoices.size() == 1) {
            String number = openingInvoices.get(0).getNumber();
            return number != null && !number.isBlank() ? number : "Opening Balance";
        }

        return "Opening Balance (" + openingInvoices.size() + " bills)";
    }

    private boolean isOpeningBalanceEntry(StatementEntryDTO entry) {
        return entry != null && OPENING_BALANCE_TYPE.equals(entry.getType());
    }

    private BigDecimal resolveOpeningBalanceAmount(OpeningInvoice invoice) {
        BigDecimal openingBalance = invoice.getOpeningBalanceAmount();
        if (openingBalance != null && openingBalance.compareTo(BigDecimal.ZERO) > 0) {
            return openingBalance;
        }

        BigDecimal outstanding = invoice.getOutstanding();
        if (outstanding != null && outstanding.compareTo(BigDecimal.ZERO) > 0) {
            return outstanding;
        }

        BigDecimal amount = invoice.getAmount();
        return amount != null ? amount : BigDecimal.ZERO;
    }

    public StatementResponse getVendorStatement(String vendorName, LocalDate startDate, LocalDate endDate) {
        StatementResponse resp = new StatementResponse();
        resp.setAccountName(vendorName);

        // 1. Calculate Opening Balance
        BigDecimal invBefore = purchaseInvoiceRepository.calculateOpeningBalance(vendorName, startDate);
        BigDecimal payBefore = paymentVoucherRepository.calculateOpeningBalance(vendorName, startDate);

        if (invBefore == null)
            invBefore = BigDecimal.ZERO;
        if (payBefore == null)
            payBefore = BigDecimal.ZERO;

        // QA-013 fix: include vendor's migration opening balance (pre-system historical AP)
        BigDecimal vendorOpeningBal = vendorRepository.findByName(vendorName)
                .map(v -> v.getOpeningBalance() != null ? v.getOpeningBalance() : BigDecimal.ZERO)
                .orElse(BigDecimal.ZERO);

        // AP formula: Balance = VendorOpeningBalance + Credits (Invoices) - Debits (Payments)
        BigDecimal openingBalance = vendorOpeningBal.add(invBefore).subtract(payBefore);
        resp.setOpeningBalance(openingBalance);

        // 2. Fetch Entries
        List<StatementEntryDTO> invoices = purchaseInvoiceRepository.findStatementEntries(vendorName, startDate,
                endDate);
        List<StatementEntryDTO> payments = paymentVoucherRepository.findStatementEntries(vendorName, startDate,
                endDate);

        List<StatementEntryDTO> combined = new ArrayList<>();
        StatementEntryDTO openingEntry = buildVendorOpeningBalanceEntry(startDate, openingBalance);
        if (openingEntry != null) {
            combined.add(openingEntry);
        }
        combined.addAll(invoices);
        combined.addAll(payments);

        // 3. Enrich FIRST so sortPriority is set before we sort.
        enrichVendorEntries(combined);

        // 4. Sort: date → type-display-priority → intra-day time → document sequence.
        combined.sort(Comparator
                .comparing(StatementEntryDTO::getTransactionDate,
                        Comparator.nullsFirst(Comparator.naturalOrder()))
                .thenComparingInt(StatementEntryDTO::getSortPriority)
                .thenComparing(e -> e.getTransactionDateTime() != null
                        ? e.getTransactionDateTime()
                        : (e.getTransactionDate() != null ? e.getTransactionDate().atStartOfDay() : LocalDateTime.MIN))
                .thenComparing(e -> e.getDocumentNo() != null ? e.getDocumentNo() : ""));

        // 5. Calculate Running Balances in display order.
        BigDecimal runningBalance = openingBalance;
        BigDecimal totalDebit = BigDecimal.ZERO;
        BigDecimal totalCredit = BigDecimal.ZERO;

        for (StatementEntryDTO entry : combined) {
            if (isOpeningBalanceEntry(entry)) {
                entry.setRunningBalance(openingBalance);
                continue;
            }

            BigDecimal debit = entry.getDebit() != null ? entry.getDebit() : BigDecimal.ZERO;
            BigDecimal credit = entry.getCredit() != null ? entry.getCredit() : BigDecimal.ZERO;

            totalDebit = totalDebit.add(debit);
            totalCredit = totalCredit.add(credit);

            // AP formula: Balance = Previous + Credit - Debit
            runningBalance = runningBalance.add(credit).subtract(debit);
            entry.setRunningBalance(runningBalance);
        }

        resp.setEntries(combined);
        resp.setTotalDebit(totalDebit);
        resp.setTotalCredit(totalCredit);
        resp.setClosingBalance(runningBalance);

        return resp;
    }

    // QA-018: Vendor SoA — analogous to enrichCustomerEntries.
    private void enrichVendorEntries(List<StatementEntryDTO> entries) {
        if (entries == null || entries.isEmpty()) return;

        List<String> invoiceNumbers = entries.stream()
                .filter(e -> "INVOICE".equals(e.getType()))
                .map(StatementEntryDTO::getDocumentNo)
                .filter(n -> n != null && !n.isBlank())
                .distinct()
                .collect(Collectors.toList());
        List<String> voucherNumbers = entries.stream()
                .filter(e -> e.getType() != null && e.getType().contains("PAYMENT"))
                .map(StatementEntryDTO::getDocumentNo)
                .filter(n -> n != null && !n.isBlank())
                .distinct()
                .collect(Collectors.toList());

        Map<String, PurchaseInvoice> invoiceMap = invoiceNumbers.isEmpty()
                ? new HashMap<>()
                : purchaseInvoiceRepository.findByInvoiceNumberIn(invoiceNumbers).stream()
                        .collect(Collectors.toMap(PurchaseInvoice::getInvoiceNumber, inv -> inv, (a, b) -> a));
        Map<String, PaymentVoucher> voucherMap = voucherNumbers.isEmpty()
                ? new HashMap<>()
                : paymentVoucherRepository.findByVoucherNumberIn(voucherNumbers).stream()
                        .collect(Collectors.toMap(PaymentVoucher::getVoucherNumber, pv -> pv, (a, b) -> a));

        // Batch-fetch the purchase invoices that payments were raised against,
        // so we can show the settled invoice number in the Reference column.
        Set<Long> settledInvIds = voucherMap.values().stream()
                .map(PaymentVoucher::getInvoiceId)
                .filter(id -> id != null)
                .collect(Collectors.toSet());
        Map<Long, String> invNumberById = settledInvIds.isEmpty()
                ? new HashMap<>()
                : purchaseInvoiceRepository.findAllById(settledInvIds).stream()
                        .collect(Collectors.toMap(PurchaseInvoice::getId, PurchaseInvoice::getInvoiceNumber, (a, b) -> a));

        for (StatementEntryDTO entry : entries) {
            String type = entry.getType() == null ? "" : entry.getType();
            if (OPENING_BALANCE_TYPE.equals(type)) {
                entry.setSortPriority(PRI_OPENING_BALANCE);
                if (entry.getDescription() == null) entry.setDescription("Opening Balance");
                if (entry.getReference() == null) entry.setReference("Brought forward");
            } else if ("INVOICE".equals(type)) {
                entry.setSortPriority(PRI_INVOICE);
                PurchaseInvoice inv = invoiceMap.get(entry.getDocumentNo());
                entry.setDescription("Purchase Invoice"
                        + (inv != null && inv.getVendorName() != null ? " — " + inv.getVendorName() : ""));
                if (inv != null) {
                    entry.setReference(firstNonBlank(inv.getVendorInvoiceNo(), inv.getReferenceNo(),
                            inv.getGrnNo(), "-"));
                } else {
                    entry.setReference("-");
                }
            } else if (type.contains("PAYMENT")) {
                PaymentVoucher pv = voucherMap.get(entry.getDocumentNo());
                entry.setDescription("Payment Voucher"
                        + (pv != null && pv.getPaymentMode() != null ? " (" + pv.getPaymentMode() + ")" : ""));

                // ── Assign display-order priority from PaymentVoucher linkage ──
                if (pv != null) {
                    boolean hasInvoice = pv.getInvoiceId() != null;
                    boolean hasLpo     = pv.getLpoId()     != null;

                    if (hasLpo && !hasInvoice) {
                        // Advance paid against LPO, not yet applied to a purchase invoice
                        entry.setSortPriority(PRI_SO_ADVANCE_RECEIPT);
                        entry.setDescription("LPO Advance Payment"
                                + (pv.getPaymentMode() != null ? " (" + pv.getPaymentMode() + ")" : ""));
                    } else if (hasLpo && hasInvoice) {
                        // LPO advance applied against a specific purchase invoice
                        entry.setSortPriority(PRI_SO_ADVANCE_ADJ);
                        entry.setDescription("LPO Advance Adjustment"
                                + (pv.getPaymentMode() != null ? " (" + pv.getPaymentMode() + ")" : ""));
                    } else if (hasInvoice) {
                        // Direct payment against a purchase invoice
                        entry.setSortPriority(PRI_PAYMENT_RECEIPT);
                    } else {
                        // General / on-account payment (no invoice or LPO link)
                        entry.setSortPriority(PRI_GENERAL_ADVANCE);
                        entry.setDescription("General Payment"
                                + (pv.getPaymentMode() != null ? " (" + pv.getPaymentMode() + ")" : ""));
                    }

                    // Show settled invoice number first; fall back to user reference.
                    String settledInvNo = hasInvoice ? invNumberById.get(pv.getInvoiceId()) : null;
                    entry.setReference(firstNonBlank(settledInvNo, pv.getReferenceNumber(), pv.getNotes(), "-"));
                } else {
                    entry.setSortPriority(PRI_DEFAULT);
                    entry.setReference("-");
                }
            } else {
                entry.setSortPriority(PRI_DEFAULT);
                if (entry.getDescription() == null) entry.setDescription(prettyType(type));
                if (entry.getReference() == null) entry.setReference("-");
            }
        }
    }
}
