package com.billbull.backend.inventory.stocktake;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.format.DateTimeFormatter;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import com.billbull.backend.inventory.batch.BatchMasterRepository;
import com.billbull.backend.inventory.brand.Brand;
import com.billbull.backend.inventory.batch.BatchMasterRepository;
import com.billbull.backend.inventory.department.Department;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductBarcode;
import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.inventory.product.ProductMedia;
import com.billbull.backend.inventory.product.ProductMediaRepository;
import com.billbull.backend.inventory.product.ProductPricing;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.BinRepository;
import com.billbull.backend.inventory.warehouse.BinStockService;
import com.billbull.backend.inventory.warehouse.WarehouseStockService;
import com.billbull.backend.purchase.stockmovement.StockMovement;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.purchase.stockmovement.StockSourceType;

@ExtendWith(MockitoExtension.class)
class StockTakeServiceTest {

    @Mock private StockTakeSessionRepository sessionRepo;
    @Mock private StockTakeItemRepository itemRepo;
    @Mock private StockTakeItemBatchRepository batchRepo;
    @Mock private WarehouseStockService warehouseStockService;
    @Mock private ProductRepository productRepo;
    @Mock private StockMovementRepository stockMovementRepo;
    @Mock private ProductMediaRepository mediaRepo;
    @Mock private ProductBarcodeRepository barcodeRepo;
    @Mock private BinRepository binRepo;
    @Mock private BinStockService binStockService;
    @Mock private StockTakeExpectedUnitRepository expectedUnitRepo;
    @Mock private StockTakeUnitScanRepository unitScanRepo;
    @Mock private BatchMasterRepository batchMasterRepo;
    @Mock private com.billbull.backend.financials.generalledger.postingengine.PostingEngineService postingEngineService;
    @Mock private com.billbull.backend.purchase.stockmovement.StockMovementService stockMovementService;
    @Mock private com.billbull.backend.inventory.scope.InventoryBranchScopeResolver branchScopeResolver;
    @Mock private com.billbull.backend.settings.branch.BranchAccessService branchAccessService;

    private StockTakeService service;

    @BeforeEach
    void setUp() {
        service = new StockTakeService(
                sessionRepo,
                itemRepo,
                batchRepo,
                warehouseStockService,
                productRepo,
                stockMovementRepo,
                mediaRepo,
                barcodeRepo,
                binRepo,
                binStockService,
                expectedUnitRepo,
                unitScanRepo,
                batchMasterRepo,
                postingEngineService,
                stockMovementService,
                branchScopeResolver,
                branchAccessService);
    }

