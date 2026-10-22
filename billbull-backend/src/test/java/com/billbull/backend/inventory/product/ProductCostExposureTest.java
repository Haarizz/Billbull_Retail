package com.billbull.backend.inventory.product;

import com.billbull.backend.exception.GlobalExceptionHandler;
import com.billbull.backend.pos.auth.PosAuthFixture;
import com.billbull.backend.pos.search.PosLookupService;
import com.billbull.backend.pos.search.PosResolveResponse;
import com.billbull.backend.pos.search.PosSearchController;
import com.billbull.backend.pos.search.PosSearchService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static com.billbull.backend.pos.auth.PosAuthFixture.OWN;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Product cost at the API boundary: what the serialized response carries, per caller.
 *
 * <p>Requests go through the dispatcher and Jackson ({@link MockMvc}), so these assertions are on
 * the JSON a client receives, not on Java objects. Permissions are the real
 * {@link com.billbull.backend.security.ModulePermissionService} over role rows.
 */
class ProductCostExposureTest {

    private final PosAuthFixture auth = new PosAuthFixture();
    private final ProductService productService = mock(ProductService.class);
    private final PosSearchService searchService = mock(PosSearchService.class);
    private MockMvc mvc;
    private ProductAggregateResponse floorFromCost;
    private ProductAggregateResponse floorFromMinPrice;

    @BeforeEach
    void setUp() {
        floorFromCost = aggregate("P-1", null);                     // no minimum: cost is the floor
        floorFromMinPrice = aggregate("P-2", new BigDecimal("9.00")); // minimum set: cost is not used
        when(productService.getById(1L)).thenReturn(floorFromCost);
        when(productService.getAll()).thenReturn(List.of(floorFromCost, floorFromMinPrice));
        when(productService.searchProductsByBarcode(anyString())).thenReturn(List.of(floorFromCost));
        when(productService.getRecentlySold(anyInt(), anyInt()))
                .thenReturn(Map.of("content", List.of(floorFromCost, floorFromMinPrice)));
        PosResolveResponse resolved = new PosResolveResponse();
        resolved.setProduct(floorFromMinPrice);
        when(searchService.resolve(anyString())).thenReturn(resolved);

        ProductCostMasking masking = new ProductCostMasking(auth.permissions, new ObjectMapper());
        mvc = MockMvcBuilders.standaloneSetup(
                        new ProductController(productService, null, null, null, null, auth.permissions, null, masking),
                        new PosSearchController(searchService, mock(PosLookupService.class), auth.permissions, masking))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @AfterEach
    void tearDown() {
        auth.clear();
    }

    @Test
    void aUserWithNoCostingScreenGetsProductsWithoutCost() throws Exception {
        auth.signIn("CRM", OWN);

        mvc.perform(get("/api/products/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.product.name").value("P-1"))
                .andExpect(jsonPath("$.pricing.retailPrice").value(12.5))
                .andExpect(jsonPath("$.pricing.cost").doesNotExist())
                .andExpect(jsonPath("$.pricing.landingCost").doesNotExist())
                .andExpect(jsonPath("$.pricing.costMethod").doesNotExist())
                .andExpect(jsonPath("$.effectivePricing.cost").doesNotExist())
                .andExpect(jsonPath("$.branchPrices[0].cost").doesNotExist())
                .andExpect(jsonPath("$.branchPrices[0].retailPrice").value(12.0))
                .andExpect(jsonPath("$.activeBranchPrice.cost").doesNotExist());
        mvc.perform(get("/api/products"))
                .andExpect(jsonPath("$[0].pricing.cost").doesNotExist())
                .andExpect(jsonPath("$[1].pricing.cost").doesNotExist());
        mvc.perform(get("/api/products/by-barcode").param("barcode", "6291"))
                .andExpect(jsonPath("$[0].pricing.cost").doesNotExist())
                .andExpect(jsonPath("$[0].pricing.retailPrice").value(12.5));
    }

    @Test
    void costingScreensKeepTheFullAggregate() throws Exception {
        for (String role : List.of("INVENTORY_CLERK", "PURCHASER", "BRANCH_ADMIN")) {
            auth.signIn(role, OWN);
            mvc.perform(get("/api/products/1"))
                    .andExpect(jsonPath("$.pricing.cost").value(7.25))
                    .andExpect(jsonPath("$.pricing.landingCost").value(7.75))
                    .andExpect(jsonPath("$.pricing.costMethod").value("FIFO"))
                    .andExpect(jsonPath("$.branchPrices[0].cost").value(7.0));
        }
    }

    @Test
    void theTillKeepsCostOnlyWhereItIsThePriceFloor() throws Exception {
        auth.signIn("TILL_ONLY", OWN); // till, no product master

        mvc.perform(get("/api/products/recently-sold"))
                .andExpect(status().isOk())
                // No minimum price: the floor is cost, so it stays and the till warns as before.
                .andExpect(jsonPath("$.content[0].pricing.cost").value(7.25))
                .andExpect(jsonPath("$.content[0].pricing.landingCost").doesNotExist())
                .andExpect(jsonPath("$.content[0].pricing.costMethod").doesNotExist())
                // A minimum price is the floor: cost is not needed and is removed.
                .andExpect(jsonPath("$.content[1].pricing.minPrice").value(9.0))
                .andExpect(jsonPath("$.content[1].pricing.cost").doesNotExist());
        mvc.perform(get("/api/pos/resolve").param("q", "6291"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.product.pricing.retailPrice").value(12.5))
                .andExpect(jsonPath("$.product.pricing.cost").doesNotExist());
    }

    @Test
    void maskingNeverAltersTheStoredEntity() throws Exception {
        auth.signIn("CRM", OWN);
        mvc.perform(get("/api/products/1")).andExpect(jsonPath("$.pricing.cost").doesNotExist());

        assertEquals(new BigDecimal("7.25"), floorFromCost.getPricing().getCost());
        assertEquals(new BigDecimal("7.75"), floorFromCost.getPricing().getLandingCost());
        assertEquals(new BigDecimal("7.00"), floorFromCost.getBranchPrices().get(0).getCost());
    }

    private static ProductAggregateResponse aggregate(String name, BigDecimal minPrice) {
        Product product = new Product();
        product.setName(name);
        ProductPricing pricing = new ProductPricing();
        pricing.setCost(new BigDecimal("7.25"));
        pricing.setLandingCost(new BigDecimal("7.75"));
        pricing.setCostMethod(CostMethod.FIFO);
        pricing.setRetailPrice(new BigDecimal("12.50"));
        pricing.setMinPrice(minPrice);
        ProductBranchPricing branchPrice = new ProductBranchPricing();
        branchPrice.setCost(new BigDecimal("7.00"));
        branchPrice.setRetailPrice(new BigDecimal("12.00"));
        branchPrice.setMinPrice(minPrice);

        ProductAggregateResponse r = new ProductAggregateResponse();
        r.setProduct(product);
        r.setPricing(pricing);
        r.setEffectivePricing(pricing);
        r.setBranchPrices(List.of(branchPrice));
        r.setActiveBranchPrice(branchPrice);
        return r;
    }
}
