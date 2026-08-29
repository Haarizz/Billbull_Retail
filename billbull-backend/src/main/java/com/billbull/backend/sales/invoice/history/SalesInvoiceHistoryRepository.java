package com.billbull.backend.sales.invoice.history;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface SalesInvoiceHistoryRepository extends JpaRepository<SalesInvoiceHistoryEvent, Long> {

    List<SalesInvoiceHistoryEvent> findByInvoiceIdOrderByEventTimestampAsc(Long invoiceId);

    List<SalesInvoiceHistoryEvent> findByEventTypeAndEventTimestampAfter(
            SalesInvoiceHistoryEventType eventType, LocalDateTime after);
}
