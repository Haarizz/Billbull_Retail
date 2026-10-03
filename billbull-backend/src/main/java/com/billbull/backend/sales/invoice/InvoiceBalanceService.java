package com.billbull.backend.sales.invoice;

import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.sales.advance.AdvanceApplicationRepository;
import com.billbull.backend.sales.returns.credit.SalesReturnCreditApplicationRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Objects;

/**
 * The single owner of {@code sales_invoices.amountPaid}, {@code returnCredited},
 * {@code balance} and {@code status}.
 *
 * <p><b>Why this class exists.</b> The invoice balance was never a stored truth — it is a
 * projection over allocation ledgers — but it had two independent owners that did not know
 * about each other: {@code SalesInvoiceService.finalizeInvoiceTotals} on every invoice save,
 * and {@code ReceiptVoucherService.syncLinkedInvoice} on every receipt change. Adding a new
 * term to only one of them guarantees the other erases it, which is exactly what would have
 * happened to a return credit: the allocation would survive until the customer next paid
 * something, which is precisely when it matters.
 *
 * <p>So there is one formula here, {@link #project}, and one ledger read,
 * {@link #recomputeInvoiceBalance}. Three callers share them:
 *
 * <ul>
 *   <li>{@code SalesInvoiceService.finalizeInvoiceTotals} — invoice save. It runs pre-persist
 *       on a client-supplied instance and is deliberately collaborator-free, so it uses the
 *       pure {@link #applyMoney} with the invoice's own figures rather than reading ledgers.</li>
 *   <li>{@code ReceiptVoucherService.syncLinkedInvoice} — receipt / advance change.</li>
 *   <li>{@code SalesReturnService} — return approval, after an allocation row is written.</li>
 * </ul>
 *
 * <p>The balance is floored at zero per invoice. Combined with the allocation being capped at
 * the invoice's own outstanding when it is computed (see
 * {@code SalesReturnService.resolveSettlementSplit}), that makes a negative receivable
 * structurally impossible rather than something floored after the fact.
 */
@Service
@Slf4j
public class InvoiceBalanceService {

    @Autowired
    private SalesInvoiceRepository salesInvoiceRepository;

    @Autowired
    private ReceiptVoucherRepository receiptVoucherRepository;

    @Autowired
    private AdvanceApplicationRepository advanceApplicationRepository;

    @Autowired
    private SalesReturnCreditApplicationRepository returnCreditApplicationRepository;

    /**
     * The one invoice-balance formula, as a pure function:
     * {@code balance = max(0, invoiceTotal - totalPaid - credited)}.
     */
    public static BigDecimal project(BigDecimal invoiceTotal, BigDecimal totalPaid, BigDecimal credited) {
        return nz(invoiceTotal).subtract(nz(totalPaid)).subtract(nz(credited)).max(BigDecimal.ZERO);
    }

    /**
     * Writes the money projection onto the invoice. Pure — touches no collaborator — so the
     * pre-persist invoice-save path can share this arithmetic without reading the ledgers.
     *
     * <p>Deliberately does <b>not</b> set status: the invoice-save path resolves status through
     * its own delivery-aware rules immediately afterwards, and overwriting it here would change
     * that behaviour.
     */
    public static void applyMoney(SalesInvoice invoice, BigDecimal totalPaid, BigDecimal credited) {
        if (invoice == null) return;
        invoice.setAmountPaid(nz(totalPaid));
        invoice.setReturnCredited(nz(credited));
        invoice.setBalance(project(invoice.getInvoiceTotal(), totalPaid, credited));
    }

    /**
     * Recomputes an invoice's paid / credited / balance / status from the allocation ledgers.
     * This is the canonical owner — the only place that decides what "paid" and "credited" mean.
     *
     * <p>Reads, in this order:
     * <ul>
     *   <li>completed {@code ReceiptVoucher}s linked by {@code salesInvoiceId};</li>
     *   <li>{@code APPLIED} {@code AdvanceApplication}s matched by invoice number — an advance
     *       settles AR through a GL journal and an allocation row, never by linking a
     *       receipt;</li>
     *   <li>{@code APPLIED} {@code SalesReturnCreditApplication}s matched by invoice number —
     *       the unpaid portion of an approved return.</li>
     * </ul>
     *
     * <p>Skips CANCELLED invoices, as the receipt-sync path always has: a cancelled invoice's
     * figures are history and must not be rewritten by a later receipt or return.
     *
     * @return the recomputed balance, or the untouched balance when there was nothing to do
     */
    @Transactional
    public BigDecimal recomputeInvoiceBalance(SalesInvoice invoice) {
        if (invoice == null) return null;
        if (invoice.getStatus() == SalesInvoiceStatus.CANCELLED) return invoice.getBalance();

        BigDecimal totalPaid = sumCompletedReceipts(invoice);
        BigDecimal credited = BigDecimal.ZERO;
        if (hasInvoiceNumber(invoice)) {
            totalPaid = totalPaid.add(
                    nz(advanceApplicationRepository.sumAppliedByInvoiceNumber(invoice.getInvoiceNumber())));
            credited = nz(returnCreditApplicationRepository
                    .sumAppliedByInvoiceNumber(invoice.getInvoiceNumber()));
        }

        BigDecimal invoiceTotal = nz(invoice.getInvoiceTotal());
        applyMoney(invoice, totalPaid, credited);
        invoice.setStatus(resolveInvoiceStatus(invoice, totalPaid, invoiceTotal, credited));
        salesInvoiceRepository.save(invoice);

        log.debug("[InvoiceBalance] {} recomputed: total={} paid={} credited={} balance={} status={}",
                invoice.getInvoiceNumber(), invoiceTotal, totalPaid, credited,
                invoice.getBalance(), invoice.getStatus());
        return invoice.getBalance();
    }

