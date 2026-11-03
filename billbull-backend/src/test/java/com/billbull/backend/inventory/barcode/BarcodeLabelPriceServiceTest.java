package com.billbull.backend.inventory.barcode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atMost;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.inventory.barcode.LabelPriceModels.Item;
import com.billbull.backend.inventory.barcode.LabelPriceModels.Request;
import com.billbull.backend.inventory.barcode.LabelPriceModels.Response;
import com.billbull.backend.inventory.barcode.LabelPriceModels.Result;
import com.billbull.backend.inventory.barcode.LabelPriceModels.SourceOption;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductBarcode;
import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.inventory.product.ProductBranchPricing;
import com.billbull.backend.inventory.product.ProductPacking;
import com.billbull.backend.inventory.product.ProductPricing;
import com.billbull.backend.inventory.units.Unit;
import com.billbull.backend.sales.pricing.CustomerProductPrice;
import com.billbull.backend.sales.pricing.PriceLevel;
import com.billbull.backend.sales.pricing.PricingFixture;
import com.billbull.backend.sales.pricing.ProductLevelPrice;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchRepository;

/**
 * Pricing Phase 4 — the price a barcode label shows, resolved through the real shared resolver
 * over {@link PricingFixture}'s in-memory data.
 *
 * <p>Fixture: Retail (default, id 1), Wholesale (level, id 2). Product A (10) retails at 30,
 * Wholesale level 27, Wholesale tiers 20+ → 25 and 100+ → 23; a BOX of A is 12. Product B (11)
 * retails at 50, Wholesale 45. Customer ABC has a negotiated 25 on A for all branches.
 * Barcodes: A-PCS (A, piece), A-BOX (A, box), B-PCS (B, piece).
 */
class BarcodeLabelPriceServiceTest {

    PricingFixture fx;
    ProductBarcodeRepository barcodeRepository;
    BranchRepository branchRepository;
    BranchAccessService branchAccessService;
    BarcodeLabelPriceService service;

    final List<ProductBarcode> barcodes = new ArrayList<>();
    final List<ProductBranchPricing> branchRows = new ArrayList<>();
    Product a;
    Product b;
    ProductPacking aBox;

    @BeforeEach
    void setUp() {
        fx = new PricingFixture();
        barcodeRepository = mock(ProductBarcodeRepository.class);
        branchRepository = mock(BranchRepository.class);
        branchAccessService = mock(BranchAccessService.class);
        service = new BarcodeLabelPriceService(fx.service, fx.levelRepository, barcodeRepository,
                branchRepository, branchAccessService);

        when(fx.levelRepository.findAllByOrderBySortOrderAscNameAsc()).thenAnswer(inv -> fx.levels.values().stream()
                .sorted(Comparator.comparing(PriceLevel::getId)).toList());
        when(barcodeRepository.findByProductIdIn(anyList())).thenAnswer(inv -> {
            List<Long> ids = inv.getArgument(0);
            return barcodes.stream().filter(pb -> ids.contains(pb.getProduct().getId())).toList();
        });
        when(fx.branchPricingRepository.findByProductIdIn(anyList())).thenAnswer(inv -> branchRows);
        when(branchRepository.findById(anyLong())).thenAnswer(inv -> {
            Long id = inv.getArgument(0);
            Branch br = new Branch();
            br.setId(id);
            br.setName("Branch " + id);
            return Optional.of(br);
        });

        a = fx.products.get(0);
        b = fx.products.get(1);
        aBox = fx.packings.get(0);
        ProductPacking aPcs = packing(a, "PCS", "1");
        ProductPacking bPcs = packing(b, "PCS", "1");
        barcode(a, aPcs, "A-PCS");
        barcode(a, aBox, "A-BOX");
        barcode(b, bPcs, "B-PCS");
    }

    @AfterEach
    void clearBranch() {
        BranchContextHolder.clear();
    }

    // ------------------------------------------------------------------ sources

    @Test
    void sourcesAreBuiltFromTheConfiguredLevelsNotAFixedList() {
        PriceLevel vip = fx.level(3L, "VIP", false);
        PriceLevel dealer = fx.level(4L, "Dealer", false);
        PriceLevel old = fx.level(5L, "Old list", false);
        old.setActive(false);

        List<String> keys = service.sources().stream().map(SourceOption::key).toList();

        assertThat(keys).containsExactly("DEFAULT", "LEVEL:2", "LEVEL:" + vip.getId(), "LEVEL:" + dealer.getId(),
                "FIELD:WHOLESALE", "FIELD:ONLINE", "FIELD:MIN", "FIELD:MAX", "CUSTOMER");
        SourceOption def = service.sources().get(0);
        assertThat(def.label()).isEqualTo("Retail (selling price)");
        assertThat(service.sources()).filteredOn(o -> o.key().equals("CUSTOMER")).first()
                .satisfies(o -> assertThat(o.requiresCustomer()).isTrue());
    }

