package com.billbull.backend.sales.pricing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.ArrayList;
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
import com.billbull.backend.inventory.product.ProductBranchPricing;
import com.billbull.backend.inventory.product.ProductBranchPricingRepository;
import com.billbull.backend.inventory.product.ProductPacking;
import com.billbull.backend.inventory.product.ProductPackingRepository;
import com.billbull.backend.inventory.product.ProductPricing;
import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.units.Unit;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesType;
import com.billbull.backend.sales.pricing.PricingModels.Context;
import com.billbull.backend.sales.pricing.PricingModels.Line;
import com.billbull.backend.sales.pricing.PricingModels.LinePrice;
import com.billbull.backend.sales.pricing.PricingModels.Resolution;
import com.billbull.backend.sales.pricing.PricingModels.SaleUnit;
import com.billbull.backend.sales.pricing.PricingModels.SaleUnits;
import com.billbull.backend.sales.settings.SalesItemPricePolicy;
import com.billbull.backend.settings.branch.Branch;

/**
 * Pricing Phase 1 — the shared resolver: level precedence (transaction → customer → default),
 * per-branch level prices with all-branches fallback, fallback to the existing effective price,
 * inactive / missing levels, branch isolation, and invoice stamping that never rewrites a price.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PricingResolutionServiceTest {

    static final long BRANCH_A = 1L;
    static final long BRANCH_B = 2L;

    @Mock PriceLevelRepository levelRepository;
    @Mock ProductLevelPriceRepository levelPriceRepository;
    @Mock ProductRepository productRepository;
    @Mock ProductPricingRepository pricingRepository;
    @Mock ProductBranchPricingRepository branchPricingRepository;
    @Mock ProductPackingRepository packingRepository;
    @Mock CustomerRepository customerRepository;

    PricingResolutionService service;

    final Map<Long, PriceLevel> levels = new HashMap<>();
    final List<Product> products = new ArrayList<>();
    final List<ProductPricing> pricings = new ArrayList<>();
    final List<ProductBranchPricing> branchPricings = new ArrayList<>();
    final List<ProductPacking> packings = new ArrayList<>();
    final List<ProductLevelPrice> levelPrices = new ArrayList<>();

    PriceLevel retail;
    PriceLevel wholesale;
    PriceLevel vip;

    @BeforeEach
    void setUp() {
        service = new PricingResolutionService(levelRepository, levelPriceRepository, productRepository,
                pricingRepository, branchPricingRepository, packingRepository, customerRepository);

        when(levelRepository.findById(anyLong())).thenAnswer(inv -> Optional.ofNullable(levels.get(inv.getArgument(0, Long.class))));
        when(levelRepository.findFirstBySystemDefaultTrue()).thenAnswer(inv ->
                levels.values().stream().filter(PriceLevel::isSystemDefault).findFirst());
        when(levelRepository.findFirstByNameIgnoreCase(anyString())).thenAnswer(inv ->
                levels.values().stream().filter(l -> l.getName().equalsIgnoreCase(inv.getArgument(0))).findFirst());
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
        when(branchPricingRepository.findByProductIdIn(anyList())).thenAnswer(inv -> branchPricings);
        when(packingRepository.findByProductIdIn(anyList())).thenAnswer(inv -> packings);
        when(packingRepository.findByProductId(anyLong())).thenAnswer(inv -> packings.stream()
                .filter(pp -> pp.getProduct().getId().equals(inv.getArgument(0, Long.class))).toList());
        when(levelPriceRepository.findByProductIdInAndPriceLevelId(anyCollection(), anyLong())).thenAnswer(inv -> {
            Long levelId = inv.getArgument(1);
            return levelPrices.stream().filter(r -> r.getPriceLevelId().equals(levelId)).toList();
        });

        retail = level(1L, "Retail", true, true);
        wholesale = level(2L, "Wholesale", false, true);
        vip = level(3L, "VIP", false, true);
    }

    // ------------------------------------------------------------------ precedence

    @Test
    void noCustomerNoSelectionUsesDefaultLevelAndExistingRetailPrice() {
        product(10L, "P10", null, "100.00");

        Resolution r = service.resolve(ctx(BRANCH_A, null, null), List.of(line(10L)));

        assertThat(r.level().id()).isEqualTo(retail.getId());
        assertThat(r.level().source()).isEqualTo(PriceLevelSource.DEFAULT);
        assertThat(r.lines().get(0).price()).isEqualByComparingTo("100.00");
        assertThat(r.lines().get(0).source()).isEqualTo(PriceSource.BASE_PRICE);
    }

    @Test
    void customerDefaultLevelAppliesItsPrice() {
        product(10L, "P10", null, "100.00");
        levelPrice(10L, wholesale, null, "80.00");
        customer("C1", wholesale.getId(), null);

        Resolution r = service.resolve(ctx(BRANCH_A, null, "C1"), List.of(line(10L)));

        assertThat(r.level().name()).isEqualTo("Wholesale");
        assertThat(r.level().source()).isEqualTo(PriceLevelSource.CUSTOMER);
        LinePrice lp = r.lines().get(0);
        assertThat(lp.price()).isEqualByComparingTo("80.00");
        assertThat(lp.basePrice()).isEqualByComparingTo("100.00");
        assertThat(lp.source()).isEqualTo(PriceSource.PRICE_LEVEL);
        assertThat(lp.priceLevelId()).isEqualTo(wholesale.getId());
    }

    @Test
    void transactionSelectionOverridesCustomerDefault() {
        product(10L, "P10", null, "100.00");
        levelPrice(10L, wholesale, null, "80.00");
        levelPrice(10L, vip, null, "90.00");
        customer("C1", wholesale.getId(), null);

        Resolution r = service.resolve(ctx(BRANCH_A, vip.getId(), "C1"), List.of(line(10L)));

        assertThat(r.level().source()).isEqualTo(PriceLevelSource.TRANSACTION);
        assertThat(r.lines().get(0).price()).isEqualByComparingTo("90.00");
    }

    @Test
    void choosingTheDefaultLevelExplicitlyReturnsToRetailForALevelCustomer() {
        product(10L, "P10", null, "100.00");
        levelPrice(10L, wholesale, null, "80.00");
        customer("C1", wholesale.getId(), null);

        Resolution r = service.resolve(ctx(BRANCH_A, retail.getId(), "C1"), List.of(line(10L)));

        assertThat(r.level().source()).isEqualTo(PriceLevelSource.TRANSACTION);
        assertThat(r.lines().get(0).price()).isEqualByComparingTo("100.00");
    }

    @Test
    void switchingCustomerChangesTheResolvedLevel() {
        product(10L, "P10", null, "100.00");
        levelPrice(10L, wholesale, null, "80.00");
        levelPrice(10L, vip, null, "95.00");
        customer("C1", wholesale.getId(), null);
        customer("C2", vip.getId(), null);

        assertThat(service.resolve(ctx(BRANCH_A, null, "C1"), List.of(line(10L))).lines().get(0).price())
                .isEqualByComparingTo("80.00");
        assertThat(service.resolve(ctx(BRANCH_A, null, "C2"), List.of(line(10L))).lines().get(0).price())
                .isEqualByComparingTo("95.00");
        assertThat(service.resolve(ctx(BRANCH_A, null, "WALK-IN"), List.of(line(10L))).lines().get(0).price())
                .isEqualByComparingTo("100.00");
    }

    @Test
    void legacyPriceListNameIsHonouredWhenNoLevelIdIsSet() {
        product(10L, "P10", null, "100.00");
        levelPrice(10L, wholesale, null, "80.00");
        customer("C1", null, "wholesale");

        Resolution r = service.resolve(ctx(BRANCH_A, null, "C1"), List.of(line(10L)));

        assertThat(r.level().id()).isEqualTo(wholesale.getId());
        assertThat(r.lines().get(0).price()).isEqualByComparingTo("80.00");
    }

    // ------------------------------------------------------------------ missing / inactive

    @Test
    void explicitInactiveLevelIsRefused() {
        wholesale.setActive(false);
        assertThatThrownBy(() -> service.resolve(ctx(BRANCH_A, wholesale.getId(), null), List.of()))
                .isInstanceOf(PricingException.class)
                .hasMessageContaining("inactive");
    }

    @Test
    void explicitUnknownLevelIsRefused() {
        assertThatThrownBy(() -> service.resolve(ctx(BRANCH_A, 999L, null), List.of()))
                .isInstanceOf(PricingException.class)
                .hasMessageContaining("does not exist");
    }

    @Test
    void customersInactiveLevelFallsBackToDefaultWithANotice() {
        product(10L, "P10", null, "100.00");
        levelPrice(10L, wholesale, null, "80.00");
        wholesale.setActive(false);
        customer("C1", wholesale.getId(), null);

        Resolution r = service.resolve(ctx(BRANCH_A, null, "C1"), List.of(line(10L)));

        assertThat(r.level().source()).isEqualTo(PriceLevelSource.DEFAULT);
        assertThat(r.level().notice()).contains("inactive");
        assertThat(r.lines().get(0).price()).isEqualByComparingTo("100.00");
    }

    @Test
    void levelWithoutAPriceForTheProductFallsBackToTheEffectivePrice() {
        product(10L, "P10", null, "100.00");
        customer("C1", wholesale.getId(), null);

        LinePrice lp = service.resolve(ctx(BRANCH_A, null, "C1"), List.of(line(10L))).lines().get(0);

        assertThat(lp.price()).isEqualByComparingTo("100.00");
        assertThat(lp.levelPriceMissing()).isTrue();
        assertThat(lp.source()).isEqualTo(PriceSource.BASE_PRICE);
    }

    @Test
    void inactiveLevelPriceRowIsIgnored() {
        product(10L, "P10", null, "100.00");
        levelPrice(10L, wholesale, null, "80.00").setActive(false);

        LinePrice lp = service.resolve(ctx(BRANCH_A, wholesale.getId(), null), List.of(line(10L))).lines().get(0);

        assertThat(lp.price()).isEqualByComparingTo("100.00");
        assertThat(lp.levelPriceMissing()).isTrue();
    }

    // ------------------------------------------------------------------ branch

    @Test
    void branchLevelPriceWinsOverAllBranchesPriceOnlyForThatBranch() {
        product(10L, "P10", null, "100.00");
        levelPrice(10L, wholesale, null, "80.00");
        levelPrice(10L, wholesale, BRANCH_B, "75.00");

        LinePrice inA = service.resolve(ctx(BRANCH_A, wholesale.getId(), null), List.of(line(10L))).lines().get(0);
        LinePrice inB = service.resolve(ctx(BRANCH_B, wholesale.getId(), null), List.of(line(10L))).lines().get(0);

        assertThat(inA.price()).isEqualByComparingTo("80.00");
        assertThat(inA.source()).isEqualTo(PriceSource.PRICE_LEVEL);
        assertThat(inB.price()).isEqualByComparingTo("75.00");
        assertThat(inB.source()).isEqualTo(PriceSource.PRICE_LEVEL_BRANCH);
    }

    @Test
    void defaultLevelKeepsTheExistingBranchPriceBehaviour() {
        product(10L, "P10", null, "100.00");
        branchPrice(10L, BRANCH_B, "110.00");

        LinePrice inA = service.resolve(ctx(BRANCH_A, null, null), List.of(line(10L))).lines().get(0);
        LinePrice inB = service.resolve(ctx(BRANCH_B, null, null), List.of(line(10L))).lines().get(0);

        assertThat(inA.price()).isEqualByComparingTo("100.00");
        assertThat(inB.price()).isEqualByComparingTo("110.00");
        assertThat(inB.source()).isEqualTo(PriceSource.BRANCH_PRICE);
    }

    @Test
    void levelMissingInBranchFallsBackToThatBranchsEffectivePrice() {
        product(10L, "P10", null, "100.00");
        branchPrice(10L, BRANCH_B, "110.00");
        levelPrice(10L, wholesale, BRANCH_A, "70.00");

        LinePrice inB = service.resolve(ctx(BRANCH_B, wholesale.getId(), null), List.of(line(10L))).lines().get(0);

        assertThat(inB.price()).isEqualByComparingTo("110.00");
        assertThat(inB.levelPriceMissing()).isTrue();
    }

    @Test
    void productOwnedByAnotherBranchIsNotPriced() {
        product(10L, "P10", BRANCH_B, "100.00");

        LinePrice lp = service.resolve(ctx(BRANCH_A, null, null), List.of(line(10L))).lines().get(0);

        assertThat(lp.source()).isEqualTo(PriceSource.NONE);
        assertThat(lp.price()).isNull();
    }

    // ------------------------------------------------------------------ units / policy

    @Test
    void multiUnitPackingScalesTheLevelPriceByItsConversion() {
        Product p = product(10L, "P10", null, "10.00");
        packing(p, "Box", "12", "110.00");
        levelPrice(10L, wholesale, null, "8.00");

        LinePrice box = service.resolve(ctx(BRANCH_A, wholesale.getId(), null),
                List.of(new Line(10L, null, "Box", BigDecimal.ONE))).lines().get(0);
        LinePrice boxDefault = service.resolve(ctx(BRANCH_A, null, null),
                List.of(new Line(10L, null, "Box", BigDecimal.ONE))).lines().get(0);

        assertThat(box.price()).isEqualByComparingTo("96.00");
        assertThat(boxDefault.price()).isEqualByComparingTo("110.00");
        assertThat(boxDefault.source()).isEqualTo(PriceSource.PACKING_PRICE);
    }

    @Test
    void saleUnitsListsBaseAndSalePackingsSmallestFirstPricedPerUnit() {
        Product p = product(10L, "P10", null, "89.00");
        packing(p, "Carton", "48", "4000.00").setSale(true);
        packing(p, "PCS", "1", "89.00").setSale(true);
        packing(p, "Box of 12", "12", "0").setSale(true); // no own price → base × conversion
        packing(p, "Pallet", "960", "70000.00");           // not a sale packing → not offered

        SaleUnits units = service.saleUnits(ctx(BRANCH_A, null, null), 10L, null);

        assertThat(units.units()).extracting(SaleUnit::unit).containsExactly("PCS", "Box of 12", "Carton");
        assertThat(units.units().get(0).base()).isTrue();
        assertThat(units.units().get(0).price()).isEqualByComparingTo("89.00");
        assertThat(units.units().get(1).conversion()).isEqualByComparingTo("12");
        assertThat(units.units().get(1).price()).isEqualByComparingTo("1068.00");
        assertThat(units.units().get(2).price()).isEqualByComparingTo("4000.00");
        assertThat(units.units().get(2).source()).isEqualTo(PriceSource.PACKING_PRICE);
    }

    @Test
    void saleUnitsFollowTheTransactionLevel() {
        Product p = product(10L, "P10", null, "10.00");
        packing(p, "PCS", "1", "10.00");
        packing(p, "Box", "12", "110.00").setSale(true);
        levelPrice(10L, wholesale, null, "8.00");

        SaleUnits units = service.saleUnits(ctx(BRANCH_A, wholesale.getId(), null), null, "P10");

        assertThat(units.level().id()).isEqualTo(wholesale.getId());
        assertThat(units.units()).extracting(u -> u.price().toPlainString()).containsExactly("8.00", "96.00");
    }

    @Test
    void saleUnitsAreEmptyForAProductWithoutPackingsOrOutsideTheBranch() {
        product(10L, "P10", null, "10.00");
        Product other = product(11L, "P11", BRANCH_B, "10.00");
        packing(other, "Box", "12", "110.00").setSale(true);

        assertThat(service.saleUnits(ctx(BRANCH_A, null, null), 10L, null).units()).isEmpty();
        assertThat(service.saleUnits(ctx(BRANCH_A, null, null), 11L, null).units()).isEmpty();
    }

    @Test
    void backOfficePolicyPicksTheConfiguredMasterField() {
        ProductPricing pr = pricing(product(10L, "P10", null, "100.00"));
        pr.setMaxPrice(new BigDecimal("120.00"));

        LinePrice lp = service.resolve(new Context(BRANCH_A, null, null, null, SalesItemPricePolicy.MAX_SALE),
                List.of(line(10L))).lines().get(0);

        assertThat(lp.price()).isEqualByComparingTo("120.00");
    }

    // ------------------------------------------------------------------ invoices

    @Test
    void invoiceLineWithoutPriceIsFilledAndStamped() {
        product(10L, "P10", null, "100.00");
        levelPrice(10L, wholesale, null, "80.00");
        customer("C1", wholesale.getId(), null);
        SalesInvoice inv = invoice("C1", null, item("P10", null));

        service.applyToInvoice(inv, BRANCH_A, SalesItemPricePolicy.RETAIL);

        SalesInvoiceItem it = inv.getItems().get(0);
        assertThat(inv.getPriceLevelId()).isEqualTo(wholesale.getId());
        assertThat(inv.getPriceLevelSource()).isEqualTo("CUSTOMER");
        assertThat(it.getPrice()).isEqualByComparingTo("80.00");
        assertThat(it.getResolvedUnitPrice()).isEqualByComparingTo("80.00");
        assertThat(it.getPriceSource()).isEqualTo("PRICE_LEVEL");
        assertThat(it.getPriceLevelName()).isEqualTo("Wholesale");
        assertThat(it.getPriceOverridden()).isFalse();
    }

    @Test
    void manuallyEditedPriceIsKeptAndFlagged() {
        product(10L, "P10", null, "100.00");
        levelPrice(10L, wholesale, null, "80.00");
        SalesInvoice inv = invoice(null, wholesale.getId(), item("P10", "85.00"));

        service.applyToInvoice(inv, BRANCH_A, SalesItemPricePolicy.RETAIL);

        SalesInvoiceItem it = inv.getItems().get(0);
        assertThat(it.getPrice()).isEqualByComparingTo("85.00");
        assertThat(it.getResolvedUnitPrice()).isEqualByComparingTo("80.00");
        assertThat(it.getPriceOverridden()).isTrue();
        assertThat(inv.getPriceLevelSource()).isEqualTo("TRANSACTION");
    }

    @Test
    void savedInvoicePriceSurvivesLaterLevelPriceChange() {
        product(10L, "P10", null, "100.00");
        ProductLevelPrice row = levelPrice(10L, wholesale, null, "80.00");
        SalesInvoice inv = invoice(null, wholesale.getId(), item("P10", null));
        service.applyToInvoice(inv, BRANCH_A, SalesItemPricePolicy.RETAIL);
        assertThat(inv.getItems().get(0).getPrice()).isEqualByComparingTo("80.00");

        // Level price and product price change after the sale; the invoice is re-saved (edited).
        row.setPrice(new BigDecimal("60.00"));
        pricings.get(0).setRetailPrice(new BigDecimal("150.00"));
        service.applyToInvoice(inv, BRANCH_A, SalesItemPricePolicy.RETAIL, wholesale.getId());

        assertThat(inv.getItems().get(0).getPrice()).isEqualByComparingTo("80.00");
    }

    @Test
    void editingAnInvoiceMayKeepALevelDeactivatedSinceButANewInvoiceMayNot() {
        product(10L, "P10", null, "100.00");
        wholesale.setActive(false);

        SalesInvoice edited = invoice(null, wholesale.getId(), item("P10", "80.00"));
        service.applyToInvoice(edited, BRANCH_A, SalesItemPricePolicy.RETAIL, wholesale.getId());
        assertThat(edited.getPriceLevelId()).isEqualTo(wholesale.getId());

        SalesInvoice fresh = invoice(null, wholesale.getId(), item("P10", "80.00"));
        assertThatThrownBy(() -> service.applyToInvoice(fresh, BRANCH_A, SalesItemPricePolicy.RETAIL, null))
                .isInstanceOf(PricingException.class);
    }

    @Test
    void posInvoiceAlwaysUsesTheRetailBasisWhateverTheBackOfficePolicy() {
        ProductPricing pr = pricing(product(10L, "P10", null, "100.00"));
        pr.setMaxPrice(new BigDecimal("120.00"));
        SalesInvoice inv = invoice(null, null, item("P10", "100.00"));
        inv.setSalesType(SalesType.POS_SALE);

        service.applyToInvoice(inv, BRANCH_A, SalesItemPricePolicy.MAX_SALE);

        assertThat(inv.getItems().get(0).getResolvedUnitPrice()).isEqualByComparingTo("100.00");
        assertThat(inv.getItems().get(0).getPriceOverridden()).isFalse();
    }

    @Test
    void voidedLinesAreNotPriced() {
        product(10L, "P10", null, "100.00");
        SalesInvoiceItem voided = item("P10", null);
        voided.setVoided(true);
        SalesInvoice inv = invoice(null, null, voided);

        service.applyToInvoice(inv, BRANCH_A, SalesItemPricePolicy.RETAIL);

        assertThat(voided.getPrice()).isNull();
        assertThat(voided.getPriceSource()).isNull();
    }

    // ------------------------------------------------------------------ fixtures

    private PriceLevel level(long id, String name, boolean systemDefault, boolean active) {
        PriceLevel l = new PriceLevel();
        l.setId(id);
        l.setName(name);
        l.setCode(name.toUpperCase());
        l.setSystemDefault(systemDefault);
        l.setActive(active);
        levels.put(id, l);
        return l;
    }

    private Product product(long id, String code, Long ownerBranchId, String retailPrice) {
        Product p = new Product();
        p.setId(id);
        p.setCode(code);
        p.setActive(true);
        if (ownerBranchId != null) p.setBranch(branch(ownerBranchId));
        products.add(p);
        ProductPricing pr = new ProductPricing();
        pr.setProduct(p);
        pr.setRetailPrice(new BigDecimal(retailPrice));
        pricings.add(pr);
        return p;
    }

    private ProductPricing pricing(Product p) {
        return pricings.stream().filter(pr -> pr.getProduct() == p).findFirst().orElseThrow();
    }

    private void branchPrice(long productId, long branchId, String retail) {
        ProductBranchPricing bp = new ProductBranchPricing();
        bp.setProduct(products.stream().filter(p -> p.getId() == productId).findFirst().orElseThrow());
        bp.setBranch(branch(branchId));
        bp.setRetailPrice(new BigDecimal(retail));
        branchPricings.add(bp);
    }

    private ProductPacking packing(Product p, String unitName, String conversion, String price) {
        Unit u = new Unit(unitName, unitName, null);
        ProductPacking pp = new ProductPacking();
        pp.setProduct(p);
        pp.setUnit(u);
        pp.setConversion(new BigDecimal(conversion));
        pp.setPrice(new BigDecimal(price));
        packings.add(pp);
        return pp;
    }

    private ProductLevelPrice levelPrice(long productId, PriceLevel level, Long branchId, String price) {
        ProductLevelPrice r = new ProductLevelPrice();
        r.setProductId(productId);
        r.setPriceLevelId(level.getId());
        r.setBranchId(branchId);
        r.setPrice(new BigDecimal(price));
        levelPrices.add(r);
        return r;
    }

    private void customer(String code, Long levelId, String priceList) {
        Customer c = new Customer();
        c.setCode(code);
        c.setPriceLevelId(levelId);
        c.setPriceList(priceList);
        when(customerRepository.findByCode(eq(code))).thenReturn(Optional.of(c));
    }

    private static Branch branch(long id) {
        Branch b = new Branch();
        b.setId(id);
        return b;
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

    private static SalesInvoice invoice(String customerCode, Long levelId, SalesInvoiceItem... items) {
        SalesInvoice inv = new SalesInvoice();
        inv.setCustomerCode(customerCode);
        inv.setPriceLevelId(levelId);
        inv.setItems(new ArrayList<>(List.of(items)));
        return inv;
    }
}
