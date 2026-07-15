package com.billbull.backend.inventory.scope;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * Branch-Level Inventory Phase 6B — governance (§15) + reference validation (§16) unit tests.
 * Pure Mockito. Verifies the toggle gate (all no-ops when scoping inactive) and the exact
 * allow/reject matrix.
 */
@ExtendWith(MockitoExtension.class)
class MasterDataBranchServiceTest {

    @Mock private BranchAccessService branchAccessService;
    @Mock private InventoryBranchScopeResolver scopeResolver;

    private MasterDataBranchService svc(boolean creationEnabled, String roles) {
        return new MasterDataBranchService(branchAccessService, scopeResolver, creationEnabled, roles);
    }

    private static Branch branch(long id) {
        Branch b = new Branch();
        b.setId(id);
        return b;
    }

    // -------- resolveBranchForCreate --------

    @Test
    void createStampsNullWhenToggleOff() {
        when(scopeResolver.isEnabled()).thenReturn(false);
        assertThat(svc(true, "ADMIN").resolveBranchForCreate()).isNull();
    }

    @Test
    void createStampsActiveBranchForBranchUser() {
        when(scopeResolver.isEnabled()).thenReturn(true);
        when(scopeResolver.shouldScope()).thenReturn(true);
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(7L));

        Branch result = svc(true, "ADMIN").resolveBranchForCreate();
        assertThat(result).isNotNull();
        assertThat(result.getId()).isEqualTo(7L);
    }

    @Test
    void createGlobalAllowedForPermittedRoleInAllBranches() {
        when(scopeResolver.isEnabled()).thenReturn(true);
        when(scopeResolver.shouldScope()).thenReturn(false); // All-Branches
        when(branchAccessService.currentUserHasRole("SUPER_ADMIN", "ADMIN")).thenReturn(true);

        assertThat(svc(true, "SUPER_ADMIN,ADMIN").resolveBranchForCreate()).isNull(); // global, permitted
    }

    @Test
    void createGlobalRejectedForDisallowedRole() {
        when(scopeResolver.isEnabled()).thenReturn(true);
        when(scopeResolver.shouldScope()).thenReturn(false);
        when(branchAccessService.currentUserHasRole("SUPER_ADMIN", "ADMIN")).thenReturn(false);

        assertThatThrownBy(() -> svc(true, "SUPER_ADMIN,ADMIN").resolveBranchForCreate())
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("may create shared/global master data");
    }

    @Test
    void createGlobalRejectedWhenCreationDisabled() {
        when(scopeResolver.isEnabled()).thenReturn(true);
        when(scopeResolver.shouldScope()).thenReturn(false);

        assertThatThrownBy(() -> svc(false, "SUPER_ADMIN,ADMIN").resolveBranchForCreate())
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("disabled on this tenant");
    }

    // -------- assertMasterReferenceAccessible --------

    @Test
    void referenceValidationNoOpWhenToggleOff() {
        when(scopeResolver.shouldScope()).thenReturn(false);
        // Even a cross-branch reference passes when scoping is inactive (byte-identical).
        assertThatCode(() -> svc(true, "ADMIN")
                .assertMasterReferenceAccessible(2L, 1L, "Department")).doesNotThrowAnyException();
    }

    @Test
    void referenceGlobalParentAlwaysAllowed() {
        when(scopeResolver.shouldScope()).thenReturn(true);
        assertThatCode(() -> svc(true, "ADMIN")
                .assertMasterReferenceAccessible(null, 1L, "Department")).doesNotThrowAnyException();
    }

    @Test
    void referenceSameBranchAllowed() {
        when(scopeResolver.shouldScope()).thenReturn(true);
        assertThatCode(() -> svc(true, "ADMIN")
                .assertMasterReferenceAccessible(5L, 5L, "Department")).doesNotThrowAnyException();
    }

    @Test
    void referenceOtherBranchRejected() {
        when(scopeResolver.shouldScope()).thenReturn(true);
        assertThatThrownBy(() -> svc(true, "ADMIN")
                .assertMasterReferenceAccessible(2L, 1L, "Department"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("belongs to another branch");
    }

    @Test
    void referenceGlobalChildToBranchParentRejected() {
        when(scopeResolver.shouldScope()).thenReturn(true);
        assertThatThrownBy(() -> svc(true, "ADMIN")
                .assertMasterReferenceAccessible(3L, null, "Department"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("shared/global item cannot reference a branch-specific");
    }

    @Test
    void branchIdOfHelper() {
        assertThat(MasterDataBranchService.branchIdOf(null)).isNull();
        assertThat(MasterDataBranchService.branchIdOf(branch(9L))).isEqualTo(9L);
    }
}
