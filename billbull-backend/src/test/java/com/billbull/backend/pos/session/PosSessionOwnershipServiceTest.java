package com.billbull.backend.pos.session;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import com.billbull.backend.common.ownership.OwnershipContextHolder;

/**
 * Session Roaming Phase 2 (backend plumbing) — unit tests for {@link PosSessionOwnershipService},
 * the dormant owner-resolution helper no production flow calls yet. Pins the "never guess" and
 * "safe null fallback" invariants the later phases depend on.
 */
class PosSessionOwnershipServiceTest {

    private final PosSessionOwnershipService service = new PosSessionOwnershipService();

    @AfterEach
    void clearContext() {
        OwnershipContextHolder.clear();
    }

    @Test
    void currentPrincipalUserId_returnsNull_whenNoContextSet() {
        assertThat(service.currentPrincipalUserId()).isNull();
    }

    @Test
    void currentPrincipalUserId_readsFromOwnershipContextHolder() {
        OwnershipContextHolder.set(new OwnershipContextHolder.OwnershipContext(42L, true));
        assertThat(service.currentPrincipalUserId()).isEqualTo(42L);
    }

    @Test
    void resolveOwnerUserId_returnsNull_forNullSession() {
        assertThat(service.resolveOwnerUserId(null)).isNull();
    }

    @Test
    void resolveOwnerUserId_returnsNull_whenOwnerUserIdNeverStamped() {
        PosSession session = new PosSession();
        session.setOpenedBy("cashier1"); // legacy username column only
        assertThat(service.resolveOwnerUserId(session)).isNull();
    }

    @Test
    void resolveOwnerUserId_returnsStampedValue() {
        PosSession session = new PosSession();
        session.setOwnerUserId(7L);
        assertThat(service.resolveOwnerUserId(session)).isEqualTo(7L);
    }

    @Test
    void isOwnedBy_falseWhenEitherSideNull() {
        PosSession session = new PosSession();
        assertThat(service.isOwnedBy(null, 1L)).isFalse();
        assertThat(service.isOwnedBy(session, null)).isFalse();
        assertThat(service.isOwnedBy(session, 1L)).isFalse(); // ownerUserId unset
    }

    @Test
    void isOwnedBy_trueOnMatch() {
        PosSession session = new PosSession();
        session.setOwnerUserId(5L);
        assertThat(service.isOwnedBy(session, 5L)).isTrue();
        assertThat(service.isOwnedBy(session, 6L)).isFalse();
    }

    @Test
    void resolvePerformedByUserId_returnsNull_forNullMovementOrUnstamped() {
        assertThat(service.resolvePerformedByUserId(null)).isNull();
        PosCashMovement movement = new PosCashMovement();
        movement.setPerformedBy("cashier1");
        assertThat(service.resolvePerformedByUserId(movement)).isNull();
    }

    @Test
    void resolvePerformedByUserId_returnsStampedValue() {
        PosCashMovement movement = new PosCashMovement();
        movement.setPerformedByUserId(9L);
        assertThat(service.resolvePerformedByUserId(movement)).isEqualTo(9L);
    }
}
