package com.billbull.backend.sales.pricing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NavigableMap;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductBranchPricing;
import com.billbull.backend.inventory.product.ProductBranchPricingRepository;
import com.billbull.backend.inventory.product.ProductPacking;
import com.billbull.backend.inventory.product.ProductPackingRepository;
import com.billbull.backend.inventory.product.ProductPricing;
import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.pos.businessdate.BusinessDayClock;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesType;
import com.billbull.backend.sales.pricing.PricingModels.CarriedPrice;
import com.billbull.backend.sales.pricing.PricingModels.Context;
import com.billbull.backend.sales.pricing.PricingModels.DocumentPricing;
import com.billbull.backend.sales.pricing.PricingModels.CustomerPricing;
import com.billbull.backend.sales.pricing.PricingModels.Line;
import com.billbull.backend.sales.pricing.PricingModels.LinePrice;
import com.billbull.backend.sales.pricing.PricingModels.ResolvedLevel;
import com.billbull.backend.sales.pricing.PricingModels.Resolution;
import com.billbull.backend.sales.pricing.PricingModels.SaleUnit;
import com.billbull.backend.sales.pricing.PricingModels.SaleUnits;
import com.billbull.backend.sales.settings.SalesItemPricePolicy;
import com.billbull.backend.sales.settings.SalesPriceResolver;

/**
 * The one place a selling price is resolved — POS, the back-office sales documents and the
 * {@code /api/pricing/resolve} endpoint all come through here, so the till and the back office can
 * never price the same line differently.
 *
 * <p><b>Level precedence</b> (Phase 1):
 * <ol>
 *   <li>the level explicitly chosen on the transaction;</li>
 *   <li>the customer's assigned default level (an inactive one is skipped, with a notice);</li>
 *   <li>the system default level — the product's existing effective selling price.</li>
 * </ol>
 *
 * <p><b>Line price</b> under the resolved level: the level's branch price, then its all-branches
 * price (per base unit, multiplied by the packing conversion for a multi-unit packing), then — when
 * the level has no price for the product — the default-level price. The default-level price is
 * what the system already charged before price levels existed: a multi-unit packing's own price,
 * else the branch-effective pricing master (branch row over global, field by field) read through
 * the configured {@link SalesItemPricePolicy}.
 *
 * <p><b>Customer-specific prices</b> (Phase 2) come first: when the transaction's customer has a
 * negotiated price for the product that applies on the pricing date — its branch row for this
 * branch, else its all-branches row — the line is charged that (per base unit, times the packing
 * conversion), whatever level the transaction is on. So the full line precedence is: a manual price
 * the user typed (kept on save, flagged {@code priceOverridden}, still subject to the existing
 * minimum-price controls) → customer-specific price → the level's price (explicit transaction level,
 * else the customer's default level) → the default price. A negotiated price is a selling price,
 * not a discount: line discounts and tax apply to it exactly as to any other resolved price.
 *
 * <p><b>Quantity tiers</b> (Phase 3) refine the level's price: the lines of one product in a
 * request are added up in base units (paid quantity only, FOC never counts; each line's quantity
 * times its packing conversion, the same conversion the price itself is multiplied by), and the
 * level's tier with the highest threshold at or below that total sets the price per base unit. A
 * branch tier wins over the all-branches tier with the same threshold. Below the first tier the
 * level's own price applies. A multi-unit packing with its own fixed selling price keeps that price.
 * A negotiated customer price still wins over any tier: it is a fixed agreed price, not a discount.
 * So the full order is: manual price → customer-specific price → the level's tier → the level's
 * price (explicit transaction level, else the customer's default level) → the default price.
 */
@Service
public class PricingResolutionService {

    private final PriceLevelRepository levelRepository;
    private final ProductLevelPriceRepository levelPriceRepository;
    private final ProductRepository productRepository;
    private final ProductPricingRepository pricingRepository;
    private final ProductBranchPricingRepository branchPricingRepository;
    private final ProductPackingRepository packingRepository;
    private final CustomerRepository customerRepository;
    /** Null only in tests built without customer prices. */
    private final CustomerProductPriceRepository customerPriceRepository;
    private final BusinessDayClock businessDayClock;
    /** Null only in tests built without quantity tiers. */
    private final ProductQuantityTierRepository tierRepository;

    /** Without customer-specific prices (Phase 1 tests). */
    public PricingResolutionService(PriceLevelRepository levelRepository,
                                    ProductLevelPriceRepository levelPriceRepository,
                                    ProductRepository productRepository,
                                    ProductPricingRepository pricingRepository,
                                    ProductBranchPricingRepository branchPricingRepository,
                                    ProductPackingRepository packingRepository,
                                    CustomerRepository customerRepository) {
        this(levelRepository, levelPriceRepository, productRepository, pricingRepository,
                branchPricingRepository, packingRepository, customerRepository, null, null);
    }

    /** Without quantity tiers (Phase 2 tests). */
    public PricingResolutionService(PriceLevelRepository levelRepository,
                                    ProductLevelPriceRepository levelPriceRepository,
                                    ProductRepository productRepository,
                                    ProductPricingRepository pricingRepository,
                                    ProductBranchPricingRepository branchPricingRepository,
                                    ProductPackingRepository packingRepository,
                                    CustomerRepository customerRepository,
                                    CustomerProductPriceRepository customerPriceRepository,
                                    BusinessDayClock businessDayClock) {
        this(levelRepository, levelPriceRepository, productRepository, pricingRepository,
                branchPricingRepository, packingRepository, customerRepository, customerPriceRepository,
                businessDayClock, null);
    }

