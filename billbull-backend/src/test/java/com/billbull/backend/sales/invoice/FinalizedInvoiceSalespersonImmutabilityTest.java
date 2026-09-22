package com.billbull.backend.sales.invoice;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

/**
 * Salesperson attribution must not silently change once an invoice is finalized — it is the key
 * commission is computed against, and a later edit rewriting it would rewrite paid commission
 * history.
 *
 * <p>Exercises {@link SalesInvoiceService#preserveFinalizedSalespersonAttribution} directly: it is
 * pure and collaborator-free, like {@code finalizeInvoiceTotals}.
 */
class FinalizedInvoiceSalespersonImmutabilityTest {

    private static SalesInvoice persisted(SalesInvoiceStatus status, Long employeeId) {
        SalesInvoice inv = new SalesInvoice();
        inv.setId(42L);
        inv.setStatus(status);
        if (employeeId != null) {
            inv.setSalespersonEmployeeId(employeeId);
            inv.setSalespersonEmployeeCode("EMP-00" + employeeId);
            inv.setSalespersonName("Original Owner");
        }
        return inv;
    }

    private static SalesInvoice incomingReattributedTo(long employeeId) {
        SalesInvoice inv = new SalesInvoice();
        inv.setId(42L);
        inv.setSalespersonEmployeeId(employeeId);
        inv.setSalespersonEmployeeCode("EMP-99");
        inv.setSalespersonName("Someone Else");
        return inv;
    }

    @Test
    void aPaidInvoiceKeepsItsOriginalAttribution() {
        SalesInvoice existing = persisted(SalesInvoiceStatus.PAID, 7L);
        SalesInvoice incoming = incomingReattributedTo(99L);

        SalesInvoiceService.preserveFinalizedSalespersonAttribution(incoming, existing);

        assertEquals(7L, incoming.getSalespersonEmployeeId());
        assertEquals("EMP-007", incoming.getSalespersonEmployeeCode());
        assertEquals("Original Owner", incoming.getSalespersonName());
    }

    @Test
    void everyFinalizedStatusIsProtected() {
        for (SalesInvoiceStatus status : new SalesInvoiceStatus[] {
                SalesInvoiceStatus.POSTED, SalesInvoiceStatus.CONFIRMED,
                SalesInvoiceStatus.PARTIALLY_PAID, SalesInvoiceStatus.PAID,
                SalesInvoiceStatus.OVERDUE }) {
            SalesInvoice incoming = incomingReattributedTo(99L);
            SalesInvoiceService.preserveFinalizedSalespersonAttribution(
                    incoming, persisted(status, 7L));
            assertEquals(7L, incoming.getSalespersonEmployeeId(),
                    "attribution must be immutable for status " + status);
        }
    }

    @Test
    void aFinalizedInvoiceCannotHaveItsAttributionClearedEither() {
        SalesInvoice existing = persisted(SalesInvoiceStatus.PAID, 7L);
        SalesInvoice incoming = new SalesInvoice();  // all attribution fields null
        incoming.setId(42L);

        SalesInvoiceService.preserveFinalizedSalespersonAttribution(incoming, existing);

        assertEquals(7L, incoming.getSalespersonEmployeeId());
    }

    @Test
    void aDraftInvoiceIsStillFreelyReassignable() {
        SalesInvoice existing = persisted(SalesInvoiceStatus.DRAFT, 7L);
        SalesInvoice incoming = incomingReattributedTo(99L);

        SalesInvoiceService.preserveFinalizedSalespersonAttribution(incoming, existing);

        assertEquals(99L, incoming.getSalespersonEmployeeId());
        assertEquals("Someone Else", incoming.getSalespersonName());
    }

    @Test
    void aCancelledInvoiceIsStillFreelyReassignable() {
        SalesInvoice existing = persisted(SalesInvoiceStatus.CANCELLED, 7L);
        SalesInvoice incoming = incomingReattributedTo(99L);

        SalesInvoiceService.preserveFinalizedSalespersonAttribution(incoming, existing);

        assertEquals(99L, incoming.getSalespersonEmployeeId());
    }

    @Test
    void aFinalizedInvoiceWithNoPriorAttributionCanStillBeAssigned() {
        // Historical invoices carry NULL; letting them be attributed later is a feature, not a
        // rewrite — there is no commission history to protect.
        SalesInvoice existing = persisted(SalesInvoiceStatus.PAID, null);
        SalesInvoice incoming = incomingReattributedTo(99L);

        SalesInvoiceService.preserveFinalizedSalespersonAttribution(incoming, existing);

        assertEquals(99L, incoming.getSalespersonEmployeeId());
    }

