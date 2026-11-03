package com.billbull.backend.sales.pricing;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import com.billbull.backend.sales.settings.SalesItemPricePolicy;

/** Value types exchanged with {@link PricingResolutionService}. */
public final class PricingModels {

    private PricingModels() {}

    /**
     * What a resolution is for.
     *
     * @param branchId            the branch the transaction belongs to — always taken from a trusted
     *                            source (the POS session, the saved invoice, or the request's branch
     *                            context), never from a client field on its own
     * @param explicitPriceLevelId the level chosen on the transaction, or null to use the customer's
     * @param customerId          optional; the customer whose default level and negotiated prices apply
     * @param customerCode        optional; used when no id is given (POS sends codes)
     * @param basePolicy          which master field is the default-level price (back office honours
     *                            Sales Settings; the till has always sold at retail)
     * @param pricingDate         the day a customer's negotiated prices must be valid on; null = today
     *                            (the business day)
     */
    public record Context(Long branchId, Long explicitPriceLevelId, Long customerId, String customerCode,
                          SalesItemPricePolicy basePolicy, LocalDate pricingDate) {
        public Context(Long branchId, Long explicitPriceLevelId, Long customerId, String customerCode,
                       SalesItemPricePolicy basePolicy) {
            this(branchId, explicitPriceLevelId, customerId, customerCode, basePolicy, null);
        }
    }

    /**
     * One line to price. {@code quantity} is the paid quantity in {@code unit} (FOC excluded): the
     * lines of one product in a request are added up, in base units, to find its quantity tier.
     */
    public record Line(Long productId, String itemCode, String unit, BigDecimal quantity) {}

    /** The level a transaction resolved to. {@code notice} explains a fallback (e.g. inactive level). */
    public record ResolvedLevel(Long id, String code, String name, boolean systemDefault,
                                PriceLevelSource source, String notice) {}

    /**
     * One priced line.
     *
     * @param price                 the price to charge per selling unit
     * @param basePrice             what the default level would charge (for display and override checks)
     * @param levelPriceMissing     the transaction's level has no price for this product, so the base
     *                              price was used
     * @param fallbackPrice         what the line would cost without the customer's negotiated price
     *                              (the level / tier / default price); equals {@code price} otherwise
     * @param fallbackSource        the source of {@code fallbackPrice}
     * @param customerPriceId       the negotiated-price mapping applied, or null
     * @param customerPriceBranchId that mapping's branch (null = all branches)
     * @param customerPriceFrom     that mapping's validity start
     * @param customerPriceTo       that mapping's validity end (null = open-ended)
     * @param untieredPrice         the level's price for one selling unit before any quantity tier —
     *                              quantity-independent (what a shelf label shows)
     * @param untieredSource        the source of {@code untieredPrice}
     * @param quantityTierId        the quantity tier applied (null when none, also under a negotiated price)
     * @param tierBranchId          that tier's branch (null = all branches)
     * @param tierMinQuantity       that tier's threshold, in base units
     * @param eligibleQuantity      the request's paid base-unit quantity of this product, which tiers are
     *                              matched against (null when no quantity was given)
     * @param conversion            base units in one selling unit of this line
     */
    public record LinePrice(Long productId, String itemCode, String unit, BigDecimal price,
                            BigDecimal basePrice, PriceSource source, Long priceLevelId,
                            String priceLevelName, boolean levelPriceMissing,
                            BigDecimal fallbackPrice, PriceSource fallbackSource,
                            Long customerPriceId, Long customerPriceBranchId,
                            LocalDate customerPriceFrom, LocalDate customerPriceTo,
                            BigDecimal untieredPrice, PriceSource untieredSource,
                            Long quantityTierId, Long tierBranchId, BigDecimal tierMinQuantity,
                            BigDecimal eligibleQuantity, BigDecimal conversion) {
        public LinePrice(Long productId, String itemCode, String unit, BigDecimal price,
                         BigDecimal basePrice, PriceSource source, Long priceLevelId,
                         String priceLevelName, boolean levelPriceMissing) {
            this(productId, itemCode, unit, price, basePrice, source, priceLevelId, priceLevelName,
                    levelPriceMissing, price, source, null, null, null, null);
        }

        public LinePrice(Long productId, String itemCode, String unit, BigDecimal price,
                         BigDecimal basePrice, PriceSource source, Long priceLevelId,
                         String priceLevelName, boolean levelPriceMissing,
                         BigDecimal fallbackPrice, PriceSource fallbackSource,
                         Long customerPriceId, Long customerPriceBranchId,
                         LocalDate customerPriceFrom, LocalDate customerPriceTo) {
            this(productId, itemCode, unit, price, basePrice, source, priceLevelId, priceLevelName,
                    levelPriceMissing, fallbackPrice, fallbackSource, customerPriceId, customerPriceBranchId,
                    customerPriceFrom, customerPriceTo, price, source, null, null, null, null, null);
        }

        /** True when a quantity tier set the price. */
        public boolean tierApplied() {
            return quantityTierId != null;
        }
    }

