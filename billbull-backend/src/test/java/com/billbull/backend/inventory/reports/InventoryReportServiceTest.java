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

    private InventoryReportService service;

    @BeforeEach
    void setUp() {
        service = new InventoryReportService(
                productRepo,
                pricingRepo,
                inventoryRepo,
                stockRepo,
                warehouseRepo);
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
}
