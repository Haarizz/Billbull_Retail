package com.billbull.backend.common.tax;

import com.billbull.backend.inventory.product.ProductTax;
import com.billbull.backend.inventory.product.ProductTaxRepository;
import com.billbull.backend.settings.branch.BranchTaxConfiguration;
import com.billbull.backend.settings.branch.BranchTaxConfigurationService;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

/**
 * Single source of truth for resolving the effective tax configuration across every module that
 * needs one (POS, Sales Invoice, Quotation, Sales Order, Delivery Note, Proforma, Product
 * Pricing, Price Check, Layaway, Financials, Reports). Tax is a branch-wide ERP configuration —
 * this is the ONLY class that reads {@link BranchTaxConfiguration} directly; every other module
 * must go through here rather than fetching branch/POS settings itself. That indirection is
 * deliberate: it lets the storage location or shape of tax configuration change in the future
 * (new fields, a different owning entity, etc.) without touching every consumer.
 *
 * Priority order for Sales Tax:
 *   1. If the branch has Tax Enabled = false, every calculation resolves to 0% — a full kill
 *      switch for future calculations. Historical documents are unaffected (they already
 *      snapshot their tax rate at creation time and are never re-derived).
 *   2. Product Sales Tax (explicit rate configured on the product master — including an
 *      explicit 0 for zero-rated items; only a genuinely unset/null value defers below).
 *   3. Branch Default VAT Rate ({@link BranchTaxConfiguration#getBranchDefaultVatRate()}).
 *   4. 0% — internal system fallback only, when neither is configured.
 */
@Service
public class BranchTaxResolutionService {

    private final ProductTaxRepository productTaxRepository;
    private final BranchTaxConfigurationService branchTaxConfigurationService;

    public BranchTaxResolutionService(ProductTaxRepository productTaxRepository,
                                       BranchTaxConfigurationService branchTaxConfigurationService) {
        this.productTaxRepository = productTaxRepository;
        this.branchTaxConfigurationService = branchTaxConfigurationService;
    }

    /** Resolves the rate for an already-known product Sales Tax value (or null if the product has none). */
    public BigDecimal resolveSalesTaxRate(BigDecimal productSalesTax, Long branchId) {
        BranchTaxConfiguration config = getConfig(branchId);
        if (!isEnabled(config)) return BigDecimal.ZERO;
        if (productSalesTax != null) return productSalesTax;
        return branchDefaultVatRate(config);
    }

    /** Looks up the product's own Sales Tax %, falling back to the branch default, else 0. */
    public BigDecimal resolveSalesTaxRateForProduct(Long productId, Long branchId) {
        BigDecimal productSalesTax = productId != null
                ? productTaxRepository.findByProductId(productId).map(ProductTax::getSalesTax).orElse(null)
                : null;
        return resolveSalesTaxRate(productSalesTax, branchId);
    }

    /**
     * The raw configured Branch Default VAT Rate, or 0 when unset (never null).
     *
     * <b>Deliberately ignores the Tax Enabled switch</b> — this returns what the branch has
     * <i>configured</i>, not what should be <i>charged</i>. It exists for display/administration
     * purposes (e.g. showing the saved rate back in Branch Settings even while tax is disabled).
     * Any caller resolving a rate to actually apply to a sale MUST use {@link #resolveSalesTaxRate}
     * or {@link #resolveSalesTaxRateForProduct} instead, which correctly return 0 when Tax
     * Enabled is off.
     */
    public BigDecimal getBranchDefaultVatRate(Long branchId) {
        return branchDefaultVatRate(getConfig(branchId));
    }

    /** Whether tax calculations are enabled for the branch. Defaults to true when unconfigured. */
    public boolean isTaxEnabled(Long branchId) {
        return isEnabled(getConfig(branchId));
    }

    /**
     * Whether prices are tax-inclusive (VAT extracted) vs tax-exclusive (VAT added on top) for
     * the branch. The frontend resolves this itself today (via the {@code BranchTaxConfigurationResponse}
     * DTO returned by {@code GET /api/branches/{branchId}/tax-configuration}, wired into Sales
     * Invoice/Quotation/Sales Order/Delivery Note/Proforma's initial Tax Mode) — this method is
     * the equivalent entry point for any future backend consumer that needs to resolve Tax Mode
     * server-side (e.g. server-rendered documents, reports) without duplicating the lookup.
     */
    public boolean isTaxInclusive(Long branchId) {
        BranchTaxConfiguration config = getConfig(branchId);
        return config != null && Boolean.TRUE.equals(config.getTaxInclusive());
    }

    private BranchTaxConfiguration getConfig(Long branchId) {
        return branchId != null
                ? branchTaxConfigurationService.getForBranch(branchId)
                : branchTaxConfigurationService.getForCurrentBranch();
    }

    private boolean isEnabled(BranchTaxConfiguration config) {
        return config == null || !Boolean.FALSE.equals(config.getTaxEnabled());
    }

    private BigDecimal branchDefaultVatRate(BranchTaxConfiguration config) {
        Double rate = config != null ? config.getBranchDefaultVatRate() : null;
        return rate != null ? BigDecimal.valueOf(rate) : BigDecimal.ZERO;
    }
}