    /**
     * The customer a resolution priced for.
     *
     * @param liveMappings the customer's enabled negotiated prices (any product, branch or date) — 0
     *                     means the customer has none at all
     * @param appliedLines how many of the requested lines a negotiated price applied to
     */
    public record CustomerPricing(Long customerId, String customerCode, String customerName,
                                  long liveMappings, int appliedLines, LocalDate pricingDate) {}

    public record Resolution(ResolvedLevel level, Long branchId, List<LinePrice> lines, CustomerPricing customer) {
        public Resolution(ResolvedLevel level, Long branchId, List<LinePrice> lines) {
            this(level, branchId, lines, null);
        }
    }

    /**
     * One unit a product can be sold in, priced for the transaction.
     *
     * @param unit       the unit name a line carries (what stock and pricing match on)
     * @param conversion base units in one of this unit (1 for the base unit)
     * @param base       true for the base unit (conversion 1)
     * @param price      the price per one of this unit, or null when nothing is configured
     */
    public record SaleUnit(String unit, String symbol, String level, BigDecimal conversion, boolean base,
                           BigDecimal price, PriceSource source, boolean levelPriceMissing) {}

    /** The units a product sells in, smallest first. Empty when the product has no packings. */
    public record SaleUnits(ResolvedLevel level, Long productId, String itemCode, List<SaleUnit> units) {}

    /**
     * A sales document being saved, for {@link PricingResolutionService#applyToLines}.
     *
     * @param customerId / customerCode the document's customer (walk-in / unknown → none)
     * @param explicitPriceLevelId the level the user chose on the document, or null
     * @param previousLevelId      the level the saved document had — an edit may keep it even if it
     *                             has since been deactivated
     * @param branchId             the document's trusted branch (never a client field on its own)
     * @param policy               the default-level price field (Sales Settings; the till: retail)
     * @param date                 the document date negotiated prices must be valid on (null = today)
     * @param fillMissingPrices    give a line arriving without a price the resolved one (documents
     *                             whose totals are computed after pricing); otherwise only stamp
     * @param previous             the lines as last saved — an unchanged line keeps its pricing record,
     *                             so an edit never re-prices what was already agreed
     * @param source               the lines of the document this one was converted from — a line
     *                             carrying such a line's price unchanged is priced by that document
     */
    public record DocumentPricing(Long customerId, String customerCode, Long explicitPriceLevelId,
                                  Long previousLevelId, Long branchId, SalesItemPricePolicy policy,
                                  LocalDate date, boolean fillMissingPrices,
                                  List<CarriedPrice> previous, List<CarriedPrice> source) {}

    /** A line's price and pricing record, copied from a saved or source document. */
    public record CarriedPrice(String itemCode, String unit, BigDecimal quantity, BigDecimal price,
                               Long priceLevelId, String priceLevelName, String priceSource,
                               BigDecimal resolvedUnitPrice, Boolean priceOverridden, Long customerPriceId,
                               Long quantityTierId, BigDecimal tierMinQuantity, BigDecimal tierEligibleQuantity) {

        /** A snapshot of {@code line} (values copied, so later changes to the entity don't leak in). */
        public static CarriedPrice of(PriceStampedLine line) {
            return new CarriedPrice(line.getItemCode(), line.getUnit(), line.pricingQuantity(), line.getPrice(),
                    line.getPriceLevelId(), line.getPriceLevelName(), line.getPriceSource(),
                    line.getResolvedUnitPrice(), line.getPriceOverridden(), line.getCustomerPriceId(),
                    line.getQuantityTierId(), line.getTierMinQuantity(), line.getTierEligibleQuantity());
        }

        public static List<CarriedPrice> of(List<? extends PriceStampedLine> lines) {
            if (lines == null) return List.of();
            return lines.stream().filter(l -> l != null && !l.pricingVoided()).map(CarriedPrice::of).toList();
        }
    }
}
