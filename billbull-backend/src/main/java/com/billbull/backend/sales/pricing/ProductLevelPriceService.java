package com.billbull.backend.sales.pricing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
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
import com.billbull.backend.inventory.product.ProductPriceChange;
import com.billbull.backend.inventory.product.ProductPriceChangeRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.security.BranchScope;
import com.billbull.backend.settings.branch.BranchRepository;

/**
 * Product prices under each price level, for all branches or one branch.
 *
 * <p>Branch scoping: a branch row can be read or written only by a user who can access that
 * branch; an all-branches row changes the price everywhere, so writing one needs all-branches
 * access. Every change is recorded in the product price-change audit ({@link ProductPriceChange})
 * as "L:&lt;level name&gt;".
 */
@Service
public class ProductLevelPriceService {

    private final ProductLevelPriceRepository repository;
    private final PriceLevelRepository levelRepository;
    private final ProductRepository productRepository;
    private final BranchRepository branchRepository;
    private final ProductPriceChangeRepository priceChangeRepository;

    public ProductLevelPriceService(ProductLevelPriceRepository repository,
                                    PriceLevelRepository levelRepository,
                                    ProductRepository productRepository,
                                    BranchRepository branchRepository,
                                    ProductPriceChangeRepository priceChangeRepository) {
        this.repository = repository;
        this.levelRepository = levelRepository;
        this.productRepository = productRepository;
        this.branchRepository = branchRepository;
        this.priceChangeRepository = priceChangeRepository;
    }

    /** One cell: a product's price under a level for a branch (null = all branches). Null price = remove. */
    public static class PriceRow {
        private Long productId;
        private Long priceLevelId;
        private Long branchId;
        private BigDecimal price;

        public PriceRow() {}
        public PriceRow(Long productId, Long priceLevelId, Long branchId, BigDecimal price) {
            this.productId = productId;
            this.priceLevelId = priceLevelId;
            this.branchId = branchId;
            this.price = price;
        }
        public Long getProductId() { return productId; }
        public void setProductId(Long productId) { this.productId = productId; }
        public Long getPriceLevelId() { return priceLevelId; }
        public void setPriceLevelId(Long priceLevelId) { this.priceLevelId = priceLevelId; }
        public Long getBranchId() { return branchId; }
        public void setBranchId(Long branchId) { this.branchId = branchId; }
        public BigDecimal getPrice() { return price; }
        public void setPrice(BigDecimal price) { this.price = price; }
    }

    public record PriceRowResponse(Long id, Long productId, Long priceLevelId, String priceLevelName,
                                   Long branchId, BigDecimal price) {}

    // ------------------------------------------------------------------
    // Read
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<PriceRowResponse> listForProducts(Collection<Long> productIds) {
        if (productIds == null || productIds.isEmpty()) return List.of();
        Map<Long, PriceLevel> levels = levelRepository.findAll().stream()
                .collect(Collectors.toMap(PriceLevel::getId, Function.identity()));
        return repository.findByProductIdIn(new HashSet<>(productIds)).stream()
                .filter(ProductLevelPrice::isActive)
                .filter(row -> canRead(row.getBranchId()))
                .map(row -> toResponse(row, levels.get(row.getPriceLevelId())))
                .toList();
    }

    // ------------------------------------------------------------------
    // Write
    // ------------------------------------------------------------------

    /**
     * Replaces one product's level prices within the caller's writable scope: rows sent are
     * created/updated, writable rows not sent are removed, rows the caller can't write (another
     * branch's) are left alone.
     */
    @Transactional
    public List<PriceRowResponse> replaceForProduct(Long productId, List<PriceRow> rows) {
        requireProduct(productId);
        List<PriceRow> incoming = rows == null ? List.of() : rows;
        incoming.forEach(r -> r.setProductId(productId));

        Set<String> keep = new HashSet<>();
        for (PriceRow r : incoming) {
            if (r.getPrice() != null) keep.add(key(r.getPriceLevelId(), r.getBranchId()));
        }
        List<PriceRow> changes = new ArrayList<>(incoming);
        for (ProductLevelPrice existing : repository.findByProductId(productId)) {
            if (!canWrite(existing.getBranchId())) continue;
            if (!keep.contains(key(existing.getPriceLevelId(), existing.getBranchId()))) {
                changes.add(new PriceRow(productId, existing.getPriceLevelId(), existing.getBranchId(), null));
            }
        }
        upsert(changes);
        return listForProducts(List.of(productId));
    }

