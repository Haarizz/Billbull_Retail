package com.billbull.backend.inventory.warehouse;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;

@Service
public class WarehouseStockService {

    private final StockMovementRepository stockRepo;
    private final ProductRepository productRepo;
    private final WarehouseRepository warehouseRepo;
    private final ZoneRepository zoneRepo;
    private final LocatorRepository locatorRepo;
    private final BinRepository binRepo;
    private final com.billbull.backend.sales.salesorder.SalesOrderRepository salesOrderRepo;
    private final com.billbull.backend.sales.delivery.DeliveryNoteRepository deliveryNoteRepo;

    public WarehouseStockService(
            StockMovementRepository stockRepo,
            ProductRepository productRepo,
            WarehouseRepository warehouseRepo,
            ZoneRepository zoneRepo,
            LocatorRepository locatorRepo,
            BinRepository binRepo,
            com.billbull.backend.sales.quotation.QuotationRepository quotationRepo,
            com.billbull.backend.sales.salesorder.SalesOrderRepository salesOrderRepo,
            com.billbull.backend.sales.delivery.DeliveryNoteRepository deliveryNoteRepo) {
        this.stockRepo = stockRepo;
        this.productRepo = productRepo;
        this.warehouseRepo = warehouseRepo;
        this.zoneRepo = zoneRepo;
        this.locatorRepo = locatorRepo;
        this.binRepo = binRepo;
        this.salesOrderRepo = salesOrderRepo;
        this.deliveryNoteRepo = deliveryNoteRepo;
    }

    // Helper: Bulk fetch global on-hand stock map
    private Map<Long, Integer> getGlobalOnHandMap(List<Long> productIds) {
        if (productIds == null || productIds.isEmpty())
            return new HashMap<>();
        List<Object[]> rows = stockRepo.getTotalAvailableStockForProducts(productIds);
        Map<Long, Integer> map = new HashMap<>();
        for (Object[] row : rows) {
            map.put((Long) row[0], ((Number) row[1]).intValue());
        }
        return map;
    }

    // Helper: Bulk fetch global reserved map
    private Map<Long, Integer> getGlobalReservedMap(List<Product> products) {
        if (products == null || products.isEmpty())
            return new HashMap<>();
        List<String> productCodes = products.stream().map(Product::getCode).collect(Collectors.toList());

        Map<String, Integer> codeMap = new HashMap<>();
        // 🚫 SOFT RESERVATION RULE: Quotations should not block physical stock.
        // We no longer add qReservations to codeMap for hard reservation calculating.
        // List<Object[]> qReservations =
        // quotationRepo.sumReservedQuantityForProducts(productCodes);
        // for (Object[] row : qReservations) {
        // String code = (String) row[0];
        // int qty = ((Number) row[1]).intValue();
        // codeMap.put(code, codeMap.getOrDefault(code, 0) + qty);
        // }

        List<Object[]> soReservations = salesOrderRepo.sumReservedQuantityForProducts(productCodes);
        for (Object[] row : soReservations) {
            String code = (String) row[0];
            int qty = ((Number) row[1]).intValue();
            codeMap.put(code, codeMap.getOrDefault(code, 0) + qty);
        }

        Map<Long, Integer> map = new HashMap<>();
        for (Product p : products) {
            map.put(p.getId(), codeMap.getOrDefault(p.getCode(), 0));
        }

        return map;
    }

