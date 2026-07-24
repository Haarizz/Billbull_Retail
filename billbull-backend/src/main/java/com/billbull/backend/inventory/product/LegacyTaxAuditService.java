package com.billbull.backend.inventory.product;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;

/**
 * Phase 7 of the tax-architecture cleanup: a read-only audit report identifying products whose
 * Sales Tax % may have been auto-assigned by the previous hardcoded-5% import/quick-create
 * defaults, rather than deliberately configured. Never modifies data — an administrator reviews
 * the list and decides, per product, whether to clear the Sales Tax so it falls back to the
 * Branch Default VAT Rate.
 */
@Service
public class LegacyTaxAuditService {

    /** The exact rate the old hardcoded fallbacks used to write. */
    private static final BigDecimal LEGACY_DEFAULT_RATE = new BigDecimal("5");
    private static final BigDecimal LEGACY_DEFAULT_RATE_SCALED = LEGACY_DEFAULT_RATE.setScale(2);

    private final ProductTaxRepository productTaxRepository;

    public LegacyTaxAuditService(ProductTaxRepository productTaxRepository) {
        this.productTaxRepository = productTaxRepository;
    }

    @Transactional(readOnly = true)
    public List<LegacyTaxAuditEntry> findLikelyLegacyDefaults() {
        List<ProductTax> exactMatches = productTaxRepository.findBySalesTax(LEGACY_DEFAULT_RATE);
        // BigDecimal equality by value can miss scale variants (5 vs 5.00); catch those too.
        List<ProductTax> scaledMatches = productTaxRepository.findBySalesTax(LEGACY_DEFAULT_RATE_SCALED);

        return java.util.stream.Stream.concat(exactMatches.stream(), scaledMatches.stream())
                .filter(tax -> tax.getProduct() != null)
                .distinct()
                .map(this::toEntry)
                .sorted(Comparator.comparing(LegacyTaxAuditEntry::getProductCode,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    private LegacyTaxAuditEntry toEntry(ProductTax tax) {
        Product product = tax.getProduct();
        // Strongest signal: the tax row has never been touched since creation (createdAt ==
        // updatedAt, or within a second of each other) — consistent with a value that was
        // written once by an import/quick-create default and never deliberately reviewed.
        boolean neverEdited = tax.getCreatedAt() != null && tax.getUpdatedAt() != null
                && ChronoUnit.SECONDS.between(tax.getCreatedAt(), tax.getUpdatedAt()) <= 1;

        String recommendation = neverEdited
                ? "Matches the old hardcoded 5% default and has never been edited since creation — "
                  + "review and, if not an intentional rate, clear it so this product inherits the "
                  + "Branch Default VAT Rate."
                : "Matches the old hardcoded 5% default, but the tax row has been edited since "
                  + "creation — may be a deliberately configured 5% rate. Review before clearing.";

        return new LegacyTaxAuditEntry(
                product.getId(),
                product.getCode(),
                product.getName(),
                tax.getSalesTax(),
                tax.getCreatedAt(),
                tax.getUpdatedAt(),
                neverEdited,
                recommendation);
    }
}
