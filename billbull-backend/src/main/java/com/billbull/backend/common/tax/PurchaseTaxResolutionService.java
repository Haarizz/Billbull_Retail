package com.billbull.backend.common.tax;

import com.billbull.backend.inventory.product.Product;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

/**
 * Single source of truth for resolving the effective Purchase Tax % across every purchasing
 * flow (LPO, GRN, Purchase Invoice). Deliberately separate from {@link BranchTaxResolutionService}'s
 * sales resolution: Purchase Tax is input-tax-credit on what a vendor charges the branch, a
 * different business concept from Sales Tax charged to customers. It reads the branch's purchase
 * default through {@link BranchTaxResolutionService}, which stays the only reader of
 * {@code BranchTaxConfiguration}.
 *
 * Priority order:
 *   1. Product Purchase Tax (explicit rate configured on the product master — including an
 *      explicit 0; only a genuinely unset/null value falls through).
 *   2. Branch Default Purchase Tax Rate ({@code BranchTaxConfiguration.branchDefaultPurchaseTaxRate}).
 *   3. 0% — internal system fallback only, when neither is configured.
 *
 * The branch Tax Enabled switch is not applied here: it has never governed purchase tax, and
 * the vendor's charge does not depend on whether this branch charges VAT on its own sales.
 *
 * {@code branchId} may be null, in which case the active branch (Branch Selector) is used —
 * the same fallback the sales resolver applies.
 */
@Service
public class PurchaseTaxResolutionService {

    private final BranchTaxResolutionService branchTaxResolutionService;

    public PurchaseTaxResolutionService(BranchTaxResolutionService branchTaxResolutionService) {
        this.branchTaxResolutionService = branchTaxResolutionService;
    }

    /** Resolves the rate for an already-known product Purchase Tax value (or null if unset). */
    public BigDecimal resolvePurchaseTaxRate(BigDecimal productPurchaseTax, Long branchId) {
        if (productPurchaseTax != null) return productPurchaseTax;
        return branchTaxResolutionService.getBranchDefaultPurchaseTaxRate(branchId);
    }

    /** Looks up the product's own Purchase Tax %, falling back to the branch default, else 0. */
    public BigDecimal resolvePurchaseTaxRateForProduct(Product product, Long branchId) {
        return resolvePurchaseTaxRate(productPurchaseTax(product), branchId);
    }

    private static BigDecimal productPurchaseTax(Product product) {
        return (product != null && product.getTax() != null) ? product.getTax().getPurchaseTax() : null;
    }
}
