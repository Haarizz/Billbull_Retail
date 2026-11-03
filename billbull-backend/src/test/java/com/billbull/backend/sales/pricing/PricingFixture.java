package com.billbull.backend.sales.pricing;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

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

/**
 * A real {@link PricingResolutionService} over in-memory repositories, for the sales-document
 * pricing tests (Pricing Phase 2.1 / 3).
 *
 * <p>Default data: Retail (default level, id 1) and Wholesale (id 2); product A (id 10) retails
 * at 30 and wholesales at 27, with Wholesale tiers 20+ → 25 and 100+ → 23; product B (id 11)
 * retails at 50 and wholesales at 45. Customer ABC (Wholesale) has a negotiated 25 on A for all
 * branches; customer TRADER is on Wholesale with no negotiated prices. A BOX of A is 12.
 */
public class PricingFixture {

    public static final long BRANCH_A = 1L;
    public static final long BRANCH_B = 2L;
    public static final LocalDate TODAY = LocalDate.of(2026, 11, 2);

    public final PriceLevelRepository levelRepository = mock(PriceLevelRepository.class);
    public final ProductLevelPriceRepository levelPriceRepository = mock(ProductLevelPriceRepository.class);
    public final ProductRepository productRepository = mock(ProductRepository.class);
    public final ProductPricingRepository pricingRepository = mock(ProductPricingRepository.class);
    public final ProductBranchPricingRepository branchPricingRepository = mock(ProductBranchPricingRepository.class);
    public final ProductPackingRepository packingRepository = mock(ProductPackingRepository.class);
    public final CustomerRepository customerRepository = mock(CustomerRepository.class);
    public final CustomerProductPriceRepository customerPriceRepository = mock(CustomerProductPriceRepository.class);
    public final ProductQuantityTierRepository tierRepository = mock(ProductQuantityTierRepository.class);
    public final BusinessDayClock clock = mock(BusinessDayClock.class);

    public final Map<Long, PriceLevel> levels = new HashMap<>();
    public final List<Product> products = new ArrayList<>();
    public final List<ProductPricing> pricings = new ArrayList<>();
    public final List<ProductPacking> packings = new ArrayList<>();
    public final List<ProductLevelPrice> levelPrices = new ArrayList<>();
    public final List<CustomerProductPrice> customerPrices = new ArrayList<>();
    public final List<ProductQuantityTier> tiers = new ArrayList<>();
    private long nextId = 500;

    public final PricingResolutionService service;
    public final PriceLevel retail;
    public final PriceLevel wholesale;
    public final Customer abc;
    public final Customer trader;
    public final CustomerProductPrice abcOnA;

    public PricingFixture() {
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
        Product a = product(10L, "A", "30.00");
        product(11L, "B", "50.00");
        levelPrice(10L, wholesale, "27.00");
        levelPrice(11L, wholesale, "45.00");
        packing(a, "BOX", "12");
        tier(10L, wholesale, null, "20", "25.00");
        tier(10L, wholesale, null, "100", "23.00");
        abc = customer(501L, "ABC", wholesale.getId());
        trader = customer(502L, "TRADER", wholesale.getId());
        abcOnA = mapping(abc, 10L, null, "25.00");
    }

    public PriceLevel level(long id, String name, boolean systemDefault) {
        PriceLevel l = new PriceLevel();
        l.setId(id);
        l.setName(name);
        l.setCode(name.toUpperCase());
        l.setSystemDefault(systemDefault);
        l.setActive(true);
        levels.put(id, l);
        return l;
    }

    public Product product(long id, String code, String retailPrice) {
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

    public void packing(Product p, String unitName, String conversion) {
        ProductPacking pp = new ProductPacking();
        pp.setProduct(p);
        pp.setUnit(new Unit(unitName, unitName, null));
        pp.setConversion(new BigDecimal(conversion));
        packings.add(pp);
    }

    public void levelPrice(long productId, PriceLevel level, String price) {
        ProductLevelPrice r = new ProductLevelPrice();
        r.setProductId(productId);
        r.setPriceLevelId(level.getId());
        r.setPrice(new BigDecimal(price));
        levelPrices.add(r);
    }

    public ProductQuantityTier tier(long productId, PriceLevel level, Long branchId, String minQty, String price) {
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

    public Customer customer(long id, String code, Long levelId) {
        Customer c = new Customer();
        c.setId(id);
        c.setCode(code);
        c.setName("Customer " + code);
        c.setPriceLevelId(levelId);
        when(customerRepository.findByCode(eq(code))).thenReturn(Optional.of(c));
        when(customerRepository.findById(eq(id))).thenReturn(Optional.of(c));
        return c;
    }

    public CustomerProductPrice mapping(Customer customer, long productId, Long branchId, String price) {
        CustomerProductPrice r = new CustomerProductPrice();
        r.setId(nextId++);
        r.setCustomerId(customer.getId());
        r.setProductId(productId);
        r.setBranchId(branchId);
        r.setPrice(new BigDecimal(price));
        r.setEffectiveFrom(TODAY.minusDays(30));
        customerPrices.add(r);
        return r;
    }
}
