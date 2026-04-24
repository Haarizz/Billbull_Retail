package com.billbull.backend.inventory.stocktake;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.inventory.product.ProductMediaRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.Bin;
import com.billbull.backend.inventory.warehouse.BinRepository;
import com.billbull.backend.inventory.warehouse.BinStockService;
import com.billbull.backend.inventory.warehouse.WarehouseStockService;
import com.billbull.backend.purchase.stockmovement.StockMovement;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.purchase.stockmovement.StockSourceType;

@Service
@Transactional
public class StockTakeService {

    private final StockTakeSessionRepository sessionRepo;
    private final StockTakeItemRepository itemRepo;
    private final WarehouseStockService warehouseStockService;
    private final ProductRepository productRepo;
    private final StockMovementRepository stockMovementRepo;
    private final ProductMediaRepository mediaRepo;
    private final ProductBarcodeRepository barcodeRepo;
    private final BinRepository binRepo;
    private final BinStockService binStockService;

    public StockTakeService(
            StockTakeSessionRepository sessionRepo,
            StockTakeItemRepository itemRepo,
            WarehouseStockService warehouseStockService,
            ProductRepository productRepo,
            StockMovementRepository stockMovementRepo,
            ProductMediaRepository mediaRepo,
            ProductBarcodeRepository barcodeRepo,
            BinRepository binRepo,
            BinStockService binStockService) {
        this.sessionRepo = sessionRepo;
        this.itemRepo = itemRepo;
        this.warehouseStockService = warehouseStockService;
        this.productRepo = productRepo;
        this.stockMovementRepo = stockMovementRepo;
        this.mediaRepo = mediaRepo;
        this.barcodeRepo = barcodeRepo;
        this.binRepo = binRepo;
        this.binStockService = binStockService;
    }

    public StockTakeSession createSession(String warehouseName, Long warehouseId, String type, String countType,
            String createdBy, Long categoryId, Long brandId) {
        // Validation for Opening Inventory
        if ("Opening Inventory".equalsIgnoreCase(type)) {
            boolean exists = sessionRepo.existsByWarehouseIdAndType(warehouseId, StockTakeSession.StockTakeType.OPENING_INVENTORY);
            if (exists) {
                throw new IllegalStateException("Opening Inventory already performed for this warehouse.");
            }
        }

        StockTakeSession session = new StockTakeSession();
        session.setSessionId("STK-" + (int)(Math.random() * 90000 + 10000));
        session.setWarehouseId(warehouseId);
        session.setWarehouseName(warehouseName);
        session.setType("Opening Inventory".equalsIgnoreCase(type) ?
                StockTakeSession.StockTakeType.OPENING_INVENTORY : StockTakeSession.StockTakeType.INVENTORY_COUNTING);
        session.setCountType(countType);
        session.setCategoryId(categoryId);
        session.setBrandId(brandId);
        session.setStatus(StockTakeSession.StockTakeStatus.IN_PROGRESS);
        session.setCreatedBy(createdBy);

        // Products are NOT preloaded — session starts empty.
        // Items are added on-demand via product search, barcode scan, or product selector.
        return sessionRepo.save(session);
    }

    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public org.springframework.data.domain.Page<Product> getProductsForStockTake(
            String stockTakeType, Long warehouseId, String countType,
            Long categoryId, Long brandId, String search, int page, int size) {

        // COUNTING requires warehouse restriction; OPENING is global
        Long effectiveWarehouseId = "COUNTING".equalsIgnoreCase(stockTakeType) ? warehouseId : null;

        // Validate: if count type demands a filter but none provided → return empty
        boolean needsCategory = "Selected Categories".equalsIgnoreCase(countType);
        boolean needsBrand    = "Selected Brands".equalsIgnoreCase(countType);
        if (needsCategory && categoryId == null) return org.springframework.data.domain.Page.empty();
        if (needsBrand    && brandId    == null) return org.springframework.data.domain.Page.empty();

        // Only apply category/brand filters when the count type explicitly requires them
        Long effectiveCategoryId = needsCategory ? categoryId : null;
        Long effectiveBrandId    = needsBrand    ? brandId    : null;

        org.springframework.data.domain.Pageable pageable =
                org.springframework.data.domain.PageRequest.of(page, size);

        return productRepo.findForStockTake(
                effectiveWarehouseId, effectiveCategoryId, effectiveBrandId,
                search != null ? search : "", pageable);
    }

    public List<StockTakeSession> getAllSessions() {
        return sessionRepo.findAllByIsActiveTrueOrderByCreatedAtDesc();
    }

