package com.billbull.backend.inventory.warehouse;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
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

    private Map<Long, Integer> getGlobalReservedMap(List<Product> products) {
        if (products == null || products.isEmpty()) {
            return new HashMap<>();
        }

        List<String> productCodes = products.stream().map(Product::getCode).collect(Collectors.toList());
        Map<String, Integer> codeMap = new HashMap<>();

        List<Object[]> soReservations = salesOrderRepo.sumReservedQuantityForProducts(productCodes);
        for (Object[] row : soReservations) {
            String code = (String) row[0];
            int qty = ((Number) row[1]).intValue();
            codeMap.put(code, codeMap.getOrDefault(code, 0) + qty);
        }

        Map<Long, Integer> map = new HashMap<>();
        for (Product product : products) {
            map.put(product.getId(), codeMap.getOrDefault(product.getCode(), 0));
        }

        return map;
    }

    private int safeInt(BigDecimal value) {
        return value != null ? value.intValue() : 0;
    }

    private Map<Long, Integer> allocateReservedByLargestRemainder(Map<Long, Integer> onHandByBucket, int totalReserved) {
        Map<Long, Integer> allocation = new HashMap<>();
        if (onHandByBucket == null || onHandByBucket.isEmpty() || totalReserved <= 0) {
            return allocation;
        }

        class Share {
            Long bucketId;
            int onHand;
            int allocated;
            double remainder;
        }

        List<Share> shares = new ArrayList<>();
        int totalOnHand = 0;

        for (Map.Entry<Long, Integer> entry : onHandByBucket.entrySet()) {
            int onHand = entry.getValue() != null ? entry.getValue() : 0;
            if (onHand <= 0) {
                continue;
            }

            Share share = new Share();
            share.bucketId = entry.getKey();
            share.onHand = onHand;
            shares.add(share);
            totalOnHand += onHand;
        }

        if (totalOnHand <= 0 || shares.isEmpty()) {
            return allocation;
        }

        int totalAssigned = 0;
        for (Share share : shares) {
            double fractional = ((double) share.onHand / totalOnHand) * totalReserved;
            share.allocated = (int) Math.floor(fractional);
            share.remainder = fractional - share.allocated;
            totalAssigned += share.allocated;
        }

        int remaining = totalReserved - totalAssigned;
        if (remaining > 0) {
            shares.sort((left, right) -> {
                int remainderCompare = Double.compare(right.remainder, left.remainder);
                if (remainderCompare != 0) {
                    return remainderCompare;
                }

                int onHandCompare = Integer.compare(right.onHand, left.onHand);
                if (onHandCompare != 0) {
                    return onHandCompare;
                }

                return Long.compare(left.bucketId, right.bucketId);
            });

            for (int i = 0; i < remaining && i < shares.size(); i++) {
                shares.get(i).allocated += 1;
            }
        }

        for (Share share : shares) {
            allocation.put(share.bucketId, share.allocated);
        }

        return allocation;
    }

    private Map<Long, Map<Long, Integer>> buildWarehouseOnHandMap(List<Long> productIds) {
        Map<Long, Map<Long, Integer>> warehouseOnHandMap = new HashMap<>();
        if (productIds == null || productIds.isEmpty()) {
            return warehouseOnHandMap;
        }

        for (Object[] row : stockRepo.findStockByProductsForAllWarehouses(productIds)) {
            Long productId = (Long) row[0];
            Long warehouseId = (Long) row[1];
            int onHand = ((Number) row[2]).intValue();

            warehouseOnHandMap
                    .computeIfAbsent(productId, ignored -> new HashMap<>())
                    .put(warehouseId, onHand);
        }

        return warehouseOnHandMap;
    }

    private Map<Long, Map<Long, Integer>> getSalesOrderReservationAllocations(List<Product> products) {
        Map<Long, Map<Long, Integer>> allocations = new HashMap<>();
        if (products == null || products.isEmpty()) {
            return allocations;
        }

        Map<Long, Integer> globalReservedMap = getGlobalReservedMap(products);
        Map<Long, Map<Long, Integer>> warehouseOnHandMap = buildWarehouseOnHandMap(
                products.stream().map(Product::getId).toList());

        for (Product product : products) {
            Map<Long, Integer> onHandByWarehouse = warehouseOnHandMap.getOrDefault(product.getId(), Collections.emptyMap());
            int globalReserved = globalReservedMap.getOrDefault(product.getId(), 0);
            allocations.put(product.getId(), allocateReservedByLargestRemainder(onHandByWarehouse, globalReserved));
        }

        return allocations;
    }

    public int getSalesOrderReservedForWarehouse(Long warehouseId, Long productId) {
        Product product = productRepo.findById(productId).orElse(null);
        if (product == null) {
            return 0;
        }

        return getSalesOrderReservationAllocations(List.of(product))
                .getOrDefault(productId, Collections.emptyMap())
                .getOrDefault(warehouseId, 0);
    }

    public int getTotalReservedForWarehouse(Long warehouseId, Long productId) {
        int salesOrderReserved = getSalesOrderReservedForWarehouse(warehouseId, productId);
        int deliveryNoteReserved = safeInt(deliveryNoteRepo.sumReservedQtyInDispatchedNotes(productId, warehouseId));
        return salesOrderReserved + deliveryNoteReserved;
    }

    public List<WarehouseStockResponse> getStock(Long warehouseId) {
        List<Object[]> rows = stockRepo.findStockByWarehouse(warehouseId);
        Warehouse warehouse = warehouseRepo.findById(warehouseId)
                .orElseThrow(() -> new RuntimeException("Warehouse not found"));

        List<Long> productIds = rows.stream().map(row -> (Long) row[0]).collect(Collectors.toList());
        List<Product> products = productRepo.findAllById(productIds);
        Map<Long, Product> productMap = products.stream().collect(Collectors.toMap(Product::getId, product -> product));
        Map<Long, Map<Long, Integer>> salesOrderAllocations = getSalesOrderReservationAllocations(products);

        return rows.stream().map(row -> {
            Long productId = (Long) row[0];
            int onHand = ((Number) row[1]).intValue();
            Product product = productMap.get(productId);

            int reserved = salesOrderAllocations
                    .getOrDefault(productId, Collections.emptyMap())
                    .getOrDefault(warehouseId, 0);
            reserved += safeInt(deliveryNoteRepo.sumReservedQtyInDispatchedNotes(productId, warehouseId));

            WarehouseStockResponse response = new WarehouseStockResponse();
            response.setProductId(productId);
            response.setProductCode(product.getCode());
            response.setProductName(product.getName());
            response.setWarehouseId(warehouseId);
            response.setWarehouseName(warehouse.getName());
            response.setWarehouseType(warehouse.getType());
            response.setQuantity(onHand);
            response.setReserved(reserved);
            response.setAvailable(onHand - reserved);
            return response;
        }).collect(Collectors.toList());
    }

    public List<WarehouseStockResponse> getStockByProduct(String productCode) {
        Product product = productRepo.findByCodeAndIsActiveTrue(productCode)
                .orElseThrow(() -> new RuntimeException("Product not found: " + productCode));

        List<Object[]> rows = stockRepo.findStockByProductForAllWarehouses(product.getId());
        Map<Long, Integer> salesOrderAllocation = getSalesOrderReservationAllocations(List.of(product))
                .getOrDefault(product.getId(), Collections.emptyMap());

        List<WarehouseStockResponse> responses = new ArrayList<>();
        for (Object[] row : rows) {
            int onHand = ((Number) row[1]).intValue();
            Long warehouseId = (Long) row[2];
            String warehouseName = (String) row[3];
            String warehouseType = (String) row[4];

            int totalReserved = salesOrderAllocation.getOrDefault(warehouseId, 0)
                    + safeInt(deliveryNoteRepo.sumReservedQtyInDispatchedNotes(product.getId(), warehouseId));

            WarehouseStockResponse response = new WarehouseStockResponse();
            response.setProductId(product.getId());
            response.setProductCode(product.getCode());
            response.setProductName(product.getName());
            response.setWarehouseId(warehouseId);
            response.setWarehouseName(warehouseName);
            response.setWarehouseType(warehouseType);
            response.setQuantity(onHand);
            response.setReserved(totalReserved);
            response.setAvailable(onHand - totalReserved);
            responses.add(response);
        }

        return responses;
    }

    public BigDecimal getAvailableStockWithFilters(Long warehouseId, Long productId, Long zoneId, Long locatorId,
            Long binId) {
        BigDecimal onHand = stockRepo.getAvailableStockWithFilters(warehouseId, productId, zoneId, locatorId, binId);
        if (productId == null) {
            return onHand;
        }

        BigDecimal reserved = BigDecimal.ZERO;
        if (binId != null) {
            reserved = deliveryNoteRepo.sumReservedQtyInDispatchedNotesByBin(productId, binId);
        } else if (warehouseId != null && zoneId == null && locatorId == null) {
            reserved = BigDecimal.valueOf(getTotalReservedForWarehouse(warehouseId, productId));
        } else if (warehouseId != null) {
            reserved = deliveryNoteRepo.sumReservedQtyInDispatchedNotes(productId, warehouseId);
        }

        return onHand.subtract(reserved);
    }

    public BigDecimal getAvailableStock(Long warehouseId, Long productId) {
        BigDecimal onHand = stockRepo.getAvailableStock(warehouseId, productId);
        return onHand.subtract(BigDecimal.valueOf(getTotalReservedForWarehouse(warehouseId, productId)));
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

        int expiring = 0;
        int fastMoving = 0;
        int deadStock = 0;

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
