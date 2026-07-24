package com.billbull.backend.common.tax;

import com.billbull.backend.inventory.product.Product;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

/**
 * Single source of truth for resolving the effective Purchase Tax % across every purchasing
 * flow (LPO, GRN, Purchase Invoice). Deliberately separate from {@link BranchTaxResolutionService}:
 * Purchase Tax is input-tax-credit on what a vendor charges the branch, a different business
 * concept from Sales Tax charged to customers, and there is no "Branch Default Purchase Tax"
 * setting in this system (unlike Sales Tax, which has {@code PosSettings.branchDefaultVatRate}).
 *
 * Priority order:
 *   1. Product Purchase Tax (explicit rate configured on the product master — including an
 *      explicit 0; only a genuinely unset/null value falls through).
 *   2. 0% — internal system fallback only, when the product has no Purchase Tax configured.
 */
@Service
public class PurchaseTaxResolutionService {

    /** Resolves the rate for an already-known product Purchase Tax value (or null if unset). */
    public BigDecimal resolvePurchaseTaxRate(BigDecimal productPurchaseTax) {
        return productPurchaseTax != null ? productPurchaseTax : BigDecimal.ZERO;
    }

    /** Looks up the product's own Purchase Tax %, falling back to 0 when unset. */
    public BigDecimal resolvePurchaseTaxRateForProduct(Product product) {
        BigDecimal productPurchaseTax = (product != null && product.getTax() != null)
                ? product.getTax().getPurchaseTax()
                : null;
        return resolvePurchaseTaxRate(productPurchaseTax);
    }
}
