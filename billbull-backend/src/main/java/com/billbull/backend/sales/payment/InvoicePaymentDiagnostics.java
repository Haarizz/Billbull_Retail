package com.billbull.backend.sales.payment;

import java.math.BigDecimal;
import java.util.List;

/**
 * Everything known about how one invoice was paid, plus whether it adds up.
 *
 * <p>Read-only: this is what a support engineer looks at when a till total and a ledger total
 * disagree. It puts the three views of the same payment side by side — what the invoice says
 * ({@code storedSummaryLabel}, {@code amountPaid}), what the tender rows say
 * ({@code allocations}, {@code totalReceived}), and what follows arithmetically
 * ({@code outstanding}) — because a mismatch between any two of them is the bug, and seeing
 * them together is what makes it obvious which one is wrong.
 */
public class InvoicePaymentDiagnostics {

    private final String invoiceNumber;
    private final BigDecimal invoiceTotal;
    private final BigDecimal amountPaid;
    private final String storedSummaryLabel;

    private final List<InvoicePaymentSummary.Allocation> allocations;
    private final String derivedSummaryLabel;
    private final BigDecimal totalReceived;
    private final BigDecimal outstanding;
    private final int allocationCount;
    private final List<String> allocationOrder;
    private final List<String> allocationTypes;

    private final List<PaymentReconciliationFinding> findings;

    public InvoicePaymentDiagnostics(String invoiceNumber, BigDecimal invoiceTotal, BigDecimal amountPaid,
                                     String storedSummaryLabel,
                                     List<InvoicePaymentSummary.Allocation> allocations,
                                     String derivedSummaryLabel, BigDecimal totalReceived,
                                     BigDecimal outstanding, List<String> allocationOrder,
                                     List<String> allocationTypes,
                                     List<PaymentReconciliationFinding> findings) {
        this.invoiceNumber = invoiceNumber;
        this.invoiceTotal = invoiceTotal;
        this.amountPaid = amountPaid;
        this.storedSummaryLabel = storedSummaryLabel;
        this.allocations = allocations;
        this.derivedSummaryLabel = derivedSummaryLabel;
        this.totalReceived = totalReceived;
        this.outstanding = outstanding;
        this.allocationCount = allocations.size();
        this.allocationOrder = allocationOrder;
        this.allocationTypes = allocationTypes;
        this.findings = findings;
    }

    public String getInvoiceNumber() { return invoiceNumber; }
    public BigDecimal getInvoiceTotal() { return invoiceTotal; }
    /** What the invoice itself believes was collected. */
    public BigDecimal getAmountPaid() { return amountPaid; }
    /** The label stored on the invoice — may be stale, or a historical "Mixed". */
    public String getStoredSummaryLabel() { return storedSummaryLabel; }

    public List<InvoicePaymentSummary.Allocation> getAllocations() { return allocations; }
    /** The label the recorded tenders imply. Never "Mixed". */
    public String getDerivedSummaryLabel() { return derivedSummaryLabel; }
    /** Sum of the recorded tender rows. */
    public BigDecimal getTotalReceived() { return totalReceived; }
    /** Invoice total less what was received — the customer's remaining balance. */
    public BigDecimal getOutstanding() { return outstanding; }
    public int getAllocationCount() { return allocationCount; }
    /** Tender labels in the order they were taken, e.g. ["Cash", "Visa", "Online"]. */
    public List<String> getAllocationOrder() { return allocationOrder; }
    /** Tender types in the same order, e.g. ["CASH", "CARD", "ONLINE"]. */
    public List<String> getAllocationTypes() { return allocationTypes; }

    public List<PaymentReconciliationFinding> getFindings() { return findings; }

    /** True when nothing disagrees — the common case, and what an alert should watch for. */
    public boolean isConsistent() {
        return findings.stream().noneMatch(PaymentReconciliationFinding::isError);
    }

    public boolean isHasWarnings() {
        return findings.stream()
                .anyMatch(f -> f.getSeverity() == PaymentReconciliationFinding.Severity.WARNING);
    }
}
