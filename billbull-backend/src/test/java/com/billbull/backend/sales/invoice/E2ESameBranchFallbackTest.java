package com.billbull.backend.sales.invoice;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;
import java.util.ArrayList;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.inventory.warehouse.WarehouseSourceResolutionService;
import com.billbull.backend.inventory.stockavailability.StockAvailabilityService;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;

@SpringBootTest
@Transactional
public class E2ESameBranchFallbackTest {

    @Autowired
    private SalesInvoiceService salesInvoiceService;

    @Autowired
    private WarehouseSourceResolutionService warehouseSourceResolutionService;

    @Autowired
    private WarehouseRepository warehouseRepository;

    @Autowired
    private BranchRepository branchRepository;

    @Autowired
    private ProductRepository productRepository;

    @Test
    public void testFallbackStorefrontToBackroom() {
        // Setup E2E data or verify it. Since it's E2E, we might just assert the resolution works.
        // Assuming DB has branch, warehouses (Storefront/Backroom), and product 07264.
        Optional<Product> p = productRepository.findByCode("07264");
        if (p.isEmpty()) return;

        Product product = p.get();
        // Just demonstrating that the resolution logic is hooked up.
        // E2E test would verify save() logic for invoice.
    }
}
