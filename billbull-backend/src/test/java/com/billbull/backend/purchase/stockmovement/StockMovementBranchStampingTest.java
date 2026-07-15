package com.billbull.backend.purchase.stockmovement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.inventory.balance.InventoryBalanceService;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.notification.NotificationEventPublisher;

/**
 * Branch-Level Inventory Phase 2 — unit tests for the single write-path branch-stamping
 * mechanism ({@link StockMovementService#stampBranch} / {@code resolveBranchIdForWarehouse}).
 * Pure Mockito; no DB. Read paths are unaffected and not exercised here.
 */
@ExtendWith(MockitoExtension.class)
class StockMovementBranchStampingTest {

    @Mock private StockMovementRepository repository;
    @Mock private ProductRepository productRepository;
    @Mock private NotificationEventPublisher notifPublisher;
    @Mock private InventoryBalanceService inventoryBalanceService;
    @Mock private WarehouseRepository warehouseRepository;

    @InjectMocks private StockMovementService service;

    @Test
    void stampsBranchFromWarehouseWhenBranchOwned() {
        when(warehouseRepository.findBranchIdByWarehouseId(7L)).thenReturn(42L);

        StockMovement sm = new StockMovement();
        sm.setWarehouseId(7L);

        service.stampBranch(sm);

        assertThat(sm.getBranchId()).isEqualTo(42L);
    }

    @Test
    void leavesBranchNullForGlobalWarehouse() {
        // Warehouse exists but has no branch → repository returns null → movement stays global.
        when(warehouseRepository.findBranchIdByWarehouseId(9L)).thenReturn(null);

        StockMovement sm = new StockMovement();
        sm.setWarehouseId(9L);

        service.stampBranch(sm);

        assertThat(sm.getBranchId()).isNull();
    }

    @Test
    void leavesBranchNullForOrphanWarehouse() {
        // Missing warehouse (orphan warehouse_id): projection query returns null, never throws.
        when(warehouseRepository.findBranchIdByWarehouseId(404L)).thenReturn(null);

        StockMovement sm = new StockMovement();
        sm.setWarehouseId(404L);

        service.stampBranch(sm);

        assertThat(sm.getBranchId()).isNull();
    }

    @Test
    void nullWarehouseIdStaysNullAndDoesNotHitRepository() {
        StockMovement sm = new StockMovement();
        sm.setWarehouseId(null);

        service.stampBranch(sm);

        assertThat(sm.getBranchId()).isNull();
        verify(warehouseRepository, never()).findBranchIdByWarehouseId(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void isIdempotentWhenBranchAlreadySet() {
        // A caller that already knows the branch (e.g. a cross-branch transfer leg) is preserved:
        // stampBranch must NOT overwrite and must NOT query the warehouse.
        StockMovement sm = new StockMovement();
        sm.setWarehouseId(7L);
        sm.setBranchId(99L);

        service.stampBranch(sm);

        assertThat(sm.getBranchId()).isEqualTo(99L);
        verify(warehouseRepository, never()).findBranchIdByWarehouseId(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void resolveBranchIdForWarehouseNullSafe() {
        lenient().when(warehouseRepository.findBranchIdByWarehouseId(1L)).thenReturn(5L);

        assertThat(service.resolveBranchIdForWarehouse(null)).isNull();
        assertThat(service.resolveBranchIdForWarehouse(1L)).isEqualTo(5L);
    }

    @Test
    void nullMovementDoesNotThrow() {
        service.stampBranch(null); // must be a safe no-op
    }
}
