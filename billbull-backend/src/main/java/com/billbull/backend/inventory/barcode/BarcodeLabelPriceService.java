package com.billbull.backend.inventory.barcode;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.inventory.barcode.LabelPriceModels.Item;
import com.billbull.backend.inventory.barcode.LabelPriceModels.Request;
import com.billbull.backend.inventory.barcode.LabelPriceModels.Response;
import com.billbull.backend.inventory.barcode.LabelPriceModels.Result;
import com.billbull.backend.inventory.barcode.LabelPriceModels.SourceOption;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductBarcode;
import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.inventory.product.ProductPacking;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.pricing.FixedPriceField;
import com.billbull.backend.sales.pricing.PriceLevel;
import com.billbull.backend.sales.pricing.PriceLevelRepository;
import com.billbull.backend.sales.pricing.PriceSource;
import com.billbull.backend.sales.pricing.PricingException;
import com.billbull.backend.sales.pricing.PricingModels.Context;
import com.billbull.backend.sales.pricing.PricingModels.Line;
import com.billbull.backend.sales.pricing.PricingModels.LinePrice;
import com.billbull.backend.sales.pricing.PricingResolutionService;
import com.billbull.backend.sales.settings.SalesItemPricePolicy;
import com.billbull.backend.security.BranchScope;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchRepository;

/**
 * The price a barcode label shows. Every price comes from the shared
 * {@link PricingResolutionService} — the same resolver the till and the sales documents use — so a
 * label can never show a price the system would not charge from that source. The browser's
 * preview, browser print and Zebra (ZPL) print all render from this one response.
 *
 * <p>Rules:
 * <ul>
 *   <li>The barcode decides the unit: a carton barcode is priced per carton (the carton's own
 *       packing price, or the per-base price times its conversion where the source has no packing
 *       price), a piece barcode per piece.</li>
 *   <li>A source with no price for a product makes that label <b>unavailable</b>. Nothing falls
 *       back to another source, and purchase cost is never read.</li>
 *   <li>Quantity tiers apply only when the print run names a pricing quantity, and only to price
 *       levels. Each label is priced on its own: two labels of one product are not added up.</li>
 *   <li>A customer's negotiated price is shown only for the CUSTOMER source with that customer
 *       chosen explicitly — never on an ordinary shelf label.</li>
 *   <li>The branch is the caller's current branch unless one is named, which the caller must be
 *       able to access.</li>
 * </ul>
 */
@Service
public class BarcodeLabelPriceService {

    static final int MAX_ITEMS = 500;

    private final PricingResolutionService resolver;
    private final PriceLevelRepository levelRepository;
    private final ProductBarcodeRepository barcodeRepository;
    private final BranchRepository branchRepository;
    private final BranchAccessService branchAccessService;

    public BarcodeLabelPriceService(PricingResolutionService resolver, PriceLevelRepository levelRepository,
                                    ProductBarcodeRepository barcodeRepository, BranchRepository branchRepository,
                                    BranchAccessService branchAccessService) {
        this.resolver = resolver;
        this.levelRepository = levelRepository;
        this.barcodeRepository = barcodeRepository;
        this.branchRepository = branchRepository;
        this.branchAccessService = branchAccessService;
    }

    // ------------------------------------------------------------------
    // Sources
    // ------------------------------------------------------------------

    /** Every source a label can use: built from the configured price levels, never a fixed list. */
    @Transactional(readOnly = true)
    public List<SourceOption> sources() {
        List<PriceLevel> levels = levelRepository.findAllByOrderBySortOrderAscNameAsc();
        PriceLevel defaultLevel = levels.stream().filter(PriceLevel::isSystemDefault).findFirst().orElse(null);
        String defaultName = defaultLevel != null && defaultLevel.getName() != null ? defaultLevel.getName() : "Retail";

        List<SourceOption> out = new ArrayList<>();
        out.add(new SourceOption("DEFAULT", "DEFAULT", defaultName + " (selling price)",
                "The effective selling price: a packing's own price, else the branch price, else the all-branches price.",
                defaultLevel != null ? defaultLevel.getId() : null, false, true));
        for (PriceLevel level : levels) {
            if (level.isSystemDefault() || !level.isActive()) continue;
            out.add(new SourceOption("LEVEL:" + level.getId(), "LEVEL", level.getName(),
                    level.getDescription() != null && !level.getDescription().isBlank()
                            ? level.getDescription() : "Price level",
                    level.getId(), false, true));
        }
        for (FixedPriceField field : FixedPriceField.values()) {
            out.add(new SourceOption("FIELD:" + field.name(), "FIELD", field.label(),
                    "The product's " + field.label().toLowerCase(Locale.ROOT) + " field (branch value over the all-branches value).",
                    null, false, false));
        }
        out.add(new SourceOption("CUSTOMER", "CUSTOMER", "Customer-specific price",
                "A chosen customer's negotiated price (branch price over the all-branches price).",
                null, true, false));
        return out;
    }

