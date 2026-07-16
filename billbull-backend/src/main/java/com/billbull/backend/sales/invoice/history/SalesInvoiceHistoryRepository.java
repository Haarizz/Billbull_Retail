package com.billbull.backend.sales.invoice.history;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SalesInvoiceHistoryRepository extends JpaRepository<SalesInvoiceHistoryEvent, Long> {

    List<SalesInvoiceHistoryEvent> findByInvoiceIdOrderByEventTimestampAsc(Long invoiceId);
}
