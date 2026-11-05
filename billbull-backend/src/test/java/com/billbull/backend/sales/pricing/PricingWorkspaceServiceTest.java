package com.billbull.backend.sales.pricing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductCostMasking;
import com.billbull.backend.inventory.product.ProductMediaRepository;
import com.billbull.backend.inventory.product.ProductPriceChangeRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.pricing.CustomerProductPriceService.PriceRequest;
import com.billbull.backend.sales.pricing.PricingRulesService.Costs;
import com.billbull.backend.sales.pricing.PricingRulesService.Rules;
import com.billbull.backend.sales.pricing.ProductLevelPriceService.PriceRow;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.AssignRequest;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.BulkLevelRequest;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.BulkResult;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.CustomerBulkRequest;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.CustomerBulkResult;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.ImportRequest;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.ImportResult;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.ImportRow;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.settings.branch.BranchRepository;

/** Price Levels workspace: bulk level price changes, import, level assignment, bulk customer prices. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PricingWorkspaceServiceTest {

    static final LocalDate TODAY = LocalDate.of(2026, 11, 5);

    @Mock PricingWorkspaceRepository repository;
    @Mock PriceLevelRepository levelRepository;
    @Mock ProductLevelPriceRepository levelPriceRepository;
    @Mock ProductLevelPriceService levelPriceService;
    @Mock CustomerProductPriceRepository customerPriceRepository;
    @Mock CustomerProductPriceService customerPriceService;
    @Mock PricingRulesService rules;
    @Mock PricingResolutionService resolver;
    @Mock ProductRepository productRepository;
    @Mock ProductMediaRepository mediaRepository;
    @Mock ProductPriceChangeRepository changeRepository;
    @Mock BranchRepository branchRepository;
    @Mock ProductCostMasking costMasking;

    PricingWorkspaceService service;
    PriceLevel retail;
    PriceLevel wholesale;
    Product phone;
    Product laptop;
    final List<ProductLevelPrice> levelPrices = new ArrayList<>();
    final Map<Long, Costs> costs = new HashMap<>();
    Rules currentRules = new Rules(new BigDecimal("15"), false, new BigDecimal("0.01"));

    @BeforeEach
    void setUp() {
        BranchContextHolder.clear();
        service = new PricingWorkspaceService(repository, levelRepository, levelPriceRepository, levelPriceService,
                customerPriceRepository, customerPriceService, rules, resolver, productRepository, mediaRepository,
                changeRepository, branchRepository, costMasking);
        retail = level(1L, "Retail", true, true);
        wholesale = level(2L, "Wholesale", false, true);
        phone = product(10L, "PH-1", "Phone");
        laptop = product(11L, "LP-1", "Laptop");
        costs.put(10L, new Costs(new BigDecimal("80.00"), new BigDecimal("120.00")));
        costs.put(11L, new Costs(null, new BigDecimal("500.00")));

        when(costMasking.callerMaySeeCost()).thenReturn(true);
        when(resolver.pricingDate(null)).thenReturn(TODAY);
        when(rules.get()).thenAnswer(inv -> currentRules);
        when(rules.costs(anyCollection(), any())).thenAnswer(inv -> {
            Map<Long, Costs> out = new HashMap<>();
            for (Object id : (java.util.Collection<?>) inv.getArgument(0)) out.put((Long) id, costs.get(id));
            return out;
        });
        when(repository.products(anyBoolean(), anyCollection(), anyBoolean(), anyCollection(), anyString(), any(), any(),
                anyString(), any(), any())).thenAnswer(inv -> new PageImpl<>(List.of(phone, laptop), PageRequest.of(0, 500), 2));
        when(levelPriceRepository.findByProductIdIn(anyCollection())).thenAnswer(inv -> List.copyOf(levelPrices));
    }

    @AfterEach
    void tearDown() {
        BranchContextHolder.clear();
    }

    @Test
    void setMarginPricesFromCostRoundsAndSkipsProductsWithoutCost() {
        BulkResult result = service.bulkUpdate(bulk("SET_MARGIN", "20", "0.50", false));

        assertEquals(2, result.products());
        assertEquals(1, result.changed());
        assertEquals(1, result.skipped());
        assertEquals(1, result.skippedReasons().get("No cost on the product"));
        // 80 / 0.8 = 100.00
        assertEquals(new BigDecimal("100.00"), result.samples().get(0).newPrice());
        assertEquals(new BigDecimal("20.00"), result.samples().get(0).marginPercent());
        List<PriceRow> written = captureUpsert();
        assertEquals(1, written.size());
        assertEquals(10L, written.get(0).getProductId());
        assertEquals(2L, written.get(0).getPriceLevelId());
        assertNull(written.get(0).getBranchId());
    }

    @Test
    void dryRunWritesNothing() {
        BulkResult result = service.bulkUpdate(bulk("SET_MARGIN", "20", "0.01", true));

        assertEquals(1, result.changed());
        assertFalse(result.applied());
        verify(levelPriceService, never()).upsert(anyList());
    }

    @Test
    void increaseUsesTheLevelPriceAndFallsBackToTheBasePrice() {
        levelPrices.add(levelPrice(10L, wholesale, "100.00"));

        BulkResult result = service.bulkUpdate(bulk("INCREASE_PERCENT", "10", "0.01", false));

        assertEquals(2, result.changed());
        Map<Long, BigDecimal> next = new HashMap<>();
        captureUpsert().forEach(r -> next.put(r.getProductId(), r.getPrice()));
        assertEquals(new BigDecimal("110.00"), next.get(10L));   // from its Wholesale price
        assertEquals(new BigDecimal("550.00"), next.get(11L));   // no Wholesale price: from retail
    }

    @Test
    void onlyExistingSkipsProductsWithoutALevelPrice() {
        levelPrices.add(levelPrice(10L, wholesale, "100.00"));
        BulkLevelRequest req = bulk("DECREASE_AMOUNT", "5", "0.01", false);
        req.setOnlyExisting(true);

        BulkResult result = service.bulkUpdate(req);

        assertEquals(1, result.changed());
        assertEquals(1, result.skippedReasons().get("No price set under the level"));
    }

    @Test
    void belowCostIsSkippedWhenTheRuleBlocksIt() {
        currentRules = new Rules(new BigDecimal("15"), true, new BigDecimal("0.01"));
        BulkResult result = service.bulkUpdate(bulk("SET_PRICE", "50", "0.01", false));

        assertEquals(1, result.changed()); // the laptop has no cost, so 50 is allowed there
        assertEquals(1, result.skippedReasons().get("Below cost (blocked by pricing rules)"));
    }

    @Test
    void unchangedPricesAreNotRewritten() {
        levelPrices.add(levelPrice(10L, wholesale, "100.00"));
        levelPrices.add(levelPrice(11L, wholesale, "100.00"));

        BulkResult result = service.bulkUpdate(bulk("SET_PRICE", "100", "0.01", false));

        assertEquals(0, result.changed());
        assertEquals(2, result.unchanged());
        verify(levelPriceService, never()).upsert(anyList());
    }

    @Test
    void theDefaultLevelCannotBeBulkUpdated() {
        BulkLevelRequest req = bulk("SET_PRICE", "10", "0.01", false);
        req.setPriceLevelIds(List.of(1L));
        assertThrows(PricingException.class, () -> service.bulkUpdate(req));
    }

    @Test
    void pricingFromCostNeedsCostVisibility() {
        when(costMasking.callerMaySeeCost()).thenReturn(false);
        assertThrows(PricingException.class, () -> service.bulkUpdate(bulk("SET_MARGIN", "20", "0.01", false)));
    }

    @Test
    void importResolvesCodesAndLevelNamesAndReportsBadRows() {
        when(productRepository.findByCodeIn(anyList())).thenReturn(List.of(phone, laptop));
        when(levelRepository.findAll()).thenReturn(List.of(retail, wholesale));
        levelPrices.add(levelPrice(11L, wholesale, "450.00"));
        ImportRequest req = new ImportRequest();
        req.setRows(List.of(
                importRow(2, "PH-1", "wholesale", "99.5"),
                importRow(3, "LP-1", "WHOLESALE", ""),         // clears
                importRow(4, "XX-9", "Wholesale", "10"),        // unknown product
                importRow(5, "PH-1", "Retail", "10"),           // default level
                importRow(6, "PH-1", "Staff", "10")));          // unknown level

        ImportResult result = service.importPrices(req);

        assertEquals(1, result.applied());
        assertEquals(1, result.cleared());
        assertEquals(3, result.errors().size());
        List<PriceRow> written = captureUpsert();
        assertEquals(new BigDecimal("99.50"), written.get(0).getPrice());
        assertNull(written.get(1).getPrice());
    }

    @Test
    void assignPutsCustomersOnTheLevelAndRemovingClearsTheLabel() {
        Customer a = customer(100L, null, null);
        Customer b = customer(101L, 2L, "Wholesale");
        when(repository.customersByIds(anyCollection())).thenReturn(List.of(a, b));
        AssignRequest req = new AssignRequest();
        req.setCustomerIds(List.of(100L, 101L));

        assertEquals(1, service.assign(2L, req).updated());
        assertEquals(2L, a.getPriceLevelId());
        assertEquals("Wholesale", a.getPriceList());

        req.setAssign(false);
        assertEquals(2, service.assign(2L, req).updated());
        assertNull(a.getPriceLevelId());
        assertNull(b.getPriceList());
    }

    @Test
    void anInactiveLevelCannotBeAssigned() {
        wholesale.setActive(false);
        when(repository.customersByIds(anyCollection())).thenReturn(List.of(customer(100L, null, null)));
        AssignRequest req = new AssignRequest();
        req.setCustomerIds(List.of(100L));
        assertThrows(PricingException.class, () -> service.assign(2L, req));
    }

    @Test
    void customerBulkSkipsProductsThatAlreadyHaveAPriceUnlessReplacing() {
        when(repository.customersByIds(anyCollection())).thenReturn(List.of(customer(100L, null, null)));
        CustomerProductPrice existing = customerPrice(500L, 100L, 10L, "110.00", TODAY.minusDays(30));
        when(customerPriceRepository.findByCustomerIdAndIsActiveTrue(100L)).thenReturn(List.of(existing));
        CustomerBulkRequest req = customerBulk("DISCOUNT_PERCENT", "10");

        CustomerBulkResult skip = service.customerBulk(req);
        assertEquals(1, skip.created());
        assertEquals(1, skip.skippedReasons().get("Customer already has a price for the product"));

        req.setReplaceExisting(true);
        CustomerBulkResult replace = service.customerBulk(req);
        assertEquals(2, replace.created());
        assertEquals(1, replace.replaced());
        ArgumentCaptor<PriceRequest> end = ArgumentCaptor.forClass(PriceRequest.class);
        verify(customerPriceService).update(eq(500L), end.capture());
        assertEquals(TODAY.minusDays(1), end.getValue().getEffectiveTo());
        ArgumentCaptor<PriceRequest> created = ArgumentCaptor.forClass(PriceRequest.class);
        verify(customerPriceService, org.mockito.Mockito.times(3)).create(created.capture());
        // 10 % off the phone's 120.00 retail price
        assertEquals(new BigDecimal("108.00"), created.getAllValues().stream()
                .filter(r -> r.getProductId() == 10L).findFirst().orElseThrow().getPrice());
    }

    @Test
    void copyKeepsEveryNonOverlappingPeriodOfAProduct() {
        when(repository.customersByIds(anyCollection())).thenReturn(List.of(customer(100L, null, null)));
        CustomerProductPrice now = customerPrice(1L, 100L, 10L, "110.00", TODAY.minusDays(10));
        now.setEffectiveTo(TODAY.plusDays(2));
        CustomerProductPrice later = customerPrice(2L, 100L, 10L, "105.00", TODAY.plusDays(3));
        when(customerPriceRepository.findByCustomerIdAndIsActiveTrue(100L)).thenReturn(List.of(now, later));
        when(customerPriceRepository.findByCustomerIdAndIsActiveTrue(200L)).thenReturn(List.of());
        when(productRepository.findAllById(any())).thenReturn(List.of(phone));
        PricingWorkspaceService.CopyRequest req = new PricingWorkspaceService.CopyRequest();
        req.setFromCustomerId(100L);
        req.setToCustomerId(200L);

        CustomerBulkResult result = service.copy(req);

        assertEquals(2, result.created());
        ArgumentCaptor<PriceRequest> created = ArgumentCaptor.forClass(PriceRequest.class);
        verify(customerPriceService, org.mockito.Mockito.times(2)).create(created.capture());
        assertEquals(TODAY, created.getAllValues().get(0).getEffectiveFrom());     // running price starts today
        assertEquals(TODAY.plusDays(3), created.getAllValues().get(1).getEffectiveFrom());
    }

    @Test
    void roundingAndMarginHelpers() {
        assertEquals(new BigDecimal("12.50"), PricingRulesService.roundTo(new BigDecimal("12.37"), new BigDecimal("0.50")));
        assertEquals(new BigDecimal("12.37"), PricingRulesService.roundTo(new BigDecimal("12.3711"), null));
        assertEquals(new BigDecimal("25.00"), PricingRulesService.marginPercent(new BigDecimal("100"), new BigDecimal("75")));
        assertNull(PricingRulesService.marginPercent(new BigDecimal("100"), null));
        assertTrue(new Costs(new BigDecimal("1"), null).hasCost());
    }

    // ------------------------------------------------------------------

    private List<PriceRow> captureUpsert() {
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<PriceRow>> captor = ArgumentCaptor.forClass(List.class);
        verify(levelPriceService).upsert(captor.capture());
        return captor.getValue();
    }

    private BulkLevelRequest bulk(String action, String value, String roundTo, boolean dryRun) {
        BulkLevelRequest req = new BulkLevelRequest();
        req.setPriceLevelIds(List.of(2L));
        req.setAction(action);
        req.setValue(new BigDecimal(value));
        req.setRoundTo(new BigDecimal(roundTo));
        req.setDryRun(dryRun);
        return req;
    }

    private CustomerBulkRequest customerBulk(String method, String value) {
        CustomerBulkRequest req = new CustomerBulkRequest();
        req.setCustomerId(100L);
        req.setMethod(method);
        req.setValue(new BigDecimal(value));
        req.setRoundTo(new BigDecimal("0.01"));
        return req;
    }

    private static ImportRow importRow(int row, String code, String level, String price) {
        ImportRow r = new ImportRow();
        r.setRow(row);
        r.setProductCode(code);
        r.setPriceLevel(level);
        r.setPrice(price);
        return r;
    }

    private PriceLevel level(long id, String name, boolean systemDefault, boolean active) {
        PriceLevel l = new PriceLevel();
        l.setId(id);
        l.setName(name);
        l.setCode(name.toUpperCase());
        l.setSystemDefault(systemDefault);
        l.setActive(active);
        when(levelRepository.findById(id)).thenReturn(Optional.of(l));
        return l;
    }

    private static Product product(long id, String code, String name) {
        Product p = new Product();
        p.setId(id);
        p.setCode(code);
        p.setName(name);
        p.setActive(true);
        return p;
    }

    private static ProductLevelPrice levelPrice(long productId, PriceLevel level, String price) {
        ProductLevelPrice row = new ProductLevelPrice();
        row.setProductId(productId);
        row.setPriceLevelId(level.getId());
        row.setPrice(new BigDecimal(price));
        row.setActive(true);
        return row;
    }

    private static Customer customer(long id, Long levelId, String label) {
        Customer c = new Customer();
        c.setId(id);
        c.setCode("C" + id);
        c.setName("Customer " + id);
        c.setPriceLevelId(levelId);
        c.setPriceList(label);
        return c;
    }

    private static CustomerProductPrice customerPrice(long id, long customerId, long productId, String price, LocalDate from) {
        CustomerProductPrice row = new CustomerProductPrice();
        row.setId(id);
        row.setCustomerId(customerId);
        row.setProductId(productId);
        row.setPrice(new BigDecimal(price));
        row.setEffectiveFrom(from);
        row.setEnabled(true);
        row.setActive(true);
        return row;
    }
}