    public List<WarehouseStockResponse> getStock(Long warehouseId) {
        List<Object[]> rows = stockRepo.findStockByWarehouse(warehouseId);

        com.billbull.backend.inventory.warehouse.Warehouse w = warehouseRepo.findById(warehouseId)
                .orElseThrow(() -> new RuntimeException("Warehouse not found"));

        List<Long> productIds = rows.stream().map(row -> (Long) row[0]).collect(Collectors.toList());
        List<Product> products = productRepo.findAllById(productIds);
        Map<Long, Product> productMap = products.stream().collect(Collectors.toMap(Product::getId, p -> p));

        Map<Long, Integer> globalOnHandMap = getGlobalOnHandMap(productIds);
        Map<Long, Integer> globalReservedMap = getGlobalReservedMap(products);

        return rows.stream().map(row -> {
            Long productId = (Long) row[0];
            Integer onHand = ((Number) row[1]).intValue();
            Product p = productMap.get(productId);

            int globalOnHand = globalOnHandMap.getOrDefault(productId, 0);
            int globalReserved = globalReservedMap.getOrDefault(productId, 0);

            // Proportional Distribution with Zero-Stock check
            int reserved = 0;
            if (globalOnHand > 0) {
                // floor the value so we don't accidentally over-reserve across scattered bits
                double frac = ((double) onHand / globalOnHand) * globalReserved;
                reserved = (int) Math.floor(frac);
            }

            // Add direct specific reservations from Delivery Notes for this warehouse
            int warehouseDnReserved = deliveryNoteRepo.sumReservedQtyInDispatchedNotes(productId, warehouseId)
                    .intValue();
            reserved += warehouseDnReserved;

            int available = onHand - reserved;

            WarehouseStockResponse res = new WarehouseStockResponse();
            res.setProductId(productId);
            res.setProductCode(p.getCode());
            res.setProductName(p.getName());
            res.setWarehouseId(warehouseId);
            res.setWarehouseName(w.getName());
            res.setWarehouseType(w.getType());
            res.setQuantity(onHand);
            res.setReserved(reserved);
            res.setAvailable(available);

            return res;
        }).collect(Collectors.toList());
    }

    // Inner class for deterministic proportional allocation
    private static class Allocation {
        int index;
        long warehouseId;
        String warehouseName;
        String warehouseType;
        int onHand;

        double frac;
        int floored;
        double remainder;
    }

    public List<WarehouseStockResponse> getStockByProduct(String productCode) {
        Product p = productRepo.findByCodeAndIsActiveTrue(productCode)
                .orElseThrow(() -> new RuntimeException("Product not found: " + productCode));

        List<Object[]> rows = stockRepo.findStockByProductForAllWarehouses(p.getId());

        int globalOnHand = stockRepo.getTotalAvailableStock(p.getId()).intValue();

        // 🚫 SOFT RESERVATION RULE: Quotations should not block physical stock.
        // BigDecimal totalQtnReserved = quotationRepo.sumReservedQuantity(p.getCode());
        BigDecimal totalSoReserved = salesOrderRepo.sumReservedQuantity(p.getCode());

        int globalReserved = (totalSoReserved != null ? totalSoReserved.intValue() : 0);

        List<Allocation> allocations = new ArrayList<>();
        int totalAssigned = 0;

        for (int i = 0; i < rows.size(); i++) {
            Object[] row = rows.get(i);
            int onHand = ((Number) row[1]).intValue();
            Long warehouseId = (Long) row[2];
            String warehouseName = (String) row[3];
            String warehouseType = (String) row[4];

            Allocation alloc = new Allocation();
            alloc.index = i;
            alloc.warehouseId = warehouseId;
            alloc.warehouseName = warehouseName;
            alloc.warehouseType = warehouseType;
            alloc.onHand = onHand;

            // Division-by-zero protection
            if (globalOnHand > 0) {
                alloc.frac = ((double) onHand / globalOnHand) * globalReserved;
            } else {
                alloc.frac = 0;
            }

            alloc.floored = (int) Math.floor(alloc.frac);
            alloc.remainder = alloc.frac - alloc.floored;

            totalAssigned += alloc.floored;
            allocations.add(alloc);
        }

        // Assign remaining units to highest fractional parts
        int remainingToAssign = globalReserved - totalAssigned;
        if (remainingToAssign > 0 && remainingToAssign <= rows.size()) {
            allocations.sort((a, b) -> Double.compare(b.remainder, a.remainder));
            for (int i = 0; i < remainingToAssign; i++) {
                allocations.get(i).floored += 1;
            }
        }

        // Re-sort back to original index order
        allocations.sort((a, b) -> Integer.compare(a.index, b.index));

        List<WarehouseStockResponse> responses = new ArrayList<>();
        for (Allocation alloc : allocations) {
            WarehouseStockResponse res = new WarehouseStockResponse();
            res.setProductId(p.getId());
            res.setProductCode(p.getCode());
            res.setProductName(p.getName());
            res.setWarehouseId(alloc.warehouseId);
            res.setWarehouseName(alloc.warehouseName);
            res.setWarehouseType(alloc.warehouseType);
            res.setQuantity(alloc.onHand);

            // Add specific DN reservations for this warehouse to the allocated proportional
            // part
            int warehouseDnReserved = deliveryNoteRepo.sumReservedQtyInDispatchedNotes(p.getId(), alloc.warehouseId)
                    .intValue();
            int totalReserved = alloc.floored + warehouseDnReserved;

            res.setReserved(totalReserved);
            res.setAvailable(alloc.onHand - totalReserved);

            responses.add(res);
        }

        return responses;
    }

