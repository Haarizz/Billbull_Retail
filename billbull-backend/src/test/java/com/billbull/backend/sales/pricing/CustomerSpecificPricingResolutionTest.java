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
import org.mockito.ArgumentCaptor;
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
import com.billbull.backend.sales.pricing.PricingModels.Context;
import com.billbull.backend.sales.pricing.PricingModels.Line;
import com.billbull.backend.sales.pricing.PricingModels.LinePrice;
import com.billbull.backend.sales.pricing.PricingModels.Resolution;
import com.billbull.backend.sales.settings.SalesItemPricePolicy;

/**
 * Pricing Phase 2 — customer-specific prices in the shared resolver: precedence over the
 * customer's level and an explicit transaction level, branch row over all-branches row, validity
 * (inactive / disabled / expired / future fall back), one query per cart, customer changes, and
 * invoice stamping that keeps saved and manually overridden prices.
 *
 * <p>The scenario mirrors the business example: Retail 30 / Wholesale 27 / ABC 25 / XYZ 26.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CustomerSpecificPricingResolutionTest {

    static final long BRANCH_A = 1L;
    static final long BRANCH_B = 2L;
    static final LocalDate TODAY = LocalDate.of(2026, 11, 1);

    @Mock PriceLevelRepository levelRepository;
    @Mock ProductLevelPriceRepository levelPriceRepository;
    @Mock ProductRepository productRepository;
    @Mock ProductPricingRepository pricingRepository;
    @Mock ProductBranchPricingRepository branchPricingRepository;
    @Mock ProductPackingRepository packingRepository;
    @Mock CustomerRepository customerRepository;
    @Mock CustomerProductPriceRepository customerPriceRepository;
    @Mock BusinessDayClock clock;

    PricingResolutionService service;

    final Map<Long, PriceLevel> levels = new HashMap<>();
    final List<Product> products = new ArrayList<>();
    final List<ProductPricing> pricings = new ArrayList<>();
    final List<ProductPacking> packings = new ArrayList<>();
    final List<ProductLevelPrice> levelPrices = new ArrayList<>();
    final List<CustomerProductPrice> customerPrices = new ArrayList<>();
    long nextMappingId = 100;

    PriceLevel retail;
    PriceLevel wholesale;
    Customer abc;
    Customer xyz;

    @BeforeEach
    void setUp() {
        service = new PricingResolutionService(levelRepository, levelPriceRepository, productRepository,
                pricingRepository, branchPricingRepository, packingRepository, customerRepository,
                customerPriceRepository, clock);
        when(clock.now()).thenReturn(TODAY.atTime(12, 0));

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
        when(customerPriceRepository.countByCustomerIdAndIsActiveTrueAndEnabledTrue(anyLong())).thenAnswer(inv -> {
            Long customerId = inv.getArgument(0);
            return customerPrices.stream().filter(r -> r.isActive() && r.isEnabled() && r.getCustomerId().equals(customerId)).count();
        });

        retail = level(1L, "Retail", true);
        wholesale = level(2L, "Wholesale", false);

        product(10L, "A", "30.00");
        product(11L, "B", "50.00");
        product(12L, "C", "100.00");
        levelPrice(10L, wholesale, "27.00");
        levelPrice(11L, wholesale, "45.00");
        levelPrice(12L, wholesale, "90.00");

        abc = customer(501L, "ABC", wholesale.getId());
        xyz = customer(502L, "XYZ", wholesale.getId());
        mapping(abc, 10L, null, "25.00");
        mapping(abc, 12L, null, "85.00");
        mapping(xyz, 10L, null, "26.00");
        mapping(xyz, 11L, null, "44.00");
        mapping(xyz, 12L, null, "88.00");
    }

    // ------------------------------------------------------------------ precedence

    @Test
    void scenarioA_customerSpecificPriceOverridesTheCustomersDefaultLevel() {
        Resolution r = service.resolve(ctx(BRANCH_A, null, "ABC"), List.of(line(10L)));

        LinePrice a = r.lines().get(0);
        assertThat(a.price()).isEqualByComparingTo("25.00");
        assertThat(a.source()).isEqualTo(PriceSource.CUSTOMER_SPECIFIC);
        assertThat(a.fallbackPrice()).isEqualByComparingTo("27.00");
        assertThat(a.fallbackSource()).isEqualTo(PriceSource.PRICE_LEVEL);
        assertThat(a.customerPriceId()).isNotNull();
        assertThat(a.customerPriceFrom()).isEqualTo(TODAY.minusDays(30));
        assertThat(r.customer().customerId()).isEqualTo(501L);
        assertThat(r.customer().appliedLines()).isEqualTo(1);
        assertThat(r.customer().liveMappings()).isEqualTo(2);
        assertThat(r.level().id()).isEqualTo(wholesale.getId());
    }

    @Test
    void scenarioB_noCustomerPriceFallsBackToTheCustomersLevel() {
        Resolution r = service.resolve(ctx(BRANCH_A, null, "ABC"), List.of(line(11L)));

        LinePrice b = r.lines().get(0);
        assertThat(b.price()).isEqualByComparingTo("45.00");
        assertThat(b.source()).isEqualTo(PriceSource.PRICE_LEVEL);
        assertThat(b.customerPriceId()).isNull();
        assertThat(r.customer().appliedLines()).isZero();
    }

    @Test
    void customerSpecificPriceWinsOverAnExplicitTransactionLevel() {
        PriceLevel vip = level(3L, "VIP", false);
        levelPrice(10L, vip, "20.00");

        Resolution r = service.resolve(ctx(BRANCH_A, vip.getId(), "ABC"), List.of(line(10L), line(11L)));

        assertThat(r.level().source()).isEqualTo(PriceLevelSource.TRANSACTION);
        assertThat(r.lines().get(0).price()).isEqualByComparingTo("25.00");
        assertThat(r.lines().get(0).source()).isEqualTo(PriceSource.CUSTOMER_SPECIFIC);
        assertThat(r.lines().get(0).fallbackPrice()).isEqualByComparingTo("20.00");
        // No VIP price and no ABC price for B: the default price.
        assertThat(r.lines().get(1).price()).isEqualByComparingTo("50.00");
    }

    @Test
    void walkInSaleNeverUsesCustomerPrices() {
        Resolution r = service.resolve(ctx(BRANCH_A, null, null), List.of(line(10L)));

        assertThat(r.lines().get(0).price()).isEqualByComparingTo("30.00");
        assertThat(r.customer()).isNull();
    }

    // ------------------------------------------------------------------ branches

    @Test
    void scenarioC_branchPriceWinsAtItsBranchAndGlobalPriceAppliesElsewhere() {
        CustomerProductPrice branchRow = mapping(abc, 10L, BRANCH_A, "23.00");

        LinePrice atA = service.resolve(ctx(BRANCH_A, null, "ABC"), List.of(line(10L))).lines().get(0);
        LinePrice atB = service.resolve(ctx(BRANCH_B, null, "ABC"), List.of(line(10L))).lines().get(0);

        assertThat(atA.price()).isEqualByComparingTo("23.00");
        assertThat(atA.source()).isEqualTo(PriceSource.CUSTOMER_SPECIFIC_BRANCH);
        assertThat(atA.customerPriceId()).isEqualTo(branchRow.getId());
        assertThat(atA.customerPriceBranchId()).isEqualTo(BRANCH_A);
        assertThat(atB.price()).isEqualByComparingTo("25.00");
        assertThat(atB.source()).isEqualTo(PriceSource.CUSTOMER_SPECIFIC);
    }

    @Test
    void branchOnlyMappingDoesNotApplyInAnotherBranch() {
        Customer onlyBranch = customer(503L, "ONLY-A", null);
        mapping(onlyBranch, 11L, BRANCH_A, "40.00");

        assertThat(service.resolve(ctx(BRANCH_B, null, "ONLY-A"), List.of(line(11L))).lines().get(0).price())
                .isEqualByComparingTo("50.00");
        assertThat(service.resolve(ctx(BRANCH_A, null, "ONLY-A"), List.of(line(11L))).lines().get(0).price())
                .isEqualByComparingTo("40.00");
    }

    // ------------------------------------------------------------------ validity (scenario E)

    @Test
    void disabledMappingFallsBackToTheLevel() {
        customerPrices.stream().filter(r -> r.getCustomerId().equals(501L) && r.getProductId() == 10L)
                .forEach(r -> r.setEnabled(false));

        LinePrice a = service.resolve(ctx(BRANCH_A, null, "ABC"), List.of(line(10L))).lines().get(0);
        assertThat(a.price()).isEqualByComparingTo("27.00");
        assertThat(a.source()).isEqualTo(PriceSource.PRICE_LEVEL);
    }

    @Test
    void removedMappingFallsBackToTheLevel() {
        customerPrices.stream().filter(r -> r.getCustomerId().equals(501L) && r.getProductId() == 10L)
                .forEach(r -> r.setActive(false));

        assertThat(service.resolve(ctx(BRANCH_A, null, "ABC"), List.of(line(10L))).lines().get(0).price())
                .isEqualByComparingTo("27.00");
    }

    @Test
    void expiredMappingFallsBack() {
        CustomerProductPrice row = only(abc, 10L);
        row.setEffectiveTo(TODAY.minusDays(1));

        assertThat(service.resolve(ctx(BRANCH_A, null, "ABC"), List.of(line(10L))).lines().get(0).price())
                .isEqualByComparingTo("27.00");
    }

    @Test
    void mappingEndingTodayStillApplies() {
        only(abc, 10L).setEffectiveTo(TODAY);

        assertThat(service.resolve(ctx(BRANCH_A, null, "ABC"), List.of(line(10L))).lines().get(0).price())
                .isEqualByComparingTo("25.00");
    }

    @Test
    void futureMappingFallsBackUntilItStarts() {
        only(abc, 10L).setEffectiveFrom(TODAY.plusDays(1));

        assertThat(service.resolve(ctx(BRANCH_A, null, "ABC"), List.of(line(10L))).lines().get(0).price())
                .isEqualByComparingTo("27.00");
        Context tomorrow = new Context(BRANCH_A, null, null, "ABC", SalesItemPricePolicy.RETAIL, TODAY.plusDays(1));
        assertThat(service.resolve(tomorrow, List.of(line(10L))).lines().get(0).price())
                .isEqualByComparingTo("25.00");
    }

    // ------------------------------------------------------------------ cart behaviour

    @Test
    void wholeCartIsPricedWithOneCustomerPriceQuery() {
        service.resolve(ctx(BRANCH_A, null, "ABC"), List.of(line(10L), line(11L), line(12L)));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Collection<Long>> ids = ArgumentCaptor.forClass(Collection.class);
        verify(customerPriceRepository, times(1)).findByCustomerIdAndProductIdInAndIsActiveTrue(eq(501L), ids.capture());
        assertThat(ids.getValue()).containsExactlyInAnyOrder(10L, 11L, 12L);
    }

    @Test
    void scenarioD_changingTheCustomerReResolvesEveryLine() {
        List<Line> cart = List.of(line(10L), line(11L), line(12L));

        Resolution forAbc = service.resolve(ctx(BRANCH_A, null, "ABC"), cart);
        Resolution forXyz = service.resolve(ctx(BRANCH_A, null, "XYZ"), cart);

        assertThat(forAbc.lines()).extracting(LinePrice::price)
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactly(new BigDecimal("25"), new BigDecimal("45"), new BigDecimal("85"));
        assertThat(forXyz.lines()).extracting(LinePrice::price)
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactly(new BigDecimal("26"), new BigDecimal("44"), new BigDecimal("88"));
        assertThat(forXyz.lines()).allMatch(l -> l.source().isCustomerPrice());
    }

    @Test
    void negotiatedPriceIsPerBaseUnitAndScalesWithThePacking() {
        Product a = products.get(0);
        packing(a, "Box", "12", "330.00");

        LinePrice box = service.resolve(ctx(BRANCH_A, null, "ABC"),
                List.of(new Line(10L, null, "Box", BigDecimal.ONE))).lines().get(0);

        assertThat(box.price()).isEqualByComparingTo("300.00");
        assertThat(box.source()).isEqualTo(PriceSource.CUSTOMER_SPECIFIC);
    }

    // ------------------------------------------------------------------ invoices

    @Test
    void invoiceLineIsFilledWithTheNegotiatedPriceAndStamped() {
        SalesInvoice inv = invoice("ABC", item("A", null), item("B", null));

        service.applyToInvoice(inv, BRANCH_A, SalesItemPricePolicy.RETAIL);

        SalesInvoiceItem a = inv.getItems().get(0);
        assertThat(a.getPrice()).isEqualByComparingTo("25.00");
        assertThat(a.getPriceSource()).isEqualTo("CUSTOMER_SPECIFIC");
        assertThat(a.getCustomerPriceId()).isEqualTo(only(abc, 10L).getId());
        assertThat(a.getPriceOverridden()).isFalse();
        SalesInvoiceItem b = inv.getItems().get(1);
        assertThat(b.getPrice()).isEqualByComparingTo("45.00");
        assertThat(b.getPriceSource()).isEqualTo("PRICE_LEVEL");
        assertThat(b.getCustomerPriceId()).isNull();
    }

    @Test
    void outdatedOrForeignCustomerPriceFromTheClientIsFlaggedAsAnOverride() {
        // The client sends XYZ's 26 for ABC (or a stale price): kept as typed, but flagged.
        SalesInvoice inv = invoice("ABC", item("A", "26.00"));

        service.applyToInvoice(inv, BRANCH_A, SalesItemPricePolicy.RETAIL);

        SalesInvoiceItem a = inv.getItems().get(0);
        assertThat(a.getPrice()).isEqualByComparingTo("26.00");
        assertThat(a.getResolvedUnitPrice()).isEqualByComparingTo("25.00");
        assertThat(a.getPriceOverridden()).isTrue();
    }

    @Test
    void negotiatedPriceMustBeValidOnTheInvoiceDate() {
        only(abc, 10L).setEffectiveFrom(TODAY.minusDays(5));
        SalesInvoice backdated = invoice("ABC", item("A", null));
        backdated.setInvoiceDate(TODAY.minusDays(10));

        service.applyToInvoice(backdated, BRANCH_A, SalesItemPricePolicy.RETAIL);

        assertThat(backdated.getItems().get(0).getPrice()).isEqualByComparingTo("27.00");
    }

    @Test
    void savedInvoiceKeepsItsPriceWhenTheNegotiatedPriceChangesOrIsRemovedLater() {
        SalesInvoice inv = invoice("ABC", item("A", null));
        service.applyToInvoice(inv, BRANCH_A, SalesItemPricePolicy.RETAIL);
        assertThat(inv.getItems().get(0).getPrice()).isEqualByComparingTo("25.00");

        CustomerProductPrice row = only(abc, 10L);
        row.setPrice(new BigDecimal("21.00"));
        service.applyToInvoice(inv, BRANCH_A, SalesItemPricePolicy.RETAIL, wholesale.getId());
        assertThat(inv.getItems().get(0).getPrice()).isEqualByComparingTo("25.00");

        row.setActive(false);
        service.applyToInvoice(inv, BRANCH_A, SalesItemPricePolicy.RETAIL, wholesale.getId());
        assertThat(inv.getItems().get(0).getPrice()).isEqualByComparingTo("25.00");
    }

    // ------------------------------------------------------------------ fixtures

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
        pp.setPrice(new BigDecimal(price));
        packings.add(pp);
    }

    private void levelPrice(long productId, PriceLevel level, String price) {
        ProductLevelPrice r = new ProductLevelPrice();
        r.setProductId(productId);
        r.setPriceLevelId(level.getId());
        r.setPrice(new BigDecimal(price));
        levelPrices.add(r);
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

    private CustomerProductPrice mapping(Customer customer, long productId, Long branchId, String price) {
        CustomerProductPrice r = new CustomerProductPrice();
        r.setId(nextMappingId++);
        r.setCustomerId(customer.getId());
        r.setProductId(productId);
        r.setBranchId(branchId);
        r.setPrice(new BigDecimal(price));
        r.setEffectiveFrom(TODAY.minusDays(30));
        customerPrices.add(r);
        return r;
    }

    private CustomerProductPrice only(Customer customer, long productId) {
        return customerPrices.stream()
                .filter(r -> r.getCustomerId().equals(customer.getId()) && r.getProductId() == productId && r.getBranchId() == null)
                .findFirst().orElseThrow();
    }

    private static Context ctx(long branchId, Long levelId, String customerCode) {
        return new Context(branchId, levelId, null, customerCode, SalesItemPricePolicy.RETAIL);
    }

    private static Line line(long productId) {
        return new Line(productId, null, null, BigDecimal.ONE);
    }

    private static SalesInvoiceItem item(String code, String price) {
        SalesInvoiceItem it = new SalesInvoiceItem();
        it.setItemCode(code);
        it.setQuantity(1);
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
