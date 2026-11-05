package com.billbull.backend.sales.pricing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductCostMasking;
import com.billbull.backend.inventory.product.ProductMediaRepository;
import com.billbull.backend.inventory.product.ProductPriceChange;
import com.billbull.backend.inventory.product.ProductPriceChangeRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.pricing.CustomerProductPriceService.PriceRequest;
import com.billbull.backend.sales.pricing.CustomerProductPriceService.PriceResponse;
import com.billbull.backend.sales.pricing.PricingRulesService.Costs;
import com.billbull.backend.sales.pricing.ProductLevelPriceService.PriceRow;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.security.BranchScope;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.util.PageResponse;

/**
 * The Price Levels workspace: the product × level price matrix with margins, the summary cards,
 * bulk changes and import of level prices, price history, assigning levels to customers (a
 * "customer price list" is a price level customers are put on), and bulk / copied negotiated
 * customer prices.
 *
 * <p>Every write goes through {@link ProductLevelPriceService} or
 * {@link CustomerProductPriceService}, so branch scoping, validation, overlap checks and the price
 * change audit stay exactly as they are for single edits. Bulk operations first work out every
 * change (a dry run returns just that), skipping — never failing on — rows a rule would refuse, so
 * one bad row doesn't roll the batch back.
 *
 * <p>Cost and margins are only returned to callers allowed to see product cost
 * ({@link ProductCostMasking}).
 */
@Service
public class PricingWorkspaceService {

    static final int MAX_BULK_PRODUCTS = 5000;
    static final int MAX_CUSTOMER_BULK_PRODUCTS = 2000;
    static final int SAMPLE_SIZE = 25;
    static final Set<String> FILTERS = Set.of("ALL", "PRICED", "UNPRICED", "LOW_MARGIN");
    static final Set<String> CUSTOMER_STATUSES = Set.of("ALL", "CURRENT", "FUTURE", "EXPIRED", "DISABLED", "LIVE");

    private final PricingWorkspaceRepository repository;
    private final PriceLevelRepository levelRepository;
    private final ProductLevelPriceRepository levelPriceRepository;
    private final ProductLevelPriceService levelPriceService;
    private final CustomerProductPriceRepository customerPriceRepository;
    private final CustomerProductPriceService customerPriceService;
    private final PricingRulesService rules;
    private final PricingResolutionService resolver;
    private final ProductRepository productRepository;
    private final ProductMediaRepository mediaRepository;
    private final ProductPriceChangeRepository changeRepository;
    private final BranchRepository branchRepository;
    private final ProductCostMasking costMasking;

    public PricingWorkspaceService(PricingWorkspaceRepository repository,
                                   PriceLevelRepository levelRepository,
                                   ProductLevelPriceRepository levelPriceRepository,
                                   ProductLevelPriceService levelPriceService,
                                   CustomerProductPriceRepository customerPriceRepository,
                                   CustomerProductPriceService customerPriceService,
                                   PricingRulesService rules,
                                   PricingResolutionService resolver,
                                   ProductRepository productRepository,
                                   ProductMediaRepository mediaRepository,
                                   ProductPriceChangeRepository changeRepository,
                                   BranchRepository branchRepository,
                                   ProductCostMasking costMasking) {
        this.repository = repository;
        this.levelRepository = levelRepository;
        this.levelPriceRepository = levelPriceRepository;
        this.levelPriceService = levelPriceService;
        this.customerPriceRepository = customerPriceRepository;
        this.customerPriceService = customerPriceService;
        this.rules = rules;
        this.resolver = resolver;
        this.productRepository = productRepository;
        this.mediaRepository = mediaRepository;
        this.changeRepository = changeRepository;
        this.branchRepository = branchRepository;
        this.costMasking = costMasking;
    }

    // ------------------------------------------------------------------
    // DTOs
    // ------------------------------------------------------------------

    public record Summary(int activeLevels, int totalLevels, int customerPriceLists, long customersOnLevels,
                          long customerPrices, long customersWithPrices, Long marginAlerts,
                          Long customerPricesBelowCost, BigDecimal minMarginPercent, boolean costVisible,
                          Map<Long, Long> customersByLevel) {}

    /** One level price of a product: {@code branchId} null = all branches. */
    public record MatrixPrice(Long priceLevelId, Long branchId, BigDecimal price, BigDecimal marginPercent) {}

    public record MatrixRow(Long id, String code, String name, String imageUrl, String departmentName,
                            String brandName, Long branchId, BigDecimal cost, BigDecimal basePrice,
                            BigDecimal baseMarginPercent, List<MatrixPrice> prices) {}

    public record MatrixPage(List<MatrixRow> content, int page, int size, long totalElements, int totalPages,
                             boolean costVisible, BigDecimal minMarginPercent) {}

    public record HistoryEntry(Long id, String kind, String label, Long branchId, String branchName,
                               BigDecimal oldPrice, BigDecimal newPrice, LocalDateTime changedAt, String changedBy) {}

    public record LevelCustomer(Long id, String code, String name, String mobile, String group,
                                Long priceLevelId, String priceLevelName) {}

    public record AssignResult(int updated, int unchanged) {}

    public record PriceChangePreview(Long productId, String productCode, String productName,
                                     Long priceLevelId, String priceLevelName,
                                     BigDecimal oldPrice, BigDecimal newPrice, BigDecimal marginPercent) {}

    public record BulkResult(int products, int changed, int unchanged, int skipped,
                             Map<String, Integer> skippedReasons, List<PriceChangePreview> samples, boolean applied) {}

    public record ImportError(Integer row, String message) {}

    public record ImportResult(int applied, int cleared, int unchanged, List<ImportError> errors, boolean dryRun) {}

    public record CustomerPriceRow(PriceResponse entry, BigDecimal cost, BigDecimal basePrice,
                                   BigDecimal marginPercent, BigDecimal discountPercent, Boolean belowCost) {}

    public record CustomerPricePreview(Long productId, String productCode, String productName,
                                       BigDecimal basePrice, BigDecimal replacesPrice, BigDecimal newPrice,
                                       BigDecimal marginPercent) {}

    public record CustomerBulkResult(int products, int created, int replaced, int skipped,
                                     Map<String, Integer> skippedReasons, List<CustomerPricePreview> samples,
                                     boolean applied) {}

