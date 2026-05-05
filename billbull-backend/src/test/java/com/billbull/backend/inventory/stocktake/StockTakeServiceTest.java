package com.billbull.backend.inventory.stocktake;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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

import com.billbull.backend.inventory.brand.Brand;
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
                binStockService);
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
        assertTrue(dto.isExpiryEnabled());
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
        assertEquals(20, movement.getQuantity());
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
        when(productRepo.findById(10L)).thenReturn(Optional.of(product(10L)));
        when(sessionRepo.save(any(StockTakeSession.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.approveSession("STK-1", "Admin");

        ArgumentCaptor<StockMovement> captor = ArgumentCaptor.forClass(StockMovement.class);
        verify(stockMovementRepo, times(2)).save(captor.capture());
        List<StockMovement> movements = captor.getAllValues();

        StockMovement oldExpiryRemoval = movements.get(0);
        assertEquals(-50, oldExpiryRemoval.getQuantity());
        assertEquals("OS-1", oldExpiryRemoval.getBatchNumber());
        assertEquals(LocalDate.parse("2026-06-01"), oldExpiryRemoval.getExpiryDate());

        StockMovement newExpiryCount = movements.get(1);
        assertEquals(70, newExpiryCount.getQuantity());
        assertEquals("ST-1", newExpiryCount.getBatchNumber());
        assertEquals(LocalDate.parse("2026-06-06"), newExpiryCount.getExpiryDate());
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
}
