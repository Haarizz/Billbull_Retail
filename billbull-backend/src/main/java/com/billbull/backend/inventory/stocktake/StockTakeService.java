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
import java.util.Optional;
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
    private final StockTakeExpectedUnitRepository expectedUnitRepo;
    private final StockTakeUnitScanRepository unitScanRepo;

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
            BinStockService binStockService,
            StockTakeExpectedUnitRepository expectedUnitRepo,
            StockTakeUnitScanRepository unitScanRepo) {
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
        this.expectedUnitRepo = expectedUnitRepo;
        this.unitScanRepo = unitScanRepo;
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
        StockTakeSession saved = sessionRepo.save(session);
        if (saved.getType() == StockTakeSession.StockTakeType.INVENTORY_COUNTING) {
            ensureExpectedSnapshot(saved);
        }
        return saved;
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
        response.setBatchEnabled(product.isBatch());
        response.setExpiryEnabled(product.isExpiryEnabled());

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

        if (isInventoryCounting(session)) {
            if (!hasExpectedSnapshot(session)
                    && session.getStatus() == StockTakeSession.StockTakeStatus.IN_PROGRESS) {
                ensureExpectedSnapshot(session);
            }
            if (hasExpectedSnapshot(session)) {
                syncSnapshotItemCounts(session);
                return session;
            }
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

    public StockTakeUnitScanResponse scanUnitBarcode(String sessionId, StockTakeUnitScanRequest request) {
        StockTakeSession session = getSession(sessionId);
        if (session.getStatus() != StockTakeSession.StockTakeStatus.IN_PROGRESS) {
            throw new IllegalStateException("Session is not in progress");
        }
        if (!isInventoryCounting(session)) {
            throw new IllegalStateException("Unit scanning is only available for inventory counting sessions");
        }

        ensureExpectedSnapshot(session);

        String barcode = normalizeBarcode(request != null ? request.getBarcode() : null);
        if (barcode == null) {
            throw new IllegalArgumentException("Barcode is required");
        }

        Bin scannedBin = requireSessionBin(session, request != null ? request.getBinId() : null);

        Optional<StockTakeExpectedUnit> openMatch =
                expectedUnitRepo.findFirstBySessionAndUnitBarcodeIgnoreCaseAndScannedFalse(session, barcode);
        if (openMatch.isPresent()) {
            StockTakeExpectedUnit unit = openMatch.get();
            boolean wrongBin = !Objects.equals(unit.getExpectedBinId(), scannedBin.getId());

            unit.setScanned(true);
            unit.setWrongBin(wrongBin);
            unit.setActualBinId(scannedBin.getId());
            unit.setActualBinCode(scannedBin.getCode());
            unit.setActualLocatorId(scannedBin.getLocator().getId());
            unit.setActualZoneId(scannedBin.getLocator().getZone().getId());
            unit.setScannedAt(LocalDateTime.now());
            expectedUnitRepo.save(unit);

            StockTakeUnitScan scan = new StockTakeUnitScan();
            scan.setSession(session);
            scan.setExpectedUnit(unit);
            scan.setScannedBarcode(barcode);
            scan.setStatus(wrongBin ? StockTakeUnitScanStatus.WRONG_BIN : StockTakeUnitScanStatus.COUNTED);
            scan.setResolution(StockTakeUnknownScanResolution.IGNORED);
            scan.setMessage(wrongBin
                    ? "Unit counted in a different bin"
                    : "Unit counted");
            copyExpectedUnitToScan(unit, scan);
            applyScannedBin(scan, scannedBin);

            StockTakeUnitScan saved = unitScanRepo.save(scan);
            syncSnapshotItemCounts(session);
            return StockTakeUnitScanResponse.from(saved);
        }

        Optional<StockTakeExpectedUnit> alreadyScanned =
                expectedUnitRepo.findFirstBySessionAndUnitBarcodeIgnoreCase(session, barcode);
        if (alreadyScanned.isPresent()) {
            StockTakeExpectedUnit unit = alreadyScanned.get();
            StockTakeUnitScan scan = new StockTakeUnitScan();
            scan.setSession(session);
            scan.setExpectedUnit(unit);
            scan.setScannedBarcode(barcode);
            scan.setStatus(StockTakeUnitScanStatus.DUPLICATE);
            scan.setResolution(StockTakeUnknownScanResolution.IGNORED);
            scan.setMessage("This unit was already counted");
            copyExpectedUnitToScan(unit, scan);
            applyScannedBin(scan, scannedBin);
            return StockTakeUnitScanResponse.from(unitScanRepo.save(scan));
        }

        StockTakeUnitScan unknown = new StockTakeUnitScan();
        unknown.setSession(session);
        unknown.setScannedBarcode(barcode);
        unknown.setStatus(StockTakeUnitScanStatus.UNKNOWN);
        unknown.setResolution(StockTakeUnknownScanResolution.PENDING);
        unknown.setMessage("Barcode is not in the expected snapshot");
        unknown.setBatchNumber(barcode);
        applyScannedBin(unknown, scannedBin);
        hydrateUnknownScanProduct(unknown, barcode);
        return StockTakeUnitScanResponse.from(unitScanRepo.save(unknown));
    }

    public StockTakeCoverageResponse getCoverage(String sessionId) {
        StockTakeSession session = getSession(sessionId);
        return buildCoverageResponse(session);
    }

    public StockTakeUnitScanResponse resolveUnitScan(Long scanId, StockTakeUnitScanResolveRequest request) {
        StockTakeUnitScan scan = unitScanRepo.findById(scanId)
                .orElseThrow(() -> new RuntimeException("Unit scan not found: " + scanId));
        if (scan.getStatus() != StockTakeUnitScanStatus.UNKNOWN) {
            throw new IllegalStateException("Only unexpected scans can be resolved");
        }

        String action = request != null && request.getAction() != null
                ? request.getAction().trim().toUpperCase()
                : "";
        if ("IGNORE".equals(action) || "IGNORED".equals(action)) {
            scan.setResolution(StockTakeUnknownScanResolution.IGNORED);
            scan.setMessage("Unexpected unit ignored");
        } else if ("ACCEPT_AS_FOUND".equals(action) || "ACCEPTED_AS_FOUND".equals(action)) {
            Long productId = request != null && request.getProductId() != null
                    ? request.getProductId()
                    : scan.getProductId();
            if (productId == null) {
                throw new IllegalArgumentException("Product is required to accept found stock");
            }
            Product product = productRepo.findById(productId)
                    .orElseThrow(() -> new RuntimeException("Product not found"));
            scan.setProductId(product.getId());
            scan.setProductCode(product.getCode());
            scan.setProductName(product.getName());
            scan.setResolution(StockTakeUnknownScanResolution.ACCEPTED_AS_FOUND);
            scan.setMessage("Unexpected unit accepted as found stock");
        } else {
            throw new IllegalArgumentException("Unknown resolution action: " + action);
        }

        return StockTakeUnitScanResponse.from(unitScanRepo.save(scan));
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

        if (hasExpectedSnapshot(session)) {
            if (unitScanRepo.existsBySessionAndStatusAndResolution(
                    session,
                    StockTakeUnitScanStatus.UNKNOWN,
                    StockTakeUnknownScanResolution.PENDING)) {
                throw new IllegalStateException("Review unexpected scans before submitting for approval");
            }
            syncSnapshotItemCounts(session);
            session.setStatus(StockTakeSession.StockTakeStatus.PENDING_APPROVAL);
            return sessionRepo.save(session);
        }

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

        if (hasExpectedSnapshot(session)) {
            return approveSnapshotSession(session, approvedBy);
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

    public StockTakeItem addItemToSession(String sessionId, Long productId, Integer initialCount, Long binId) {
        StockTakeSession session = getSession(sessionId);
        if (session.getStatus() != StockTakeSession.StockTakeStatus.IN_PROGRESS) {
            throw new IllegalStateException("Session is not in progress");
        }

        Product p = productRepo.findById(productId)
                .orElseThrow(() -> new RuntimeException("Product not found"));

        // Allow the same product across different bins of the same warehouse, but
        // reject a duplicate of the exact (product, bin) pair — including (product, no bin).
        boolean duplicate = session.getItems() != null && session.getItems().stream()
                .anyMatch(existing -> Objects.equals(existing.getProductId(), productId)
                        && Objects.equals(existing.getBinId(), binId));
        if (duplicate) {
            throw new IllegalStateException(binId != null
                    ? "This product is already in the session for the selected bin."
                    : "This product is already in the session. Assign it a bin to add it for another bin.");
        }

        StockTakeItem item = new StockTakeItem();
        item.setSession(session);
        item.setProductId(p.getId());
        item.setProductName(p.getName());
        item.setSku(p.getCode());
        item.setBrand(p.getBrand() != null ? p.getBrand().getName() : "Generic");
        item.setCategory(p.getCategory());
        item.setDescription(p.getShortDesc() != null ? p.getShortDesc() : p.getName());
        item.setPrice(p.getPricing() != null ? p.getPricing().getRetailPrice() : BigDecimal.ZERO);
        // Batch and Expiry are independent product-master toggles. Each item carries
        // its own copy of the flag so downstream logic can gate batch-number entry and
        // expiry entry separately. An item is "tracked" (uses the batch grid for its
        // counted qty) whenever either flag is on.
        item.setBatchEnabled(p.isBatch());
        item.setExpiryEnabled(p.isExpiryEnabled());
        boolean tracked = item.isBatchEnabled() || item.isExpiryEnabled();

        // Fetch barcode: use the first barcode entry for this product
        java.util.List<com.billbull.backend.inventory.product.ProductBarcode> barcodes = barcodeRepo.findByProductId(p.getId());
        item.setBarcode(!barcodes.isEmpty() ? barcodes.get(0).getBarcode() : null);

        // Fetch primary image
        mediaRepo.findByProductIdAndIsPrimaryTrue(p.getId()).ifPresent(m -> item.setImage(m.getImageUrl()));

        // Apply the bin assignment up front so systemQty is computed for the right
        // scope (per-bin if assigned, else warehouse-wide).
        if (binId != null) {
            Bin bin = binRepo.findByIdEager(binId)
                    .orElseThrow(() -> new RuntimeException("Bin not found: " + binId));
            item.setBinId(bin.getId());
            item.setBinCode(bin.getCode());
            item.setLocatorId(bin.getLocator().getId());
            item.setZoneId(bin.getLocator().getZone().getId());
            BigDecimal binStock = stockMovementRepo.getStockByBin(session.getWarehouseId(), p.getId(), bin.getId());
            item.setSystemQty(binStock != null ? binStock.intValue() : 0);
        } else {
            // Use raw on-hand (sum of stock movements) for stock take — NOT "available" which subtracts reservations.
            // A physical stock count should reflect all units present, including reserved ones.
            BigDecimal available = stockMovementRepo.getAvailableStock(session.getWarehouseId(), p.getId());
            item.setSystemQty(available != null ? available.intValue() : 0);
        }

        // Tracked items (batch and/or expiry) start without an initial count —
        // their countedQty is the sum of batch-grid entries.
        Integer effectiveCount = tracked ? null : initialCount;
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

        StockTakeItem saved = itemRepo.save(item);
        if (binId != null && tracked && saved.getBatches().isEmpty()) {
            // Pre-fill batch rows from existing system stock for the assigned bin so
            // the count modal opens with seeded rows the user can adjust.
            seedExistingBatchCounts(saved);
            itemRepo.save(saved);
        }
        return saved;
    }

    private boolean isInventoryCounting(StockTakeSession session) {
        return session != null && session.getType() == StockTakeSession.StockTakeType.INVENTORY_COUNTING;
    }

    private boolean hasExpectedSnapshot(StockTakeSession session) {
        return session != null && expectedUnitRepo.existsBySession(session);
    }

    private void ensureExpectedSnapshot(StockTakeSession session) {
        if (!isInventoryCounting(session) || session.getWarehouseId() == null || hasExpectedSnapshot(session)) {
            return;
        }

        List<Product> products = productRepo.findForStockTakeSnapshot(
                session.getWarehouseId(), session.getCategoryId(), session.getBrandId());
        if (products == null || products.isEmpty()) {
            return;
        }

        Map<Long, Product> productById = products.stream()
                .collect(Collectors.toMap(Product::getId, p -> p));
        List<Long> productIds = new ArrayList<>(productById.keySet());
        if (productIds.isEmpty()) {
            return;
        }

        Map<Long, String> primaryBarcodeByProduct = barcodeRepo.findByProductIdIn(productIds).stream()
                .filter(b -> b.getProduct() != null && b.getBarcode() != null && !b.getBarcode().isBlank())
                .collect(Collectors.toMap(
                        b -> b.getProduct().getId(),
                        ProductBarcode::getBarcode,
                        (a, b) -> a));

        Map<Long, String> imageByProduct = mediaRepo.findByProductIdInAndIsPrimaryTrue(productIds).stream()
                .collect(Collectors.toMap(
                        m -> m.getProduct().getId(),
                        ProductMedia::getImageUrl,
                        (a, b) -> a));

        List<Object[]> rows = stockMovementRepo.findStockTakeSnapshotIdentities(session.getWarehouseId(), productIds);
        if (rows == null || rows.isEmpty()) {
            return;
        }

        Set<Long> binIds = rows.stream()
                .map(row -> row[1])
                .filter(Objects::nonNull)
                .map(value -> ((Number) value).longValue())
                .collect(Collectors.toSet());
        Map<Long, Bin> binsById = binIds.isEmpty()
                ? Map.of()
                : binRepo.findAllById(binIds).stream().collect(Collectors.toMap(Bin::getId, b -> b));

        Map<SnapshotItemKey, StockTakeItem> itemByKey = new LinkedHashMap<>();
        if (session.getItems() != null) {
            for (StockTakeItem existing : session.getItems()) {
                itemByKey.put(new SnapshotItemKey(existing.getProductId(), existing.getBinId()), existing);
            }
        }

        List<StockTakeExpectedUnit> expectedUnits = new ArrayList<>();
        for (Object[] row : rows) {
            Long productId = row[0] != null ? ((Number) row[0]).longValue() : null;
            Product product = productId != null ? productById.get(productId) : null;
            if (product == null) continue;

            String batchNumber = normalizeBarcode(row[4] != null ? row[4].toString() : null);
            if (batchNumber == null) {
                continue;
            }

            int quantity = row[6] != null ? ((Number) row[6]).intValue() : 0;
            if (quantity <= 0) continue;

            Long binId = row[1] != null ? ((Number) row[1]).longValue() : null;
            Long zoneId = row[2] != null ? ((Number) row[2]).longValue() : null;
            Long locatorId = row[3] != null ? ((Number) row[3]).longValue() : null;
            LocalDate expiryDate = (LocalDate) row[5];
            BigDecimal unitCost = row[7] instanceof BigDecimal cost ? cost : null;
            Bin bin = binId != null ? binsById.get(binId) : null;

            SnapshotItemKey key = new SnapshotItemKey(productId, binId);
            StockTakeItem item = itemByKey.computeIfAbsent(key, ignored ->
                    createSnapshotItem(session, product, primaryBarcodeByProduct.get(productId), imageByProduct.get(productId), bin, zoneId, locatorId));
            item.setSystemQty((item.getSystemQty() != null ? item.getSystemQty() : 0) + quantity);

            for (int i = 0; i < quantity; i++) {
                StockTakeExpectedUnit expected = new StockTakeExpectedUnit();
                expected.setSession(session);
                expected.setProductId(product.getId());
                expected.setProductCode(product.getCode());
                expected.setSku(product.getSku() != null ? product.getSku() : product.getCode());
                expected.setProductName(product.getName());
                expected.setProductBarcode(primaryBarcodeByProduct.get(product.getId()));
                expected.setBrand(product.getBrand() != null ? product.getBrand().getName() : "Generic");
                expected.setCategory(resolveProductCategoryName(product));
                expected.setImage(imageByProduct.get(product.getId()));
                expected.setWarehouseId(session.getWarehouseId());
                expected.setExpectedBinId(binId);
                expected.setExpectedBinCode(bin != null ? bin.getCode() : null);
                expected.setExpectedZoneId(bin != null ? bin.getLocator().getZone().getId() : zoneId);
                expected.setExpectedLocatorId(bin != null ? bin.getLocator().getId() : locatorId);
                expected.setUnitBarcode(batchNumber);
                expected.setBatchNumber(batchNumber);
                expected.setExpiryDate(expiryDate);
                expected.setUnitCost(unitCost);
                expectedUnits.add(expected);
            }
        }

        if (!itemByKey.isEmpty()) {
            itemRepo.saveAll(itemByKey.values());
            if (session.getItems() != null) {
                for (StockTakeItem item : itemByKey.values()) {
                    if (item.getId() == null || session.getItems().stream().noneMatch(i -> Objects.equals(i.getId(), item.getId()))) {
                        session.getItems().add(item);
                    }
                }
            }
        }
        if (!expectedUnits.isEmpty()) {
            expectedUnitRepo.saveAll(expectedUnits);
        }
        syncSnapshotItemCounts(session);
    }

    private StockTakeItem createSnapshotItem(
            StockTakeSession session,
            Product product,
            String productBarcode,
            String image,
            Bin bin,
            Long zoneId,
            Long locatorId) {
        StockTakeItem item = new StockTakeItem();
        item.setSession(session);
        item.setProductId(product.getId());
        item.setProductName(product.getName());
        item.setSku(product.getCode());
        item.setBarcode(productBarcode);
        item.setBrand(product.getBrand() != null ? product.getBrand().getName() : "Generic");
        item.setCategory(resolveProductCategoryName(product));
        item.setDescription(product.getShortDesc() != null ? product.getShortDesc() : product.getName());
        item.setImage(image);
        item.setPrice(product.getPricing() != null ? product.getPricing().getRetailPrice() : BigDecimal.ZERO);
        item.setBatchEnabled(product.isBatch());
        item.setExpiryEnabled(product.isExpiryEnabled());
        item.setSystemQty(0);
        item.setCountedQty(0);
        item.setVariance(0);
        item.setVarianceValue(BigDecimal.ZERO);
        item.setStatus(StockTakeItem.ItemStatus.PENDING);
        if (bin != null) {
            item.setBinId(bin.getId());
            item.setBinCode(bin.getCode());
            item.setLocatorId(bin.getLocator().getId());
            item.setZoneId(bin.getLocator().getZone().getId());
        } else {
            item.setZoneId(zoneId);
            item.setLocatorId(locatorId);
        }
        return item;
    }

    private String resolveProductCategoryName(Product product) {
        if (product == null) return "Uncategorized";
        if (product.getCategory() != null && !product.getCategory().isBlank()) {
            return product.getCategory();
        }
        return product.getDepartment() != null ? product.getDepartment().getName() : "Uncategorized";
    }

    private void syncSnapshotItemCounts(StockTakeSession session) {
        if (session == null || session.getItems() == null || !hasExpectedSnapshot(session)) {
            return;
        }

        Map<SnapshotItemKey, int[]> totals = new HashMap<>();
        for (StockTakeExpectedUnit expected : expectedUnitRepo.findBySession(session)) {
            SnapshotItemKey key = new SnapshotItemKey(expected.getProductId(), expected.getExpectedBinId());
            int[] counts = totals.computeIfAbsent(key, ignored -> new int[2]);
            counts[0]++;
            if (expected.isScanned()) counts[1]++;
        }

        boolean changed = false;
        for (StockTakeItem item : session.getItems()) {
            int[] counts = totals.get(new SnapshotItemKey(item.getProductId(), item.getBinId()));
            if (counts == null) continue;
            int expectedQty = counts[0];
            int scannedQty = counts[1];
            item.setSystemQty(expectedQty);
            item.setCountedQty(scannedQty);
            item.setVariance(scannedQty - expectedQty);
            item.setVarianceValue(item.getPrice() != null
                    ? item.getPrice().multiply(BigDecimal.valueOf(item.getVariance()))
                    : BigDecimal.ZERO);
            if (item.getVariance() == 0 && expectedQty > 0) {
                item.setStatus(StockTakeItem.ItemStatus.MATCHED);
            } else if (scannedQty == 0) {
                item.setStatus(StockTakeItem.ItemStatus.PENDING);
            } else {
                item.setStatus(StockTakeItem.ItemStatus.VARIANCE);
            }
            changed = true;
        }

        if (changed) {
            itemRepo.saveAll(session.getItems());
        }
    }

    private Bin requireSessionBin(StockTakeSession session, Long binId) {
        if (binId == null) {
            throw new IllegalArgumentException("Select a bin before scanning unit barcodes");
        }
        Bin bin = binRepo.findByIdEager(binId)
                .orElseThrow(() -> new RuntimeException("Bin not found: " + binId));
        Long warehouseId = bin.getLocator().getZone().getWarehouse().getId();
        if (!Objects.equals(warehouseId, session.getWarehouseId())) {
            throw new IllegalArgumentException("Selected bin does not belong to this stock-take warehouse");
        }
        return bin;
    }

    private void copyExpectedUnitToScan(StockTakeExpectedUnit unit, StockTakeUnitScan scan) {
        scan.setProductId(unit.getProductId());
        scan.setProductCode(unit.getProductCode());
        scan.setProductName(unit.getProductName());
        scan.setBatchNumber(unit.getBatchNumber());
        scan.setExpiryDate(unit.getExpiryDate());
        scan.setExpectedBinId(unit.getExpectedBinId());
        scan.setExpectedBinCode(unit.getExpectedBinCode());
    }

    private void applyScannedBin(StockTakeUnitScan scan, Bin bin) {
        scan.setScannedBinId(bin.getId());
        scan.setScannedBinCode(bin.getCode());
        scan.setScannedLocatorId(bin.getLocator().getId());
        scan.setScannedZoneId(bin.getLocator().getZone().getId());
    }

    private void hydrateUnknownScanProduct(StockTakeUnitScan scan, String barcode) {
        Optional<Product> product = barcodeRepo.findFirstByBarcode(barcode)
                .map(ProductBarcode::getProduct);

        if (product.isEmpty()) {
            String lotPrefix = BatchNumberGenerator.stripUnitIndex(barcode);
            if (lotPrefix != null) {
                String[] parts = lotPrefix.split("-");
                if (parts.length >= 4) {
                    product = productRepo.findByCodeAndIsActiveTrue(parts[3]);
                }
            }
        }

        product.ifPresent(p -> {
            scan.setProductId(p.getId());
            scan.setProductCode(p.getCode());
            scan.setProductName(p.getName());
        });
    }

    private StockTakeCoverageResponse buildCoverageResponse(StockTakeSession session) {
        StockTakeCoverageResponse response = new StockTakeCoverageResponse();
        if (session == null || !hasExpectedSnapshot(session)) {
            return response;
        }

        Map<Long, StockTakeCoverageResponse.ProductCoverage> productCoverage = new LinkedHashMap<>();
        List<StockTakeExpectedUnit> expectedUnits = expectedUnitRepo.findBySession(session);
        for (StockTakeExpectedUnit expected : expectedUnits) {
            StockTakeCoverageResponse.ProductCoverage coverage =
                    productCoverage.computeIfAbsent(expected.getProductId(), id -> productCoverageFromExpected(expected));
            coverage.setExpectedQty(coverage.getExpectedQty() + 1);
            response.setExpectedUnits(response.getExpectedUnits() + 1);

            if (expected.isScanned()) {
                coverage.setScannedQty(coverage.getScannedQty() + 1);
                response.setScannedUnits(response.getScannedUnits() + 1);
                if (expected.isWrongBin()) {
                    coverage.setWrongBinQty(coverage.getWrongBinQty() + 1);
                    coverage.getWrongBinScans().add(unitSummaryFromExpected(expected));
                    response.setWrongBinUnits(response.getWrongBinUnits() + 1);
                }
            } else {
                coverage.setMissingQty(coverage.getMissingQty() + 1);
                coverage.getMissingBarcodes().add(expected.getUnitBarcode());
                response.setMissingUnits(response.getMissingUnits() + 1);
            }
        }

        List<StockTakeUnitScan> scans = unitScanRepo.findBySessionOrderByCreatedAtDesc(session);
        for (StockTakeUnitScan scan : scans) {
            StockTakeCoverageResponse.UnitScanSummary summary = unitSummaryFromScan(scan);
            if (response.getRecentScans().size() < 10) {
                response.getRecentScans().add(summary);
            }
            if (scan.getStatus() == StockTakeUnitScanStatus.DUPLICATE
                    || scan.getStatus() == StockTakeUnitScanStatus.ALREADY_COUNTED) {
                response.setDuplicateScans(response.getDuplicateScans() + 1);
                if (scan.getProductId() != null) {
                    StockTakeCoverageResponse.ProductCoverage coverage =
                            productCoverage.computeIfAbsent(scan.getProductId(), id -> productCoverageFromScan(scan));
                    coverage.setDuplicateQty(coverage.getDuplicateQty() + 1);
                    coverage.getDuplicateScans().add(summary);
                }
            } else if (scan.getStatus() == StockTakeUnitScanStatus.UNKNOWN
                    && scan.getResolution() == StockTakeUnknownScanResolution.PENDING) {
                response.setUnexpectedScans(response.getUnexpectedScans() + 1);
                response.getUnknownScans().add(summary);
            }
        }

        List<StockTakeCoverageResponse.ProductCoverage> products = productCoverage.values().stream()
                .sorted(Comparator
                        .comparing((StockTakeCoverageResponse.ProductCoverage p) -> p.getMissingQty() == null ? 0 : p.getMissingQty())
                        .reversed()
                        .thenComparing(p -> p.getProductName() == null ? "" : p.getProductName()))
                .toList();
        response.setProducts(products);
        response.setMissedProducts(products.stream()
                .filter(p -> p.getExpectedQty() != null && p.getExpectedQty() > 0
                        && (p.getScannedQty() == null || p.getScannedQty() == 0))
                .toList());
        return response;
    }

    private StockTakeCoverageResponse.ProductCoverage productCoverageFromExpected(StockTakeExpectedUnit expected) {
        StockTakeCoverageResponse.ProductCoverage coverage = new StockTakeCoverageResponse.ProductCoverage();
        coverage.setProductId(expected.getProductId());
        coverage.setProductCode(expected.getProductCode());
        coverage.setSku(expected.getSku());
        coverage.setProductName(expected.getProductName());
        coverage.setBrand(expected.getBrand());
        coverage.setCategory(expected.getCategory());
        coverage.setImage(expected.getImage());
        return coverage;
    }

    private StockTakeCoverageResponse.ProductCoverage productCoverageFromScan(StockTakeUnitScan scan) {
        StockTakeCoverageResponse.ProductCoverage coverage = new StockTakeCoverageResponse.ProductCoverage();
        coverage.setProductId(scan.getProductId());
        coverage.setProductCode(scan.getProductCode());
        coverage.setSku(scan.getProductCode());
        coverage.setProductName(scan.getProductName());
        return coverage;
    }

    private StockTakeCoverageResponse.UnitScanSummary unitSummaryFromExpected(StockTakeExpectedUnit expected) {
        StockTakeCoverageResponse.UnitScanSummary summary = new StockTakeCoverageResponse.UnitScanSummary();
        summary.setBarcode(expected.getUnitBarcode());
        summary.setStatus(expected.isWrongBin() ? StockTakeUnitScanStatus.WRONG_BIN : StockTakeUnitScanStatus.COUNTED);
        summary.setProductId(expected.getProductId());
        summary.setProductCode(expected.getProductCode());
        summary.setProductName(expected.getProductName());
        summary.setBatchNumber(expected.getBatchNumber());
        summary.setExpiryDate(expected.getExpiryDate());
        summary.setExpectedBinId(expected.getExpectedBinId());
        summary.setExpectedBinCode(expected.getExpectedBinCode());
        summary.setScannedBinId(expected.getActualBinId());
        summary.setScannedBinCode(expected.getActualBinCode());
        summary.setScannedAt(expected.getScannedAt());
        summary.setMessage(expected.isWrongBin() ? "Unit counted in a different bin" : "Unit counted");
        return summary;
    }

    private StockTakeCoverageResponse.UnitScanSummary unitSummaryFromScan(StockTakeUnitScan scan) {
        StockTakeCoverageResponse.UnitScanSummary summary = new StockTakeCoverageResponse.UnitScanSummary();
        summary.setId(scan.getId());
        summary.setBarcode(scan.getScannedBarcode());
        summary.setStatus(scan.getStatus());
        summary.setResolution(scan.getResolution());
        summary.setProductId(scan.getProductId());
        summary.setProductCode(scan.getProductCode());
        summary.setProductName(scan.getProductName());
        summary.setBatchNumber(scan.getBatchNumber());
        summary.setExpiryDate(scan.getExpiryDate());
        summary.setExpectedBinId(scan.getExpectedBinId());
        summary.setExpectedBinCode(scan.getExpectedBinCode());
        summary.setScannedBinId(scan.getScannedBinId());
        summary.setScannedBinCode(scan.getScannedBinCode());
        summary.setScannedAt(scan.getCreatedAt());
        summary.setMessage(scan.getMessage());
        return summary;
    }

    private String normalizeBarcode(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    // === Batch operations ===

    public List<StockTakeItemBatch> addBatch(Long itemId, String batchNumber, java.time.LocalDate expiryDate, Integer quantity) {
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

        // The "lot prefix" is what every unit in this batch shares; the trailing
        // "-{unitIndex}" is what makes each unit_row's batch_number unique.
        String lotPrefix = batchNumber != null && !batchNumber.trim().isEmpty()
                ? batchNumber.trim()
                : nextAutoLotPrefix(item);

        List<StockTakeItemBatch> saved = new ArrayList<>(quantity);
        for (int unitIndex = 1; unitIndex <= quantity; unitIndex++) {
            String unitBatchNumber = lotPrefix + "-" + unitIndex;
            if (batchRepo.existsIdentity(itemId, unitBatchNumber, expiryDate, null)) {
                throw new IllegalStateException("Batch and expiry already exists for this item: " + unitBatchNumber);
            }
            StockTakeItemBatch batch = new StockTakeItemBatch();
            batch.setItem(item);
            batch.setBatchNumber(unitBatchNumber);
            batch.setExpiryDate(expiryDate);
            batch.setQuantity(1);
            item.getBatches().add(batch);
            saved.add(batchRepo.save(batch));
        }

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

    /**
     * Update every per-unit row that belongs to a single lot in one call. Used by the
     * BatchEditor when the user edits the batch number, expiry, or quantity on a logical
     * lot whose underlying storage is N unit rows.
     *
     * lotPrefix matches StockTakeLotGroup.batchNumber (the trailing "-{unitIndex}" stripped
     * for new-format rows; the full string for legacy rows).
     */
    public List<StockTakeItemBatch> updateLot(Long itemId,
                                              String lotPrefix,
                                              java.time.LocalDate matchExpiry,
                                              boolean seeded,
                                              String newBatchNumber,
                                              java.time.LocalDate newExpiryDate,
                                              Integer newQuantity) {
        StockTakeItem item = itemRepo.findById(itemId)
                .orElseThrow(() -> new RuntimeException("Item not found"));
        if (item.getSession().getStatus() != StockTakeSession.StockTakeStatus.IN_PROGRESS) {
            throw new IllegalStateException("Session is not in progress");
        }
        if (newQuantity != null && newQuantity <= 0) {
            throw new IllegalArgumentException("Quantity must be positive");
        }
        if (item.isExpiryEnabled() && newExpiryDate == null && matchExpiry == null) {
            throw new IllegalArgumentException("Expiry date is required for this item");
        }

        List<StockTakeItemBatch> rows = matchLot(item, lotPrefix, matchExpiry, seeded);
        if (rows.isEmpty()) {
            throw new IllegalStateException("Lot not found: " + lotPrefix);
        }
        // Sort by parsed unit index ascending (legacy rows fall to the end as 0).
        rows.sort(Comparator.comparingInt(b -> BatchNumberGenerator.parseUnitIndex(b.getBatchNumber()).orElse(0)));

        java.time.LocalDate effectiveExpiry = newExpiryDate != null ? newExpiryDate : matchExpiry;
        String effectivePrefix = (newBatchNumber != null && !newBatchNumber.trim().isEmpty())
                ? newBatchNumber.trim()
                : lotPrefix;

        // Apply the prefix/expiry rename to every existing row first.
        for (StockTakeItemBatch b : rows) {
            String renamed;
            if (effectivePrefix.equals(lotPrefix)) {
                renamed = b.getBatchNumber();
            } else {
                int unitIdx = BatchNumberGenerator.parseUnitIndex(b.getBatchNumber()).orElse(0);
                // For new-format rows we substitute the prefix; for legacy rows we replace
                // the whole batch_number with the user-supplied value (single row only).
                renamed = unitIdx > 0 ? (effectivePrefix + "-" + unitIdx) : effectivePrefix;
            }
            if (!Objects.equals(renamed, b.getBatchNumber())
                    && batchRepo.existsIdentity(item.getId(), renamed, effectiveExpiry, b.getId())) {
                throw new IllegalStateException("Batch and expiry already exists for this item: " + renamed);
            }
            b.setBatchNumber(renamed);
            if (newExpiryDate != null) b.setExpiryDate(newExpiryDate);
            batchRepo.save(b);
        }

        // Sync row count to the requested quantity. Only valid for new-format lots: legacy
        // single-row lots keep their integer quantity column and skip this branch.
        boolean newFormat = BatchNumberGenerator.parseUnitIndex(rows.get(0).getBatchNumber()).isPresent();
        if (newQuantity != null && newFormat) {
            int current = rows.size();
            if (newQuantity > current) {
                int maxUnitIdx = rows.stream()
                        .mapToInt(b -> BatchNumberGenerator.parseUnitIndex(b.getBatchNumber()).orElse(0))
                        .max().orElse(0);
                for (int i = 0; i < newQuantity - current; i++) {
                    int unitIdx = maxUnitIdx + 1 + i;
                    String unitBatchNumber = effectivePrefix + "-" + unitIdx;
                    if (batchRepo.existsIdentity(item.getId(), unitBatchNumber, effectiveExpiry, null)) continue;
                    StockTakeItemBatch added = new StockTakeItemBatch();
                    added.setItem(item);
                    added.setBatchNumber(unitBatchNumber);
                    added.setExpiryDate(effectiveExpiry);
                    added.setQuantity(1);
                    added.setSeeded(seeded);
                    item.getBatches().add(added);
                    batchRepo.save(added);
                }
            } else if (newQuantity < current) {
                // Drop rows from the highest unit index downward.
                List<StockTakeItemBatch> toDrop = rows.subList(newQuantity, current);
                for (StockTakeItemBatch b : toDrop) {
                    item.getBatches().removeIf(x -> Objects.equals(x.getId(), b.getId()));
                }
            }
        } else if (newQuantity != null) {
            // Legacy single-row path: store the new qty directly on the one row.
            StockTakeItemBatch only = rows.get(0);
            only.setQuantity(newQuantity);
            batchRepo.save(only);
        }

        recomputeFromBatches(item);
        itemRepo.save(item);
        return matchLot(item, effectivePrefix, effectiveExpiry, seeded);
    }

    public void deleteLot(Long itemId, String lotPrefix, java.time.LocalDate matchExpiry, boolean seeded) {
        StockTakeItem item = itemRepo.findById(itemId)
                .orElseThrow(() -> new RuntimeException("Item not found"));
        if (item.getSession().getStatus() != StockTakeSession.StockTakeStatus.IN_PROGRESS) {
            throw new IllegalStateException("Session is not in progress");
        }
        List<StockTakeItemBatch> rows = matchLot(item, lotPrefix, matchExpiry, seeded);
        for (StockTakeItemBatch b : rows) {
            item.getBatches().removeIf(x -> Objects.equals(x.getId(), b.getId()));
        }
        recomputeFromBatches(item);
        itemRepo.save(item);
    }

    private List<StockTakeItemBatch> matchLot(StockTakeItem item,
                                              String lotPrefix,
                                              java.time.LocalDate matchExpiry,
                                              boolean seeded) {
        List<StockTakeItemBatch> rows = new ArrayList<>();
        if (lotPrefix == null || item.getBatches() == null) return rows;
        String normalized = lotPrefix.trim();
        for (StockTakeItemBatch b : item.getBatches()) {
            if (b.isSeeded() != seeded) continue;
            if (!Objects.equals(b.getExpiryDate(), matchExpiry)) continue;
            String parsedPrefix = BatchNumberGenerator.stripUnitIndex(b.getBatchNumber());
            String key = parsedPrefix != null ? parsedPrefix : b.getBatchNumber();
            if (Objects.equals(key, normalized)) rows.add(b);
        }
        return rows;
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
        return nextAutoLotPrefix(item);
    }

    /**
     * Builds the lot prefix for the next logical batch the user is about to add to this item.
     * Every unit row created from that batch will share this prefix and only differ in the
     * trailing "-{unitIndex}" segment.
     */
    private String nextAutoLotPrefix(StockTakeItem item) {
        // Opening Inventory sessions emit OS-prefixed batch numbers; regular counts emit ST.
        StockIdentifier identifier =
                item.getSession().getType() == StockTakeSession.StockTakeType.OPENING_INVENTORY
                        ? StockIdentifier.OS
                        : StockIdentifier.ST;

        Product product = productRepo.findById(item.getProductId()).orElse(null);
        String itemCode = product != null ? product.getCode() : ("P" + item.getProductId());

        int lotIndex = nextLotIndexFor(item);
        java.time.LocalDate today = java.time.LocalDate.now();
        String prefix = BatchNumberGenerator.lotPrefix(identifier, today, lotIndex, itemCode);

        // Defensive: ensure no existing row already starts with this prefix (would happen if
        // a previous attempt aborted mid-write). Bump until clean.
        while (anyBatchStartsWith(item, prefix + "-")) {
            lotIndex++;
            prefix = BatchNumberGenerator.lotPrefix(identifier, today, lotIndex, itemCode);
        }
        return prefix;
    }

    /** Highest lot index already in use on this item + 1; 1 if no new-format rows exist. */
    private int nextLotIndexFor(StockTakeItem item) {
        if (item.getBatches() == null || item.getBatches().isEmpty()) return 1;
        int max = 0;
        for (StockTakeItemBatch b : item.getBatches()) {
            int parsed = BatchNumberGenerator.parseLotIndex(b.getBatchNumber()).orElse(0);
            if (parsed > max) max = parsed;
        }
        return max + 1;
    }

    private boolean anyBatchStartsWith(StockTakeItem item, String prefix) {
        if (item.getBatches() == null) return false;
        for (StockTakeItemBatch b : item.getBatches()) {
            if (b.getBatchNumber() != null && b.getBatchNumber().startsWith(prefix)) return true;
        }
        return false;
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

        for (Object[] row : rows) {
            int qty = row[2] != null ? ((Number) row[2]).intValue() : 0;
            if (qty <= 0) continue;

            String sourceBatchNumber = row[0] != null && !row[0].toString().isBlank()
                    ? row[0].toString()
                    : null;
            LocalDate expiryDate = (LocalDate) row[1];

            if (sourceBatchNumber != null) {
                // Existing system stock with a known identifier: seed it as one row whose
                // quantity matches the on-hand qty. Whether the source string is in legacy
                // form (W6-BIN01-...) or new per-unit form (...-L01-...-3), each
                // (batch_number, expiry) row in stock_movements maps to a single
                // StockTakeItemBatch row — preserving traceability.
                if (batchRepo.existsIdentity(item.getId(), sourceBatchNumber, expiryDate, null)) {
                    continue;
                }
                StockTakeItemBatch batch = new StockTakeItemBatch();
                batch.setItem(item);
                batch.setBatchNumber(sourceBatchNumber);
                batch.setExpiryDate(expiryDate);
                batch.setQuantity(qty);
                batch.setSeeded(true);
                item.getBatches().add(batch);
                batchRepo.save(batch);
            } else {
                // Stock exists for this product/bin but no batch identifier was recorded.
                // Mint a fresh lot of qty unit-rows so each on-hand unit becomes individually
                // identifiable for this stock-take.
                String lotPrefix = nextAutoLotPrefix(item);
                for (int unitIndex = 1; unitIndex <= qty; unitIndex++) {
                    String unitBatchNumber = lotPrefix + "-" + unitIndex;
                    if (batchRepo.existsIdentity(item.getId(), unitBatchNumber, expiryDate, null)) continue;
                    StockTakeItemBatch batch = new StockTakeItemBatch();
                    batch.setItem(item);
                    batch.setBatchNumber(unitBatchNumber);
                    batch.setExpiryDate(expiryDate);
                    batch.setQuantity(1);
                    batch.setSeeded(true);
                    item.getBatches().add(batch);
                    batchRepo.save(batch);
                }
            }
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

    private StockTakeSession approveSnapshotSession(StockTakeSession session, String approvedBy) {
        if (unitScanRepo.existsBySessionAndStatusAndResolution(
                session,
                StockTakeUnitScanStatus.UNKNOWN,
                StockTakeUnknownScanResolution.PENDING)) {
            throw new IllegalStateException("Review unexpected scans before approving this stock take");
        }

        for (StockTakeExpectedUnit expected : expectedUnitRepo.findBySession(session)) {
            if (!expected.isScanned()) {
                postSnapshotAdjustment(
                        session,
                        expected.getProductId(),
                        -1,
                        expected.getExpectedBinId(),
                        expected.getExpectedZoneId(),
                        expected.getExpectedLocatorId(),
                        expected.getBatchNumber(),
                        expected.getExpiryDate(),
                        null,
                        expectedUnitAdjustmentSourceId(expected.getId(), 1));
            } else if (expected.isWrongBin()) {
                postSnapshotAdjustment(
                        session,
                        expected.getProductId(),
                        -1,
                        expected.getExpectedBinId(),
                        expected.getExpectedZoneId(),
                        expected.getExpectedLocatorId(),
                        expected.getBatchNumber(),
                        expected.getExpiryDate(),
                        null,
                        expectedUnitAdjustmentSourceId(expected.getId(), 2));
                postSnapshotAdjustment(
                        session,
                        expected.getProductId(),
                        1,
                        expected.getActualBinId(),
                        expected.getActualZoneId(),
                        expected.getActualLocatorId(),
                        expected.getBatchNumber(),
                        expected.getExpiryDate(),
                        expected.getUnitCost(),
                        expectedUnitAdjustmentSourceId(expected.getId(), 3));
            }
        }

        for (StockTakeUnitScan scan : unitScanRepo.findBySessionOrderByCreatedAtDesc(session)) {
            if (scan.getStatus() != StockTakeUnitScanStatus.UNKNOWN
                    || scan.getResolution() != StockTakeUnknownScanResolution.ACCEPTED_AS_FOUND) {
                continue;
            }
            if (scan.getProductId() == null) {
                throw new IllegalStateException("Accepted found stock scan is missing a product: " + scan.getScannedBarcode());
            }
            postSnapshotAdjustment(
                    session,
                    scan.getProductId(),
                    1,
                    scan.getScannedBinId(),
                    scan.getScannedZoneId(),
                    scan.getScannedLocatorId(),
                    scan.getBatchNumber(),
                    scan.getExpiryDate(),
                    resolveAdjustmentUnitCost(scan.getProductId()),
                    unknownScanAdjustmentSourceId(scan.getId()));
        }

        syncSnapshotItemCounts(session);
        session.setStatus(StockTakeSession.StockTakeStatus.COMPLETED);
        session.setReconciledBy(approvedBy);
        session.setReconciledAt(LocalDateTime.now());
        return sessionRepo.save(session);
    }

    private void postSnapshotAdjustment(
            StockTakeSession session,
            Long productId,
            int quantity,
            Long binId,
            Long zoneId,
            Long locatorId,
            String batchNumber,
            LocalDate expiryDate,
            BigDecimal unitCost,
            Long sourceId) {
        if (productId == null || quantity == 0 || sourceId == null) {
            return;
        }
        boolean alreadyPosted = stockMovementRepo.existsBySourceTypeAndSourceIdAndProductId(
                StockSourceType.STOCK_TAKE_ADJUSTMENT,
                sourceId,
                productId);
        if (alreadyPosted) {
            return;
        }
        if (quantity > 0 && binId != null) {
            binStockService.validateBinCapacity(binId, quantity);
        }

        StockMovement movement = new StockMovement();
        movement.setSourceType(StockSourceType.STOCK_TAKE_ADJUSTMENT);
        movement.setSourceId(sourceId);
        movement.setProductId(productId);
        movement.setWarehouseId(session.getWarehouseId());
        movement.setQuantity(quantity);
        movement.setReferenceNo(session.getSessionId());
        movement.setMovementDate(LocalDate.now());
        movement.setBinId(binId);
        movement.setZoneId(zoneId);
        movement.setLocatorId(locatorId);
        movement.setBatchNumber(batchNumber);
        movement.setExpiryDate(expiryDate);
        if (quantity > 0) {
            movement.setUnitCost(unitCost != null ? unitCost : resolveAdjustmentUnitCost(productId));
        }

        stockMovementRepo.save(movement);
    }

    private BigDecimal resolveAdjustmentUnitCost(Long productId) {
        if (productId == null) return null;
        return productRepo.findById(productId)
                .map(Product::getPricing)
                .map(ProductPricing::getCost)
                .filter(cost -> cost.compareTo(BigDecimal.ZERO) > 0)
                .orElse(null);
    }

    private long expectedUnitAdjustmentSourceId(Long expectedUnitId, int sequence) {
        long base = expectedUnitId != null ? expectedUnitId : 0L;
        return 1_000_000_000L + (base * 10L) + sequence;
    }

    private long unknownScanAdjustmentSourceId(Long scanId) {
        long base = scanId != null ? scanId : 0L;
        return 2_000_000_000L + base;
    }

    private static final class SnapshotItemKey {
        private final Long productId;
        private final Long binId;

        private SnapshotItemKey(Long productId, Long binId) {
            this.productId = productId;
            this.binId = binId;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof SnapshotItemKey that)) return false;
            return Objects.equals(productId, that.productId)
                    && Objects.equals(binId, that.binId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(productId, binId);
        }
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
                // Prefer matching by itemId; otherwise SKU disambiguated by binId when present.
                // Without binId disambiguation, multiple items with the same SKU (same product
                // in different bins) would all collapse to whichever match findFirst returned.
                .filter(i -> update.getItemId() != null
                        ? Objects.equals(i.getId(), update.getItemId())
                        : (update.getSku() != null && update.getSku().equalsIgnoreCase(i.getSku())
                                && (update.getBinId() == null || Objects.equals(i.getBinId(), update.getBinId()))))
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
