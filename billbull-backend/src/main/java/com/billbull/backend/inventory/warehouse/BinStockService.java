package com.billbull.backend.inventory.warehouse;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.inventory.batch.BatchMasterRepository;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.purchase.stockmovement.StockMovement;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;

@Service
@Transactional
public class BinStockService {

    private final StockMovementRepository stockMovementRepository;
    private final BinRepository binRepository;
    private final ProductRepository productRepository;
    private final WarehouseStockService warehouseStockService;
    private final com.billbull.backend.sales.delivery.DeliveryNoteRepository deliveryNoteRepo;
    private final BatchMasterRepository batchMasterRepository;

    public BinStockService(StockMovementRepository stockMovementRepository,
            BinRepository binRepository,
            ProductRepository productRepository,
            com.billbull.backend.sales.quotation.QuotationRepository quotationRepo,
            com.billbull.backend.sales.salesorder.SalesOrderRepository salesOrderRepo,
            com.billbull.backend.sales.delivery.DeliveryNoteRepository deliveryNoteRepo,
            WarehouseStockService warehouseStockService,
            BatchMasterRepository batchMasterRepository) {
        this.stockMovementRepository = stockMovementRepository;
        this.binRepository = binRepository;
        this.productRepository = productRepository;
        this.deliveryNoteRepo = deliveryNoteRepo;
        this.warehouseStockService = warehouseStockService;
        this.batchMasterRepository = batchMasterRepository;
    }

    private int safeInt(BigDecimal value) {
        return value != null ? value.intValue() : 0;
    }

    private int allocateReservedToSelectedBin(Long selectedBinId, List<Object[]> warehouseBinRows, int totalReserved) {
        if (selectedBinId == null || warehouseBinRows == null || warehouseBinRows.isEmpty() || totalReserved <= 0) {
            return 0;
        }

        class BinAllocation {
            Long binId;
            int onHand;
            int allocated;
        }

        List<BinAllocation> bins = new ArrayList<>();
        for (Object[] row : warehouseBinRows) {
            int onHand = ((Number) row[2]).intValue();
            if (onHand <= 0) {
                continue;
            }

            BinAllocation allocation = new BinAllocation();
            allocation.binId = (Long) row[1];
            allocation.onHand = onHand;
            bins.add(allocation);
        }

        if (bins.isEmpty()) {
            return 0;
        }

        BinAllocation singleBinFit = bins.stream()
                .filter(bin -> bin.onHand >= totalReserved)
                .sorted((left, right) -> {
                    int onHandCompare = Integer.compare(left.onHand, right.onHand);
                    if (onHandCompare != 0) {
                        return onHandCompare;
                    }

                    long leftKey = left.binId != null ? left.binId : Long.MAX_VALUE;
                    long rightKey = right.binId != null ? right.binId : Long.MAX_VALUE;
                    return Long.compare(leftKey, rightKey);
                })
                .findFirst()
                .orElse(null);

        if (singleBinFit != null) {
            singleBinFit.allocated = totalReserved;
        } else {
            bins.sort((left, right) -> {
                int onHandCompare = Integer.compare(right.onHand, left.onHand);
                if (onHandCompare != 0) {
                    return onHandCompare;
                }

                long leftKey = left.binId != null ? left.binId : Long.MAX_VALUE;
                long rightKey = right.binId != null ? right.binId : Long.MAX_VALUE;
                return Long.compare(leftKey, rightKey);
            });

            int remaining = totalReserved;
            for (BinAllocation bin : bins) {
                if (remaining <= 0) {
                    break;
                }
                bin.allocated = Math.min(bin.onHand, remaining);
                remaining -= bin.allocated;
            }
        }

        return bins.stream()
                .filter(bin -> selectedBinId.equals(bin.binId))
                .mapToInt(bin -> bin.allocated)
                .findFirst()
                .orElse(0);
    }

