package com.billbull.backend.sales.payment;

import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.billbull.backend.sales.payment.PaymentReconciliationFinding.Code;
import static com.billbull.backend.sales.payment.PaymentReconciliationFinding.Severity;

/**
 * Checks that an invoice's payment adds up, and says precisely how it doesn't when it fails.
 *
 * <p>A settled sale is recorded in three places that must agree: the invoice's own
 * {@code amountPaid} and {@code paymentMode}, the individual {@code sales_payments} tender
 * rows, and the customer's outstanding balance. Nothing previously compared them, so a
 * divergence — a payment row that failed to write, a stale label, a duplicate posted by a
 * double-click — would sit undetected until someone counted a drawer.
 *
 * <p>This is the one implementation of that reconciliation. It is read-only and never
 * corrects anything: a diagnostic that silently repairs data destroys the evidence of how the
 * data got that way.
 */
@Service
public class PaymentReconciliationService {

    /** Currency tolerance — half a fils, so 2-dp rounding never raises a false alarm. */
    public static final BigDecimal TOLERANCE = new BigDecimal("0.005");

    private final SalesInvoiceRepository invoiceRepository;
    private final InvoicePaymentSummaryService summaryService;

    public PaymentReconciliationService(SalesInvoiceRepository invoiceRepository,
                                        InvoicePaymentSummaryService summaryService) {
        this.invoiceRepository = invoiceRepository;
        this.summaryService = summaryService;
    }

    /**
     * Diagnoses one invoice.
     *
     * @throws IllegalArgumentException when the invoice does not exist — a caller asking about
     *         an unknown invoice has a different problem than one whose payment disagrees, and
     *         conflating them wastes a support engineer's time.
     */
    @Transactional(readOnly = true)
    public InvoicePaymentDiagnostics diagnose(String invoiceNumber) {
        SalesInvoice invoice = invoiceRepository.findByInvoiceNumber(invoiceNumber)
                .orElseThrow(() -> new IllegalArgumentException("No invoice numbered " + invoiceNumber));
        return diagnose(invoice, summaryService.summaryFor(invoiceNumber));
    }

    /**
     * Diagnoses many invoices with a fixed number of queries — one for the invoices, one for
     * every tender row across all of them. Deliberately not a loop over {@link #diagnose},
     * which would be 2N queries and turn a bulk health check into a query storm.
     */
    @Transactional(readOnly = true)
    public List<InvoicePaymentDiagnostics> diagnoseAll(Collection<String> invoiceNumbers) {
        if (invoiceNumbers == null || invoiceNumbers.isEmpty()) return List.of();

        List<String> numbers = invoiceNumbers.stream()
                .filter(n -> n != null && !n.isBlank()).distinct().toList();
        if (numbers.isEmpty()) return List.of();

        Map<String, InvoicePaymentSummary> summaries = summaryService.summariesFor(numbers);
        Map<String, SalesInvoice> invoices = new LinkedHashMap<>();
        invoiceRepository.findByInvoiceNumberIn(numbers)
                .forEach(inv -> invoices.put(inv.getInvoiceNumber(), inv));

        List<InvoicePaymentDiagnostics> results = new ArrayList<>();
        for (String number : numbers) {
            SalesInvoice invoice = invoices.get(number);
            if (invoice == null) continue; // unknown number — skip rather than fail the batch
            results.add(diagnose(invoice, summaries.get(number)));
        }
        return results;
    }

    // ── The checks ─────────────────────────────────────────────────────────────

