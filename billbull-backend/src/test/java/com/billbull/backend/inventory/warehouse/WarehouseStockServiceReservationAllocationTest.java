package com.billbull.backend.inventory.warehouse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.inventory.batch.BatchAllocationRepository;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.reservation.PosStockReservationRepository;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;

/**
 * Characterizes {@link WarehouseStockService#getSalesOrderReservationAllocations(List)}, the bulk
 * accessor BinStockService.getStockByBin() now calls once per request instead of twice per product.
 *
 * <p>These tests pin the semantics the bin-stock path depends on: sales-order and proforma
 * reservations are merged, batch products are excluded from the product-code filter, warehouse
 * grouping is preserved, and null/non-positive warehouse rows are dropped.
 */
@ExtendWith(MockitoExtension.class)
class WarehouseStockServiceReservationAllocationTest {

    @Mock private StockMovementRepository stockRepo;
    @Mock private ProductRepository productRepo;
    @Mock private WarehouseRepository warehouseRepo;
    @Mock private ZoneRepository zoneRepo;
    @Mock private LocatorRepository locatorRepo;
    @Mock private BinRepository binRepo;
    @Mock private com.billbull.backend.sales.quotation.QuotationRepository quotationRepo;
    @Mock private com.billbull.backend.sales.salesorder.SalesOrderRepository salesOrderRepo;
    @Mock private com.billbull.backend.sales.proforma.ProformaRepository proformaRepo;
    @Mock private com.billbull.backend.sales.delivery.DeliveryNoteRepository deliveryNoteRepo;
    @Mock private BatchAllocationRepository batchAllocationRepository;
    @Mock private PosStockReservationRepository posStockReservationRepository;

    private WarehouseStockService warehouseStockService;

    private static final Long WAREHOUSE_ID = 10L;
    private static final Long OTHER_WAREHOUSE_ID = 11L;
    private static final Long PRODUCT_A_ID = 100L;
    private static final Long PRODUCT_B_ID = 200L;

    @BeforeEach
    void setUp() {
        warehouseStockService = new WarehouseStockService(
                stockRepo,
                productRepo,
                warehouseRepo,
                zoneRepo,
                locatorRepo,
                binRepo,
                quotationRepo,
                salesOrderRepo,
                proformaRepo,
                deliveryNoteRepo,
                batchAllocationRepository,
                posStockReservationRepository
        );
    }

    private Product stubProduct(Long id, boolean batch) {
        Product product = new Product();
        product.setId(id);
        product.setCode("P-" + id);
        product.setBatch(batch);
        return product;
    }

    private Object[] row(Long productId, Long warehouseId, long qty) {
        return new Object[] { productId, warehouseId, BigDecimal.valueOf(qty) };
    }

    /** Type-safe wrapper to avoid Java inferring List<Object> from List.of(Object[]). */
    @SafeVarargs
    private List<Object[]> rows(Object[]... rows) {
        return List.of(rows);
    }

    private List<Object[]> noRows() {
        return List.of();
    }

    @Test
    @DisplayName("Sales-order reservations are grouped by product and warehouse")
    void salesOrderReservationsAreGrouped() {
        Product prodA = stubProduct(PRODUCT_A_ID, false);
        when(salesOrderRepo.sumReservedQuantityForProductsByWarehouse(List.of("P-100")))
                .thenReturn(rows(row(PRODUCT_A_ID, WAREHOUSE_ID, 7),
                        row(PRODUCT_A_ID, OTHER_WAREHOUSE_ID, 3)));
        when(proformaRepo.sumReservedQuantityForProductsByWarehouse(List.of("P-100")))
                .thenReturn(noRows());

        Map<Long, Map<Long, Integer>> allocations =
                warehouseStockService.getSalesOrderReservationAllocations(List.of(prodA));

        assertEquals(7, allocations.get(PRODUCT_A_ID).get(WAREHOUSE_ID));
        assertEquals(3, allocations.get(PRODUCT_A_ID).get(OTHER_WAREHOUSE_ID));
    }

    @Test
    @DisplayName("Proforma reservations are merged into the same per-warehouse totals")
    void proformaReservationsAreMerged() {
        Product prodA = stubProduct(PRODUCT_A_ID, false);
        when(salesOrderRepo.sumReservedQuantityForProductsByWarehouse(List.of("P-100")))
                .thenReturn(rows(row(PRODUCT_A_ID, WAREHOUSE_ID, 7)));
        when(proformaRepo.sumReservedQuantityForProductsByWarehouse(List.of("P-100")))
                .thenReturn(rows(row(PRODUCT_A_ID, WAREHOUSE_ID, 4)));

        Map<Long, Map<Long, Integer>> allocations =
                warehouseStockService.getSalesOrderReservationAllocations(List.of(prodA));

        assertEquals(11, allocations.get(PRODUCT_A_ID).get(WAREHOUSE_ID),
                "7 from sales orders + 4 from proformas");
    }