    @Autowired
    public PricingResolutionService(PriceLevelRepository levelRepository,
                                    ProductLevelPriceRepository levelPriceRepository,
                                    ProductRepository productRepository,
                                    ProductPricingRepository pricingRepository,
                                    ProductBranchPricingRepository branchPricingRepository,
                                    ProductPackingRepository packingRepository,
                                    CustomerRepository customerRepository,
                                    CustomerProductPriceRepository customerPriceRepository,
                                    BusinessDayClock businessDayClock,
                                    ProductQuantityTierRepository tierRepository) {
        this.tierRepository = tierRepository;
        this.customerPriceRepository = customerPriceRepository;
        this.businessDayClock = businessDayClock;
        this.levelRepository = levelRepository;
        this.levelPriceRepository = levelPriceRepository;
        this.productRepository = productRepository;
        this.pricingRepository = pricingRepository;
        this.branchPricingRepository = branchPricingRepository;
        this.packingRepository = packingRepository;
        this.customerRepository = customerRepository;
    }

    // ------------------------------------------------------------------
    // Level
    // ------------------------------------------------------------------

    /**
     * The level a transaction prices at. An explicitly chosen level must exist and be active — a
     * deactivated level can't be sold at, so that is a 400, not a silent fallback. A customer's
     * default that has since been deactivated falls back to the system default with a notice.
     */
    @Transactional(readOnly = true)
    public ResolvedLevel resolveLevel(Long explicitPriceLevelId, Customer customer) {
        return resolveLevel(explicitPriceLevelId, customer, null);
    }

    /**
     * @param grandfatheredLevelId a level the document already priced at before this save; it stays
     *                             usable when edited even if it has since been deactivated
     */
    @Transactional(readOnly = true)
    public ResolvedLevel resolveLevel(Long explicitPriceLevelId, Customer customer, Long grandfatheredLevelId) {
        if (explicitPriceLevelId != null) {
            PriceLevel level = levelRepository.findById(explicitPriceLevelId)
                    .orElseThrow(() -> new PricingException("Price level " + explicitPriceLevelId + " does not exist."));
            if (!level.isActive() && !explicitPriceLevelId.equals(grandfatheredLevelId)) {
                throw new PricingException("Price level '" + level.getName() + "' is inactive and cannot be used.");
            }
            PriceLevel customerLevel = customerLevel(customer);
            PriceLevelSource source = customerLevel != null && customerLevel.isActive()
                    && Objects.equals(customerLevel.getId(), level.getId())
                    ? PriceLevelSource.CUSTOMER : PriceLevelSource.TRANSACTION;
            return toResolved(level, source, null);
        }

        PriceLevel customerLevel = customerLevel(customer);
        String notice = null;
        if (customerLevel != null) {
            if (customerLevel.isActive()) {
                return toResolved(customerLevel, PriceLevelSource.CUSTOMER, null);
            }
            notice = "Customer's price level '" + customerLevel.getName() + "' is inactive; default prices apply.";
        }
        PriceLevel defaultLevel = levelRepository.findFirstBySystemDefaultTrue().orElse(null);
        if (defaultLevel == null) {
            return new ResolvedLevel(null, null, null, true, PriceLevelSource.DEFAULT, notice);
        }
        return toResolved(defaultLevel, PriceLevelSource.DEFAULT, notice);
    }

    /** The customer's assigned level: by id, else by the legacy price-list name (imports set only that). */
    PriceLevel customerLevel(Customer customer) {
        if (customer == null) return null;
        if (customer.getPriceLevelId() != null) {
            PriceLevel byId = levelRepository.findById(customer.getPriceLevelId()).orElse(null);
            if (byId != null) return byId;
        }
        String legacy = customer.getPriceList();
        if (legacy != null && !legacy.isBlank()) {
            return levelRepository.findFirstByNameIgnoreCase(legacy.trim()).orElse(null);
        }
        return null;
    }

    private static ResolvedLevel toResolved(PriceLevel level, PriceLevelSource source, String notice) {
        return new ResolvedLevel(level.getId(), level.getCode(), level.getName(), level.isSystemDefault(),
                source, notice);
    }

