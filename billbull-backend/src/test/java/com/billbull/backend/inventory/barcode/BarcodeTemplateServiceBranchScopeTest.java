package com.billbull.backend.inventory.barcode;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.billbull.backend.inventory.scope.InventoryBranchScopeResolver;
import com.billbull.backend.settings.branch.BranchAccessService.ListScope;

/**
 * Branch-Level Inventory Phase 9A — proves BarcodeTemplateService.getAll() uses the branch-scoped
 * query only when a scope is present (toggle on + active branch), and the existing unscoped query
 * otherwise (toggle off / admin All-Branches → byte-identical). System/global templates stay
 * visible because the scoped query includes branch_id IS NULL.
 */
@ExtendWith(MockitoExtension.class)
class BarcodeTemplateServiceBranchScopeTest {

    @Mock private BarcodeTemplateRepository repository;
    @Mock private InventoryBranchScopeResolver branchScopeResolver;

    private BarcodeTemplateService service() {
        // ensureSystemTemplates() calls findBySystemKey + save; stub leniently so getAll() runs.
        lenient().when(repository.findBySystemKey(any())).thenReturn(Optional.of(new BarcodeTemplate()));
        return new BarcodeTemplateService(repository, new ObjectMapper(), branchScopeResolver);
    }

    @Test
    void getAllToggleOffUsesUnscopedQuery() {
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.empty());
        when(repository.findAll(any(org.springframework.data.domain.Sort.class))).thenReturn(List.of());

        service().getAll();

        verify(repository).findAll(any(org.springframework.data.domain.Sort.class));
        verify(repository, never()).findInBranchScope(any());
    }

    @Test
    void getAllToggleOnUsesBranchScopedQuery() {
        ListScope scope = new ListScope(false, Set.of(3L));
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.of(scope));
        when(repository.findInBranchScope(scope.branchIds())).thenReturn(List.of());

        service().getAll();

        verify(repository).findInBranchScope(scope.branchIds());
        verify(repository, never()).findAll(any(org.springframework.data.domain.Sort.class));
    }
}
