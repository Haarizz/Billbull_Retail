package com.billbull.backend.sales.invoice.history;

import com.billbull.backend.logging.LogContext;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Records + reads the per-invoice activity trail.
 *
 * Every write is best-effort and swallows its own exceptions: an audit failure must
 * never roll back the invoice save / status change / payment that triggered it. The
 * trail is a reporting aid, not a correctness guarantee.
 */
@Service
public class SalesInvoiceHistoryService {

    private static final Logger log = LoggerFactory.getLogger(SalesInvoiceHistoryService.class);

    private final SalesInvoiceHistoryRepository repository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public SalesInvoiceHistoryService(SalesInvoiceHistoryRepository repository) {
        this.repository = repository;
    }

    // ---------------------------------------------------------------- WRITE API

    public void recordCreated(SalesInvoice invoice) {
        save(invoice, SalesInvoiceHistoryEventType.CREATED,
                "Sales Invoice created", null, null, null, null);
    }

    /** Emits nothing when the change list is empty (a no-op save shouldn't clutter the trail). */
    public void recordUpdated(SalesInvoice invoice, List<String> changes) {
        if (changes == null || changes.isEmpty()) {
            return;
        }
        save(invoice, SalesInvoiceHistoryEventType.UPDATED,
                "Invoice edited", null, null, null, toJson(changes));
    }

    public void recordStatusChanged(SalesInvoice invoice, String previousStatus, String newStatus) {
        if (Objects.equals(previousStatus, newStatus)) {
            return;
        }
        SalesInvoiceHistoryEventType type = switch (String.valueOf(newStatus).toUpperCase()) {
            case "CONFIRMED" -> SalesInvoiceHistoryEventType.CONFIRMED;
            case "CANCELLED" -> SalesInvoiceHistoryEventType.CANCELLED;
            default -> SalesInvoiceHistoryEventType.STATUS_CHANGED;
        };
        String terms = invoice != null && invoice.getPaymentTerms() != null && !invoice.getPaymentTerms().isBlank()
                ? " with " + invoice.getPaymentTerms() + " payment terms"
                : "";
        String title = switch (type) {
            case CONFIRMED -> "Invoice confirmed" + terms;
            case CANCELLED -> "Invoice cancelled";
            default -> "Status changed from " + previousStatus + " to " + newStatus;
        };
        save(invoice, type, title, null, null, null, null);
    }

    public void recordLinkedDocument(SalesInvoice invoice, String documentType, String documentNumber) {
        if (documentNumber == null || documentNumber.isBlank()) {
            return;
        }
        save(invoice, SalesInvoiceHistoryEventType.LINKED_DOCUMENT,
                linkedTitle(documentType, documentNumber), documentNumber, documentType, null, null);
    }

    /**
     * Called from PaymentService.savePayment — the single choke point every payment
     * passes through, including ones created directly as Receipt Vouchers (which
     * never touch SalesInvoiceService.recordPayment).
     */
    public void recordPaymentReceived(Long invoiceId, Long branchId, String voucherNumber,
                                      BigDecimal amount, String paymentMode) {
        try {
            SalesInvoiceHistoryEvent event = new SalesInvoiceHistoryEvent();
            event.setInvoiceId(invoiceId);
            event.setBranchId(branchId != null ? branchId : LogContext.getLong(LogContext.BRANCH_ID));
            event.setEventType(SalesInvoiceHistoryEventType.PAYMENT_RECEIVED);
            event.setTitle(voucherNumber != null && !voucherNumber.isBlank()
                    ? "Payment received via " + voucherNumber
                    : "Payment received");
            event.setLinkedDocumentNumber(voucherNumber);
            event.setLinkedDocumentType("RECEIPT_VOUCHER");
            event.setAmount(amount);
            event.setChangeDetails(paymentMode != null ? toJson(List.of("Payment Mode: " + paymentMode)) : null);
            event.setUsername(currentUsername());
            event.setEventTimestamp(LocalDateTime.now());
            repository.save(event);
        } catch (Exception ex) {
            log.warn("Failed to record invoice payment history for invoice {}: {}", invoiceId, ex.toString());
        }
    }

    // ----------------------------------------------------------------- READ API

    public List<SalesInvoiceHistoryEvent> getStoredEvents(Long invoiceId) {
        return repository.findByInvoiceIdOrderByEventTimestampAsc(invoiceId);
    }

