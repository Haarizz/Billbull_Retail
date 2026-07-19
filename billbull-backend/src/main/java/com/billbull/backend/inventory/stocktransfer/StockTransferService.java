package com.billbull.backend.inventory.stocktransfer;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductPricing;
import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.BinRepository;
import com.billbull.backend.inventory.warehouse.LocatorRepository;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.inventory.warehouse.WarehouseStockService;
import com.billbull.backend.inventory.warehouse.ZoneRepository;
import com.billbull.backend.purchase.stockmovement.StockMovement;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.purchase.stockmovement.StockSourceType;
import com.billbull.backend.util.DocumentOrderingUtil;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

@Service
@Transactional
public class StockTransferService {

    private static final BigDecimal ZERO = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);

    private final StockTransferRepository repository;
    private final ProductRepository productRepository;
    private final ProductPricingRepository productPricingRepository;
    private final WarehouseRepository warehouseRepository;
    private final ZoneRepository zoneRepository;
    private final LocatorRepository locatorRepository;
    private final BinRepository binRepository;
    private final StockMovementRepository stockMovementRepository;
    private final WarehouseStockService warehouseStockService;
    private final PostingEngineService postingEngineService;
    // Branch-Level Inventory Phase 2: the single branch-stamping mechanism. Transfer legs are
    // constructed here (buildStockMovement) rather than via StockMovementService, so we stamp
    // each leg through the shared stampBranch(...) — each leg's branch = its own warehouse's
    // branch (OUT at source branch, IN at destination branch), keeping on-hand arithmetic correct.
    private final com.billbull.backend.purchase.stockmovement.StockMovementService stockMovementService;
    // Branch-Level Inventory Phase 8 — Option A "Split Authority" (design §17). Source access for
    // create/edit/send; destination access for receive; either-endpoint visibility. Dormant while
    // inventory.branch-scope.enabled=false (byte-identical to today's no-branch-auth behaviour).
    private final com.billbull.backend.inventory.scope.InventoryBranchScopeResolver branchScopeResolver;
    private final com.billbull.backend.settings.branch.BranchAccessService branchAccessService;
    private final com.billbull.backend.common.ownership.OwnershipAccessService ownershipAccessService;

    public StockTransferService(
            StockTransferRepository repository,
            ProductRepository productRepository,
            ProductPricingRepository productPricingRepository,
            WarehouseRepository warehouseRepository,
            ZoneRepository zoneRepository,
            LocatorRepository locatorRepository,
            BinRepository binRepository,
            StockMovementRepository stockMovementRepository,
            WarehouseStockService warehouseStockService,
            PostingEngineService postingEngineService,
            com.billbull.backend.purchase.stockmovement.StockMovementService stockMovementService,
            com.billbull.backend.inventory.scope.InventoryBranchScopeResolver branchScopeResolver,
            com.billbull.backend.settings.branch.BranchAccessService branchAccessService,
            com.billbull.backend.common.ownership.OwnershipAccessService ownershipAccessService) {
        this.repository = repository;
        this.productRepository = productRepository;
        this.productPricingRepository = productPricingRepository;
        this.warehouseRepository = warehouseRepository;
        this.zoneRepository = zoneRepository;
        this.locatorRepository = locatorRepository;
        this.binRepository = binRepository;
        this.stockMovementRepository = stockMovementRepository;
        this.warehouseStockService = warehouseStockService;
        this.postingEngineService = postingEngineService;
        this.stockMovementService = stockMovementService;
        this.branchScopeResolver = branchScopeResolver;
        this.branchAccessService = branchAccessService;
        this.ownershipAccessService = ownershipAccessService;
    }

    // ===== Phase 8 — Option A authorization helpers (all toggle-gated; no-op when scoping off). =====

    private static Long branchIdOf(com.billbull.backend.inventory.warehouse.Warehouse w) {
        return (w != null && w.getBranch() != null) ? w.getBranch().getId() : null;
    }

    /** Source-side access (create/edit/request-approval/cancel/send). */
    private void assertSourceAccess(StockTransfer st) {
        if (!branchScopeResolver.shouldScope()) return;
        branchAccessService.assertTransactionBranchAccessible(
                branchIdOf(st.getFromWarehouse()), "Stock transfer source branch");
    }

    /** Destination-side access (receive). */
    private void assertDestAccess(StockTransfer st) {
        if (!branchScopeResolver.shouldScope()) return;
        branchAccessService.assertTransactionBranchAccessible(
                branchIdOf(st.getToWarehouse()), "Stock transfer destination branch");
    }

    /**
     * Destination validation hook (design §17 refinement). A source-branch user must not
     * automatically be able to send to EVERY branch. For now this is a permissive no-op that
     * preserves today's behaviour (any destination allowed); it is the single documented extension
     * point for a future allowed-destination policy / company rule — tightening it here requires NO
     * change to the transfer lifecycle or the Option-A authorization matrix.
     */
    private void assertDestinationAllowed(Long sourceBranchId, Long destBranchId) {
        // Intentionally permissive today. Future: enforce an allowed-destination policy here, e.g.
        //   if (!destinationPolicy.allows(sourceBranchId, destBranchId)) throw 403.
    }

    /** Either-endpoint visibility (list/view): accessible if the user can reach source OR destination. */
    private boolean canViewTransfer(StockTransfer st) {
        Long src = branchIdOf(st.getFromWarehouse());
        Long dst = branchIdOf(st.getToWarehouse());
        return branchAccessService.canAccessTransactionBranch(src)
                || branchAccessService.canAccessTransactionBranch(dst);
    }

    public List<StockTransferResponse> list() {
        List<StockTransfer> transfers = new ArrayList<>(repository.findAll());
        // Phase 8: either-endpoint visibility — a transfer is visible if the user can access its
        // source OR destination branch (admins/All-Branches see all; global/null endpoints always
        // visible). Toggle off → no filtering (byte-identical). Small list → in-memory filter.
        if (branchScopeResolver.shouldScope()) {
            transfers = transfers.stream().filter(this::canViewTransfer)
                    .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        }
        // Ownership (user-based data visibility) — AND on top of branch. No-op when toggle off.
        transfers = new ArrayList<>(ownershipAccessService.filterOwned(transfers, StockTransfer::getCreatedByUserId));
        DocumentOrderingUtil.sortByDocumentNumberAndDateDesc(
                transfers,
                StockTransfer::getTransferDate,
                StockTransfer::getTransferNo,
                StockTransfer::getId);
        return transfers.stream().map(this::toResponse).toList();
    }

    public StockTransferResponse get(Long id) {
        StockTransfer st = getEntity(id);
        // Phase 8: single-record visibility guard — accessible via either endpoint (toggle-gated).
        if (branchScopeResolver.shouldScope() && !canViewTransfer(st)) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.FORBIDDEN,
                    "This stock transfer belongs to branches you cannot access.");
        }
        return toResponse(st);
    }

    public StockTransferCostPreviewResponse getCostPreview(Long warehouseId, List<Long> productIds) {
        if (warehouseId == null) {
            throw new IllegalArgumentException("Warehouse is required to calculate stock transfer cost.");
        }

        List<Long> uniqueProductIds = productIds == null
                ? List.of()
                : new LinkedHashSet<>(productIds.stream().filter(Objects::nonNull).toList()).stream().toList();

        StockTransferCostPreviewResponse response = new StockTransferCostPreviewResponse();
        response.warehouseId = warehouseId;
        response.items = uniqueProductIds.stream().map(productId -> {
            UnitCostResolution resolution = resolveUnitCost(productId, warehouseId);
            StockTransferCostPreviewResponse.StockTransferCostItemResponse item =
                    new StockTransferCostPreviewResponse.StockTransferCostItemResponse();
            item.productId = productId;
            item.unitCost = resolution.unitCost;
            item.costSource = resolution.source;
            item.costAvailable = resolution.unitCost != null && resolution.unitCost.compareTo(BigDecimal.ZERO) > 0;
            return item;
        }).toList();
        return response;
    }

    public StockTransferResponse create(StockTransferRequest req) {
        StockTransfer st = new StockTransfer();
        mapToEntity(req, st);
        // Phase 8 (Option A): creating a transfer requires source-branch access; validate destination.
        assertSourceAccess(st);
        assertDestinationAllowed(branchIdOf(st.getFromWarehouse()), branchIdOf(st.getToWarehouse()));
        return toResponse(repository.save(st));
    }

    public StockTransferResponse update(Long id, StockTransferRequest req) {
        StockTransfer st = getEntity(id);
        if (st.getStatus() != StockTransferStatus.DRAFT) {
            throw new IllegalStateException("Only DRAFT transfers can be modified");
        }
        assertSourceAccess(st); // Phase 8: editing a DRAFT requires source-branch access.
        st.getItems().clear();
        mapToEntity(req, st);
        assertDestinationAllowed(branchIdOf(st.getFromWarehouse()), branchIdOf(st.getToWarehouse()));
        return toResponse(repository.save(st));
    }

    public void delete(Long id) {
        StockTransfer st = getEntity(id);
        if (st.getStatus() != StockTransferStatus.DRAFT) {
            throw new IllegalStateException("Only DRAFT transfers can be deleted");
        }
        repository.delete(st);
    }

    public StockTransferResponse requestApproval(Long id) {
        StockTransfer st = getEntity(id);
        if (st.getStatus() != StockTransferStatus.DRAFT) {
            throw new IllegalStateException("Only DRAFT transfers can be submitted for approval");
        }
        assertSourceAccess(st); // Phase 8: source-branch access.
        st.setStatus(StockTransferStatus.PENDING_APPROVAL);
        return toResponse(repository.save(st));
    }

    public StockTransferResponse cancel(Long id) {
        StockTransfer st = getEntity(id);
        if (st.getStatus() != StockTransferStatus.DRAFT && st.getStatus() != StockTransferStatus.PENDING_APPROVAL) {
            throw new IllegalStateException("Only DRAFT or PENDING_APPROVAL transfers can be cancelled");
        }
        assertSourceAccess(st); // Phase 8: source-branch access.
        st.setStatus(StockTransferStatus.CANCELLED);
        return toResponse(repository.save(st));
    }

    @Caching(evict = {
            @CacheEvict(value = "stockAvailability", allEntries = true),
            @CacheEvict(value = "productList", allEntries = true)
    })
    public StockTransferResponse markSent(Long id) {
        StockTransfer st = getEntity(id);
        if (st.getStatus() != StockTransferStatus.DRAFT && st.getStatus() != StockTransferStatus.PENDING_APPROVAL) {
            throw new IllegalStateException("Transfer is either already processed or cancelled");
        }
        // Phase 8 (Option A): SEND is a source-side action → require source-branch access + validate destination.
        assertSourceAccess(st);
        assertDestinationAllowed(branchIdOf(st.getFromWarehouse()), branchIdOf(st.getToWarehouse()));

        freezeItemCostsForSend(st);
        updateTransferTotals(st);

        for (StockTransferItem item : st.getItems()) {
            BigDecimal available = resolveAvailableQty(st.getFromWarehouse().getId(), item);
            if (available.compareTo(BigDecimal.valueOf(item.getQuantity())) < 0) {
                String batchSuffix = item.getBatchNumber() != null ? " (batch " + item.getBatchNumber() + ")" : "";
                throw new IllegalStateException(
                        "Insufficient stock for product " + item.getProduct().getName() + batchSuffix
                        + " — available: " + available.intValue() + ", requested: " + item.getQuantity());
            }

            stockMovementRepository.save(buildStockMovement(
                    StockSourceType.STOCK_TRANSFER_OUT,
                    st,
                    item,
                    st.getFromWarehouse(),
                    st.getFromZone() != null ? st.getFromZone().getId() : null,
                    st.getFromLocator() != null ? st.getFromLocator().getId() : null,
                    st.getFromBin() != null ? st.getFromBin().getId() : null,
                    -item.getQuantity(),
                    item.getUnitCostAtSend()));
        }

        st.setStatus(StockTransferStatus.SENT);
        st.setDispatchDate(LocalDate.now());
        StockTransfer saved = repository.save(st);
        postingEngineService.createJournalFromStockTransferSent(saved);
        return toResponse(saved);
    }

    @Caching(evict = {
            @CacheEvict(value = "stockAvailability", allEntries = true),
            @CacheEvict(value = "productList", allEntries = true)
    })
    public StockTransferResponse markReceived(Long id) {
        StockTransfer st = getEntity(id);
        if (st.getStatus() != StockTransferStatus.SENT) {
            throw new IllegalStateException("Only SENT transfers can be received. Current status: " + st.getStatus());
        }
        // Phase 8 (Option A): RECEIVE is a destination-side action → require destination-branch access.
        assertDestAccess(st);

        if (st.getItems().stream().anyMatch(item -> item.getUnitCostAtSend() == null || item.getLineValue() == null)) {
            freezeItemCostsForSend(st);
        }
        allocateChargesForReceipt(st);
        updateTransferTotals(st);

        for (StockTransferItem item : st.getItems()) {
            BigDecimal receivedLineValue = nvl(item.getLineValue()).add(nvl(item.getAllocatedCharge()));
            BigDecimal receivedUnitCost = item.getQuantity() != null && item.getQuantity() > 0
                    ? receivedLineValue.divide(BigDecimal.valueOf(item.getQuantity()), 4, RoundingMode.HALF_UP)
                    : item.getUnitCostAtSend();

            stockMovementRepository.save(buildStockMovement(
                    StockSourceType.STOCK_TRANSFER_IN,
                    st,
                    item,
                    st.getToWarehouse(),
                    st.getToZone() != null ? st.getToZone().getId() : null,
                    st.getToLocator() != null ? st.getToLocator().getId() : null,
                    st.getToBin() != null ? st.getToBin().getId() : null,
                    item.getQuantity(),
                    receivedUnitCost));

            item.setReceivedQty(item.getQuantity());
        }

        st.setStatus(StockTransferStatus.RECEIVED);
        st.setArrivalDate(LocalDate.now());
        StockTransfer saved = repository.save(st);
        postingEngineService.createJournalFromStockTransferReceived(saved);
        return toResponse(saved);
    }

    private StockTransfer getEntity(Long id) {
        StockTransfer st = repository.findById(id).orElseThrow(() -> new RuntimeException("Stock Transfer not found"));
        ownershipAccessService.assertCanAccessRecord(st.getCreatedByUserId(), "Stock Transfer");
        return st;
    }

    private void mapToEntity(StockTransferRequest req, StockTransfer st) {
        st.setTransferNo(req.transferNo);
        st.setReferenceDoc(req.referenceDoc);
        st.setTransferDate(req.transferDate);
        st.setReason(req.reason);
        st.setRequestedBy(req.requestedBy);
        st.setRemarks(req.remarks);
        st.setTransportMode(req.transportMode);
        st.setVehicleNo(req.vehicleNo);
        st.setDriverName(req.driverName);
        st.setDispatchDate(req.dispatchDate);
        st.setArrivalDate(req.arrivalDate);
        st.setTransportCharge(currency(req.transportCharge));
        st.setAdditionalCharges(currency(req.additionalCharges));

        if (req.fromWarehouseId != null) {
            st.setFromWarehouse(warehouseRepository.findById(req.fromWarehouseId).orElse(null));
        }
        if (req.fromZoneId != null) {
            st.setFromZone(zoneRepository.findById(req.fromZoneId).orElse(null));
        }
        if (req.fromLocatorId != null) {
            st.setFromLocator(locatorRepository.findById(req.fromLocatorId).orElse(null));
        }
        if (req.fromBinId != null) {
            st.setFromBin(binRepository.findById(req.fromBinId).orElse(null));
        }

        if (req.toWarehouseId != null) {
            st.setToWarehouse(warehouseRepository.findById(req.toWarehouseId).orElse(null));
        }
        if (req.toZoneId != null) {
            st.setToZone(zoneRepository.findById(req.toZoneId).orElse(null));
        }
        if (req.toLocatorId != null) {
            st.setToLocator(locatorRepository.findById(req.toLocatorId).orElse(null));
        }
        if (req.toBinId != null) {
            st.setToBin(binRepository.findById(req.toBinId).orElse(null));
        }

        if (req.items != null) {
            for (StockTransferRequest.StockTransferItemRequest i : req.items) {
                Product product = productRepository.findById(i.productId)
                        .orElseThrow(() -> new RuntimeException("Product not found: " + i.productId));

                StockTransferItem item = new StockTransferItem();
                item.setStockTransfer(st);
                item.setProduct(product);
                item.setBatchNumber(i.batchNumber);
                item.setQuantity(i.quantity);
                item.setReceivedQty(0);
                item.setUom(i.uom);
                item.setAllocatedCharge(ZERO);
                st.getItems().add(item);
            }
        }

        updateTransferTotals(st);
    }

    private void freezeItemCostsForSend(StockTransfer st) {
        if (st.getFromWarehouse() == null) {
            throw new IllegalStateException("Source warehouse is required before sending the transfer.");
        }

        for (StockTransferItem item : st.getItems()) {
            if (item.getQuantity() == null || item.getQuantity() <= 0) {
                throw new IllegalStateException("Transfer quantity must be greater than zero for " + item.getProduct().getName());
            }

            UnitCostResolution resolution = resolveUnitCostForBatch(
                    item.getProduct().getId(), st.getFromWarehouse().getId(), item.getBatchNumber());
            if (resolution.unitCost == null || resolution.unitCost.compareTo(BigDecimal.ZERO) <= 0) {
                throw new IllegalStateException(
                        "No source cost available for product " + item.getProduct().getCode()
                                + ". Complete a costed receipt first or set Product Pricing cost.");
            }

            BigDecimal lineValue = resolution.unitCost.multiply(BigDecimal.valueOf(item.getQuantity() != null ? item.getQuantity() : 0));
            item.setUnitCostAtSend(resolution.unitCost);
            item.setLineValue(currency(lineValue));
            item.setAllocatedCharge(ZERO);
        }
    }

    private void allocateChargesForReceipt(StockTransfer st) {
        BigDecimal totalCharges = calculateTotalCharges(st);
        BigDecimal totalInventoryValue = calculateInventoryValue(st.getItems());

        if (totalCharges.compareTo(BigDecimal.ZERO) <= 0) {
            st.getItems().forEach(item -> item.setAllocatedCharge(ZERO));
            return;
        }

        int totalQuantity = st.getItems().stream()
                .map(StockTransferItem::getQuantity)
                .filter(Objects::nonNull)
                .mapToInt(Integer::intValue)
                .sum();

        BigDecimal allocatedSoFar = BigDecimal.ZERO;
        for (int index = 0; index < st.getItems().size(); index++) {
            StockTransferItem item = st.getItems().get(index);
            BigDecimal allocation;

            if (index == st.getItems().size() - 1) {
                allocation = totalCharges.subtract(allocatedSoFar);
            } else if (totalInventoryValue.compareTo(BigDecimal.ZERO) > 0 && item.getLineValue() != null) {
                allocation = totalCharges
                        .multiply(item.getLineValue())
                        .divide(totalInventoryValue, 2, RoundingMode.HALF_UP);
            } else if (totalQuantity > 0 && item.getQuantity() != null && item.getQuantity() > 0) {
                allocation = totalCharges
                        .multiply(BigDecimal.valueOf(item.getQuantity()))
                        .divide(BigDecimal.valueOf(totalQuantity), 2, RoundingMode.HALF_UP);
            } else {
                allocation = ZERO;
            }

            allocation = currency(allocation);
            item.setAllocatedCharge(allocation);
            allocatedSoFar = allocatedSoFar.add(allocation);
        }
    }

    private void updateTransferTotals(StockTransfer st) {
        BigDecimal inventoryValue = calculateInventoryValue(st.getItems());
        BigDecimal totalTransferValue = inventoryValue.add(calculateTotalCharges(st));
        st.setInventoryValue(currency(inventoryValue));
        st.setTotalTransferValue(currency(totalTransferValue));
    }

    private BigDecimal calculateInventoryValue(List<StockTransferItem> items) {
        return currency(items.stream()
                .map(StockTransferItem::getLineValue)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
    }

    private BigDecimal calculateTotalCharges(StockTransfer st) {
        return currency(nvl(st.getTransportCharge()).add(nvl(st.getAdditionalCharges())));
    }

    private BigDecimal resolveAvailableQty(Long warehouseId, StockTransferItem item) {
        String batchNumber = item.getBatchNumber();
        if (batchNumber != null && !batchNumber.isBlank()) {
            BigDecimal batchQty = stockMovementRepository.getOnHandByBatch(
                    item.getProduct().getId(), warehouseId, batchNumber.trim());
            return batchQty != null ? batchQty : BigDecimal.ZERO;
        }
        return warehouseStockService.getAvailableStock(warehouseId, item.getProduct().getId());
    }

    private UnitCostResolution resolveUnitCost(Long productId, Long warehouseId) {
        return resolveUnitCostForBatch(productId, warehouseId, null);
    }

    private UnitCostResolution resolveUnitCostForBatch(Long productId, Long warehouseId, String batchNumber) {
        // Batch-specific WAC takes priority when a batch is specified
        if (batchNumber != null && !batchNumber.isBlank()) {
            BigDecimal batchCost = stockMovementRepository.getWeightedAverageCostByBatch(
                    productId, warehouseId, batchNumber.trim());
            if (batchCost != null && batchCost.compareTo(BigDecimal.ZERO) > 0) {
                return new UnitCostResolution(batchCost.setScale(4, RoundingMode.HALF_UP), "BATCH_WAC");
            }
        }

        BigDecimal weightedAverageCost = stockMovementRepository.getWeightedAverageCost(productId, warehouseId);
        if (weightedAverageCost != null && weightedAverageCost.compareTo(BigDecimal.ZERO) > 0) {
            return new UnitCostResolution(weightedAverageCost.setScale(4, RoundingMode.HALF_UP), "WEIGHTED_AVG");
        }

        BigDecimal productCost = productPricingRepository.findByProductId(productId)
                .map(ProductPricing::getCost)
                .filter(cost -> cost != null && cost.compareTo(BigDecimal.ZERO) > 0)
                .map(cost -> cost.setScale(4, RoundingMode.HALF_UP))
                .orElse(null);

        if (productCost != null) {
            return new UnitCostResolution(productCost, "PRODUCT_COST");
        }

        return new UnitCostResolution(null, "MISSING");
    }

    private StockMovement buildStockMovement(
            StockSourceType sourceType,
            StockTransfer transfer,
            StockTransferItem item,
            Warehouse warehouse,
            Long zoneId,
            Long locatorId,
            Long binId,
            Integer quantity,
            BigDecimal unitCost) {
        StockMovement movement = new StockMovement();
        movement.setSourceType(sourceType);
        movement.setSourceId(transfer.getId());
        movement.setProductId(item.getProduct().getId());
        movement.setWarehouseId(warehouse != null ? warehouse.getId() : null);
        movement.setZoneId(zoneId);
        movement.setLocatorId(locatorId);
        movement.setBinId(binId);
        movement.setQuantity(quantity);
        movement.setMovementDate(LocalDate.now());
        movement.setReferenceNo(transfer.getTransferNo());
        movement.setBatchNumber(item.getBatchNumber());
        movement.setUnitCost(unitCost != null ? unitCost.setScale(4, RoundingMode.HALF_UP) : null);
        stockMovementService.stampBranch(movement); // Phase 2: branch = this leg's warehouse branch
        return movement;
    }

    private StockTransferResponse toResponse(StockTransfer st) {
        StockTransferResponse resp = new StockTransferResponse();
        resp.id = st.getId();
        resp.transferNo = st.getTransferNo();
        resp.referenceDoc = st.getReferenceDoc();
        resp.transferDate = st.getTransferDate();
        resp.reason = st.getReason();
        resp.requestedBy = st.getRequestedBy();
        resp.remarks = st.getRemarks();
        resp.status = st.getStatus();
        resp.transportMode = st.getTransportMode();
        resp.vehicleNo = st.getVehicleNo();
        resp.driverName = st.getDriverName();
        resp.dispatchDate = st.getDispatchDate();
        resp.arrivalDate = st.getArrivalDate();
        resp.transportCharge = currency(st.getTransportCharge());
        resp.additionalCharges = currency(st.getAdditionalCharges());
        resp.inventoryValue = currency(st.getInventoryValue());
        resp.totalTransferValue = currency(st.getTotalTransferValue());

        if (st.getFromWarehouse() != null) {
            resp.fromWarehouseId = st.getFromWarehouse().getId();
            resp.fromWarehouseName = st.getFromWarehouse().getName();
        }
        if (st.getFromZone() != null) {
            resp.fromZoneId = st.getFromZone().getId();
            resp.fromZoneName = st.getFromZone().getName();
        }
        if (st.getFromLocator() != null) {
            resp.fromLocatorId = st.getFromLocator().getId();
            resp.fromLocatorName = st.getFromLocator().getName();
        }
        if (st.getFromBin() != null) {
            resp.fromBinId = st.getFromBin().getId();
            resp.fromBinName = st.getFromBin().getName();
        }

        if (st.getToWarehouse() != null) {
            resp.toWarehouseId = st.getToWarehouse().getId();
            resp.toWarehouseName = st.getToWarehouse().getName();
        }
        if (st.getToZone() != null) {
            resp.toZoneId = st.getToZone().getId();
            resp.toZoneName = st.getToZone().getName();
        }
        if (st.getToLocator() != null) {
            resp.toLocatorId = st.getToLocator().getId();
            resp.toLocatorName = st.getToLocator().getName();
        }
        if (st.getToBin() != null) {
            resp.toBinId = st.getToBin().getId();
            resp.toBinName = st.getToBin().getName();
        }

        resp.items = st.getItems().stream().map(i -> {
            StockTransferResponse.StockTransferItemResponse ir = new StockTransferResponse.StockTransferItemResponse();
            ir.id = i.getId();
            ir.productId = i.getProduct().getId();
            ir.productCode = i.getProduct().getCode();
            ir.productName = i.getProduct().getName();
            ir.batchNumber = i.getBatchNumber();
            ir.quantity = i.getQuantity();
            ir.receivedQty = i.getReceivedQty();
            ir.uom = i.getUom();
            ir.unitCostAtSend = i.getUnitCostAtSend() != null ? i.getUnitCostAtSend().setScale(4, RoundingMode.HALF_UP) : null;
            ir.lineValue = currencyOrNull(i.getLineValue());
            ir.allocatedCharge = currencyOrNull(i.getAllocatedCharge());
            ir.receivedLineValue = i.getLineValue() != null || i.getAllocatedCharge() != null
                    ? currency(nvl(i.getLineValue()).add(nvl(i.getAllocatedCharge())))
                    : null;
            return ir;
        }).toList();

        return resp;
    }

    private BigDecimal currency(BigDecimal value) {
        return (value != null ? value : BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal currencyOrNull(BigDecimal value) {
        return value != null ? value.setScale(2, RoundingMode.HALF_UP) : null;
    }

    private BigDecimal nvl(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }

    private static final class UnitCostResolution {
        private final BigDecimal unitCost;
        private final String source;

        private UnitCostResolution(BigDecimal unitCost, String source) {
            this.unitCost = unitCost;
            this.source = source;
        }
    }
}