    // ------------------------------------------------------------------
    // Prices
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Response resolve(Request request) {
        List<Item> items = request.getItems() == null ? List.of()
                : request.getItems().stream().filter(Objects::nonNull).toList();
        if (items.size() > MAX_ITEMS) {
            throw new PricingException("At most " + MAX_ITEMS + " labels can be priced at once.");
        }
        Long branchId = trustedBranchId(request.getBranchId());
        String branchName = branchName(branchId);
        LocalDate date = resolver.pricingDate(request.getPricingDate());
        BigDecimal quantity = request.getPricingQuantity();

        LabelPriceSource source;
        try {
            source = LabelPriceSource.parse(request.getSource());
        } catch (IllegalArgumentException ex) {
            return failed(request.getSource(), null, branchId, branchName, null, null, quantity, date,
                    ex.getMessage(), items);
        }
        String rawKey = source.key();
        if (quantity != null && quantity.signum() <= 0) {
            return failed(rawKey, null, branchId, branchName, null, null, quantity, date,
                    "The pricing quantity must be greater than zero.", items);
        }

        // Validate the source before touching products.
        PriceLevel level = null;
        Customer customer = null;
        String sourceLabel;
        switch (source.kind()) {
            case LEVEL -> {
                level = levelRepository.findById(source.priceLevelId()).orElse(null);
                if (level == null) {
                    return failed(rawKey, "Price level " + source.priceLevelId(), branchId, branchName, null, null,
                            quantity, date, "The template's price level no longer exists. Choose another price source.", items);
                }
                if (!level.isActive()) {
                    return failed(rawKey, level.getName(), branchId, branchName, null, null, quantity, date,
                            "Price level '" + level.getName() + "' is inactive. Choose another price source.", items);
                }
                if (level.isSystemDefault()) {
                    source = LabelPriceSource.DEFAULT;
                    level = null;
                }
            }
            case CUSTOMER -> {
                if (request.getCustomerId() == null) {
                    return failed(rawKey, "Customer-specific price", branchId, branchName, null, null, quantity, date,
                            "Choose a customer to print customer-specific prices.", items);
                }
                customer = resolver.findCustomer(request.getCustomerId(), null);
                if (customer == null || "inactive".equalsIgnoreCase(customer.getStatus() == null ? "" : customer.getStatus().trim())) {
                    return failed(rawKey, "Customer-specific price", branchId, branchName, request.getCustomerId(),
                            null, quantity, date, "The chosen customer does not exist or is inactive.", items);
                }
            }
            default -> { }
        }
        sourceLabel = switch (source.kind()) {
            case DEFAULT -> defaultLevelName() + " (selling price)";
            case LEVEL -> level.getName();
            case FIELD -> source.field().label();
            case CUSTOMER -> "Customer price · " + customer.getName();
        };

        String notice = null;
        BigDecimal tierQuantity = source.supportsQuantityTiers() ? quantity : null;
        if (quantity != null && !source.supportsQuantityTiers()) {
            notice = source.kind() == LabelPriceSource.Kind.CUSTOMER
                    ? "A negotiated price is fixed whatever the quantity; the pricing quantity is not used."
                    : "Quantity tiers belong to price levels; the " + source.field().label().toLowerCase(Locale.ROOT)
                            + " is fixed and the pricing quantity is not used.";
        }
        if (branchId == null) {
            notice = join(notice, "No branch selected: all-branches prices are shown.");
        }

        // Product and unit of every label — a fixed number of queries whatever the item count.
        List<Line> probes = items.stream()
                .map(i -> new Line(i.productId(), blankToNull(i.itemCode()), null, null))
                .toList();
        List<Product> products = resolver.matchProducts(probes, branchId);
        Map<Long, List<ProductBarcode>> barcodes = barcodesOf(products);

        List<UnitChoice> units = new ArrayList<>(items.size());
        List<Line> lines = new ArrayList<>(items.size());
        for (int i = 0; i < items.size(); i++) {
            Product product = products.get(i);
            UnitChoice unit = product == null ? null
                    : unitFor(items.get(i), barcodes.getOrDefault(product.getId(), List.of()), branchId);
            units.add(unit);
            lines.add(product == null ? new Line(null, null, null, null)
                    : new Line(product.getId(), product.getCode(), unit.unit(), tierQuantity));
        }

        List<LinePrice> prices = switch (source.kind()) {
            case FIELD -> resolver.resolveFixedField(branchId, source.field(), lines);
            case LEVEL -> resolver.resolveEach(new Context(branchId, level.getId(), null, null,
                    SalesItemPricePolicy.RETAIL, date), lines).lines();
            case CUSTOMER -> resolver.resolveEach(new Context(branchId, null, customer.getId(), null,
                    SalesItemPricePolicy.RETAIL, date), lines).lines();
            case DEFAULT -> resolver.resolveEach(new Context(branchId, null, null, null,
                    SalesItemPricePolicy.RETAIL, date), lines).lines();
        };

        List<Result> results = new ArrayList<>(items.size());
        for (int i = 0; i < items.size(); i++) {
            Item item = items.get(i);
            Product product = products.get(i);
            if (product == null) {
                results.add(unavailable(item, null, null, "Product not found, or not available in this branch."));
                continue;
            }
            results.add(toResult(item, product, units.get(i), prices.get(i), source, level, customer, date));
        }
        return new Response(rawKey, sourceLabel, branchId, branchName,
                customer != null ? customer.getId() : null, customer != null ? customer.getName() : null,
                quantity, date, null, notice, results);
    }