    // ------------------------------------------------------------------ 1. default retail

    @Test
    void defaultSourceShowsTheRetailPrice() {
        Response r = service.resolve(request(null, item("1", a, "A-PCS"), item("2", b, "B-PCS")));

        assertThat(r.sourceError()).isNull();
        assertThat(price(r, "1")).isEqualByComparingTo("30.00");
        assertThat(price(r, "2")).isEqualByComparingTo("50.00");
        assertThat(r.items().get(0).priceSource()).isEqualTo("BASE_PRICE");
        assertThat(r.items().get(0).unitBasis()).isEqualTo("BARCODE");
    }

    @Test
    void aTemplateWithoutAStoredSourceUsesTheDefault() {
        assertThat(service.resolve(request("", item("1", a, "A-PCS"))).source()).isEqualTo("DEFAULT");
        assertThat(service.resolve(request("RETAIL", item("1", a, "A-PCS"))).source()).isEqualTo("DEFAULT");
    }

    // ------------------------------------------------------------------ 2. wholesale

    @Test
    void wholesaleLevelAndWholesaleFieldAreDistinctSources() {
        pricing(a).setWholesalePrice(new BigDecimal("26.00"));

        Response level = service.resolve(request("LEVEL:2", item("1", a, "A-PCS"), item("2", b, "B-PCS")));
        Response field = service.resolve(request("FIELD:WHOLESALE", item("1", a, "A-PCS"), item("2", b, "B-PCS")));

        assertThat(price(level, "1")).isEqualByComparingTo("27.00");
        assertThat(price(level, "2")).isEqualByComparingTo("45.00");
        assertThat(price(field, "1")).isEqualByComparingTo("26.00");
        // B has no wholesale field: unavailable, never its retail price.
        assertThat(field.items().get(1).available()).isFalse();
        assertThat(field.items().get(1).price()).isNull();
        assertThat(field.items().get(1).message()).contains("wholesale price");
    }

    // ------------------------------------------------------------------ 3. custom level

    @Test
    void aNewlyCreatedLevelPricesLabelsAndAMissingLevelPriceIsUnavailable() {
        PriceLevel vip = fx.level(3L, "VIP", false);
        fx.levelPrice(10L, vip, "28.00");

        Response r = service.resolve(request("LEVEL:3", item("1", a, "A-PCS"), item("2", b, "B-PCS")));

        assertThat(r.sourceLabel()).isEqualTo("VIP");
        assertThat(price(r, "1")).isEqualByComparingTo("28.00");
        assertThat(r.items().get(0).sourceLabel()).isEqualTo("VIP");
        // B has no VIP price: no silent fallback to its retail 50.
        assertThat(r.items().get(1).available()).isFalse();
        assertThat(r.items().get(1).price()).isNull();
        assertThat(r.items().get(1).message()).isEqualTo("No VIP price is set for this product.");
    }

    // ------------------------------------------------------------------ 4. branch override

    @Test
    void aBranchPriceWinsOverTheAllBranchesPriceForThatBranchOnly() {
        branchRow(a, PricingFixture.BRANCH_A).setRetailPrice(new BigDecimal("32.00"));
        PriceLevel vip = fx.level(3L, "VIP", false);
        fx.levelPrice(10L, vip, "28.00");
        ProductLevelPrice vipBranch = new ProductLevelPrice();
        vipBranch.setProductId(10L);
        vipBranch.setPriceLevelId(3L);
        vipBranch.setBranchId(PricingFixture.BRANCH_A);
        vipBranch.setPrice(new BigDecimal("27.50"));
        fx.levelPrices.add(vipBranch);

        Response inA = service.resolve(request(null, PricingFixture.BRANCH_A, item("1", a, "A-PCS")));
        Response inB = service.resolve(request(null, PricingFixture.BRANCH_B, item("1", a, "A-PCS")));
        Response vipA = service.resolve(request("LEVEL:3", PricingFixture.BRANCH_A, item("1", a, "A-PCS")));
        Response vipB = service.resolve(request("LEVEL:3", PricingFixture.BRANCH_B, item("1", a, "A-PCS")));

        assertThat(price(inA, "1")).isEqualByComparingTo("32.00");
        assertThat(inA.items().get(0).priceSource()).isEqualTo("BRANCH_PRICE");
        assertThat(inA.branchName()).isEqualTo("Branch 1");
        assertThat(price(inB, "1")).isEqualByComparingTo("30.00");
        assertThat(price(vipA, "1")).isEqualByComparingTo("27.50");
        assertThat(vipA.items().get(0).priceSource()).isEqualTo("PRICE_LEVEL_BRANCH");
        assertThat(price(vipB, "1")).isEqualByComparingTo("28.00");
    }