    public List<BinStockResponse> getStockByBin(Long binId) {
        Bin bin = binRepository.findByIdEager(binId)
                .orElseThrow(() -> new RuntimeException("Bin not found: " + binId));
        Long warehouseId = bin.getLocator().getZone().getWarehouse().getId();

        List<Object[]> stockRows = stockMovementRepository.findStockIdentitiesByBin(binId);
        List<Long> productIds = stockRows.stream()
                .map(row -> ((Number) row[0]).longValue())
                .distinct()
                .toList();
        if (productIds.isEmpty()) {
            return new ArrayList<>();
        }

        List<Product> products = productRepository.findAllById(productIds);
        Map<Long, Product> productDetails = products.stream().collect(Collectors.toMap(Product::getId, product -> product));

        // For batch-controlled products: use the BatchMaster.status=RESERVED set for this bin
        // (exact per-unit match). For non-batch products: fall back to the heuristic
        // total-count allocation across the warehouse bin breakdown.
        java.util.Set<String> reservedBatchNumbers = new java.util.HashSet<>(
                batchMasterRepository.findReservedBatchNumbersByBin(binId));

        Map<Long, List<Object[]>> warehouseBinRowsByProduct = stockMovementRepository
                .findStockByWarehouseAndBins(warehouseId)
                .stream()
                .collect(Collectors.groupingBy(row -> (Long) row[0]));

        Map<Long, Integer> remainingReservedByProduct = new HashMap<>();
        for (Long productId : productIds) {
            Product product = productDetails.get(productId);
            if (product != null && product.isBatch()) {
                // Batch products: per-unit reserved count is derived from the
                // reservedBatchNumbers set below; no heuristic total needed here.
                continue;
            }
            List<Object[]> warehouseBinRows = warehouseBinRowsByProduct.getOrDefault(productId, List.of());
            int warehouseSoReserved = warehouseStockService.getSalesOrderReservedForWarehouse(warehouseId, productId);
            int allocatedSoReserved = allocateReservedToSelectedBin(binId, warehouseBinRows, warehouseSoReserved);
            int warehouseUnassignedDnReserved = safeInt(
                    deliveryNoteRepo.sumUnassignedReservedQtyInDispatchedNotes(productId, warehouseId));
            int allocatedUnassignedDnReserved = allocateReservedToSelectedBin(
                    binId, warehouseBinRows, warehouseUnassignedDnReserved);
            int binDnReserved = safeInt(deliveryNoteRepo.sumReservedQtyInDispatchedNotesByBin(productId, binId));
            remainingReservedByProduct.put(productId,
                    allocatedSoReserved + allocatedUnassignedDnReserved + binDnReserved);
        }

        // Build a set of "productId|batchNumber" identities that have at least one
        // negative-override outbound movement in this bin — used to flag rows in the snapshot.
        java.util.Set<String> overrideIdentities = stockMovementRepository.findByBinId(binId).stream()
                .filter(StockMovement::isNegativeOverride)
                .map(m -> m.getProductId()
                        + "|" + (m.getBatchNumber() != null ? m.getBatchNumber() : "-")
                        + "|" + (m.getSerialNumber() != null ? m.getSerialNumber() : "-"))
                .collect(Collectors.toSet());

        List<BinStockResponse> resultList = new ArrayList<>();
        for (Object[] row : stockRows) {
            Long productId = ((Number) row[0]).longValue();
            String batchNumber = row[1] != null ? row[1].toString() : "-";
            String serialNumber = row[2] != null ? row[2].toString() : null;
            java.time.LocalDate expiryDate = (java.time.LocalDate) row[3];
            int binOnHand = row[4] != null ? ((Number) row[4]).intValue() : 0;

            // Include negative-stock rows (override allowed) — skip only truly zero rows
            if (binOnHand == 0) continue;

            Product product = productDetails.get(productId);
            BinStockResponse response = new BinStockResponse();
            response.setId(productId);
            response.setStockIdentityKey(productId + "|"
                    + batchNumber + "|"
                    + (serialNumber != null ? serialNumber : "-") + "|"
                    + (expiryDate != null ? expiryDate : ""));
            response.setQuantity(binOnHand);
            response.setBatchNumber(batchNumber);
            response.setSerialNumber(serialNumber);
            response.setExpiryDate(expiryDate);
            response.setNegativeOverride(overrideIdentities.contains(
                    productId + "|" + batchNumber + "|" + (serialNumber != null ? serialNumber : "-")));
            if (product != null) {
                response.setProductCode(product.getCode());
                response.setProductName(product.getName());
            }

            int rowReserved;
            if (product != null && product.isBatch()) {
                // Each per-unit batch row maps to exactly one BatchMaster record.
                // BatchMaster.status=RESERVED is authoritative — no greedy heuristic needed.
                rowReserved = reservedBatchNumbers.contains(batchNumber) ? 1 : 0;
            } else {
                int remainingReserved = remainingReservedByProduct.getOrDefault(productId, 0);
                rowReserved = Math.min(binOnHand, Math.max(remainingReserved, 0));
                remainingReservedByProduct.put(productId, remainingReserved - rowReserved);
            }
            response.setReservedQuantity(rowReserved);
            resultList.add(response);
        }

        return resultList;
    }

    public List<StockMovement> getMovementsByBin(Long binId) {
        return stockMovementRepository.findByBinId(binId);
    }

    public int getTotalQuantityByBin(Long binId) {
        List<Object[]> rows = stockMovementRepository.findStockByBin(binId);
        return rows.stream()
                .mapToInt(row -> {
                    int net = ((Number) row[1]).intValue();
                    return net > 0 ? net : 0;
                })
                .sum();
    }

    public int getSkuCountByBin(Long binId) {
        List<Object[]> rows = stockMovementRepository.findStockByBin(binId);
        return (int) rows.stream()
                .filter(row -> ((Number) row[1]).intValue() > 0)
                .count();
    }

    public void validateBinCapacity(Long binId, int incomingQty) {
        Bin bin = binRepository.findById(binId).orElse(null);
        if (bin == null || bin.getCapacity() == null) {
            return;
        }

        int current = getTotalQuantityByBin(binId);
        int afterPosting = current + incomingQty;

        if (afterPosting > bin.getCapacity()) {
            throw new IllegalStateException(
                    "Bin capacity exceeded for bin " + bin.getCode() + ". " +
                            "Max: " + bin.getCapacity() + ", Current: " + current +
                            ", Attempted to add: " + incomingQty +
                            " (would reach " + afterPosting + ")");
        }
    }
}