    @Test
    void getProductsForStockTakeReturnsStockBarcodeAndTrackingFields() {
        Product product = product(10L);
        Pageable pageable = PageRequest.of(0, 15);

        when(productRepo.findForStockTake(eq(2L), isNull(), isNull(), eq("BAR-001"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(product), pageable, 1));
        when(stockMovementRepo.getAvailableStockForProductsInWarehouse(2L, List.of(10L)))
                .thenReturn(List.<Object[]>of(new Object[] { 10L, 7 }));
        when(barcodeRepo.findByProductIdIn(List.of(10L)))
                .thenReturn(List.of(barcode(product, "BAR-001"), barcode(product, "BAR-ALT")));
        when(mediaRepo.findByProductIdInAndIsPrimaryTrue(List.of(10L)))
                .thenReturn(List.of(media(product, "/images/item.png")));

        Page<StockTakeProductResponse> result = service.getProductsForStockTake(
                "COUNTING",
                2L,
                "Full Stock Take (All Items)",
                null,
                null,
                "BAR-001",
                0,
                15);

        StockTakeProductResponse dto = result.getContent().get(0);
        assertEquals(10L, dto.getId());
        assertEquals("SKU-10", dto.getSku());
        assertEquals(7, dto.getStock());
        assertEquals("BAR-001", dto.getBarcode());
        assertEquals(List.of("BAR-001", "BAR-ALT"), dto.getBarcodes());
        assertEquals("/images/item.png", dto.getImage());
        assertEquals(new BigDecimal("12.50"), dto.getCost());
        assertEquals(new BigDecimal("20.00"), dto.getRetailPrice());
        assertTrue(dto.isBatchEnabled());
        assertFalse(dto.isExpiryEnabled());
    }

    @Test
    void approveBatchedCountPostsVarianceAgainstSameBatchIdentity() {
        StockTakeSession session = session();
        StockTakeItem item = stockTakeItem(11L, session, 10L, 7L, 50, 70);
        item.getBatches().add(batch(item, 101L, "OS-1", LocalDate.parse("2026-06-01"), 70));
        session.setItems(List.of(item));

        Product product = product(10L);
        when(sessionRepo.findBySessionId("STK-1")).thenReturn(Optional.of(session));
        when(stockMovementRepo.findStockIdentitiesByProductAndBin(2L, 10L, 7L))
                .thenReturn(List.<Object[]>of(new Object[] { "OS-1", LocalDate.parse("2026-06-01"), 50 }));
        when(productRepo.findById(10L)).thenReturn(Optional.of(product));
        when(sessionRepo.save(any(StockTakeSession.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.approveSession("STK-1", "Admin");

        ArgumentCaptor<StockMovement> captor = ArgumentCaptor.forClass(StockMovement.class);
        verify(stockMovementRepo).save(captor.capture());
        StockMovement movement = captor.getValue();
        assertEquals(StockSourceType.STOCK_TAKE_ADJUSTMENT, movement.getSourceType());
        assertQty(20, movement.getQuantity());
        assertEquals("OS-1", movement.getBatchNumber());
        assertEquals(LocalDate.parse("2026-06-01"), movement.getExpiryDate());
        assertEquals(7L, movement.getBinId());
        assertEquals(new BigDecimal("12.50"), movement.getUnitCost());
    }

    @Test
    void approveBatchedCountMovesOldExpiryToCountedExpiry() {
        StockTakeSession session = session();
        StockTakeItem item = stockTakeItem(12L, session, 10L, 7L, 50, 70);
        item.getBatches().add(batch(item, 102L, "ST-1", LocalDate.parse("2026-06-06"), 70));
        session.setItems(List.of(item));

        when(sessionRepo.findBySessionId("STK-1")).thenReturn(Optional.of(session));
        when(stockMovementRepo.findStockIdentitiesByProductAndBin(2L, 10L, 7L))
                .thenReturn(List.<Object[]>of(new Object[] { "OS-1", LocalDate.parse("2026-06-01"), 50 }));
        when(batchMasterRepo.findAvailableMatching(10L, 7L, "OS-1")).thenReturn(List.of());
        when(productRepo.findById(10L)).thenReturn(Optional.of(product(10L)));
        when(sessionRepo.save(any(StockTakeSession.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.approveSession("STK-1", "Admin");

        ArgumentCaptor<StockMovement> captor = ArgumentCaptor.forClass(StockMovement.class);
        verify(stockMovementRepo, times(2)).save(captor.capture());
        List<StockMovement> movements = captor.getAllValues();

        StockMovement oldExpiryRemoval = movements.get(0);
        assertQty(-50, oldExpiryRemoval.getQuantity());
        assertEquals("OS-1", oldExpiryRemoval.getBatchNumber());
        assertEquals(LocalDate.parse("2026-06-01"), oldExpiryRemoval.getExpiryDate());

        StockMovement newExpiryCount = movements.get(1);
        assertQty(70, newExpiryCount.getQuantity());
        assertEquals("ST-1", newExpiryCount.getBatchNumber());
        assertEquals(LocalDate.parse("2026-06-06"), newExpiryCount.getExpiryDate());
    }

    @Test
    void addBatchSplitsQuantityIntoPerUnitRowsWithSharedLotPrefix() {
        StockTakeSession session = session();
        session.setStatus(StockTakeSession.StockTakeStatus.IN_PROGRESS);
        StockTakeItem item = stockTakeItem(20L, session, 10L, 7L, 0, 0);
        item.setBatchEnabled(true);
        item.setExpiryEnabled(false);

        when(itemRepo.findById(20L)).thenReturn(Optional.of(item));
        when(productRepo.findById(10L)).thenReturn(Optional.of(product(10L)));
        when(itemRepo.save(any(StockTakeItem.class))).thenAnswer(inv -> inv.getArgument(0));
        when(batchRepo.save(any(StockTakeItemBatch.class))).thenAnswer(inv -> inv.getArgument(0));

        List<StockTakeItemBatch> saved = service.addBatch(20L, null, null, 5);

        assertEquals(5, saved.size());
        // Every saved row carries quantity=1 — the per-unit storage model.
        for (StockTakeItemBatch b : saved) {
            assertEquals(1, b.getQuantity());
            assertFalse(b.isSeeded());
        }

        // All five share the same lot prefix and only differ in the trailing -{unitIndex}.
        // Format: ST-{ddMMyy}-L{NN}-{itemCode}-{unitIndex}
        Pattern fmt = Pattern.compile("^ST-(\\d{6})-L(\\d{2})-CODE10-(\\d+)$");
        String dateSegment = LocalDate.now().format(DateTimeFormatter.ofPattern("ddMMyy"));
        for (int i = 0; i < saved.size(); i++) {
            Matcher m = fmt.matcher(saved.get(i).getBatchNumber());
            assertTrue(m.matches(), "Unexpected batch number format: " + saved.get(i).getBatchNumber());
            assertEquals(dateSegment, m.group(1));
            assertEquals("01", m.group(2));            // first lot on the item -> L01
            assertEquals(String.valueOf(i + 1), m.group(3)); // unit index 1..5
        }

        // Item's countedQty equals the row count after recompute.
        assertEquals(5, item.getCountedQty());
    }

    @Test
    void addBatchPicksNextLotIndexWhenItemAlreadyHasLots() {
        StockTakeSession session = session();
        session.setStatus(StockTakeSession.StockTakeStatus.IN_PROGRESS);
        StockTakeItem item = stockTakeItem(21L, session, 10L, 7L, 0, 0);
        item.setBatchEnabled(true);
        item.setExpiryEnabled(false);
        // Pretend a prior addBatch already produced two unit rows under L01 today.
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("ddMMyy"));
        item.getBatches().add(batch(item, 200L, "ST-" + today + "-L01-CODE10-1", null, 1));
        item.getBatches().add(batch(item, 201L, "ST-" + today + "-L01-CODE10-2", null, 1));

        when(itemRepo.findById(21L)).thenReturn(Optional.of(item));
        when(productRepo.findById(10L)).thenReturn(Optional.of(product(10L)));
        when(itemRepo.save(any(StockTakeItem.class))).thenAnswer(inv -> inv.getArgument(0));
        when(batchRepo.save(any(StockTakeItemBatch.class))).thenAnswer(inv -> inv.getArgument(0));

        List<StockTakeItemBatch> saved = service.addBatch(21L, null, null, 2);

        assertEquals(2, saved.size());
        assertEquals("ST-" + today + "-L02-CODE10-1", saved.get(0).getBatchNumber());
        assertEquals("ST-" + today + "-L02-CODE10-2", saved.get(1).getBatchNumber());
    }

    @Test
    void addBatchUsesOpeningInventoryPrefixForOsSession() {
        StockTakeSession session = session();
        session.setStatus(StockTakeSession.StockTakeStatus.IN_PROGRESS);
        session.setType(StockTakeSession.StockTakeType.OPENING_INVENTORY);
        StockTakeItem item = stockTakeItem(22L, session, 10L, 7L, 0, 0);
        item.setBatchEnabled(true);
        item.setExpiryEnabled(false);

        when(itemRepo.findById(22L)).thenReturn(Optional.of(item));
        when(productRepo.findById(10L)).thenReturn(Optional.of(product(10L)));
        when(itemRepo.save(any(StockTakeItem.class))).thenAnswer(inv -> inv.getArgument(0));
        when(batchRepo.save(any(StockTakeItemBatch.class))).thenAnswer(inv -> inv.getArgument(0));

        List<StockTakeItemBatch> saved = service.addBatch(22L, null, null, 1);

        assertTrue(saved.get(0).getBatchNumber().startsWith("OS-"),
                "Opening Inventory should use OS prefix, got " + saved.get(0).getBatchNumber());
    }

    @Test
    void previewNextBatchNumberReturnsLotPrefixWithoutTrailingUnit() {
        StockTakeSession session = session();
        StockTakeItem item = stockTakeItem(23L, session, 10L, null, 0, 0);
        when(itemRepo.findById(23L)).thenReturn(Optional.of(item));
        when(productRepo.findById(10L)).thenReturn(Optional.of(product(10L)));

        String preview = service.previewNextBatchNumber(23L);

        // Format is the lot prefix only (no -{unitIndex} tail) so the user sees
        // the upcoming lot identifier rather than just "unit 1".
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("ddMMyy"));
        assertEquals("ST-" + today + "-L01-CODE10", preview);
    }

    @Test
    void addItemToSessionAllowsSameProductInDifferentBinsAndRejectsExactDuplicate() {
        StockTakeSession session = session();
        session.setStatus(StockTakeSession.StockTakeStatus.IN_PROGRESS);
        session.setItems(new java.util.ArrayList<>());

        Product p = product(10L);
        p.setBatch(false);
        p.setExpiryEnabled(false);

        when(sessionRepo.findBySessionId("STK-1")).thenReturn(Optional.of(session));
        when(productRepo.findById(10L)).thenReturn(Optional.of(p));
        when(barcodeRepo.findByProductId(10L)).thenReturn(List.of());
        when(mediaRepo.findByProductIdAndIsPrimaryTrue(10L)).thenReturn(Optional.empty());
        when(stockMovementRepo.getAvailableStock(2L, 10L)).thenReturn(BigDecimal.valueOf(50));
        when(itemRepo.save(any(StockTakeItem.class))).thenAnswer(inv -> {
            StockTakeItem saved = inv.getArgument(0);
            // Mimic JPA: assign an id and add to the session collection so subsequent
            // duplicate checks see the freshly-saved row.
            if (saved.getId() == null) saved.setId((long) (session.getItems().size() + 100));
            if (!session.getItems().contains(saved)) session.getItems().add(saved);
            return saved;
        });

        // First add — unbinned, succeeds.
        StockTakeItem first = service.addItemToSession("STK-1", 10L, 0, null);
        assertEquals(null, first.getBinId());

        // Second add — same product, no bin again — must be rejected.
        try {
            service.addItemToSession("STK-1", 10L, 0, null);
            assertTrue(false, "Expected duplicate (productId, binId=null) to be rejected");
        } catch (IllegalStateException e) {
            assertTrue(e.getMessage().toLowerCase().contains("already in the session"),
                    "Unexpected error message: " + e.getMessage());
        }

        // Third add — same product, but this time targeting bin 7 — succeeds.
        com.billbull.backend.inventory.warehouse.Bin bin = new com.billbull.backend.inventory.warehouse.Bin();
        bin.setId(7L);
        bin.setCode("BIN-A");
        com.billbull.backend.inventory.warehouse.Locator loc = new com.billbull.backend.inventory.warehouse.Locator();
        loc.setId(4L);
        com.billbull.backend.inventory.warehouse.Zone zone = new com.billbull.backend.inventory.warehouse.Zone();
        zone.setId(3L);
        loc.setZone(zone);
        bin.setLocator(loc);
        when(binRepo.findByIdEager(7L)).thenReturn(Optional.of(bin));
        when(stockMovementRepo.getStockByBin(2L, 10L, 7L)).thenReturn(BigDecimal.valueOf(20));

        StockTakeItem second = service.addItemToSession("STK-1", 10L, 0, 7L);
        assertEquals(7L, second.getBinId());
        assertEquals(20, second.getSystemQty()); // pulled from per-bin stock, not warehouse total

        // Fourth add — same product, same bin 7 — must be rejected.
        try {
            service.addItemToSession("STK-1", 10L, 0, 7L);
            assertTrue(false, "Expected duplicate (productId, binId=7) to be rejected");
        } catch (IllegalStateException e) {
            assertTrue(e.getMessage().toLowerCase().contains("already in the session"));
        }
    }

    @Test
    void approvePostsPerUnitMovementsForNewFormatLot() {
        StockTakeSession session = session();
        StockTakeItem item = stockTakeItem(24L, session, 10L, 7L, 0, 3);
        // Three unit rows representing one physical lot (qty=1 each).
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("ddMMyy"));
        item.getBatches().add(batch(item, 240L, "ST-" + today + "-L01-CODE10-1", null, 1));
        item.getBatches().add(batch(item, 241L, "ST-" + today + "-L01-CODE10-2", null, 1));
        item.getBatches().add(batch(item, 242L, "ST-" + today + "-L01-CODE10-3", null, 1));
        session.setItems(List.of(item));

        when(sessionRepo.findBySessionId("STK-1")).thenReturn(Optional.of(session));
        // No existing system stock — so reconcile should post +1 for each new unit.
        when(stockMovementRepo.findStockIdentitiesByProductAndBin(2L, 10L, 7L))
                .thenReturn(List.<Object[]>of());
        when(productRepo.findById(10L)).thenReturn(Optional.of(product(10L)));
        when(sessionRepo.save(any(StockTakeSession.class))).thenAnswer(inv -> inv.getArgument(0));

        service.approveSession("STK-1", "Admin");

        ArgumentCaptor<StockMovement> captor = ArgumentCaptor.forClass(StockMovement.class);
        verify(stockMovementRepo, times(3)).save(captor.capture());
        for (StockMovement m : captor.getAllValues()) {
            assertQty(1, m.getQuantity());
            assertEquals(StockSourceType.STOCK_TAKE_ADJUSTMENT, m.getSourceType());
        }
    }

    private Product product(Long id) {
        Brand brand = new Brand();
        brand.setId(3L);
        brand.setName("Acme");

        Department department = new Department();
        department.setId(4L);
        department.setName("Grocery");

        Product product = new Product();
        product.setId(id);
        product.setCode("CODE-10");
        product.setSku("SKU-10");
        product.setName("Tracked Item");
        product.setShortDesc("Tracked description");
        product.setBrand(brand);
        product.setDepartment(department);
        product.setBatch(true);
        product.setExpiryEnabled(false);

        ProductPricing pricing = new ProductPricing();
        pricing.setCost(new BigDecimal("12.50"));
        pricing.setRetailPrice(new BigDecimal("20.00"));
        product.setPricing(pricing);

        return product;
    }

    private StockTakeSession session() {
        StockTakeSession session = new StockTakeSession();
        session.setId(1L);
        session.setSessionId("STK-1");
        session.setWarehouseId(2L);
        session.setWarehouseName("Main Warehouse");
        session.setType(StockTakeSession.StockTakeType.INVENTORY_COUNTING);
        session.setStatus(StockTakeSession.StockTakeStatus.PENDING_APPROVAL);
        return session;
    }

    private StockTakeItem stockTakeItem(
            Long id,
            StockTakeSession session,
            Long productId,
            Long binId,
            int systemQty,
            int countedQty) {
        StockTakeItem item = new StockTakeItem();
        item.setId(id);
        item.setSession(session);
        item.setProductId(productId);
        item.setProductName("Tracked Item");
        item.setSku("SKU-10");
        item.setBinId(binId);
        item.setZoneId(3L);
        item.setLocatorId(4L);
        item.setSystemQty(systemQty);
        item.setCountedQty(countedQty);
        item.setVariance(countedQty - systemQty);
        item.setPrice(new BigDecimal("20.00"));
        item.setBatchEnabled(true);
        item.setExpiryEnabled(true);
        return item;
    }

    private StockTakeItemBatch batch(
            StockTakeItem item,
            Long id,
            String batchNumber,
            LocalDate expiryDate,
            int quantity) {
        StockTakeItemBatch batch = new StockTakeItemBatch();
        batch.setId(id);
        batch.setItem(item);
        batch.setBatchNumber(batchNumber);
        batch.setExpiryDate(expiryDate);
        batch.setQuantity(quantity);
        return batch;
    }

    private ProductBarcode barcode(Product product, String value) {
        ProductBarcode barcode = new ProductBarcode();
        barcode.setProduct(product);
        barcode.setBarcode(value);
        return barcode;
    }

    private ProductMedia media(Product product, String imageUrl) {
        ProductMedia media = new ProductMedia();
        media.setProduct(product);
        media.setImageUrl(imageUrl);
        return media;
    }

    /** Scale-independent quantity assert — StockMovement.quantity is BigDecimal (ARCHFIX §1.11). */
    private static void assertQty(long expected, BigDecimal actual) {
        assertEquals(0, BigDecimal.valueOf(expected).compareTo(actual),
                () -> "expected quantity " + expected + " but was " + actual);
    }

    // ---------- Phase 7: session list branch scoping ----------

    @Test
    void getAllSessionsToggleOffUsesUnscopedQuery() {
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.empty());
        when(sessionRepo.findAllActiveWithItems()).thenReturn(List.of());

        service.getAllSessions();

        verify(sessionRepo).findAllActiveWithItems();
        verify(sessionRepo, org.mockito.Mockito.never()).findActiveWithItemsInBranchScope(any());
    }

    @Test
    void getAllSessionsToggleOnUsesBranchScopedQuery() {
        var scope = new com.billbull.backend.settings.branch.BranchAccessService.ListScope(
                false, java.util.Set.of(5L));
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.of(scope));
        when(sessionRepo.findActiveWithItemsInBranchScope(scope.branchIds())).thenReturn(List.of());

        service.getAllSessions();

        verify(sessionRepo).findActiveWithItemsInBranchScope(scope.branchIds());
        verify(sessionRepo, org.mockito.Mockito.never()).findAllActiveWithItems();
    }
}
