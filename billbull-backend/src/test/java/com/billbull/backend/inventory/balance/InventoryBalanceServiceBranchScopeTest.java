package com.billbull.backend.inventory.balance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.scope.InventoryBranchScopeResolver;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.settings.branch.BranchAccessService.ListScope;

/**
 * Branch-Level Inventory Phase 4 — proves the toggle-gated wiring in InventoryBalanceService:
 * with the resolver reporting "no scope" (toggle off OR admin All-Branches) the cross-warehouse
 * reads use the EXISTING unscoped repository methods (byte-identical behaviour); with a scope
 * present they use the branch-scoped variants with the scope's branch ids. Pure Mockito, no DB.
 */
@ExtendWith(MockitoExtension.class)
class InventoryBalanceServiceBranchScopeTest {

    @Mock private InventoryBalanceRepository balanceRepository;
    @Mock private StockMovementRepository movementRepository;
    @Mock private ProductRepository productRepository;
    @Mock private WarehouseRepository warehouseRepository;
    @Mock private InventoryBranchScopeResolver branchScopeResolver;

    private InventoryBalanceService service() {
        return new InventoryBalanceService(
                balanceRepository, movementRepository, productRepository, warehouseRepository,
                branchScopeResolver);
    }

    // -------- findAll() --------

    @Test
    void findAllUsesUnscopedQueryWhenNoScope() {
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.empty());
        List<InventoryBalance> expected = List.of(new InventoryBalance());
        when(balanceRepository.findAllPositiveStock()).thenReturn(expected);

        assertThat(service().findAll()).isSameAs(expected);

        verify(balanceRepository).findAllPositiveStock();
        verify(balanceRepository, never()).findAllPositiveStockByBranchIdIn(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void findAllUsesScopedQueryWhenScopePresent() {
        ListScope scope = new ListScope(false, Set.of(5L));
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.of(scope));
        List<InventoryBalance> expected = List.of(new InventoryBalance());
        when(balanceRepository.findAllPositiveStockByBranchIdIn(scope.branchIds())).thenReturn(expected);

        assertThat(service().findAll()).isSameAs(expected);

        verify(balanceRepository).findAllPositiveStockByBranchIdIn(scope.branchIds());
        verify(balanceRepository, never()).findAllPositiveStock();
    }

    // -------- totalInventoryValue() --------

    @Test
    void totalValueUsesUnscopedQueryWhenNoScope() {
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.empty());
        when(balanceRepository.sumTotalValue()).thenReturn(new BigDecimal("1000.00"));

        assertThat(service().totalInventoryValue()).isEqualByComparingTo("1000.00");

        verify(balanceRepository).sumTotalValue();
        verify(balanceRepository, never()).sumTotalValueByBranchIdIn(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void totalValueUsesScopedQueryWhenScopePresent() {
        ListScope scope = new ListScope(false, Set.of(5L));
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.of(scope));
        when(balanceRepository.sumTotalValueByBranchIdIn(scope.branchIds())).thenReturn(new BigDecimal("700.00"));

        assertThat(service().totalInventoryValue()).isEqualByComparingTo("700.00");

        verify(balanceRepository).sumTotalValueByBranchIdIn(scope.branchIds());
        verify(balanceRepository, never()).sumTotalValue();
    }

    // -------- findByWarehouse() — must never be branch-scoped (already branch-correct) --------

    @Test
    void findByWarehouseNeverConsultsResolverOrScopedQuery() {
        List<InventoryBalance> expected = List.of(new InventoryBalance());
        when(balanceRepository.findByWarehouseId(10L)).thenReturn(expected);

        assertThat(service().findByWarehouse(10L)).isSameAs(expected);

        verify(balanceRepository).findByWarehouseId(10L);
        org.mockito.Mockito.verifyNoInteractions(branchScopeResolver);
    }
}
