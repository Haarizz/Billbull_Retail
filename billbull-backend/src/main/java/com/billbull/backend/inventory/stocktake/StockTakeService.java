package com.billbull.backend.inventory.stocktake;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.inventory.batch.BatchNumberGenerator;
import com.billbull.backend.inventory.batch.StockIdentifier;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductBarcode;
import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.inventory.product.ProductMedia;
import com.billbull.backend.inventory.product.ProductMediaRepository;
import com.billbull.backend.inventory.product.ProductPricing;
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
    public Page<StockTakeProductResponse> getProductsForStockTake(
            String stockTakeType, Long warehouseId, String countType,
            Long categoryId, Long brandId, String search, int page, int size) {

        // COUNTING requires warehouse restriction; OPENING is global
        Long effectiveWarehouseId = "COUNTING".equalsIgnoreCase(stockTakeType) ? warehouseId : null;
        Pageable pageable = org.springframework.data.domain.PageRequest.of(page, size);

        // Validate: if count type demands a filter but none provided → return empty
        boolean needsCategory = "Selected Categories".equalsIgnoreCase(countType);
        boolean needsBrand    = "Selected Brands".equalsIgnoreCase(countType);
        if (needsCategory && categoryId == null) return Page.empty(pageable);
        if (needsBrand    && brandId    == null) return Page.empty(pageable);

        // Only apply category/brand filters when the count type explicitly requires them
        Long effectiveCategoryId = needsCategory ? categoryId : null;
        Long effectiveBrandId    = needsBrand    ? brandId    : null;

        Page<Product> productPage = productRepo.findForStockTake(
                effectiveWarehouseId, effectiveCategoryId, effectiveBrandId,
                search != null ? search : "", pageable);

        List<Product> products = productPage.getContent();
        if (products.isEmpty()) {
            return new PageImpl<>(List.of(), pageable, productPage.getTotalElements());
        }

        List<Long> productIds = products.stream().map(Product::getId).toList();

        Map<Long, Integer> stockMap = new HashMap<>();
        List<Object[]> stockRows = effectiveWarehouseId != null
                ? stockMovementRepo.getAvailableStockForProductsInWarehouse(effectiveWarehouseId, productIds)
                : stockMovementRepo.getTotalAvailableStockForProducts(productIds);
        for (Object[] row : stockRows) {
            if (row[0] == null || row[1] == null) continue;
            stockMap.put(((Number) row[0]).longValue(), ((Number) row[1]).intValue());
        }

        Map<Long, List<String>> barcodeMap = barcodeRepo.findByProductIdIn(productIds)
                .stream()
                .filter(b -> b.getProduct() != null && b.getBarcode() != null && !b.getBarcode().isBlank())
                .collect(Collectors.groupingBy(
                        b -> b.getProduct().getId(),
                        Collectors.mapping(ProductBarcode::getBarcode, Collectors.toList())));

        Map<Long, String> imageMap = mediaRepo.findByProductIdInAndIsPrimaryTrue(productIds)
                .stream()
                .collect(Collectors.toMap(
                        m -> m.getProduct().getId(),
                        ProductMedia::getImageUrl,
                        (a, b) -> a));

        List<StockTakeProductResponse> content = new ArrayList<>();
        for (Product product : products) {
            content.add(toStockTakeProductResponse(
                    product,
                    stockMap.getOrDefault(product.getId(), 0),
                    barcodeMap.getOrDefault(product.getId(), List.of()),
                    imageMap.get(product.getId())));
        }

        return new PageImpl<>(content, pageable, productPage.getTotalElements());
    }

    private StockTakeProductResponse toStockTakeProductResponse(
            Product product,
            Integer stock,
            List<String> barcodes,
            String image) {
        StockTakeProductResponse response = new StockTakeProductResponse();
        response.setId(product.getId());
        response.setCode(product.getCode());
        response.setSku(product.getSku() != null ? product.getSku() : product.getCode());
        response.setName(product.getName());
        response.setDescription(product.getShortDesc() != null ? product.getShortDesc() : product.getName());
        response.setCategory(product.getCategory());
        response.setStock(stock != null ? stock : 0);
        response.setImage(image);
        response.setBatchEnabled(product.isBatch() || product.isExpiryEnabled());
        response.setExpiryEnabled(product.isBatch() || product.isExpiryEnabled());

        if (product.getDepartment() != null) {
            response.setDepartmentId(product.getDepartment().getId());
            response.setDepartmentName(product.getDepartment().getName());
            if (response.getCategory() == null || response.getCategory().isBlank()) {
                response.setCategory(product.getDepartment().getName());
            }
        }
        if (product.getBrand() != null) {
            response.setBrandId(product.getBrand().getId());
            response.setBrandName(product.getBrand().getName());
        }

        response.setBarcodes(barcodes != null ? barcodes : List.of());
        response.setBarcode(response.getBarcodes().isEmpty() ? null : response.getBarcodes().get(0));

        ProductPricing pricing = product.getPricing();
        if (pricing != null) {
            response.setCost(pricing.getCost());
            response.setRetailPrice(pricing.getRetailPrice());
            response.setSellingPrice(pricing.getRetailPrice());
        }

        return response;
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

        if (item.isBatchEnabled() || item.isExpiryEnabled()) {
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

        refreshItemSystemQty(item);
        if ((item.isBatchEnabled() || item.isExpiryEnabled())
                && (item.getBatches() == null || item.getBatches().isEmpty())) {
            seedExistingBatchCounts(item);
        } else if (item.isBatchEnabled() || item.isExpiryEnabled()) {
            recomputeFromBatches(item);
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
            boolean batched = item.isBatchEnabled() || item.isExpiryEnabled();

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
                reconcileBatchedItem(session, item, resolvedBinId, resolvedZoneId, resolvedLocatorId);
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
        Integer effectiveCount = item.isBatchEnabled() ? null : initialCount;
        item.setCountedQty(effectiveCount);
        item.setVariance(effectiveCount != null ? effectiveCount - item.getSystemQty() : 0 - item.getSystemQty());
        item.setVarianceValue(item.getPrice() != null ?
                item.getPrice().multiply(BigDecimal.valueOf(item.getVariance())) : BigDecimal.ZERO);

        if (effectiveCount == null) {
            item.setStatus(StockTakeItem.ItemStatus.PENDING);
        } else if (item.getVariance() == 0) {
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
        if (!(item.isBatchEnabled() || item.isExpiryEnabled())) {
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

        if (batchRepo.existsIdentity(itemId, resolvedBatchNumber, expiryDate, null)) {
            throw new IllegalStateException("Batch and expiry already exists for this item: " + resolvedBatchNumber);
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
            java.time.LocalDate effectiveExpiry = expiryDate != null ? expiryDate : batch.getExpiryDate();
            if (batchRepo.existsIdentity(item.getId(), trimmed, effectiveExpiry, batch.getId())) {
                throw new IllegalStateException("Batch and expiry already exists for this item: " + trimmed);
            }
            batch.setBatchNumber(trimmed);
        } else if (expiryDate != null
                && batchRepo.existsIdentity(item.getId(), batch.getBatchNumber(), expiryDate, batch.getId())) {
            throw new IllegalStateException("Batch and expiry already exists for this item: " + batch.getBatchNumber());
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
        if (!(item.isBatchEnabled() || item.isExpiryEnabled())) return;
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

    private void refreshItemSystemQty(StockTakeItem item) {
        BigDecimal onHand;
        if (item.getBinId() != null) {
            onHand = stockMovementRepo.getStockByBin(item.getSession().getWarehouseId(), item.getProductId(), item.getBinId());
        } else {
            onHand = stockMovementRepo.getUnlocatedStock(item.getSession().getWarehouseId(), item.getProductId());
        }
        int systemQty = onHand != null ? onHand.intValue() : 0;
        item.setSystemQty(systemQty);
        if (item.getCountedQty() != null) {
            item.setVariance(item.getCountedQty() - systemQty);
            item.setVarianceValue(item.getPrice() != null
                    ? item.getPrice().multiply(BigDecimal.valueOf(item.getVariance()))
                    : BigDecimal.ZERO);
        }
    }

    private void seedExistingBatchCounts(StockTakeItem item) {
        if (!(item.isBatchEnabled() || item.isExpiryEnabled())) return;

        List<Object[]> rows = stockMovementRepo.findStockIdentitiesByProductAndBin(
                item.getSession().getWarehouseId(), item.getProductId(), item.getBinId());
        if (rows == null || rows.isEmpty()) {
            return;
        }

        Product product = productRepo.findById(item.getProductId()).orElse(null);
        String itemCode = product != null ? product.getCode() : ("P" + item.getProductId());
        String warehouseCode = "WH" + item.getSession().getWarehouseId();

        int generatedSeq = 1;
        for (Object[] row : rows) {
            int qty = row[2] != null ? ((Number) row[2]).intValue() : 0;
            if (qty <= 0) continue;

            String batchNumber = row[0] != null && !row[0].toString().isBlank()
                    ? row[0].toString()
                    : nextAutoBatchNumber(item, warehouseCode, itemCode, item.getSession().getSessionId() + "-FOUND" + generatedSeq++);
            LocalDate expiryDate = (LocalDate) row[1];
            if (batchRepo.existsIdentity(item.getId(), batchNumber, expiryDate, null)) {
                continue;
            }

            StockTakeItemBatch batch = new StockTakeItemBatch();
            batch.setItem(item);
            batch.setBatchNumber(batchNumber);
            batch.setExpiryDate(expiryDate);
            batch.setQuantity(qty);
            batch.setSeeded(true);
            item.getBatches().add(batch);
            batchRepo.save(batch);
        }

        recomputeFromBatches(item);
    }

    private void reconcileBatchedItem(
            StockTakeSession session,
            StockTakeItem item,
            Long binId,
            Long zoneId,
            Long locatorId) {

        Map<BatchIdentity, Integer> systemQty = loadSystemBatchIdentityQty(
                session.getWarehouseId(), item.getProductId(), binId);
        Map<BatchIdentity, Integer> countedQty = loadCountedBatchIdentityQty(item);

        Set<BatchIdentity> identities = new LinkedHashSet<>();
        identities.addAll(systemQty.keySet());
        identities.addAll(countedQty.keySet());

        BigDecimal adjustmentUnitCost = resolveAdjustmentUnitCost(item);
        int sequence = 1;
        for (BatchIdentity identity : identities.stream()
                .sorted(Comparator
                        .comparing((BatchIdentity i) -> i.batchNumber == null ? "" : i.batchNumber)
                        .thenComparing(i -> i.expiryDate == null ? LocalDate.MIN : i.expiryDate))
                .toList()) {
            int delta = countedQty.getOrDefault(identity, 0) - systemQty.getOrDefault(identity, 0);
            if (delta == 0) continue;

            StockMovement movement = new StockMovement();
            movement.setSourceType(StockSourceType.STOCK_TAKE_ADJUSTMENT);
            movement.setSourceId(stockTakeAdjustmentSourceId(item.getId(), sequence++));
            movement.setProductId(item.getProductId());
            movement.setWarehouseId(session.getWarehouseId());
            movement.setQuantity(delta);
            movement.setReferenceNo(session.getSessionId());
            movement.setMovementDate(LocalDate.now());
            movement.setBinId(binId);
            movement.setZoneId(zoneId);
            movement.setLocatorId(locatorId);
            movement.setBatchNumber(identity.batchNumber);
            movement.setExpiryDate(identity.expiryDate);
            if (delta > 0) {
                movement.setUnitCost(adjustmentUnitCost);
            }

            stockMovementRepo.save(movement);
        }
    }

    private Map<BatchIdentity, Integer> loadSystemBatchIdentityQty(Long warehouseId, Long productId, Long binId) {
        Map<BatchIdentity, Integer> result = new LinkedHashMap<>();
        for (Object[] row : stockMovementRepo.findStockIdentitiesByProductAndBin(warehouseId, productId, binId)) {
            String batchNumber = row[0] != null ? row[0].toString() : null;
            LocalDate expiryDate = (LocalDate) row[1];
            int qty = row[2] != null ? ((Number) row[2]).intValue() : 0;
            if (qty == 0) continue;
            result.merge(new BatchIdentity(batchNumber, expiryDate), qty, Integer::sum);
        }
        return result;
    }

    private Map<BatchIdentity, Integer> loadCountedBatchIdentityQty(StockTakeItem item) {
        Map<BatchIdentity, Integer> result = new LinkedHashMap<>();
        if (item.getBatches() == null) return result;

        for (StockTakeItemBatch batch : item.getBatches()) {
            if (batch.getQuantity() == null || batch.getQuantity() <= 0) continue;
            result.merge(
                    new BatchIdentity(batch.getBatchNumber(), batch.getExpiryDate()),
                    batch.getQuantity(),
                    Integer::sum);
        }
        return result;
    }

    private BigDecimal resolveAdjustmentUnitCost(StockTakeItem item) {
        return productRepo.findById(item.getProductId())
                .map(Product::getPricing)
                .map(ProductPricing::getCost)
                .filter(cost -> cost.compareTo(BigDecimal.ZERO) > 0)
                .orElse(null);
    }

    private long stockTakeAdjustmentSourceId(Long itemId, int sequence) {
        long base = itemId != null ? itemId : 0L;
        return (base * 10_000L) + sequence;
    }

    private static final class BatchIdentity {
        private final String batchNumber;
        private final LocalDate expiryDate;

        private BatchIdentity(String batchNumber, LocalDate expiryDate) {
            this.batchNumber = batchNumber != null && !batchNumber.isBlank() ? batchNumber.trim() : null;
            this.expiryDate = expiryDate;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof BatchIdentity that)) return false;
            return Objects.equals(batchNumber, that.batchNumber)
                    && Objects.equals(expiryDate, that.expiryDate);
        }

        @Override
        public int hashCode() {
            return Objects.hash(batchNumber, expiryDate);
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
                .filter(i -> !(i.isBatchEnabled() || i.isExpiryEnabled())) // tracked items: countedQty is derived from batches
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
