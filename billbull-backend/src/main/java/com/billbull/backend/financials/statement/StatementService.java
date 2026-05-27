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
import java.util.stream.Collectors;

import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.purchase.invoice.PurchaseInvoice;
import com.billbull.backend.purchase.payment.PaymentVoucher;

@Service
public class StatementService {

    private static final String OPENING_BALANCE_TYPE = "OPENING_BALANCE";

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

        // 3. Sort Chronologically
        combined.sort(Comparator
                .comparing(StatementEntryDTO::getTransactionDate)
                .thenComparing(StatementEntryDTO::getTransactionDateTime)
                .thenComparing(e -> e.getDocumentNo() == null ? "" : e.getDocumentNo()));

        // 4. Calculate Running Balances
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

            // AR formula: Balance = Previous + Debit - Credit
            runningBalance = runningBalance.add(debit).subtract(credit);
            entry.setRunningBalance(runningBalance);
        }

        enrichCustomerEntries(combined);

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

        for (StatementEntryDTO entry : entries) {
            String type = entry.getType() == null ? "" : entry.getType();
            if (OPENING_BALANCE_TYPE.equals(type)) {
                if (entry.getDescription() == null) entry.setDescription("Opening Balance");
                if (entry.getReference() == null) entry.setReference("Brought forward");
            } else if ("INVOICE".equals(type)) {
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
                if (rv != null) {
                    entry.setReference(firstNonBlank(rv.getReference(), rv.getNotes(), rv.getPaymentMode(), "-"));
                } else {
                    entry.setReference("-");
                }
            } else {
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
        combined.addAll(invoices);
        combined.addAll(payments);

        // 3. Sort Chronologically
        combined.sort(Comparator
                .comparing(StatementEntryDTO::getTransactionDate)
                .thenComparing(StatementEntryDTO::getTransactionDateTime)
                .thenComparing(e -> e.getDocumentNo() == null ? "" : e.getDocumentNo()));

        // 4. Calculate Running Balances
        BigDecimal runningBalance = openingBalance;
        BigDecimal totalDebit = BigDecimal.ZERO;
        BigDecimal totalCredit = BigDecimal.ZERO;

        for (StatementEntryDTO entry : combined) {
            BigDecimal debit = entry.getDebit() != null ? entry.getDebit() : BigDecimal.ZERO;
            BigDecimal credit = entry.getCredit() != null ? entry.getCredit() : BigDecimal.ZERO;

            totalDebit = totalDebit.add(debit);
            totalCredit = totalCredit.add(credit);

            // AP formula: Balance = Previous + Credit - Debit
            runningBalance = runningBalance.add(credit).subtract(debit);
            entry.setRunningBalance(runningBalance);
        }

        enrichVendorEntries(combined);

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

        for (StatementEntryDTO entry : entries) {
            String type = entry.getType() == null ? "" : entry.getType();
            if ("INVOICE".equals(type)) {
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
                if (pv != null) {
                    entry.setReference(firstNonBlank(pv.getReferenceNumber(), pv.getNotes(), "-"));
                } else {
                    entry.setReference("-");
                }
            } else {
                if (entry.getDescription() == null) entry.setDescription(prettyType(type));
                if (entry.getReference() == null) entry.setReference("-");
            }
        }
    }
}