    /** The customer for a context: id first, then code; walk-in / unknown → null. */
    @Transactional(readOnly = true)
    public Customer findCustomer(Long customerId, String customerCode) {
        if (customerId != null) {
            Customer byId = customerRepository.findById(customerId).orElse(null);
            if (byId != null) return byId;
        }
        if (customerCode != null && !customerCode.isBlank() && !"WALK-IN".equalsIgnoreCase(customerCode.trim())) {
            return customerRepository.findByCode(customerCode.trim()).orElse(null);
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Lines
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Resolution resolve(Context context, List<Line> lines) {
        return resolve(context, lines, true);
    }

    /**
     * Like {@link #resolve} but every line is priced on its own quantity — lines of the same
     * product are not added up for quantity tiers, and a line without a quantity gets no tier.
     * For independent price displays such as barcode labels, where two labels of one product are
     * not one purchase.
     */
    @Transactional(readOnly = true)
    public Resolution resolveEach(Context context, List<Line> lines) {
        return resolve(context, lines, false);
    }

    private Resolution resolve(Context context, List<Line> lines, boolean aggregate) {
        Customer customer = findCustomer(context.customerId(), context.customerCode());
        ResolvedLevel level = resolveLevel(context.explicitPriceLevelId(), customer);
        LocalDate date = pricingDate(context.pricingDate());
        List<LinePrice> priced = priceLines(level, context, lines, customer, date, aggregate);
        CustomerPricing customerPricing = null;
        if (customer != null) {
            long live = customerPriceRepository == null || customer.getId() == null ? 0
                    : customerPriceRepository.countByCustomerIdAndIsActiveTrueAndEnabledTrue(customer.getId());
            int applied = (int) priced.stream().filter(p -> p.source() != null && p.source().isCustomerPrice()).count();
            customerPricing = new CustomerPricing(customer.getId(), customer.getCode(), customer.getName(),
                    live, applied, date);
        }
        return new Resolution(level, context.branchId(), priced, customerPricing);
    }

    /** The business day (POS timezone) unless a date is given. */
    public LocalDate pricingDate(LocalDate requested) {
        if (requested != null) return requested;
        return businessDayClock != null ? businessDayClock.now().toLocalDate() : LocalDate.now();
    }

    /**
     * The units a product can be sold in, each priced as a line in that unit would be — so the
     * till's unit picker shows exactly what the line will be charged. Only sale packings
     * ({@code isSale}) are offered; the base unit (conversion 1) is always included. Units are
     * ordered smallest first and de-duplicated by name. Each unit is priced as a line of one of
     * that unit on its own: a quantity tier its base-unit count reaches applies, other cart lines
     * are not counted.
     */
    @Transactional(readOnly = true)
    public SaleUnits saleUnits(Context context, Long productId, String itemCode) {
        Customer customer = findCustomer(context.customerId(), context.customerCode());
        ResolvedLevel level = resolveLevel(context.explicitPriceLevelId(), customer);
        Map<Long, Product> found = loadProducts(List.of(new Line(productId, itemCode, null, null)), context.branchId());
        Product product = found.values().stream().findFirst().orElse(null);
        if (product == null) return new SaleUnits(level, productId, itemCode, List.of());

        List<ProductPacking> offered = new ArrayList<>();
        Set<String> seen = new java.util.HashSet<>();
        packingRepository.findByProductId(product.getId()).stream()
                .filter(pp -> pp.isActive() && pp.getUnit() != null && pp.getUnit().getName() != null
                        && !pp.getUnit().getName().isBlank())
                .filter(pp -> pp.getConversion() != null && pp.getConversion().signum() > 0)
                .filter(pp -> pp.isSale() || pp.getConversion().compareTo(BigDecimal.ONE) == 0)
                .sorted(java.util.Comparator.comparing(ProductPacking::getConversion))
                .forEach(pp -> {
                    if (seen.add(pp.getUnit().getName().trim().toLowerCase(Locale.ROOT))) offered.add(pp);
                });
        if (offered.isEmpty()) return new SaleUnits(level, product.getId(), product.getCode(), List.of());

        List<Line> lines = offered.stream()
                .map(pp -> new Line(product.getId(), product.getCode(), pp.getUnit().getName().trim(), BigDecimal.ONE))
                .toList();
        List<LinePrice> prices = priceLines(level, context, lines, customer, pricingDate(context.pricingDate()), false);
        List<SaleUnit> units = new ArrayList<>(offered.size());
        for (int i = 0; i < offered.size(); i++) {
            ProductPacking pp = offered.get(i);
            LinePrice price = prices.get(i);
            units.add(new SaleUnit(pp.getUnit().getName().trim(), pp.getUnit().getSymbol(), pp.getLevel(),
                    pp.getConversion().stripTrailingZeros(), pp.getConversion().compareTo(BigDecimal.ONE) == 0,
                    price.price(), price.source(), price.levelPriceMissing()));
        }
        return new SaleUnits(level, product.getId(), product.getCode(), units);
    }

    /**
     * @param aggregate add up the lines of one product to find its quantity tier (a cart or a
     *                  document); false prices every line on its own quantity (the unit picker)
     */
    private List<LinePrice> priceLines(ResolvedLevel level, Context context, List<Line> lines,
                                       Customer customer, LocalDate date, boolean aggregate) {
        if (lines == null || lines.isEmpty()) return List.of();
        Long branchId = context.branchId();
        SalesItemPricePolicy policy = context.basePolicy() != null ? context.basePolicy() : SalesItemPricePolicy.RETAIL;

        Map<Long, Product> productsById = loadProducts(lines, branchId);
        Map<String, Product> productsByCode = new HashMap<>();
        productsById.values().forEach(p -> {
            if (p.getCode() != null) productsByCode.putIfAbsent(p.getCode().toUpperCase(Locale.ROOT), p);
        });
        List<Long> productIds = new ArrayList<>(productsById.keySet());

        Map<Long, ProductPricing> pricing = productIds.isEmpty() ? Map.of()
                : pricingRepository.findByProductIdIn(productIds).stream()
                        .filter(pr -> pr.getProduct() != null && pr.getProduct().getId() != null)
                        .collect(Collectors.toMap(pr -> pr.getProduct().getId(), Function.identity(), (a, b) -> a));
        Map<Long, ProductBranchPricing> branchPricing = branchId == null || productIds.isEmpty() ? Map.of()
                : branchPricingRepository.findByProductIdIn(productIds).stream()
                        .filter(bp -> bp.getProduct() != null && bp.getBranch() != null
                                && branchId.equals(bp.getBranch().getId()))
                        .collect(Collectors.toMap(bp -> bp.getProduct().getId(), Function.identity(), (a, b) -> a));
        Map<Long, List<ProductPacking>> packings = productIds.isEmpty() ? Map.of()
                : packingRepository.findByProductIdIn(productIds).stream()
                        .filter(pp -> pp.getProduct() != null && pp.isActive())
                        .collect(Collectors.groupingBy(pp -> pp.getProduct().getId()));

        boolean levelPriced = level.id() != null && !level.systemDefault();
        Map<Long, ProductLevelPrice> levelGlobal = new HashMap<>();
        Map<Long, ProductLevelPrice> levelBranch = new HashMap<>();
        if (levelPriced && !productIds.isEmpty()) {
            for (ProductLevelPrice row : levelPriceRepository.findByProductIdInAndPriceLevelId(productIds, level.id())) {
                if (!row.isActive() || row.getPrice() == null) continue;
                if (row.getBranchId() == null) {
                    levelGlobal.put(row.getProductId(), row);
                } else if (row.getBranchId().equals(branchId)) {
                    levelBranch.put(row.getProductId(), row);
                }
            }
        }

        // The customer's negotiated prices for these products: one query for the whole cart. Only
        // rows applying on the pricing date count; this branch's row wins over the all-branches row.
        Map<Long, CustomerProductPrice> customerGlobal = new HashMap<>();
        Map<Long, CustomerProductPrice> customerBranch = new HashMap<>();
        if (customer != null && customer.getId() != null && customerPriceRepository != null && !productIds.isEmpty()) {
            for (CustomerProductPrice row : customerPriceRepository
                    .findByCustomerIdAndProductIdInAndIsActiveTrue(customer.getId(), productIds)) {
                if (!row.appliesOn(date)) continue;
                if (row.getBranchId() == null) {
                    customerGlobal.merge(row.getProductId(), row, PricingResolutionService::newerMapping);
                } else if (row.getBranchId().equals(branchId)) {
                    customerBranch.merge(row.getProductId(), row, PricingResolutionService::newerMapping);
                }
            }
        }

        // Quantity tiers of the resolved level for these products: one query for the whole cart,
        // merged per threshold with this branch's tier over the all-branches one.
        Map<Long, NavigableMap<BigDecimal, ProductQuantityTier>> tiers = loadTiers(productIds, level.id(), branchId);

        List<Product> lineProducts = new ArrayList<>(lines.size());
        for (Line line : lines) {
            Product product = line.productId() != null ? productsById.get(line.productId()) : null;
            if (product == null && line.itemCode() != null) {
                product = productsByCode.get(line.itemCode().trim().toUpperCase(Locale.ROOT));
            }
            lineProducts.add(product);
        }
        // The paid base-unit quantity per tiered product across the request, so splitting a
        // product over several lines can neither dodge nor unlock a tier.
        Map<Long, BigDecimal> eligibleByProduct = new HashMap<>();
        if (aggregate && !tiers.isEmpty()) {
            for (int i = 0; i < lines.size(); i++) {
                Product product = lineProducts.get(i);
                if (product == null || !tiers.containsKey(product.getId())) continue;
                BigDecimal baseQty = baseQuantity(lines.get(i), packings.getOrDefault(product.getId(), List.of()));
                if (baseQty != null) eligibleByProduct.merge(product.getId(), baseQty, BigDecimal::add);
            }
        }

        List<LinePrice> out = new ArrayList<>(lines.size());
        for (int i = 0; i < lines.size(); i++) {
            Line line = lines.get(i);
            Product product = lineProducts.get(i);
            if (product == null) {
                out.add(new LinePrice(line.productId(), line.itemCode(), line.unit(), null, null,
                        PriceSource.NONE, level.id(), level.name(), false));
                continue;
            }
            List<ProductPacking> productPackings = packings.getOrDefault(product.getId(), List.of());
            LinePrice levelPrice = priceLine(line, product, level, levelPriced, policy,
                    pricing.get(product.getId()), branchPricing.get(product.getId()), productPackings,
                    levelBranch.get(product.getId()), levelGlobal.get(product.getId()));
            NavigableMap<BigDecimal, ProductQuantityTier> productTiers = tiers.get(product.getId());
            if (productTiers != null) {
                BigDecimal eligible = aggregate ? eligibleByProduct.get(product.getId())
                        : baseQuantity(line, productPackings);
                levelPrice = applyTier(levelPrice, productTiers, eligible, productPackings, line.unit());
            }
            CustomerProductPrice negotiated = customerBranch.containsKey(product.getId())
                    ? customerBranch.get(product.getId()) : customerGlobal.get(product.getId());
            out.add(negotiated == null ? levelPrice
                    : customerPriceLine(levelPrice, negotiated, productPackings, line.unit()));
        }
        return out;
    }

    /**
     * One fixed pricing-master field per line — e.g. the wholesale or maximum price — branch row
     * over global for that field, per base unit times the packing conversion. No fallback to
     * another field: a line whose field is not set (or not positive) comes back with a null price
     * and source {@link PriceSource#NONE}. A packing's own selling price is the default-level price
     * and is not used here. Same product visibility (branch isolation) as {@link #resolve}.
     */
    @Transactional(readOnly = true)
    public List<LinePrice> resolveFixedField(Long branchId, FixedPriceField field, List<Line> lines) {
        if (lines == null || lines.isEmpty() || field == null) return List.of();
        List<Product> lineProducts = matchProducts(lines, branchId);
        List<Long> productIds = lineProducts.stream().filter(Objects::nonNull).map(Product::getId)
                .distinct().toList();
        Map<Long, ProductPricing> pricing = productIds.isEmpty() ? Map.of()
                : pricingRepository.findByProductIdIn(productIds).stream()
                        .filter(pr -> pr.getProduct() != null && pr.getProduct().getId() != null)
                        .collect(Collectors.toMap(pr -> pr.getProduct().getId(), Function.identity(), (a, b) -> a));
        Map<Long, ProductBranchPricing> branchPricing = branchId == null || productIds.isEmpty() ? Map.of()
                : branchPricingRepository.findByProductIdIn(productIds).stream()
                        .filter(bp -> bp.getProduct() != null && bp.getBranch() != null
                                && branchId.equals(bp.getBranch().getId()))
                        .collect(Collectors.toMap(bp -> bp.getProduct().getId(), Function.identity(), (a, b) -> a));
        Map<Long, List<ProductPacking>> packings = productIds.isEmpty() ? Map.of()
                : packingRepository.findByProductIdIn(productIds).stream()
                        .filter(pp -> pp.getProduct() != null && pp.isActive())
                        .collect(Collectors.groupingBy(pp -> pp.getProduct().getId()));

        List<LinePrice> out = new ArrayList<>(lines.size());
        for (int i = 0; i < lines.size(); i++) {
            Line line = lines.get(i);
            Product product = lineProducts.get(i);
            if (product == null) {
                out.add(new LinePrice(line.productId(), line.itemCode(), line.unit(), null, null,
                        PriceSource.NONE, null, null, false));
                continue;
            }
            ProductPacking packing = matchMultiUnitPacking(packings.getOrDefault(product.getId(), List.of()), line.unit());
            BigDecimal conversion = packing != null ? packing.getConversion() : BigDecimal.ONE;
            ProductPricing global = pricing.get(product.getId());
            ProductBranchPricing branchRow = branchPricing.get(product.getId());
            BigDecimal perBase = field.read(effectivePricing(global, branchRow));
            BigDecimal price = isPositive(perBase) ? scale(perBase.multiply(conversion)) : null;
            PriceSource source = price == null ? PriceSource.NONE
                    : (branchRow != null && !Objects.equals(perBase, field.read(global))
                            ? PriceSource.BRANCH_PRICE : PriceSource.BASE_PRICE);
            out.add(new LinePrice(product.getId(), product.getCode(), line.unit(), price, price, source,
                    null, null, false, price, source, null, null, null, null, price, source,
                    null, null, null, null, conversion.stripTrailingZeros()));
        }
        return out;
    }

    /**
     * The product each line names — by id, else by item code — or null when it does not exist or
     * is not visible in {@code branchId} (the same branch isolation and code tie-break as pricing).
     */
    @Transactional(readOnly = true)
    public List<Product> matchProducts(List<Line> lines, Long branchId) {
        if (lines == null || lines.isEmpty()) return List.of();
        Map<Long, Product> productsById = loadProducts(lines, branchId);
        Map<String, Product> productsByCode = new HashMap<>();
        productsById.values().forEach(p -> {
            if (p.getCode() != null) productsByCode.putIfAbsent(p.getCode().toUpperCase(Locale.ROOT), p);
        });
        List<Product> out = new ArrayList<>(lines.size());
        for (Line line : lines) {
            Product product = line.productId() != null ? productsById.get(line.productId()) : null;
            if (product == null && line.itemCode() != null) {
                product = productsByCode.get(line.itemCode().trim().toUpperCase(Locale.ROOT));
            }
            out.add(product);
        }
        return out;
    }

    /**
     * The line at the customer's negotiated price. It replaces the level / default price (it is
     * not a discount on it); what the line would otherwise cost is kept as the fallback price.
     */
    private static LinePrice customerPriceLine(LinePrice levelPrice, CustomerProductPrice row,
                                               List<ProductPacking> packings, String unit) {
        ProductPacking packing = matchMultiUnitPacking(packings, unit);
        BigDecimal conversion = packing != null ? packing.getConversion() : BigDecimal.ONE;
        PriceSource source = row.getBranchId() != null ? PriceSource.CUSTOMER_SPECIFIC_BRANCH : PriceSource.CUSTOMER_SPECIFIC;
        // No tier marker: a negotiated price is fixed whatever the quantity.
        return new LinePrice(levelPrice.productId(), levelPrice.itemCode(), levelPrice.unit(),
                scale(row.getPrice().multiply(conversion)), levelPrice.basePrice(), source,
                levelPrice.priceLevelId(), levelPrice.priceLevelName(), false,
                levelPrice.price(), levelPrice.source(),
                row.getId(), row.getBranchId(), row.getEffectiveFrom(), row.getEffectiveTo(),
                levelPrice.untieredPrice(), levelPrice.untieredSource(), null, null, null,
                levelPrice.eligibleQuantity(), levelPrice.conversion());
    }

    // ------------------------------------------------------------------
    // Quantity tiers
    // ------------------------------------------------------------------

    /** Live tiers per product for one level, keyed by threshold; this branch's row over the global one. */
    private Map<Long, NavigableMap<BigDecimal, ProductQuantityTier>> loadTiers(List<Long> productIds, Long levelId,
                                                                              Long branchId) {
        if (tierRepository == null || levelId == null || productIds.isEmpty()) return Map.of();
        Map<Long, NavigableMap<BigDecimal, ProductQuantityTier>> out = new HashMap<>();
        for (ProductQuantityTier t : tierRepository.findByProductIdInAndPriceLevelIdAndIsActiveTrue(productIds, levelId)) {
            if (!t.isActive() || t.getMinQuantity() == null || t.getPrice() == null
                    || t.getMinQuantity().signum() <= 0 || t.getPrice().signum() <= 0) continue;
            if (t.getBranchId() != null && !t.getBranchId().equals(branchId)) continue;
            NavigableMap<BigDecimal, ProductQuantityTier> byThreshold =
                    out.computeIfAbsent(t.getProductId(), k -> new TreeMap<>());
            BigDecimal threshold = t.getMinQuantity().stripTrailingZeros();
            ProductQuantityTier current = byThreshold.get(threshold);
            if (current == null || (current.getBranchId() == null && t.getBranchId() != null)) {
                byThreshold.put(threshold, t);
            }
        }
        return out;
    }

    /** {@code line}'s paid quantity in base units (quantity × packing conversion), or null. */
    private static BigDecimal baseQuantity(Line line, List<ProductPacking> packings) {
        if (line.quantity() == null || line.quantity().signum() <= 0) return null;
        ProductPacking packing = matchMultiUnitPacking(packings, line.unit());
        BigDecimal conversion = packing != null ? packing.getConversion() : BigDecimal.ONE;
        return line.quantity().multiply(conversion);
    }

    /**
     * The level price refined by the tier that {@code eligible} base units reach. A packing with
     * its own fixed selling price is not tiered: it is a deliberate price for that unit.
     */
    private static LinePrice applyTier(LinePrice levelPrice, NavigableMap<BigDecimal, ProductQuantityTier> tiers,
                                       BigDecimal eligible, List<ProductPacking> packings, String unit) {
        ProductPacking packing = matchMultiUnitPacking(packings, unit);
        BigDecimal conversion = packing != null ? packing.getConversion() : BigDecimal.ONE;
        Map.Entry<BigDecimal, ProductQuantityTier> hit = eligible == null
                || levelPrice.source() == PriceSource.PACKING_PRICE ? null : tiers.floorEntry(eligible);
        BigDecimal eligibleOut = eligible != null ? eligible.stripTrailingZeros() : null;
        if (hit == null) {
            return new LinePrice(levelPrice.productId(), levelPrice.itemCode(), levelPrice.unit(),
                    levelPrice.price(), levelPrice.basePrice(), levelPrice.source(), levelPrice.priceLevelId(),
                    levelPrice.priceLevelName(), levelPrice.levelPriceMissing(),
                    levelPrice.fallbackPrice(), levelPrice.fallbackSource(), null, null, null, null,
                    levelPrice.price(), levelPrice.source(), null, null, null,
                    eligibleOut, conversion.stripTrailingZeros());
        }
        ProductQuantityTier tier = hit.getValue();
        PriceSource source = tier.getBranchId() != null ? PriceSource.QUANTITY_TIER_BRANCH : PriceSource.QUANTITY_TIER;
        BigDecimal price = scale(tier.getPrice().multiply(conversion));
        return new LinePrice(levelPrice.productId(), levelPrice.itemCode(), levelPrice.unit(),
                price, levelPrice.basePrice(), source, levelPrice.priceLevelId(), levelPrice.priceLevelName(),
                false, price, source, null, null, null, null,
                levelPrice.price(), levelPrice.source(), tier.getId(), tier.getBranchId(),
                tier.getMinQuantity().stripTrailingZeros(), eligibleOut, conversion.stripTrailingZeros());
    }

    /** Overlapping live mappings are refused on write; should two exist, the later start (then id) wins. */
    private static CustomerProductPrice newerMapping(CustomerProductPrice a, CustomerProductPrice b) {
        int byStart = Comparator.nullsFirst(Comparator.<LocalDate>naturalOrder())
                .compare(a.getEffectiveFrom(), b.getEffectiveFrom());
        if (byStart != 0) return byStart > 0 ? a : b;
        long ida = a.getId() != null ? a.getId() : Long.MIN_VALUE;
        long idb = b.getId() != null ? b.getId() : Long.MIN_VALUE;
        return ida >= idb ? a : b;
    }

    private LinePrice priceLine(Line line, Product product, ResolvedLevel level, boolean levelPriced,
                                SalesItemPricePolicy policy, ProductPricing pricing,
                                ProductBranchPricing branchRow, List<ProductPacking> packings,
                                ProductLevelPrice levelBranchRow, ProductLevelPrice levelGlobalRow) {
        ProductPacking packing = matchMultiUnitPacking(packings, line.unit());
        BigDecimal conversion = packing != null ? packing.getConversion() : BigDecimal.ONE;

        // Default-level price — exactly what the system charged before price levels.
        BigDecimal basePrice;
        PriceSource baseSource;
        if (packing != null && isPositive(packing.getPrice())) {
            basePrice = packing.getPrice();
            baseSource = PriceSource.PACKING_PRICE;
        } else {
            ProductPricing effective = effectivePricing(pricing, branchRow);
            BigDecimal perBase = SalesPriceResolver.resolve(effective, policy);
            BigDecimal globalOnly = SalesPriceResolver.resolve(pricing, policy);
            basePrice = perBase != null ? scale(perBase.multiply(conversion)) : null;
            baseSource = basePrice == null ? PriceSource.NONE
                    : (branchRow != null && !Objects.equals(perBase, globalOnly) ? PriceSource.BRANCH_PRICE
                            : PriceSource.BASE_PRICE);
        }

        if (levelPriced) {
            ProductLevelPrice row = levelBranchRow != null ? levelBranchRow : levelGlobalRow;
            if (row != null) {
                PriceSource source = levelBranchRow != null ? PriceSource.PRICE_LEVEL_BRANCH : PriceSource.PRICE_LEVEL;
                return new LinePrice(product.getId(), product.getCode(), line.unit(),
                        scale(row.getPrice().multiply(conversion)), basePrice, source,
                        level.id(), level.name(), false);
            }
            return new LinePrice(product.getId(), product.getCode(), line.unit(), basePrice, basePrice,
                    baseSource, level.id(), level.name(), true);
        }
        return new LinePrice(product.getId(), product.getCode(), line.unit(), basePrice, basePrice,
                baseSource, level.id(), level.name(), false);
    }

    /** A packing for {@code unit} that is more than one base unit, or null for the base unit. */
    private static ProductPacking matchMultiUnitPacking(List<ProductPacking> packings, String unit) {
        if (unit == null || unit.isBlank() || packings == null) return null;
        for (ProductPacking pp : packings) {
            if (pp.getUnit() == null || pp.getUnit().getName() == null) continue;
            if (!unit.trim().equalsIgnoreCase(pp.getUnit().getName().trim())) continue;
            BigDecimal conv = pp.getConversion();
            if (conv != null && conv.signum() > 0 && conv.compareTo(BigDecimal.ONE) != 0) return pp;
            return null;
        }
        return null;
    }

    /** Branch row over global, field by field — the same merge ProductService uses for display. */
    static ProductPricing effectivePricing(ProductPricing base, ProductBranchPricing branch) {
        if (branch == null) return base;
        ProductPricing merged = new ProductPricing();
        if (base != null) {
            merged.setRetailPrice(base.getRetailPrice());
            merged.setMinPrice(base.getMinPrice());
            merged.setMaxPrice(base.getMaxPrice());
            merged.setWholesalePrice(base.getWholesalePrice());
            merged.setOnlinePrice(base.getOnlinePrice());
            merged.setCost(base.getCost());
        }
        if (branch.getRetailPrice() != null) merged.setRetailPrice(branch.getRetailPrice());
        if (branch.getMinPrice() != null) merged.setMinPrice(branch.getMinPrice());
        if (branch.getMaxPrice() != null) merged.setMaxPrice(branch.getMaxPrice());
        if (branch.getWholesalePrice() != null) merged.setWholesalePrice(branch.getWholesalePrice());
        if (branch.getOnlinePrice() != null) merged.setOnlinePrice(branch.getOnlinePrice());
        if (branch.getCost() != null) merged.setCost(branch.getCost());
        return merged;
    }

    /**
     * Products for the lines. A product owned by a different branch is not priced for this one —
     * branch isolation: the till of branch A must not resolve branch B's private catalogue.
     */
    private Map<Long, Product> loadProducts(List<Line> lines, Long branchId) {
        Set<Long> ids = new LinkedHashSet<>();
        Set<String> codes = new LinkedHashSet<>();
        for (Line line : lines) {
            if (line.productId() != null) ids.add(line.productId());
            else if (line.itemCode() != null && !line.itemCode().isBlank()) codes.add(line.itemCode().trim());
        }
        Map<Long, Product> out = new HashMap<>();
        if (!ids.isEmpty()) {
            for (Product p : productRepository.findAllById(ids)) {
                if (visibleIn(p, branchId)) out.put(p.getId(), p);
            }
        }
        if (!codes.isEmpty()) {
            Map<String, Product> byCode = new HashMap<>();
            for (Product p : productRepository.findByCodeIn(new ArrayList<>(codes))) {
                if (!visibleIn(p, branchId) || p.getCode() == null) continue;
                Product current = byCode.get(p.getCode());
                // Same tie-break as the POS checkout: the branch's own product over a shared one.
                if (current == null || (!ownedBy(current, branchId) && ownedBy(p, branchId))) {
                    byCode.put(p.getCode(), p);
                }
            }
            byCode.values().forEach(p -> out.putIfAbsent(p.getId(), p));
        }
        return out;
    }

    private static boolean visibleIn(Product p, Long branchId) {
        if (p == null || !p.isActive()) return false;
        if (p.getBranch() == null || p.getBranch().getId() == null || branchId == null) return true;
        return branchId.equals(p.getBranch().getId());
    }

    private static boolean ownedBy(Product p, Long branchId) {
        return branchId != null && p.getBranch() != null && branchId.equals(p.getBranch().getId());
    }

    // ------------------------------------------------------------------
    // Invoices
    // ------------------------------------------------------------------

    /**
     * Prices an invoice being saved and records how each line was priced.
     *
     * <p>Sets the header's level (validating an explicitly chosen one), and on every non-voided line
     * stamps the level, the price source and the resolved price. A line arriving without a price is
     * given the resolved one. A line whose price differs from the resolved one keeps its price — the
     * existing manual-override behaviour, still subject to the existing minimum-price controls — and
     * is flagged {@code priceOverridden}. The charged price lives on the line, so later changes to
     * products or levels never alter a saved invoice.
     *
     * @param branchId the invoice's trusted branch (see SalesInvoiceService.resolveBranchForSave)
     */
    @Transactional(readOnly = true)
    public ResolvedLevel applyToInvoice(SalesInvoice invoice, Long branchId, SalesItemPricePolicy backOfficePolicy) {
        return applyToInvoice(invoice, branchId, backOfficePolicy, null);
    }

    /** @param previousLevelId the level the saved invoice had, which an edit may keep even if since deactivated */
    @Transactional(readOnly = true)
    public ResolvedLevel applyToInvoice(SalesInvoice invoice, Long branchId, SalesItemPricePolicy backOfficePolicy,
                                        Long previousLevelId) {
        return applyToInvoice(invoice, branchId, backOfficePolicy, previousLevelId, List.of(), List.of());
    }

    /**
     * @param previous the invoice's lines as last saved (an unchanged line keeps its pricing record)
     * @param source   the lines of the order / quotation / pro-forma it was converted from
     */
    @Transactional(readOnly = true)
    public ResolvedLevel applyToInvoice(SalesInvoice invoice, Long branchId, SalesItemPricePolicy backOfficePolicy,
                                        Long previousLevelId, List<CarriedPrice> previous, List<CarriedPrice> source) {
        // The till has always sold at the retail field; the back office honours Sales Settings.
        SalesItemPricePolicy policy = SalesType.POS_SALE.equals(invoice.getSalesType())
                ? SalesItemPricePolicy.RETAIL
                : (backOfficePolicy != null ? backOfficePolicy : SalesItemPricePolicy.RETAIL);
        // Negotiated prices must be valid on the invoice's date (the business day when it has none).
        ResolvedLevel level = applyToLines(new DocumentPricing(null, invoice.getCustomerCode(),
                invoice.getPriceLevelId(), previousLevelId, branchId, policy, invoice.getInvoiceDate(), true,
                previous, source), invoice.getItems());
        invoice.setPriceLevelId(level.id());
        invoice.setPriceLevelName(level.name());
        invoice.setPriceLevelSource(level.source() != null ? level.source().name() : null);
        return level;
    }

    /**
     * Prices any sales document being saved (invoice, quotation, sales order, pro-forma) and records
     * how each line was priced. The server never trusts a client's price source, level, customer
     * price id or tier: every stamp is recomputed here. The caller writes the returned level onto
     * the document header.
     *
     * <p>Per non-voided line, in order:
     * <ol>
     *   <li><b>unchanged since the last save</b> (same item, unit, quantity and price as a saved line):
     *       its pricing record is kept as it was. An edit never re-prices what was already agreed,
     *       even if the customer's negotiated price or a tier has changed since.</li>
     *   <li><b>carried from the source document</b> (same item, unit and price as a line of the
     *       quotation / order / pro-forma it was converted from): priced by that document, stamped
     *       {@link PriceSource#SOURCE_DOCUMENT} and not an override.</li>
     *   <li>otherwise <b>resolved</b> now: a line without a price is given the resolved one (when
     *       {@code fillMissingPrices}); a line whose price differs keeps it, flagged
     *       {@code priceOverridden} — the existing manual-override behaviour, still subject to the
     *       existing minimum-price controls.</li>
     * </ol>
     * Quantity tiers count every non-voided line of the product (paid quantity, base units).
     */
    @Transactional(readOnly = true)
    public ResolvedLevel applyToLines(DocumentPricing doc, List<? extends PriceStampedLine> items) {
        Customer customer = findCustomer(doc.customerId(), doc.customerCode());
        ResolvedLevel level = resolveLevel(doc.explicitPriceLevelId(), customer, doc.previousLevelId());
        if (items == null || items.isEmpty()) return level;

        SalesItemPricePolicy policy = doc.policy() != null ? doc.policy() : SalesItemPricePolicy.RETAIL;
        LocalDate date = pricingDate(doc.date());
        Context context = new Context(doc.branchId(), level.id(), null, null, policy, date);

        List<PriceStampedLine> priced = new ArrayList<>();
        List<Line> lines = new ArrayList<>();
        for (PriceStampedLine item : items) {
            if (item == null || item.pricingVoided() || item.getItemCode() == null || item.getItemCode().isBlank()) {
                continue;
            }
            priced.add(item);
            lines.add(new Line(null, item.getItemCode(), item.getUnit(), item.pricingQuantity()));
        }
        List<LinePrice> results = priceLines(level, context, lines, customer, date, true);
        List<CarriedPrice> previousPool = new ArrayList<>(doc.previous() != null ? doc.previous() : List.of());
        List<CarriedPrice> sourceLines = doc.source() != null ? doc.source() : List.of();

        for (int i = 0; i < priced.size(); i++) {
            PriceStampedLine item = priced.get(i);
            LinePrice result = results.get(i);

            CarriedPrice unchanged = takeMatch(previousPool, item, true);
            if (unchanged != null) {
                stampCarried(item, unchanged, unchanged.priceSource(), unchanged.resolvedUnitPrice(),
                        unchanged.priceOverridden());
                continue;
            }
            CarriedPrice fromSource = findMatch(sourceLines, item);
            if (fromSource != null) {
                stampCarried(item, fromSource, PriceSource.SOURCE_DOCUMENT.name(), scale(fromSource.price()), false);
                if (item.getPriceLevelId() == null) {
                    item.setPriceLevelId(level.id());
                    item.setPriceLevelName(level.name());
                }
                continue;
            }

            item.setPriceLevelId(level.id());
            item.setPriceLevelName(level.name());
            item.setPriceSource(result.source().name());
            item.setResolvedUnitPrice(result.price());
            item.setCustomerPriceId(result.customerPriceId());
            item.setQuantityTierId(result.quantityTierId());
            item.setTierMinQuantity(result.tierMinQuantity());
            item.setTierEligibleQuantity(result.tierApplied() ? result.eligibleQuantity() : null);
            if (doc.fillMissingPrices() && item.getPrice() == null && result.price() != null) {
                item.setPrice(result.price());
            }
            item.setPriceOverridden(result.price() != null && item.getPrice() != null
                    && scale(item.getPrice()).compareTo(result.price()) != 0);
        }
        return level;
    }

    private static void stampCarried(PriceStampedLine item, CarriedPrice from, String source,
                                     BigDecimal resolved, Boolean overridden) {
        item.setPriceLevelId(from.priceLevelId());
        item.setPriceLevelName(from.priceLevelName());
        item.setPriceSource(source);
        item.setResolvedUnitPrice(resolved);
        item.setPriceOverridden(overridden);
        item.setCustomerPriceId(from.customerPriceId());
        item.setQuantityTierId(from.quantityTierId());
        item.setTierMinQuantity(from.tierMinQuantity());
        item.setTierEligibleQuantity(from.tierEligibleQuantity());
    }

    /** Removes and returns the first carried line with the same item, unit, price (and quantity). */
    private static CarriedPrice takeMatch(List<CarriedPrice> pool, PriceStampedLine item, boolean sameQuantity) {
        for (int i = 0; i < pool.size(); i++) {
            CarriedPrice c = pool.get(i);
            if (sameLine(c, item) && (!sameQuantity || sameAmount(c.quantity(), item.pricingQuantity()))) {
                return pool.remove(i);
            }
        }
        return null;
    }

    private static CarriedPrice findMatch(List<CarriedPrice> pool, PriceStampedLine item) {
        for (CarriedPrice c : pool) {
            if (sameLine(c, item)) return c;
        }
        return null;
    }

    private static boolean sameLine(CarriedPrice c, PriceStampedLine item) {
        if (c == null || c.itemCode() == null || c.price() == null || item.getPrice() == null) return false;
        if (!c.itemCode().trim().equalsIgnoreCase(item.getItemCode().trim())) return false;
        String a = c.unit() == null ? "" : c.unit().trim();
        String b = item.getUnit() == null ? "" : item.getUnit().trim();
        return a.equalsIgnoreCase(b) && scale(c.price()).compareTo(scale(item.getPrice())) == 0;
    }

    private static boolean sameAmount(BigDecimal a, BigDecimal b) {
        if (a == null || b == null) return a == b;
        return a.compareTo(b) == 0;
    }

    // ------------------------------------------------------------------

    private static boolean isPositive(BigDecimal v) {
        return v != null && v.signum() > 0;
    }

    private static BigDecimal scale(BigDecimal v) {
        return v == null ? null : v.setScale(2, RoundingMode.HALF_UP);
    }
}
