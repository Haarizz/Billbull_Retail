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

import com.billbull.backend.inventory.batch.BatchNumberGenerator;
import com.billbull.backend.inventory.batch.StockIdentifier;
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
    private final StockTakeItemBatchRepository batchRepo;
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
            StockTakeItemBatchRepository batchRepo,
            WarehouseStockService warehouseStockService,
            ProductRepository productRepo,
            StockMovementRepository stockMovementRepo,
            ProductMediaRepository mediaRepo,
            ProductBarcodeRepository barcodeRepo,
            BinRepository binRepo,
            BinStockService binStockService) {
        this.sessionRepo = sessionRepo;
        this.itemRepo = itemRepo;
        this.batchRepo = batchRepo;
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

        if (item.isBatchEnabled()) {
            throw new IllegalStateException("Counted quantity for batch-enabled items is derived from batch entries");
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
            // Defensive OR — if either flag survived an old record, treat as batched.
            boolean batched = (item.isBatchEnabled() || item.isExpiryEnabled())
                    && item.getBatches() != null && !item.getBatches().isEmpty();

            // Skip purely-zero non-batched items (no change to record).
            // Batched items always post (even if variance=0) so the per-batch ledger is accurate.
            if (!batched && variance == 0) continue;

            // Resolve bin: prefer explicit assignment on item, else auto-detect from existing stock
            Long resolvedBinId = item.getBinId();
            Long resolvedZoneId = item.getZoneId();
            Long resolvedLocatorId = item.getLocatorId();
            String resolvedBinCode = item.getBinCode();

            if (resolvedBinId == null) {
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

            if (batched) {
                // Two-step ledger:
                //   1) STOCK_TAKE   correction = -current_on_hand (zeros out prior un-batched on-hand)
                //   2) STOCK_TAKE_BATCH per-batch positives summing to counted_qty
                // Net effect = -current_on_hand + sum(batches), so post-approval on-hand == counted_qty.
                // Read on-hand fresh from the ledger here — item.system_qty may be stale if other
                // movements landed between modal open and approval.
                java.math.BigDecimal onHandBd;
                if (resolvedBinId != null) {
                    onHandBd = stockMovementRepo.getStockByBin(session.getWarehouseId(), item.getProductId(), resolvedBinId);
                } else {
                    onHandBd = stockMovementRepo.getUnlocatedStock(session.getWarehouseId(), item.getProductId());
                }
                int sysQty = onHandBd != null ? onHandBd.intValue() : 0;
                if (sysQty != 0) {
                    boolean correctionPosted = stockMovementRepo.existsBySourceTypeAndSourceIdAndProductId(
                            StockSourceType.STOCK_TAKE, item.getId(), item.getProductId());
                    if (!correctionPosted) {
                        StockMovement correction = new StockMovement();
                        correction.setSourceType(StockSourceType.STOCK_TAKE);
                        correction.setSourceId(item.getId());
                        correction.setProductId(item.getProductId());
                        correction.setWarehouseId(session.getWarehouseId());
                        correction.setQuantity(-sysQty);
                        correction.setReferenceNo(session.getSessionId());
                        correction.setMovementDate(LocalDate.now());
                        correction.setBinId(resolvedBinId);
                        correction.setZoneId(resolvedZoneId);
                        correction.setLocatorId(resolvedLocatorId);
                        stockMovementRepo.save(correction);
                    }
                }

                for (StockTakeItemBatch batch : item.getBatches()) {
                    if (batch.getQuantity() == null || batch.getQuantity() <= 0) continue;
                    boolean batchPosted = stockMovementRepo.existsBySourceTypeAndSourceIdAndProductId(
                            StockSourceType.STOCK_TAKE_BATCH, batch.getId(), item.getProductId());
                    if (batchPosted) continue;

                    StockMovement sm = new StockMovement();
                    sm.setSourceType(StockSourceType.STOCK_TAKE_BATCH);
                    sm.setSourceId(batch.getId());
                    sm.setProductId(item.getProductId());
                    sm.setWarehouseId(session.getWarehouseId());
                    sm.setQuantity(batch.getQuantity());
                    sm.setReferenceNo(session.getSessionId());
                    sm.setMovementDate(LocalDate.now());
                    sm.setBinId(resolvedBinId);
                    sm.setZoneId(resolvedZoneId);
                    sm.setLocatorId(resolvedLocatorId);
                    sm.setBatchNumber(batch.getBatchNumber());
                    sm.setExpiryDate(batch.getExpiryDate());

                    stockMovementRepo.save(sm);
                }
            } else {
                boolean alreadyPosted = stockMovementRepo.existsBySourceTypeAndSourceIdAndProductId(
                        StockSourceType.STOCK_TAKE, item.getId(), item.getProductId());
                if (alreadyPosted) continue;

                StockMovement sm = new StockMovement();
                sm.setSourceType(StockSourceType.STOCK_TAKE);
                sm.setSourceId(item.getId());
                sm.setProductId(item.getProductId());
                sm.setWarehouseId(session.getWarehouseId());
                sm.setQuantity(variance);
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
        // Batch and Expiry are now driven by a single product-master toggle, but the
        // two underlying columns may briefly drift on legacy data. Treat the item as
        // tracked whenever either flag is set, and force them both true so the rest
        // of the flow has one consistent source of truth.
        boolean tracked = p.isBatch() || p.isExpiryEnabled();
        item.setBatchEnabled(tracked);
        item.setExpiryEnabled(tracked);

        // Fetch barcode: use the first barcode entry for this product
        java.util.List<com.billbull.backend.inventory.product.ProductBarcode> barcodes = barcodeRepo.findByProductId(p.getId());
        item.setBarcode(!barcodes.isEmpty() ? barcodes.get(0).getBarcode() : null);

        // Fetch primary image
        mediaRepo.findByProductIdAndIsPrimaryTrue(p.getId()).ifPresent(m -> item.setImage(m.getImageUrl()));

        // Use raw on-hand (sum of stock movements) for stock take — NOT "available" which subtracts reservations.
        // A physical stock count should reflect all units present, including reserved ones.
        BigDecimal available = stockMovementRepo.getAvailableStock(session.getWarehouseId(), p.getId());
        item.setSystemQty(available != null ? available.intValue() : 0);

        // Batch-enabled items start with countedQty=0 — quantity comes from batch entries.
        Integer effectiveCount = item.isBatchEnabled() ? 0 : initialCount;
        item.setCountedQty(effectiveCount);
        item.setVariance(effectiveCount - item.getSystemQty());
        item.setVarianceValue(item.getPrice() != null ?
                item.getPrice().multiply(BigDecimal.valueOf(item.getVariance())) : BigDecimal.ZERO);

        if (item.getVariance() == 0) {
            item.setStatus(StockTakeItem.ItemStatus.MATCHED);
        } else {
            item.setStatus(StockTakeItem.ItemStatus.VARIANCE);
        }

        return itemRepo.save(item);
    }

    // === Batch operations ===

    public StockTakeItemBatch addBatch(Long itemId, String batchNumber, java.time.LocalDate expiryDate, Integer quantity) {
        StockTakeItem item = itemRepo.findById(itemId)
                .orElseThrow(() -> new RuntimeException("Item not found"));
        StockTakeSession session = item.getSession();
        if (session.getStatus() != StockTakeSession.StockTakeStatus.IN_PROGRESS) {
            throw new IllegalStateException("Session is not in progress");
        }
        if (!item.isBatchEnabled()) {
            throw new IllegalStateException("Item is not batch-enabled");
        }
        if (quantity == null || quantity <= 0) {
            throw new IllegalArgumentException("Quantity must be positive");
        }
        if (item.isExpiryEnabled() && expiryDate == null) {
            throw new IllegalArgumentException("Expiry date is required for this item");
        }

        Product product = productRepo.findById(item.getProductId()).orElse(null);
        String itemCode = product != null ? product.getCode() : ("P" + item.getProductId());
        String warehouseCode = "WH" + session.getWarehouseId();

        String resolvedBatchNumber = batchNumber != null && !batchNumber.trim().isEmpty()
                ? batchNumber.trim()
                : nextAutoBatchNumber(item, warehouseCode, itemCode, session.getSessionId());

        if (batchRepo.existsByItemIdAndBatchNumber(itemId, resolvedBatchNumber)) {
            throw new IllegalStateException("Batch number already exists for this item: " + resolvedBatchNumber);
        }

        StockTakeItemBatch batch = new StockTakeItemBatch();
        batch.setItem(item);
        batch.setBatchNumber(resolvedBatchNumber);
        batch.setExpiryDate(expiryDate);
        batch.setQuantity(quantity);
        item.getBatches().add(batch);
        StockTakeItemBatch saved = batchRepo.save(batch);

        recomputeFromBatches(item);
        itemRepo.save(item);
        return saved;
    }

    public StockTakeItemBatch updateBatch(Long batchId, String batchNumber, java.time.LocalDate expiryDate, Integer quantity) {
        StockTakeItemBatch batch = batchRepo.findById(batchId)
                .orElseThrow(() -> new RuntimeException("Batch not found"));
        StockTakeItem item = batch.getItem();
        if (item.getSession().getStatus() != StockTakeSession.StockTakeStatus.IN_PROGRESS) {
            throw new IllegalStateException("Session is not in progress");
        }
        if (quantity != null && quantity <= 0) {
            throw new IllegalArgumentException("Quantity must be positive");
        }
        if (item.isExpiryEnabled() && expiryDate == null && batch.getExpiryDate() == null) {
            throw new IllegalArgumentException("Expiry date is required for this item");
        }
        if (batchNumber != null && !batchNumber.trim().isEmpty()) {
            String trimmed = batchNumber.trim();
            if (!trimmed.equals(batch.getBatchNumber())
                    && batchRepo.existsByItemIdAndBatchNumber(item.getId(), trimmed)) {
                throw new IllegalStateException("Batch number already exists for this item: " + trimmed);
            }
            batch.setBatchNumber(trimmed);
        }
        if (expiryDate != null) batch.setExpiryDate(expiryDate);
        if (quantity != null) batch.setQuantity(quantity);
        StockTakeItemBatch saved = batchRepo.save(batch);

        recomputeFromBatches(item);
        itemRepo.save(item);
        return saved;
    }

    public void deleteBatch(Long batchId) {
        StockTakeItemBatch batch = batchRepo.findById(batchId)
                .orElseThrow(() -> new RuntimeException("Batch not found"));
        StockTakeItem item = batch.getItem();
        if (item.getSession().getStatus() != StockTakeSession.StockTakeStatus.IN_PROGRESS) {
            throw new IllegalStateException("Session is not in progress");
        }
        item.getBatches().removeIf(b -> b.getId().equals(batchId));

        recomputeFromBatches(item);
        itemRepo.save(item);
    }

    public String previewNextBatchNumber(Long itemId) {
        StockTakeItem item = itemRepo.findById(itemId)
                .orElseThrow(() -> new RuntimeException("Item not found"));
        Product product = productRepo.findById(item.getProductId()).orElse(null);
        String itemCode = product != null ? product.getCode() : ("P" + item.getProductId());
        String warehouseCode = "WH" + item.getSession().getWarehouseId();
        return nextAutoBatchNumber(item, warehouseCode, itemCode, item.getSession().getSessionId());
    }

    private String nextAutoBatchNumber(StockTakeItem item, String warehouseCode, String itemCode, String documentCode) {
        // Opening Inventory sessions emit OS-prefixed batch numbers; regular counts emit ST.
        StockIdentifier identifier =
                item.getSession().getType() == StockTakeSession.StockTakeType.OPENING_INVENTORY
                        ? StockIdentifier.OS
                        : StockIdentifier.ST;

        // Sequence: per item, per document, starts at 1
        int existing = item.getBatches() != null ? item.getBatches().size() : 0;
        int seq = existing + 1;
        String candidate;
        do {
            candidate = BatchNumberGenerator.generate(
                    identifier,
                    java.time.LocalDate.now(),
                    warehouseCode,
                    documentCode,
                    itemCode,
                    seq);
            seq++;
        } while (batchRepo.existsByItemIdAndBatchNumber(item.getId(), candidate));
        return candidate;
    }

    private void recomputeFromBatches(StockTakeItem item) {
        if (!item.isBatchEnabled()) return;
        int sum = item.getBatches().stream()
                .filter(b -> b.getQuantity() != null)
                .mapToInt(StockTakeItemBatch::getQuantity)
                .sum();
        item.setCountedQty(sum);
        Integer sysQty = item.getSystemQty() != null ? item.getSystemQty() : 0;
        item.setVariance(sum - sysQty);
        item.setVarianceValue(item.getPrice() != null
                ? item.getPrice().multiply(BigDecimal.valueOf(item.getVariance()))
                : BigDecimal.ZERO);
        if (item.getVariance() == 0 && sum > 0) {
            item.setStatus(StockTakeItem.ItemStatus.MATCHED);
        } else if (sum == 0) {
            item.setStatus(StockTakeItem.ItemStatus.PENDING);
        } else {
            item.setStatus(StockTakeItem.ItemStatus.VARIANCE);
        }
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
                .filter(i -> !i.isBatchEnabled()) // batched items: countedQty is derived from batches
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