    public BigDecimal getAvailableStockWithFilters(Long warehouseId, Long productId, Long zoneId, Long locatorId,
            Long binId) {
        BigDecimal onHand = stockRepo.getAvailableStockWithFilters(warehouseId, productId, zoneId, locatorId, binId);
        if (productId == null)
            return onHand; // Aggregate doesn't support reservation subtraction easily here

        BigDecimal reserved = BigDecimal.ZERO;
        if (binId != null) {
            reserved = deliveryNoteRepo.sumReservedQtyInDispatchedNotesByBin(productId, binId);
        } else if (warehouseId != null) {
            reserved = deliveryNoteRepo.sumReservedQtyInDispatchedNotes(productId, warehouseId);
        }

        return onHand.subtract(reserved);
    }

    public BigDecimal getAvailableStock(Long warehouseId, Long productId) {
        BigDecimal onHand = stockRepo.getAvailableStock(warehouseId, productId);
        BigDecimal dnReserved = deliveryNoteRepo.sumReservedQtyInDispatchedNotes(productId, warehouseId);

        // Also subtract Sales Order hard reservations so SO validation cannot double-book.
        BigDecimal soReserved = BigDecimal.ZERO;
        Product p = productRepo.findById(productId).orElse(null);
        if (p != null) {
            BigDecimal raw = salesOrderRepo.sumReservedQuantity(p.getCode());
            soReserved = raw != null ? raw : BigDecimal.ZERO;
        }

        return onHand.subtract(dnReserved).subtract(soReserved);
    }

    public WarehouseController.WarehouseStockSummary getStockSummary(Long warehouseId) {
        List<WarehouseStockResponse> stockRows = getStock(warehouseId);

        int totalSkus = stockRows.size();
        int totalQty = stockRows.stream()
                .mapToInt(row -> row.getQuantity() != null ? row.getQuantity() : 0)
                .sum();
        int reserved = stockRows.stream()
                .mapToInt(row -> row.getReserved() != null ? row.getReserved() : 0)
                .sum();

        // TODO: Implement expiring, fast moving, dead stock calculations
        int expiring = 0; // Items expiring within 30 days
        int fastMoving = 0; // Items with high turnover
        int deadStock = 0; // Items with no movement for 90+ days

        return new WarehouseController.WarehouseStockSummary(
                totalSkus,
                totalQty,
                fastMoving,
                expiring,
                reserved,
                deadStock);
    }

    public List<Zone> getZonesByWarehouse(Long warehouseId) {
        return zoneRepo.findByWarehouseId(warehouseId);
    }

    public List<Locator> getLocatorsByZone(Long zoneId) {
        return locatorRepo.findByZoneId(zoneId);
    }

    public List<Bin> getBinsByLocator(Long locatorId) {
        return binRepo.findByLocatorId(locatorId);
    }
}