    /** Convenience overload for callers holding only an invoice number. */
    @Transactional
    public BigDecimal recomputeInvoiceBalanceByNumber(String invoiceNumber) {
        if (invoiceNumber == null || invoiceNumber.isBlank()) return null;
        return salesInvoiceRepository.findByInvoiceNumber(invoiceNumber)
                .map(this::recomputeInvoiceBalance)
                .orElse(null);
    }

    /**
     * The authoritative effective outstanding of one invoice: what a return splits against, and
     * what every AR surface reads once the invoice row itself is correct.
     *
     * <p>Computed from the ledgers rather than from the stored {@code balance} column, so a
     * caller holding a row-locked invoice gets the true figure even if the column is momentarily
     * stale. It is the same formula the stored column projects, so the two cannot disagree.
     *
     * <p>DRAFT and CANCELLED invoices carry no receivable, and therefore nothing to split
     * against.
     */
    @Transactional(readOnly = true)
    public BigDecimal effectiveOutstanding(SalesInvoice invoice) {
        if (invoice == null) return BigDecimal.ZERO;
        if (invoice.getStatus() == SalesInvoiceStatus.CANCELLED
                || invoice.getStatus() == SalesInvoiceStatus.DRAFT) {
            return BigDecimal.ZERO;
        }

        BigDecimal totalPaid = sumCompletedReceipts(invoice);
        BigDecimal credited = BigDecimal.ZERO;
        if (hasInvoiceNumber(invoice)) {
            totalPaid = totalPaid.add(
                    nz(advanceApplicationRepository.sumAppliedByInvoiceNumber(invoice.getInvoiceNumber())));
            credited = nz(returnCreditApplicationRepository
                    .sumAppliedByInvoiceNumber(invoice.getInvoiceNumber()));
        }
        return project(invoice.getInvoiceTotal(), totalPaid, credited);
    }

    /**
     * Invoice status for a given paid/credited position. Lifted from
     * {@code ReceiptVoucherService.resolveInvoiceStatus} so there is one rule, with one
     * addition: an invoice whose balance a return credit has cleared reads PAID rather than
     * staying PARTIALLY_PAID with nothing outstanding. The term is zero until allocations
     * exist, so the lift itself is behaviour-neutral.
     *
     * <p>Delivery-blocks-PAID is enforced only for manual status changes in
     * {@code SalesInvoiceService.updateStatus}, not here — unchanged.
     */
    public static SalesInvoiceStatus resolveInvoiceStatus(SalesInvoice invoice, BigDecimal totalPaid,
                                                          BigDecimal invoiceTotal, BigDecimal credited) {
        SalesInvoiceStatus currentStatus = invoice.getStatus();
        if (currentStatus == SalesInvoiceStatus.DRAFT || currentStatus == SalesInvoiceStatus.CANCELLED) {
            return currentStatus;
        }

        boolean delivered = isEffectivelyDelivered(invoice);
        BigDecimal settled = nz(totalPaid).add(nz(credited));

        if (settled.compareTo(nz(invoiceTotal)) >= 0 && nz(invoiceTotal).signum() > 0) {
            // Fully settled -> always PAID regardless of delivery status.
            return SalesInvoiceStatus.PAID;
        }

        if (nz(totalPaid).signum() > 0) {
            return SalesInvoiceStatus.PARTIALLY_PAID;
        }

        if (currentStatus == SalesInvoiceStatus.PAID || currentStatus == SalesInvoiceStatus.PARTIALLY_PAID) {
            return delivered ? SalesInvoiceStatus.CONFIRMED : SalesInvoiceStatus.POSTED;
        }

        return currentStatus != null ? currentStatus : SalesInvoiceStatus.POSTED;
    }

    private BigDecimal sumCompletedReceipts(SalesInvoice invoice) {
        if (invoice.getId() == null) return BigDecimal.ZERO;
        return receiptVoucherRepository.findBySalesInvoiceId(invoice.getId()).stream()
                .filter(receipt -> isCompletedStatus(receipt.getStatus()))
                .map(ReceiptVoucher::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static boolean hasInvoiceNumber(SalesInvoice invoice) {
        return invoice.getInvoiceNumber() != null && !invoice.getInvoiceNumber().isBlank();
    }

    private static boolean isEffectivelyDelivered(SalesInvoice invoice) {
        DeliveryStatus ds = invoice.getDeliveryStatus();
        // AUTO_DELIVERED = system-generated delivery (direct sale / walk-in);
        // null = no delivery required (e.g. a service invoice).
        return ds == DeliveryStatus.DELIVERED
                || ds == DeliveryStatus.AUTO_DELIVERED
                || ds == null;
    }

    /** Same rule as {@code ReceiptVoucherService.isCompletedStatus} — the only completed state. */
    private static boolean isCompletedStatus(String status) {
        return status != null && "Completed".equalsIgnoreCase(status.trim());
    }

    private static BigDecimal nz(BigDecimal v) { return v != null ? v : BigDecimal.ZERO; }
}