    @Test
    void aBranchFieldValueWinsForFixedFields() {
        pricing(a).setWholesalePrice(new BigDecimal("26.00"));
        branchRow(a, PricingFixture.BRANCH_A).setWholesalePrice(new BigDecimal("24.00"));

        assertThat(price(service.resolve(request("FIELD:WHOLESALE", PricingFixture.BRANCH_A, item("1", a, "A-PCS"))), "1"))
                .isEqualByComparingTo("24.00");
        assertThat(price(service.resolve(request("FIELD:WHOLESALE", PricingFixture.BRANCH_B, item("1", a, "A-PCS"))), "1"))
                .isEqualByComparingTo("26.00");
    }

    // ------------------------------------------------------------------ 5. min / max

    @Test
    void minimumAndMaximumFieldsShowExactlyWhatIsConfigured() {
        pricing(a).setMinPrice(new BigDecimal("25.00"));
        pricing(a).setMaxPrice(new BigDecimal("35.00"));

        Response min = service.resolve(request("FIELD:MIN", item("1", a, "A-PCS"), item("2", b, "B-PCS")));
        Response max = service.resolve(request("FIELD:MAX", item("1", a, "A-PCS"), item("2", b, "B-PCS")));

        assertThat(price(min, "1")).isEqualByComparingTo("25.00");
        assertThat(price(max, "1")).isEqualByComparingTo("35.00");
        // The sales-document policy falls back to retail for an empty min/max; a label must not.
        assertThat(min.items().get(1).available()).isFalse();
        assertThat(max.items().get(1).available()).isFalse();
    }

    // ------------------------------------------------------------------ 6/7. customer

    @Test
    void customerPriceOnlyWhenTheCustomerSourceIsChosenExplicitly() {
        Request withCustomerButDefaultSource = request(null, item("1", a, "A-PCS"));
        withCustomerButDefaultSource.setCustomerId(fx.abc.getId());

        Response shelf = service.resolve(withCustomerButDefaultSource);
        Response customer = service.resolve(customerRequest(fx.abc.getId(), item("1", a, "A-PCS"), item("2", b, "B-PCS")));

        // A shelf label never shows a negotiated price, even with a customer id sent.
        assertThat(price(shelf, "1")).isEqualByComparingTo("30.00");
        assertThat(price(customer, "1")).isEqualByComparingTo("25.00");
        assertThat(customer.items().get(0).priceSource()).isEqualTo("CUSTOMER_SPECIFIC");
        assertThat(customer.customerName()).isEqualTo("Customer ABC");
        // B has no negotiated price: unavailable, not the customer's level price.
        assertThat(customer.items().get(1).available()).isFalse();
        assertThat(customer.items().get(1).message()).contains("no negotiated price");
    }

    @Test
    void customerBranchPriceWinsInThatBranch() {
        fx.mapping(fx.abc, 10L, PricingFixture.BRANCH_A, "24.00");

        Request inA = customerRequest(fx.abc.getId(), item("1", a, "A-PCS"));
        inA.setBranchId(PricingFixture.BRANCH_A);
        Request inB = customerRequest(fx.abc.getId(), item("1", a, "A-PCS"));
        inB.setBranchId(PricingFixture.BRANCH_B);

        Response ra = service.resolve(inA);
        assertThat(price(ra, "1")).isEqualByComparingTo("24.00");
        assertThat(ra.items().get(0).priceSource()).isEqualTo("CUSTOMER_SPECIFIC_BRANCH");
        assertThat(price(service.resolve(inB), "1")).isEqualByComparingTo("25.00");
    }

