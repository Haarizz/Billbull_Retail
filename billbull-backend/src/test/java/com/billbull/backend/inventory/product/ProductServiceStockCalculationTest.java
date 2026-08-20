package com.billbull.backend.inventory.product;

import com.billbull.backend.inventory.scope.InventoryBranchScopeResolver;
import com.billbull.backend.inventory.scope.MasterDataBranchService;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.inventory.warehouse.WarehouseStockService;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.settings.branch.BranchAccessService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.*;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class ProductServiceStockCalculationTest {

    @Mock
    private ProductRepository productRepo;
    @Mock
    private StockMovementRepository stockMovementRepo;
    @Mock
    private WarehouseRepository warehouseRepo;
    @Mock
    private InventoryBranchScopeResolver branchScopeResolver;
    @Mock
    private MasterDataBranchService masterBranch;
    @Mock
    private WarehouseStockService warehouseStockService;

    @InjectMocks
    private ProductService productService;

    @BeforeEach
    void setUp() {
    }

    @Test
    void testAvailableStockRows_NoReservation() {
        Long productId = 1L;
        List<Long> productIds = List.of(productId);

        when(branchScopeResolver.activeListScope()).thenReturn(Optional.empty());
        when(stockMovementRepo.getTotalAvailableStockForProducts(productIds))
                .thenReturn(Collections.singletonList(new Object[]{productId, 10}));

        when(productRepo.findAllById(productIds)).thenReturn(List.of(new Product()));
        when(warehouseStockService.getReservedQuantitiesByProductAndWarehouse(anyList()))
                .thenReturn(Collections.emptyMap());

        List<Object[]> result = ReflectionTestUtils.invokeMethod(productService, "availableStockRows", productIds);

        assertEquals(1, result.size());
        assertEquals(productId, result.get(0)[0]);
        assertEquals(10, result.get(0)[1]);
    }

    @Test
    void testAvailableStockRows_FullyReserved() {
        Long productId = 1L;
        Long warehouseId = 1L;
        List<Long> productIds = List.of(productId);

        when(branchScopeResolver.activeListScope()).thenReturn(Optional.empty());
        when(stockMovementRepo.getTotalAvailableStockForProducts(productIds))
                .thenReturn(Collections.singletonList(new Object[]{productId, 10}));

        when(productRepo.findAllById(productIds)).thenReturn(List.of(new Product()));

        Map<Long, Map<Long, Integer>> allocations = new HashMap<>();
        Map<Long, Integer> whAlloc = new HashMap<>();
        whAlloc.put(warehouseId, 10);
        allocations.put(productId, whAlloc);
        when(warehouseStockService.getReservedQuantitiesByProductAndWarehouse(anyList()))
                .thenReturn(allocations);

        List<Object[]> result = ReflectionTestUtils.invokeMethod(productService, "availableStockRows", productIds);

        assertEquals(1, result.size());
        assertEquals(productId, result.get(0)[0]);
        assertEquals(0, result.get(0)[1]);
    }

    @Test
    void testAvailableStockRows_PartiallyReserved() {
        Long productId = 1L;
        Long warehouseId = 1L;
        List<Long> productIds = List.of(productId);

        when(branchScopeResolver.activeListScope()).thenReturn(Optional.empty());
        when(stockMovementRepo.getTotalAvailableStockForProducts(productIds))
                .thenReturn(Collections.singletonList(new Object[]{productId, 10}));
        when(productRepo.findAllById(productIds)).thenReturn(List.of(new Product()));

        Map<Long, Map<Long, Integer>> allocations = new HashMap<>();
        Map<Long, Integer> whAlloc = new HashMap<>();
        whAlloc.put(warehouseId, 3);
        allocations.put(productId, whAlloc);
        when(warehouseStockService.getReservedQuantitiesByProductAndWarehouse(anyList()))
                .thenReturn(allocations);

        List<Object[]> result = ReflectionTestUtils.invokeMethod(productService, "availableStockRows", productIds);

        assertEquals(1, result.size());
        assertEquals(productId, result.get(0)[0]);
        assertEquals(7, result.get(0)[1]);
    }

    @Test
    void testAvailableStockRows_MultipleReservations() {
        Long productId = 1L;
        Long warehouseId1 = 1L;
        Long warehouseId2 = 2L;
        List<Long> productIds = List.of(productId);

        when(branchScopeResolver.activeListScope()).thenReturn(Optional.empty());
        when(stockMovementRepo.getTotalAvailableStockForProducts(productIds))
                .thenReturn(Collections.singletonList(new Object[]{productId, 10}));
        when(productRepo.findAllById(productIds)).thenReturn(List.of(new Product()));

        Map<Long, Map<Long, Integer>> allocations = new HashMap<>();
        Map<Long, Integer> whAlloc = new HashMap<>();
        whAlloc.put(warehouseId1, 2);
        whAlloc.put(warehouseId2, 3);
        allocations.put(productId, whAlloc);
        when(warehouseStockService.getReservedQuantitiesByProductAndWarehouse(anyList()))
                .thenReturn(allocations);

        List<Object[]> result = ReflectionTestUtils.invokeMethod(productService, "availableStockRows", productIds);

        assertEquals(1, result.size());
        assertEquals(productId, result.get(0)[0]);
        assertEquals(5, result.get(0)[1]);
    }

    @Test
    void testAvailableStockRows_ZeroOnHand() {
        Long productId = 1L;
        List<Long> productIds = List.of(productId);

        when(branchScopeResolver.activeListScope()).thenReturn(Optional.empty());
        when(stockMovementRepo.getTotalAvailableStockForProducts(productIds))
                .thenReturn(Collections.singletonList(new Object[]{productId, 0}));
        when(productRepo.findAllById(productIds)).thenReturn(List.of(new Product()));

        when(warehouseStockService.getReservedQuantitiesByProductAndWarehouse(anyList()))
                .thenReturn(Collections.emptyMap());

        List<Object[]> result = ReflectionTestUtils.invokeMethod(productService, "availableStockRows", productIds);

        assertEquals(1, result.size());
        assertEquals(productId, result.get(0)[0]);
        assertEquals(0, result.get(0)[1]);
    }

    @Test
    void testAvailableStockRows_ReservedGreaterThenOnHand() {
        Long productId = 1L;
        Long warehouseId = 1L;
        List<Long> productIds = List.of(productId);

        when(branchScopeResolver.activeListScope()).thenReturn(Optional.empty());
        when(stockMovementRepo.getTotalAvailableStockForProducts(productIds))
                .thenReturn(Collections.singletonList(new Object[]{productId, 1}));
        when(productRepo.findAllById(productIds)).thenReturn(List.of(new Product()));

        Map<Long, Map<Long, Integer>> allocations = new HashMap<>();
        Map<Long, Integer> whAlloc = new HashMap<>();
        whAlloc.put(warehouseId, 2);
        allocations.put(productId, whAlloc);
        when(warehouseStockService.getReservedQuantitiesByProductAndWarehouse(anyList()))
                .thenReturn(allocations);

        List<Object[]> result = ReflectionTestUtils.invokeMethod(productService, "availableStockRows", productIds);

        assertEquals(1, result.size());
        assertEquals(productId, result.get(0)[0]);
        assertEquals(-1, result.get(0)[1]);
    }

    @Test
    void testAvailableStockRows_BranchIsolation() {
        Long productId = 1L;
        Long activeBranchId = 10L;
        Long activeWarehouseId = 100L;
        Long otherWarehouseId = 200L;
        
        List<Long> productIds = List.of(productId);

        Set<Long> activeBranchIds = Set.of(activeBranchId);
        BranchAccessService.ListScope scope = new BranchAccessService.ListScope(false, activeBranchIds);
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.of(scope));

        when(stockMovementRepo.getTotalAvailableStockForProductsAndBranchIdIn(productIds, scope.branchIds()))
                .thenReturn(Collections.singletonList(new Object[]{productId, 10}));

        Warehouse activeWarehouse = new Warehouse();
        activeWarehouse.setId(activeWarehouseId);
        when(warehouseRepo.findByBranchIdInOrGlobal(scope.branchIds())).thenReturn(List.of(activeWarehouse));

        when(productRepo.findAllById(productIds)).thenReturn(List.of(new Product()));

        Map<Long, Map<Long, Integer>> allocations = new HashMap<>();
        Map<Long, Integer> whAlloc = new HashMap<>();
        whAlloc.put(activeWarehouseId, 2);
        whAlloc.put(otherWarehouseId, 5);
        allocations.put(productId, whAlloc);
        
        when(warehouseStockService.getReservedQuantitiesByProductAndWarehouse(anyList()))
                .thenReturn(allocations);

        List<Object[]> result = ReflectionTestUtils.invokeMethod(productService, "availableStockRows", productIds);

        assertEquals(1, result.size());
        assertEquals(productId, result.get(0)[0]);
        assertEquals(8, result.get(0)[1]);
    }
}
