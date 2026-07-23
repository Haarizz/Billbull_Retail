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
import com.billbull.backend.inventory.batch.BatchAllocationRepository;
import com.billbull.backend.inventory.reservation.PosStockReservationRepository;
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
    private final com.billbull.backend.sales.proforma.ProformaRepository proformaRepo;
    private final com.billbull.backend.sales.delivery.DeliveryNoteRepository deliveryNoteRepo;
    private final BatchAllocationRepository batchAllocationRepository;
    private final PosStockReservationRepository posStockReservationRepository;

    public WarehouseStockService(
            StockMovementRepository stockRepo,
            ProductRepository productRepo,
            WarehouseRepository warehouseRepo,
            ZoneRepository zoneRepo,
            LocatorRepository locatorRepo,
            BinRepository binRepo,
            com.billbull.backend.sales.quotation.QuotationRepository quotationRepo,
            com.billbull.backend.sales.salesorder.SalesOrderRepository salesOrderRepo,
            com.billbull.backend.sales.proforma.ProformaRepository proformaRepo,
            com.billbull.backend.sales.delivery.DeliveryNoteRepository deliveryNoteRepo,
            BatchAllocationRepository batchAllocationRepository,
            PosStockReservationRepository posStockReservationRepository) {
        this.stockRepo = stockRepo;
        this.productRepo = productRepo;
        this.warehouseRepo = warehouseRepo;
        this.zoneRepo = zoneRepo;
        this.locatorRepo = locatorRepo;
        this.binRepo = binRepo;
        this.salesOrderRepo = salesOrderRepo;
        this.proformaRepo = proformaRepo;
        this.deliveryNoteRepo = deliveryNoteRepo;
        this.batchAllocationRepository = batchAllocationRepository;
        this.posStockReservationRepository = posStockReservationRepository;
    }

    private int safeInt(BigDecimal value) {
        return value != null ? value.intValue() : 0;
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

        List<String> productCodes = products.stream()
                .filter(product -> !product.isBatch())
                .map(Product::getCode)
                .toList();
        if (productCodes.isEmpty()) {
            return allocations;
        }
        for (Object[] row : salesOrderRepo.sumReservedQuantityForProductsByWarehouse(productCodes)) {
            Long productId = (Long) row[0];
            Long warehouseId = (Long) row[1];
            int reservedQty = ((Number) row[2]).intValue();

            if (warehouseId == null || reservedQty <= 0) {
                continue;
            }

            allocations
                    .computeIfAbsent(productId, ignored -> new HashMap<>())
                    .merge(warehouseId, reservedQty, Integer::sum);
        }

        for (Object[] row : proformaRepo.sumReservedQuantityForProductsByWarehouse(productCodes)) {
            Long productId = (Long) row[0];
            Long warehouseId = (Long) row[1];
            int reservedQty = ((Number) row[2]).intValue();

            if (warehouseId == null || reservedQty <= 0) {
                continue;
            }

            allocations
                    .computeIfAbsent(productId, ignored -> new HashMap<>())
                    .merge(warehouseId, reservedQty, Integer::sum);
        }

        return allocations;
    }

    public int getSalesOrderReservedForWarehouse(Long warehouseId, Long productId) {
        Product product = productRepo.findById(productId).orElse(null);
        if (product == null) {
            return 0;
        }
        if (product.isBatch()) {
            return safeInt(batchAllocationRepository.sumReservedByProductAndWarehouse(productId, warehouseId));
        }

        return getSalesOrderReservationAllocations(List.of(product))
                .getOrDefault(productId, Collections.emptyMap())
                .getOrDefault(warehouseId, 0);
    }

    public int getTotalReservedForWarehouse(Long warehouseId, Long productId) {
        Product product = productRepo.findById(productId).orElse(null);
        if (product != null && product.isBatch()) {
            return safeInt(batchAllocationRepository.sumReservedByProductAndWarehouse(productId, warehouseId));
        }
        int salesOrderReserved = getSalesOrderReservedForWarehouse(warehouseId, productId);
        int deliveryNoteReserved = safeInt(deliveryNoteRepo.sumReservedQtyInDispatchedNotes(productId, warehouseId));
        int layawayReserved = safeInt(
                posStockReservationRepository.sumReservedByProductAndWarehouse(productId, warehouseId));
        return salesOrderReserved + deliveryNoteReserved + layawayReserved;
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

            int reserved = product != null && product.isBatch()
                    ? safeInt(batchAllocationRepository.sumReservedByProductAndWarehouse(productId, warehouseId))
                    : salesOrderAllocations
                            .getOrDefault(productId, Collections.emptyMap())
                            .getOrDefault(warehouseId, 0)
                            + safeInt(deliveryNoteRepo.sumReservedQtyInDispatchedNotes(productId, warehouseId))
                            + safeInt(posStockReservationRepository.sumReservedByProductAndWarehouse(productId, warehouseId));

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

            int totalReserved = product.isBatch()
                    ? safeInt(batchAllocationRepository.sumReservedByProductAndWarehouse(product.getId(), warehouseId))
                    : salesOrderAllocation.getOrDefault(warehouseId, 0)
                            + safeInt(deliveryNoteRepo.sumReservedQtyInDispatchedNotes(product.getId(), warehouseId))
                            + safeInt(posStockReservationRepository.sumReservedByProductAndWarehouse(product.getId(), warehouseId));

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
        Product product = productRepo.findById(productId).orElse(null);
        if (product != null && product.isBatch()) {
            reserved = binId != null
                    ? batchAllocationRepository.sumReservedByProductAndBin(productId, binId)
                    : batchAllocationRepository.sumReservedByProductAndWarehouse(productId, warehouseId);
        } else if (binId != null) {
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

    /**
     * Returns all batches with positive on-hand qty for the given product in a
     * warehouse, optionally scoped to a specific bin. Results are ordered by
     * expiry date (FEFO) then batch number so callers get the natural pick order.
     */
    public List<WarehouseController.BatchStockRow> getAvailableBatchesForProduct(
            Long warehouseId, Long productId, Long binId) {
        List<Object[]> rows = stockRepo.findStockIdentitiesByProductAndBin(warehouseId, productId, binId);
        List<WarehouseController.BatchStockRow> result = new ArrayList<>();
        for (Object[] row : rows) {
            String batchNumber = row[0] != null ? row[0].toString() : null;
            String expiryDate  = row[1] != null ? row[1].toString() : null;
            int qty = row[2] != null ? ((Number) row[2]).intValue() : 0;
            if (qty > 0) {
                result.add(new WarehouseController.BatchStockRow(batchNumber, expiryDate, qty));
            }
        }
        return result;
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
