package com.billbull.backend.inventory.warehouse;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.purchase.stockmovement.StockMovement;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@Transactional
public class BinStockService {

    private final StockMovementRepository stockMovementRepository;
    private final BinRepository binRepository;
    private final ProductRepository productRepository;
    private final com.billbull.backend.sales.quotation.QuotationRepository quotationRepo;
    private final com.billbull.backend.sales.salesorder.SalesOrderRepository salesOrderRepo;
    private final com.billbull.backend.sales.delivery.DeliveryNoteRepository deliveryNoteRepo;

    public BinStockService(StockMovementRepository stockMovementRepository,
            BinRepository binRepository,
            ProductRepository productRepository,
            com.billbull.backend.sales.quotation.QuotationRepository quotationRepo,
            com.billbull.backend.sales.salesorder.SalesOrderRepository salesOrderRepo,
            com.billbull.backend.sales.delivery.DeliveryNoteRepository deliveryNoteRepo) {
        this.stockMovementRepository = stockMovementRepository;
        this.binRepository = binRepository;
        this.productRepository = productRepository;
        this.quotationRepo = quotationRepo;
        this.salesOrderRepo = salesOrderRepo;
        this.deliveryNoteRepo = deliveryNoteRepo;
    }

    private Map<Long, Integer> getGlobalOnHandMap(List<Long> productIds) {
        if (productIds == null || productIds.isEmpty())
            return new HashMap<>();
        List<Object[]> rows = stockMovementRepository.getTotalAvailableStockForProducts(productIds);
        Map<Long, Integer> map = new HashMap<>();
        for (Object[] row : rows) {
            map.put((Long) row[0], ((Number) row[1]).intValue());
        }
        return map;
    }

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

    /**
     * Get all stock in a specific bin - derived from stock_movements table
     * Groups by product and aggregates quantities
     */
    public List<BinStockResponse> getStockByBin(Long binId) {
        Bin bin = binRepository.findByIdEager(binId)
                .orElseThrow(() -> new RuntimeException("Bin not found: " + binId));
        Long warehouseId = bin.getLocator().getZone().getWarehouse().getId();

        // Get all stock movements for this bin
        List<StockMovement> movements = stockMovementRepository.findByBinId(binId);

        // Group by productId and aggregate
        java.util.Map<Long, BinStockResponse> stockMap = new java.util.LinkedHashMap<>();

        for (StockMovement sm : movements) {
            Long productId = sm.getProductId();

            if (stockMap.containsKey(productId)) {
                // Add to existing quantity
                BinStockResponse existing = stockMap.get(productId);
                existing.setQuantity(existing.getQuantity() + sm.getQuantity());
            } else {
                // Create new entry
                BinStockResponse response = new BinStockResponse();
                response.setId(productId);
                response.setQuantity(sm.getQuantity());
                response.setBatchNumber(sm.getBatchNumber() != null ? sm.getBatchNumber() : "-");
                response.setExpiryDate(sm.getExpiryDate());

                stockMap.put(productId, response);
            }
        }

        // Cache global counts for encountered products
        List<Long> productIds = new ArrayList<>(stockMap.keySet());
        if (productIds.isEmpty())
            return new ArrayList<>();

        List<Product> products = productRepository.findAllById(productIds);
        Map<Long, Product> productDetails = products.stream().collect(Collectors.toMap(Product::getId, p -> p));
        Map<Long, Integer> globalOnHandMap = getGlobalOnHandMap(productIds);
        Map<Long, Integer> globalReservedMap = getGlobalReservedMap(products);

        List<BinStockResponse> resultList = new ArrayList<>();

        for (BinStockResponse res : stockMap.values()) {
            Long productId = res.getId();
            Product product = productDetails.get(productId);

            if (product != null) {
                res.setProductCode(product.getCode());
                res.setProductName(product.getName());
            }

            int binOnHand = res.getQuantity() != null ? res.getQuantity() : 0;

            // Skip zero-stock bins for fake reservations limitation
            int globalOnHand = globalOnHandMap.getOrDefault(productId, 0);
            int globalReserved = globalReservedMap.getOrDefault(productId, 0);

            int binReserved = 0;
            // Nearest-integer rounding for proportional bin reservation display.
            // Math.floor causes the sum across bins to fall short of globalReserved
            // when fractional parts accumulate (e.g. 10/15 + 5/15 of 5 → 3+1=4, not 5).
            // Math.round gives a closer per-bin estimate so each bin's display is accurate.
            if (binOnHand > 0 && globalOnHand > 0) {
                double frac = ((double) binOnHand / globalOnHand) * globalReserved;
                binReserved = (int) Math.round(frac);
            }

            int warehouseOnHand = stockMovementRepository.getAvailableStock(warehouseId, productId).intValue();
            int warehouseDnReserved = deliveryNoteRepo
                    .sumUnassignedReservedQtyInDispatchedNotes(productId, warehouseId)
                    .intValue();
            if (binOnHand > 0 && warehouseOnHand > 0 && warehouseDnReserved > 0) {
                double frac = ((double) binOnHand / warehouseOnHand) * warehouseDnReserved;
                binReserved += (int) Math.round(frac);
            }

            // Add direct specific reservations from Delivery Notes for this bin
            int binDnReserved = deliveryNoteRepo.sumReservedQtyInDispatchedNotesByBin(productId, binId).intValue();
            binReserved += binDnReserved;

            // Skip products with zero or negative net quantity — fully dispatched from this bin
            if (binOnHand <= 0) {
                continue;
            }

            res.setReservedQuantity(binReserved);
            resultList.add(res);
        }

        return resultList;
    }

    /**
     * Get detailed stock movements for a bin
     */
    public List<StockMovement> getMovementsByBin(Long binId) {
        return stockMovementRepository.findByBinId(binId);
    }

    public int getTotalQuantityByBin(Long binId) {
        // Use aggregated query and sum only positive net stock per product
        List<Object[]> rows = stockMovementRepository.findStockByBin(binId);
        return rows.stream()
                .mapToInt(r -> {
                    int net = ((Number) r[1]).intValue();
                    return net > 0 ? net : 0;
                })
                .sum();
    }

    public int getSkuCountByBin(Long binId) {
        // Count only products with positive net stock in this bin
        List<Object[]> rows = stockMovementRepository.findStockByBin(binId);
        return (int) rows.stream()
                .filter(r -> ((Number) r[1]).intValue() > 0)
                .count();
    }
}
