package com.billbull.backend.inventory.scope;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Set;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchAccessService.ListScope;

/**
 * Branch-Level Inventory Phase 3 — unit tests for {@link InventoryBranchScopeResolver}, the
 * dormant scope decision point. Verifies the toggle gate: with the flag OFF the resolver never
 * scopes and never touches BranchAccessService (so behaviour is unchanged); with the flag ON it
 * scopes only when a specific branch is active (not All-Branches).
 */
@ExtendWith(MockitoExtension.class)
class InventoryBranchScopeResolverTest {

    @Mock private BranchAccessService branchAccessService;

    @AfterEach
    void clearContext() {
        BranchContextHolder.clear();
    }

    private static void activeBranch(long id) {
        BranchContextHolder.set(new BranchContextHolder.BranchContext(id, Set.of(id), false));
    }

    private static void allBranches() {
        BranchContextHolder.set(new BranchContextHolder.BranchContext(null, Set.of(), true));
    }

    @Test
    void disabledToggleNeverScopesAndNeverConsultsBranchAccess() {
        var resolver = new InventoryBranchScopeResolver(branchAccessService, false);
        activeBranch(5L); // even with a specific branch active...

        assertThat(resolver.isEnabled()).isFalse();
        assertThat(resolver.shouldScope()).isFalse();
        assertThat(resolver.activeListScope()).isEmpty();
        verifyNoInteractions(branchAccessService); // no ListScope computed when off
    }

    @Test
    void enabledWithActiveBranchScopes() {
        var resolver = new InventoryBranchScopeResolver(branchAccessService, true);
        activeBranch(5L);
        ListScope scope = new ListScope(false, Set.of(5L));
        when(branchAccessService.currentListScope()).thenReturn(scope);

        assertThat(resolver.shouldScope()).isTrue();
        assertThat(resolver.activeListScope()).contains(scope);
    }

    @Test
    void enabledButAllBranchesDoesNotScope() {
        var resolver = new InventoryBranchScopeResolver(branchAccessService, true);
        allBranches();
        lenient().when(branchAccessService.currentListScope())
                .thenReturn(new ListScope(true, Set.of(-1L)));

        // Admin All-Branches → unscoped path preserved (consolidated view), even with flag on.
        assertThat(resolver.shouldScope()).isFalse();
        assertThat(resolver.activeListScope()).isEmpty();
    }

    @Test
    void enabledWithNoBranchContextDoesNotScope() {
        var resolver = new InventoryBranchScopeResolver(branchAccessService, true);
        BranchContextHolder.clear(); // no active branch (e.g. system thread)

        assertThat(resolver.shouldScope()).isFalse();
        assertThat(resolver.activeListScope()).isEmpty();
    }
}
