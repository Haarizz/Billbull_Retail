package com.billbull.backend.inventory.warehouse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.inventory.batch.BatchMasterRepository;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.sales.delivery.DeliveryNoteRepository;

/**
 * Unit tests for BinStockService, focused on the getStockByBin() optimized query path.
 * Verifies that:
 * - The optimized findStockByWarehouseAndBinsForProducts is called instead of the
 *   warehouse-wide findStockByWarehouseAndBins.
 * - Reservation lookups are bulk-fetched once per request rather than four queries per
 *   product, and the per-product reservation methods are never called from the loop.
 * - Reservation allocation behavior is preserved exactly.
 * - Edge cases (empty bins, multiple products, multiple bins, etc.) are handled.
 */
@ExtendWith(MockitoExtension.class)
class BinStockServiceTest {

    @Mock private StockMovementRepository stockMovementRepository;
    @Mock private BinRepository binRepository;
    @Mock private ProductRepository productRepository;
    @Mock private com.billbull.backend.sales.quotation.QuotationRepository quotationRepository;
    @Mock private com.billbull.backend.sales.salesorder.SalesOrderRepository salesOrderRepository;
    @Mock private DeliveryNoteRepository deliveryNoteRepository;
    @Mock private WarehouseStockService warehouseStockService;
    @Mock private BatchMasterRepository batchMasterRepository;

    @Captor private ArgumentCaptor<List<Product>> productListCaptor;
    @Captor private ArgumentCaptor<List<Long>> productIdListCaptor;

    private BinStockService binStockService;

    // Test constants
    private static final Long BIN_ID = 1L;
    private static final Long BIN_B_ID = 2L;
    private static final Long WAREHOUSE_ID = 10L;
    private static final Long PRODUCT_A_ID = 100L;
    private static final Long PRODUCT_B_ID = 200L;

    @BeforeEach
    void setUp() {
        binStockService = new BinStockService(
                stockMovementRepository,
                binRepository,
                productRepository,
                quotationRepository,
                salesOrderRepository,
                deliveryNoteRepository,
                warehouseStockService,
                batchMasterRepository
        );
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    /** Creates a minimal Bin → Locator → Zone → Warehouse chain for binRepository.findByIdEager. */
    private Bin stubBin(Long binId, Long warehouseId) {
        Warehouse warehouse = new Warehouse();
        warehouse.setId(warehouseId);

        Zone zone = new Zone();
        zone.setWarehouse(warehouse);

        Locator locator = new Locator();
        locator.setZone(zone);

        Bin bin = new Bin();
        bin.setId(binId);
        bin.setLocator(locator);

        return bin;
    }

    /** Creates a non-batch Product stub. */
    private Product stubProduct(Long id) {
        Product product = new Product();
        product.setId(id);
        product.setCode("P-" + id);
        product.setName("Product " + id);
        product.setBatch(false);
        return product;
    }

    /** Creates a batch-controlled Product stub. */
    private Product stubBatchProduct(Long id) {
        Product product = stubProduct(id);
        product.setBatch(true);
        return product;
    }

    /** Creates a stock identity row as returned by findStockIdentitiesByBin. */
    private Object[] identityRow(Long productId, String batch, String serial,
                                  java.time.LocalDate expiry, int qty) {
        return new Object[] { productId, batch, serial, expiry, qty };
    }

    /** Creates a warehouse-bin row as returned by findStockByWarehouseAndBinsForProducts. */
    private Object[] binRow(Long productId, Long binId, int onHand) {
        return new Object[] { productId, binId, onHand };
    }

    /** Creates a (productId, amount) row as returned by the bulk DN reservation queries. */
    private Object[] amountRow(Long productId, long amount) {
        return new Object[] { productId, BigDecimal.valueOf(amount) };
    }

    /** Type-safe wrapper to avoid Java inferring List<Object> from List.of(Object[]). */
    @SafeVarargs
    private List<Object[]> rows(Object[]... rows) {
        return List.of(rows);
    }

    /** Stubs the three bulk reservation fetches as returning nothing. */
    private void stubNoReservations(List<Long> productIds) {
        when(warehouseStockService.getSalesOrderReservationAllocations(anyList())).thenReturn(Map.of());
        when(deliveryNoteRepository.sumUnassignedReservedQtyInDispatchedNotesForProducts(productIds, WAREHOUSE_ID))
                .thenReturn(List.of());
        when(deliveryNoteRepository.sumReservedQtyInDispatchedNotesByBinForProducts(productIds, BIN_ID))
                .thenReturn(List.of());
    }

    /** Asserts none of the pre-refactor per-product reservation queries ran. */
    private void verifyNoPerProductReservationQueries() {
        verify(warehouseStockService, never()).getSalesOrderReservedForWarehouse(any(), any());
        verify(warehouseStockService, never()).getTotalReservedForWarehouse(any(), any());
        verify(deliveryNoteRepository, never()).sumUnassignedReservedQtyInDispatchedNotes(any(), any());
        verify(deliveryNoteRepository, never()).sumReservedQtyInDispatchedNotesByBin(any(), any());
    }

    // ─── A. Bin with multiple products ──────────────────────────────────────────

    @Test
    @DisplayName("A. Bin with multiple products returns stock for each product in a constant query count")
    void binWithMultipleProducts() {
        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));

        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(rows(
                identityRow(PRODUCT_A_ID, null, null, null, 50),
                identityRow(PRODUCT_B_ID, null, null, null, 30)
        ));

