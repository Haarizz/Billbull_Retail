package com.billbull.backend.inventory.stocktake;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;

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
                .thenReturn(List.of(new Object[] { 10L, 7 }));
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
