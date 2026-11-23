package com.billbull.backend.pos.offline;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import com.billbull.backend.common.tax.BranchTaxResolutionService;
import com.billbull.backend.inventory.product.ProductService;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * The minimum data a till needs to sell offline, built from the same sources the online till reads:
 * the POS product list ({@code ProductService.getList(..., availableInPos=true, ...)}, i.e.
 * {@code GET /api/products/list}), the branch tax configuration and the salesperson roster.
 *
 * <p>Only products the offline pilot may sell are included: active, available in POS, not batch-,
 * serial- or expiry-controlled. Only base-unit barcodes are indexed (a pack barcode carries another
 * quantity and price). Cost, wholesale price and images are left out; no customer data is included.
 *
 * <p>The same per-product view is what ingest re-checks a synced line against
 * ({@link #currentLine}), so "the price the till charged" is compared with "the price this server
 * would charge now" by one rule.
 */
@Service
public class PosOfflineCatalogService {

    private static final int PAGE = 500;

    private final ProductService productService;
    private final BranchTaxResolutionService taxService;
    private final PosOfflineSettings settings;
    private final ObjectMapper mapper;
    private final com.billbull.backend.hr.employees.EmployeeController employeeController;
    private final com.billbull.backend.sales.settings.SalesSettingsService salesSettingsService;

    public PosOfflineCatalogService(ProductService productService, BranchTaxResolutionService taxService,
                                    PosOfflineSettings settings, ObjectMapper mapper,
                                    com.billbull.backend.hr.employees.EmployeeController employeeController,
                                    com.billbull.backend.sales.settings.SalesSettingsService salesSettingsService) {
        this.productService = productService;
        this.taxService = taxService;
        this.settings = settings;
        this.mapper = mapper;
        this.employeeController = employeeController;
        this.salesSettingsService = salesSettingsService;
    }

    /** One sellable product as the offline till sees it. */
    public record CatalogLine(Long id, String code, BigDecimal retailPrice, BigDecimal taxRate, String unitName) {}

    public Map<String, Object> build(Long branchId) {
        List<Map<String, Object>> products = new ArrayList<>();
        int excluded = 0;
        boolean truncated = false;
        for (int page = 0; ; page++) {
            Map<String, Object> result = productService.getList(page, PAGE, "", null, null, null, true, "code");
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> content = (List<Map<String, Object>>) result.getOrDefault("content", List.of());
            for (Map<String, Object> item : content) {
                Map<String, Object> slim = eligible(item, branchId);
                if (slim == null) { excluded++; continue; }
                if (products.size() >= settings.catalogMaxProducts()) { truncated = true; break; }
                products.add(slim);
            }
            Object totalPages = result.get("totalPages");
            if (truncated || content.isEmpty() || !(totalPages instanceof Number n) || page + 1 >= n.intValue()) break;
        }

        Map<String, Object> tax = new LinkedHashMap<>();
        tax.put("taxEnabled", taxService.isTaxEnabled(branchId));
        tax.put("taxInclusive", taxService.isTaxInclusive(branchId));
        tax.put("branchDefaultVatRate", taxService.getBranchDefaultVatRate(branchId));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("branchId", branchId);
        body.put("tax", tax);
        body.put("products", products);
        body.put("salespersons", salespersons());
        body.put("excludedCount", excluded);
        body.put("truncated", truncated);
        String version;
        try {
            version = PosOfflineCrypto.sha256Hex(mapper.writeValueAsBytes(body)).substring(0, 16);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        body.put("version", version);
        body.put("generatedAt", java.time.Instant.now().toString());
        return body;
    }

    /** The product as this server would sell it offline now, or empty when it may not be sold offline. */
    public Optional<CatalogLine> currentLine(String itemCode, Long branchId) {
        if (itemCode == null || itemCode.isBlank()) return Optional.empty();
        Map<String, Object> result = productService.getList(0, 50, itemCode.trim(), null, null, null, true, null);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> content = (List<Map<String, Object>>) result.getOrDefault("content", List.of());
        return content.stream()
                .filter(item -> itemCode.trim().equalsIgnoreCase(String.valueOf(item.get("code"))))
                .map(item -> eligible(item, branchId))
                .filter(Objects::nonNull)
                .findFirst()
                .map(s -> new CatalogLine(((Number) s.get("id")).longValue(), (String) s.get("code"),
                        (BigDecimal) s.get("retailPrice"), (BigDecimal) s.get("taxRate"), (String) s.get("unitName")));
    }

    private Map<String, Object> eligible(Map<String, Object> item, Long branchId) {
        // fefoEnabled is not checked: it only has effect on batch products, which are excluded here.
        if (truthy(item.get("isBatch")) || truthy(item.get("isSerial")) || truthy(item.get("expiryEnabled"))) return null;
        if (!truthy(item.get("availableInPos"))) return null;
        Object status = item.get("branchStatus") != null ? item.get("branchStatus") : item.get("status");
        if (status != null && !"ACTIVE".equalsIgnoreCase(String.valueOf(status))) return null;
        BigDecimal retail = decimal(item.get("retailPrice"));
        if (retail == null || retail.signum() <= 0) return null;
        BigDecimal productTax = decimal(item.get("salesTax"));
        BigDecimal rate = taxService.isTaxEnabled(branchId) ? taxService.resolveSalesTaxRate(productTax, branchId) : BigDecimal.ZERO;

        String unitName = (String) item.get("unitName");
        List<String> barcodes = new ArrayList<>();
        Object packings = item.get("packings");
        if (packings instanceof List<?> list) {
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> p) || p.get("barcode") == null) continue;
                Object level = p.get("level");
                Object unit = p.get("unit") instanceof Map<?, ?> u ? u.get("name") : null;
                boolean baseUnit = (level == null || "1".equals(String.valueOf(level)) || "L1".equalsIgnoreCase(String.valueOf(level)))
                        && (unit == null || unitName == null || unitName.equalsIgnoreCase(String.valueOf(unit)));
                if (baseUnit) barcodes.add(String.valueOf(p.get("barcode")));
            }
        }

        Map<String, Object> slim = new LinkedHashMap<>();
        slim.put("id", item.get("id"));
        slim.put("code", item.get("code"));
        slim.put("name", item.get("name"));
        slim.put("localName", item.get("localName"));
        slim.put("barcode", barcodes.isEmpty() ? null : barcodes.get(0));
        slim.put("barcodes", barcodes);
        slim.put("retailPrice", retail);
        slim.put("minPrice", decimal(item.get("minPrice")));
        slim.put("maxPrice", decimal(item.get("maxPrice")));
        slim.put("salesTax", productTax);
        slim.put("taxRate", rate);
        slim.put("defaultDiscount", 0);
        slim.put("departmentId", item.get("departmentId"));
        slim.put("departmentName", item.get("departmentName"));
        slim.put("productType", item.get("productType"));
        slim.put("unitName", unitName);
        slim.put("availableInPos", true);
        slim.put("isBatch", false);
        slim.put("isSerial", false);
        slim.put("fefoEnabled", false);
        slim.put("stock", item.get("stock"));
        return slim;
    }

    /** Roster for offline salesperson attribution: id, code, name and role only (as the online feed). */
    private Map<String, Object> salespersons() {
        Map<String, Object> out = new LinkedHashMap<>();
        var sales = salesSettingsService.getSettings();
        out.put("required", sales != null && sales.isSalespersonRequiredAtPos());
        Map<String, Object> roster = employeeController.getSalespersons(SecurityContextHolder.getContext().getAuthentication());
        out.put("defaultEmployeeId", roster.get("defaultEmployeeId"));
        List<Object> lookups = new ArrayList<>();
        Object options = roster.get("options");
        if (options instanceof List<?> list) {
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> opt) || opt.get("employeeCode") == null) continue;
                try {
                    lookups.add(employeeController.lookupSalespersonByCode(String.valueOf(opt.get("employeeCode")), null));
                } catch (RuntimeException ineligible) {
                    // Not eligible today: leave them out, exactly as the online lookup would refuse.
                }
            }
        }
        out.put("lookups", lookups);
        return out;
    }

    private static boolean truthy(Object o) {
        return o instanceof Boolean b ? b : o != null && "true".equalsIgnoreCase(String.valueOf(o));
    }

    private static BigDecimal decimal(Object o) {
        if (o == null) return null;
        if (o instanceof BigDecimal b) return b;
        if (o instanceof Number n) return new BigDecimal(n.toString());
        try {
            return new BigDecimal(String.valueOf(o));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