    public static class AssignRequest {
        private List<Long> customerIds;
        private String customerGroup;
        private boolean assign = true;

        public List<Long> getCustomerIds() { return customerIds; }
        public void setCustomerIds(List<Long> customerIds) { this.customerIds = customerIds; }
        public String getCustomerGroup() { return customerGroup; }
        public void setCustomerGroup(String customerGroup) { this.customerGroup = customerGroup; }
        public boolean isAssign() { return assign; }
        public void setAssign(boolean assign) { this.assign = assign; }
    }

    /** Products to act on: a list of ids, or every product matching search / department / brand. */
    public static class ProductSelection {
        private String search;
        private Long departmentId;
        private Long brandId;
        private List<Long> productIds;

        public String getSearch() { return search; }
        public void setSearch(String search) { this.search = search; }
        public Long getDepartmentId() { return departmentId; }
        public void setDepartmentId(Long departmentId) { this.departmentId = departmentId; }
        public Long getBrandId() { return brandId; }
        public void setBrandId(Long brandId) { this.brandId = brandId; }
        public List<Long> getProductIds() { return productIds; }
        public void setProductIds(List<Long> productIds) { this.productIds = productIds; }
    }

    /**
     * Bulk change of level prices.
     *
     * <p>{@code action}: INCREASE_PERCENT, DECREASE_PERCENT, INCREASE_AMOUNT, DECREASE_AMOUNT (applied
     * to the {@code basis}: LEVEL = the level's current price, BASE = the product's retail price,
     * COST), SET_MARGIN (price = cost ÷ (1 − value %)), SET_MARKUP (price = cost × (1 + value %)),
     * SET_PRICE (value). {@code onlyExisting} touches only products that already have a price under
     * the level.
     */
    public static class BulkLevelRequest extends ProductSelection {
        private List<Long> priceLevelIds;
        private Long branchId;
        private String basis = "LEVEL";
        private String action;
        private BigDecimal value;
        private BigDecimal roundTo;
        private boolean onlyExisting;
        private boolean dryRun;

        public List<Long> getPriceLevelIds() { return priceLevelIds; }
        public void setPriceLevelIds(List<Long> priceLevelIds) { this.priceLevelIds = priceLevelIds; }
        public Long getBranchId() { return branchId; }
        public void setBranchId(Long branchId) { this.branchId = branchId; }
        public String getBasis() { return basis; }
        public void setBasis(String basis) { this.basis = basis; }
        public String getAction() { return action; }
        public void setAction(String action) { this.action = action; }
        public BigDecimal getValue() { return value; }
        public void setValue(BigDecimal value) { this.value = value; }
        public BigDecimal getRoundTo() { return roundTo; }
        public void setRoundTo(BigDecimal roundTo) { this.roundTo = roundTo; }
        public boolean isOnlyExisting() { return onlyExisting; }
        public void setOnlyExisting(boolean onlyExisting) { this.onlyExisting = onlyExisting; }
        public boolean isDryRun() { return dryRun; }
        public void setDryRun(boolean dryRun) { this.dryRun = dryRun; }
    }

    /** One spreadsheet row: price blank = remove the level price. */
    public static class ImportRow {
        private Integer row;
        private String productCode;
        private String priceLevel;
        private String price;

        public Integer getRow() { return row; }
        public void setRow(Integer row) { this.row = row; }
        public String getProductCode() { return productCode; }
        public void setProductCode(String productCode) { this.productCode = productCode; }
        public String getPriceLevel() { return priceLevel; }
        public void setPriceLevel(String priceLevel) { this.priceLevel = priceLevel; }
        public String getPrice() { return price; }
        public void setPrice(String price) { this.price = price; }
    }

    public static class ImportRequest {
        private Long branchId;
        private List<ImportRow> rows;
        private boolean dryRun;

        public Long getBranchId() { return branchId; }
        public void setBranchId(Long branchId) { this.branchId = branchId; }
        public List<ImportRow> getRows() { return rows; }
        public void setRows(List<ImportRow> rows) { this.rows = rows; }
        public boolean isDryRun() { return dryRun; }
        public void setDryRun(boolean dryRun) { this.dryRun = dryRun; }
    }

    /**
     * Negotiated prices for one customer across many products. {@code method}: DISCOUNT_PERCENT (off
     * the retail price), MARKUP_PERCENT (on cost), MARGIN_PERCENT (on cost), FIXED_PRICE.
     * {@code replaceExisting} ends (or deactivates) an overlapping live price instead of skipping.
     */
    public static class CustomerBulkRequest extends ProductSelection {
        private Long customerId;
        private Long branchId;
        private String method;
        private BigDecimal value;
        private BigDecimal roundTo;
        private LocalDate effectiveFrom;
        private LocalDate effectiveTo;
        private boolean replaceExisting;
        private boolean dryRun;
        private String notes;

        public Long getCustomerId() { return customerId; }
        public void setCustomerId(Long customerId) { this.customerId = customerId; }
        public Long getBranchId() { return branchId; }
        public void setBranchId(Long branchId) { this.branchId = branchId; }
        public String getMethod() { return method; }
        public void setMethod(String method) { this.method = method; }
        public BigDecimal getValue() { return value; }
        public void setValue(BigDecimal value) { this.value = value; }
        public BigDecimal getRoundTo() { return roundTo; }
        public void setRoundTo(BigDecimal roundTo) { this.roundTo = roundTo; }
        public LocalDate getEffectiveFrom() { return effectiveFrom; }
        public void setEffectiveFrom(LocalDate effectiveFrom) { this.effectiveFrom = effectiveFrom; }
        public LocalDate getEffectiveTo() { return effectiveTo; }
        public void setEffectiveTo(LocalDate effectiveTo) { this.effectiveTo = effectiveTo; }
        public boolean isReplaceExisting() { return replaceExisting; }
        public void setReplaceExisting(boolean replaceExisting) { this.replaceExisting = replaceExisting; }
        public boolean isDryRun() { return dryRun; }
        public void setDryRun(boolean dryRun) { this.dryRun = dryRun; }
        public String getNotes() { return notes; }
        public void setNotes(String notes) { this.notes = notes; }
    }

    public static class CopyRequest {
        private Long fromCustomerId;
        private Long toCustomerId;
        private boolean overwrite;
        private boolean dryRun;