    private Result toResult(Item item, Product product, UnitChoice unit, LinePrice price, LabelPriceSource source,
                            PriceLevel level, Customer customer, LocalDate date) {
        String why = null;
        boolean ok = price != null && price.price() != null && price.price().signum() > 0
                && price.source() != PriceSource.NONE;
        if (ok) {
            switch (source.kind()) {
                case LEVEL -> {
                    if (price.levelPriceMissing()) {
                        ok = false;
                        why = "No " + level.getName() + " price is set for this product.";
                    }
                }
                case CUSTOMER -> {
                    if (!price.source().isCustomerPrice()) {
                        ok = false;
                        why = customer.getName() + " has no negotiated price for this product on " + date + ".";
                    }
                }
                default -> { }
            }
        } else {
            why = switch (source.kind()) {
                case FIELD -> "No " + source.field().label().toLowerCase(Locale.ROOT) + " is set for this product.";
                case LEVEL -> "No " + level.getName() + " price is set for this product.";
                case CUSTOMER -> customer.getName() + " has no negotiated price for this product on " + date + ".";
                case DEFAULT -> "No selling price is set for this product.";
            };
        }
        String note = unit.note();
        BigDecimal conversion = price != null && price.conversion() != null ? price.conversion() : unit.conversion();
        if (!ok) {
            return new Result(item.key(), product.getId(), product.getCode(), unit.unit(), unit.basis(),
                    conversion, null, false, null, null, join(why, note), false, null, null);
        }
        return new Result(item.key(), product.getId(), product.getCode(), unit.unit(), unit.basis(),
                conversion, price.price().setScale(2, RoundingMode.HALF_UP), true, price.source().name(),
                describe(price, source, level), note, price.tierApplied(), price.tierMinQuantity(),
                price.eligibleQuantity());
    }

    private static String describe(LinePrice price, LabelPriceSource source, PriceLevel level) {
        String levelName = level != null ? level.getName() : price.priceLevelName();
        return switch (price.source()) {
            case PACKING_PRICE -> "Packing price";
            case BRANCH_PRICE -> source.kind() == LabelPriceSource.Kind.FIELD ? source.field().label() + " · branch" : "Branch price";
            case BASE_PRICE -> source.kind() == LabelPriceSource.Kind.FIELD ? source.field().label() : "All-branches price";
            case PRICE_LEVEL_BRANCH -> levelName + " · branch price";
            case PRICE_LEVEL -> levelName;
            case QUANTITY_TIER_BRANCH -> levelName + " · branch tier " + plain(price.tierMinQuantity()) + "+";
            case QUANTITY_TIER -> levelName + " · tier " + plain(price.tierMinQuantity()) + "+";
            case CUSTOMER_SPECIFIC_BRANCH -> "Customer price · branch";
            case CUSTOMER_SPECIFIC -> "Customer price";
            default -> price.source().name();
        };
    }

    // ------------------------------------------------------------------
    // Units
    // ------------------------------------------------------------------