    public StockTakeSession getSession(String sessionId) {
        StockTakeSession session = null;
        try {
            long id = Long.parseLong(sessionId);
            session = sessionRepo.findById(id).orElse(null);
        } catch (NumberFormatException e) {
            // Ignore, proceed to find by sessionId string
        }

        if (session == null) {
            session = sessionRepo.findBySessionId(sessionId)
                    .orElseThrow(() -> new RuntimeException("Session not found: " + sessionId));
        }

        if (!session.isActive()) {
            throw new RuntimeException("Session not found: " + sessionId);
        }

        if (session.getStatus() == StockTakeSession.StockTakeStatus.IN_PROGRESS && session.getItems() != null) {
            boolean updated = false;
            for (StockTakeItem item : session.getItems()) {
                // Use raw on-hand scoped to the item's specific bin (or unlocated stock when no bin).
                // This ensures variance is calculated against the correct bin quantity, not the warehouse total.
                BigDecimal onHand;
                if (item.getBinId() != null) {
                    onHand = stockMovementRepo.getStockByBin(session.getWarehouseId(), item.getProductId(), item.getBinId());
                } else {
                    onHand = stockMovementRepo.getUnlocatedStock(session.getWarehouseId(), item.getProductId());
                }
                int currentQty = onHand != null ? onHand.intValue() : 0;
                if (item.getSystemQty() == null || item.getSystemQty() != currentQty) {
                    item.setSystemQty(currentQty);
                    if (item.getCountedQty() != null) {
                        item.setVariance(item.getCountedQty() - currentQty);
                    } else {
                        item.setVariance(0 - currentQty);
                    }
                    item.setVarianceValue(item.getPrice() != null ? 
                            item.getPrice().multiply(BigDecimal.valueOf(item.getVariance())) : BigDecimal.ZERO);
                    
                    if (item.getVariance() == 0 && item.getCountedQty() != null) {
                        item.setStatus(StockTakeItem.ItemStatus.MATCHED);
                    } else if (item.getCountedQty() != null) {
                        item.setStatus(StockTakeItem.ItemStatus.VARIANCE);
                    } else {
                        item.setStatus(StockTakeItem.ItemStatus.PENDING);
                    }
                    itemRepo.save(item);
                    updated = true;
                }
            }
        }

        return session;
    }

    public StockTakeItem updateItemCount(Long itemId, Integer countedQty) {
        StockTakeItem item = itemRepo.findById(itemId)
                .orElseThrow(() -> new RuntimeException("Item not found"));
        
        if (item.getSession().getStatus() != StockTakeSession.StockTakeStatus.IN_PROGRESS) {
            throw new IllegalStateException("Session is not in progress");
        }

        // Refresh system qty scoped to the item's bin (or unlocated stock) to avoid comparing
        // a bin-level count against the warehouse-wide total.
        BigDecimal available;
        if (item.getBinId() != null) {
            available = stockMovementRepo.getStockByBin(item.getSession().getWarehouseId(), item.getProductId(), item.getBinId());
        } else {
            available = stockMovementRepo.getUnlocatedStock(item.getSession().getWarehouseId(), item.getProductId());
        }
        int currentQty = available != null ? available.intValue() : 0;
        item.setSystemQty(currentQty);

        item.setCountedQty(countedQty);
        if (countedQty != null) {
            item.setVariance(countedQty - currentQty);
        } else {
            item.setVariance(0 - currentQty);
        }
        item.setVarianceValue(item.getPrice() != null ? 
                item.getPrice().multiply(BigDecimal.valueOf(item.getVariance())) : BigDecimal.ZERO);
        
        if (item.getVariance() == 0 && countedQty != null) {
            item.setStatus(StockTakeItem.ItemStatus.MATCHED);
        } else if (countedQty != null) {
            item.setStatus(StockTakeItem.ItemStatus.VARIANCE);
        } else {
            item.setStatus(StockTakeItem.ItemStatus.PENDING);
        }

        return itemRepo.save(item);
    }

    public StockTakeItem updateItemBin(Long itemId, Long binId) {
        StockTakeItem item = itemRepo.findById(itemId)
                .orElseThrow(() -> new RuntimeException("Item not found"));

        if (item.getSession().getStatus() != StockTakeSession.StockTakeStatus.IN_PROGRESS) {
            throw new IllegalStateException("Session is not in progress");
        }

        if (binId == null) {
            item.setBinId(null);
            item.setBinCode(null);
            item.setZoneId(null);
            item.setLocatorId(null);
        } else {
            // Use eager fetch to load locator + zone in one query — avoids LazyInitializationException
            Bin bin = binRepo.findByIdEager(binId)
                    .orElseThrow(() -> new RuntimeException("Bin not found: " + binId));
            item.setBinId(bin.getId());
            item.setBinCode(bin.getCode());
            item.setLocatorId(bin.getLocator().getId());
            item.setZoneId(bin.getLocator().getZone().getId());
        }

        return itemRepo.save(item);
    }

