package com.billbull.backend.inventory.reports;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.inventory.product.ProductInventoryPolicyRepository;
import com.billbull.backend.inventory.product.ProductPriceChange;
import com.billbull.backend.inventory.product.ProductPriceChangeRepository;
import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.stocktransfer.StockTransferRepository;
import com.billbull.backend.inventory.warehouse.BinRepository;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.purchase.grn.GrnRepository;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.returns.SalesReturnRepository;

@ExtendWith(MockitoExtension.class)
class InventoryReportDataServiceTest {

    @Mock private InventoryReportService stockReportService;
    @Mock private ProductRepository productRepo;
    @Mock private ProductPricingRepository pricingRepo;
    @Mock private ProductPriceChangeRepository priceChangeRepo;
    @Mock private ProductInventoryPolicyRepository inventoryRepo;
    @Mock private ProductBarcodeRepository barcodeRepo;
    @Mock private StockMovementRepository stockRepo;
    @Mock private WarehouseRepository warehouseRepo;
    @Mock private BinRepository binRepo;
    @Mock private StockTransferRepository stockTransferRepo;
    @Mock private SalesInvoiceRepository salesInvoiceRepo;
    @Mock private PurchaseInvoiceRepository purchaseInvoiceRepo;
    @Mock private GrnRepository grnRepo;
    @Mock private com.billbull.backend.financials.generalledger.GlAccountBalanceRepository glBalanceRepo;
    @Mock private com.billbull.backend.inventory.scope.InventoryBranchScopeResolver branchScopeResolver;
    @Mock private SalesReturnRepository salesReturnRepo;

    private InventoryReportDataService service;

    @BeforeEach
    void setUp() {
        service = new InventoryReportDataService(
                stockReportService, productRepo, pricingRepo, priceChangeRepo, inventoryRepo,
                barcodeRepo, stockRepo, warehouseRepo, binRepo, stockTransferRepo,
                salesInvoiceRepo, purchaseInvoiceRepo, grnRepo, glBalanceRepo,
                branchScopeResolver, salesReturnRepo);
    }

    @Test
    void priceAuditReportsBothSidesOfTheChangeAndThePercentage() {
        LocalDate day = LocalDate.of(2026, 8, 20);
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.empty());
        when(priceChangeRepo.findInRange(eq(day.atStartOfDay()), eq(day.atTime(LocalTime.MAX)), any()))
                .thenReturn(List.of(priceChange(7L, "Retail", "30.00", "40.00",
                        day.atTime(9, 30), "amina")));
        when(productRepo.findAllById(List.of(7L))).thenReturn(List.of(product(7L, "SKU-7", "Desk Lamp")));

        InventoryReportDataResponse report =
                service.getReport("price_audit", null, day, day, null, null, null, null, null);

        assertEquals(1, report.getRows().size());
        Map<String, Object> row = report.getRows().get(0);
        assertEquals("SKU-7", row.get("sku"));
        assertEquals("Retail", row.get("priceLevel"));
        assertEquals(new BigDecimal("30.00"), row.get("oldPrice"));
        assertEquals(new BigDecimal("40.00"), row.get("newPrice"));
        assertEquals(0, new BigDecimal("33.3").compareTo((BigDecimal) row.get("pct")));
        assertEquals("amina", row.get("changedBy"));
    }

    @Test
    void priceAuditLeavesPercentageBlankWhenThereIsNoOldPrice() {
        LocalDate day = LocalDate.of(2026, 8, 20);
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.empty());
        when(priceChangeRepo.findInRange(any(), any(), any()))
                .thenReturn(List.of(priceChange(8L, "Online", null, "12.00",
                        day.atTime(11, 0), "amina")));
        when(productRepo.findAllById(List.of(8L))).thenReturn(List.of(product(8L, "SKU-8", "Wall Clock")));

        InventoryReportDataResponse report =
                service.getReport("price_audit", null, day, day, null, null, null, null, null);

        Map<String, Object> row = report.getRows().get(0);
        assertNull(row.get("oldPrice"));
        assertNull(row.get("pct"));
    }

    private static ProductPriceChange priceChange(Long productId, String level, String oldPrice,
            String newPrice, LocalDateTime at, String by) {
        ProductPriceChange change = new ProductPriceChange(productId, null, level,
                oldPrice == null ? null : new BigDecimal(oldPrice),
                newPrice == null ? null : new BigDecimal(newPrice));
        change.setCreatedAt(at);
        change.setCreatedBy(by);
        return change;
    }

    private static Product product(Long id, String sku, String name) {
        Product product = new Product();
        product.setId(id);
        product.setSku(sku);
        product.setName(name);
        return product;
    }
}