    @Test
    @DisplayName("A proforma-only reservation still surfaces for the product")
    void proformaOnlyReservation() {
        Product prodA = stubProduct(PRODUCT_A_ID, false);
        when(salesOrderRepo.sumReservedQuantityForProductsByWarehouse(List.of("P-100")))
                .thenReturn(noRows());
        when(proformaRepo.sumReservedQuantityForProductsByWarehouse(List.of("P-100")))
                .thenReturn(rows(row(PRODUCT_A_ID, WAREHOUSE_ID, 6)));

        Map<Long, Map<Long, Integer>> allocations =
                warehouseStockService.getSalesOrderReservationAllocations(List.of(prodA));

        assertEquals(6, allocations.get(PRODUCT_A_ID).get(WAREHOUSE_ID));
    }

    @Test
    @DisplayName("Bulk call over several products yields the same per-product values as single calls")
    void bulkCallMatchesPerProductValues() {
        Product prodA = stubProduct(PRODUCT_A_ID, false);
        Product prodB = stubProduct(PRODUCT_B_ID, false);
        when(salesOrderRepo.sumReservedQuantityForProductsByWarehouse(List.of("P-100", "P-200")))
                .thenReturn(rows(row(PRODUCT_A_ID, WAREHOUSE_ID, 7), row(PRODUCT_B_ID, WAREHOUSE_ID, 2)));
        when(proformaRepo.sumReservedQuantityForProductsByWarehouse(List.of("P-100", "P-200")))
                .thenReturn(rows(row(PRODUCT_B_ID, WAREHOUSE_ID, 1)));

        Map<Long, Map<Long, Integer>> allocations =
                warehouseStockService.getSalesOrderReservationAllocations(List.of(prodA, prodB));

        assertEquals(7, allocations.get(PRODUCT_A_ID).get(WAREHOUSE_ID));
        assertEquals(3, allocations.get(PRODUCT_B_ID).get(WAREHOUSE_ID));
        // One query per source, regardless of product count.
        verify(salesOrderRepo, times(1)).sumReservedQuantityForProductsByWarehouse(List.of("P-100", "P-200"));
        verify(proformaRepo, times(1)).sumReservedQuantityForProductsByWarehouse(List.of("P-100", "P-200"));
    }

    @Test
    @DisplayName("Batch products are excluded from the product-code filter")
    void batchProductsAreExcluded() {
        Product batchProduct = stubProduct(PRODUCT_A_ID, true);
        Product plainProduct = stubProduct(PRODUCT_B_ID, false);
        when(salesOrderRepo.sumReservedQuantityForProductsByWarehouse(List.of("P-200")))
                .thenReturn(rows(row(PRODUCT_B_ID, WAREHOUSE_ID, 5)));
        when(proformaRepo.sumReservedQuantityForProductsByWarehouse(List.of("P-200")))
                .thenReturn(noRows());

        Map<Long, Map<Long, Integer>> allocations =
                warehouseStockService.getSalesOrderReservationAllocations(
                        List.of(batchProduct, plainProduct));

        assertEquals(5, allocations.get(PRODUCT_B_ID).get(WAREHOUSE_ID));
        assertTrue(allocations.get(PRODUCT_A_ID) == null, "Batch product contributes no allocation");
    }

    @Test
    @DisplayName("An all-batch product list issues no reservation query at all")
    void allBatchProductsIssueNoQuery() {
        Product batchProduct = stubProduct(PRODUCT_A_ID, true);

        Map<Long, Map<Long, Integer>> allocations =
                warehouseStockService.getSalesOrderReservationAllocations(List.of(batchProduct));

        assertTrue(allocations.isEmpty());
        verify(salesOrderRepo, never()).sumReservedQuantityForProductsByWarehouse(org.mockito.ArgumentMatchers.any());
        verify(proformaRepo, never()).sumReservedQuantityForProductsByWarehouse(org.mockito.ArgumentMatchers.any());
    }

    @Test
    @DisplayName("Null-warehouse and non-positive rows are dropped")
    void nullWarehouseAndNonPositiveRowsAreDropped() {
        Product prodA = stubProduct(PRODUCT_A_ID, false);
        when(salesOrderRepo.sumReservedQuantityForProductsByWarehouse(List.of("P-100")))
                .thenReturn(rows(row(PRODUCT_A_ID, null, 9), row(PRODUCT_A_ID, WAREHOUSE_ID, 0)));
        when(proformaRepo.sumReservedQuantityForProductsByWarehouse(List.of("P-100")))
                .thenReturn(noRows());

        Map<Long, Map<Long, Integer>> allocations =
                warehouseStockService.getSalesOrderReservationAllocations(List.of(prodA));

        assertTrue(allocations.isEmpty(), "Neither a null warehouse nor a zero quantity produces an entry");
    }

    @Test
    @DisplayName("An empty product list short-circuits without querying")
    void emptyProductListShortCircuits() {
        assertTrue(warehouseStockService.getSalesOrderReservationAllocations(List.of()).isEmpty());
        verify(salesOrderRepo, never()).sumReservedQuantityForProductsByWarehouse(org.mockito.ArgumentMatchers.any());
    }
}