    /**
     * Full timeline = stored events UNION events derived from the invoice's own columns.
     *
     * Derivation exists because this table only starts recording the day it ships:
     * every invoice created before then would otherwise show an empty timeline. What can
     * be derived honestly:
     *   - CREATED        from createdAt (real timestamp; SalesInvoice has no createdBy)
     *   - PRINTED        from reprintCount / lastReprintedBy / lastReprintedAt (V31)
     *   - LINKED_DOCUMENT from the four linked* fields — the numbers are real but nothing
     *                     recorded WHEN the link was made, so these carry a null timestamp.
     *
     * Stored events win: a derived event is dropped when a stored one already covers it,
     * so invoices written after this ships don't show each event twice.
     */
    public List<SalesInvoiceHistoryResponse> getHistory(SalesInvoice invoice) {
        List<SalesInvoiceHistoryResponse> out = new ArrayList<>();
        if (invoice == null || invoice.getId() == null) {
            return out;
        }

        List<SalesInvoiceHistoryEvent> stored = getStoredEvents(invoice.getId());
        for (SalesInvoiceHistoryEvent e : stored) {
            out.add(toResponse(e));
        }

        boolean hasStoredCreated = stored.stream()
                .anyMatch(e -> e.getEventType() == SalesInvoiceHistoryEventType.CREATED);
        if (!hasStoredCreated && invoice.getCreatedAt() != null) {
            out.add(derived(SalesInvoiceHistoryEventType.CREATED, "Sales Invoice created",
                    invoice.getCreatedAt(), null, null, null));
        }

        // Print history — real counters maintained by the reprint flow (V31).
        if (invoice.getReprintCount() != null && invoice.getReprintCount() > 0) {
            LocalDateTime printedAt = invoice.getLastReprintedAt() != null
                    ? LocalDateTime.ofInstant(invoice.getLastReprintedAt(), java.time.ZoneId.systemDefault())
                    : null;
            SalesInvoiceHistoryResponse printed = derived(SalesInvoiceHistoryEventType.PRINTED,
                    "Printed " + invoice.getReprintCount()
                            + (invoice.getReprintCount() == 1 ? " time" : " times"),
                    printedAt, null, null, null);
            printed.setUsername(invoice.getLastReprintedBy());
            out.add(printed);
        }

        // Lineage — real document numbers, but no recorded link time (null timestamp).
        Set<String> storedLinks = stored.stream()
                .filter(e -> e.getEventType() == SalesInvoiceHistoryEventType.LINKED_DOCUMENT)
                .map(SalesInvoiceHistoryEvent::getLinkedDocumentNumber)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        addDerivedLink(out, storedLinks, "QUOTATION", invoice.getLinkedQuotation());
        addDerivedLink(out, storedLinks, "PROFORMA", invoice.getLinkedProforma());
        addDerivedLink(out, storedLinks, "SALES_ORDER", invoice.getLinkedSalesOrder());
        addDerivedLink(out, storedLinks, "DELIVERY_NOTE", invoice.getLinkedDeliveryNote());

        // Undated (derived lineage) first, then chronological.
        out.sort(Comparator.comparing(SalesInvoiceHistoryResponse::getTimestamp,
                Comparator.nullsFirst(Comparator.naturalOrder())));
        return out;
    }

    private void addDerivedLink(List<SalesInvoiceHistoryResponse> out, Set<String> storedLinks,
                                String documentType, String documentNumber) {
        if (documentNumber == null || documentNumber.isBlank() || storedLinks.contains(documentNumber)) {
            return;
        }
        out.add(derived(SalesInvoiceHistoryEventType.LINKED_DOCUMENT,
                linkedTitle(documentType, documentNumber), null, documentNumber, documentType, null));
    }

    private SalesInvoiceHistoryResponse derived(SalesInvoiceHistoryEventType type, String title,
                                                LocalDateTime timestamp, String linkedNumber,
                                                String linkedType, BigDecimal amount) {
        SalesInvoiceHistoryResponse r = new SalesInvoiceHistoryResponse();
        r.setEventType(type.name());
        r.setTitle(title);
        r.setTimestamp(timestamp);
        r.setLinkedDocumentNumber(linkedNumber);
        r.setLinkedDocumentType(linkedType);
        r.setAmount(amount);
        r.setDerived(true);
        return r;
    }

    private SalesInvoiceHistoryResponse toResponse(SalesInvoiceHistoryEvent e) {
        SalesInvoiceHistoryResponse r = new SalesInvoiceHistoryResponse();
        r.setId(e.getId());
        r.setEventType(e.getEventType() != null ? e.getEventType().name() : null);
        r.setTitle(e.getTitle());
        r.setLinkedDocumentNumber(e.getLinkedDocumentNumber());
        r.setLinkedDocumentType(e.getLinkedDocumentType());
        r.setAmount(e.getAmount());
        r.setUsername(e.getUsername());
        r.setTimestamp(e.getEventTimestamp());
        r.setDerived(false);
        r.setChanges(fromJson(e.getChangeDetails()));
        return r;
    }

