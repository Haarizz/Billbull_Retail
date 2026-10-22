package com.billbull.backend.inventory.product;

import com.billbull.backend.inventory.scope.InventoryBranchScopeResolver;
import com.billbull.backend.inventory.warehouse.WarehouseStockService;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * The product list row carries both discount fields the till needs, kept apart: {@code maxDiscount}
 * is the product master's "Maximum Discount %" cap, {@code defaultDiscount} the "POS Default
 * Discount %" applied on add. The POS used to apply the cap because the default never reached it.
 */
@ExtendWith(MockitoExtension.class)
class ProductServiceListDiscountTest {

    @Mock private ProductRepository productRepo;
    @Mock private ProductPricingRepository pricingRepo;
    @Mock private ProductMediaRepository mediaRepo;
    @Mock private ProductTaxRepository taxRepo;
    @Mock private ProductInventoryPolicyRepository inventoryRepo;
    @Mock private ProductBarcodeRepository barcodeRepo;
    @Mock private ProductPackingRepository packingRepo;
    @Mock private StockMovementRepository stockMovementRepo;
    @Mock private InventoryBranchScopeResolver branchScopeResolver;
    @Mock private WarehouseStockService warehouseStockService;

    @InjectMocks
    private ProductService productService;

    @Test
    @SuppressWarnings("unchecked")
    void listRowCarriesTheDefaultDiscountSeparatelyFromTheMaximum() {
        Product product = product(1L, 10);
        when(productRepo.findAllActiveForList(any())).thenReturn(new PageImpl<>(List.of(product)));
        when(pricingRepo.findByProductIdIn(any())).thenReturn(List.of(pricing(product, new BigDecimal("5.00"))));

        Map<String, Object> row = ((List<Map<String, Object>>) productService
                .getList(0, 20, null, null, null, null, null, null).get("content")).get(0);

        assertEquals(10, row.get("maxDiscount"));
        assertEquals(new BigDecimal("5.00"), row.get("defaultDiscount"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void aMaximumDiscountAloneIsNotReportedAsADefault() {
        Product product = product(1L, 10);
        when(productRepo.findAllActiveForList(any())).thenReturn(new PageImpl<>(List.of(product)));
        when(pricingRepo.findByProductIdIn(any())).thenReturn(List.of(pricing(product, BigDecimal.ZERO)));

        Map<String, Object> row = ((List<Map<String, Object>>) productService
                .getList(0, 20, null, null, null, null, null, null).get("content")).get(0);

        assertEquals(10, row.get("maxDiscount"));
        assertEquals(BigDecimal.ZERO, row.get("defaultDiscount"));
    }

    private static Product product(Long id, Integer maxDiscount) {
        Product product = new Product();
        product.setId(id);
        product.setName("Pump");
        product.setMaxDiscount(maxDiscount);
        return product;
    }

    private static ProductPricing pricing(Product product, BigDecimal defaultDiscount) {
        ProductPricing pricing = new ProductPricing();
        pricing.setProduct(product);
        pricing.setRetailPrice(new BigDecimal("200.00"));
        pricing.setMinPrice(new BigDecimal("190.00"));
        pricing.setDefaultDiscount(defaultDiscount);
        return pricing;
    }
}