    public StockTakeSession submitForApproval(String sessionId) {
        StockTakeSession session = getSession(sessionId);

        boolean anyItemMissingBin = session.getItems().stream()
                .anyMatch(item -> item.getBinId() == null);
        if (anyItemMissingBin) {
            throw new IllegalStateException("All items must have a bin assigned before submitting for approval");
        }

        session.setStatus(StockTakeSession.StockTakeStatus.PENDING_APPROVAL);
        return sessionRepo.save(session);
    }

    @Caching(evict = {
        @CacheEvict(value = "stockAvailability", allEntries = true),
        @CacheEvict(value = "productList", allEntries = true)
    })
    public StockTakeSession approveSession(String sessionId, String approvedBy) {
        StockTakeSession session = getSession(sessionId);
        if (session.getStatus() != StockTakeSession.StockTakeStatus.PENDING_APPROVAL) {
            throw new IllegalStateException("Session is not pending approval");
        }

        // PERFORM ATOMIC RECONCILIATION
        for (StockTakeItem item : session.getItems()) {
            if (item.getCountedQty() == null) continue; // Skip items not counted

            int variance = item.getVariance();
            if (variance != 0) {
                // Idempotency guard: use item.getId() as sourceId so that each bin-level item
                // gets its own movement key. Using session.getId() would collide when the same
                // product appears in multiple bins (two items with the same productId & sessionId).
                boolean alreadyPosted = stockMovementRepo.existsBySourceTypeAndSourceIdAndProductId(
                        StockSourceType.STOCK_TAKE, item.getId(), item.getProductId());
                if (alreadyPosted) continue;

                // Resolve bin: prefer explicit assignment on item, else auto-detect from existing stock
                Long resolvedBinId = item.getBinId();
                Long resolvedZoneId = item.getZoneId();
                Long resolvedLocatorId = item.getLocatorId();
                String resolvedBinCode = item.getBinCode();

                if (resolvedBinId == null) {
                    // No bin assigned on the item. Find which bin(s) currently hold this product.
                    // If it lives in exactly one bin → auto-assign that bin so bin-level stock is correct.
                    // If spread across multiple bins → leave null (can't auto-decide; user should assign manually).
                    List<Object[]> activeBins = stockMovementRepo.findActiveBinsByWarehouseAndProduct(
                            session.getWarehouseId(), item.getProductId());
                    if (activeBins.size() == 1) {
                        Long autoBinId = ((Number) activeBins.get(0)[0]).longValue();
                        Bin autoBin = binRepo.findByIdEager(autoBinId).orElse(null);
                        if (autoBin != null) {
                            resolvedBinId    = autoBin.getId();
                            resolvedBinCode  = autoBin.getCode();
                            resolvedLocatorId = autoBin.getLocator().getId();
                            resolvedZoneId   = autoBin.getLocator().getZone().getId();
                            // Persist the resolved bin back onto the item so the UI and audit trail are accurate
                            item.setBinId(resolvedBinId);
                            item.setBinCode(resolvedBinCode);
                            item.setLocatorId(resolvedLocatorId);
                            item.setZoneId(resolvedZoneId);
                            itemRepo.save(item);
                        }
                    }
                }

                // Hard capacity check: only block when adding stock into the bin (variance > 0)
                if (variance > 0 && resolvedBinId != null) {
                    binStockService.validateBinCapacity(resolvedBinId, variance);
                }

                StockMovement sm = new StockMovement();
                sm.setSourceType(StockSourceType.STOCK_TAKE);
                sm.setSourceId(item.getId()); // Per-item key so multiple bins of the same product don't collide
                sm.setProductId(item.getProductId());
                sm.setWarehouseId(session.getWarehouseId());
                sm.setQuantity(variance); // Positive for excess, Negative for shortage
                sm.setReferenceNo(session.getSessionId());
                sm.setMovementDate(LocalDate.now());
                sm.setBinId(resolvedBinId);
                sm.setZoneId(resolvedZoneId);
                sm.setLocatorId(resolvedLocatorId);

                stockMovementRepo.save(sm);
            }
        }

        session.setStatus(StockTakeSession.StockTakeStatus.COMPLETED);
        session.setReconciledBy(approvedBy);
        session.setReconciledAt(LocalDateTime.now());
        
        return sessionRepo.save(session);
    }

