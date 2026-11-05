package com.billbull.backend.sales.pricing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.inventory.product.ProductBranchPricing;
import com.billbull.backend.inventory.product.ProductBranchPricingRepository;
import com.billbull.backend.inventory.product.ProductPricing;
import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.sales.settings.SalesSettings;
import com.billbull.backend.sales.settings.SalesSettingsService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Global pricing rules (stored on the Sales Settings row, V135) and the product cost / base price
 * lookups the pricing screens and the below-cost guard share.
 *
 * <p>Cost and base price are branch-effective: a product's branch pricing row wins over its global
 * pricing for the fields it sets, as everywhere else prices are read.
 */
@Service
public class PricingRulesService {

    static final BigDecimal HUNDRED = new BigDecimal("100");

    private final SalesSettingsService salesSettingsService;
    private final ProductPricingRepository pricingRepository;
    private final ProductBranchPricingRepository branchPricingRepository;
    private final ObjectMapper objectMapper;

    public PricingRulesService(SalesSettingsService salesSettingsService,
                               ProductPricingRepository pricingRepository,
                               ProductBranchPricingRepository branchPricingRepository,
                               ObjectMapper objectMapper) {
        this.salesSettingsService = salesSettingsService;
        this.pricingRepository = pricingRepository;
        this.branchPricingRepository = branchPricingRepository;
        this.objectMapper = objectMapper;
    }

    /** The rules. {@code roundTo} is a step such as 0.01, 0.25, 0.50 or 1.00. */
    public record Rules(BigDecimal minMarginPercent, boolean blockBelowCost, BigDecimal roundTo) {}

    /** A product's branch-effective cost and base (retail) selling price; either may be null. */
    public record Costs(BigDecimal cost, BigDecimal basePrice) {
        public boolean hasCost() {
            return cost != null && cost.signum() > 0;
        }
    }

    @Transactional(readOnly = true)
    public Rules get() {
        SalesSettings s = salesSettingsService.getStoredSettings();
        return new Rules(s.getPricingMinMarginPercent(), s.isPricingBlockBelowCost(), s.getPricingRoundTo());
    }

    @Transactional
    public Rules save(Rules rules) {
        if (rules == null) throw new PricingException("Pricing rules are required.");
        BigDecimal margin = rules.minMarginPercent() == null ? new BigDecimal("15") : rules.minMarginPercent();
        if (margin.compareTo(new BigDecimal("-100")) < 0 || margin.compareTo(new BigDecimal("99.99")) > 0) {
            throw new PricingException("The minimum margin must be between -100 and 99.99 %.");
        }
        BigDecimal roundTo = rules.roundTo() == null ? new BigDecimal("0.01") : rules.roundTo();
        if (roundTo.compareTo(new BigDecimal("0.01")) < 0 || roundTo.compareTo(new BigDecimal("1000")) > 0) {
            throw new PricingException("The rounding step must be between 0.01 and 1000.");
        }
        // Merge through the settings service so every other setting stays exactly as it is.
        ObjectNode body = objectMapper.createObjectNode();
        body.put("pricingMinMarginPercent", margin.setScale(2, RoundingMode.HALF_UP));
        body.put("pricingBlockBelowCost", rules.blockBelowCost());
        body.put("pricingRoundTo", roundTo.setScale(2, RoundingMode.HALF_UP));
        SalesSettings saved = salesSettingsService.saveSettings(body);
        return new Rules(saved.getPricingMinMarginPercent(), saved.isPricingBlockBelowCost(), saved.getPricingRoundTo());
    }

    /** Branch-effective cost and base price per product (branchId null = global pricing only). */
    @Transactional(readOnly = true)
    public Map<Long, Costs> costs(Collection<Long> productIds, Long branchId) {
        Map<Long, Costs> out = new HashMap<>();
        if (productIds == null || productIds.isEmpty()) return out;
        List<Long> ids = new ArrayList<>(new LinkedHashSet<>(productIds));
        Map<Long, ProductPricing> base = new HashMap<>();
        for (ProductPricing p : pricingRepository.findByProductIdIn(ids)) {
            if (p.getProduct() != null) base.put(p.getProduct().getId(), p);
        }
        Map<Long, ProductBranchPricing> branch = new HashMap<>();
        if (branchId != null) {
            for (ProductBranchPricing b : branchPricingRepository.findByProductIdIn(ids)) {
                if (b.getProduct() != null && b.getBranch() != null && branchId.equals(b.getBranch().getId())) {
                    branch.put(b.getProduct().getId(), b);
                }
            }
        }
        for (Long id : ids) {
            ProductPricing p = base.get(id);
            ProductBranchPricing b = branch.get(id);
            BigDecimal cost = b != null && b.getCost() != null ? b.getCost() : (p != null ? p.getCost() : null);
            BigDecimal retail = b != null && b.getRetailPrice() != null ? b.getRetailPrice() : (p != null ? p.getRetailPrice() : null);
            out.put(id, new Costs(cost, retail));
        }
        return out;
    }

    /** Gross margin % of {@code price} over {@code cost}, or null when either is unknown. */
    public static BigDecimal marginPercent(BigDecimal price, BigDecimal cost) {
        if (price == null || cost == null || price.signum() <= 0 || cost.signum() <= 0) return null;
        return price.subtract(cost).multiply(HUNDRED).divide(price, 2, RoundingMode.HALF_UP);
    }

    /** Rounds {@code value} to the nearest multiple of {@code step} (at least 0.01), half up. */
    public static BigDecimal roundTo(BigDecimal value, BigDecimal step) {
        if (value == null) return null;
        BigDecimal s = step == null || step.compareTo(new BigDecimal("0.01")) < 0 ? new BigDecimal("0.01") : step;
        return value.divide(s, 0, RoundingMode.HALF_UP).multiply(s).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Refuses a price below the product's cost when the "block below cost" rule is on.
     *
     * @param what how the price is named in the message ("The Wholesale price", "The negotiated price")
     */
    @Transactional(readOnly = true)
    public void assertNotBelowCost(Long productId, String productCode, Long branchId, BigDecimal price, String what) {
        if (price == null || productId == null) return;
        if (!get().blockBelowCost()) return;
        Costs c = costs(List.of(productId), branchId).get(productId);
        if (c != null && c.hasCost() && price.compareTo(c.cost()) < 0) {
            throw belowCost(what, productCode != null ? productCode : "product " + productId);
        }
    }

    static PricingException belowCost(String what, String product) {
        return new PricingException(what + " for " + product
                + " is below its cost. Selling below cost is blocked in the pricing rules.");
    }
}