    @Test
    void customerSourceWithoutACustomerIsASourceError() {
        Response r = service.resolve(request("CUSTOMER", item("1", a, "A-PCS")));

        assertThat(r.sourceError()).isEqualTo("Choose a customer to print customer-specific prices.");
        assertThat(r.items()).allSatisfy(i -> assertThat(i.available()).isFalse());
    }

    // ------------------------------------------------------------------ 8. inactive / invalid

    @Test
    void anInactiveOrUnknownLevelOrMalformedSourceMakesEveryLabelUnavailable() {
        PriceLevel vip = fx.level(3L, "VIP", false);
        fx.levelPrice(10L, vip, "28.00");
        vip.setActive(false);

        Response inactive = service.resolve(request("LEVEL:3", item("1", a, "A-PCS")));
        Response unknown = service.resolve(request("LEVEL:99", item("1", a, "A-PCS")));
        Response malformed = service.resolve(request("COST", item("1", a, "A-PCS")));

        assertThat(inactive.sourceError()).contains("inactive");
        assertThat(inactive.items().get(0).price()).isNull();
        assertThat(unknown.sourceError()).contains("no longer exists");
        assertThat(malformed.sourceError()).contains("Unknown label price source");
        assertThat(malformed.items().get(0).available()).isFalse();
    }

    // ------------------------------------------------------------------ 9. expired

    @Test
    void anExpiredNegotiatedPriceIsNotShown() {
        CustomerProductPrice m = fx.abcOnA;
        m.setEffectiveTo(PricingFixture.TODAY.minusDays(1));

        Response r = service.resolve(customerRequest(fx.abc.getId(), item("1", a, "A-PCS")));

        assertThat(r.items().get(0).available()).isFalse();
        assertThat(r.items().get(0).price()).isNull();
    }

    // ------------------------------------------------------------------ 10/11. missing / cost

    @Test
    void aMissingSellingPriceIsUnavailableAndPurchaseCostIsNeverPrinted() {
        Product c = fx.product(12L, "C", "1");
        ProductPricing cp = pricing(c);
        cp.setRetailPrice(null);
        cp.setCost(new BigDecimal("12.00"));
        cp.setLandingCost(new BigDecimal("12.50"));
        ProductPacking cPcs = packing(c, "PCS", "1");
        cPcs.setCost(new BigDecimal("12.00"));
        barcode(c, cPcs, "C-PCS");

        for (String source : List.of("DEFAULT", "LEVEL:2", "FIELD:WHOLESALE", "FIELD:MIN", "FIELD:MAX", "FIELD:ONLINE")) {
            Result r = service.resolve(request(source, item("1", c, "C-PCS"))).items().get(0);
            assertThat(r.available()).as(source).isFalse();
            assertThat(r.price()).as(source).isNull();
            assertThat(r.message()).as(source).isNotBlank();
        }
    }

    // ------------------------------------------------------------------ 12. packing

    @Test
    void theBarcodeDecidesTheUnitAndAPackingPriceIsUsedAsConfigured() {
        aBox.setPrice(new BigDecimal("300.00"));
        pricing(a).setWholesalePrice(new BigDecimal("26.00"));
        // The queue says PCS but the barcode is the box's: the box is priced.
        Item boxSaidPcs = new Item("box", a.getId(), "A", "A-BOX", "PCS");

        Result def = service.resolve(request(null, boxSaidPcs)).items().get(0);
        Result level = service.resolve(request("LEVEL:2", boxSaidPcs)).items().get(0);
        Result field = service.resolve(request("FIELD:WHOLESALE", boxSaidPcs)).items().get(0);

        assertThat(def.unit()).isEqualTo("BOX");
        assertThat(def.unitBasis()).isEqualTo("BARCODE");
        assertThat(def.price()).isEqualByComparingTo("300.00");          // the box's own price, not 30 × 12
        assertThat(def.priceSource()).isEqualTo("PACKING_PRICE");
        assertThat(level.price()).isEqualByComparingTo("324.00");        // Wholesale 27 × 12
        assertThat(field.price()).isEqualByComparingTo("312.00");        // wholesale field 26 × 12
        assertThat(field.conversion()).isEqualByComparingTo("12");
    }

    @Test
    void aBoxWithoutItsOwnPriceIsTheBasePriceTimesTheConversion() {
        Result def = service.resolve(request(null, item("box", a, "A-BOX"))).items().get(0);
        assertThat(def.price()).isEqualByComparingTo("360.00");
    }