        public Long getFromCustomerId() { return fromCustomerId; }
        public void setFromCustomerId(Long fromCustomerId) { this.fromCustomerId = fromCustomerId; }
        public Long getToCustomerId() { return toCustomerId; }
        public void setToCustomerId(Long toCustomerId) { this.toCustomerId = toCustomerId; }
        public boolean isOverwrite() { return overwrite; }
        public void setOverwrite(boolean overwrite) { this.overwrite = overwrite; }
        public boolean isDryRun() { return dryRun; }
        public void setDryRun(boolean dryRun) { this.dryRun = dryRun; }
    }

    // ------------------------------------------------------------------
    // Summary
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Summary summary() {
        Scope scope = Scope.current();
        boolean costVisible = costMasking.callerMaySeeCost();
        BigDecimal threshold = rules.get().minMarginPercent();
        List<PriceLevel> levels = levelRepository.findAllByOrderBySortOrderAscNameAsc();
        Map<Long, Long> customersByLevel = customerCounts();
        int active = 0;
        int lists = 0;
        long onLevels = 0;
        for (PriceLevel l : levels) {
            if (l.isActive()) active++;
            if (l.isSystemDefault()) continue;
            long n = customersByLevel.getOrDefault(l.getId(), 0L);
            onLevels += n;
            if (l.isActive() && n > 0) lists++;
        }
        LocalDate today = resolver.pricingDate(null);
        List<Object[]> live = customerPriceRepository.liveCounts(scope.all(), scope.branchIds(), today);
        long prices = 0;
        long customers = 0;
        if (!live.isEmpty() && live.get(0) != null) {
            prices = number(live.get(0)[0]);
            customers = number(live.get(0)[1]);
        }
        Long alerts = null;
        Long belowCost = null;
        if (costVisible) {
            alerts = repository.products(scope.all(), scope.branchIds(), false, List.of(-1L), "%", null, null,
                    "LOW_MARGIN", threshold, PageRequest.of(0, 1)).getTotalElements();
            belowCost = customerPriceRepository.countLiveBelowCost(scope.all(), scope.branchIds(), today);
        }
        return new Summary(active, levels.size(), lists, onLevels, prices, customers, alerts, belowCost,
                threshold, costVisible, customersByLevel);
    }

