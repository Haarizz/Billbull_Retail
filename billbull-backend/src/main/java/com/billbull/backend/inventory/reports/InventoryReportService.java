package com.billbull.backend.inventory.reports;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.inventory.product.*;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;

import java.math.RoundingMode;

@Service
@Transactional(readOnly = true)
public class InventoryReportService {

    private final ProductRepository productRepo;
    private final ProductPricingRepository pricingRepo;
    private final ProductInventoryPolicyRepository inventoryRepo;
    private final StockMovementRepository stockRepo;
    private final WarehouseRepository warehouseRepo;

    public InventoryReportService(
            ProductRepository productRepo,
            ProductPricingRepository pricingRepo,
            ProductInventoryPolicyRepository inventoryRepo,
            StockMovementRepository stockRepo,
            WarehouseRepository warehouseRepo) {
        this.productRepo = productRepo;
        this.pricingRepo = pricingRepo;
        this.inventoryRepo = inventoryRepo;
        this.stockRepo = stockRepo;
        this.warehouseRepo = warehouseRepo;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper: build a warehouse-name map (id → name)
    // ─────────────────────────────────────────────────────────────────────────
    private Map<Long, String> getWarehouseNameMap() {
        return warehouseRepo.findAll().stream()
                .collect(Collectors.toMap(Warehouse::getId, Warehouse::getName));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STOCK ON HAND
    // ─────────────────────────────────────────────────────────────────────────
    public List<StockReportResponse> getStockOnHand(Long warehouseId) {

        // 1. Fetch stock movements aggregated by product (and warehouse if scoped)
        List<Object[]> stockRows = (warehouseId != null)
                ? stockRepo.findStockByWarehouse(warehouseId)
                : stockRepo.findAllStockGroupedByProductAndWarehouse();

        if (stockRows == null || stockRows.isEmpty())
            return Collections.emptyList();

        // 2. Collect product IDs that have non-zero stock
        Set<Long> productIdSet = new LinkedHashSet<>();
        for (Object[] row : stockRows) {
            Number qtyNum = (Number) row[warehouseId != null ? 1 : 2];
            if (qtyNum != null && qtyNum.longValue() != 0) {
                productIdSet.add(((Number) row[0]).longValue());
            }
        }
        if (productIdSet.isEmpty())
            return Collections.emptyList();
        List<Long> productIds = new ArrayList<>(productIdSet);

        // 3. Batch-load all required data in 3 queries (no N+1)
        Map<Long, Product> productMap = productRepo.findAllById(productIds)
                .stream().collect(Collectors.toMap(Product::getId, p -> p));

        Map<Long, ProductPricing> pricingMap = pricingRepo.findByProductIdIn(productIds)
                .stream().collect(Collectors.toMap(
                        pp -> pp.getProduct().getId(), pp -> pp, (a, b) -> a));

        Map<Long, ProductInventoryPolicy> invMap = inventoryRepo.findByProductIdIn(productIds)
                .stream().collect(Collectors.toMap(
                        pi -> pi.getProduct().getId(), pi -> pi, (a, b) -> a));

        Map<Long, String> warehouseNameMap = getWarehouseNameMap();

        // 4. Build responses
        List<StockReportResponse> result = new ArrayList<>();

        if (warehouseId != null) {
            String wName = warehouseNameMap.getOrDefault(warehouseId, "Warehouse");
            for (Object[] row : stockRows) {
                Long pId = ((Number) row[0]).longValue();
                Number qtyNum = (Number) row[1];
                BigDecimal qty = qtyNum == null ? BigDecimal.ZERO : new BigDecimal(qtyNum.toString());

                if (qty.compareTo(BigDecimal.ZERO) == 0)
                    continue;
                Product p = productMap.get(pId);
                if (p == null)
                    continue;

                result.add(buildResponse(p, wName, qty, pricingMap.get(pId), invMap.get(pId)));
            }
        } else {
            for (Object[] row : stockRows) {
                Long pId = ((Number) row[0]).longValue();
                Number wIdNum = (Number) row[1];
                Number qtyNum = (Number) row[2];
                Long wId = wIdNum != null ? wIdNum.longValue() : null;
                BigDecimal qty = qtyNum == null ? BigDecimal.ZERO : new BigDecimal(qtyNum.toString());

                if (qty.compareTo(BigDecimal.ZERO) == 0)
                    continue;
                Product p = productMap.get(pId);
                if (p == null)
                    continue;

                String wName = wId != null ? warehouseNameMap.getOrDefault(wId, "Warehouse") : "Warehouse";
                result.add(buildResponse(p, wName, qty, pricingMap.get(pId), invMap.get(pId)));
            }
        }

        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LOW STOCK — delegates to SOH then filters
    // ─────────────────────────────────────────────────────────────────────────
    public List<StockReportResponse> getLowStock(Long warehouseId) {
        return getStockOnHand(warehouseId).stream().filter(r -> r.getOnHand() != null
                && r.getOnHand().compareTo(BigDecimal.TEN) < 0
                && r.getOnHand().compareTo(BigDecimal.ZERO) > 0).collect(Collectors.toList());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OUT OF STOCK
    // ─────────────────────────────────────────────────────────────────────────
    public List<StockReportResponse> getOutOfStock(Long warehouseId) {

        // Load all active products (just basics for fast report generation)
        List<Object[]> productBasicsRows = productRepo.findActiveProductReportBasics();
        if (productBasicsRows == null || productBasicsRows.isEmpty())
            return Collections.emptyList();

        List<Long> productIds = new ArrayList<>();
        Map<Long, Object[]> productMap = new HashMap<>();

        for (Object[] row : productBasicsRows) {
            Long pId = ((Number) row[0]).longValue();
            productIds.add(pId);
            productMap.put(pId, row);
        }

        // Get total stock per product
        List<Object[]> stockRows = (warehouseId != null)
                ? stockRepo.findStockByWarehouse(warehouseId)
                : stockRepo.getTotalAvailableStockForProducts(productIds);

        Map<Long, BigDecimal> stockMap = new HashMap<>();
        for (Object[] row : stockRows) {
            Long pId = ((Number) row[0]).longValue();
            Number qtyNum = (Number) row[1];
            stockMap.put(pId, qtyNum == null ? BigDecimal.ZERO : new BigDecimal(qtyNum.toString()));
        }

        // Find zero-stock product IDs
        List<Long> outIds = productIds.stream()
                .filter(id -> stockMap.getOrDefault(id, BigDecimal.ZERO).compareTo(BigDecimal.ZERO) <= 0)
                .collect(Collectors.toList());

        if (outIds.isEmpty())
            return Collections.emptyList();

        // Get last movement dates
        SimpleDateFormat sdf = new SimpleDateFormat("dd MMM yyyy");
        Map<Long, String[]> dateMap = new HashMap<>();
        try {
            List<Object[]> dates = stockRepo.findLastMovementDates(outIds);
            for (Object[] row : dates) {
                long pId = ((Number) row[0]).longValue();
                String lastSold = row[1] != null ? sdf.format((Timestamp) row[1]) : "N/A";
                String lastReceived = row[2] != null ? sdf.format((Timestamp) row[2]) : "N/A";
                dateMap.put(pId, new String[] { lastSold, lastReceived });
            }
        } catch (Exception ignored) {
            /* date query is optional */ }

        Map<Long, String> warehouseNameMap = getWarehouseNameMap();
        String wName = warehouseId != null
                ? warehouseNameMap.getOrDefault(warehouseId, "Warehouse")
                : "All Warehouses";

        List<StockReportResponse> result = new ArrayList<>();
        for (Long pId : outIds) {
            Object[] pRow = productMap.get(pId);
            if (pRow == null)
                continue;

            // Row mapping: 0:id, 1:sku, 2:code, 3:name, 4:category, 5:deptName, 6:brandName
            String sku = (String) pRow[1];
            String code = (String) pRow[2];
            String name = (String) pRow[3];
            String category = (String) pRow[4];
            String deptName = (String) pRow[5];
            String brandName = (String) pRow[6];

            StockReportResponse res = new StockReportResponse();
            res.setProductId(pId);
            res.setSku(sku != null ? sku : code);
            res.setItem(name);
            res.setCategory(category);
            res.setWarehouse(wName);
            res.setOnHand(BigDecimal.ZERO);

            if (deptName != null)
                res.setDepartment(deptName);
            if (brandName != null)
                res.setBrand(brandName);

            String[] dp = dateMap.getOrDefault(pId, new String[] { "N/A", "N/A" });
            res.setLastSold(dp[0]);
            res.setLastReceived(dp[1]);
            result.add(res);
        }

        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STOCK VALUATION
    // Unit cost is derived from the product's configured costMethod:
    //   WEIGHTED_AVERAGE  → SUM(unitCost * qty) / SUM(qty) from inbound movements
    //   LIFO              → unitCost of the most recent inbound movement (date DESC, id DESC)
    //   LAST_PURCHASE_COST→ same as LIFO (most recent purchase price)
    //   FIFO              → unitCost of the oldest inbound movement (date ASC, id ASC)
    //   null / other      → falls back to product_pricing.cost
    // fifoUnitCost and lifoUnitCost are always populated so the frontend can
    // display method-specific comparison totals in the summary cards.
    // ─────────────────────────────────────────────────────────────────────────
    public List<StockReportResponse> getStockValuation(Long warehouseId) {

        // 1. Fetch stock movements aggregated by product (and warehouse)
        List<Object[]> stockRows = (warehouseId != null)
                ? stockRepo.findStockByWarehouse(warehouseId)
                : stockRepo.findAllStockGroupedByProductAndWarehouse();

        if (stockRows == null || stockRows.isEmpty())
            return Collections.emptyList();

        // 2. Collect product IDs with non-zero stock; also collect unique warehouse IDs
        Set<Long> productIdSet = new LinkedHashSet<>();
        Set<Long> warehouseIdSet = new LinkedHashSet<>();
        for (Object[] row : stockRows) {
            Number qtyNum = (Number) row[warehouseId != null ? 1 : 2];
            if (qtyNum != null && qtyNum.longValue() != 0) {
                productIdSet.add(((Number) row[0]).longValue());
                if (warehouseId == null && row[1] != null) {
                    warehouseIdSet.add(((Number) row[1]).longValue());
                }
            }
        }
        if (productIdSet.isEmpty())
            return Collections.emptyList();

        if (warehouseId != null)
            warehouseIdSet.add(warehouseId);

        List<Long> productIds = new ArrayList<>(productIdSet);

        // 3. Batch-load product data
        Map<Long, Product> productMap = productRepo.findAllById(productIds)
                .stream().collect(Collectors.toMap(Product::getId, p -> p));

        Map<Long, ProductPricing> pricingMap = pricingRepo.findByProductIdIn(productIds)
                .stream().collect(Collectors.toMap(
                        pp -> pp.getProduct().getId(), pp -> pp, (a, b) -> a));

        Map<Long, ProductInventoryPolicy> invMap = inventoryRepo.findByProductIdIn(productIds)
                .stream().collect(Collectors.toMap(
                        pi -> pi.getProduct().getId(), pi -> pi, (a, b) -> a));

        Map<Long, String> warehouseNameMap = getWarehouseNameMap();

        // 4. Load LIFO / FIFO / WAC cost maps per warehouse (one batch query each per wh)
        //    Structure: warehouseId → { productId → cost }
        Map<Long, Map<Long, BigDecimal>> wacByWh  = new HashMap<>();
        Map<Long, Map<Long, BigDecimal>> lifoByWh = new HashMap<>();
        Map<Long, Map<Long, BigDecimal>> fifoByWh = new HashMap<>();

        for (Long wId : warehouseIdSet) {
            wacByWh.put(wId,  toProductCostMap(stockRepo.getBatchWeightedAvgCostByWarehouse(wId)));
            lifoByWh.put(wId, toProductCostMap(stockRepo.getBatchLifoCostByWarehouse(wId)));
            fifoByWh.put(wId, toProductCostMap(stockRepo.getBatchFifoCostByWarehouse(wId)));
        }

        // 5. Build valuation responses
        List<StockReportResponse> result = new ArrayList<>();

        if (warehouseId != null) {
            String wName = warehouseNameMap.getOrDefault(warehouseId, "Warehouse");
            Map<Long, BigDecimal> wacMap  = wacByWh.getOrDefault(warehouseId, Collections.emptyMap());
            Map<Long, BigDecimal> lifoMap = lifoByWh.getOrDefault(warehouseId, Collections.emptyMap());
            Map<Long, BigDecimal> fifoMap = fifoByWh.getOrDefault(warehouseId, Collections.emptyMap());

            for (Object[] row : stockRows) {
                Long pId = ((Number) row[0]).longValue();
                Number qtyNum = (Number) row[1];
                BigDecimal qty = qtyNum == null ? BigDecimal.ZERO : new BigDecimal(qtyNum.toString());
                if (qty.compareTo(BigDecimal.ZERO) == 0) continue;
                Product p = productMap.get(pId);
                if (p == null) continue;
                result.add(buildValuationResponse(p, wName, qty,
                        pricingMap.get(pId), invMap.get(pId),
                        wacMap.get(pId), lifoMap.get(pId), fifoMap.get(pId)));
            }
        } else {
            for (Object[] row : stockRows) {
                Long pId = ((Number) row[0]).longValue();
                Number wIdNum = (Number) row[1];
                Number qtyNum = (Number) row[2];
                Long wId = wIdNum != null ? wIdNum.longValue() : null;
                BigDecimal qty = qtyNum == null ? BigDecimal.ZERO : new BigDecimal(qtyNum.toString());
                if (qty.compareTo(BigDecimal.ZERO) == 0) continue;
                Product p = productMap.get(pId);
                if (p == null) continue;

                Map<Long, BigDecimal> wacMap  = wId != null ? wacByWh.getOrDefault(wId, Collections.emptyMap()) : Collections.emptyMap();
                Map<Long, BigDecimal> lifoMap = wId != null ? lifoByWh.getOrDefault(wId, Collections.emptyMap()) : Collections.emptyMap();
                Map<Long, BigDecimal> fifoMap = wId != null ? fifoByWh.getOrDefault(wId, Collections.emptyMap()) : Collections.emptyMap();
                String wName = wId != null ? warehouseNameMap.getOrDefault(wId, "Warehouse") : "Warehouse";

                result.add(buildValuationResponse(p, wName, qty,
                        pricingMap.get(pId), invMap.get(pId),
                        wacMap.get(pId), lifoMap.get(pId), fifoMap.get(pId)));
            }
        }

        return result;
    }

    /**
     * Convert a List<Object[]> { [productId, cost], ... } to a Map<Long, BigDecimal>.
     * Handles both JPQL results (Number columns) and native query results.
     */
    private Map<Long, BigDecimal> toProductCostMap(List<Object[]> rows) {
        Map<Long, BigDecimal> map = new HashMap<>();
        if (rows == null) return map;
        for (Object[] row : rows) {
            if (row[0] == null || row[1] == null) continue;
            Long productId = ((Number) row[0]).longValue();
            BigDecimal cost = new BigDecimal(row[1].toString()).setScale(4, RoundingMode.HALF_UP);
            if (cost.compareTo(BigDecimal.ZERO) > 0)
                map.put(productId, cost);
        }
        return map;
    }

    /**
     * Build a valuation-specific response where unitCost is derived from the
     * product's configured costMethod rather than the static pricing.cost field.
     */
    private StockReportResponse buildValuationResponse(
            Product p, String wName, BigDecimal qty,
            ProductPricing pricing, ProductInventoryPolicy inv,
            BigDecimal wacCost, BigDecimal lifoCost, BigDecimal fifoCost) {

        StockReportResponse res = new StockReportResponse();
        res.setProductId(p.getId());
        res.setSku(p.getSku() != null ? p.getSku() : p.getCode());
        res.setItem(p.getName());
        res.setCategory(p.getCategory());
        res.setWarehouse(wName);
        res.setOnHand(qty);

        if (p.getDepartment() != null) res.setDepartment(p.getDepartment().getName());
        if (p.getBrand() != null)      res.setBrand(p.getBrand().getName());

        // Inventory policy
        if (inv != null) {
            res.setUom(inv.getDefaultUnit() != null ? inv.getDefaultUnit().getName() : "PCS");
            res.setMinStock(inv.getMinStock() != null ? new BigDecimal(inv.getMinStock()) : BigDecimal.ZERO);
            BigDecimal maxStock    = inv.getMaxStock()    != null ? new BigDecimal(inv.getMaxStock())    : BigDecimal.ZERO;
            BigDecimal reorderQty  = inv.getReorderQty()  != null ? new BigDecimal(inv.getReorderQty())  : BigDecimal.ZERO;
            res.setSuggestedPoQty(maxStock.compareTo(BigDecimal.ZERO) > 0
                    ? maxStock.subtract(qty).max(BigDecimal.ZERO) : reorderQty);
            res.setDefaultVendor(inv.getDefaultVendor() != null ? inv.getDefaultVendor().getName() : "N/A");
        } else {
            res.setUom("PCS");
            res.setMinStock(BigDecimal.ZERO);
            res.setSuggestedPoQty(BigDecimal.ZERO);
            res.setDefaultVendor("N/A");
        }

        // Static fallback cost from product_pricing
        BigDecimal baseCost = (pricing != null && pricing.getCost() != null)
                ? pricing.getCost() : BigDecimal.ZERO;
        BigDecimal retail   = (pricing != null && pricing.getRetailPrice() != null)
                ? pricing.getRetailPrice() : BigDecimal.ZERO;
        CostMethod method   = pricing != null ? pricing.getCostMethod() : null;

        // Resolve unit cost based on the product's configured costing method.
        // Falls back to baseCost (product_pricing.cost) when movement data is absent.
        BigDecimal unitCost;
        if (method == null) {
            unitCost = baseCost;
        } else {
            switch (method) {
                case WEIGHTED_AVERAGE:
                    unitCost = (wacCost != null && wacCost.compareTo(BigDecimal.ZERO) > 0)
                            ? wacCost : baseCost;
                    break;
                case LIFO:
                case LAST_PURCHASE_COST:
                    unitCost = (lifoCost != null && lifoCost.compareTo(BigDecimal.ZERO) > 0)
                            ? lifoCost : baseCost;
                    break;
                case FIFO:
                    unitCost = (fifoCost != null && fifoCost.compareTo(BigDecimal.ZERO) > 0)
                            ? fifoCost : baseCost;
                    break;
                default:
                    unitCost = baseCost;
            }
        }

        // Always expose FIFO and LIFO costs for frontend summary card computation
        res.setFifoUnitCost(fifoCost != null && fifoCost.compareTo(BigDecimal.ZERO) > 0 ? fifoCost : baseCost);
        res.setLifoUnitCost(lifoCost != null && lifoCost.compareTo(BigDecimal.ZERO) > 0 ? lifoCost : baseCost);
        res.setCostMethod(method != null ? method.name() : "STANDARD");

        res.setUnitCost(unitCost);
        res.setValue(unitCost.multiply(qty));
        res.setRetailPrice(retail);
        res.setRetailValue(retail.multiply(qty));
        res.setPotentialMargin(retail.subtract(unitCost).multiply(qty));

        return res;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SHARED RESPONSE BUILDER
    // ─────────────────────────────────────────────────────────────────────────
    private StockReportResponse buildResponse(
            Product p, String wName, BigDecimal qty,
            ProductPricing pricing, ProductInventoryPolicy inv) {

        StockReportResponse res = new StockReportResponse();
        res.setProductId(p.getId());
        res.setSku(p.getSku() != null ? p.getSku() : p.getCode());
        res.setItem(p.getName());
        res.setCategory(p.getCategory());
        res.setWarehouse(wName);
        res.setOnHand(qty);

        // Department and Brand from product relations
        if (p.getDepartment() != null)
            res.setDepartment(p.getDepartment().getName());
        if (p.getBrand() != null)
            res.setBrand(p.getBrand().getName());

        // Inventory policy fields
        if (inv != null) {
            res.setUom(inv.getDefaultUnit() != null ? inv.getDefaultUnit().getName() : "PCS");
            res.setMinStock(inv.getMinStock() != null ? new BigDecimal(inv.getMinStock()) : BigDecimal.ZERO);
            BigDecimal maxStock = inv.getMaxStock() != null ? new BigDecimal(inv.getMaxStock()) : BigDecimal.ZERO;
            BigDecimal reorderQty = inv.getReorderQty() != null ? new BigDecimal(inv.getReorderQty()) : BigDecimal.ZERO;
            if (maxStock.compareTo(BigDecimal.ZERO) > 0) {
                res.setSuggestedPoQty(maxStock.subtract(qty).max(BigDecimal.ZERO));
            } else {
                res.setSuggestedPoQty(reorderQty);
            }
            res.setDefaultVendor(inv.getDefaultVendor() != null ? inv.getDefaultVendor().getName() : "N/A");
        } else {
            res.setUom("PCS");
            res.setMinStock(BigDecimal.ZERO);
            res.setSuggestedPoQty(BigDecimal.ZERO);
            res.setDefaultVendor("N/A");
        }

        // Pricing fields
        if (pricing != null) {
            BigDecimal cost = pricing.getCost() != null ? pricing.getCost() : BigDecimal.ZERO;
            BigDecimal retail = pricing.getRetailPrice() != null ? pricing.getRetailPrice() : BigDecimal.ZERO;
            res.setUnitCost(cost);
            res.setValue(cost.multiply(qty));
            res.setRetailPrice(retail);
            res.setRetailValue(retail.multiply(qty));
            res.setPotentialMargin(retail.subtract(cost).multiply(qty));
        } else {
            res.setUnitCost(BigDecimal.ZERO);
            res.setValue(BigDecimal.ZERO);
            res.setRetailPrice(BigDecimal.ZERO);
            res.setRetailValue(BigDecimal.ZERO);
            res.setPotentialMargin(BigDecimal.ZERO);
        }

        return res;
    }
}