    @Test
    void anUnregisteredBarcodeIsPricedPerBaseUnitWithANote() {
        Result r = service.resolve(request(null, new Item("x", a.getId(), "A", "NOT-A-BARCODE", null))).items().get(0);
        assertThat(r.price()).isEqualByComparingTo("30.00");
        assertThat(r.unitBasis()).isEqualTo("BASE");
        assertThat(r.message()).contains("not registered");
    }

    // ------------------------------------------------------------------ 13/14. tiers

    @Test
    void anExplicitPricingQuantitySelectsTheTier() {
        assertThat(tierPrice("LEVEL:2", null)).isEqualByComparingTo("27.00");
        assertThat(tierPrice("LEVEL:2", "1")).isEqualByComparingTo("27.00");
        assertThat(tierPrice("LEVEL:2", "20")).isEqualByComparingTo("25.00");
        assertThat(tierPrice("LEVEL:2", "100")).isEqualByComparingTo("23.00");

        Request r = request("LEVEL:2", item("1", a, "A-PCS"));
        r.setPricingQuantity(new BigDecimal("20"));
        Result res = service.resolve(r).items().get(0);
        assertThat(res.tierApplied()).isTrue();
        assertThat(res.tierMinQuantity()).isEqualByComparingTo("20");
        assertThat(res.eligibleQuantity()).isEqualByComparingTo("20");
        assertThat(res.sourceLabel()).isEqualTo("Wholesale · tier 20+");
    }

    @Test
    void withoutAPricingQuantityNoTierAppliesAndLabelsAreNotAddedUp() {
        // Two labels of A: never summed into one purchase.
        Response r = service.resolve(request("LEVEL:2", item("1", a, "A-PCS"), item("2", a, "A-PCS")));
        assertThat(price(r, "1")).isEqualByComparingTo("27.00");
        assertThat(r.items().get(0).tierApplied()).isFalse();

        Request each15 = request("LEVEL:2", item("1", a, "A-PCS"), item("2", a, "A-PCS"));
        each15.setPricingQuantity(new BigDecimal("15"));
        Response each = service.resolve(each15);
        assertThat(price(each, "1")).isEqualByComparingTo("27.00");   // 15 each, not 30 together
        assertThat(price(each, "2")).isEqualByComparingTo("27.00");
    }

    @Test
    void aPricingQuantityIsInTheBarcodesUnitAndAFixedPricePackingIsNotTiered() {
        Request box = request("LEVEL:2", item("box", a, "A-BOX"));
        box.setPricingQuantity(new BigDecimal("2"));                   // 2 boxes = 24 base units
        Result r = service.resolve(box).items().get(0);
        assertThat(r.price()).isEqualByComparingTo("300.00");           // tier 25 × 12
        assertThat(r.eligibleQuantity()).isEqualByComparingTo("24");

        fx.tier(10L, fx.retail, null, "12", "20.00");
        aBox.setPrice(new BigDecimal("300.00"));
        Request fixedBox = request(null, item("box", a, "A-BOX"));
        fixedBox.setPricingQuantity(new BigDecimal("5"));
        Result fixed = service.resolve(fixedBox).items().get(0);
        assertThat(fixed.price()).isEqualByComparingTo("300.00");       // packing price, untiered
        assertThat(fixed.tierApplied()).isFalse();
    }

    @Test
    void aPricingQuantityIsIgnoredWithANoticeForFixedFieldsAndCustomerPrices() {
        pricing(a).setWholesalePrice(new BigDecimal("26.00"));
        Request field = request("FIELD:WHOLESALE", item("1", a, "A-PCS"));
        field.setPricingQuantity(new BigDecimal("100"));
        Response r = service.resolve(field);
        assertThat(price(r, "1")).isEqualByComparingTo("26.00");
        assertThat(r.notice()).contains("not used");

        Request bad = request("LEVEL:2", item("1", a, "A-PCS"));
        bad.setPricingQuantity(BigDecimal.ZERO);
        assertThat(service.resolve(bad).sourceError()).contains("greater than zero");
    }

    // ------------------------------------------------------------------ 15. branch access

    @Test
    void aBranchTheCallerCannotAccessIsRefused() {
        BranchContextHolder.set(new BranchContextHolder.BranchContext(PricingFixture.BRANCH_A,
                Set.of(PricingFixture.BRANCH_A), false));

        assertThatThrownBy(() -> service.resolve(request(null, PricingFixture.BRANCH_B, item("1", a, "A-PCS"))))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("not accessible");
        // Without a named branch the caller's current branch is used.
        assertThat(service.resolve(request(null, item("1", a, "A-PCS"))).branchId()).isEqualTo(PricingFixture.BRANCH_A);
    }