    public StockTakeItem addItemToSession(String sessionId, Long productId, Integer initialCount) {
        StockTakeSession session = getSession(sessionId);
        if (session.getStatus() != StockTakeSession.StockTakeStatus.IN_PROGRESS) {
            throw new IllegalStateException("Session is not in progress");
        }

        Product p = productRepo.findById(productId)
                .orElseThrow(() -> new RuntimeException("Product not found"));

        StockTakeItem item = new StockTakeItem();
        item.setSession(session);
        item.setProductId(p.getId());
        item.setProductName(p.getName());
        item.setSku(p.getCode());
        item.setBrand(p.getBrand() != null ? p.getBrand().getName() : "Generic");
        item.setCategory(p.getCategory());
        item.setDescription(p.getShortDesc() != null ? p.getShortDesc() : p.getName());
        item.setPrice(p.getPricing() != null ? p.getPricing().getRetailPrice() : BigDecimal.ZERO);

        // Fetch barcode: use the first barcode entry for this product
        java.util.List<com.billbull.backend.inventory.product.ProductBarcode> barcodes = barcodeRepo.findByProductId(p.getId());
        item.setBarcode(!barcodes.isEmpty() ? barcodes.get(0).getBarcode() : null);

        // Fetch primary image
        mediaRepo.findByProductIdAndIsPrimaryTrue(p.getId()).ifPresent(m -> item.setImage(m.getImageUrl()));

        // Use raw on-hand (sum of stock movements) for stock take — NOT "available" which subtracts reservations.
        // A physical stock count should reflect all units present, including reserved ones.
        BigDecimal available = stockMovementRepo.getAvailableStock(session.getWarehouseId(), p.getId());
        item.setSystemQty(available != null ? available.intValue() : 0);
        item.setCountedQty(initialCount);
        item.setVariance(initialCount - item.getSystemQty());
        item.setVarianceValue(item.getPrice() != null ? 
                item.getPrice().multiply(BigDecimal.valueOf(item.getVariance())) : BigDecimal.ZERO);
        
        if (item.getVariance() == 0) {
            item.setStatus(StockTakeItem.ItemStatus.MATCHED);
        } else {
            item.setStatus(StockTakeItem.ItemStatus.VARIANCE);
        }

        return itemRepo.save(item);
    }

    public List<StockTakeItem> bulkUpdateItems(String sessionId, List<StockTakeItemUpdateDTO> updates) {
        StockTakeSession session = getSession(sessionId);
        if (session.getStatus() != StockTakeSession.StockTakeStatus.IN_PROGRESS) {
            throw new IllegalStateException("Session is not in progress");
        }

        List<StockTakeItem> items = session.getItems();
        for (StockTakeItemUpdateDTO update : updates) {
            items.stream()
                .filter(i -> i.getSku().equalsIgnoreCase(update.getSku()))
                .findFirst()
                .ifPresent(item -> {
                    item.setCountedQty(update.getCountedQty());
                    item.setVariance(update.getCountedQty() - item.getSystemQty());
                    item.setVarianceValue(item.getPrice() != null ? 
                            item.getPrice().multiply(BigDecimal.valueOf(item.getVariance())) : BigDecimal.ZERO);
                    
                    if (item.getVariance() == 0) {
                        item.setStatus(StockTakeItem.ItemStatus.MATCHED);
                    } else {
                        item.setStatus(StockTakeItem.ItemStatus.VARIANCE);
                    }
                });
        }

        return itemRepo.saveAll(items);
    }

    public StockTakeSession rejectSession(String sessionId) {
        StockTakeSession session = getSession(sessionId);
        session.setStatus(StockTakeSession.StockTakeStatus.IN_PROGRESS);
        return sessionRepo.save(session);
    }

    public void deleteSession(String sessionId) {
        StockTakeSession session = getSession(sessionId);
        if (session.getStatus() == StockTakeSession.StockTakeStatus.COMPLETED) {
            throw new IllegalStateException("Cannot delete a completed stock take session");
        }
        session.setActive(false);
        sessionRepo.save(session);
    }

    public void deleteItem(Long itemId) {
        StockTakeItem item = itemRepo.findById(itemId)
                .orElseThrow(() -> new RuntimeException("Item not found"));
        StockTakeSession session = item.getSession();
        if (session.getStatus() != StockTakeSession.StockTakeStatus.IN_PROGRESS) {
            throw new IllegalStateException("Cannot delete item from a session that is not in progress");
        }
        // Remove from parent collection — with orphanRemoval=true this is the correct way
        // to delete a child. Calling itemRepo.delete() directly while the item is still
        // in the EAGER-loaded session.items collection can cause a cascade conflict at flush time.
        session.getItems().remove(item);
        item.setSession(null);
    }
}