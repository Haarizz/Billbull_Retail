package com.billbull.backend.inventory.stockavailability;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.WarehouseStockResponse;
import com.billbull.backend.inventory.warehouse.WarehouseStockService;
import com.billbull.backend.purchase.lpo.LpoItem;
import com.billbull.backend.purchase.lpo.LpoItemRepository;
import com.billbull.backend.purchase.lpo.LpoStatus;
import com.billbull.backend.purchase.grn.GrnRepository;
import com.billbull.backend.purchase.grn.GrnSourceType;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class StockAvailabilityService {

    private final ProductRepository productRepository;
    private final WarehouseStockService warehouseStockService;
    private final LpoItemRepository lpoItemRepository;
    private final GrnRepository grnRepository;

    public StockAvailabilityService(
            ProductRepository productRepository,
            WarehouseStockService warehouseStockService,
            LpoItemRepository lpoItemRepository,
            GrnRepository grnRepository) {
        this.productRepository = productRepository;
        this.warehouseStockService = warehouseStockService;
        this.lpoItemRepository = lpoItemRepository;
        this.grnRepository = grnRepository;
    }

    @Cacheable(value = "stockAvailability", key = "#itemCode")
    public StockAvailabilityResponse getStockAvailability(String itemCode) {
        // Return empty structured response instead of throwing Exception
        if (itemCode == null || itemCode.trim().isEmpty()) {
            return new StockAvailabilityResponse();
        }

        Optional<Product> productOpt = productRepository.findByCodeAndIsActiveTrue(itemCode);
        if (productOpt.isEmpty()) {
            // Product not found, return empty DTOs to avoid UI crashes
            return new StockAvailabilityResponse();
        }

        Product product = productOpt.get();
        String uom = "PCS";
        if (product.getInventory() != null && product.getInventory().getDefaultUnit() != null) {
            uom = product.getInventory().getDefaultUnit().getName();
        }
        final String finalUom = uom;

        // 1. Fetch Location Stock data
        List<LocationStockDTO> locationStockDTOS = Collections.emptyList();
        try {
            List<WarehouseStockResponse> warehouseStocks = warehouseStockService.getStockByProduct(itemCode);
            locationStockDTOS = warehouseStocks.stream().map(ws -> {
                LocationStockDTO dto = new LocationStockDTO();
                dto.setLocationId(ws.getWarehouseId());
                dto.setName(ws.getWarehouseName());
                // Currently returning warehouse level logic from WarehouseStockService
                dto.setType(LocationType.WAREHOUSE);
                dto.setOnHand(ws.getQuantity());
                dto.setReserved(ws.getReserved());
                dto.setAvailable(ws.getAvailable());
                dto.setUom(finalUom);
                dto.setLastUpdated(LocalDateTime.now());
                return dto;
            }).collect(Collectors.toList());
        } catch (Exception e) {
            // Log error, but don't fail the whole request
        }

        // 2. Fetch Incoming LPOs
        List<IncomingLpoDTO> incomingLpoDTOS = Collections.emptyList();
        try {
            List<LpoStatus> activeStatuses = Arrays.asList(
                    LpoStatus.APPROVED,
                    LpoStatus.SENT_TO_VENDOR,
                    LpoStatus.PARTIALLY_RECEIVED);

            List<LpoItem> lpoItems = lpoItemRepository.findIncomingByProductIdAndStatusIn(product.getId(),
                    activeStatuses);
            incomingLpoDTOS = lpoItems.stream().map(item -> {
                // Find all POSTED GRNs for this LPO
                var grns = grnRepository.findByReferenceIdAndSourceTypeIn(
                        item.getLpo().getId(),
                        List.of(GrnSourceType.SYSTEM_AUTO));

                // Sum up accepted quantities for this specific product across all GRNs for this
                // LPO
                int totalReceived = grns.stream()
                        .filter(g -> g.isStockPosted()) // Only count posted stock
                        .flatMap(g -> g.getItems().stream())
                        .filter(gi -> gi.getProduct().getId().equals(product.getId()))
                        .mapToInt(gi -> (gi.getAcceptedQty() != null ? gi.getAcceptedQty() : 0) +
                                (gi.getFocQty() != null ? gi.getFocQty() : 0))
                        .sum();

                int totalOrdered = item.getQuantity() != null ? item.getQuantity() : 0;
                int remaining = Math.max(0, totalOrdered - totalReceived);

                if (remaining <= 0)
                    return null;

                IncomingLpoDTO dto = new IncomingLpoDTO();
                dto.setLpoNumber(item.getLpo().getLpoNumber());
                dto.setExpectedDate(item.getLpo().getExpectedDeliveryDate());
                dto.setQuantity(remaining);
                dto.setSupplierName(item.getLpo().getVendorName());
                return dto;
            })
                    .filter(java.util.Objects::nonNull)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            // Log error, but don't fail the whole request
        }

        return new StockAvailabilityResponse(locationStockDTOS, incomingLpoDTOS);
    }

    @CacheEvict(value = "stockAvailability", allEntries = true)
    public void clearCache() {
        // Method for manual cache eviction or trigger from other services
    }
}