        Product prodA = stubProduct(PRODUCT_A_ID);
        Product prodB = stubProduct(PRODUCT_B_ID);
        when(productRepository.findAllById(List.of(PRODUCT_A_ID, PRODUCT_B_ID)))
                .thenReturn(List.of(prodA, prodB));

        when(batchMasterRepository.findReservedBatchNumbersByBin(BIN_ID))
                .thenReturn(Collections.emptyList());

        // Optimized query returns data for both products across multiple bins
        when(stockMovementRepository.findStockByWarehouseAndBinsForProducts(WAREHOUSE_ID,
                List.of(PRODUCT_A_ID, PRODUCT_B_ID)))
                .thenReturn(rows(
                        binRow(PRODUCT_A_ID, BIN_ID, 50),
                        binRow(PRODUCT_B_ID, BIN_ID, 30)
                ));

        stubNoReservations(List.of(PRODUCT_A_ID, PRODUCT_B_ID));

        when(stockMovementRepository.findByBinId(BIN_ID)).thenReturn(Collections.emptyList());

        List<BinStockResponse> result = binStockService.getStockByBin(BIN_ID);

        assertEquals(2, result.size(), "Should return exactly two products");
        assertEquals(50, result.get(0).getQuantity());
        assertEquals(30, result.get(1).getQuantity());

        // Confirm the optimized method was called, NOT the warehouse-wide one
        verify(stockMovementRepository).findStockByWarehouseAndBinsForProducts(
                eq(WAREHOUSE_ID), eq(List.of(PRODUCT_A_ID, PRODUCT_B_ID)));
        verify(stockMovementRepository, never()).findStockByWarehouseAndBins(any());

