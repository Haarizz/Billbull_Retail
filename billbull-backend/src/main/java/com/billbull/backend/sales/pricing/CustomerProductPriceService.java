package com.billbull.backend.sales.pricing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductPriceChange;
import com.billbull.backend.inventory.product.ProductPriceChangeRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.pricing.PricingModels.Context;
import com.billbull.backend.sales.pricing.PricingModels.Line;
import com.billbull.backend.sales.pricing.PricingModels.LinePrice;
import com.billbull.backend.sales.pricing.PricingModels.Resolution;
import com.billbull.backend.sales.settings.SalesItemPricePolicy;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.security.BranchScope;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.util.PageResponse;

/**
 * Customer-specific (negotiated) product prices — Pricing Phase 2.
 *
 * <p>Branch scoping follows {@link ProductLevelPriceService}: a branch row can be read or written
 * only by a user who can access that branch; an all-branches row changes the price everywhere, so
 * writing one needs all-branches access. Two live mappings (not removed, enabled) for the same
 * customer, product and branch scope may never cover the same day — checked here under a lock on
 * the customer row and backed by the V128 database constraints. Every price change is recorded in
 * the product price-change audit as "C:&lt;customer code&gt;".
 *
 * <p>Changing or removing a mapping never alters a saved transaction: invoice lines carry their own
 * charged price.
 */
@Service
public class CustomerProductPriceService {

    public enum Status { CURRENT, FUTURE, EXPIRED, DISABLED }

    private final CustomerProductPriceRepository repository;
    private final CustomerRepository customerRepository;
    private final ProductRepository productRepository;
    private final BranchRepository branchRepository;
    private final ProductPriceChangeRepository priceChangeRepository;
    private final PricingResolutionService resolver;

    public CustomerProductPriceService(CustomerProductPriceRepository repository,
                                       CustomerRepository customerRepository,
                                       ProductRepository productRepository,
                                       BranchRepository branchRepository,
                                       ProductPriceChangeRepository priceChangeRepository,
                                       PricingResolutionService resolver) {
        this.repository = repository;
        this.customerRepository = customerRepository;
        this.productRepository = productRepository;
        this.branchRepository = branchRepository;
        this.priceChangeRepository = priceChangeRepository;
        this.resolver = resolver;
    }

    /** Pricing rules (below-cost guard); setter-injected so hand-built tests keep compiling. */
    private PricingRulesService rules;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setRules(PricingRulesService rules) {
        this.rules = rules;
    }

    private void assertNotBelowCost(CustomerProductPrice row, Product product) {
        if (rules == null || !row.isEnabled()) return;
        rules.assertNotBelowCost(row.getProductId(), product.getCode(), row.getBranchId(), row.getPrice(),
                "The negotiated price");
    }

    // ------------------------------------------------------------------
    // DTOs
    // ------------------------------------------------------------------

    /** Create / update body. On update, customerId and productId may be omitted (they can't change). */
    public static class PriceRequest {
        private Long customerId;
        private Long productId;
        private Long branchId;
        private BigDecimal price;
        private LocalDate effectiveFrom;
        private LocalDate effectiveTo;
        private Boolean enabled;
        private String notes;

        public Long getCustomerId() { return customerId; }
        public void setCustomerId(Long customerId) { this.customerId = customerId; }
        public Long getProductId() { return productId; }
        public void setProductId(Long productId) { this.productId = productId; }
        public Long getBranchId() { return branchId; }
        public void setBranchId(Long branchId) { this.branchId = branchId; }
        public BigDecimal getPrice() { return price; }
        public void setPrice(BigDecimal price) { this.price = price; }
        public LocalDate getEffectiveFrom() { return effectiveFrom; }
        public void setEffectiveFrom(LocalDate effectiveFrom) { this.effectiveFrom = effectiveFrom; }
        public LocalDate getEffectiveTo() { return effectiveTo; }
        public void setEffectiveTo(LocalDate effectiveTo) { this.effectiveTo = effectiveTo; }
        public Boolean getEnabled() { return enabled; }
        public void setEnabled(Boolean enabled) { this.enabled = enabled; }
        public String getNotes() { return notes; }
        public void setNotes(String notes) { this.notes = notes; }
    }

