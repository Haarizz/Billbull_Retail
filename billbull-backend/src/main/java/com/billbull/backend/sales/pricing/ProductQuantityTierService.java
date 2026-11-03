package com.billbull.backend.sales.pricing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductPacking;
import com.billbull.backend.inventory.product.ProductPackingRepository;
import com.billbull.backend.inventory.product.ProductPriceChange;
import com.billbull.backend.inventory.product.ProductPriceChangeRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.security.BranchScope;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;

/**
 * Quantity tiers (Pricing Phase 3): create, edit, deactivate / reactivate and list a product's
 * quantity-based prices per price level, for all branches or one branch.
 *
 * <p>Rules: the threshold is a positive base-unit quantity (up to 3 decimals) and the price a
 * positive amount per base unit; one live tier per product, level, branch scope and threshold.
 * Branch scoping is the same as {@link ProductLevelPriceService}: a branch tier needs access to that
 * branch, an all-branches tier needs all-branches access. An edit names the version it was made
 * against ({@code expectedUpdatedAt}), so two people editing the same tier can't silently overwrite
 * each other. Every change is written to the product price-change audit as {@code T:<level> <qty>+}.
 * Tiers are never physically deleted.
 */
@Service
public class ProductQuantityTierService {

    static final int MAX_TIERS_PER_SCOPE = 50;

    private final ProductQuantityTierRepository repository;
    private final PriceLevelRepository levelRepository;
    private final ProductRepository productRepository;
    private final ProductPackingRepository packingRepository;
    private final BranchRepository branchRepository;
    private final ProductPriceChangeRepository priceChangeRepository;

    public ProductQuantityTierService(ProductQuantityTierRepository repository,
                                      PriceLevelRepository levelRepository,
                                      ProductRepository productRepository,
                                      ProductPackingRepository packingRepository,
                                      BranchRepository branchRepository,
                                      ProductPriceChangeRepository priceChangeRepository) {
        this.repository = repository;
        this.levelRepository = levelRepository;
        this.productRepository = productRepository;
        this.packingRepository = packingRepository;
        this.branchRepository = branchRepository;
        this.priceChangeRepository = priceChangeRepository;
    }

    /** Create body; on edit only {@code minQuantity}, {@code price} and {@code expectedUpdatedAt} are read. */
    public static class TierRequest {
        private Long productId;
        private Long priceLevelId;
        private Long branchId;
        private BigDecimal minQuantity;
        private BigDecimal price;
        /** The tier's {@code updatedAt} the edit was made against (optimistic check); null skips it. */
        private LocalDateTime expectedUpdatedAt;

        public Long getProductId() { return productId; }
        public void setProductId(Long productId) { this.productId = productId; }
        public Long getPriceLevelId() { return priceLevelId; }
        public void setPriceLevelId(Long priceLevelId) { this.priceLevelId = priceLevelId; }
        public Long getBranchId() { return branchId; }
        public void setBranchId(Long branchId) { this.branchId = branchId; }
        public BigDecimal getMinQuantity() { return minQuantity; }
        public void setMinQuantity(BigDecimal minQuantity) { this.minQuantity = minQuantity; }
        public BigDecimal getPrice() { return price; }
        public void setPrice(BigDecimal price) { this.price = price; }
        public LocalDateTime getExpectedUpdatedAt() { return expectedUpdatedAt; }
        public void setExpectedUpdatedAt(LocalDateTime expectedUpdatedAt) { this.expectedUpdatedAt = expectedUpdatedAt; }
    }

    /**
     * One tier. {@code baseUnit} names the unit thresholds and prices are in; {@code updatedAt}
     * (else {@code createdAt}) is the version an edit sends back.
     */
    public record TierResponse(Long id, Long productId, String productCode, String productName, String baseUnit,
                               Long priceLevelId, String priceLevelName, Long branchId, String branchName,
                               BigDecimal minQuantity, BigDecimal price, boolean active,
                               LocalDateTime updatedAt) {}

    /** A product that has live tiers, for the tier list's search. */
    public record TieredProduct(Long productId, String productCode, String productName, String baseUnit,
                                int tierCount, List<String> levels) {}

    public record TieredProductPage(List<TieredProduct> content, int page, int size, long totalElements) {}

    // ------------------------------------------------------------------
    // Read
    // ------------------------------------------------------------------

    /** Tiers of the given products the caller may read (all-branches rows, and their branches' rows). */
    @Transactional(readOnly = true)
    public List<TierResponse> listForProducts(Collection<Long> productIds, boolean includeInactive) {
        if (productIds == null || productIds.isEmpty()) return List.of();
        Set<Long> ids = new LinkedHashSet<>(productIds);
        List<ProductQuantityTier> rows = includeInactive
                ? repository.findAll().stream().filter(t -> ids.contains(t.getProductId())).toList()
                : repository.findByProductIdInAndIsActiveTrue(ids);
        return toResponses(rows.stream().filter(t -> canRead(t.getBranchId())).toList());
    }

