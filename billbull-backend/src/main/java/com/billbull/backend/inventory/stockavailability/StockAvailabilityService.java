package com.billbull.backend.inventory.stockavailability;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.Bin;
import com.billbull.backend.inventory.warehouse.BinRepository;
import com.billbull.backend.inventory.warehouse.BinStockResponse;
import com.billbull.backend.inventory.warehouse.BinStockService;
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
    private final BinStockService binStockService;
    private final BinRepository binRepository;
    private final LpoItemRepository lpoItemRepository;
    private final GrnRepository grnRepository;

    public StockAvailabilityService(
            ProductRepository productRepository,
            WarehouseStockService warehouseStockService,
            BinStockService binStockService,
            BinRepository binRepository,
            LpoItemRepository lpoItemRepository,
            GrnRepository grnRepository) {
        this.productRepository = productRepository;
        this.warehouseStockService = warehouseStockService;
        this.binStockService = binStockService;
        this.binRepository = binRepository;
        this.lpoItemRepository = lpoItemRepository;
        this.grnRepository = grnRepository;
    }

    @Cacheable(value = "stockAvailability", key = "#itemCode")
    public StockAvailabilityResponse getStockAvailability(String itemCode) {
        return getStockAvailability(itemCode, null, null, null, null);
    }

    @Cacheable(value = "stockAvailability")
    public StockAvailabilityResponse getStockAvailability(String itemCode, Long warehouseId, Long zoneId, Long locatorId,
            Long binId) {
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
            locationStockDTOS = buildLocationStock(itemCode, product, finalUom, warehouseId, zoneId, locatorId, binId);
        } catch (Exception e) {
            // Log error, but don't fail the whole request
        }

        // 2. Fetch Incoming LPOs
        List<IncomingLpoDTO> incomingLpoDTOS = Collections.emptyList();
        try {
            List<LpoStatus> activeStatuses = Arrays.asList(
                    LpoStatus.DRAFT,
                    LpoStatus.PENDING_APPROVAL,
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

    private List<LocationStockDTO> buildLocationStock(String itemCode, Product product, String uom, Long warehouseId,
            Long zoneId, Long locatorId, Long binId) {
        if (binId != null) {
            return buildBinStock(product, uom, warehouseId, zoneId, locatorId, binId);
        }

        List<WarehouseStockResponse> warehouseStocks = warehouseStockService.getStockByProduct(itemCode);
        return warehouseStocks.stream()
                .filter(stock -> warehouseId == null || warehouseId.equals(stock.getWarehouseId()))
                .map(stock -> toWarehouseLocation(stock, uom))
                .collect(Collectors.toList());
    }

    private List<LocationStockDTO> buildBinStock(Product product, String uom, Long warehouseId, Long zoneId, Long locatorId,
            Long binId) {
        Bin bin = binRepository.findByIdEager(binId).orElse(null);
        BinStockResponse binStock = binStockService.getStockByBin(binId).stream()
                .filter(stock -> product.getId().equals(stock.getId()))
                .findFirst()
                .orElse(null);

        int onHand = binStock != null && binStock.getQuantity() != null ? binStock.getQuantity() : 0;
        int reserved = binStock != null && binStock.getReservedQuantity() != null ? binStock.getReservedQuantity() : 0;
        String locationName = buildScopedLocationName(bin, warehouseId, zoneId, locatorId);

        LocationStockDTO dto = new LocationStockDTO();
        dto.setLocationId(binId);
        dto.setName(locationName);
        dto.setType(LocationType.BIN);
        dto.setOnHand(onHand);
        dto.setReserved(reserved);
        dto.setAvailable(onHand - reserved);
        dto.setUom(uom);
        dto.setLastUpdated(LocalDateTime.now());
        return List.of(dto);
    }

    private LocationStockDTO toWarehouseLocation(WarehouseStockResponse stock, String uom) {
        LocationStockDTO dto = new LocationStockDTO();
        dto.setLocationId(stock.getWarehouseId());
        dto.setName(stock.getWarehouseName());
        dto.setType(LocationType.WAREHOUSE);
        dto.setOnHand(stock.getQuantity());
        dto.setReserved(stock.getReserved());
        dto.setAvailable(stock.getAvailable());
        dto.setUom(uom);
        dto.setLastUpdated(LocalDateTime.now());
        return dto;
    }

    private String buildScopedLocationName(Bin bin, Long warehouseId, Long zoneId, Long locatorId) {
        if (bin != null) {
            return bin.getCode() != null && !bin.getCode().isBlank() ? bin.getCode() : bin.getName();
        }
        if (locatorId != null) {
            return "Selected Locator";
        }
        if (zoneId != null) {
            return "Selected Zone";
        }
        if (warehouseId != null) {
            return "Selected Warehouse";
        }
        return "Selected Bin";
    }

    @CacheEvict(value = "stockAvailability", allEntries = true)
    public void clearCache() {
        // Method for manual cache eviction or trigger from other services
    }
}