    @Test
    void aBranchProductOfAnotherBranchIsNotPriced() {
        Branch other = new Branch();
        other.setId(PricingFixture.BRANCH_B);
        b.setBranch(other);

        Result r = service.resolve(request(null, PricingFixture.BRANCH_A, item("2", b, "B-PCS"))).items().get(0);
        assertThat(r.available()).isFalse();
        assertThat(r.message()).contains("not available in this branch");
    }

    // ------------------------------------------------------------------ 16. bulk

    @Test
    void bulkLabelPricingUsesAFixedNumberOfQueries() {
        List<Item> items = new ArrayList<>();
        for (int i = 0; i < 60; i++) {
            Product p = fx.product(1000L + i, "P" + i, "10.00");
            ProductPacking pcs = packing(p, "PCS", "1");
            barcode(p, pcs, "P" + i + "-PCS");
            items.add(item("k" + i, p, "P" + i + "-PCS"));
        }
        Request r = new Request();
        r.setSource("LEVEL:2");
        r.setItems(items);

        Response res = service.resolve(r);

        assertThat(res.items()).hasSize(60);
        verify(barcodeRepository, times(1)).findByProductIdIn(anyList());
        verify(fx.productRepository, atMost(2)).findAllById(any());
        verify(fx.pricingRepository, times(1)).findByProductIdIn(anyList());
        verify(fx.packingRepository, times(1)).findByProductIdIn(anyList());
        verify(fx.levelPriceRepository, times(1)).findByProductIdInAndPriceLevelId(anyCollection(), eq(2L));
        verify(fx.tierRepository, times(1)).findByProductIdInAndPriceLevelIdAndIsActiveTrue(anyCollection(), eq(2L));
    }

    @Test
    void moreThanTheLimitIsRefused() {
        List<Item> items = new ArrayList<>();
        for (int i = 0; i <= BarcodeLabelPriceService.MAX_ITEMS; i++) items.add(item("k" + i, a, "A-PCS"));
        Request r = new Request();
        r.setItems(items);
        assertThatThrownBy(() -> service.resolve(r)).isInstanceOf(ResponseStatusException.class);
    }

    // ------------------------------------------------------------------ helpers

    private BigDecimal tierPrice(String source, String quantity) {
        Request r = request(source, item("1", a, "A-PCS"));
        r.setPricingQuantity(quantity == null ? null : new BigDecimal(quantity));
        return price(service.resolve(r), "1");
    }

    private static BigDecimal price(Response r, String key) {
        Result res = r.items().stream().filter(i -> key.equals(i.key())).findFirst().orElseThrow();
        assertThat(res.available()).as("label %s available (%s)", key, res.message()).isTrue();
        return res.price();
    }

    private static Item item(String key, Product p, String barcode) {
        return new Item(key, p.getId(), p.getCode(), barcode, null);
    }

    private static Request request(String source, Item... items) {
        return request(source, null, items);
    }

    private static Request request(String source, Long branchId, Item... items) {
        Request r = new Request();
        r.setSource(source);
        r.setBranchId(branchId);
        r.setItems(List.of(items));
        return r;
    }

    private static Request customerRequest(Long customerId, Item... items) {
        Request r = request("CUSTOMER", items);
        r.setCustomerId(customerId);
        return r;
    }

    private ProductPricing pricing(Product p) {
        return fx.pricings.stream().filter(pr -> pr.getProduct() == p).findFirst().orElseThrow();
    }

    private ProductBranchPricing branchRow(Product p, long branchId) {
        ProductBranchPricing row = new ProductBranchPricing();
        row.setProduct(p);
        Branch br = new Branch();
        br.setId(branchId);
        row.setBranch(br);
        branchRows.add(row);
        return row;
    }

    private ProductPacking packing(Product p, String unit, String conversion) {
        ProductPacking pp = new ProductPacking();
        pp.setProduct(p);
        pp.setUnit(new Unit(unit, unit, null));
        pp.setConversion(new BigDecimal(conversion));
        pp.setSale(true);
        fx.packings.add(pp);
        return pp;
    }

    private void barcode(Product p, ProductPacking packing, String value) {
        ProductBarcode pb = new ProductBarcode();
        pb.setId((long) (barcodes.size() + 1));
        pb.setProduct(p);
        pb.setPacking(packing);
        pb.setBarcode(value);
        barcodes.add(pb);
    }
}