    // ------------------------------------------------------------------
    // Price matrix
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public MatrixPage matrix(String search, Long departmentId, Long brandId, Long branchId, String filter,
                             int page, int size) {
        if (branchId != null) BranchScope.assertCanAccess(branchId);
        boolean costVisible = costMasking.callerMaySeeCost();
        BigDecimal threshold = rules.get().minMarginPercent();
        String f = filter == null ? "ALL" : filter.trim().toUpperCase(Locale.ROOT);
        if (!FILTERS.contains(f)) throw new PricingException("Unknown filter '" + filter + "'.");
        if ("LOW_MARGIN".equals(f) && !costVisible) f = "ALL";
        Scope scope = Scope.current();
        Page<Product> products = repository.products(scope.all(), scope.branchIds(), false, List.of(-1L),
                pattern(search), departmentId, brandId, f, threshold,
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200), Sort.by("name").and(Sort.by("id"))));
        List<Long> ids = products.getContent().stream().map(Product::getId).toList();
        Map<Long, Costs> costs = rules.costs(ids, branchId);
        Map<Long, String> images = ids.isEmpty() ? Map.of() : mediaRepository.findByProductIdInAndIsPrimaryTrue(ids).stream()
                .filter(m -> m.getProduct() != null)
                .collect(Collectors.toMap(m -> m.getProduct().getId(), m -> m.getImageUrl(), (a, b) -> a));
        Map<Long, List<ProductLevelPriceService.PriceRowResponse>> prices = levelPriceService.listForProducts(ids).stream()
                .collect(Collectors.groupingBy(ProductLevelPriceService.PriceRowResponse::productId));

        List<MatrixRow> rows = new ArrayList<>(ids.size());
        for (Product p : products.getContent()) {
            Costs c = costs.getOrDefault(p.getId(), new Costs(null, null));
            BigDecimal cost = costVisible ? c.cost() : null;
            List<MatrixPrice> cells = prices.getOrDefault(p.getId(), List.of()).stream()
                    .map(r -> new MatrixPrice(r.priceLevelId(), r.branchId(), r.price(),
                            costVisible ? PricingRulesService.marginPercent(r.price(), c.cost()) : null))
                    .toList();
            rows.add(new MatrixRow(p.getId(), p.getCode(), p.getName(), images.get(p.getId()),
                    p.getDepartment() != null ? p.getDepartment().getName() : null,
                    p.getBrand() != null ? p.getBrand().getName() : null,
                    p.getBranch() != null ? p.getBranch().getId() : null,
                    cost, c.basePrice(),
                    costVisible ? PricingRulesService.marginPercent(c.basePrice(), c.cost()) : null,
                    cells));
        }
        return new MatrixPage(rows, products.getNumber(), products.getSize(), products.getTotalElements(),
                products.getTotalPages(), costVisible, threshold);
    }

    // ------------------------------------------------------------------
    // History
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<HistoryEntry> history(Long productId, int limit) {
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new PricingException("Product " + productId + " does not exist."));
        if (product.getBranch() != null && product.getBranch().getId() != null) {
            BranchScope.assertCanAccess(product.getBranch().getId());
        }
        boolean costVisible = costMasking.callerMaySeeCost();
        Scope scope = Scope.current();
        List<ProductPriceChange> rows = changeRepository.findByProductIdAndIsActiveTrueOrderByCreatedAtDescIdDesc(
                productId, PageRequest.of(0, Math.min(Math.max(limit, 1), 500)));
        Set<Long> branchIds = rows.stream().map(ProductPriceChange::getBranchId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, String> branchNames = new HashMap<>();
        if (!branchIds.isEmpty()) branchRepository.findAllById(branchIds).forEach(b -> branchNames.put(b.getId(), b.getName()));
        List<HistoryEntry> out = new ArrayList<>();
        for (ProductPriceChange c : rows) {
            if (c.getBranchId() != null && !scope.all() && !scope.branchIds().contains(c.getBranchId())) continue;
            String label = c.getPriceLevel() == null ? "" : c.getPriceLevel();
            String lower = label.toLowerCase(Locale.ROOT);
            if (!costVisible && (lower.contains("cost") || lower.equals("nlc"))) continue;
            String kind = label.startsWith("L:") ? "LEVEL" : label.startsWith("C:") ? "CUSTOMER" : "PRODUCT";
            String shown = kind.equals("PRODUCT") ? label : label.substring(2);
            out.add(new HistoryEntry(c.getId(), kind, shown, c.getBranchId(),
                    c.getBranchId() != null ? branchNames.get(c.getBranchId()) : null,
                    c.getOldPrice(), c.getNewPrice(), c.getCreatedAt(), c.getCreatedBy()));
        }
        return out;
    }

    // ------------------------------------------------------------------
    // Customers on a level ("customer price lists")
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public PageResponse<LevelCustomer> customers(Long levelId, String search, String customerGroup, int page, int size) {
        Page<Customer> rows = repository.customers(levelId == null ? -1L : levelId, pattern(search),
                customerGroup == null ? "" : customerGroup.trim().toLowerCase(Locale.ROOT),
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200), Sort.by("name").and(Sort.by("id"))));
        Map<Long, String> levelNames = levelRepository.findAll().stream()
                .collect(Collectors.toMap(PriceLevel::getId, PriceLevel::getName));
        List<LevelCustomer> content = rows.getContent().stream()
                .map(c -> new LevelCustomer(c.getId(), c.getCode(), c.getName(), c.getMobile(), c.getGroupType(),
                        c.getPriceLevelId(), c.getPriceLevelId() != null ? levelNames.get(c.getPriceLevelId()) : null))
                .toList();
        return new PageResponse<>(content, rows.getNumber(), rows.getSize(), rows.getTotalElements(), rows.getTotalPages());
    }

    @Transactional(readOnly = true)
    public List<String> customerGroups() {
        return repository.customerGroups();
    }

    /**
     * Puts customers on a level (their default price level), or takes them off it. Same rules as
     * the customer form: only an active level can be newly assigned, and the legacy price-list label
     * follows the level.
     */
    @Transactional
    public AssignResult assign(Long levelId, AssignRequest request) {
        PriceLevel level = levelRepository.findById(levelId)
                .orElseThrow(() -> new PricingException("Price level " + levelId + " does not exist."));
        if (request == null) throw new PricingException("A request body is required.");
        Map<Long, Customer> targets = new LinkedHashMap<>();
        if (request.getCustomerIds() != null && !request.getCustomerIds().isEmpty()) {
            repository.customersByIds(new HashSet<>(request.getCustomerIds())).forEach(c -> targets.put(c.getId(), c));
        }
        if (request.getCustomerGroup() != null && !request.getCustomerGroup().isBlank()) {
            repository.customersInGroup(request.getCustomerGroup().trim().toLowerCase(Locale.ROOT))
                    .forEach(c -> targets.put(c.getId(), c));
        }
        if (targets.isEmpty()) throw new PricingException("Choose at least one customer or a customer group.");
        if (targets.size() > MAX_BULK_PRODUCTS) {
            throw new PricingException("At most " + MAX_BULK_PRODUCTS + " customers can be changed at once.");
        }
        int updated = 0;
        int unchanged = 0;
        for (Customer c : targets.values()) {
            if (request.isAssign()) {
                if (levelId.equals(c.getPriceLevelId())) {
                    unchanged++;
                    continue;
                }
                if (!level.isActive()) {
                    throw new PricingException("Price level '" + level.getName() + "' is inactive and cannot be assigned.");
                }
                c.setPriceLevelId(level.getId());
                c.setPriceList(level.getName());
                updated++;
            } else {
                if (!levelId.equals(c.getPriceLevelId())) {
                    unchanged++;
                    continue;
                }
                c.setPriceLevelId(null);
                if (c.getPriceList() != null && c.getPriceList().trim().equalsIgnoreCase(level.getName())) {
                    c.setPriceList(null);
                }
                updated++;
            }
        }
        return new AssignResult(updated, unchanged);
    }

    // ------------------------------------------------------------------
    // Bulk level price change
    // ------------------------------------------------------------------

    @Transactional
    public BulkResult bulkUpdate(BulkLevelRequest req) {
        if (req == null) throw new PricingException("A request body is required.");
        if (req.getBranchId() != null) BranchScope.assertCanAccess(req.getBranchId());
        String action = upper(req.getAction());
        Set<String> actions = Set.of("INCREASE_PERCENT", "DECREASE_PERCENT", "INCREASE_AMOUNT", "DECREASE_AMOUNT",
                "SET_MARGIN", "SET_MARKUP", "SET_PRICE");
        if (!actions.contains(action)) throw new PricingException("Choose what the bulk update should do.");
        String basis = req.getBasis() == null ? "LEVEL" : upper(req.getBasis());
        if (!Set.of("LEVEL", "BASE", "COST").contains(basis)) throw new PricingException("Unknown price basis '" + req.getBasis() + "'.");
        BigDecimal value = req.getValue();
        if (value == null || value.signum() < 0) throw new PricingException("Enter a value of zero or more.");
        if (action.equals("SET_MARGIN") && value.compareTo(new BigDecimal("100")) >= 0) {
            throw new PricingException("A margin must be below 100 %.");
        }
        if (action.equals("SET_PRICE") && value.signum() <= 0) throw new PricingException("A price must be greater than zero.");
        boolean needsCost = action.equals("SET_MARGIN") || action.equals("SET_MARKUP") || basis.equals("COST");
        if (needsCost && !costMasking.callerMaySeeCost()) {
            throw new PricingException("You can't price from cost: product cost isn't visible to you.");
        }
        List<PriceLevel> levels = targetLevels(req.getPriceLevelIds());
        PricingRulesService.Rules r = rules.get();
        BigDecimal step = req.getRoundTo() != null ? req.getRoundTo() : r.roundTo();

        List<Product> products = selectProducts(req, MAX_BULK_PRODUCTS);
        List<Long> ids = products.stream().map(Product::getId).toList();
        Map<Long, Costs> costs = rules.costs(ids, req.getBranchId());
        Map<String, ProductLevelPrice> existing = new HashMap<>();
        if (!ids.isEmpty()) {
            for (ProductLevelPrice row : levelPriceRepository.findByProductIdIn(new HashSet<>(ids))) {
                if (row.isActive()) existing.put(cell(row.getProductId(), row.getPriceLevelId(), row.getBranchId()), row);
            }
        }

        Tally tally = new Tally();
        List<PriceRow> changes = new ArrayList<>();
        List<PriceChangePreview> samples = new ArrayList<>();
        for (Product p : products) {
            Costs c = costs.getOrDefault(p.getId(), new Costs(null, null));
            for (PriceLevel level : levels) {
                ProductLevelPrice own = existing.get(cell(p.getId(), level.getId(), req.getBranchId()));
                ProductLevelPrice global = req.getBranchId() == null ? own : existing.get(cell(p.getId(), level.getId(), null));
                BigDecimal current = own != null ? own.getPrice() : (global != null ? global.getPrice() : null);
                if (req.isOnlyExisting() && current == null) {
                    tally.skip("No price set under the level");
                    continue;
                }
                BigDecimal base = switch (basis) {
                    case "BASE" -> c.basePrice();
                    case "COST" -> c.cost();
                    default -> current != null ? current : c.basePrice();
                };
                BigDecimal next;
                switch (action) {
                    case "INCREASE_PERCENT" -> next = base == null ? null : base.multiply(BigDecimal.ONE.add(pct(value)));
                    case "DECREASE_PERCENT" -> next = base == null ? null : base.multiply(BigDecimal.ONE.subtract(pct(value)));
                    case "INCREASE_AMOUNT" -> next = base == null ? null : base.add(value);
                    case "DECREASE_AMOUNT" -> next = base == null ? null : base.subtract(value);
                    case "SET_MARGIN" -> next = c.hasCost() ? c.cost().divide(BigDecimal.ONE.subtract(pct(value)), 6, RoundingMode.HALF_UP) : null;
                    case "SET_MARKUP" -> next = c.hasCost() ? c.cost().multiply(BigDecimal.ONE.add(pct(value))) : null;
                    default -> next = value;
                }
                if (next == null) {
                    tally.skip(needsCost ? "No cost on the product" : "No base price on the product");
                    continue;
                }
                next = PricingRulesService.roundTo(next, step);
                if (next.signum() <= 0) {
                    tally.skip("New price would be zero or less");
                    continue;
                }
                if (r.blockBelowCost() && c.hasCost() && next.compareTo(c.cost()) < 0) {
                    tally.skip("Below cost (blocked by pricing rules)");
                    continue;
                }
                if (own != null && own.getPrice().compareTo(next) == 0) {
                    tally.unchanged++;
                    continue;
                }
                changes.add(new PriceRow(p.getId(), level.getId(), req.getBranchId(), next));
                if (samples.size() < SAMPLE_SIZE) {
                    samples.add(new PriceChangePreview(p.getId(), p.getCode(), p.getName(), level.getId(), level.getName(),
                            current, next, costMasking.callerMaySeeCost() ? PricingRulesService.marginPercent(next, c.cost()) : null));
                }
            }
        }
        boolean apply = !req.isDryRun() && !changes.isEmpty();
        if (apply) {
            for (int i = 0; i < changes.size(); i += 500) {
                levelPriceService.upsert(changes.subList(i, Math.min(i + 500, changes.size())));
            }
        }
        return new BulkResult(products.size(), changes.size(), tally.unchanged, tally.skipped, tally.reasons, samples, apply);
    }

    // ------------------------------------------------------------------
    // Import
    // ------------------------------------------------------------------

    @Transactional
    public ImportResult importPrices(ImportRequest req) {
        if (req == null || req.getRows() == null || req.getRows().isEmpty()) throw new PricingException("The file has no rows.");
        if (req.getRows().size() > MAX_BULK_PRODUCTS * 4) {
            throw new PricingException("At most " + (MAX_BULK_PRODUCTS * 4) + " rows can be imported at once.");
        }
        Long branchId = req.getBranchId();
        if (branchId != null) BranchScope.assertCanAccess(branchId);
        List<PriceLevel> allLevels = levelRepository.findAll();
        Map<String, PriceLevel> levelsByKey = new HashMap<>();
        for (PriceLevel l : allLevels) {
            levelsByKey.put(l.getName().trim().toLowerCase(Locale.ROOT), l);
            levelsByKey.putIfAbsent(l.getCode().trim().toLowerCase(Locale.ROOT), l);
        }
        List<String> codes = req.getRows().stream().map(ImportRow::getProductCode).filter(Objects::nonNull)
                .map(String::trim).filter(s -> !s.isEmpty()).distinct().toList();
        Map<String, List<Product>> byCode = codes.isEmpty() ? Map.of() : productRepository.findByCodeIn(codes).stream()
                .filter(Product::isActive)
                .collect(Collectors.groupingBy(p -> p.getCode().trim().toLowerCase(Locale.ROOT)));
        Scope scope = Scope.current();
        PricingRulesService.Rules r = rules.get();

        List<ImportError> errors = new ArrayList<>();
        Map<String, PriceRow> rows = new LinkedHashMap<>();
        for (ImportRow in : req.getRows()) {
            Integer n = in.getRow();
            String code = in.getProductCode() == null ? "" : in.getProductCode().trim();
            if (code.isEmpty()) { errors.add(new ImportError(n, "Product code is missing.")); continue; }
            Product product = pickProduct(byCode.get(code.toLowerCase(Locale.ROOT)), branchId, scope);
            if (product == null) { errors.add(new ImportError(n, "Product '" + code + "' was not found.")); continue; }
            String levelKey = in.getPriceLevel() == null ? "" : in.getPriceLevel().trim().toLowerCase(Locale.ROOT);
            PriceLevel level = levelsByKey.get(levelKey);
            if (level == null) { errors.add(new ImportError(n, "Price level '" + in.getPriceLevel() + "' was not found.")); continue; }
            if (level.isSystemDefault()) {
                errors.add(new ImportError(n, "'" + level.getName() + "' is the default level; change the product's own price instead."));
                continue;
            }
            if (!level.isActive()) { errors.add(new ImportError(n, "Price level '" + level.getName() + "' is inactive.")); continue; }
            String raw = in.getPrice() == null ? "" : in.getPrice().trim().replace(",", "");
            BigDecimal price = null;
            if (!raw.isEmpty()) {
                try {
                    price = new BigDecimal(raw);
                } catch (NumberFormatException ex) {
                    errors.add(new ImportError(n, "'" + in.getPrice() + "' is not a number."));
                    continue;
                }
                if (price.signum() <= 0) { errors.add(new ImportError(n, "Prices must be greater than zero.")); continue; }
                price = price.setScale(2, RoundingMode.HALF_UP);
            }
            String k = cell(product.getId(), level.getId(), branchId);
            if (rows.containsKey(k)) { errors.add(new ImportError(n, "Duplicate row for " + code + " / " + level.getName() + ".")); continue; }
            rows.put(k, new PriceRow(product.getId(), level.getId(), branchId, price));
        }

        List<Long> ids = rows.values().stream().map(PriceRow::getProductId).distinct().toList();
        Map<Long, Costs> costs = rules.costs(ids, branchId);
        Map<String, ProductLevelPrice> existing = new HashMap<>();
        if (!ids.isEmpty()) {
            for (ProductLevelPrice row : levelPriceRepository.findByProductIdIn(new HashSet<>(ids))) {
                if (row.isActive()) existing.put(cell(row.getProductId(), row.getPriceLevelId(), row.getBranchId()), row);
            }
        }
        List<PriceRow> changes = new ArrayList<>();
        int applied = 0;
        int cleared = 0;
        int unchanged = 0;
        for (Map.Entry<String, PriceRow> e : rows.entrySet()) {
            PriceRow row = e.getValue();
            ProductLevelPrice own = existing.get(e.getKey());
            if (row.getPrice() == null) {
                if (own == null) { unchanged++; continue; }
                cleared++;
                changes.add(row);
                continue;
            }
            Costs c = costs.get(row.getProductId());
            if (r.blockBelowCost() && c != null && c.hasCost() && row.getPrice().compareTo(c.cost()) < 0) {
                errors.add(new ImportError(null, "Skipped product " + row.getProductId() + ": below cost (blocked by pricing rules)."));
                continue;
            }
            if (own != null && own.getPrice().compareTo(row.getPrice()) == 0) { unchanged++; continue; }
            applied++;
            changes.add(row);
        }
        if (!req.isDryRun() && !changes.isEmpty()) {
            for (int i = 0; i < changes.size(); i += 500) {
                levelPriceService.upsert(changes.subList(i, Math.min(i + 500, changes.size())));
            }
        }
        return new ImportResult(applied, cleared, unchanged, errors, req.isDryRun());
    }

    // ------------------------------------------------------------------
    // Customer prices
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public PageResponse<CustomerPriceRow> customerPrices(Long customerId, String search, String status,
                                                         boolean belowCostOnly, int page, int size) {
        String s = status == null || status.isBlank() ? "ALL" : upper(status);
        if (!CUSTOMER_STATUSES.contains(s)) throw new PricingException("Unknown status '" + status + "'.");
        boolean costVisible = costMasking.callerMaySeeCost();
        Scope scope = Scope.current();
        LocalDate today = resolver.pricingDate(null);
        Page<CustomerProductPrice> rows = customerPriceRepository.workspaceSearch(customerId == null ? -1L : customerId,
                scope.all(), scope.branchIds(), pattern(search), s, belowCostOnly && costVisible, today,
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200),
                        Sort.by(Sort.Order.asc("customerId"), Sort.Order.asc("productId"),
                                Sort.Order.desc("effectiveFrom"), Sort.Order.desc("id"))));
        List<PriceResponse> entries = customerPriceService.toResponses(rows.getContent(), today);
        Map<Long, Map<Long, Costs>> costsByBranch = new HashMap<>();
        for (PriceResponse e : entries) {
            costsByBranch.computeIfAbsent(e.branchId() == null ? -1L : e.branchId(), b -> new HashMap<>());
        }
        for (Map.Entry<Long, Map<Long, Costs>> b : costsByBranch.entrySet()) {
            Long branch = b.getKey() == -1L ? null : b.getKey();
            List<Long> ids = entries.stream().filter(e -> Objects.equals(e.branchId(), branch)).map(PriceResponse::productId).toList();
            b.getValue().putAll(rules.costs(ids, branch));
        }
        List<CustomerPriceRow> out = new ArrayList<>(entries.size());
        for (PriceResponse e : entries) {
            Costs c = costsByBranch.get(e.branchId() == null ? -1L : e.branchId()).getOrDefault(e.productId(), new Costs(null, null));
            BigDecimal discount = c.basePrice() != null && c.basePrice().signum() > 0
                    ? c.basePrice().subtract(e.price()).multiply(PricingRulesService.HUNDRED).divide(c.basePrice(), 2, RoundingMode.HALF_UP)
                    : null;
            out.add(new CustomerPriceRow(e, costVisible ? c.cost() : null, c.basePrice(),
                    costVisible ? PricingRulesService.marginPercent(e.price(), c.cost()) : null, discount,
                    costVisible ? (c.hasCost() && e.price().compareTo(c.cost()) < 0) : null));
        }
        return new PageResponse<>(out, rows.getNumber(), rows.getSize(), rows.getTotalElements(), rows.getTotalPages());
    }

    @Transactional
    public CustomerBulkResult customerBulk(CustomerBulkRequest req) {
        if (req == null) throw new PricingException("A request body is required.");
        if (req.getCustomerId() == null) throw new PricingException("Choose a customer.");
        String method = upper(req.getMethod());
        if (!Set.of("DISCOUNT_PERCENT", "MARKUP_PERCENT", "MARGIN_PERCENT", "FIXED_PRICE").contains(method)) {
            throw new PricingException("Choose a pricing method.");
        }
        BigDecimal value = req.getValue();
        if (value == null || value.signum() < 0) throw new PricingException("Enter a value of zero or more.");
        if (method.equals("MARGIN_PERCENT") && value.compareTo(new BigDecimal("100")) >= 0) {
            throw new PricingException("A margin must be below 100 %.");
        }
        if (method.equals("DISCOUNT_PERCENT") && value.compareTo(new BigDecimal("100")) >= 0) {
            throw new PricingException("A discount must be below 100 %.");
        }
        if ((method.equals("MARKUP_PERCENT") || method.equals("MARGIN_PERCENT")) && !costMasking.callerMaySeeCost()) {
            throw new PricingException("You can't price from cost: product cost isn't visible to you.");
        }
        if (req.getBranchId() != null) BranchScope.assertCanAccess(req.getBranchId());
        LocalDate today = resolver.pricingDate(null);
        LocalDate from = req.getEffectiveFrom() != null ? req.getEffectiveFrom() : today;
        if (req.getEffectiveTo() != null && req.getEffectiveTo().isBefore(from)) {
            throw new PricingException("The end date can't be before the start date.");
        }
        PricingRulesService.Rules r = rules.get();
        BigDecimal step = req.getRoundTo() != null ? req.getRoundTo() : r.roundTo();

        List<Product> products = selectProducts(req, MAX_CUSTOMER_BULK_PRODUCTS);
        Map<Long, Costs> costs = rules.costs(products.stream().map(Product::getId).toList(), req.getBranchId());
        List<Planned> plan = new ArrayList<>();
        for (Product p : products) {
            Costs c = costs.getOrDefault(p.getId(), new Costs(null, null));
            BigDecimal price = switch (method) {
                case "DISCOUNT_PERCENT" -> c.basePrice() == null ? null : c.basePrice().multiply(BigDecimal.ONE.subtract(pct(value)));
                case "MARKUP_PERCENT" -> c.hasCost() ? c.cost().multiply(BigDecimal.ONE.add(pct(value))) : null;
                case "MARGIN_PERCENT" -> c.hasCost() ? c.cost().divide(BigDecimal.ONE.subtract(pct(value)), 6, RoundingMode.HALF_UP) : null;
                default -> value;
            };
            plan.add(new Planned(p, req.getBranchId(), price == null ? null : PricingRulesService.roundTo(price, step),
                    from, req.getEffectiveTo(), req.getNotes(), c,
                    method.equals("DISCOUNT_PERCENT") ? "No base price on the product" : "No cost on the product"));
        }
        return applyCustomerPlan(req.getCustomerId(), plan, req.isReplaceExisting(), req.isDryRun(), r);
    }

    @Transactional
    public CustomerBulkResult copy(CopyRequest req) {
        if (req == null || req.getFromCustomerId() == null || req.getToCustomerId() == null) {
            throw new PricingException("Choose both customers.");
        }
        if (req.getFromCustomerId().equals(req.getToCustomerId())) throw new PricingException("Choose two different customers.");
        Scope scope = Scope.current();
        LocalDate today = resolver.pricingDate(null);
        List<CustomerProductPrice> source = customerPriceRepository.findByCustomerIdAndIsActiveTrue(req.getFromCustomerId()).stream()
                .filter(CustomerProductPrice::isEnabled)
                .filter(c -> c.getEffectiveTo() == null || !c.getEffectiveTo().isBefore(today))
                .filter(c -> c.getBranchId() == null ? scope.all() : (scope.all() || scope.branchIds().contains(c.getBranchId())))
                .toList();
        if (source.isEmpty()) throw new PricingException("The source customer has no current or upcoming negotiated prices you can copy.");
        Map<Long, Product> products = productRepository.findAllById(source.stream().map(CustomerProductPrice::getProductId).collect(Collectors.toSet()))
                .stream().filter(Product::isActive).collect(Collectors.toMap(Product::getId, Function.identity()));
        String sourceCode = repository.customersByIds(List.of(req.getFromCustomerId())).stream().findFirst()
                .map(Customer::getCode).orElse(String.valueOf(req.getFromCustomerId()));
        List<Planned> plan = new ArrayList<>();
        for (CustomerProductPrice c : source) {
            Product p = products.get(c.getProductId());
            if (p == null) continue;
            LocalDate from = c.getEffectiveFrom() == null || c.getEffectiveFrom().isBefore(today) ? today : c.getEffectiveFrom();
            Costs costs = rules.costs(List.of(p.getId()), c.getBranchId()).getOrDefault(p.getId(), new Costs(null, null));
            plan.add(new Planned(p, c.getBranchId(), c.getPrice(), from, c.getEffectiveTo(),
                    "Copied from " + sourceCode + (c.getNotes() != null ? " — " + c.getNotes() : ""), costs, "No price"));
        }
        return applyCustomerPlan(req.getToCustomerId(), plan, req.isOverwrite(), req.isDryRun(), rules.get());
    }

    private record Planned(Product product, Long branchId, BigDecimal price, LocalDate from, LocalDate to,
                           String notes, Costs costs, String missingReason) {}

    /** Works out and (unless a dry run) creates the planned negotiated prices for one customer. */
    private CustomerBulkResult applyCustomerPlan(Long customerId, List<Planned> plan, boolean replace, boolean dryRun,
                                                 PricingRulesService.Rules r) {
        if (repository.customersByIds(List.of(customerId)).isEmpty()) {
            throw new PricingException("Customer " + customerId + " does not exist.");
        }
        boolean costVisible = costMasking.callerMaySeeCost();
        Map<Long, List<CustomerProductPrice>> current = customerPriceRepository.findByCustomerIdAndIsActiveTrue(customerId).stream()
                .collect(Collectors.groupingBy(CustomerProductPrice::getProductId));
        Tally tally = new Tally();
        int replaced = 0;
        List<Runnable> writes = new ArrayList<>();
        List<CustomerPricePreview> samples = new ArrayList<>();
        Set<String> planned = new HashSet<>();
        for (Planned p : plan) {
            if (p.price() == null) { tally.skip(p.missingReason()); continue; }
            if (p.price().signum() <= 0) { tally.skip("New price would be zero or less"); continue; }
            if (r.blockBelowCost() && p.costs().hasCost() && p.price().compareTo(p.costs().cost()) < 0) {
                tally.skip("Below cost (blocked by pricing rules)");
                continue;
            }
            // A copied list may hold several non-overlapping periods of one product; only a true
            // repeat (same product, branch and start) is a duplicate.
            if (!planned.add(p.product().getId() + "|" + Objects.toString(p.branchId(), "*") + "|" + p.from())) {
                tally.skip("Duplicate product in the selection");
                continue;
            }
            List<CustomerProductPrice> overlapping = current.getOrDefault(p.product().getId(), List.of()).stream()
                    .filter(CustomerProductPrice::isEnabled)
                    .filter(o -> Objects.equals(o.getBranchId(), p.branchId()))
                    .filter(o -> CustomerProductPriceService.overlaps(p.from(), p.to(), o.getEffectiveFrom(), o.getEffectiveTo()))
                    .toList();
            if (!overlapping.isEmpty() && !replace) {
                tally.skip("Customer already has a price for the product");
                continue;
            }
            if (!overlapping.isEmpty()) replaced++;
            BigDecimal replacesPrice = overlapping.isEmpty() ? null : overlapping.get(0).getPrice();
            if (samples.size() < SAMPLE_SIZE) {
                samples.add(new CustomerPricePreview(p.product().getId(), p.product().getCode(), p.product().getName(),
                        p.costs().basePrice(), replacesPrice, p.price(),
                        costVisible ? PricingRulesService.marginPercent(p.price(), p.costs().cost()) : null));
            }
            writes.add(() -> {
                for (CustomerProductPrice o : overlapping) {
                    if (o.getEffectiveFrom() != null && o.getEffectiveFrom().isBefore(p.from())) {
                        PriceRequest end = new PriceRequest();
                        end.setBranchId(o.getBranchId());
                        end.setEffectiveTo(p.from().minusDays(1));
                        end.setNotes(o.getNotes());
                        customerPriceService.update(o.getId(), end);
                    } else {
                        customerPriceService.setEnabled(o.getId(), false);
                    }
                }
                PriceRequest create = new PriceRequest();
                create.setCustomerId(customerId);
                create.setProductId(p.product().getId());
                create.setBranchId(p.branchId());
                create.setPrice(p.price());
                create.setEffectiveFrom(p.from());
                create.setEffectiveTo(p.to());
                create.setEnabled(true);
                create.setNotes(p.notes());
                customerPriceService.create(create);
            });
        }
        boolean apply = !dryRun && !writes.isEmpty();
        if (apply) writes.forEach(Runnable::run);
        return new CustomerBulkResult(plan.size(), writes.size(), replaced, tally.skipped, tally.reasons, samples, apply);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private List<PriceLevel> targetLevels(List<Long> ids) {
        if (ids == null || ids.isEmpty()) throw new PricingException("Choose at least one price level.");
        List<PriceLevel> levels = new ArrayList<>();
        for (Long id : new LinkedHashSet<>(ids)) {
            PriceLevel level = levelRepository.findById(id)
                    .orElseThrow(() -> new PricingException("Price level " + id + " does not exist."));
            if (level.isSystemDefault()) {
                throw new PricingException("'" + level.getName() + "' is the default level; its price is the product's own selling price.");
            }
            if (!level.isActive()) throw new PricingException("Price level '" + level.getName() + "' is inactive.");
            levels.add(level);
        }
        return levels;
    }

    /** The products a bulk action covers, refusing a selection larger than {@code max}. */
    private List<Product> selectProducts(ProductSelection sel, int max) {
        Scope scope = Scope.current();
        boolean useIds = sel.getProductIds() != null && !sel.getProductIds().isEmpty();
        Collection<Long> ids = useIds ? new LinkedHashSet<>(sel.getProductIds()) : List.of(-1L);
        Page<Product> first = repository.products(scope.all(), scope.branchIds(), useIds, ids, pattern(sel.getSearch()),
                sel.getDepartmentId(), sel.getBrandId(), "ALL", BigDecimal.ZERO, PageRequest.of(0, 500, Sort.by("id")));
        if (first.getTotalElements() > max) {
            throw new PricingException("The selection has " + first.getTotalElements() + " products; narrow it to at most "
                    + max + " (filter by department, brand or search).");
        }
        List<Product> out = new ArrayList<>(first.getContent());
        for (int page = 1; page < first.getTotalPages(); page++) {
            out.addAll(repository.products(scope.all(), scope.branchIds(), useIds, ids, pattern(sel.getSearch()),
                    sel.getDepartmentId(), sel.getBrandId(), "ALL", BigDecimal.ZERO, PageRequest.of(page, 500, Sort.by("id"))).getContent());
        }
        if (out.isEmpty()) throw new PricingException("No products match the selection.");
        return out;
    }

    /** The product a code names: the branch's own product first, else the shared one. */
    private static Product pickProduct(List<Product> candidates, Long branchId, Scope scope) {
        if (candidates == null || candidates.isEmpty()) return null;
        Product shared = null;
        for (Product p : candidates) {
            Long owner = p.getBranch() != null ? p.getBranch().getId() : null;
            if (owner == null) {
                shared = p;
            } else if (owner.equals(branchId) && (scope.all() || scope.branchIds().contains(owner))) {
                return p;
            }
        }
        return shared;
    }

    private Map<Long, Long> customerCounts() {
        Map<Long, Long> out = new HashMap<>();
        for (Object[] row : repository.customerCountsByLevel()) {
            if (row[0] != null) out.put(((Number) row[0]).longValue(), number(row[1]));
        }
        return out;
    }

    private static long number(Object o) {
        return o instanceof Number n ? n.longValue() : 0L;
    }

    private static BigDecimal pct(BigDecimal value) {
        return value.divide(PricingRulesService.HUNDRED, 6, RoundingMode.HALF_UP);
    }

    private static String upper(String s) {
        return s == null ? "" : s.trim().toUpperCase(Locale.ROOT);
    }

    static String pattern(String search) {
        String term = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
        return term.isEmpty() ? "%" : "%" + term.replace("%", "\\%").replace("_", "\\_") + "%";
    }

    private static String cell(Long productId, Long levelId, Long branchId) {
        return productId + "|" + levelId + "|" + Objects.toString(branchId, "*");
    }

    private static final class Tally {
        int skipped;
        int unchanged;
        final Map<String, Integer> reasons = new LinkedHashMap<>();

        void skip(String reason) {
            skipped++;
            reasons.merge(reason, 1, Integer::sum);
        }
    }

    /** The caller's branch scope; {@code branchIds} is never empty (an IN list needs a value). */
    record Scope(boolean all, Set<Long> branchIds) {
        static Scope current() {
            BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
            boolean all = ctx == null || ctx.isAllBranches();
            Set<Long> ids = new HashSet<>(all || ctx.allowedBranchIds() == null ? Set.of() : ctx.allowedBranchIds());
            ids.add(-1L);
            return new Scope(all, ids);
        }
    }
}
