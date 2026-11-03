package com.billbull.backend.sales.pricing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductBranchPricingRepository;
import com.billbull.backend.inventory.product.ProductPacking;
import com.billbull.backend.inventory.product.ProductPackingRepository;
import com.billbull.backend.inventory.product.ProductPricing;
import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.units.Unit;
import com.billbull.backend.pos.businessdate.BusinessDayClock;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.pricing.PricingModels.CarriedPrice;
import com.billbull.backend.sales.pricing.PricingModels.Context;
import com.billbull.backend.sales.pricing.PricingModels.Line;
import com.billbull.backend.sales.pricing.PricingModels.LinePrice;
import com.billbull.backend.sales.pricing.PricingModels.Resolution;
import com.billbull.backend.sales.pricing.PricingModels.SaleUnits;
import com.billbull.backend.sales.settings.SalesItemPricePolicy;

/**
 * Pricing Phase 3 — quantity tiers in the shared resolver.
 *
 * <p>Business example: product A retails at 30 (Retail = the default level) and wholesales at 27.
 * Retail tiers 20+ → 28, 100+ → 26, 120+ → 24; Wholesale tiers 20+ → 25, 100+ → 23, 120+ → 21.
 * Customer ABC has a negotiated 25 on A. A BOX of A is 12 PCS.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class QuantityTierPricingResolutionTest {

    static final long BRANCH_A = 1L;
    static final long BRANCH_B = 2L;
    static final LocalDate TODAY = LocalDate.of(2026, 11, 2);

    @Mock PriceLevelRepository levelRepository;
    @Mock ProductLevelPriceRepository levelPriceRepository;
    @Mock ProductRepository productRepository;
    @Mock ProductPricingRepository pricingRepository;
    @Mock ProductBranchPricingRepository branchPricingRepository;
    @Mock ProductPackingRepository packingRepository;
    @Mock CustomerRepository customerRepository;
    @Mock CustomerProductPriceRepository customerPriceRepository;
    @Mock ProductQuantityTierRepository tierRepository;
    @Mock BusinessDayClock clock;

    PricingResolutionService service;

    final Map<Long, PriceLevel> levels = new HashMap<>();
    final List<Product> products = new ArrayList<>();
    final List<ProductPricing> pricings = new ArrayList<>();
    final List<ProductPacking> packings = new ArrayList<>();
    final List<ProductLevelPrice> levelPrices = new ArrayList<>();
    final List<CustomerProductPrice> customerPrices = new ArrayList<>();
    final List<ProductQuantityTier> tiers = new ArrayList<>();
    long nextId = 1000;

    PriceLevel retail;
    PriceLevel wholesale;
    Product a;
    Customer abc;
    Customer trader;

    @BeforeEach
    void setUp() {
        service = new PricingResolutionService(levelRepository, levelPriceRepository, productRepository,
                pricingRepository, branchPricingRepository, packingRepository, customerRepository,
                customerPriceRepository, clock, tierRepository);
        when(clock.now()).thenReturn(TODAY.atTime(10, 0));

        when(levelRepository.findById(anyLong())).thenAnswer(inv -> Optional.ofNullable(levels.get(inv.getArgument(0, Long.class))));
        when(levelRepository.findFirstBySystemDefaultTrue()).thenAnswer(inv ->
                levels.values().stream().filter(PriceLevel::isSystemDefault).findFirst());
        when(levelRepository.findFirstByNameIgnoreCase(anyString())).thenReturn(Optional.empty());
        when(productRepository.findAllById(any())).thenAnswer(inv -> {
            Iterable<Long> ids = inv.getArgument(0);
            List<Product> out = new ArrayList<>();
            ids.forEach(id -> products.stream().filter(p -> p.getId().equals(id)).forEach(out::add));
            return out;
        });
        when(productRepository.findByCodeIn(anyList())).thenAnswer(inv -> {
            List<String> codes = inv.getArgument(0);
            return products.stream().filter(p -> codes.contains(p.getCode())).toList();
        });
        when(pricingRepository.findByProductIdIn(anyList())).thenAnswer(inv -> pricings);
        when(branchPricingRepository.findByProductIdIn(anyList())).thenAnswer(inv -> List.of());
        when(packingRepository.findByProductIdIn(anyList())).thenAnswer(inv -> packings);
        when(packingRepository.findByProductId(anyLong())).thenAnswer(inv -> {
            Long id = inv.getArgument(0);
            return packings.stream().filter(pp -> pp.getProduct().getId().equals(id)).toList();
        });
        when(levelPriceRepository.findByProductIdInAndPriceLevelId(anyCollection(), anyLong())).thenAnswer(inv -> {
            Long levelId = inv.getArgument(1);
            return levelPrices.stream().filter(r -> r.getPriceLevelId().equals(levelId)).toList();
        });
        when(customerPriceRepository.findByCustomerIdAndProductIdInAndIsActiveTrue(anyLong(), anyCollection())).thenAnswer(inv -> {
            Long customerId = inv.getArgument(0);
            Collection<Long> ids = inv.getArgument(1);
            return customerPrices.stream()
                    .filter(r -> r.isActive() && r.getCustomerId().equals(customerId) && ids.contains(r.getProductId()))
                    .toList();
        });
        when(tierRepository.findByProductIdInAndPriceLevelIdAndIsActiveTrue(anyCollection(), anyLong())).thenAnswer(inv -> {
            Collection<Long> ids = inv.getArgument(0);
            Long levelId = inv.getArgument(1);
            return tiers.stream()
                    .filter(t -> t.isActive() && t.getPriceLevelId().equals(levelId) && ids.contains(t.getProductId()))
                    .toList();
        });

        retail = level(1L, "Retail", true);
        wholesale = level(2L, "Wholesale", false);
        a = product(10L, "A", "30.00");
        product(11L, "B", "50.00");
        levelPrice(10L, wholesale, "27.00");
        levelPrice(11L, wholesale, "45.00");
        packing(a, "PCS", "1", null);
        packing(a, "BOX", "12", null);

        tier(10L, retail, null, "20", "28.00");
        tier(10L, retail, null, "100", "26.00");
        tier(10L, retail, null, "120", "24.00");
        tier(10L, wholesale, null, "20", "25.00");
        tier(10L, wholesale, null, "100", "23.00");
        tier(10L, wholesale, null, "120", "21.00");

        abc = customer(501L, "ABC", wholesale.getId());
        trader = customer(502L, "TRADER", wholesale.getId());
        mapping(abc, 10L, null, "25.00");
    }

    // ------------------------------------------------------------------ tier selection

    @Test
    void belowTheFirstTierTheLevelsOwnPriceApplies() {
        LinePrice p = price(null, null, line(10L, null, "19"));
        assertThat(p.price()).isEqualByComparingTo("30.00");
        assertThat(p.source()).isEqualTo(PriceSource.BASE_PRICE);
        assertThat(p.quantityTierId()).isNull();
        assertThat(p.eligibleQuantity()).isEqualByComparingTo("19");
    }

    @Test
    void exactlyAtAThresholdTheTierApplies() {
        LinePrice p = price(null, null, line(10L, null, "20"));
        assertThat(p.price()).isEqualByComparingTo("28.00");
        assertThat(p.source()).isEqualTo(PriceSource.QUANTITY_TIER);
        assertThat(p.tierMinQuantity()).isEqualByComparingTo("20");
        assertThat(p.untieredPrice()).isEqualByComparingTo("30.00");
        assertThat(p.untieredSource()).isEqualTo(PriceSource.BASE_PRICE);
        assertThat(p.quantityTierId()).isNotNull();
    }

    @Test
    void justAboveAThresholdTheSameTierApplies() {
        assertThat(price(null, null, line(10L, null, "21")).price()).isEqualByComparingTo("28.00");
        assertThat(price(null, null, line(10L, null, "99")).price()).isEqualByComparingTo("28.00");
    }

    @Test
    void theHighestEligibleThresholdWins() {
        assertThat(price(null, null, line(10L, null, "100")).price()).isEqualByComparingTo("26.00");
        assertThat(price(null, null, line(10L, null, "119")).price()).isEqualByComparingTo("26.00");
        assertThat(price(null, null, line(10L, null, "120")).price()).isEqualByComparingTo("24.00");
        assertThat(price(null, null, line(10L, null, "5000")).price()).isEqualByComparingTo("24.00");
    }

    @Test
    void fractionalQuantityJustBelowAThresholdDoesNotQualify() {
        assertThat(price(null, null, line(10L, null, "19.999")).price()).isEqualByComparingTo("30.00");
    }

    @Test
    void aProductWithoutTiersIsUnaffected() {
        LinePrice b = price(null, null, line(11L, null, "500"));
        assertThat(b.price()).isEqualByComparingTo("50.00");
        assertThat(b.quantityTierId()).isNull();
    }

    @Test
    void aLineWithoutQuantityGetsNoTier() {
        LinePrice p = price(null, null, line(10L, null, null));
        assertThat(p.price()).isEqualByComparingTo("30.00");
        assertThat(p.quantityTierId()).isNull();
    }

    // ------------------------------------------------------------------ levels

    @Test
    void retailAndWholesaleHaveTheirOwnTiers() {
        assertThat(price(null, null, line(10L, null, "100")).price()).isEqualByComparingTo("26.00");
        LinePrice w = price(wholesale.getId(), null, line(10L, null, "100"));
        assertThat(w.price()).isEqualByComparingTo("23.00");
        assertThat(w.untieredPrice()).isEqualByComparingTo("27.00");
        assertThat(w.untieredSource()).isEqualTo(PriceSource.PRICE_LEVEL);
        assertThat(w.priceLevelName()).isEqualTo("Wholesale");
    }

    @Test
    void explicitTransactionLevelSelectsThatLevelsTiers() {
        Resolution r = service.resolve(ctx(BRANCH_A, wholesale.getId(), null), List.of(line(10L, null, "19")));
        assertThat(r.lines().get(0).price()).isEqualByComparingTo("27.00");
        r = service.resolve(ctx(BRANCH_A, wholesale.getId(), null), List.of(line(10L, null, "20")));
        assertThat(r.lines().get(0).price()).isEqualByComparingTo("25.00");
        assertThat(r.level().source()).isEqualTo(PriceLevelSource.TRANSACTION);
    }

    @Test
    void customersDefaultLevelTiersApplyAutomatically() {
        Resolution r = service.resolve(ctx(BRANCH_A, null, "TRADER"), List.of(line(10L, null, "120")));
        assertThat(r.level().id()).isEqualTo(wholesale.getId());
        assertThat(r.level().source()).isEqualTo(PriceLevelSource.CUSTOMER);
        assertThat(r.lines().get(0).price()).isEqualByComparingTo("21.00");
        assertThat(r.lines().get(0).source()).isEqualTo(PriceSource.QUANTITY_TIER);
    }

    @Test
    void switchingThePriceLevelRePricesTheTier() {
        Line l = line(10L, null, "100");
        assertThat(service.resolve(ctx(BRANCH_A, null, null), List.of(l)).lines().get(0).price()).isEqualByComparingTo("26.00");
        assertThat(service.resolve(ctx(BRANCH_A, wholesale.getId(), null), List.of(l)).lines().get(0).price()).isEqualByComparingTo("23.00");
        assertThat(service.resolve(ctx(BRANCH_A, retail.getId(), null), List.of(l)).lines().get(0).price()).isEqualByComparingTo("26.00");
    }

    // ------------------------------------------------------------------ customer-specific precedence

    @Test
    void negotiatedPriceOverridesTheTierAndCarriesNoTierMarker() {
        // Wholesale 120+ would be 21, but ABC's agreed price is 25.
        Resolution r = service.resolve(ctx(BRANCH_A, null, "ABC"), List.of(line(10L, null, "120")));
        LinePrice p = r.lines().get(0);
        assertThat(p.price()).isEqualByComparingTo("25.00");
        assertThat(p.source()).isEqualTo(PriceSource.CUSTOMER_SPECIFIC);
        assertThat(p.quantityTierId()).isNull();
        assertThat(p.tierMinQuantity()).isNull();
        assertThat(p.fallbackPrice()).isEqualByComparingTo("21.00");
        assertThat(p.fallbackSource()).isEqualTo(PriceSource.QUANTITY_TIER);
        assertThat(p.untieredPrice()).isEqualByComparingTo("27.00");
    }

    @Test
    void switchingCustomerRemovesTheOtherCustomersResult() {
        Line l = line(10L, null, "100");
        assertThat(service.resolve(ctx(BRANCH_A, null, "ABC"), List.of(l)).lines().get(0).price()).isEqualByComparingTo("25.00");
        LinePrice traderLine = service.resolve(ctx(BRANCH_A, null, "TRADER"), List.of(l)).lines().get(0);
        assertThat(traderLine.price()).isEqualByComparingTo("23.00");
        assertThat(traderLine.customerPriceId()).isNull();
        LinePrice walkIn = service.resolve(ctx(BRANCH_A, null, null), List.of(l)).lines().get(0);
        assertThat(walkIn.price()).isEqualByComparingTo("26.00");
        assertThat(walkIn.priceLevelName()).isEqualTo("Retail");
    }

    @Test
    void expiredNegotiatedPriceFallsBackToTheTier() {
        CustomerProductPrice m = customerPrices.get(0);
        m.setEffectiveFrom(TODAY.minusDays(60));
        m.setEffectiveTo(TODAY.minusDays(1));
        LinePrice p = service.resolve(ctx(BRANCH_A, null, "ABC"), List.of(line(10L, null, "120"))).lines().get(0);
        assertThat(p.price()).isEqualByComparingTo("21.00");
        assertThat(p.source()).isEqualTo(PriceSource.QUANTITY_TIER);
    }

    // ------------------------------------------------------------------ branches

    @Test
    void branchTierWinsAtItsThresholdAndGlobalTiersStillApplyAroundIt() {
        tier(10L, retail, BRANCH_B, "20", "27.50");
        tier(10L, retail, BRANCH_B, "50", "27.00");

        LinePrice atB20 = service.resolve(ctx(BRANCH_B, null, null), List.of(line(10L, null, "20"))).lines().get(0);
        assertThat(atB20.price()).isEqualByComparingTo("27.50");
        assertThat(atB20.source()).isEqualTo(PriceSource.QUANTITY_TIER_BRANCH);
        assertThat(atB20.tierBranchId()).isEqualTo(BRANCH_B);
        assertThat(service.resolve(ctx(BRANCH_B, null, null), List.of(line(10L, null, "60"))).lines().get(0).price())
                .isEqualByComparingTo("27.00");
        // The global 100+ tier still applies at branch B.
        assertThat(service.resolve(ctx(BRANCH_B, null, null), List.of(line(10L, null, "100"))).lines().get(0).price())
                .isEqualByComparingTo("26.00");
        // Branch A never sees branch B's tiers.
        LinePrice atA = service.resolve(ctx(BRANCH_A, null, null), List.of(line(10L, null, "20"))).lines().get(0);
        assertThat(atA.price()).isEqualByComparingTo("28.00");
        assertThat(atA.source()).isEqualTo(PriceSource.QUANTITY_TIER);
    }

    // ------------------------------------------------------------------ units, aggregation, FOC

    @Test
    void boxLinesCountInBaseUnitsAndAreChargedTheTierTimesTheConversion() {
        // 2 BOX = 24 PCS → the 20+ tier: 28 per PCS = 336 per BOX.
        LinePrice p = price(null, null, line(10L, "BOX", "2"));
        assertThat(p.eligibleQuantity()).isEqualByComparingTo("24");
        assertThat(p.price()).isEqualByComparingTo("336.00");
        assertThat(p.untieredPrice()).isEqualByComparingTo("360.00");
        assertThat(p.conversion()).isEqualByComparingTo("12");
        // 1 BOX = 12 PCS → below 20.
        assertThat(price(null, null, line(10L, "BOX", "1")).price()).isEqualByComparingTo("360.00");
    }

    @Test
    void aPackingWithItsOwnFixedPriceIsNotTiered() {
        Product c = product(12L, "C", "10.00");
        packing(c, "CASE", "24", "200.00");
        tier(12L, retail, null, "10", "8.00");
        LinePrice caseLine = price(null, null, line(12L, "CASE", "5"));
        assertThat(caseLine.price()).isEqualByComparingTo("200.00");
        assertThat(caseLine.source()).isEqualTo(PriceSource.PACKING_PRICE);
        // ...but the pieces in the same cart are tiered on the combined quantity (5 × 24 + 1).
        Resolution r = service.resolve(ctx(BRANCH_A, null, null), List.of(line(12L, "CASE", "5"), line(12L, null, "1")));
        assertThat(r.lines().get(1).price()).isEqualByComparingTo("8.00");
        assertThat(r.lines().get(1).eligibleQuantity()).isEqualByComparingTo("121");
    }

    @Test
    void duplicateLinesOfAProductAreAddedUpForTheTier() {
        Resolution r = service.resolve(ctx(BRANCH_A, null, null),
                List.of(line(10L, null, "10"), line(11L, null, "1"), line(10L, null, "10")));
        assertThat(r.lines().get(0).price()).isEqualByComparingTo("28.00");
        assertThat(r.lines().get(2).price()).isEqualByComparingTo("28.00");
        assertThat(r.lines().get(0).eligibleQuantity()).isEqualByComparingTo("20");
        assertThat(r.lines().get(1).price()).isEqualByComparingTo("50.00");
    }

    @Test
    void mixedUnitsAreAddedUpInBaseUnits() {
        // 1 BOX (12) + 8 PCS = 20 PCS.
        Resolution r = service.resolve(ctx(BRANCH_A, null, null), List.of(line(10L, "BOX", "1"), line(10L, "PCS", "8")));
        assertThat(r.lines().get(0).price()).isEqualByComparingTo("336.00");
        assertThat(r.lines().get(1).price()).isEqualByComparingTo("28.00");
    }

    @Test
    void focQuantityNeverUnlocksATier() {
        SalesInvoiceItem paid = invoiceItem("A", 19, null);
        paid.setFoc(5);
        SalesInvoice inv = invoice(null, paid);

        service.applyToInvoice(inv, BRANCH_A, SalesItemPricePolicy.RETAIL);

        assertThat(paid.getPrice()).isEqualByComparingTo("30.00");
        assertThat(paid.getQuantityTierId()).isNull();
    }

    @Test
    void crossingABoundaryAndBackRestoresThePreviousPrice() {
        assertThat(price(null, null, line(10L, null, "19")).price()).isEqualByComparingTo("30.00");
        assertThat(price(null, null, line(10L, null, "20")).price()).isEqualByComparingTo("28.00");
        assertThat(price(null, null, line(10L, null, "19")).price()).isEqualByComparingTo("30.00");
    }

    @Test
    void unitPickerPricesEachUnitOnItsOwn() {
        SaleUnits units = service.saleUnits(ctx(BRANCH_A, null, null), 10L, null);
        assertThat(units.units()).extracting(u -> u.unit()).containsExactly("PCS", "BOX");
        // One PCS is 30; one BOX (12 PCS) is below 20 and not added to the PCS line → 360.
        assertThat(units.units().get(0).price()).isEqualByComparingTo("30.00");
        assertThat(units.units().get(1).price()).isEqualByComparingTo("360.00");
    }

    // ------------------------------------------------------------------ inactive tiers, bulk lookup

    @Test
    void deactivatedTierNoLongerApplies() {
        tiers.stream().filter(t -> t.getPriceLevelId().equals(retail.getId())
                && t.getMinQuantity().compareTo(new BigDecimal("20")) == 0).forEach(t -> t.setActive(false));
        assertThat(price(null, null, line(10L, null, "50")).price()).isEqualByComparingTo("30.00");
        assertThat(price(null, null, line(10L, null, "100")).price()).isEqualByComparingTo("26.00");
    }

    @Test
    void aWholeCartIsResolvedWithOneTierQuery() {
        List<Line> cart = new ArrayList<>();
        for (int i = 0; i < 40; i++) cart.add(line(i % 2 == 0 ? 10L : 11L, null, "3"));
        service.resolve(ctx(BRANCH_A, null, null), cart);
        verify(tierRepository, times(1)).findByProductIdInAndPriceLevelIdAndIsActiveTrue(anyCollection(), eq(retail.getId()));
        verify(levelPriceRepository, times(0)).findByProductIdInAndPriceLevelId(anyCollection(), anyLong());
    }

    // ------------------------------------------------------------------ invoices: stamping, overrides, history

    @Test
    void invoiceLinesAreStampedWithTheTier() {
        SalesInvoiceItem one = invoiceItem("A", 10, "28.00");
        SalesInvoiceItem two = invoiceItem("A", 10, "28.00");
        SalesInvoice inv = invoice(null, one, two);

        service.applyToInvoice(inv, BRANCH_A, SalesItemPricePolicy.RETAIL);

        for (SalesInvoiceItem it : List.of(one, two)) {
            assertThat(it.getPriceSource()).isEqualTo("QUANTITY_TIER");
            assertThat(it.getResolvedUnitPrice()).isEqualByComparingTo("28.00");
            assertThat(it.getPriceOverridden()).isFalse();
            assertThat(it.getTierMinQuantity()).isEqualByComparingTo("20");
            assertThat(it.getTierEligibleQuantity()).isEqualByComparingTo("20");
            assertThat(it.getQuantityTierId()).isNotNull();
        }
    }

    @Test
    void manipulatedClientPriceIsNotAcceptedAsTheTierPrice() {
        // 19 units can't have the 20+ price; the line is kept but flagged as a manual price.
        SalesInvoiceItem it = invoiceItem("A", 19, "28.00");
        it.setPriceSource("QUANTITY_TIER");
        it.setQuantityTierId(999L);
        SalesInvoice inv = invoice(null, it);

        service.applyToInvoice(inv, BRANCH_A, SalesItemPricePolicy.RETAIL);

        assertThat(it.getPriceOverridden()).isTrue();
        assertThat(it.getResolvedUnitPrice()).isEqualByComparingTo("30.00");
        assertThat(it.getPriceSource()).isEqualTo("BASE_PRICE");
        assertThat(it.getQuantityTierId()).isNull();
    }

    @Test
    void manualOverrideOnATieredLineIsKept() {
        SalesInvoiceItem it = invoiceItem("A", 50, "29.00");
        SalesInvoice inv = invoice(null, it);
        service.applyToInvoice(inv, BRANCH_A, SalesItemPricePolicy.RETAIL);
        assertThat(it.getPrice()).isEqualByComparingTo("29.00");
        assertThat(it.getPriceOverridden()).isTrue();
        assertThat(it.getResolvedUnitPrice()).isEqualByComparingTo("28.00");
    }

    @Test
    void lineWithoutAPriceIsGivenTheTierPrice() {
        SalesInvoiceItem it = invoiceItem("A", 120, null);
        SalesInvoice inv = invoice("TRADER", it);
        service.applyToInvoice(inv, BRANCH_A, SalesItemPricePolicy.RETAIL);
        assertThat(it.getPrice()).isEqualByComparingTo("21.00");
        assertThat(it.getPriceOverridden()).isFalse();
    }

    @Test
    void editingATierAfterSavingNeverChangesTheSavedLine() {
        SalesInvoiceItem it = invoiceItem("A", 20, "28.00");
        SalesInvoice inv = invoice(null, it);
        service.applyToInvoice(inv, BRANCH_A, SalesItemPricePolicy.RETAIL);
        List<CarriedPrice> saved = CarriedPrice.of(inv.getItems());

        // The tier is repriced and then deactivated; the invoice is re-saved unchanged.
        tiers.forEach(t -> { if (t.getMinQuantity().compareTo(new BigDecimal("20")) == 0) t.setPrice(new BigDecimal("27.00")); });
        tiers.forEach(t -> t.setActive(false));
        SalesInvoiceItem again = invoiceItem("A", 20, "28.00");
        SalesInvoice edit = invoice(null, again);
        service.applyToInvoice(edit, BRANCH_A, SalesItemPricePolicy.RETAIL, null, saved, List.of());

        assertThat(again.getPrice()).isEqualByComparingTo("28.00");
        assertThat(again.getPriceSource()).isEqualTo("QUANTITY_TIER");
        assertThat(again.getPriceOverridden()).isFalse();
        assertThat(again.getTierMinQuantity()).isEqualByComparingTo("20");
    }

    @Test
    void changedQuantityOnAnEditedLineIsResolvedAgain() {
        SalesInvoiceItem it = invoiceItem("A", 20, "28.00");
        SalesInvoice inv = invoice(null, it);
        service.applyToInvoice(inv, BRANCH_A, SalesItemPricePolicy.RETAIL);
        List<CarriedPrice> saved = CarriedPrice.of(inv.getItems());

        SalesInvoiceItem edited = invoiceItem("A", 19, "28.00");
        service.applyToInvoice(invoice(null, edited), BRANCH_A, SalesItemPricePolicy.RETAIL, null, saved, List.of());

        assertThat(edited.getPriceOverridden()).isTrue();
        assertThat(edited.getResolvedUnitPrice()).isEqualByComparingTo("30.00");
    }

    // ------------------------------------------------------------------ fixtures

    private LinePrice price(Long levelId, String customer, Line line) {
        return service.resolve(ctx(BRANCH_A, levelId, customer), List.of(line)).lines().get(0);
    }

    private PriceLevel level(long id, String name, boolean systemDefault) {
        PriceLevel l = new PriceLevel();
        l.setId(id);
        l.setName(name);
        l.setCode(name.toUpperCase());
        l.setSystemDefault(systemDefault);
        l.setActive(true);
        levels.put(id, l);
        return l;
    }

    private Product product(long id, String code, String retailPrice) {
        Product p = new Product();
        p.setId(id);
        p.setCode(code);
        p.setActive(true);
        products.add(p);
        ProductPricing pr = new ProductPricing();
        pr.setProduct(p);
        pr.setRetailPrice(new BigDecimal(retailPrice));
        pricings.add(pr);
        return p;
    }

    private void packing(Product p, String unitName, String conversion, String price) {
        ProductPacking pp = new ProductPacking();
        pp.setProduct(p);
        pp.setUnit(new Unit(unitName, unitName, null));
        pp.setConversion(new BigDecimal(conversion));
        pp.setPrice(price != null ? new BigDecimal(price) : null);
        pp.setSale(true);
        packings.add(pp);
    }

    private void levelPrice(long productId, PriceLevel level, String price) {
        ProductLevelPrice r = new ProductLevelPrice();
        r.setProductId(productId);
        r.setPriceLevelId(level.getId());
        r.setPrice(new BigDecimal(price));
        levelPrices.add(r);
    }

    private ProductQuantityTier tier(long productId, PriceLevel level, Long branchId, String minQty, String price) {
        ProductQuantityTier t = new ProductQuantityTier();
        t.setId(nextId++);
        t.setProductId(productId);
        t.setPriceLevelId(level.getId());
        t.setBranchId(branchId);
        t.setMinQuantity(new BigDecimal(minQty));
        t.setPrice(new BigDecimal(price));
        t.setActive(true);
        tiers.add(t);
        return t;
    }

    private Customer customer(long id, String code, Long levelId) {
        Customer c = new Customer();
        c.setId(id);
        c.setCode(code);
        c.setName("Customer " + code);
        c.setPriceLevelId(levelId);
        when(customerRepository.findByCode(eq(code))).thenReturn(Optional.of(c));
        when(customerRepository.findById(eq(id))).thenReturn(Optional.of(c));
        return c;
    }

    private void mapping(Customer customer, long productId, Long branchId, String price) {
        CustomerProductPrice r = new CustomerProductPrice();
        r.setId(nextId++);
        r.setCustomerId(customer.getId());
        r.setProductId(productId);
        r.setBranchId(branchId);
        r.setPrice(new BigDecimal(price));
        r.setEffectiveFrom(TODAY.minusDays(30));
        customerPrices.add(r);
    }

    private static Context ctx(long branchId, Long levelId, String customerCode) {
        return new Context(branchId, levelId, null, customerCode, SalesItemPricePolicy.RETAIL);
    }

    private static Line line(long productId, String unit, String qty) {
        return new Line(productId, null, unit, qty != null ? new BigDecimal(qty) : null);
    }

    private static SalesInvoiceItem invoiceItem(String code, int qty, String price) {
        SalesInvoiceItem it = new SalesInvoiceItem();
        it.setItemCode(code);
        it.setQuantity(qty);
        it.setPrice(price != null ? new BigDecimal(price) : null);
        return it;
    }

    private static SalesInvoice invoice(String customerCode, SalesInvoiceItem... items) {
        SalesInvoice inv = new SalesInvoice();
        inv.setCustomerCode(customerCode);
        inv.setItems(new ArrayList<>(List.of(items)));
        return inv;
    }
}
