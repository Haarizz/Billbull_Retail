package com.billbull.backend.common.ownership;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import com.billbull.backend.sales.invoice.SalesInvoice;

/**
 * Unit tests for {@link OwnershipAuditListener} — the persist-time owner stamper. Verifies the
 * write-path half of ownership auditing works uniformly for a standalone {@link OwnedEntity}
 * (SalesInvoice does not extend BaseEntity), that it is null-safe for system/unauthenticated
 * writes, and that it never overwrites an explicitly pre-set owner.
 */
class OwnershipAuditListenerTest {

    private final OwnershipAuditListener listener = new OwnershipAuditListener();

    @AfterEach
    void clearContext() {
        OwnershipContextHolder.clear();
    }

    @Test
    void stampsOwnerFromContextForAuthenticatedWrite() {
        OwnershipContextHolder.set(new OwnershipContextHolder.OwnershipContext(42L, false));
        SalesInvoice invoice = new SalesInvoice();

        listener.stampOwner(invoice);

        assertThat(invoice.getCreatedByUserId()).isEqualTo(42L);
    }

    @Test
    void leavesNullForSystemOrUnauthenticatedWrite() {
        OwnershipContextHolder.clear(); // no principal (seeder / scheduler / anon)
        SalesInvoice invoice = new SalesInvoice();

        listener.stampOwner(invoice);

        assertThat(invoice.getCreatedByUserId()).isNull(); // unowned — never throws
    }

    @Test
    void leavesNullWhenContextHasNoUserId() {
        OwnershipContextHolder.set(new OwnershipContextHolder.OwnershipContext(null, true));
        SalesInvoice invoice = new SalesInvoice();

        listener.stampOwner(invoice);

        assertThat(invoice.getCreatedByUserId()).isNull();
    }

    @Test
    void neverOverwritesAnExplicitlySetOwner() {
        OwnershipContextHolder.set(new OwnershipContextHolder.OwnershipContext(42L, false));
        SalesInvoice invoice = new SalesInvoice();
        invoice.setCreatedByUserId(99L); // e.g. a data-migration backfill

        listener.stampOwner(invoice);

        assertThat(invoice.getCreatedByUserId()).isEqualTo(99L); // preserved
    }

    @Test
    void ignoresNonOwnedEntities() {
        OwnershipContextHolder.set(new OwnershipContextHolder.OwnershipContext(42L, false));
        Object notOwned = new Object();
        listener.stampOwner(notOwned); // must not throw
    }
}
