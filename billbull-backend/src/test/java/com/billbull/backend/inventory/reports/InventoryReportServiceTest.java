package com.billbull.backend.inventory.reports;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductInventoryPolicyRepository;
import com.billbull.backend.inventory.product.ProductPricing;
import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;

@ExtendWith(MockitoExtension.class)
class InventoryReportServiceTest {

    @Mock private ProductRepository productRepo;
    @Mock private ProductPricingRepository pricingRepo;
    @Mock private ProductInventoryPolicyRepository inventoryRepo;
    @Mock private StockMovementRepository stockRepo;
    @Mock private WarehouseRepository warehouseRepo;
    @Mock private com.billbull.backend.inventory.scope.InventoryBranchScopeResolver branchScopeResolver;

    private InventoryReportService service;

    @BeforeEach
    void setUp() {
        service = new InventoryReportService(
                productRepo,
                pricingRepo,
                inventoryRepo,
                stockRepo,
                warehouseRepo,
                branchScopeResolver);
    }

    @Test
    void stockOnHandSplitsRowsByBatchNumber() {
        Product product = new Product();
        product.setId(10L);
        product.setCode("ITEM-10");
        product.setName("Batch Item");

        ProductPricing pricing = new ProductPricing();
        pricing.setProduct(product);
        pricing.setCost(new BigDecimal("4.00"));
        pricing.setRetailPrice(new BigDecimal("7.00"));

        Warehouse warehouse = new Warehouse();
        warehouse.setId(2L);
        warehouse.setName("Main Warehouse");

        when(stockRepo.findStockByWarehouseAndBatch(2L)).thenReturn(List.<Object[]>of(
                new Object[] { 10L, "BATCH-A", LocalDate.parse("2026-06-01"), 5 },
                new Object[] { 10L, "BATCH-B", LocalDate.parse("2026-07-01"), 3 }));
        when(productRepo.findAllById(List.of(10L))).thenReturn(List.of(product));
        when(pricingRepo.findByProductIdIn(List.of(10L))).thenReturn(List.of(pricing));
        when(inventoryRepo.findByProductIdIn(List.of(10L))).thenReturn(List.of());
        when(warehouseRepo.findAll()).thenReturn(List.of(warehouse));

        List<StockReportResponse> rows = service.getStockOnHand(2L);

        assertEquals(2, rows.size());
        assertEquals("BATCH-A", rows.get(0).getBatchNumber());
        assertEquals(LocalDate.parse("2026-06-01"), rows.get(0).getExpiryDate());
        assertEquals(new BigDecimal("5"), rows.get(0).getOnHand());
        assertEquals(new BigDecimal("20.00"), rows.get(0).getValue());
        assertEquals("BATCH-B", rows.get(1).getBatchNumber());
        assertEquals(new BigDecimal("3"), rows.get(1).getOnHand());
        assertEquals("Main Warehouse", rows.get(1).getWarehouse());
    }

    // ---------- Phase 10: all-warehouses report branch scoping ----------

    @Test
    void allWarehousesReportToggleOffUsesUnscopedQuery() {
        when(branchScopeResolver.activeListScope()).thenReturn(java.util.Optional.empty());
        when(stockRepo.findAllStockGroupedByProductWarehouseAndBatch()).thenReturn(List.of());

        service.getStockOnHand(null); // no warehouse, default branchScope=active

        org.mockito.Mockito.verify(stockRepo).findAllStockGroupedByProductWarehouseAndBatch();
        org.mockito.Mockito.verify(stockRepo, org.mockito.Mockito.never())
                .findAllStockGroupedByProductWarehouseAndBatchAndBranchIdIn(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void allWarehousesReportToggleOnUsesBranchScopedQuery() {
        var scope = new com.billbull.backend.settings.branch.BranchAccessService.ListScope(
                false, java.util.Set.of(1L));
        when(branchScopeResolver.activeListScope()).thenReturn(java.util.Optional.of(scope));
        when(stockRepo.findAllStockGroupedByProductWarehouseAndBatchAndBranchIdIn(scope.branchIds()))
                .thenReturn(List.of());

        service.getStockOnHand(null);

        org.mockito.Mockito.verify(stockRepo)
                .findAllStockGroupedByProductWarehouseAndBatchAndBranchIdIn(scope.branchIds());
        org.mockito.Mockito.verify(stockRepo, org.mockito.Mockito.never())
                .findAllStockGroupedByProductWarehouseAndBatch();
    }

    @Test
    void branchScopeAllForcesConsolidatedEvenWhenScopeActive() {
        // branchScope=all (allBranches=true) must NOT consult the resolver — consolidated path.
        when(stockRepo.findAllStockGroupedByProductWarehouseAndBatch()).thenReturn(List.of());

        service.getStockOnHand(null, true);

        org.mockito.Mockito.verify(stockRepo).findAllStockGroupedByProductWarehouseAndBatch();
        org.mockito.Mockito.verifyNoInteractions(branchScopeResolver);
    }
}