    /** Products with live tiers, searchable by code / name and filterable by level. */
    @Transactional(readOnly = true)
    public TieredProductPage tieredProducts(String search, Long levelId, int page, int size) {
        int safeSize = Math.max(1, Math.min(size, 100));
        int safePage = Math.max(0, page);
        Map<Long, List<ProductQuantityTier>> byProduct = repository.findAll().stream()
                .filter(ProductQuantityTier::isActive)
                .filter(t -> levelId == null || levelId.equals(t.getPriceLevelId()))
                .filter(t -> canRead(t.getBranchId()))
                .collect(Collectors.groupingBy(ProductQuantityTier::getProductId));
        if (byProduct.isEmpty()) return new TieredProductPage(List.of(), safePage, safeSize, 0);

        Map<Long, Product> products = new HashMap<>();
        productRepository.findAllById(byProduct.keySet()).forEach(p -> products.put(p.getId(), p));
        Map<Long, PriceLevel> levels = levelRepository.findAll().stream()
                .collect(Collectors.toMap(PriceLevel::getId, Function.identity()));
        String q = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);

        List<Product> matching = products.values().stream()
                .filter(p -> p.isActive() && canSeeProduct(p))
                .filter(p -> q.isEmpty()
                        || (p.getCode() != null && p.getCode().toLowerCase(Locale.ROOT).contains(q))
                        || (p.getName() != null && p.getName().toLowerCase(Locale.ROOT).contains(q)))
                .sorted(Comparator.comparing(p -> Objects.toString(p.getCode(), "")))
                .toList();
        List<Product> slice = matching.stream().skip((long) safePage * safeSize).limit(safeSize).toList();
        Map<Long, String> units = baseUnits(slice.stream().map(Product::getId).toList());
        List<TieredProduct> content = slice.stream().map(p -> {
            List<ProductQuantityTier> tiers = byProduct.get(p.getId());
            List<String> levelNames = tiers.stream().map(t -> levels.get(t.getPriceLevelId()))
                    .filter(Objects::nonNull).map(PriceLevel::getName).distinct().sorted().toList();
            return new TieredProduct(p.getId(), p.getCode(), p.getName(), units.get(p.getId()), tiers.size(), levelNames);
        }).toList();
        return new TieredProductPage(content, safePage, safeSize, matching.size());
    }

    // ------------------------------------------------------------------
    // Write
    // ------------------------------------------------------------------

    @Transactional
    public TierResponse create(TierRequest request) {
        if (request == null || request.getProductId() == null) throw new PricingException("productId is required.");
        if (request.getPriceLevelId() == null) throw new PricingException("priceLevelId is required.");
        Product product = requireProduct(request.getProductId());
        PriceLevel level = requireLiveLevel(request.getPriceLevelId());
        assertWritable(request.getBranchId(), product);
        BigDecimal minQty = validMinQuantity(request.getMinQuantity());
        BigDecimal price = validPrice(request.getPrice());

        List<ProductQuantityTier> live = repository.lockLive(product.getId(), level.getId());
        assertNoDuplicate(live, request.getBranchId(), minQty, null);
        long inScope = live.stream().filter(t -> Objects.equals(t.getBranchId(), request.getBranchId())).count();
        if (inScope >= MAX_TIERS_PER_SCOPE) {
            throw new PricingException("At most " + MAX_TIERS_PER_SCOPE + " quantity tiers per product, level and branch.");
        }

        ProductQuantityTier tier = new ProductQuantityTier();
        tier.setProductId(product.getId());
        tier.setPriceLevelId(level.getId());
        tier.setBranchId(request.getBranchId());
        tier.setMinQuantity(minQty);
        tier.setPrice(price);
        tier.setActive(true);
        ProductQuantityTier saved = repository.save(tier);
        audit(saved, level, null, price);
        return toResponses(List.of(saved)).get(0);
    }

    /** Changes a live tier's threshold and/or price. Product, level and branch scope are fixed. */
    @Transactional
    public TierResponse update(Long id, TierRequest request) {
        ProductQuantityTier tier = requireTier(id);
        if (!tier.isActive()) throw new PricingException("This quantity tier is deactivated; reactivate it first.");
        Product product = requireProduct(tier.getProductId());
        assertWritable(tier.getBranchId(), product);
        assertCurrentVersion(tier, request != null ? request.getExpectedUpdatedAt() : null);
        PriceLevel level = requireLiveLevel(tier.getPriceLevelId());
        BigDecimal minQty = validMinQuantity(request != null ? request.getMinQuantity() : null);
        BigDecimal price = validPrice(request != null ? request.getPrice() : null);

        List<ProductQuantityTier> live = repository.lockLive(tier.getProductId(), tier.getPriceLevelId());
        assertNoDuplicate(live, tier.getBranchId(), minQty, tier.getId());

        BigDecimal before = tier.getPrice();
        boolean thresholdChanged = tier.getMinQuantity() == null || tier.getMinQuantity().compareTo(minQty) != 0;
        tier.setMinQuantity(minQty);
        tier.setPrice(price);
        ProductQuantityTier saved = repository.save(tier);
        if (thresholdChanged || before == null || before.compareTo(price) != 0) audit(saved, level, before, price);
        return toResponses(List.of(saved)).get(0);
    }

    /** Deactivates (kept on record, no longer applies) or reactivates a tier. */
    @Transactional
    public TierResponse setActive(Long id, boolean active, LocalDateTime expectedUpdatedAt) {
        ProductQuantityTier tier = requireTier(id);
        Product product = requireProduct(tier.getProductId());
        assertWritable(tier.getBranchId(), product);
        assertCurrentVersion(tier, expectedUpdatedAt);
        if (tier.isActive() == active) return toResponses(List.of(tier)).get(0);
        PriceLevel level = levelRepository.findById(tier.getPriceLevelId())
                .orElseThrow(() -> new PricingException("Price level " + tier.getPriceLevelId() + " does not exist."));
        if (active) {
            if (!level.isActive()) throw new PricingException("Price level '" + level.getName() + "' is inactive.");
            List<ProductQuantityTier> live = repository.lockLive(tier.getProductId(), tier.getPriceLevelId());
            assertNoDuplicate(live, tier.getBranchId(), tier.getMinQuantity(), tier.getId());
        }
        tier.setActive(active);
        ProductQuantityTier saved = repository.save(tier);
        audit(saved, level, active ? null : tier.getPrice(), active ? tier.getPrice() : null);
        return toResponses(List.of(saved)).get(0);
    }

    // ------------------------------------------------------------------

    private static BigDecimal validMinQuantity(BigDecimal v) {
        if (v == null || v.signum() <= 0) {
            throw new PricingException("The tier's minimum quantity must be greater than zero.");
        }
        BigDecimal stripped = v.stripTrailingZeros();
        if (stripped.scale() > 3) throw new PricingException("The minimum quantity can have at most 3 decimals.");
        if (stripped.precision() - stripped.scale() > 12) throw new PricingException("The minimum quantity is too large.");
        return v.setScale(3, RoundingMode.UNNECESSARY);
    }

    private static BigDecimal validPrice(BigDecimal v) {
        if (v == null || v.signum() <= 0) throw new PricingException("A tier price must be greater than zero.");
        if (v.stripTrailingZeros().scale() > 2) throw new PricingException("A tier price can have at most 2 decimals.");
        if (v.precision() - v.scale() > 13) throw new PricingException("The tier price is too large.");
        return v.setScale(2, RoundingMode.UNNECESSARY);
    }

    private static void assertNoDuplicate(List<ProductQuantityTier> live, Long branchId, BigDecimal minQty, Long selfId) {
        for (ProductQuantityTier t : live) {
            if (!t.isActive() || Objects.equals(t.getId(), selfId)) continue;
            if (Objects.equals(t.getBranchId(), branchId) && t.getMinQuantity() != null
                    && t.getMinQuantity().compareTo(minQty) == 0) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "A tier from "
                        + minQty.stripTrailingZeros().toPlainString() + " already exists for this product, level and "
                        + (branchId == null ? "all branches." : "branch."));
            }
        }
    }

    private static void assertCurrentVersion(ProductQuantityTier tier, LocalDateTime expected) {
        if (expected == null) return;
        LocalDateTime current = tier.getUpdatedAt() != null ? tier.getUpdatedAt() : tier.getCreatedAt();
        if (current != null && !current.withNano(current.getNano() / 1000 * 1000)
                .equals(expected.withNano(expected.getNano() / 1000 * 1000))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This tier was changed by someone else meanwhile. Reload and try again.");
        }
    }

    private ProductQuantityTier requireTier(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Quantity tier " + id + " not found."));
    }

    private PriceLevel requireLiveLevel(Long id) {
        PriceLevel level = levelRepository.findById(id)
                .orElseThrow(() -> new PricingException("Price level " + id + " does not exist."));
        if (!level.isActive()) throw new PricingException("Price level '" + level.getName() + "' is inactive.");
        return level;
    }

    private Product requireProduct(Long productId) {
        Product product = productRepository.findById(productId)
                .filter(Product::isActive)
                .orElseThrow(() -> new PricingException("Product " + productId + " does not exist."));
        if (product.getBranch() != null && product.getBranch().getId() != null) {
            BranchScope.assertCanAccess(product.getBranch().getId());
        }
        return product;
    }

    private void assertWritable(Long branchId, Product product) {
        if (branchId != null) {
            if (!branchRepository.existsById(branchId)) throw new PricingException("Branch " + branchId + " does not exist.");
            BranchScope.assertCanAccess(branchId);
            if (product.getBranch() != null && product.getBranch().getId() != null
                    && !product.getBranch().getId().equals(branchId)) {
                throw new PricingException("Product " + product.getCode() + " belongs to another branch.");
            }
            return;
        }
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        if (ctx != null && !ctx.isAllBranches()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "An all-branches tier needs access to every branch; set a tier for your branch instead.");
        }
    }

    private static boolean canRead(Long branchId) {
        if (branchId == null) return true;
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        return ctx == null || ctx.isAllBranches() || ctx.allowedBranchIds().contains(branchId);
    }

    private static boolean canSeeProduct(Product p) {
        return p.getBranch() == null || p.getBranch().getId() == null || canRead(p.getBranch().getId());
    }

    private void audit(ProductQuantityTier tier, PriceLevel level, BigDecimal before, BigDecimal after) {
        String label = "T:" + level.getName() + " " + tier.getMinQuantity().stripTrailingZeros().toPlainString() + "+";
        if (label.length() > 32) label = label.substring(0, 32);
        priceChangeRepository.save(new ProductPriceChange(tier.getProductId(), tier.getBranchId(), label, before, after));
    }

    /** The unit thresholds are counted in: the product's conversion-1 packing, if it has one. */
    private Map<Long, String> baseUnits(List<Long> productIds) {
        if (productIds.isEmpty()) return Map.of();
        Map<Long, String> out = new HashMap<>();
        for (ProductPacking pp : packingRepository.findByProductIdIn(new ArrayList<>(productIds))) {
            if (pp.getProduct() == null || !pp.isActive() || pp.getUnit() == null || pp.getUnit().getName() == null
                    || pp.getConversion() == null || pp.getConversion().compareTo(BigDecimal.ONE) != 0) continue;
            out.putIfAbsent(pp.getProduct().getId(), pp.getUnit().getName().trim());
        }
        return out;
    }

    private List<TierResponse> toResponses(List<ProductQuantityTier> rows) {
        if (rows.isEmpty()) return List.of();
        Set<Long> productIds = new HashSet<>();
        Set<Long> branchIds = new HashSet<>();
        rows.forEach(t -> {
            productIds.add(t.getProductId());
            if (t.getBranchId() != null) branchIds.add(t.getBranchId());
        });
        Map<Long, Product> products = new HashMap<>();
        productRepository.findAllById(productIds).forEach(p -> products.put(p.getId(), p));
        Map<Long, String> branches = new HashMap<>();
        if (!branchIds.isEmpty()) {
            for (Branch b : branchRepository.findAllById(branchIds)) branches.put(b.getId(), b.getName());
        }
        Map<Long, PriceLevel> levels = levelRepository.findAll().stream()
                .collect(Collectors.toMap(PriceLevel::getId, Function.identity()));
        Map<Long, String> units = baseUnits(new ArrayList<>(productIds));
        return rows.stream()
                .sorted(Comparator.comparing(ProductQuantityTier::getProductId)
                        .thenComparing(t -> levelSort(levels.get(t.getPriceLevelId())))
                        .thenComparing(t -> t.getBranchId() == null ? 0L : t.getBranchId())
                        .thenComparing(ProductQuantityTier::getMinQuantity, Comparator.nullsLast(Comparator.naturalOrder())))
                .map(t -> {
                    Product p = products.get(t.getProductId());
                    PriceLevel l = levels.get(t.getPriceLevelId());
                    return new TierResponse(t.getId(), t.getProductId(), p != null ? p.getCode() : null,
                            p != null ? p.getName() : null, units.get(t.getProductId()), t.getPriceLevelId(),
                            l != null ? l.getName() : null, t.getBranchId(),
                            t.getBranchId() != null ? branches.get(t.getBranchId()) : null,
                            t.getMinQuantity() != null ? t.getMinQuantity().stripTrailingZeros() : null,
                            t.getPrice(), t.isActive(),
                            t.getUpdatedAt() != null ? t.getUpdatedAt() : t.getCreatedAt());
                })
                .toList();
    }

    private static String levelSort(PriceLevel l) {
        if (l == null) return "~";
        return String.format("%06d|%s", l.getSortOrder() != null ? l.getSortOrder() : 0, l.getName());
    }
}
