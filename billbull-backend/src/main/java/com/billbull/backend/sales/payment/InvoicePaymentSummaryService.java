package com.billbull.backend.sales.payment;

import com.billbull.backend.pos.checkout.PosPaymentAllocationType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * Reconstructs how invoices were paid, as payment allocations, from the recorded
 * {@code sales_payments} rows.
 *
 * <p>Back-office screens used to read the invoice's stored {@code paymentMode} string and
 * pattern-match it ("is it Cash? is it Mixed?"). That string is a label, not data — it cannot
 * say how much went on each tender, and for older sales it can say "Mixed", which tells a user
 * nothing. The Payment rows can: there is one per tender, carrying its own mode, amount,
 * reference and bank. This turns them back into allocations so every administrative screen
 * shows the same breakdown the receipt printed.
 */
@Service
public class InvoicePaymentSummaryService {

    private final PaymentRepository paymentRepository;

    public InvoicePaymentSummaryService(PaymentRepository paymentRepository) {
        this.paymentRepository = paymentRepository;
    }

    /**
     * Payment allocations for each requested invoice, keyed by invoice number.
     *
     * <p>Invoices with no recorded tender are simply absent from the result — an unpaid credit
     * sale has nothing to show, and the caller falls back to the invoice's own status. Rows are
     * returned oldest-first so the breakdown reads in the order the cashier took the payments,
     * matching the receipt.
     */
    @Transactional(readOnly = true)
    public Map<String, InvoicePaymentSummary> summariesFor(Collection<String> invoiceNumbers) {
        if (invoiceNumbers == null || invoiceNumbers.isEmpty()) return Map.of();

        List<String> numbers = invoiceNumbers.stream()
                .filter(n -> n != null && !n.isBlank())
                .distinct()
                .toList();
        if (numbers.isEmpty()) return Map.of();

        // findTenderForInvoices returns latest-first; reverse so the breakdown reads in the
        // order the tenders were actually taken.
        List<Payment> rows = new ArrayList<>(paymentRepository.findTenderForInvoices(numbers));
        Collections.reverse(rows);

        Map<String, List<Payment>> byInvoice = new LinkedHashMap<>();
        for (Payment p : rows) {
            if (p.getLinkedInvoice() == null) continue;
            byInvoice.computeIfAbsent(p.getLinkedInvoice(), k -> new ArrayList<>()).add(p);
        }

        Map<String, InvoicePaymentSummary> result = new LinkedHashMap<>();
        byInvoice.forEach((invoiceNumber, payments) -> result.put(
                invoiceNumber, buildSummary(invoiceNumber, payments)));
        return result;
    }

    /** Convenience for a single invoice; null when nothing was recorded against it. */
    @Transactional(readOnly = true)
    public InvoicePaymentSummary summaryFor(String invoiceNumber) {
        return summariesFor(List.of(invoiceNumber == null ? "" : invoiceNumber)).get(invoiceNumber);
    }

    private InvoicePaymentSummary buildSummary(String invoiceNumber, List<Payment> payments) {
        List<InvoicePaymentSummary.Allocation> allocations = new ArrayList<>();
        LinkedHashSet<String> summaryParts = new LinkedHashSet<>();
        BigDecimal totalReceived = BigDecimal.ZERO;

        for (Payment p : payments) {
            String label = p.getPaymentMode() != null && !p.getPaymentMode().isBlank()
                    ? p.getPaymentMode().trim() : "Cash";
            // A recorded mode is either a known tender name or a card network ("Visa",
            // "Mastercard") — the latter is the only thing the POS ever wrote that isn't in
            // the enum, so an unrecognised label is a card.
            PosPaymentAllocationType parsed = PosPaymentAllocationType.parse(label);
            String type = (parsed != null ? parsed : PosPaymentAllocationType.CARD).name();
            BigDecimal amount = p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO;

            allocations.add(new InvoicePaymentSummary.Allocation(
                    label, type, amount, p.getReferenceNumber(), p.getBankName()));
            summaryParts.add(label);
            totalReceived = totalReceived.add(amount);
        }

        return new InvoicePaymentSummary(
                invoiceNumber, allocations, String.join(" + ", summaryParts), totalReceived);
    }
}