    /** Sets or clears individual cells (the price-level grid). A null price removes the cell. */
    @Transactional
    public List<PriceRowResponse> upsert(List<PriceRow> rows) {
        if (rows == null || rows.isEmpty()) return List.of();

        Map<Long, PriceLevel> levels = new HashMap<>();
        Set<Long> productIds = new HashSet<>();
        for (PriceRow r : rows) {
            if (r.getProductId() == null) throw new PricingException("productId is required.");
            if (r.getPriceLevelId() == null) throw new PricingException("priceLevelId is required.");
            productIds.add(r.getProductId());
            levels.computeIfAbsent(r.getPriceLevelId(), id -> levelRepository.findById(id)
                    .orElseThrow(() -> new PricingException("Price level " + id + " does not exist.")));
        }
        Map<Long, Product> products = new HashMap<>();
        for (Long id : productIds) products.put(id, requireProduct(id));

        Map<String, ProductLevelPrice> existingByKey = new HashMap<>();
        for (ProductLevelPrice row : repository.findByProductIdIn(productIds)) {
            existingByKey.put(fullKey(row.getProductId(), row.getPriceLevelId(), row.getBranchId()), row);
        }

        List<ProductLevelPrice> toSave = new ArrayList<>();
        List<ProductLevelPrice> toDelete = new ArrayList<>();
        List<ProductPriceChange> audit = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        for (PriceRow r : rows) {
            PriceLevel level = levels.get(r.getPriceLevelId());
            Product product = products.get(r.getProductId());
            assertWritable(r.getBranchId(), product);
            String k = fullKey(r.getProductId(), r.getPriceLevelId(), r.getBranchId());
            if (!seen.add(k)) throw new PricingException("Duplicate price for the same product, level and branch.");
            ProductLevelPrice existing = existingByKey.get(k);

            if (r.getPrice() == null) {
                if (existing != null) {
                    toDelete.add(existing);
                    audit.add(change(r, level, existing.getPrice(), null));
                }
                continue;
            }
            if (level.isSystemDefault()) {
                throw new PricingException("'" + level.getName()
                        + "' is the default level; its price is the product's own selling price.");
            }
            if (!level.isActive()) {
                throw new PricingException("Price level '" + level.getName() + "' is inactive.");
            }
            if (r.getPrice().signum() <= 0) {
                throw new PricingException("A price-level price must be greater than zero.");
            }
            BigDecimal price = r.getPrice().setScale(2, RoundingMode.HALF_UP);
            ProductLevelPrice row = existing != null ? existing : new ProductLevelPrice();
            BigDecimal before = existing != null ? existing.getPrice() : null;
            row.setProductId(r.getProductId());
            row.setPriceLevelId(r.getPriceLevelId());
            row.setBranchId(r.getBranchId());
            row.setPrice(price);
            row.setActive(true);
            toSave.add(row);
            if (before == null || before.compareTo(price) != 0) audit.add(change(r, level, before, price));
        }

        if (!toDelete.isEmpty()) {
            repository.deleteAll(toDelete);
            repository.flush();
        }
        if (!toSave.isEmpty()) repository.saveAll(toSave);
        if (!audit.isEmpty()) priceChangeRepository.saveAll(audit);

        return listForProducts(productIds);
    }

    // ------------------------------------------------------------------

    private Product requireProduct(Long productId) {
        Product product = productRepository.findById(productId)
                .filter(Product::isActive)
                .orElseThrow(() -> new PricingException("Product " + productId + " does not exist."));
        // A branch-owned product belongs to that branch's users only.
        if (product.getBranch() != null && product.getBranch().getId() != null) {
            BranchScope.assertCanAccess(product.getBranch().getId());
        }
        return product;
    }

    private void assertWritable(Long branchId, Product product) {
        if (branchId != null) {
            if (!branchRepository.existsById(branchId)) {
                throw new PricingException("Branch " + branchId + " does not exist.");
            }
            BranchScope.assertCanAccess(branchId);
            if (product.getBranch() != null && product.getBranch().getId() != null
                    && !product.getBranch().getId().equals(branchId)) {
                throw new PricingException("Product " + product.getCode() + " belongs to another branch.");
            }
            return;
        }
        if (!canWrite(null)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Setting an all-branches price needs access to every branch; set a price for your branch instead.");
        }
    }

    /** No branch context (system / tests) or all-branches users may touch every row. */
    private static boolean canWrite(Long branchId) {
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        if (ctx == null || ctx.isAllBranches()) return true;
        return branchId != null && ctx.allowedBranchIds().contains(branchId);
    }

    /** All-branches rows are readable by everyone who can read prices; branch rows by that branch. */
    private static boolean canRead(Long branchId) {
        if (branchId == null) return true;
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        return ctx == null || ctx.isAllBranches() || ctx.allowedBranchIds().contains(branchId);
    }

    private static ProductPriceChange change(PriceRow r, PriceLevel level, BigDecimal before, BigDecimal after) {
        String label = "L:" + level.getName();
        if (label.length() > 32) label = label.substring(0, 32);
        return new ProductPriceChange(r.getProductId(), r.getBranchId(), label, before, after);
    }

    private static PriceRowResponse toResponse(ProductLevelPrice row, PriceLevel level) {
        return new PriceRowResponse(row.getId(), row.getProductId(), row.getPriceLevelId(),
                level != null ? level.getName() : null, row.getBranchId(), row.getPrice());
    }

    private static String key(Long levelId, Long branchId) {
        return levelId + "|" + Objects.toString(branchId, "*");
    }

    private static String fullKey(Long productId, Long levelId, Long branchId) {
        return productId + "|" + key(levelId, branchId);
    }
}