    public record PriceResponse(Long id, Long customerId, String customerCode, String customerName,
                                Long productId, String productCode, String productName,
                                Long branchId, String branchName, BigDecimal price,
                                LocalDate effectiveFrom, LocalDate effectiveTo, boolean enabled,
                                Status status, String notes,
                                LocalDateTime createdAt, String createdBy,
                                LocalDateTime updatedAt, String updatedBy) {}

    /**
     * A product's effective price for a customer in one branch on one day.
     *
     * @param price          what the customer is charged (negotiated price when one applies)
     * @param referencePrice what they would be charged without a negotiated price
     */
    public record EffectivePrice(Long productId, String productCode, String productName, String unit,
                                 BigDecimal price, PriceSource source,
                                 BigDecimal referencePrice, PriceSource referenceSource,
                                 Long priceLevelId, String priceLevelName,
                                 Long customerPriceId, Long customerPriceBranchId,
                                 LocalDate effectiveFrom, LocalDate effectiveTo) {}

    public record EffectivePrices(Long customerId, Long branchId, LocalDate date, Long priceLevelId,
                                  String priceLevelName, List<EffectivePrice> products) {}

    public record CustomerStatus(Long customerId, String customerCode, long liveMappings) {}

    // ------------------------------------------------------------------
    // Read
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public PageResponse<PriceResponse> search(Long customerId, String search, boolean currentOnly, int page, int size) {
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        boolean all = ctx == null || ctx.isAllBranches();
        Set<Long> branchIds = new HashSet<>(all || ctx.allowedBranchIds() == null ? Set.of() : ctx.allowedBranchIds());
        branchIds.add(-1L); // never an empty IN list
        String term = search == null ? "" : search.trim().toLowerCase();
        String pattern = term.isEmpty() ? "%" : "%" + term.replace("%", "\\%").replace("_", "\\_") + "%";
        LocalDate today = resolver.pricingDate(null);
        Page<CustomerProductPrice> rows = repository.search(customerId == null ? -1L : customerId, all, branchIds,
                pattern, currentOnly, today,
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200),
                        Sort.by(Sort.Order.asc("customerId"), Sort.Order.asc("productId"),
                                Sort.Order.desc("effectiveFrom"), Sort.Order.desc("id"))));
        List<PriceResponse> content = toResponses(rows.getContent(), today);
        return new PageResponse<>(content, rows.getNumber(), rows.getSize(), rows.getTotalElements(),
                rows.getTotalPages());
    }

    @Transactional(readOnly = true)
    public PriceResponse get(Long id) {
        CustomerProductPrice row = require(id);
        assertReadable(row.getBranchId());
        return toResponses(List.of(row), resolver.pricingDate(null)).get(0);
    }

    /** How many enabled negotiated prices the customer has (any product, branch, date). */
    @Transactional(readOnly = true)
    public CustomerStatus status(Long customerId, String customerCode) {
        Customer customer = resolver.findCustomer(customerId, customerCode);
        if (customer == null) return new CustomerStatus(null, customerCode, 0);
        return new CustomerStatus(customer.getId(), customer.getCode(),
                repository.countByCustomerIdAndIsActiveTrueAndEnabledTrue(customer.getId()));
    }

    /**
     * Each product's effective price for the customer on {@code branchId} and {@code date}, through
     * the shared resolver (customer price → customer's default level → default price), with the
     * price they would pay without a negotiated price beside it.
     */
    @Transactional(readOnly = true)
    public EffectivePrices effective(Long customerId, Collection<Long> productIds, Long branchId, LocalDate date,
                                     SalesItemPricePolicy policy) {
        Customer customer = requireCustomer(customerId);
        if (branchId != null) BranchScope.assertCanAccess(branchId);
        List<Long> ids = productIds == null ? List.of() : new ArrayList<>(new LinkedHashSet<>(productIds));
        Map<Long, Product> products = productRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity(), (a, b) -> a));
        List<Line> lines = ids.stream().map(id -> new Line(id, null, null, BigDecimal.ONE)).toList();
        Resolution r = resolver.resolve(new Context(branchId, null, customer.getId(), customer.getCode(),
                policy != null ? policy : SalesItemPricePolicy.RETAIL, date), lines);
        List<EffectivePrice> out = new ArrayList<>(ids.size());
        for (int i = 0; i < ids.size(); i++) {
            LinePrice lp = r.lines().get(i);
            Product p = products.get(ids.get(i));
            out.add(new EffectivePrice(ids.get(i), p != null ? p.getCode() : lp.itemCode(), p != null ? p.getName() : null,
                    lp.unit(), lp.price(), lp.source(), lp.fallbackPrice(), lp.fallbackSource(),
                    lp.priceLevelId(), lp.priceLevelName(), lp.customerPriceId(), lp.customerPriceBranchId(),
                    lp.customerPriceFrom(), lp.customerPriceTo()));
        }
        return new EffectivePrices(customer.getId(), branchId, r.customer() != null ? r.customer().pricingDate() : date,
                r.level().id(), r.level().name(), out);
    }

    // ------------------------------------------------------------------
    // Write
    // ------------------------------------------------------------------

    @Transactional
    public PriceResponse create(PriceRequest request) {
        if (request == null) throw new PricingException("A request body is required.");
        Customer customer = requireCustomer(request.getCustomerId());
        Product product = requireProduct(request.getProductId());
        assertWritable(request.getBranchId(), product);
        repository.lockCustomer(customer.getId());

        CustomerProductPrice row = new CustomerProductPrice();
        row.setCustomerId(customer.getId());
        row.setProductId(product.getId());
        row.setBranchId(request.getBranchId());
        row.setPrice(validPrice(request.getPrice()));
        row.setEffectiveFrom(request.getEffectiveFrom() != null ? request.getEffectiveFrom() : resolver.pricingDate(null));
        row.setEffectiveTo(request.getEffectiveTo());
        row.setEnabled(request.getEnabled() == null || request.getEnabled());
        row.setNotes(notes(request.getNotes()));
        validateDates(row);
        assertNoOverlap(row);
        assertNotBelowCost(row, product);

        CustomerProductPrice saved = repository.saveAndFlush(row);
        audit(saved, customer, null, saved.getPrice());
        return toResponses(List.of(saved), resolver.pricingDate(null)).get(0);
    }

    @Transactional
    public PriceResponse update(Long id, PriceRequest request) {
        if (request == null) throw new PricingException("A request body is required.");
        CustomerProductPrice row = require(id);
        if (request.getCustomerId() != null && !request.getCustomerId().equals(row.getCustomerId())) {
            throw new PricingException("A negotiated price can't be moved to another customer; create a new one.");
        }
        if (request.getProductId() != null && !request.getProductId().equals(row.getProductId())) {
            throw new PricingException("A negotiated price can't be moved to another product; create a new one.");
        }
        Customer customer = requireCustomer(row.getCustomerId());
        Product product = requireProduct(row.getProductId());
        assertWritable(row.getBranchId(), product);           // the scope it is in now
        assertWritable(request.getBranchId(), product);       // and the scope it moves to
        repository.lockCustomer(customer.getId());

        BigDecimal before = row.getPrice();
        row.setBranchId(request.getBranchId());
        if (request.getPrice() != null) row.setPrice(validPrice(request.getPrice()));
        if (request.getEffectiveFrom() != null) row.setEffectiveFrom(request.getEffectiveFrom());
        row.setEffectiveTo(request.getEffectiveTo());
        if (request.getEnabled() != null) row.setEnabled(request.getEnabled());
        row.setNotes(notes(request.getNotes()));
        validateDates(row);
        assertNoOverlap(row);
        if (before == null || before.compareTo(row.getPrice()) != 0) assertNotBelowCost(row, product);

        CustomerProductPrice saved = repository.saveAndFlush(row);
        if (before == null || before.compareTo(saved.getPrice()) != 0) audit(saved, customer, before, saved.getPrice());
        return toResponses(List.of(saved), resolver.pricingDate(null)).get(0);
    }

    /** Activate / deactivate. Re-enabling is refused if it would overlap another live mapping. */
    @Transactional
    public PriceResponse setEnabled(Long id, boolean enabled) {
        CustomerProductPrice row = require(id);
        Product product = requireProduct(row.getProductId());
        assertWritable(row.getBranchId(), product);
        repository.lockCustomer(row.getCustomerId());
        row.setEnabled(enabled);
        if (enabled) assertNoOverlap(row);
        return toResponses(List.of(repository.saveAndFlush(row)), resolver.pricingDate(null)).get(0);
    }

    /**
     * Ends the mapping: it stops applying from today (its validity is closed yesterday). A mapping
     * that hasn't started yet can't be ended, so it is deactivated instead. History is kept.
     */
    @Transactional
    public PriceResponse discontinue(Long id) {
        CustomerProductPrice row = require(id);
        Product product = requireProduct(row.getProductId());
        assertWritable(row.getBranchId(), product);
        LocalDate today = resolver.pricingDate(null);
        LocalDate yesterday = today.minusDays(1);
        if (row.getEffectiveFrom() != null && row.getEffectiveFrom().isAfter(yesterday)) {
            row.setEnabled(false);
        } else if (row.getEffectiveTo() == null || row.getEffectiveTo().isAfter(yesterday)) {
            row.setEffectiveTo(yesterday);
        }
        return toResponses(List.of(repository.saveAndFlush(row)), today).get(0);
    }

    /** Removes the mapping (soft delete). Saved transactions keep the price they were charged. */
    @Transactional
    public void delete(Long id) {
        CustomerProductPrice row = require(id);
        Product product = productRepository.findById(row.getProductId()).orElse(null);
        if (product != null) assertWritable(row.getBranchId(), product);
        else assertWritableScope(row.getBranchId());
        row.setActive(false);
        repository.saveAndFlush(row);
        Customer customer = customerRepository.findById(row.getCustomerId()).orElse(null);
        audit(row, customer, row.getPrice(), null);
    }

    // ------------------------------------------------------------------
    // Validation
    // ------------------------------------------------------------------

    private void assertNoOverlap(CustomerProductPrice row) {
        if (!row.isActive() || !row.isEnabled()) return;
        for (CustomerProductPrice other : repository.findByCustomerIdAndProductIdAndIsActiveTrue(
                row.getCustomerId(), row.getProductId())) {
            if (Objects.equals(other.getId(), row.getId()) || !other.isEnabled()) continue;
            if (!Objects.equals(other.getBranchId(), row.getBranchId())) continue;
            if (overlaps(row.getEffectiveFrom(), row.getEffectiveTo(), other.getEffectiveFrom(), other.getEffectiveTo())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "This customer already has a negotiated price for this product"
                                + (row.getBranchId() == null ? " in all branches" : " in this branch")
                                + " valid " + describe(other.getEffectiveFrom(), other.getEffectiveTo())
                                + ". End or deactivate it first, or choose dates that don't overlap.");
            }
        }
    }

    static boolean overlaps(LocalDate fromA, LocalDate toA, LocalDate fromB, LocalDate toB) {
        boolean aStartsAfterB = toB != null && fromA != null && fromA.isAfter(toB);
        boolean bStartsAfterA = toA != null && fromB != null && fromB.isAfter(toA);
        return !aStartsAfterB && !bStartsAfterA;
    }

    private static String describe(LocalDate from, LocalDate to) {
        return "from " + from + (to == null ? " with no end date" : " to " + to);
    }

    private static void validateDates(CustomerProductPrice row) {
        if (row.getEffectiveFrom() == null) throw new PricingException("Effective-from date is required.");
        if (row.getEffectiveTo() != null && row.getEffectiveTo().isBefore(row.getEffectiveFrom())) {
            throw new PricingException("The end date can't be before the start date.");
        }
    }

    private static BigDecimal validPrice(BigDecimal price) {
        if (price == null) throw new PricingException("A negotiated price is required.");
        if (price.signum() <= 0) throw new PricingException("A negotiated price must be greater than zero.");
        BigDecimal scaled = price.setScale(2, RoundingMode.HALF_UP);
        if (scaled.precision() - scaled.scale() > 13) throw new PricingException("The negotiated price is too large.");
        return scaled;
    }

    private static String notes(String notes) {
        if (notes == null || notes.isBlank()) return null;
        String trimmed = notes.trim();
        return trimmed.length() > 500 ? trimmed.substring(0, 500) : trimmed;
    }

    private CustomerProductPrice require(Long id) {
        CustomerProductPrice row = id == null ? null : repository.findById(id).filter(CustomerProductPrice::isActive).orElse(null);
        if (row == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Negotiated price " + id + " not found.");
        return row;
    }

    private Customer requireCustomer(Long customerId) {
        if (customerId == null) throw new PricingException("customerId is required.");
        return customerRepository.findById(customerId)
                .orElseThrow(() -> new PricingException("Customer " + customerId + " does not exist."));
    }

    private Product requireProduct(Long productId) {
        if (productId == null) throw new PricingException("productId is required.");
        Product product = productRepository.findById(productId)
                .filter(Product::isActive)
                .orElseThrow(() -> new PricingException("Product " + productId + " does not exist or is inactive."));
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
        assertWritableScope(null);
    }

    private static void assertWritableScope(Long branchId) {
        if (branchId != null) {
            BranchScope.assertCanAccess(branchId);
            return;
        }
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        if (ctx != null && !ctx.isAllBranches()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "An all-branches negotiated price needs access to every branch; set a price for your branch instead.");
        }
    }

    private static void assertReadable(Long branchId) {
        if (branchId != null) BranchScope.assertCanAccess(branchId);
    }

    // ------------------------------------------------------------------

    private void audit(CustomerProductPrice row, Customer customer, BigDecimal before, BigDecimal after) {
        String code = customer != null && customer.getCode() != null ? customer.getCode() : String.valueOf(row.getCustomerId());
        String label = "C:" + code;
        if (label.length() > 32) label = label.substring(0, 32);
        priceChangeRepository.save(new ProductPriceChange(row.getProductId(), row.getBranchId(), label, before, after));
    }

    static Status statusOf(CustomerProductPrice row, LocalDate today) {
        if (!row.isEnabled()) return Status.DISABLED;
        if (row.getEffectiveFrom() != null && today.isBefore(row.getEffectiveFrom())) return Status.FUTURE;
        if (row.getEffectiveTo() != null && today.isAfter(row.getEffectiveTo())) return Status.EXPIRED;
        return Status.CURRENT;
    }

    /** Batch-loads the customers, products and branches the rows name: three queries per page. */
    List<PriceResponse> toResponses(List<CustomerProductPrice> rows, LocalDate today) {
        if (rows.isEmpty()) return List.of();
        Set<Long> customerIds = rows.stream().map(CustomerProductPrice::getCustomerId).collect(Collectors.toSet());
        Set<Long> productIds = rows.stream().map(CustomerProductPrice::getProductId).collect(Collectors.toSet());
        Set<Long> branchIds = rows.stream().map(CustomerProductPrice::getBranchId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, Customer> customers = new HashMap<>();
        customerRepository.findAllById(customerIds).forEach(c -> customers.put(c.getId(), c));
        Map<Long, Product> products = new HashMap<>();
        productRepository.findAllById(productIds).forEach(p -> products.put(p.getId(), p));
        Map<Long, Branch> branches = new HashMap<>();
        if (!branchIds.isEmpty()) branchRepository.findAllById(branchIds).forEach(b -> branches.put(b.getId(), b));

        List<PriceResponse> out = new ArrayList<>(rows.size());
        for (CustomerProductPrice row : rows) {
            Customer c = customers.get(row.getCustomerId());
            Product p = products.get(row.getProductId());
            Branch b = row.getBranchId() != null ? branches.get(row.getBranchId()) : null;
            out.add(new PriceResponse(row.getId(), row.getCustomerId(), c != null ? c.getCode() : null,
                    c != null ? c.getName() : null, row.getProductId(), p != null ? p.getCode() : null,
                    p != null ? p.getName() : null, row.getBranchId(), b != null ? b.getName() : null,
                    row.getPrice(), row.getEffectiveFrom(), row.getEffectiveTo(), row.isEnabled(),
                    statusOf(row, today), row.getNotes(), row.getCreatedAt(), row.getCreatedBy(),
                    row.getUpdatedAt(), row.getUpdatedBy()));
        }
        return out;
    }
}