    @Test
    void aBrandNewInvoiceIsUnaffected() {
        SalesInvoice incoming = incomingReattributedTo(99L);

        SalesInvoiceService.preserveFinalizedSalespersonAttribution(incoming, null);

        assertEquals(99L, incoming.getSalespersonEmployeeId());
    }

    @Test
    void theGuardTouchesNothingElseOnTheInvoice() {
        SalesInvoice existing = persisted(SalesInvoiceStatus.PAID, 7L);
        existing.setSalesperson("legacy.username");
        existing.setPosDriverEmployeeId(3L);

        SalesInvoice incoming = incomingReattributedTo(99L);
        incoming.setSalesperson("edited.username");
        incoming.setPosDriverEmployeeId(4L);
        incoming.setCustomerName("Edited Customer");

        SalesInvoiceService.preserveFinalizedSalespersonAttribution(incoming, existing);

        // Only the three salesperson-employee fields are restored. The legacy String, the
        // delivery driver and ordinary editable fields are left exactly as supplied.
        assertEquals("edited.username", incoming.getSalesperson());
        assertEquals(4L, incoming.getPosDriverEmployeeId());
        assertEquals("Edited Customer", incoming.getCustomerName());
    }

    @Test
    void nullInvoiceIsANoOp() {
        SalesInvoiceService.preserveFinalizedSalespersonAttribution(null, persisted(SalesInvoiceStatus.PAID, 7L));
        SalesInvoice incoming = new SalesInvoice();
        SalesInvoiceService.preserveFinalizedSalespersonAttribution(incoming, null);
        assertNull(incoming.getSalespersonEmployeeId());
    }

    // ── warning log on restore (behaviour unchanged, trace added) ────────────

    /** Captures what SalesInvoiceService logs while {@code body} runs. */
    private static java.util.List<ch.qos.logback.classic.spi.ILoggingEvent> logsDuring(Runnable body) {
        ch.qos.logback.classic.Logger logger = (ch.qos.logback.classic.Logger)
                org.slf4j.LoggerFactory.getLogger(SalesInvoiceService.class);
        ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent> appender =
                new ch.qos.logback.core.read.ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            body.run();
        } finally {
            logger.detachAppender(appender);
        }
        return appender.list;
    }

    @Test
    void anAttemptedChangeOnAFinalizedInvoiceLogsAWarningAndStillRestores() {
        SalesInvoice existing = persisted(SalesInvoiceStatus.PAID, 7L);
        existing.setInvoiceNumber("INV-2026-0042");
        SalesInvoice incoming = incomingReattributedTo(99L);

        var events = logsDuring(() ->
                SalesInvoiceService.preserveFinalizedSalespersonAttribution(incoming, existing));

        assertEquals(7L, incoming.getSalespersonEmployeeId());  // behaviour unchanged
        assertEquals(1, events.size());
        var event = events.get(0);
        assertEquals(ch.qos.logback.classic.Level.WARN, event.getLevel());
        String msg = event.getFormattedMessage();
        org.junit.jupiter.api.Assertions.assertTrue(msg.contains("INV-2026-0042"), msg);
        org.junit.jupiter.api.Assertions.assertTrue(msg.contains("persistedSalespersonEmployeeId=7"), msg);
        org.junit.jupiter.api.Assertions.assertTrue(msg.contains("attemptedSalespersonEmployeeId=99"), msg);
    }

    @Test
    void reSendingTheSameSalespersonLogsNothing() {
        SalesInvoice existing = persisted(SalesInvoiceStatus.PAID, 7L);
        SalesInvoice incoming = incomingReattributedTo(7L);

        var events = logsDuring(() ->
                SalesInvoiceService.preserveFinalizedSalespersonAttribution(incoming, existing));

        assertEquals(0, events.size());
    }

    @Test
    void omittingTheSalespersonLogsNothing() {
        // The back-office screen never sends the field; the controller normalises that to null.
        // That is the ordinary whole-invoice edit and must not produce a warning on every save.
        SalesInvoice existing = persisted(SalesInvoiceStatus.PAID, 7L);
        SalesInvoice incoming = new SalesInvoice();
        incoming.setId(42L);

        var events = logsDuring(() ->
                SalesInvoiceService.preserveFinalizedSalespersonAttribution(incoming, existing));

        assertEquals(0, events.size());
        assertEquals(7L, incoming.getSalespersonEmployeeId());
    }

    @Test
    void aDraftReassignmentIsAllowedAndLogsNothing() {
        SalesInvoice existing = persisted(SalesInvoiceStatus.DRAFT, 7L);
        SalesInvoice incoming = incomingReattributedTo(99L);

        var events = logsDuring(() ->
                SalesInvoiceService.preserveFinalizedSalespersonAttribution(incoming, existing));

        assertEquals(0, events.size());
        assertEquals(99L, incoming.getSalespersonEmployeeId());
    }
}
