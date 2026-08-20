package com.billbull.backend.inventory.warehouse;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import static org.mockito.Mockito.when;
import org.mockito.MockitoAnnotations;

import com.billbull.backend.settings.branch.Branch;

class WarehouseSourceResolutionServiceTest {

    @Mock
    private WarehouseRepository warehouseRepository;

    @Mock
    private WarehouseStockService warehouseStockService;

    @InjectMocks
    private WarehouseSourceResolutionService resolver;

    private Branch branchA;
    private Branch branchB;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);

        branchA = new Branch();
        branchA.setId(10L);

        branchB = new Branch();
        branchB.setId(20L);
    }

    private Warehouse createWarehouse(Long id, Branch branch, String name) {
        Warehouse w = new Warehouse();
        w.setId(id);
        w.setBranch(branch);
        w.setName(name);
        w.setStatus("Active");
        return w;
    }

    @Test
    void test1_DefaultWarehouseSufficient() {
        // A = 10, Requested = 2 -> A selected
        Warehouse wA = createWarehouse(1L, branchA, "A");
        when(warehouseRepository.findById(1L)).thenReturn(Optional.of(wA));
        when(warehouseStockService.getAvailableStock(1L, 100L)).thenReturn(BigDecimal.valueOf(10));

        WarehouseResolutionResult result = resolver.resolveSourceWarehouseForTransaction(
                10L, List.of(new WarehouseResolutionItem(100L, 2)), 1L, true);

        assertNotNull(result);
        assertEquals(1L, result.getWarehouseId());
    }

    @Test
    void test2_DefaultWarehouseEmptyFallbackAvailable() {
        // A = 0, B = 10, Requested = 1 -> B selected
        Warehouse wA = createWarehouse(1L, branchA, "A");
        Warehouse wB = createWarehouse(2L, branchA, "B");

        when(warehouseRepository.findById(1L)).thenReturn(Optional.of(wA));
        when(warehouseRepository.findByBranch_IdAndStatusOrderByIdAsc(10L, "Active"))
                .thenReturn(List.of(wA, wB));

        when(warehouseStockService.getAvailableStock(1L, 100L)).thenReturn(BigDecimal.ZERO);
        when(warehouseStockService.getAvailableStock(2L, 100L)).thenReturn(BigDecimal.valueOf(10));

        WarehouseResolutionResult result = resolver.resolveSourceWarehouseForTransaction(
                10L, List.of(new WarehouseResolutionItem(100L, 1)), 1L, true);

        assertNotNull(result);
        assertEquals(2L, result.getWarehouseId());
    }

    @Test
    void test3_DefaultPartiallyAvailableButInsufficient() {
        // A = 1, B = 10, Requested = 2 -> B selected (do not split)
        Warehouse wA = createWarehouse(1L, branchA, "A");
        Warehouse wB = createWarehouse(2L, branchA, "B");

        when(warehouseRepository.findById(1L)).thenReturn(Optional.of(wA));
        when(warehouseRepository.findByBranch_IdAndStatusOrderByIdAsc(10L, "Active"))
                .thenReturn(List.of(wA, wB));

        when(warehouseStockService.getAvailableStock(1L, 100L)).thenReturn(BigDecimal.ONE);
        when(warehouseStockService.getAvailableStock(2L, 100L)).thenReturn(BigDecimal.valueOf(10));

        WarehouseResolutionResult result = resolver.resolveSourceWarehouseForTransaction(
                10L, List.of(new WarehouseResolutionItem(100L, 2)), 1L, true);

        assertNotNull(result);
        assertEquals(2L, result.getWarehouseId());
    }

    @Test
    void test4_MultipleFallbackWarehouses() {
        // A = 0, B = 0, C = 10, Requested = 1 -> C selected
        Warehouse wA = createWarehouse(1L, branchA, "A");
        Warehouse wB = createWarehouse(2L, branchA, "B");
        Warehouse wC = createWarehouse(3L, branchA, "C");

        when(warehouseRepository.findById(1L)).thenReturn(Optional.of(wA));
        when(warehouseRepository.findByBranch_IdAndStatusOrderByIdAsc(10L, "Active"))
                .thenReturn(List.of(wA, wB, wC));

        when(warehouseStockService.getAvailableStock(1L, 100L)).thenReturn(BigDecimal.ZERO);
        when(warehouseStockService.getAvailableStock(2L, 100L)).thenReturn(BigDecimal.ZERO);
        when(warehouseStockService.getAvailableStock(3L, 100L)).thenReturn(BigDecimal.valueOf(10));

        WarehouseResolutionResult result = resolver.resolveSourceWarehouseForTransaction(
                10L, List.of(new WarehouseResolutionItem(100L, 1)), 1L, true);

        assertNotNull(result);
        assertEquals(3L, result.getWarehouseId());
    }

    @Test
    void test5_DeterministicOrdering() {
        // Both B and C can fulfill: B.id < C.id -> B selected
        Warehouse wA = createWarehouse(1L, branchA, "A");
        Warehouse wB = createWarehouse(2L, branchA, "B");
        Warehouse wC = createWarehouse(3L, branchA, "C");

        when(warehouseRepository.findById(1L)).thenReturn(Optional.of(wA));
        when(warehouseRepository.findByBranch_IdAndStatusOrderByIdAsc(10L, "Active"))
                .thenReturn(List.of(wA, wB, wC));

        when(warehouseStockService.getAvailableStock(1L, 100L)).thenReturn(BigDecimal.ZERO);
        when(warehouseStockService.getAvailableStock(2L, 100L)).thenReturn(BigDecimal.valueOf(10));
        when(warehouseStockService.getAvailableStock(3L, 100L)).thenReturn(BigDecimal.valueOf(10));

        WarehouseResolutionResult result = resolver.resolveSourceWarehouseForTransaction(
                10L, List.of(new WarehouseResolutionItem(100L, 1)), 1L, true);

        assertNotNull(result);
        assertEquals(2L, result.getWarehouseId());
    }

    @Test
    void test6_AllWarehousesInsufficient() {
        // A=0, B=2, C=3, Requested=5 -> null
        Warehouse wA = createWarehouse(1L, branchA, "A");
        Warehouse wB = createWarehouse(2L, branchA, "B");
        Warehouse wC = createWarehouse(3L, branchA, "C");

        when(warehouseRepository.findById(1L)).thenReturn(Optional.of(wA));
        when(warehouseRepository.findByBranch_IdAndStatusOrderByIdAsc(10L, "Active"))
                .thenReturn(List.of(wA, wB, wC));

        when(warehouseStockService.getAvailableStock(1L, 100L)).thenReturn(BigDecimal.ZERO);
        when(warehouseStockService.getAvailableStock(2L, 100L)).thenReturn(BigDecimal.valueOf(2));
        when(warehouseStockService.getAvailableStock(3L, 100L)).thenReturn(BigDecimal.valueOf(3));

        WarehouseResolutionResult result = resolver.resolveSourceWarehouseForTransaction(
                10L, List.of(new WarehouseResolutionItem(100L, 5)), 1L, true);

        assertNull(result);
    }

    @Test
    void test7_CrossBranchExclusion() {
        // Branch A: A=0, Branch B: B=100. Must not select B.
        Warehouse wA = createWarehouse(1L, branchA, "A");
        when(warehouseRepository.findById(1L)).thenReturn(Optional.of(wA));
        when(warehouseRepository.findByBranch_IdAndStatusOrderByIdAsc(10L, "Active"))
                .thenReturn(List.of(wA)); // B is not returned because it's for branch 10

        when(warehouseStockService.getAvailableStock(1L, 100L)).thenReturn(BigDecimal.ZERO);
        // We do not mock B because findByBranch_IdAndStatusOrderByIdAsc should only return A

        WarehouseResolutionResult result = resolver.resolveSourceWarehouseForTransaction(
                10L, List.of(new WarehouseResolutionItem(100L, 1)), 1L, true);

        assertNull(result);
    }

    @Test
    void test8_ReservationAwareFallback() {
        // A physical=5, reserved=5 -> net 0. B physical=10, reserved=0 -> net 10. Requested=1.
        Warehouse wA = createWarehouse(1L, branchA, "A");
        Warehouse wB = createWarehouse(2L, branchA, "B");

        when(warehouseRepository.findById(1L)).thenReturn(Optional.of(wA));
        when(warehouseRepository.findByBranch_IdAndStatusOrderByIdAsc(10L, "Active"))
                .thenReturn(List.of(wA, wB));

        // WarehouseStockService returns NET available stock.
        when(warehouseStockService.getAvailableStock(1L, 100L)).thenReturn(BigDecimal.ZERO);
        when(warehouseStockService.getAvailableStock(2L, 100L)).thenReturn(BigDecimal.valueOf(10));

        WarehouseResolutionResult result = resolver.resolveSourceWarehouseForTransaction(
                10L, List.of(new WarehouseResolutionItem(100L, 1)), 1L, true);

        assertNotNull(result);
        assertEquals(2L, result.getWarehouseId());
    }

    @Test
    void test10_MultiLineCartOneWarehouse() {
        // A: P1=5, P2=5. Requested P1=2, P2=3 -> A selected
        Warehouse wA = createWarehouse(1L, branchA, "A");

        when(warehouseRepository.findById(1L)).thenReturn(Optional.of(wA));
        when(warehouseStockService.getAvailableStock(1L, 100L)).thenReturn(BigDecimal.valueOf(5));
        when(warehouseStockService.getAvailableStock(1L, 200L)).thenReturn(BigDecimal.valueOf(5));

        WarehouseResolutionResult result = resolver.resolveSourceWarehouseForTransaction(
                10L, List.of(new WarehouseResolutionItem(100L, 2), new WarehouseResolutionItem(200L, 3)), 1L, true);

        assertNotNull(result);
        assertEquals(1L, result.getWarehouseId());
    }

    @Test
    void test11_MultiLineFallback() {
        // A: P1=0, P2=5. B: P1=10, P2=10. Requested P1=1, P2=1 -> B selected
        Warehouse wA = createWarehouse(1L, branchA, "A");
        Warehouse wB = createWarehouse(2L, branchA, "B");

        when(warehouseRepository.findById(1L)).thenReturn(Optional.of(wA));
        when(warehouseRepository.findByBranch_IdAndStatusOrderByIdAsc(10L, "Active"))
                .thenReturn(List.of(wA, wB));

        when(warehouseStockService.getAvailableStock(1L, 100L)).thenReturn(BigDecimal.ZERO);
        when(warehouseStockService.getAvailableStock(1L, 200L)).thenReturn(BigDecimal.valueOf(5));

        when(warehouseStockService.getAvailableStock(2L, 100L)).thenReturn(BigDecimal.valueOf(10));
        when(warehouseStockService.getAvailableStock(2L, 200L)).thenReturn(BigDecimal.valueOf(10));

        WarehouseResolutionResult result = resolver.resolveSourceWarehouseForTransaction(
                10L, List.of(new WarehouseResolutionItem(100L, 1), new WarehouseResolutionItem(200L, 1)), 1L, true);

        assertNotNull(result);
        assertEquals(2L, result.getWarehouseId());
    }

    @Test
    void test12_MultiLineSplitMustBeRejected() {
        // A: P1=5, P2=0. B: P1=0, P2=5. Requested P1=1, P2=1 -> Rejected
        Warehouse wA = createWarehouse(1L, branchA, "A");
        Warehouse wB = createWarehouse(2L, branchA, "B");

        when(warehouseRepository.findById(1L)).thenReturn(Optional.of(wA));
        when(warehouseRepository.findByBranch_IdAndStatusOrderByIdAsc(10L, "Active"))
                .thenReturn(List.of(wA, wB));

        when(warehouseStockService.getAvailableStock(1L, 100L)).thenReturn(BigDecimal.valueOf(5));
        when(warehouseStockService.getAvailableStock(1L, 200L)).thenReturn(BigDecimal.ZERO);

        when(warehouseStockService.getAvailableStock(2L, 100L)).thenReturn(BigDecimal.ZERO);
        when(warehouseStockService.getAvailableStock(2L, 200L)).thenReturn(BigDecimal.valueOf(5));

        WarehouseResolutionResult result = resolver.resolveSourceWarehouseForTransaction(
                10L, List.of(new WarehouseResolutionItem(100L, 1), new WarehouseResolutionItem(200L, 1)), 1L, true);

        assertNull(result);
    }

    @Test
    void testEmptyItemsShouldThrowException() {
        assertThrows(IllegalStateException.class, () -> {
            resolver.resolveSourceWarehouseForTransaction(10L, Collections.emptyList(), 1L, true);
        });
    }

    @Test
    void testRepeatedProductsAreAggregated() {
        // P1 requested twice, total qty = 4. A has 3. A fails.
        Warehouse wA = createWarehouse(1L, branchA, "A");
        when(warehouseRepository.findById(1L)).thenReturn(Optional.of(wA));
        when(warehouseStockService.getAvailableStock(1L, 100L)).thenReturn(BigDecimal.valueOf(3));
        
        when(warehouseRepository.findByBranch_IdAndStatusOrderByIdAsc(10L, "Active")).thenReturn(List.of(wA));

        WarehouseResolutionResult result = resolver.resolveSourceWarehouseForTransaction(
                10L, List.of(new WarehouseResolutionItem(100L, 2), new WarehouseResolutionItem(100L, 2)), 1L, true);

        assertNull(result); // Failed because 3 < 4
    }

    @Test
    void testStockCheckOff_DefaultWarehouseInsufficient() {
        // A = 0, Requested = 2 -> A selected because Stock Check OFF
        Warehouse wA = createWarehouse(1L, branchA, "A");
        when(warehouseRepository.findById(1L)).thenReturn(Optional.of(wA));
        when(warehouseStockService.getAvailableStock(1L, 100L)).thenReturn(BigDecimal.ZERO);

        WarehouseResolutionResult result = resolver.resolveSourceWarehouseForTransaction(
                10L, List.of(new WarehouseResolutionItem(100L, 2)), 1L, false);

        assertNotNull(result);
        assertEquals(1L, result.getWarehouseId());
    }

    @Test
    void testStockCheckOff_DefaultPartiallyAvailableButInsufficient_ShouldSelectDefault() {
        // A = 1, B = 10, Requested = 2, Stock Check OFF -> A selected (ignores B's higher stock)
        Warehouse wA = createWarehouse(1L, branchA, "A");
        Warehouse wB = createWarehouse(2L, branchA, "B");

        when(warehouseRepository.findById(1L)).thenReturn(Optional.of(wA));
        when(warehouseRepository.findByBranch_IdAndStatusOrderByIdAsc(10L, "Active"))
                .thenReturn(List.of(wA, wB));

        when(warehouseStockService.getAvailableStock(1L, 100L)).thenReturn(BigDecimal.valueOf(1));
        when(warehouseStockService.getAvailableStock(2L, 100L)).thenReturn(BigDecimal.valueOf(10));

        WarehouseResolutionResult result = resolver.resolveSourceWarehouseForTransaction(
                10L, List.of(new WarehouseResolutionItem(100L, 2)), 1L, false);

        assertNotNull(result);
        assertEquals(1L, result.getWarehouseId());
    }
}