    private record UnitChoice(String unit, String basis, BigDecimal conversion, String note) {}

    private Map<Long, List<ProductBarcode>> barcodesOf(List<Product> products) {
        List<Long> ids = products.stream().filter(Objects::nonNull).map(Product::getId).distinct().toList();
        if (ids.isEmpty()) return Map.of();
        Map<Long, List<ProductBarcode>> out = new HashMap<>();
        for (ProductBarcode pb : barcodeRepository.findByProductIdIn(ids)) {
            if (pb.getProduct() == null || pb.getProduct().getId() == null || pb.getBarcode() == null) continue;
            out.computeIfAbsent(pb.getProduct().getId(), k -> new ArrayList<>()).add(pb);
        }
        // Lowest id first, as barcode scanning resolves.
        out.values().forEach(list -> list.sort(Comparator.comparing(ProductBarcode::getId,
                Comparator.nullsLast(Comparator.naturalOrder()))));
        return out;
    }

    /** The unit a label prices: the barcode's own packing; the queue's unit only for an unregistered barcode. */
    private static UnitChoice unitFor(Item item, List<ProductBarcode> productBarcodes, Long branchId) {
        String wanted = item.barcode() == null ? "" : item.barcode().trim().toLowerCase(Locale.ROOT);
        if (!wanted.isEmpty()) {
            for (ProductBarcode pb : productBarcodes) {
                if (!wanted.equals(pb.getBarcode().trim().toLowerCase(Locale.ROOT))) continue;
                if (pb.getBranchId() != null && !pb.getBranchId().equals(branchId)) continue;
                ProductPacking packing = pb.getPacking();
                if (packing == null || !packing.isActive() || packing.getUnit() == null
                        || packing.getUnit().getName() == null || packing.getUnit().getName().isBlank()) continue;
                BigDecimal conversion = packing.getConversion() != null && packing.getConversion().signum() > 0
                        ? packing.getConversion().stripTrailingZeros() : BigDecimal.ONE;
                return new UnitChoice(packing.getUnit().getName().trim(), "BARCODE", conversion, null);
            }
        }
        String requested = blankToNull(item.unit());
        if (requested != null) {
            return new UnitChoice(requested, "REQUEST", null, wanted.isEmpty() ? null
                    : "This barcode is not registered to the product; priced per " + requested + ".");
        }
        return new UnitChoice(null, "BASE", BigDecimal.ONE, wanted.isEmpty() ? null
                : "This barcode is not registered to the product; the base-unit price is shown.");
    }

    // ------------------------------------------------------------------
    // Branch
    // ------------------------------------------------------------------

    /** A named branch the caller must be able to access; otherwise the caller's current branch. */
    Long trustedBranchId(Long requested) {
        if (requested != null) {
            BranchScope.assertCanAccess(requested);
            if (branchRepository.findById(requested).isEmpty()) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Branch " + requested + " not found.");
            }
            return requested;
        }
        if (BranchScope.isAllBranches()) return null;
        Long active = BranchScope.currentBranchId();
        if (active != null) return active;
        Branch own = branchAccessService.getCurrentUserBranchOrNull();
        return own != null ? own.getId() : null;
    }

    private String branchName(Long branchId) {
        if (branchId == null) return null;
        return branchRepository.findById(branchId).map(Branch::getName).orElse(null);
    }

    private String defaultLevelName() {
        return levelRepository.findFirstBySystemDefaultTrue().map(PriceLevel::getName)
                .filter(n -> !n.isBlank()).orElse("Retail");
    }

    // ------------------------------------------------------------------

    private static Response failed(String key, String label, Long branchId, String branchName, Long customerId,
                                   String customerName, BigDecimal quantity, LocalDate date, String error,
                                   List<Item> items) {
        List<Result> results = items.stream().map(i -> unavailable(i, null, null, error)).toList();
        return new Response(key, label, branchId, branchName, customerId, customerName, quantity, date, error,
                null, results);
    }

    private static Result unavailable(Item item, Long productId, String itemCode, String why) {
        return new Result(item.key(), productId != null ? productId : item.productId(),
                itemCode != null ? itemCode : item.itemCode(), blankToNull(item.unit()), null, null, null,
                false, null, null, why, false, null, null);
    }

    private static String join(String a, String b) {
        if (a == null || a.isBlank()) return b;
        if (b == null || b.isBlank()) return a;
        return a + " " + b;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String plain(BigDecimal v) {
        return v == null ? "" : v.stripTrailingZeros().toPlainString();
    }
}