    private List<String> fromJson(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception ex) {
            return null;
        }
    }

    // ------------------------------------------------------------------ DIFFING

    /**
     * Business-meaningful field diff between the persisted invoice and the incoming one.
     * Deliberately narrow: per-line item diffs would flood the timeline, so item changes
     * collapse to a line-count delta.
     */
    public List<String> diff(SalesInvoice existing, SalesInvoice incoming) {
        List<String> changes = new ArrayList<>();
        if (existing == null || incoming == null) {
            return changes;
        }
        compare(changes, "Customer", existing.getCustomerName(), incoming.getCustomerName());
        compare(changes, "Invoice date", existing.getInvoiceDate(), incoming.getInvoiceDate());
        compare(changes, "Due date", existing.getDueDate(), incoming.getDueDate());
        compare(changes, "Payment mode", existing.getPaymentMode(), incoming.getPaymentMode());
        compare(changes, "Payment terms", existing.getPaymentTerms(), incoming.getPaymentTerms());
        compare(changes, "Salesperson", existing.getSalesperson(), incoming.getSalesperson());
        compare(changes, "Branch", existing.getBranchId(), incoming.getBranchId());
        compare(changes, "Notes", existing.getCustomerNotes(), incoming.getCustomerNotes());
        compareMoney(changes, "Invoice total", existing.getInvoiceTotal(), incoming.getInvoiceTotal());
        compareMoney(changes, "Discount", existing.getBillDiscountAmount(), incoming.getBillDiscountAmount());
        compareMoney(changes, "Delivery charge", existing.getDeliveryCharge(), incoming.getDeliveryCharge());

        int oldCount = existing.getItems() != null ? existing.getItems().size() : 0;
        int newCount = incoming.getItems() != null ? incoming.getItems().size() : 0;
        if (oldCount != newCount) {
            changes.add("Items: " + oldCount + " -> " + newCount + " lines");
        }
        return changes;
    }

    static String linkedTitle(String documentType, String documentNumber) {
        String label = switch (String.valueOf(documentType)) {
            case "QUOTATION" -> "Quotation";
            case "PROFORMA" -> "Proforma Invoice";
            case "SALES_ORDER" -> "Sales Order";
            case "DELIVERY_NOTE" -> "Delivery Note";
            case "RECEIPT_VOUCHER" -> "Receipt Voucher";
            default -> "Document";
        };
        return "Linked to " + label + " " + documentNumber;
    }

    // ----------------------------------------------------------------- INTERNAL

    private void save(SalesInvoice invoice, SalesInvoiceHistoryEventType type, String title,
                      String linkedNumber, String linkedType, BigDecimal amount, String changeDetailsJson) {
        try {
            if (invoice == null || invoice.getId() == null) {
                return;
            }
            SalesInvoiceHistoryEvent event = new SalesInvoiceHistoryEvent();
            event.setInvoiceId(invoice.getId());
            event.setBranchId(invoice.getBranchId() != null
                    ? invoice.getBranchId()
                    : LogContext.getLong(LogContext.BRANCH_ID));
            event.setEventType(type);
            event.setTitle(title);
            event.setLinkedDocumentNumber(linkedNumber);
            event.setLinkedDocumentType(linkedType);
            event.setAmount(amount);
            event.setChangeDetails(changeDetailsJson);
            event.setUsername(currentUsername());
            event.setEventTimestamp(LocalDateTime.now());
            repository.save(event);
        } catch (Exception ex) {
            log.warn("Failed to record invoice history event {} for invoice {}: {}",
                    type, invoice != null ? invoice.getId() : null, ex.toString());
        }
    }

    private String currentUsername() {
        String username = LogContext.get(LogContext.USERNAME);
        return username.isBlank() ? "System" : username;
    }

    private void compare(List<String> changes, String label, Object before, Object after) {
        if (!Objects.equals(normalize(before), normalize(after))) {
            changes.add(label + ": " + display(before) + " -> " + display(after));
        }
    }

    /** Money needs compareTo, not equals: BigDecimal 10 and 10.00 are not equal(). */
    private void compareMoney(List<String> changes, String label, BigDecimal before, BigDecimal after) {
        BigDecimal a = before != null ? before : BigDecimal.ZERO;
        BigDecimal b = after != null ? after : BigDecimal.ZERO;
        if (a.compareTo(b) != 0) {
            changes.add(label + ": " + a.toPlainString() + " -> " + b.toPlainString());
        }
    }

    private Object normalize(Object value) {
        if (value instanceof String s) {
            String trimmed = s.trim();
            return trimmed.isEmpty() ? null : trimmed;
        }
        return value;
    }

    private String display(Object value) {
        Object normalized = normalize(value);
        return normalized == null ? "(empty)" : String.valueOf(normalized);
    }

    private String toJson(List<String> values) {
        try {
            return objectMapper.writeValueAsString(values);
        } catch (Exception ex) {
            return null;
        }
    }
}
