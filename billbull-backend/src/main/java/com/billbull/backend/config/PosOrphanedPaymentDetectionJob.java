package com.billbull.backend.config;

import com.billbull.backend.notification.NotificationEventPublisher;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.history.SalesInvoiceHistoryEvent;
import com.billbull.backend.sales.invoice.history.SalesInvoiceHistoryEventType;
import com.billbull.backend.sales.invoice.history.SalesInvoiceHistoryRepository;
import com.billbull.backend.sales.payment.PaymentRepository;
import com.billbull.backend.sales.payment.PaymentStatus;
import com.billbull.backend.sales.payment.PaymentType;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Nightly check for invoices whose activity trail records a PAYMENT_RECEIVED event (a Receipt
 * Voucher was created and posted to GL) but have no matching {@code sales_payments} row.
 *
 * {@code sales_payments} is the POS tender ledger that Day Close and the X/Z reports read
 * from (see {@code PaymentRepository.sumTenderByModeForSessions}/{@code findTenderForSessions},
 * keyed on {@code Payment.posSessionId}, and {@code PosSessionService.closeDay}'s Sales
 * Reconciliation check). A gap here doesn't mean the sale was uncollected — the Receipt
 * Voucher and its GL entry already prove it was posted correctly — it means Day Close will
 * silently under-count that session's tender and block on an "unexplained" variance whenever
 * that business date finally gets closed, discovered under time pressure instead of the
 * morning after (2026-08-29 incident: 11 invoices, one session, ~1043 AED, found only when
 * that day's Day Close was attempted).
 *
 * Scoped to the last 3 days of PAYMENT_RECEIVED events rather than the whole history table,
 * so this stays cheap to run nightly indefinitely.
 *
 * Read-only, like {@code PaymentReconciliationService}: this never corrects anything
 * automatically. It surfaces the gap so a human can backfill the missing row with a clear,
 * auditable trail of what happened and why — the same way the 2026-08-29 incident was
 * actually resolved.
 */
@Component
@Slf4j
public class PosOrphanedPaymentDetectionJob {

    private final SalesInvoiceHistoryRepository historyRepository;
    private final SalesInvoiceRepository invoiceRepository;
    private final PaymentRepository paymentRepository;
    private final NotificationEventPublisher notifPublisher;

    public PosOrphanedPaymentDetectionJob(SalesInvoiceHistoryRepository historyRepository,
                                           SalesInvoiceRepository invoiceRepository,
                                           PaymentRepository paymentRepository,
                                           NotificationEventPublisher notifPublisher) {
        this.historyRepository = historyRepository;
        this.invoiceRepository = invoiceRepository;
        this.paymentRepository = paymentRepository;
        this.notifPublisher = notifPublisher;
    }

    /** Runs nightly at 02:30 server time — after the GL drift check (02:00), before audit-log
     *  retention (03:30). */
    @Scheduled(cron = "0 30 2 * * *")
    @Transactional(readOnly = true)
    public void checkForOrphanedPayments() {
        LocalDateTime since = LocalDateTime.now().minusDays(3);
        List<SalesInvoiceHistoryEvent> receivedEvents = historyRepository
                .findByEventTypeAndEventTimestampAfter(SalesInvoiceHistoryEventType.PAYMENT_RECEIVED, since);
        if (receivedEvents.isEmpty()) {
            return;
        }

        List<String> orphaned = new ArrayList<>();
        for (SalesInvoiceHistoryEvent event : receivedEvents) {
            SalesInvoice invoice = invoiceRepository.findById(event.getInvoiceId()).orElse(null);
            if (invoice == null || invoice.getInvoiceNumber() == null) {
                continue;
            }
            boolean hasTenderRow = paymentRepository.findByLinkedInvoice(invoice.getInvoiceNumber()).stream()
                    .anyMatch(p -> p.getPaymentType() == PaymentType.RECEIVED
                            && p.getStatus() != PaymentStatus.CANCELLED
                            && p.getStatus() != PaymentStatus.FAILED);
            if (!hasTenderRow) {
                orphaned.add(invoice.getInvoiceNumber());
            }
        }

        if (orphaned.isEmpty()) {
            log.info("[PosOrphanedPaymentDetectionJob] No orphaned payments detected — {} PAYMENT_RECEIVED events checked.",
                    receivedEvents.size());
            return;
        }

        String invoiceList = String.join(", ", orphaned);
        log.warn("[PosOrphanedPaymentDetectionJob] {} invoice(s) have a posted payment (Receipt Voucher + GL entry) "
                        + "but no sales_payments row — Day Close will misreport these until backfilled: {}",
                orphaned.size(), invoiceList);
        notifPublisher.systemAlert(
                "POS Tender Ledger Gap Detected",
                orphaned.size() + " invoice(s) have a confirmed payment (Receipt Voucher already posted to GL) "
                        + "but no matching POS tender record, which will cause a Day Close Sales Reconciliation "
                        + "failure once that business date is closed: " + invoiceList,
                "HIGH");
    }
}