        // Two products, but still exactly one call to each bulk reservation fetch
        verify(warehouseStockService, times(1)).getSalesOrderReservationAllocations(anyList());
        verify(deliveryNoteRepository, times(1))
                .sumUnassignedReservedQtyInDispatchedNotesForProducts(anyList(), eq(WAREHOUSE_ID));
        verify(deliveryNoteRepository, times(1))
                .sumReservedQtyInDispatchedNotesByBinForProducts(anyList(), eq(BIN_ID));
        verifyNoPerProductReservationQueries();
    }

    // ─── B. Bin with no products ────────────────────────────────────────────────

    @Test
    @DisplayName("B. Bin with no products returns empty list without warehouse query")
    void binWithNoProducts() {
        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));
        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(Collections.emptyList());

        List<BinStockResponse> result = binStockService.getStockByBin(BIN_ID);

        assertTrue(result.isEmpty(), "Empty bin should return empty list");

        // Neither the optimized nor warehouse-wide query should run
        verify(stockMovementRepository, never()).findStockByWarehouseAndBinsForProducts(any(), any());
        verify(stockMovementRepository, never()).findStockByWarehouseAndBins(any());
        verify(warehouseStockService, never()).getSalesOrderReservationAllocations(anyList());
        verifyNoPerProductReservationQueries();
    }

    // ─── C. Product existing in multiple bins ───────────────────────────────────

    @Test
    @DisplayName("C. Product existing in multiple bins — only requested bin stock shown")
    void productInMultipleBins() {
        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));

        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(rows(
                identityRow(PRODUCT_A_ID, null, null, null, 60)
        ));

        Product prodA = stubProduct(PRODUCT_A_ID);
        when(productRepository.findAllById(List.of(PRODUCT_A_ID))).thenReturn(List.of(prodA));

        when(batchMasterRepository.findReservedBatchNumbersByBin(BIN_ID))
                .thenReturn(Collections.emptyList());

        // Product A exists in Bin 1 (60) and Bin 2 (40)
        when(stockMovementRepository.findStockByWarehouseAndBinsForProducts(WAREHOUSE_ID, List.of(PRODUCT_A_ID)))
                .thenReturn(rows(
                        binRow(PRODUCT_A_ID, BIN_ID, 60),
                        binRow(PRODUCT_A_ID, BIN_B_ID, 40)
                ));

        stubNoReservations(List.of(PRODUCT_A_ID));
        when(stockMovementRepository.findByBinId(BIN_ID)).thenReturn(Collections.emptyList());

        List<BinStockResponse> result = binStockService.getStockByBin(BIN_ID);

        assertEquals(1, result.size());
        assertEquals(60, result.get(0).getQuantity(), "Should show the requested bin's quantity");
    }

    // ─── D. Warehouse-level reservation distribution ────────────────────────────

    @Test
    @DisplayName("D. Warehouse-level SO reservation is allocated across bins via the bulk allocation map")
    void warehouseReservationDistribution() {
        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));

        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(rows(
                identityRow(PRODUCT_A_ID, null, null, null, 60)
        ));

        Product prodA = stubProduct(PRODUCT_A_ID);
        when(productRepository.findAllById(List.of(PRODUCT_A_ID))).thenReturn(List.of(prodA));

        when(batchMasterRepository.findReservedBatchNumbersByBin(BIN_ID))
                .thenReturn(Collections.emptyList());

        // Product A: Bin 1 = 60, Bin 2 = 40 (total = 100)
        when(stockMovementRepository.findStockByWarehouseAndBinsForProducts(WAREHOUSE_ID, List.of(PRODUCT_A_ID)))
                .thenReturn(rows(
                        binRow(PRODUCT_A_ID, BIN_ID, 60),
                        binRow(PRODUCT_A_ID, BIN_B_ID, 40)
                ));

        // 10 reserved via sales orders, delivered through the bulk allocation map
        when(warehouseStockService.getSalesOrderReservationAllocations(anyList()))
                .thenReturn(Map.of(PRODUCT_A_ID, Map.of(WAREHOUSE_ID, 10)));
        when(deliveryNoteRepository.sumUnassignedReservedQtyInDispatchedNotesForProducts(
                List.of(PRODUCT_A_ID), WAREHOUSE_ID)).thenReturn(List.of());
        when(deliveryNoteRepository.sumReservedQtyInDispatchedNotesByBinForProducts(
                List.of(PRODUCT_A_ID), BIN_ID)).thenReturn(List.of());
        when(stockMovementRepository.findByBinId(BIN_ID)).thenReturn(Collections.emptyList());

        List<BinStockResponse> result = binStockService.getStockByBin(BIN_ID);

        assertEquals(1, result.size());
        // The allocateReservedToSelectedBin heuristic: smallest bin that can hold all 10 → Bin 2 (40).
        // Bin 2 (40) fits all 10 and is the smallest fitting bin. Since Bin 1 (60) also fits but is bigger,
        // Bin 2 gets the allocation, so Bin 1 gets 0.
        assertEquals(0, result.get(0).getReservedQuantity(),
                "All 10 reserved units fit in the smallest bin (Bin B with 40), so Bin A gets 0");
        verifyNoPerProductReservationQueries();
    }

    @Test
    @DisplayName("D2. A reservation recorded against another warehouse is not applied to this bin")
    void reservationInOtherWarehouseIsIgnored() {
        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));

        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(rows(
                identityRow(PRODUCT_A_ID, null, null, null, 20)
        ));

        Product prodA = stubProduct(PRODUCT_A_ID);
        when(productRepository.findAllById(List.of(PRODUCT_A_ID))).thenReturn(List.of(prodA));

        when(batchMasterRepository.findReservedBatchNumbersByBin(BIN_ID))
                .thenReturn(Collections.emptyList());

        when(stockMovementRepository.findStockByWarehouseAndBinsForProducts(WAREHOUSE_ID, List.of(PRODUCT_A_ID)))
                .thenReturn(rows(binRow(PRODUCT_A_ID, BIN_ID, 20)));

        // The bulk map carries reservations for several warehouses; only WAREHOUSE_ID applies here.
        when(warehouseStockService.getSalesOrderReservationAllocations(anyList()))
                .thenReturn(Map.of(PRODUCT_A_ID, Map.of(99L, 15)));
        when(deliveryNoteRepository.sumUnassignedReservedQtyInDispatchedNotesForProducts(
                List.of(PRODUCT_A_ID), WAREHOUSE_ID)).thenReturn(List.of());
        when(deliveryNoteRepository.sumReservedQtyInDispatchedNotesByBinForProducts(
                List.of(PRODUCT_A_ID), BIN_ID)).thenReturn(List.of());
        when(stockMovementRepository.findByBinId(BIN_ID)).thenReturn(Collections.emptyList());

        List<BinStockResponse> result = binStockService.getStockByBin(BIN_ID);

        assertEquals(1, result.size());
        assertEquals(0, result.get(0).getReservedQuantity(),
                "Warehouse scoping must still be honoured by the map lookup");
    }

    // ─── E. Reserved quantity greater than available quantity ────────────────────

    @Test
    @DisplayName("E. Reserved > on-hand caps at on-hand for the stock row")
    void reservedExceedsAvailable() {
        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));

        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(rows(
                identityRow(PRODUCT_A_ID, null, null, null, 5)
        ));

        Product prodA = stubProduct(PRODUCT_A_ID);
        when(productRepository.findAllById(List.of(PRODUCT_A_ID))).thenReturn(List.of(prodA));

        when(batchMasterRepository.findReservedBatchNumbersByBin(BIN_ID))
                .thenReturn(Collections.emptyList());

        // Only Bin 1 has stock (5 units)
        when(stockMovementRepository.findStockByWarehouseAndBinsForProducts(WAREHOUSE_ID, List.of(PRODUCT_A_ID)))
                .thenReturn(rows(
                        binRow(PRODUCT_A_ID, BIN_ID, 5)
                ));

        // 50 reserved — much more than on-hand
        when(warehouseStockService.getSalesOrderReservationAllocations(anyList()))
                .thenReturn(Map.of(PRODUCT_A_ID, Map.of(WAREHOUSE_ID, 50)));
        when(deliveryNoteRepository.sumUnassignedReservedQtyInDispatchedNotesForProducts(
                List.of(PRODUCT_A_ID), WAREHOUSE_ID)).thenReturn(List.of());
        when(deliveryNoteRepository.sumReservedQtyInDispatchedNotesByBinForProducts(
                List.of(PRODUCT_A_ID), BIN_ID)).thenReturn(List.of());
        when(stockMovementRepository.findByBinId(BIN_ID)).thenReturn(Collections.emptyList());

        List<BinStockResponse> result = binStockService.getStockByBin(BIN_ID);

        assertEquals(1, result.size());
        assertEquals(5, result.get(0).getQuantity());
        // Reserved capped at on-hand (5), not the full 50
        assertEquals(5, result.get(0).getReservedQuantity(),
                "Reserved should be capped at the bin on-hand quantity");
    }

    // ─── F. Multiple bins with proportional allocation ──────────────────────────

    @Test
    @DisplayName("F. Multiple bins — spread allocation when no single bin fits")
    void multipleBinsSpreadAllocation() {
        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));

        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(rows(
                identityRow(PRODUCT_A_ID, null, null, null, 3)
        ));

        Product prodA = stubProduct(PRODUCT_A_ID);
        when(productRepository.findAllById(List.of(PRODUCT_A_ID))).thenReturn(List.of(prodA));

        when(batchMasterRepository.findReservedBatchNumbersByBin(BIN_ID))
                .thenReturn(Collections.emptyList());

        // Product A: Bin 1 = 3, Bin 2 = 3 (no single bin fits 5)
        when(stockMovementRepository.findStockByWarehouseAndBinsForProducts(WAREHOUSE_ID, List.of(PRODUCT_A_ID)))
                .thenReturn(rows(
                        binRow(PRODUCT_A_ID, BIN_ID, 3),
                        binRow(PRODUCT_A_ID, BIN_B_ID, 3)
                ));

        // 5 reserved — cannot fit in one bin, must spread
        when(warehouseStockService.getSalesOrderReservationAllocations(anyList()))
                .thenReturn(Map.of(PRODUCT_A_ID, Map.of(WAREHOUSE_ID, 5)));
        when(deliveryNoteRepository.sumUnassignedReservedQtyInDispatchedNotesForProducts(
                List.of(PRODUCT_A_ID), WAREHOUSE_ID)).thenReturn(List.of());
        when(deliveryNoteRepository.sumReservedQtyInDispatchedNotesByBinForProducts(
                List.of(PRODUCT_A_ID), BIN_ID)).thenReturn(List.of());
        when(stockMovementRepository.findByBinId(BIN_ID)).thenReturn(Collections.emptyList());

        List<BinStockResponse> result = binStockService.getStockByBin(BIN_ID);

        assertEquals(1, result.size());
        // Spread allocation: bins sorted by onHand DESC then id ASC.
        // Both have onHand=3, so sorted by id: Bin 1 first, Bin 2 second.
        // Bin 1 gets min(3, 5)=3, remaining=2. Bin 2 gets min(3, 2)=2.
        // So Bin 1 (the requested bin) should have reserved=3.
        assertEquals(3, result.get(0).getReservedQuantity(),
                "Bin 1 should have 3 reserved via spread allocation");
    }

    // ─── G. Delivery note bin-level reservation ─────────────────────────────────

    @Test
    @DisplayName("G. Bin-assigned delivery note reservation is included in the total reserved")
    void deliveryNoteBinReservation() {
        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));

        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(rows(
                identityRow(PRODUCT_A_ID, null, null, null, 20)
        ));

        Product prodA = stubProduct(PRODUCT_A_ID);
        when(productRepository.findAllById(List.of(PRODUCT_A_ID))).thenReturn(List.of(prodA));

        when(batchMasterRepository.findReservedBatchNumbersByBin(BIN_ID))
                .thenReturn(Collections.emptyList());

        when(stockMovementRepository.findStockByWarehouseAndBinsForProducts(WAREHOUSE_ID, List.of(PRODUCT_A_ID)))
                .thenReturn(rows(binRow(PRODUCT_A_ID, BIN_ID, 20)));

        when(warehouseStockService.getSalesOrderReservationAllocations(anyList())).thenReturn(Map.of());
        when(deliveryNoteRepository.sumUnassignedReservedQtyInDispatchedNotesForProducts(
                List.of(PRODUCT_A_ID), WAREHOUSE_ID)).thenReturn(List.of());
        // 5 reserved directly at the bin level
        when(deliveryNoteRepository.sumReservedQtyInDispatchedNotesByBinForProducts(
                List.of(PRODUCT_A_ID), BIN_ID)).thenReturn(rows(amountRow(PRODUCT_A_ID, 5)));
        when(stockMovementRepository.findByBinId(BIN_ID)).thenReturn(Collections.emptyList());

        List<BinStockResponse> result = binStockService.getStockByBin(BIN_ID);

        assertEquals(1, result.size());
        assertEquals(5, result.get(0).getReservedQuantity(),
                "Bin-level delivery note reservation should be included");
        verify(deliveryNoteRepository, times(1))
                .sumReservedQtyInDispatchedNotesByBinForProducts(List.of(PRODUCT_A_ID), BIN_ID);
        verifyNoPerProductReservationQueries();
    }

    @Test
    @DisplayName("G2. Bin-assigned DN, unassigned DN and SO reservations sum together as before")
    void allThreeReservationSourcesSum() {
        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));

        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(rows(
                identityRow(PRODUCT_A_ID, null, null, null, 30)
        ));

        Product prodA = stubProduct(PRODUCT_A_ID);
        when(productRepository.findAllById(List.of(PRODUCT_A_ID))).thenReturn(List.of(prodA));

        when(batchMasterRepository.findReservedBatchNumbersByBin(BIN_ID))
                .thenReturn(Collections.emptyList());

        // Bin 1 is the only bin holding this product, so warehouse-level totals land here in full.
        when(stockMovementRepository.findStockByWarehouseAndBinsForProducts(WAREHOUSE_ID, List.of(PRODUCT_A_ID)))
                .thenReturn(rows(binRow(PRODUCT_A_ID, BIN_ID, 30)));

        when(warehouseStockService.getSalesOrderReservationAllocations(anyList()))
                .thenReturn(Map.of(PRODUCT_A_ID, Map.of(WAREHOUSE_ID, 4)));
        when(deliveryNoteRepository.sumUnassignedReservedQtyInDispatchedNotesForProducts(
                List.of(PRODUCT_A_ID), WAREHOUSE_ID)).thenReturn(rows(amountRow(PRODUCT_A_ID, 6)));
        when(deliveryNoteRepository.sumReservedQtyInDispatchedNotesByBinForProducts(
                List.of(PRODUCT_A_ID), BIN_ID)).thenReturn(rows(amountRow(PRODUCT_A_ID, 3)));
        when(stockMovementRepository.findByBinId(BIN_ID)).thenReturn(Collections.emptyList());

        List<BinStockResponse> result = binStockService.getStockByBin(BIN_ID);

        assertEquals(1, result.size());
        assertEquals(13, result.get(0).getReservedQuantity(), "4 (SO) + 6 (unassigned DN) + 3 (bin DN)");
    }

    // ─── H. Zero-quantity rows are skipped

    /**
     * Pins the {@code binOnHand == 0} skip branch in getStockByBin().
     *
     * Note: findStockIdentitiesByBin carries {@code HAVING SUM(quantity) > 0}, so the live
     * query cannot currently emit a zero row - this stubs one directly to pin the service-level
     * guard, which is what protects the endpoint if that HAVING clause is ever relaxed.
     */
    @Test
    @DisplayName("H. Zero-quantity identity rows are skipped; non-zero rows for the same product survive")
    void zeroQuantityRowsAreSkipped() {
        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));

        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(rows(
                identityRow(PRODUCT_A_ID, "ZERO-ROW", null, null, 0),
                identityRow(PRODUCT_A_ID, "LIVE-ROW", null, null, 7)
        ));

        Product prodA = stubProduct(PRODUCT_A_ID);
        when(productRepository.findAllById(List.of(PRODUCT_A_ID))).thenReturn(List.of(prodA));

        when(batchMasterRepository.findReservedBatchNumbersByBin(BIN_ID))
                .thenReturn(Collections.emptyList());

        when(stockMovementRepository.findStockByWarehouseAndBinsForProducts(WAREHOUSE_ID, List.of(PRODUCT_A_ID)))
                .thenReturn(rows(binRow(PRODUCT_A_ID, BIN_ID, 7)));

        stubNoReservations(List.of(PRODUCT_A_ID));
        when(stockMovementRepository.findByBinId(BIN_ID)).thenReturn(Collections.emptyList());

        List<BinStockResponse> result = binStockService.getStockByBin(BIN_ID);

        assertEquals(1, result.size(), "Only the non-zero row should be returned");
        assertEquals("LIVE-ROW", result.get(0).getBatchNumber());
        assertEquals(7, result.get(0).getQuantity());
    }

    // ─── I. Empty bin

    @Test
    @DisplayName("I. No identity rows at all -> empty result, no warehouse aggregation query")
    void noIdentityRowsReturnsEmpty() {
        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));
        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(Collections.emptyList());

        List<BinStockResponse> result = binStockService.getStockByBin(BIN_ID);

        assertTrue(result.isEmpty());
        verify(stockMovementRepository, never()).findStockByWarehouseAndBinsForProducts(any(), any());
    }

    // ─── J. Batch-controlled product

    /**
     * Batch products take the BatchMaster.status=RESERVED path and must NOT issue any of the
     * reservation queries — per-product before the refactor, bulk after it.
     */
    @Test
    @DisplayName("J. Batch product reserved flag comes from BatchMaster; no reservation queries run at all")
    void batchProductUsesBatchMasterAndSkipsReservationQueries() {
        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));

        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(rows(
                identityRow(PRODUCT_A_ID, "LOT-1", null, null, 1),
                identityRow(PRODUCT_A_ID, "LOT-2", null, null, 1)
        ));

        Product batchProduct = stubBatchProduct(PRODUCT_A_ID);
        when(productRepository.findAllById(List.of(PRODUCT_A_ID))).thenReturn(List.of(batchProduct));

        // Only LOT-1 is reserved in BatchMaster
        when(batchMasterRepository.findReservedBatchNumbersByBin(BIN_ID)).thenReturn(List.of("LOT-1"));

        when(stockMovementRepository.findStockByWarehouseAndBinsForProducts(WAREHOUSE_ID, List.of(PRODUCT_A_ID)))
                .thenReturn(rows(binRow(PRODUCT_A_ID, BIN_ID, 2)));
        when(stockMovementRepository.findByBinId(BIN_ID)).thenReturn(Collections.emptyList());

        List<BinStockResponse> result = binStockService.getStockByBin(BIN_ID);

        assertEquals(2, result.size());
        assertEquals(1, result.get(0).getReservedQuantity(), "LOT-1 is RESERVED in BatchMaster");
        assertEquals(0, result.get(1).getReservedQuantity(), "LOT-2 is not reserved");

        // The batch branch short-circuits before every reservation query, bulk ones included.
        verifyNoPerProductReservationQueries();
        verify(warehouseStockService, never()).getSalesOrderReservationAllocations(anyList());
        verify(deliveryNoteRepository, never())
                .sumUnassignedReservedQtyInDispatchedNotesForProducts(any(), any());
        verify(deliveryNoteRepository, never())
                .sumReservedQtyInDispatchedNotesByBinForProducts(any(), any());
    }

    @Test
    @DisplayName("J2. Mixed bin — only the non-batch products reach the bulk reservation queries")
    void mixedBatchAndNonBatchProducts() {
        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));

        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(rows(
                identityRow(PRODUCT_A_ID, "LOT-1", null, null, 1),
                identityRow(PRODUCT_B_ID, null, null, null, 25)
        ));

        Product batchProduct = stubBatchProduct(PRODUCT_A_ID);
        Product plainProduct = stubProduct(PRODUCT_B_ID);
        when(productRepository.findAllById(List.of(PRODUCT_A_ID, PRODUCT_B_ID)))
                .thenReturn(List.of(batchProduct, plainProduct));

        when(batchMasterRepository.findReservedBatchNumbersByBin(BIN_ID)).thenReturn(List.of("LOT-1"));

        when(stockMovementRepository.findStockByWarehouseAndBinsForProducts(WAREHOUSE_ID,
                List.of(PRODUCT_A_ID, PRODUCT_B_ID)))
                .thenReturn(rows(
                        binRow(PRODUCT_A_ID, BIN_ID, 1),
                        binRow(PRODUCT_B_ID, BIN_ID, 25)
                ));

        when(warehouseStockService.getSalesOrderReservationAllocations(anyList()))
                .thenReturn(Map.of(PRODUCT_B_ID, Map.of(WAREHOUSE_ID, 4)));
        when(deliveryNoteRepository.sumUnassignedReservedQtyInDispatchedNotesForProducts(
                List.of(PRODUCT_B_ID), WAREHOUSE_ID)).thenReturn(List.of());
        when(deliveryNoteRepository.sumReservedQtyInDispatchedNotesByBinForProducts(
                List.of(PRODUCT_B_ID), BIN_ID)).thenReturn(List.of());
        when(stockMovementRepository.findByBinId(BIN_ID)).thenReturn(Collections.emptyList());

        List<BinStockResponse> result = binStockService.getStockByBin(BIN_ID);

        assertEquals(2, result.size());
        assertEquals(1, result.get(0).getReservedQuantity(), "Batch row still resolved via BatchMaster");
        assertEquals(4, result.get(1).getReservedQuantity(), "Non-batch row still resolved via reservations");

        // The batch product must be excluded from both the product list and the id lists.
        verify(warehouseStockService).getSalesOrderReservationAllocations(productListCaptor.capture());
        assertEquals(List.of(plainProduct), productListCaptor.getValue(),
                "Batch products are excluded from the bulk SO/proforma accessor");

        verify(deliveryNoteRepository).sumUnassignedReservedQtyInDispatchedNotesForProducts(
                productIdListCaptor.capture(), eq(WAREHOUSE_ID));
        assertEquals(List.of(PRODUCT_B_ID), productIdListCaptor.getValue());
        verifyNoPerProductReservationQueries();
    }

    @Test
    @DisplayName("J3. Product id with no loaded Product row still gets both bulk DN lookups")
    void unknownProductStillIncludedInDeliveryNoteLookups() {
        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));

        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(rows(
                identityRow(PRODUCT_A_ID, null, null, null, 12)
        ));

        // Product row is missing (inactive/deleted) — findAllById returns nothing.
        when(productRepository.findAllById(List.of(PRODUCT_A_ID))).thenReturn(List.of());

        when(batchMasterRepository.findReservedBatchNumbersByBin(BIN_ID))
                .thenReturn(Collections.emptyList());

        when(stockMovementRepository.findStockByWarehouseAndBinsForProducts(WAREHOUSE_ID, List.of(PRODUCT_A_ID)))
                .thenReturn(rows(binRow(PRODUCT_A_ID, BIN_ID, 12)));

        when(deliveryNoteRepository.sumUnassignedReservedQtyInDispatchedNotesForProducts(
                List.of(PRODUCT_A_ID), WAREHOUSE_ID)).thenReturn(List.of());
        when(deliveryNoteRepository.sumReservedQtyInDispatchedNotesByBinForProducts(
                List.of(PRODUCT_A_ID), BIN_ID)).thenReturn(rows(amountRow(PRODUCT_A_ID, 2)));
        when(stockMovementRepository.findByBinId(BIN_ID)).thenReturn(Collections.emptyList());

        List<BinStockResponse> result = binStockService.getStockByBin(BIN_ID);

        assertEquals(1, result.size());
        assertEquals(2, result.get(0).getReservedQuantity(),
                "DN reservations still apply to product ids with no loaded Product row");
        // No Product instance exists, so the SO/proforma accessor is skipped — matching the old
        // per-product path, where a missing product short-circuited to 0 reserved.
        verify(warehouseStockService, never()).getSalesOrderReservationAllocations(anyList());
        verifyNoPerProductReservationQueries();
    }

    // ─── K. Warehouse-level unassigned delivery-note reservation

    @Test
    @DisplayName("K. Unassigned (bin IS NULL) dispatched-DN reservation is allocated to the fitting bin")
    void unassignedDeliveryNoteReservationIsAllocated() {
        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));

        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(rows(
                identityRow(PRODUCT_A_ID, null, null, null, 20)
        ));

        Product prodA = stubProduct(PRODUCT_A_ID);
        when(productRepository.findAllById(List.of(PRODUCT_A_ID))).thenReturn(List.of(prodA));

        when(batchMasterRepository.findReservedBatchNumbersByBin(BIN_ID))
                .thenReturn(Collections.emptyList());

        // Bin 1 is the only bin holding this product in the warehouse.
        when(stockMovementRepository.findStockByWarehouseAndBinsForProducts(WAREHOUSE_ID, List.of(PRODUCT_A_ID)))
                .thenReturn(rows(binRow(PRODUCT_A_ID, BIN_ID, 20)));

        when(warehouseStockService.getSalesOrderReservationAllocations(anyList())).thenReturn(Map.of());
        when(deliveryNoteRepository.sumUnassignedReservedQtyInDispatchedNotesForProducts(
                List.of(PRODUCT_A_ID), WAREHOUSE_ID)).thenReturn(rows(amountRow(PRODUCT_A_ID, 8)));
        when(deliveryNoteRepository.sumReservedQtyInDispatchedNotesByBinForProducts(
                List.of(PRODUCT_A_ID), BIN_ID)).thenReturn(List.of());
        when(stockMovementRepository.findByBinId(BIN_ID)).thenReturn(Collections.emptyList());

        List<BinStockResponse> result = binStockService.getStockByBin(BIN_ID);

        assertEquals(1, result.size());
        assertEquals(8, result.get(0).getReservedQuantity(),
                "Warehouse-level unassigned DN reservation lands on the only bin holding the product");
        verify(deliveryNoteRepository, times(1))
                .sumUnassignedReservedQtyInDispatchedNotesForProducts(List.of(PRODUCT_A_ID), WAREHOUSE_ID);
        verifyNoPerProductReservationQueries();
    }

    // ─── L. Negative (override) stock

    /**
     * Pins current behavior for a negative on-hand row.
     *
     * Two quirks are deliberately pinned here rather than fixed, so that the batching
     * refactor cannot silently change them:
     *   1. reservedQuantity comes out NEGATIVE, because the service computes
     *      Math.min(binOnHand, Math.max(remainingReserved, 0)) = Math.min(-5, 0) = -5.
     *   2. that in turn credits +5 of phantom remaining reservation to later rows of the
     *      same product (remainingReserved becomes 0 - (-5) = 5).
     *
     * Also note findStockIdentitiesByBin's {@code HAVING SUM(quantity) > 0} means the live
     * query cannot currently emit a negative row either, despite the service comment
     * claiming negative rows are included.
     */
    @Test
    @DisplayName("L. Negative on-hand row is returned, and its reserved quantity is negative (current behavior)")
    void negativeStockRowIsReturnedWithNegativeReserved() {
        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));

        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(rows(
                identityRow(PRODUCT_A_ID, null, null, null, -5)
        ));

        Product prodA = stubProduct(PRODUCT_A_ID);
        when(productRepository.findAllById(List.of(PRODUCT_A_ID))).thenReturn(List.of(prodA));

        when(batchMasterRepository.findReservedBatchNumbersByBin(BIN_ID))
                .thenReturn(Collections.emptyList());

        // HAVING SUM(quantity) > 0 means the warehouse aggregation returns nothing for this product.
        when(stockMovementRepository.findStockByWarehouseAndBinsForProducts(WAREHOUSE_ID, List.of(PRODUCT_A_ID)))
                .thenReturn(Collections.emptyList());

        stubNoReservations(List.of(PRODUCT_A_ID));
        when(stockMovementRepository.findByBinId(BIN_ID)).thenReturn(Collections.emptyList());

        List<BinStockResponse> result = binStockService.getStockByBin(BIN_ID);

        assertEquals(1, result.size(), "Negative rows are not skipped - only exactly-zero rows are");
        assertEquals(-5, result.get(0).getQuantity());
        assertEquals(-5, result.get(0).getReservedQuantity(),
                "Current behavior: Math.min(-5, 0) yields a negative reserved quantity");
    }

    @Test
    @DisplayName("L2. A zero bulk reservation row behaves exactly like an absent one")
    void zeroReservationRowIsHarmless() {
        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));

        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(rows(
                identityRow(PRODUCT_A_ID, null, null, null, 9)
        ));

        Product prodA = stubProduct(PRODUCT_A_ID);
        when(productRepository.findAllById(List.of(PRODUCT_A_ID))).thenReturn(List.of(prodA));

        when(batchMasterRepository.findReservedBatchNumbersByBin(BIN_ID))
                .thenReturn(Collections.emptyList());

        when(stockMovementRepository.findStockByWarehouseAndBinsForProducts(WAREHOUSE_ID, List.of(PRODUCT_A_ID)))
                .thenReturn(rows(binRow(PRODUCT_A_ID, BIN_ID, 9)));

        // COALESCE(...) makes zero-valued rows possible; a null amount must also be tolerated.
        when(warehouseStockService.getSalesOrderReservationAllocations(anyList()))
                .thenReturn(Map.of(PRODUCT_A_ID, Map.of(WAREHOUSE_ID, 0)));
        when(deliveryNoteRepository.sumUnassignedReservedQtyInDispatchedNotesForProducts(
                List.of(PRODUCT_A_ID), WAREHOUSE_ID)).thenReturn(rows(amountRow(PRODUCT_A_ID, 0)));
        when(deliveryNoteRepository.sumReservedQtyInDispatchedNotesByBinForProducts(
                List.of(PRODUCT_A_ID), BIN_ID)).thenReturn(rows(new Object[] { PRODUCT_A_ID, null }));
        when(stockMovementRepository.findByBinId(BIN_ID)).thenReturn(Collections.emptyList());

        List<BinStockResponse> result = binStockService.getStockByBin(BIN_ID);

        assertEquals(1, result.size());
        assertEquals(0, result.get(0).getReservedQuantity());
    }

    // ─── Verify the old warehouse-wide method is never called ───────────────────

    @Test
    @DisplayName("The warehouse-wide findStockByWarehouseAndBins is never called by getStockByBin")
    void warehouseWideMethodNotCalled() {
        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));

        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(rows(
                identityRow(PRODUCT_A_ID, null, null, null, 10)
        ));

        Product prodA = stubProduct(PRODUCT_A_ID);
        when(productRepository.findAllById(List.of(PRODUCT_A_ID))).thenReturn(List.of(prodA));

        when(batchMasterRepository.findReservedBatchNumbersByBin(BIN_ID))
                .thenReturn(Collections.emptyList());

        when(stockMovementRepository.findStockByWarehouseAndBinsForProducts(WAREHOUSE_ID, List.of(PRODUCT_A_ID)))
                .thenReturn(rows(binRow(PRODUCT_A_ID, BIN_ID, 10)));

        stubNoReservations(List.of(PRODUCT_A_ID));
        when(stockMovementRepository.findByBinId(BIN_ID)).thenReturn(Collections.emptyList());

        binStockService.getStockByBin(BIN_ID);

        verify(stockMovementRepository, never()).findStockByWarehouseAndBins(any());
    }

    // ─── Query-count characterization ───────────────────────────────────────────

    /**
     * The 504 reproduction case in miniature: many non-batch products in one bin.
     *
     * Before the refactor this issued 6 fixed queries plus 4 per non-batch product
     * (6 + 4N). This test pins the new shape: the per-product reservation methods are
     * never touched, and each bulk fetch runs exactly once no matter how many products
     * the bin holds.
     */
    @Test
    @DisplayName("Query count is constant in the number of products (no 4N reservation term)")
    void reservationQueryCountIsConstant() {
        int productCount = 40;
        List<Long> productIds = new java.util.ArrayList<>();
        List<Object[]> identityRows = new java.util.ArrayList<>();
        List<Object[]> binRows = new java.util.ArrayList<>();
        List<Product> products = new java.util.ArrayList<>();
        for (int i = 0; i < productCount; i++) {
            Long productId = 1000L + i;
            productIds.add(productId);
            identityRows.add(identityRow(productId, null, null, null, 5));
            binRows.add(binRow(productId, BIN_ID, 5));
            products.add(stubProduct(productId));
        }

        when(binRepository.findByIdEager(BIN_ID)).thenReturn(Optional.of(stubBin(BIN_ID, WAREHOUSE_ID)));
        when(stockMovementRepository.findStockIdentitiesByBin(BIN_ID)).thenReturn(identityRows);
        when(productRepository.findAllById(productIds)).thenReturn(products);
        when(batchMasterRepository.findReservedBatchNumbersByBin(BIN_ID)).thenReturn(Collections.emptyList());
        when(stockMovementRepository.findStockByWarehouseAndBinsForProducts(WAREHOUSE_ID, productIds))
                .thenReturn(binRows);
        stubNoReservations(productIds);
        when(stockMovementRepository.findByBinId(BIN_ID)).thenReturn(Collections.emptyList());

        List<BinStockResponse> result = binStockService.getStockByBin(BIN_ID);

        assertEquals(productCount, result.size());

        // Old shape: 4 queries × 40 products = 160 reservation queries. New shape: 3, total.
        verify(warehouseStockService, times(1)).getSalesOrderReservationAllocations(anyList());
        verify(deliveryNoteRepository, times(1))
                .sumUnassignedReservedQtyInDispatchedNotesForProducts(anyList(), eq(WAREHOUSE_ID));
        verify(deliveryNoteRepository, times(1))
                .sumReservedQtyInDispatchedNotesByBinForProducts(anyList(), eq(BIN_ID));
        verifyNoPerProductReservationQueries();
    }
}