    private InvoicePaymentDiagnostics diagnose(SalesInvoice invoice, InvoicePaymentSummary summary) {
        BigDecimal invoiceTotal = round(nz(invoice.getInvoiceTotal()));
        BigDecimal amountPaid = round(nz(invoice.getAmountPaid()));
        String storedLabel = invoice.getPaymentMode();

        List<InvoicePaymentSummary.Allocation> allocations =
                summary != null ? summary.getAllocations() : List.of();
        BigDecimal totalReceived = round(summary != null ? summary.getTotalReceived() : BigDecimal.ZERO);
        String derivedLabel = summary != null ? summary.getSummaryLabel() : null;
        BigDecimal outstanding = round(invoiceTotal.subtract(totalReceived));

        List<PaymentReconciliationFinding> findings = new ArrayList<>();

        // (1) The invoice claims money was collected, but nothing was recorded against it.
        // This is the shape of a settlement that half-committed.
        if (allocations.isEmpty() && amountPaid.compareTo(TOLERANCE) > 0) {
            findings.add(new PaymentReconciliationFinding(Code.MISSING_PAYMENT_ROWS, Severity.ERROR,
                    String.format("Invoice reports %s paid but has no recorded tender rows.",
                            amountPaid.toPlainString())));
        }

        // (2) The tender rows and the invoice disagree about how much came in. An advance
        // applied at invoice creation is a Receipt Voucher rather than a Payment row, so a
        // shortfall here is expected for those and is reported as a warning; an excess never is.
        if (!allocations.isEmpty()) {
            BigDecimal delta = totalReceived.subtract(amountPaid).abs();
            if (delta.compareTo(TOLERANCE) > 0) {
                boolean tenderExceedsInvoice = totalReceived.compareTo(amountPaid) > 0;
                findings.add(new PaymentReconciliationFinding(
                        Code.RECEIVED_DOES_NOT_MATCH_AMOUNT_PAID,
                        tenderExceedsInvoice ? Severity.ERROR : Severity.WARNING,
                        String.format(
                                "Recorded tender totals %s but the invoice reports %s paid (difference %s).%s",
                                totalReceived.toPlainString(), amountPaid.toPlainString(),
                                delta.toPlainString(),
                                tenderExceedsInvoice ? ""
                                        : " An advance applied at invoice creation posts a receipt voucher"
                                          + " rather than a tender row, which explains a shortfall.")));
            }
        }

        // (3) Received + still-outstanding must equal the invoice total. This is the identity
        // the whole model rests on; if it fails, one of the three figures is wrong.
        BigDecimal reconstructed = round(totalReceived.add(outstanding));
        if (invoiceTotal.subtract(reconstructed).abs().compareTo(TOLERANCE) > 0) {
            findings.add(new PaymentReconciliationFinding(Code.TOTALS_DO_NOT_RECONCILE, Severity.ERROR,
                    String.format("Received %s + outstanding %s = %s, but the invoice total is %s.",
                            totalReceived.toPlainString(), outstanding.toPlainString(),
                            reconstructed.toPlainString(), invoiceTotal.toPlainString())));
        }

        // (4) More was collected than the invoice is worth. Cash overpayment is change and is
        // never recorded as tender, so this genuinely means over-collection.
        if (totalReceived.subtract(invoiceTotal).compareTo(TOLERANCE) > 0) {
            findings.add(new PaymentReconciliationFinding(Code.OVER_ALLOCATED, Severity.ERROR,
                    String.format("Recorded tender %s exceeds the invoice total %s.",
                            totalReceived.toPlainString(), invoiceTotal.toPlainString())));
        }

        // (5) Zero/negative tender rows. Harmless to totals but they corrupt the breakdown.
        for (InvoicePaymentSummary.Allocation a : allocations) {
            if (nz(a.getAmount()).compareTo(BigDecimal.ZERO) <= 0) {
                findings.add(new PaymentReconciliationFinding(Code.NON_POSITIVE_ALLOCATION, Severity.ERROR,
                        String.format("Tender row '%s' has a non-positive amount (%s).",
                                a.getLabel(), nz(a.getAmount()).toPlainString())));
            }
        }

        // (6) Two rows with the same mode, amount and reference are almost certainly one
        // payment recorded twice — the signature of a double-submitted settlement. Rows with
        // no reference are excluded: repeating a tender (Cash 20 then Cash 30) is legitimate,
        // and only a repeated *reference* distinguishes a duplicate from a genuine repeat.
        Set<String> seen = new HashSet<>();
        for (InvoicePaymentSummary.Allocation a : allocations) {
            String reference = a.getReference();
            if (reference == null || reference.isBlank()) continue;
            String fingerprint = a.getLabel() + '|' + nz(a.getAmount()).toPlainString()
                    + '|' + reference.trim().toLowerCase();
            if (!seen.add(fingerprint)) {
                findings.add(new PaymentReconciliationFinding(Code.DUPLICATE_PAYMENT_ROW, Severity.ERROR,
                        String.format("Two '%s' rows share amount %s and reference '%s'.",
                                a.getLabel(), nz(a.getAmount()).toPlainString(), reference.trim())));
            }
        }

        // (7) The invoice's stored label no longer describes the recorded tenders — cosmetic,
        // but it is what every list screen shows, so it is worth surfacing.
        if (derivedLabel != null && storedLabel != null && !storedLabel.isBlank()
                && !labelsAgree(storedLabel, derivedLabel)) {
            findings.add(new PaymentReconciliationFinding(Code.STORED_SUMMARY_STALE, Severity.WARNING,
                    String.format("Invoice is labelled '%s' but the recorded tenders read '%s'.",
                            storedLabel, derivedLabel)));
        }

        // (8) A pre-migration label. Harmless — the breakdown is reconstructed from the rows —
        // but it identifies which invoices predate progressive payments.
        if (storedLabel != null && storedLabel.trim().equalsIgnoreCase("Mixed")) {
            findings.add(new PaymentReconciliationFinding(Code.LEGACY_MIXED_LABEL, Severity.INFO,
                    "Invoice carries the historical 'Mixed' label; its breakdown is reconstructed"
                    + " from the recorded tenders."));
        }

        return new InvoicePaymentDiagnostics(
                invoice.getInvoiceNumber(), invoiceTotal, amountPaid, storedLabel,
                allocations, derivedLabel, totalReceived, outstanding,
                allocations.stream().map(InvoicePaymentSummary.Allocation::getLabel).toList(),
                allocations.stream().map(InvoicePaymentSummary.Allocation::getType).toList(),
                findings);
    }

    /**
     * Whether the stored and derived labels describe the same set of tenders. Compared as
     * unordered sets so a re-ordered split ("Visa + Cash" vs "Cash + Visa") isn't flagged —
     * the order is presentational, the set is the claim.
     */
    private boolean labelsAgree(String stored, String derived) {
        return splitLabel(stored).equals(splitLabel(derived));
    }

    private Set<String> splitLabel(String label) {
        Set<String> parts = new LinkedHashSet<>();
        for (String p : label.split("\\+")) {
            String trimmed = p.trim().toLowerCase();
            if (!trimmed.isEmpty()) parts.add(trimmed);
        }
        return parts;
    }

    private static BigDecimal nz(BigDecimal v) { return v != null ? v : BigDecimal.ZERO; }

    private static BigDecimal round(BigDecimal v) { return nz(v).setScale(2, RoundingMode.HALF_UP); }
}
