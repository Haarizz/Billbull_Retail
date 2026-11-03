package com.billbull.backend.sales.pricing;

import java.util.Arrays;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.billbull.backend.sales.pricing.PriceLevelService.PriceLevelRequest;
import com.billbull.backend.sales.pricing.PriceLevelService.PriceLevelResponse;
import com.billbull.backend.sales.pricing.ProductLevelPriceService.PriceRow;
import com.billbull.backend.sales.pricing.ProductLevelPriceService.PriceRowResponse;
import com.billbull.backend.security.ModulePermissionService;

/**
 * Price level management and product prices per level.
 *
 * <p>Permissions reuse existing modules: levels are a Sales setting ({@code sales.settings} edit to
 * manage); product prices are product data ({@code inventory.product} view / edit). Every screen that
 * picks a level (POS, sales documents, customer form, product form) may list them.
 */
@RestController
@RequestMapping("/api/price-levels")
public class PriceLevelController {

    static final String SETTINGS_MODULE = "sales.settings";
    static final String PRODUCT_MODULE = "inventory.product";
    static final String[] LIST_MODULES = {
            "sales.settings", "sales.pos", "sales.invoice", "sales.quotation", "sales.order",
            "sales.proforma", "sales.delivery", "sales.customer", "inventory.product"
    };

    private final PriceLevelService levelService;
    private final ProductLevelPriceService priceService;
    private final ModulePermissionService permissions;
    private ProductQuantityTierService tierService;

    public PriceLevelController(PriceLevelService levelService, ProductLevelPriceService priceService,
                                ModulePermissionService permissions) {
        this.levelService = levelService;
        this.priceService = priceService;
        this.permissions = permissions;
    }

    /** Setter-injected so the existing hand-built controller tests keep compiling. */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setTierService(ProductQuantityTierService tierService) {
        this.tierService = tierService;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<PriceLevelResponse> list(@RequestParam(defaultValue = "false") boolean includeInactive) {
        permissions.requireCanViewAny(LIST_MODULES);
        return levelService.list(includeInactive);
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public PriceLevelResponse create(@RequestBody PriceLevelRequest request) {
        permissions.requireCanEdit(SETTINGS_MODULE);
        return levelService.create(request);
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PriceLevelResponse update(@PathVariable Long id, @RequestBody PriceLevelRequest request) {
        permissions.requireCanEdit(SETTINGS_MODULE);
        return levelService.update(id, request);
    }

    @PatchMapping("/{id}/active")
    @PreAuthorize("isAuthenticated()")
    public PriceLevelResponse setActive(@PathVariable Long id, @RequestParam boolean active) {
        permissions.requireCanEdit(SETTINGS_MODULE);
        return levelService.setActive(id, active);
    }

    /** Level prices for the given products (comma-separated ids), within the caller's branches. */
    @GetMapping("/product-prices")
    @PreAuthorize("isAuthenticated()")
    public List<PriceRowResponse> productPrices(@RequestParam String productIds) {
        permissions.requireCanViewAny(PRODUCT_MODULE, SETTINGS_MODULE);
        List<Long> ids = Arrays.stream(productIds.split(","))
                .map(String::trim).filter(s -> !s.isEmpty())
                .map(PriceLevelController::parseId)
                .distinct().limit(500).toList();
        return priceService.listForProducts(ids);
    }

    /** Sets or clears individual cells (null price = clear). */
    @PutMapping("/product-prices")
    @PreAuthorize("isAuthenticated()")
    public List<PriceRowResponse> upsertProductPrices(@RequestBody List<PriceRow> rows) {
        permissions.requireCanEdit(PRODUCT_MODULE);
        return priceService.upsert(rows);
    }

    /** Replaces one product's level prices within the caller's branches. */
    @PutMapping("/products/{productId}/prices")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PriceRowResponse>> replaceProductPrices(@PathVariable Long productId,
                                                                       @RequestBody List<PriceRow> rows) {
        permissions.requireCanEdit(PRODUCT_MODULE);
        return ResponseEntity.ok(priceService.replaceForProduct(productId, rows));
    }

    // ------------------------------------------------------------------
    // Quantity tiers (Pricing Phase 3) — product data, like level prices.
    // ------------------------------------------------------------------

    /** Tiers of the given products (comma-separated ids), within the caller's branches. */
    @GetMapping("/quantity-tiers")
    @PreAuthorize("isAuthenticated()")
    public List<ProductQuantityTierService.TierResponse> quantityTiers(
            @RequestParam String productIds, @RequestParam(defaultValue = "false") boolean includeInactive) {
        permissions.requireCanViewAny(PRODUCT_MODULE, SETTINGS_MODULE);
        List<Long> ids = Arrays.stream(productIds.split(","))
                .map(String::trim).filter(s -> !s.isEmpty())
                .map(PriceLevelController::parseId)
                .distinct().limit(500).toList();
        return tierService.listForProducts(ids, includeInactive);
    }

    /** Products that have live tiers, for the tier list's search / level filter. */
    @GetMapping("/quantity-tiers/products")
    @PreAuthorize("isAuthenticated()")
    public ProductQuantityTierService.TieredProductPage tieredProducts(
            @RequestParam(required = false) String search, @RequestParam(required = false) Long priceLevelId,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        permissions.requireCanViewAny(PRODUCT_MODULE, SETTINGS_MODULE);
        return tierService.tieredProducts(search, priceLevelId, page, size);
    }

    @PostMapping("/quantity-tiers")
    @PreAuthorize("isAuthenticated()")
    public ProductQuantityTierService.TierResponse createQuantityTier(
            @RequestBody ProductQuantityTierService.TierRequest request) {
        permissions.requireCanEdit(PRODUCT_MODULE);
        return tierService.create(request);
    }

    @PutMapping("/quantity-tiers/{id}")
    @PreAuthorize("isAuthenticated()")
    public ProductQuantityTierService.TierResponse updateQuantityTier(
            @PathVariable Long id, @RequestBody ProductQuantityTierService.TierRequest request) {
        permissions.requireCanEdit(PRODUCT_MODULE);
        return tierService.update(id, request);
    }

    @PatchMapping("/quantity-tiers/{id}/active")
    @PreAuthorize("isAuthenticated()")
    public ProductQuantityTierService.TierResponse setQuantityTierActive(
            @PathVariable Long id, @RequestParam boolean active,
            @RequestParam(required = false) java.time.LocalDateTime expectedUpdatedAt) {
        permissions.requireCanEdit(PRODUCT_MODULE);
        return tierService.setActive(id, active, expectedUpdatedAt);
    }

    private static Long parseId(String s) {
        try {
            return Long.valueOf(s);
        } catch (NumberFormatException ex) {
            throw new PricingException("Invalid product id: " + s);
        }
    }
}
