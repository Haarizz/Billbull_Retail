package com.billbull.backend.common.ownership;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.security.RolePermission;
import com.billbull.backend.security.RolePermissionRepository;

/**
 * Unit tests for {@link OwnershipAccessService} — the central enforcement point for user-based data
 * visibility (ownership filtering). Covers the design-mandated invariants (docs/future-enhancements/
 * 02-user-based-data-visibility-roadmap.md "Cross-cutting testing strategy"):
 *
 * <ul>
 *   <li><b>Toggle-off invariance</b> — with the flag OFF nothing is restricted and the permission
 *       repository is never consulted, so behaviour is byte-identical to before the feature.</li>
 *   <li><b>Override bypass</b> — VIEW_ALL_RECORDS holders (and ADMIN/BRANCH_ADMIN/SUPER_ADMIN) see
 *       every user's records.</li>
 *   <li><b>Owner-only + owner-or-assignee</b> — restricted users see only their own records, or the
 *       records they are an actor on (multi-actor domains).</li>
 *   <li><b>GET-by-id leak</b> — a restricted user fetching a non-owned record by id gets 404 (not
 *       403 — avoids id-enumeration).</li>
 *   <li><b>Null-owner</b> — unowned (system/legacy) rows are hidden from restricted users.</li>
 * </ul>
 *
 * The AND-composition with branch scope is structural: this service only ever ADDS an ownership
 * predicate and never removes the branch one, so a caller that applies both narrows on both. The
 * composition test lives with the pilot-domain service test; here we prove the ownership half in
 * isolation.
 */
@ExtendWith(MockitoExtension.class)
class OwnershipAccessServiceTest {

    @Mock private RolePermissionRepository rolePermissionRepository;

    @AfterEach
    void clearContext() {
        OwnershipContextHolder.clear();
    }

    private OwnershipAccessService enabled() {
        return new OwnershipAccessService(rolePermissionRepository, true);
    }

    private OwnershipAccessService disabled() {
        return new OwnershipAccessService(rolePermissionRepository, false);
    }

    /** Simulates JwtFilter having resolved the per-request ownership context. */
    private static void asUser(long userId, boolean viewAll) {
        OwnershipContextHolder.set(new OwnershipContextHolder.OwnershipContext(userId, viewAll));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Toggle-off invariance
    // ─────────────────────────────────────────────────────────────────────────

    @Nested
    class ToggleOff {

        @Test
        void restrictionNeverApplies() {
            var svc = disabled();
            asUser(7L, false); // even a would-be-restricted principal...
            assertThat(svc.filteringEnabled()).isFalse();
            assertThat(svc.restrictionApplies()).isFalse();
        }

        @Test
        void filterOwnedReturnsEverythingUnchanged() {
            var svc = disabled();
            asUser(7L, false);
            List<Row> rows = List.of(new Row(1L), new Row(2L), new Row(3L));
            assertThat(svc.filterOwned(rows, Row::owner)).isEqualTo(rows);
        }

        @Test
        void assertNeverThrows() {
            var svc = disabled();
            asUser(7L, false);
            svc.assertCanAccessRecord(999L, "Sales Invoice"); // someone else's row — no throw
        }

        @Test
        void ownerScopeIsUnrestricted() {
            var svc = disabled();
            asUser(7L, false);
            assertThat(svc.currentOwnerScope().unrestricted()).isTrue();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Override bypass (VIEW_ALL_RECORDS)
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    void viewAllHolderIsNeverRestricted() {
        var svc = enabled();
        asUser(7L, true); // JwtFilter resolved viewAll=true from the override permission
        assertThat(svc.restrictionApplies()).isFalse();
        assertThat(svc.canAccessRecord(999L)).isTrue(); // another user's record
        List<Row> rows = List.of(new Row(1L), new Row(2L));
        assertThat(svc.filterOwned(rows, Row::owner)).isEqualTo(rows);
    }

    @Test
    void adminRoleGrantsViewAllWithoutAnyPermissionRow() {
        var svc = enabled();
        assertThat(svc.rolesGrantViewAll(List.of("ADMIN"))).isTrue();
        assertThat(svc.rolesGrantViewAll(List.of("BRANCH_ADMIN"))).isTrue();
        assertThat(svc.rolesGrantViewAll(List.of("SUPER_ADMIN"))).isTrue();
        verifyNoInteractions(rolePermissionRepository); // short-circuited before the query
    }

    @Test
    void nonAdminRoleGrantsViewAllOnlyViaPermissionRow() {
        var svc = enabled();
        RolePermission grant = new RolePermission();
        grant.setModule(OwnershipAccessService.VIEW_ALL_RECORDS_MODULE);
        grant.setCanView(true);
        when(rolePermissionRepository.findByRole_NameIn(List.of("MANAGER"))).thenReturn(List.of(grant));

        assertThat(svc.rolesGrantViewAll(List.of("MANAGER"))).isTrue();
    }

    @Test
    void nonAdminRoleWithoutPermissionRowIsRestricted() {
        var svc = enabled();
        when(rolePermissionRepository.findByRole_NameIn(List.of("SALES"))).thenReturn(List.of());
        assertThat(svc.rolesGrantViewAll(List.of("SALES"))).isFalse();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner-only restriction
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    void restrictedUserSeesOnlyOwnRows() {
        var svc = enabled();
        asUser(7L, false);
        List<Row> rows = List.of(new Row(7L), new Row(8L), new Row(7L), new Row(null));
        assertThat(svc.filterOwned(rows, Row::owner))
                .extracting(Row::owner)
                .containsExactly(7L, 7L); // 8L (other) and null (unowned) filtered out
    }

    @Test
    void restrictedUserCanAccessOwnRecord() {
        var svc = enabled();
        asUser(7L, false);
        assertThat(svc.canAccessRecord(7L)).isTrue();
    }

    @Test
    void restrictedUserCannotAccessOthersRecord() {
        var svc = enabled();
        asUser(7L, false);
        assertThat(svc.canAccessRecord(8L)).isFalse();
    }

    @Test
    void restrictedUserCannotAccessNullOwnerRecord() {
        var svc = enabled();
        asUser(7L, false);
        assertThat(svc.canAccessRecord(null)).isFalse(); // unowned/system row hidden
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner-OR-assignee (multi-actor domains)
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    void restrictedUserCanAccessRecordTheyAreAnActorOn() {
        var svc = enabled();
        asUser(7L, false);
        // owner is 8L, but 7L is a listed actor (e.g. last-modifier / assignee)
        assertThat(svc.canAccessRecord(8L, List.of(9L, 7L))).isTrue();
    }

    @Test
    void restrictedUserBlockedWhenNeitherOwnerNorActor() {
        var svc = enabled();
        asUser(7L, false);
        assertThat(svc.canAccessRecord(8L, List.of(9L, 10L))).isFalse();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET-by-id leak → 404
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    void assertThrows404ForNonOwnedRecord() {
        var svc = enabled();
        asUser(7L, false);
        assertThatThrownBy(() -> svc.assertCanAccessRecord(8L, "Sales Invoice"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void assertPassesForOwnedRecord() {
        var svc = enabled();
        asUser(7L, false);
        svc.assertCanAccessRecord(7L, "Sales Invoice"); // no throw
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Unauthenticated / no context
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    void noOwnershipContextIsUnrestricted() {
        var svc = enabled();
        OwnershipContextHolder.clear(); // system thread / unauthenticated
        assertThat(svc.restrictionApplies()).isFalse();
        assertThat(svc.canAccessRecord(999L)).isTrue();
    }

    /** Minimal owned-row stand-in for filterOwned tests. */
    private record Row(Long owner) {}
}
