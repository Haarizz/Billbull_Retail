package com.billbull.backend.sales.delivery;

import org.hibernate.Hibernate;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.inventory.batch.BatchAllocation;
import com.billbull.backend.inventory.batch.BatchAllocationStatus;
import com.billbull.backend.inventory.batch.BatchSelectionRequest;
import com.billbull.backend.inventory.batch.BatchSelectionService;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductBarcode;
import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.inventory.product.ProductMediaRepository;
import com.billbull.backend.inventory.product.ProductPackingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.inventory.warehouse.WarehouseStockService;
import com.billbull.backend.inventory.warehouse.BinRepository;
import com.billbull.backend.purchase.stockmovement.StockMovement;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.purchase.stockmovement.StockMovementService;
import com.billbull.backend.purchase.stockmovement.StockSourceType;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.stockstrategy.StockDeductionStrategyService;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.util.DocumentOrderingUtil;
import com.billbull.backend.inventory.warehouse.Bin;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@Transactional
public class DeliveryNoteService {

    private final DeliveryNoteRepository repo;
    private final WarehouseStockService warehouseStockService;
    private final ProductRepository productRepo;
    private final WarehouseRepository warehouseRepo;
    private final StockMovementService stockMovementService;
    private final StockMovementRepository stockMovementRepo;
    private final com.billbull.backend.sales.salesorder.SalesOrderService salesOrderService;
    private final BinRepository binRepo;
    private final StockDeductionStrategyService stockStrategy;
    private final PostingEngineService postingEngineService;
    private final SalesInvoiceRepository salesInvoiceRepo;
    private final ProductBarcodeRepository barcodeRepo;
    private final ProductMediaRepository productMediaRepository;
    private final BranchAccessService branchAccessService;
    private final ProductPackingRepository packingRepo;
    private final BatchSelectionService batchSelectionService;

    public DeliveryNoteService(
            DeliveryNoteRepository repo,
            WarehouseStockService warehouseStockService,
            ProductRepository productRepo,
            WarehouseRepository warehouseRepo,
            StockMovementService stockMovementService,
            StockMovementRepository stockMovementRepo,
            com.billbull.backend.sales.salesorder.SalesOrderService salesOrderService,
            BinRepository binRepo,
            StockDeductionStrategyService stockStrategy,
            PostingEngineService postingEngineService,
            SalesInvoiceRepository salesInvoiceRepo,
            ProductBarcodeRepository barcodeRepo,
            ProductMediaRepository productMediaRepository,
            BranchAccessService branchAccessService,
            ProductPackingRepository packingRepo,
            BatchSelectionService batchSelectionService) {
        this.repo = repo;
        this.warehouseStockService = warehouseStockService;
        this.productRepo = productRepo;
        this.warehouseRepo = warehouseRepo;
        this.stockMovementService = stockMovementService;
        this.stockMovementRepo = stockMovementRepo;
        this.salesOrderService = salesOrderService;
        this.binRepo = binRepo;
        this.stockStrategy = stockStrategy;
        this.postingEngineService = postingEngineService;
        this.salesInvoiceRepo = salesInvoiceRepo;
        this.barcodeRepo = barcodeRepo;
        this.productMediaRepository = productMediaRepository;
        this.branchAccessService = branchAccessService;
        this.packingRepo = packingRepo;
        this.batchSelectionService = batchSelectionService;
    }

    private DeliveryNoteResponse toResponse(DeliveryNote dn) {
        hydrateDeliveryItemDisplayData(dn);

        DeliveryNoteResponse r = new DeliveryNoteResponse();

        r.id = dn.getId();
        r.dnNumber = dn.getDnNumber();
        r.dnDate = dn.getDnDate();

        r.customerCode = dn.getCustomerCode();
        r.customerName = dn.getCustomerName();

        r.salesOrderNo = dn.getSalesOrderNo();
        r.proformaNo = dn.getProformaNo();
        r.branchId = dn.getBranchId();
        r.branchName = dn.getBranchName();
        r.branchCode = dn.getBranchCode();

        // ✅ FIX: convert Warehouse entity → String
        r.warehouse = dn.getWarehouse() != null
                ? dn.getWarehouse().getName()
                : null;

        r.driverName = dn.getDriverName();
        r.vehicleNo = dn.getVehicleNo();
        r.trackingNo = dn.getTrackingNo();
        r.shippingAddress = dn.getShippingAddress();

        r.receivedBy = dn.getReceivedBy();
        r.receivedDate = dn.getReceivedDate();

        r.autoGenerated = dn.getAutoGenerated();
        r.sourceDocumentType = dn.getSourceDocumentType();
        r.sourceDocumentId = dn.getSourceDocumentId();
        r.linkedSalesInvoiceNumber = dn.getLinkedSalesInvoice() != null
                ? dn.getLinkedSalesInvoice().getInvoiceNumber()
                : null;

        // Auto-generated DNs from invoices are classified as "Picking" —
        // they represent warehouse pick instructions tied to the sale.
        // Manually linked (Before-Sale) DNs are classified as "Before Sale".
        r.type = (dn.getAutoGenerated() != null && dn.getAutoGenerated()
                && "SALES_INVOICE".equals(dn.getSourceDocumentType()))
                        ? "Picking"
                        : "Before Sale";

        r.totalLines = dn.getTotalLines();
        r.totalQty = dn.getTotalQty();
        r.totalBoxes = dn.getTotalBoxes();

        r.status = dn.getStatus();

        Map<Long, List<DeliveryBatchSelectionResponse>> batchSelectionsByLine =
                dn.getId() != null ? batchSelectionService.getDeliverySelections(dn.getId()) : Map.of();

        r.items = dn.getItems().stream().map(item -> {
            DeliveryNoteItemResponse ir = new DeliveryNoteItemResponse();
            ir.id = item.getId();
            ir.itemCode = item.getItemCode();
            ir.barcode = item.getBarcode();
            ir.description = item.getDescription();
            ir.unit = item.getUnit();
            ir.orderedQty = item.getOrderedQty();
            ir.image = item.getImage();
            ir.prevDeliveredQty = item.getPrevDeliveredQty();
            ir.foc = item.getFoc();
            ir.focUnit = item.getFocUnit();
            ir.remarks = item.getRemarks();
            ir.currentQty = item.getCurrentQty();
            ir.boxes = item.getBoxes();
            ir.binId = item.getBinId();
            ir.salesOrderItemId = item.getSalesOrderItemId();
            ir.price = item.getPrice();
            ir.disc = item.getDisc();
            ir.tax = item.getTax();
            ir.cost = item.getCost();

            Product product = item.getProduct();
            boolean batchControlled = product != null && product.isBatch();
            ir.batchControlled = batchControlled;
            ir.fefoEnabled = product == null || product.isFefoEnabled();
            ir.minExpiryDaysForSale = product != null ? product.getMinExpiryDaysForSale() : 0;
            ir.baseRequiredQuantity = calculateLineBaseQty(item);
            ir.binCode = resolveBinCode(item.getBinId());
            ir.batchSelections = batchSelectionsByLine.getOrDefault(item.getId(), List.of());
            ir.batchSelectedQuantity = ir.batchSelections.stream()
                    .filter(selection -> selection.status == BatchAllocationStatus.RESERVED
                            || selection.status == BatchAllocationStatus.CONSUMED)
                    .mapToInt(selection -> selection.quantity != null ? selection.quantity : 0)
                    .sum();
            ir.batchSelectionMode = ir.batchSelections.stream()
                    .map(selection -> selection.allocationMethod != null ? selection.allocationMethod.name() : null)
                    .filter(mode -> mode != null && !mode.isBlank())
                    .findFirst()
                    .orElse(ir.fefoEnabled ? "AUTO_FEFO" : "MANUAL");
            return ir;
        }).toList();

        return r;
    }

    /* ================= CREATE / UPDATE ================= */

    @CacheEvict(value = "stockAvailability", allEntries = true)
    public DeliveryNoteResponse create(DeliveryNoteRequest req) {
        if (req.proformaNo != null && !req.proformaNo.trim().isEmpty() && !"-".equals(req.proformaNo)) {
            if (repo.existsActiveByProformaNo(req.proformaNo)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, 
                    "An active Delivery Note already exists for Proforma: " + req.proformaNo);
            }
        }
        if (req.salesOrderNo != null && !req.salesOrderNo.trim().isEmpty()) {
            if (repo.existsActiveBySalesOrderNo(req.salesOrderNo)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, 
                    "An active Delivery Note already exists for Sales Order: " + req.salesOrderNo);
            }
        }
        DeliveryNote dn = new DeliveryNote();
        mapToEntity(req, dn);
        dn.setStatus(DeliveryNoteStatus.DRAFT);
        return toResponse(repo.save(dn));
    }

    public DeliveryNoteResponse update(Long id, DeliveryNoteRequest req) {
        DeliveryNote dn = getEntity(id);

        if (dn.getStatus() != DeliveryNoteStatus.DRAFT) {
            throw new IllegalStateException("Only Draft notes can be edited");
        }

        batchSelectionService.releaseDeliveryNote(dn.getId());
        dn.getItems().clear();
        mapToEntity(req, dn);
        return toResponse(repo.save(dn));
    }

    /* ================= READ ================= */

    @Transactional(readOnly = true)
    public List<DeliveryNoteResponse> list() {
        List<DeliveryNote> deliveryNotes = new ArrayList<>(
                branchAccessService.filterBranchScoped(repo.findAll(), DeliveryNote::getBranchId));
        DocumentOrderingUtil.sortByDocumentDateAndNumberDesc(
                deliveryNotes,
                DeliveryNote::getDnDate,
                DeliveryNote::getDnNumber,
                DeliveryNote::getId);
        return deliveryNotes.stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public DeliveryNoteResponse get(Long id) {
        return toResponse(getEntity(id));
    }

    @Transactional(readOnly = true)
    public List<DeliveryNoteResponse> getUninvoicedForCustomer(String customerCode) {
        // Exclude only CANCELLED so DRAFT, DISPATCHED, and DELIVERED all appear in
        // modal
        List<DeliveryNote> deliveryNotes = new ArrayList<>(
                repo.findUninvoicedByCustomer(customerCode, DeliveryNoteStatus.CANCELLED));
        DocumentOrderingUtil.sortByDocumentDateAndNumberDesc(
                deliveryNotes,
                DeliveryNote::getDnDate,
                DeliveryNote::getDnNumber,
                DeliveryNote::getId);
        return deliveryNotes.stream()
                .filter(note -> branchAccessService.canAccessTransactionBranch(note.getBranchId()))
                .map(this::toResponse)
                .toList();
    }

    public void delete(Long id) {
        DeliveryNote dn = getEntity(id);
        batchSelectionService.releaseDeliveryNote(id);
        repo.delete(dn);
    }

    /* ================= STATUS FLOW ================= */

    public DeliveryNoteResponse markDispatched(Long id) {

        DeliveryNote dn = getEntity(id);

        if (dn.getStatus() != DeliveryNoteStatus.DRAFT) {
            throw new IllegalStateException("Only Draft notes can be dispatched");
        }

        if (stockStrategy.canDeliveryNoteDeductStock()) {
            for (DeliveryNoteItem item : dn.getItems()) {
                ensureDispatchBinAssignment(dn, item);

                int qty = item.getCurrentQty() != null ? item.getCurrentQty() : 0;
                int foc = item.getFoc() != null ? item.getFoc() : 0;
                int baseQty = resolveBaseQty(item.getProduct().getId(), item.getUnit(), qty);
                String effectiveFocUnit = (item.getFocUnit() != null && !item.getFocUnit().isBlank())
                        ? item.getFocUnit() : item.getUnit();
                int baseFoc = resolveBaseQty(item.getProduct().getId(), effectiveFocUnit, foc);
                BigDecimal requested = BigDecimal.valueOf((long) baseQty + baseFoc);
                BigDecimal available = warehouseStockService.getAvailableStock(
                        dn.getWarehouse().getId(),
                        item.getProduct().getId())
                        .add(BigDecimal.valueOf(baseQty));

                if (available.compareTo(requested) < 0) {
                    throw new IllegalStateException(
                            "Insufficient stock for " + item.getProduct().getCode() +
                                    " | Available: " + available +
                                    " | Requested: " + requested);
                }

                if (isBatchControlled(item)) {
                    ensureBatchSelectionExact(dn, item, baseQty + baseFoc);
                }
            }
        } else {
            for (DeliveryNoteItem item : dn.getItems()) {
                if (isBatchControlled(item)) {
                    ensureBatchSelectionExact(dn, item, calculateLineBaseQty(item));
                }
            }
        }

        dn.setStatus(DeliveryNoteStatus.DISPATCHED);
        DeliveryNote saved = repo.save(dn);

        // Update linked Sales Order status to release SO-level reservation.
        // SI-sourced DNs have no SO — skip this step for them.
        if (dn.getSalesOrderNo() != null && !dn.getSalesOrderNo().isBlank()) {
            salesOrderService.updateStatus(
                    dn.getSalesOrderNo(),
                    com.billbull.backend.sales.salesorder.SalesOrderStatus.DISPATCHED);
        }

        return toResponse(saved);
    }

    @Caching(evict = {
        @CacheEvict(value = "stockAvailability", allEntries = true),
        @CacheEvict(value = "productList", allEntries = true)
    })
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public DeliveryNoteResponse markDelivered(Long id, String receivedBy) {

        DeliveryNote dn = getEntity(id);

        if (dn.getStatus() != DeliveryNoteStatus.DISPATCHED) {
            throw new IllegalStateException("Only Dispatched notes can be delivered");
        }

        // FIX 3 — Idempotency guard: if GL journals already posted for this DN,
        // skip the accounting block entirely to prevent duplicate entries.
        // (Safe to re-enter for status/stock updates since stock duplication guard
        // is handled separately by StockMovementService.)
        if (dn.isFinancialPosted()) {
            dn.setStatus(DeliveryNoteStatus.DELIVERED);
            dn.setReceivedBy(receivedBy);
            dn.setReceivedDate(LocalDate.now());
            if (dn.getSalesOrderNo() != null && !dn.getSalesOrderNo().isBlank()) {
                salesOrderService.updateDeliveredQuantities(dn.getSalesOrderNo(), dn.getItems());
            }
            return toResponse(repo.save(dn));
        }

        if (stockStrategy.canDeliveryNoteDeductStock()) {
            for (DeliveryNoteItem item : dn.getItems()) {

                int qty = item.getCurrentQty() != null ? item.getCurrentQty() : 0;
                int foc = item.getFoc() != null ? item.getFoc() : 0;
                int baseQty = resolveBaseQty(item.getProduct().getId(), item.getUnit(), qty);
                String effectiveFocUnit = (item.getFocUnit() != null && !item.getFocUnit().isBlank())
                        ? item.getFocUnit() : item.getUnit();
                int baseFoc = resolveBaseQty(item.getProduct().getId(), effectiveFocUnit, foc);
                BigDecimal requested = BigDecimal.valueOf((long) baseQty + baseFoc);

                if (isBatchControlled(item)) {
                    postAllocatedBatchDeliveryDeduction(dn, item, baseQty + baseFoc);
                } else {
                    // HARD VALIDATION WITH RECORD LOCK: check exact physical stock before deducting
                    BigDecimal physicalAvailable = stockMovementService.getAvailableStockForUpdate(
                            dn.getWarehouse().getId(),
                            item.getProduct().getId());

                    if (physicalAvailable.compareTo(requested) < 0) {
                        throw new IllegalStateException(
                                "Concurrency/Stock Error: Insufficient physical stock for " + item.getProduct().getCode() +
                                        " | Available: " + physicalAvailable +
                                        " | Requested: " + requested);
                    }

                    // Deduct exact batch/bin identities so visible stock is reduced.
                    postBatchAwareDeliveryDeduction(dn, item, baseQty + baseFoc);
                }

            }
        } else {
            for (DeliveryNoteItem item : dn.getItems()) {
                if (!isBatchControlled(item)) {
                    continue;
                }
                List<BatchAllocation> allocations = batchSelectionService.getReservedForDeliveryLine(dn.getId(), item.getId());
                int selectedQty = allocations.stream()
                        .mapToInt(allocation -> allocation.getQuantity() != null ? allocation.getQuantity() : 0)
                        .sum();
                int requiredQty = calculateLineBaseQty(item);
                if (selectedQty != requiredQty) {
                    throw new IllegalStateException(
                            "Batch selection must exactly match delivery quantity for " + item.getItemCode()
                                    + ". Selected: " + selectedQty + " | Required: " + requiredQty);
                }
                batchSelectionService.markConsumed(allocations);
            }
        }

        dn.setStatus(DeliveryNoteStatus.DELIVERED);
        dn.setReceivedBy(receivedBy);
        dn.setReceivedDate(LocalDate.now());

        // Update linked Sales Order delivered quantities.
        // SI-sourced DNs have no SO — skip this step for them.
        if (dn.getSalesOrderNo() != null && !dn.getSalesOrderNo().isBlank()) {
            salesOrderService.updateDeliveredQuantities(dn.getSalesOrderNo(), dn.getItems());
        }

        // REVENUE + COGS RECOGNITION (IFRS 15 — FIX 1: unified approach)
        // Only runs if this DN is already linked to an invoice.
        // For Before-Sale DNs not yet linked to an invoice: recognition is deferred
        // and triggered by linkDeliveryNotesToInvoice() when the invoice is later raised.
        SalesInvoice invoice = dn.getLinkedSalesInvoice();
        if (invoice != null) {
            Hibernate.initialize(invoice.getItems());
            recognizeRevenueForDeliveredDn(dn, invoice);
        }

        return toResponse(repo.save(dn));
    }

    public DeliveryNoteResponse advanceStatus(Long id, String receivedBy) {
        DeliveryNote dn = getEntity(id);
        if (dn.getStatus() == DeliveryNoteStatus.DRAFT) {
            return markDispatched(id);
        } else if (dn.getStatus() == DeliveryNoteStatus.DISPATCHED) {
            return markDelivered(id, receivedBy);
        } else {
            throw new IllegalStateException("Note is already delivered, cancelled, or in an invalid state");
        }
    }

    private void postBatchAwareDeliveryDeduction(DeliveryNote dn, DeliveryNoteItem item, int totalToDeduct) {
        if (totalToDeduct <= 0) {
            return;
        }

        Long warehouseId = dn.getWarehouse().getId();
        Long productId = item.getProduct().getId();
        int remaining = totalToDeduct;

        if (item.getBinId() != null) {
            remaining = postDeductionFromBinIdentities(dn, productId, warehouseId, item.getBinId(), remaining);
            if (remaining > 0) {
                throw new IllegalStateException(
                        "Selected bin does not have enough batch stock for " + item.getProduct().getCode()
                                + ". Short by: " + remaining);
            }
            return;
        }

        for (Object[] row : stockMovementRepo.findActiveBinsByWarehouseAndProduct(warehouseId, productId)) {
            if (remaining <= 0) {
                break;
            }
            Long binId = (Long) row[0];
            remaining = postDeductionFromBinIdentities(dn, productId, warehouseId, binId, remaining);
        }

        if (remaining > 0) {
            remaining = postDeductionFromBinIdentities(dn, productId, warehouseId, null, remaining);
        }

        if (remaining > 0) {
            throw new IllegalStateException(
                    "Insufficient batch/bin stock for " + item.getProduct().getCode()
                            + ". Short by: " + remaining);
        }
    }

    private void postAllocatedBatchDeliveryDeduction(DeliveryNote dn, DeliveryNoteItem item, int totalToDeduct) {
        if (totalToDeduct <= 0) {
            return;
        }

        List<BatchAllocation> allocations = batchSelectionService.getReservedForDeliveryLine(dn.getId(), item.getId());
        int selectedQty = allocations.stream()
                .mapToInt(allocation -> allocation.getQuantity() != null ? allocation.getQuantity() : 0)
                .sum();
        if (selectedQty != totalToDeduct) {
            throw new IllegalStateException(
                    "Batch selection must exactly match delivery quantity for " + item.getItemCode()
                            + ". Selected: " + selectedQty + " | Required: " + totalToDeduct);
        }

        for (BatchAllocation allocation : allocations) {
            Long binId = allocation.getBinId();
            BinLocation location = resolveBinLocation(binId);
            stockMovementService.postOutboundStock(
                    StockSourceType.DELIVERY_NOTE,
                    dn.getId(),
                    item.getProduct().getId(),
                    dn.getWarehouse().getId(),
                    binId,
                    location.zoneId,
                    location.locatorId,
                    allocation.getBatchNumber(),
                    allocation.getExpiryDate(),
                    allocation.getQuantity(),
                    dn.getDnNumber());
        }

        batchSelectionService.markConsumed(allocations);
    }

    private int postDeductionFromBinIdentities(
            DeliveryNote dn,
            Long productId,
            Long warehouseId,
            Long binId,
            int requestedQty) {
        if (requestedQty <= 0) {
            return 0;
        }

        BinLocation location = resolveBinLocation(binId);
        int remaining = requestedQty;

        for (StockIdentity identity : loadPositiveStockIdentities(warehouseId, productId, binId)) {
            if (remaining <= 0) {
                break;
            }

            int deductQty = Math.min(remaining, identity.quantity);
            stockMovementService.postOutboundStock(
                    StockSourceType.DELIVERY_NOTE,
                    dn.getId(),
                    productId,
                    warehouseId,
                    binId,
                    location.zoneId,
                    location.locatorId,
                    identity.batchNumber,
                    identity.expiryDate,
                    deductQty,
                    dn.getDnNumber());
            remaining -= deductQty;
        }

        return remaining;
    }

    private List<StockIdentity> loadPositiveStockIdentities(Long warehouseId, Long productId, Long binId) {
        return stockMovementRepo.findStockIdentitiesByProductAndBin(warehouseId, productId, binId)
                .stream()
                .map(row -> new StockIdentity(
                        normalizeBatchNumber(row[0] != null ? row[0].toString() : null),
                        (LocalDate) row[1],
                        row[2] != null ? ((Number) row[2]).intValue() : 0))
                .filter(identity -> identity.quantity > 0)
                .sorted(Comparator
                        .comparing((StockIdentity identity) -> identity.expiryDate != null
                                ? identity.expiryDate : LocalDate.MAX)
                        .thenComparing(identity -> identity.batchNumber != null ? identity.batchNumber : ""))
                .toList();
    }

    private void reverseDeliveryDeduction(DeliveryNote dn, DeliveryNoteItem item) {
        List<StockMovement> deductions = stockMovementRepo
                .findBySourceTypeAndSourceIdAndProductIdAndQuantityLessThan(
                        StockSourceType.DELIVERY_NOTE,
                        dn.getId(),
                        item.getProduct().getId(),
                        0);

        for (StockMovement deduction : deductions) {
            stockMovementService.reverseOutboundStock(
                    StockSourceType.DELIVERY_NOTE,
                    dn.getId(),
                    item.getProduct().getId(),
                    deduction.getWarehouseId() != null ? deduction.getWarehouseId() : dn.getWarehouse().getId(),
                    deduction.getBinId(),
                    deduction.getZoneId(),
                    deduction.getLocatorId(),
                    deduction.getBatchNumber(),
                    deduction.getExpiryDate(),
                    Math.abs(deduction.getQuantity()),
                    dn.getDnNumber() + "-REV");
        }
    }

    private BinLocation resolveBinLocation(Long binId) {
        if (binId == null) {
            return new BinLocation(null, null);
        }

        Bin bin = binRepo.findById(binId).orElse(null);
        if (bin == null) {
            return new BinLocation(null, null);
        }

        Long locatorId = bin.getLocator() != null ? bin.getLocator().getId() : null;
        Long zoneId = bin.getLocator() != null && bin.getLocator().getZone() != null
                ? bin.getLocator().getZone().getId()
                : null;
        return new BinLocation(zoneId, locatorId);
    }

    private String normalizeBatchNumber(String batchNumber) {
        if (batchNumber == null) {
            return null;
        }
        String trimmed = batchNumber.trim();
        return trimmed.isEmpty() || "-".equals(trimmed) ? null : trimmed;
    }

    private static class StockIdentity {
        private final String batchNumber;
        private final LocalDate expiryDate;
        private final int quantity;

        private StockIdentity(String batchNumber, LocalDate expiryDate, int quantity) {
            this.batchNumber = batchNumber;
            this.expiryDate = expiryDate;
            this.quantity = quantity;
        }
    }

    private static class BinLocation {
        private final Long zoneId;
        private final Long locatorId;

        private BinLocation(Long zoneId, Long locatorId) {
            this.zoneId = zoneId;
            this.locatorId = locatorId;
        }
    }

    @CacheEvict(value = "stockAvailability", allEntries = true)
    @Transactional(rollbackFor = Exception.class)
    public DeliveryNoteResponse cancel(Long id) {
        DeliveryNote dn = getEntity(id);

        // If DELIVERED, reverse stock movements AND accounting journals
        if (dn.getStatus() == DeliveryNoteStatus.DELIVERED) {
            if (stockStrategy.canDeliveryNoteDeductStock()) {
                Set<Long> reversedProductIds = new HashSet<>();
                for (DeliveryNoteItem item : dn.getItems()) {
                    if (item.getProduct() != null && reversedProductIds.add(item.getProduct().getId())) {
                        reverseDeliveryDeduction(dn, item);
                    }
                }
                batchSelectionService.restoreConsumedDeliveryNote(dn.getId());
            }

            // FIX 3 + FIX 4 — Only reverse accounting if it was actually posted.
            // Use stored DN amounts directly (not recalculated) to prevent rounding mismatch.
            if (dn.isFinancialPosted()) {
                BigDecimal recognizedRevenue = dn.getRecognizedRevenue();
                BigDecimal recognizedCogs = dn.getRecognizedCogs();

                if ((recognizedRevenue != null && recognizedRevenue.compareTo(BigDecimal.ZERO) > 0)
                        || (recognizedCogs != null && recognizedCogs.compareTo(BigDecimal.ZERO) > 0)) {

                    postingEngineService.reverseJournalFromDeliveryNoteCancellation(
                            dn.getDnNumber(),
                            LocalDate.now(),
                            recognizedRevenue != null ? recognizedRevenue : BigDecimal.ZERO,
                            recognizedCogs != null ? recognizedCogs : BigDecimal.ZERO);

                    // FIX 4 — Subtract the DN's recognized amounts from invoice items
                    // using stored DN totals distributed proportionally by qty.
                    // This is exact even when rounding snap was applied on the final delivery.
                    SalesInvoice invoice = dn.getLinkedSalesInvoice();
                    if (invoice != null) {
                        Hibernate.initialize(invoice.getItems());
                        resetInvoiceItemRecognition(dn, invoice);
                        invoice.setDeliveryStatus(com.billbull.backend.sales.invoice.DeliveryStatus.PENDING);
                    }
                }

                dn.setFinancialPosted(false);
                dn.setRecognizedRevenue(BigDecimal.ZERO);
                dn.setRecognizedCogs(BigDecimal.ZERO);
            }
        } else {
            batchSelectionService.releaseDeliveryNote(dn.getId());
        }

        dn.setStatus(DeliveryNoteStatus.CANCELLED);

        // Revert Sales Order status to release reservation back to SO level
        if (dn.getSalesOrderNo() != null && !dn.getSalesOrderNo().isBlank()) {
            salesOrderService.updateStatus(
                    dn.getSalesOrderNo(),
                    com.billbull.backend.sales.salesorder.SalesOrderStatus.CONFIRMED);
        }

        return toResponse(repo.save(dn));
    }

    /* ================= INTERNAL ================= */

    /**
     * FIX 1 — Unified revenue + COGS recognition entry point.
     *
     * Called from markDelivered() when the DN already has a linked invoice, and
     * from linkDeliveryNotesToInvoice() for Before-Sale DNs that were delivered
     * before the invoice was raised.
     *
     * Mutates: dn (recognizedRevenue, recognizedCogs, financialPosted)
     *          invoice.items (accumulates recognizedRevenue, recognizedCogs)
     *          invoice (deliveryStatus = DELIVERED on final delivery)
     *
     * Idempotent: returns immediately if financialPosted is already true.
     */
    private void recognizeRevenueForDeliveredDn(DeliveryNote dn, SalesInvoice invoice) {
        if (dn.isFinancialPosted()) return;

        BigDecimal totalRecognizedRevenue = BigDecimal.ZERO;
        BigDecimal totalCogs = BigDecimal.ZERO;

        for (DeliveryNoteItem dnItem : dn.getItems()) {
            int rawQty = (dnItem.getCurrentQty() != null ? dnItem.getCurrentQty() : 0);
            int rawFoc = (dnItem.getFoc() != null ? dnItem.getFoc() : 0);
            String effectiveFocUnit = (dnItem.getFocUnit() != null && !dnItem.getFocUnit().isBlank())
                    ? dnItem.getFocUnit() : dnItem.getUnit();
            int deliveredQty = resolveBaseQty(dnItem.getProduct().getId(), dnItem.getUnit(), rawQty)
                    + resolveBaseQty(dnItem.getProduct().getId(), effectiveFocUnit, rawFoc);
            if (deliveredQty <= 0) continue;

            // FIX 2 — Cost source: try weighted average from stock ledger first,
            // fall back to product pricing cost. Reject if neither is available.
            Product product = dnItem.getProduct();
            BigDecimal fallbackCost = (product.getPricing() != null)
                    ? product.getPricing().getCost() : null;
            BigDecimal productCost = stockMovementService.getCostForOutbound(
                    product.getId(), dn.getWarehouse().getId(), fallbackCost);

            if (productCost == null || productCost.compareTo(BigDecimal.ZERO) <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "No cost available for '" + dnItem.getItemCode() + "'. "
                                + "Set cost in Product Pricing or ensure inbound stock movements have unit cost.");
            }
            BigDecimal itemCogs = productCost.multiply(BigDecimal.valueOf(deliveredQty));
            totalCogs = totalCogs.add(itemCogs);

            // Match DN item to invoice item by itemCode for proportional revenue
            SalesInvoiceItem matchedInvoiceItem = invoice.getItems().stream()
                    .filter(si -> si.getItemCode() != null
                            && si.getItemCode().equals(dnItem.getItemCode()))
                    .findFirst()
                    .orElse(null);

            if (matchedInvoiceItem != null) {
                int totalInvoiceQty = (matchedInvoiceItem.getQuantity() != null
                        ? matchedInvoiceItem.getQuantity() : 0)
                        + (matchedInvoiceItem.getFoc() != null ? matchedInvoiceItem.getFoc() : 0);

                BigDecimal netAmount = matchedInvoiceItem.getNetAmount() != null
                        ? BigDecimal.valueOf(matchedInvoiceItem.getNetAmount()) : BigDecimal.ZERO;

                BigDecimal proportionalRevenue = totalInvoiceQty > 0
                        ? netAmount.multiply(BigDecimal.valueOf(deliveredQty))
                                .divide(BigDecimal.valueOf(totalInvoiceQty), 2,
                                        java.math.RoundingMode.HALF_UP)
                        : BigDecimal.ZERO;

                // Cap at remaining unrecognized amount to prevent over-recognition
                BigDecimal maxAllowed = netAmount.subtract(matchedInvoiceItem.getRecognizedRevenue());
                if (proportionalRevenue.compareTo(maxAllowed) > 0) {
                    proportionalRevenue = maxAllowed;
                }

                if (proportionalRevenue.compareTo(BigDecimal.ZERO) > 0) {
                    totalRecognizedRevenue = totalRecognizedRevenue.add(proportionalRevenue);
                    matchedInvoiceItem.setRecognizedRevenue(
                            matchedInvoiceItem.getRecognizedRevenue().add(proportionalRevenue));
                    matchedInvoiceItem.setRecognizedCogs(
                            matchedInvoiceItem.getRecognizedCogs().add(itemCogs));
                }
            }
        }

        // Snap any remaining rounding difference on the final delivery
        boolean isFinalDelivery = invoice.getItems().stream()
                .allMatch(si -> {
                    BigDecimal net = si.getNetAmount() != null
                            ? BigDecimal.valueOf(si.getNetAmount()) : BigDecimal.ZERO;
                    return si.getRecognizedRevenue().compareTo(net) >= 0;
                });
        if (isFinalDelivery) {
            BigDecimal totalInvoiceSubTotal = invoice.getSubTotal() != null
                    ? BigDecimal.valueOf(invoice.getSubTotal()) : BigDecimal.ZERO;
            BigDecimal totalAlreadyRecognized = invoice.getItems().stream()
                    .map(SalesInvoiceItem::getRecognizedRevenue)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal rounding = totalInvoiceSubTotal.subtract(totalAlreadyRecognized);
            if (rounding.abs().compareTo(BigDecimal.valueOf(0.10)) <= 0
                    && rounding.compareTo(BigDecimal.ZERO) != 0) {
                totalRecognizedRevenue = totalRecognizedRevenue.add(rounding);
            }
            invoice.setDeliveryStatus(com.billbull.backend.sales.invoice.DeliveryStatus.DELIVERED);
        }

        // Store what was recognized for this DN (used by cancellation reversal — Fix 4)
        dn.setRecognizedRevenue(totalRecognizedRevenue);
        dn.setRecognizedCogs(totalCogs);

        // Post journals: Dr Deferred Revenue / Cr Revenue + Dr COGS / Cr Inventory
        if (totalRecognizedRevenue.compareTo(BigDecimal.ZERO) > 0
                || totalCogs.compareTo(BigDecimal.ZERO) > 0) {
            LocalDate journalDate = dn.getReceivedDate() != null ? dn.getReceivedDate()
                    : (dn.getDnDate() != null ? dn.getDnDate() : LocalDate.now());
            postingEngineService.createJournalFromDeliveryNoteDelivered(
                    "DN-" + dn.getDnNumber(),
                    journalDate,
                    dn.getDnNumber(),
                    totalRecognizedRevenue,
                    totalCogs);
        }

        // FIX 3 — Mark as financially posted to prevent duplicate journals on retry
        dn.setFinancialPosted(true);
    }

    /**
     * FIX 4 — Resets invoice item recognized amounts when a delivered DN is cancelled.
     *
     * Uses the stored DN totals (dn.recognizedRevenue / dn.recognizedCogs) distributed
     * proportionally by DN item qty rather than recalculating from invoice netAmount.
     * This ensures the subtracted amounts exactly match what was originally posted,
     * even when a rounding snap was applied on the final delivery.
     */
    private void resetInvoiceItemRecognition(DeliveryNote dn, SalesInvoice invoice) {
        BigDecimal storedRevenue = dn.getRecognizedRevenue() != null
                ? dn.getRecognizedRevenue() : BigDecimal.ZERO;
        BigDecimal storedCogs = dn.getRecognizedCogs() != null
                ? dn.getRecognizedCogs() : BigDecimal.ZERO;

        int totalDnQty = dn.getItems().stream()
                .mapToInt(i -> (i.getCurrentQty() != null ? i.getCurrentQty() : 0)
                        + (i.getFoc() != null ? i.getFoc() : 0))
                .sum();
        if (totalDnQty == 0) return;

        for (DeliveryNoteItem dnItem : dn.getItems()) {
            int dnItemQty = (dnItem.getCurrentQty() != null ? dnItem.getCurrentQty() : 0)
                    + (dnItem.getFoc() != null ? dnItem.getFoc() : 0);
            if (dnItemQty <= 0) continue;

            BigDecimal qtyRatio = BigDecimal.valueOf(dnItemQty)
                    .divide(BigDecimal.valueOf(totalDnQty), 6, java.math.RoundingMode.HALF_UP);
            BigDecimal revenueShare = storedRevenue.multiply(qtyRatio)
                    .setScale(2, java.math.RoundingMode.HALF_UP);
            BigDecimal cogsShare = storedCogs.multiply(qtyRatio)
                    .setScale(2, java.math.RoundingMode.HALF_UP);

            final String itemCode = dnItem.getItemCode();
            invoice.getItems().stream()
                    .filter(si -> itemCode != null && itemCode.equals(si.getItemCode()))
                    .findFirst()
                    .ifPresent(si -> {
                        si.setRecognizedRevenue(
                                si.getRecognizedRevenue().subtract(revenueShare).max(BigDecimal.ZERO));
                        si.setRecognizedCogs(
                                si.getRecognizedCogs().subtract(cogsShare).max(BigDecimal.ZERO));
                    });
        }
    }

    private void hydrateDeliveryItemDisplayData(DeliveryNote dn) {
        if (dn == null || dn.getItems() == null) {
            return;
        }

        Map<String, SalesInvoiceItem> linkedInvoiceItemsByCode = new HashMap<>();
        SalesInvoice linkedInvoice = dn.getLinkedSalesInvoice();
        if (linkedInvoice != null) {
            Hibernate.initialize(linkedInvoice.getItems());
            linkedInvoice.getItems().stream()
                    .filter(i -> i.getItemCode() != null && !i.getItemCode().isBlank())
                    .forEach(i -> linkedInvoiceItemsByCode.putIfAbsent(i.getItemCode(), i));
        }

        dn.getItems().forEach(item -> {
            backfillDeliveryItemPricingFromInvoice(item, linkedInvoiceItemsByCode.get(item.getItemCode()));
            hydrateDeliveryItemDisplayData(item);
        });

        List<String> codesNeedingImage = dn.getItems().stream()
                .filter(i -> (i.getImage() == null || i.getImage().isBlank()) && i.getItemCode() != null && !i.getItemCode().isBlank())
                .map(DeliveryNoteItem::getItemCode)
                .distinct()
                .toList();

        if (!codesNeedingImage.isEmpty()) {
            Map<String, String> imageMap = new HashMap<>();
            productMediaRepository.findPrimaryByProductCodesIn(codesNeedingImage)
                    .forEach(m -> imageMap.put(m.getProduct().getCode(), m.getImageUrl()));
            dn.getItems().forEach(i -> {
                if ((i.getImage() == null || i.getImage().isBlank()) && i.getItemCode() != null) {
                    String url = imageMap.get(i.getItemCode());
                    if (url != null) i.setImage(url);
                }
            });
        }
    }

    private void hydrateDeliveryItemDisplayData(DeliveryNoteItem item) {
        if (item == null) {
            return;
        }

        Product product = item.getProduct();
        if (product == null && item.getItemCode() != null && !item.getItemCode().isBlank()) {
            product = productRepo.findByCodeAndIsActiveTrue(item.getItemCode()).orElse(null);
        }

        if (product == null) {
            return;
        }

        if (item.getBarcode() == null || item.getBarcode().isBlank()) {
            String barcode = barcodeRepo.findByProductId(product.getId()).stream()
                    .map(ProductBarcode::getBarcode)
                    .filter(code -> code != null && !code.isBlank())
                    .findFirst()
                    .orElse(null);

            if (barcode != null) {
                item.setBarcode(barcode);
            }
        }

        if (item.getFocUnit() == null || item.getFocUnit().isBlank()) {
            item.setFocUnit(item.getUnit());
        }

        if (item.getRemarks() == null || item.getRemarks().isBlank()) {
            item.setRemarks(item.getDescription());
        }

        // Populate price from packing-level price first, then fall back to product retail price.
        if (item.getPrice() == null) {
            java.math.BigDecimal packingPrice = lookupPackingPrice(product.getId(), item.getUnit());
            if (packingPrice != null) {
                item.setPrice(packingPrice.doubleValue());
            } else if (product.getPricing() != null && product.getPricing().getRetailPrice() != null) {
                item.setPrice(product.getPricing().getRetailPrice().doubleValue());
            }
        }

        // Populate cost from packing-level cost first, then fall back to product cost.
        if (item.getCost() == null) {
            java.math.BigDecimal packingCost = lookupPackingCost(product.getId(), item.getUnit());
            if (packingCost != null) {
                item.setCost(packingCost.doubleValue());
            } else if (product.getPricing() != null && product.getPricing().getCost() != null) {
                item.setCost(product.getPricing().getCost().doubleValue());
            }
        }
    }

    private void backfillDeliveryItemPricingFromInvoice(DeliveryNoteItem item, SalesInvoiceItem invoiceItem) {
        if (item == null || invoiceItem == null) {
            return;
        }

        if ((item.getDescription() == null || item.getDescription().isBlank())
                && invoiceItem.getDescription() != null && !invoiceItem.getDescription().isBlank()) {
            item.setDescription(invoiceItem.getDescription());
        }

        if (item.getPrice() == null && invoiceItem.getPrice() != null) {
            item.setPrice(invoiceItem.getPrice());
        }

        if (item.getDisc() == null && invoiceItem.getDiscount() != null) {
            item.setDisc(invoiceItem.getDiscount());
        }

        if (item.getTax() == null && invoiceItem.getTaxRate() != null) {
            item.setTax(invoiceItem.getTaxRate());
        }

        if (item.getCost() == null && invoiceItem.getCost() != null) {
            item.setCost(invoiceItem.getCost());
        }

        if ((item.getImage() == null || item.getImage().isBlank())
                && invoiceItem.getImage() != null && !invoiceItem.getImage().isBlank()) {
            item.setImage(invoiceItem.getImage());
        }
    }

    public DeliveryNote getEntity(Long id) {
        DeliveryNote note = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Delivery Note not found"));
        branchAccessService.assertTransactionBranchAccessible(note.getBranchId(), "Delivery Note");
        return note;
    }

    public DeliveryNoteResponse saveBatchSelection(Long dnId, Long itemId, BatchSelectionRequest request) {
        DeliveryNote dn = getEntity(dnId);
        if (dn.getStatus() != DeliveryNoteStatus.DRAFT) {
            throw new IllegalStateException("Batch selection can only be changed while the delivery note is Draft");
        }
        DeliveryNoteItem item = findItem(dn, itemId);
        batchSelectionService.saveDeliveryLineSelection(dn, item, request, calculateLineBaseQty(item));
        return toResponse(dn);
    }

    public DeliveryNoteResponse deleteBatchSelection(Long dnId, Long itemId) {
        DeliveryNote dn = getEntity(dnId);
        if (dn.getStatus() != DeliveryNoteStatus.DRAFT) {
            throw new IllegalStateException("Batch selection can only be cleared while the delivery note is Draft");
        }
        findItem(dn, itemId);
        batchSelectionService.releaseDeliveryLine(dnId, itemId);
        return toResponse(dn);
    }

    private DeliveryNoteItem findItem(DeliveryNote dn, Long itemId) {
        return dn.getItems().stream()
                .filter(item -> item.getId() != null && item.getId().equals(itemId))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("Delivery Note item not found: " + itemId));
    }

    private void mapToEntity(DeliveryNoteRequest req, DeliveryNote dn) {

        Warehouse warehouse = warehouseRepo.findById(req.warehouseId)
                .orElseThrow(() -> new RuntimeException("Warehouse not found"));

        SalesInvoice sourceInvoice = resolveSourceInvoice(req);
        Branch resolvedBranch = resolveBranchForRequest(dn, sourceInvoice);
        if (resolvedBranch != null) {
            branchAccessService.assertWarehouseMatchesBranch(warehouse, resolvedBranch.getId(), "Delivery Note");
        }

        dn.setDnNumber(req.dnNumber);
        dn.setDnDate(req.dnDate);
        dn.setCustomerCode(req.customerCode);
        dn.setCustomerName(req.customerName);
        dn.setSalesOrderNo(req.salesOrderNo);
        dn.setProformaNo(req.proformaNo);
        applyBranchSnapshot(dn, resolvedBranch);
        dn.setWarehouse(warehouse);
        dn.setDriverName(req.driverName);
        dn.setVehicleNo(req.vehicleNo);
        dn.setTrackingNo(req.trackingNo);
        dn.setShippingAddress(req.shippingAddress);

        dn.setAutoGenerated(req.autoGenerated != null ? req.autoGenerated : false);

        // Resolve linked Sales Invoice when the DN is created against a Sales Invoice.
        if (sourceInvoice != null && req.linkedSalesInvoiceNumber != null && !req.linkedSalesInvoiceNumber.isBlank()) {
            dn.setLinkedSalesInvoice(sourceInvoice);
            // Mark source document so stock/status logic can identify SI-sourced DNs.
            dn.setSourceDocumentType("SALES_INVOICE");
            dn.setSourceDocumentId(sourceInvoice.getId());
        } else if (sourceInvoice != null && "SALES_INVOICE".equals(req.sourceDocumentType) && req.sourceDocumentId != null) {
            dn.setLinkedSalesInvoice(sourceInvoice);
            dn.setSourceDocumentType("SALES_INVOICE");
            dn.setSourceDocumentId(sourceInvoice.getId());
        } else {
            // Preserve any explicitly supplied source document fields (auto-gen paths).
            dn.setSourceDocumentType(req.sourceDocumentType);
            dn.setSourceDocumentId(req.sourceDocumentId);
        }

        int qty = 0;
        int boxes = 0;

        for (DeliveryNoteItemRequest i : req.items) {

            Product product = productRepo.findByCodeAndIsActiveTrue(i.itemCode)
                    .orElseThrow(() -> new RuntimeException("Product not found: " + i.itemCode));

            DeliveryNoteItem item = new DeliveryNoteItem();
            item.setDeliveryNote(dn);
            item.setProduct(product);
            item.setItemCode(i.itemCode);
            item.setBarcode(i.barcode);
            item.setDescription(i.description);
            item.setUnit(i.unit);
            item.setOrderedQty(i.orderedQty);
            item.setPrevDeliveredQty(i.prevDeliveredQty);
            item.setFoc(i.foc);
            item.setFocUnit(i.focUnit);
            item.setRemarks(i.remarks);
            item.setCurrentQty(i.currentQty);
            item.setBoxes(i.boxes);
            item.setImage(i.image);
            item.setBinId(resolveDraftBinId(warehouse.getId(), product, i));
            item.setSalesOrderItemId(i.salesOrderItemId);
            item.setPrice(i.price);
            item.setDisc(i.disc);
            item.setTax(i.tax);
            item.setCost(i.cost);
            hydrateDeliveryItemDisplayData(item);

            dn.getItems().add(item);

            qty += i.currentQty != null ? i.currentQty : 0;
            boxes += i.boxes != null ? i.boxes : 0;
        }

        dn.setTotalLines(dn.getItems().size());
        dn.setTotalQty(qty);
        dn.setTotalBoxes(boxes);
    }

    private Long resolveDraftBinId(Long warehouseId, Product product, DeliveryNoteItemRequest itemRequest) {
        if (itemRequest.binId != null) {
            validateBinForWarehouse(itemRequest.binId, warehouseId);
            return itemRequest.binId;
        }

        return findPreferredBinId(
                warehouseId,
                product.getId(),
                calculateRequestedQty(itemRequest.currentQty, itemRequest.foc));
    }

    private void ensureDispatchBinAssignment(DeliveryNote dn, DeliveryNoteItem item) {
        Long warehouseId = dn.getWarehouse().getId();
        Long productId = item.getProduct().getId();
        int requestedQty = calculateRequestedQty(item.getCurrentQty(), item.getFoc());

        if (requestedQty <= 0) {
            return;
        }

        if (item.getBinId() != null) {
            validateBinForWarehouse(item.getBinId(), warehouseId);

            BigDecimal selectedBinStock = stockMovementRepo.getStockByBin(warehouseId, productId, item.getBinId());
            if (selectedBinStock.compareTo(BigDecimal.valueOf(requestedQty)) < 0) {
                throw new IllegalStateException(
                        "Selected bin does not have enough stock for " + item.getItemCode()
                                + ". Available in bin: " + selectedBinStock
                                + " | Requested: " + requestedQty);
            }
            return;
        }

        Long autoAssignedBinId = findPreferredBinId(warehouseId, productId, requestedQty);
        if (autoAssignedBinId != null) {
            item.setBinId(autoAssignedBinId);
        }
    }

    private Long findPreferredBinId(Long warehouseId, Long productId, int requestedQty) {
        if (requestedQty <= 0) {
            return null;
        }

        return stockMovementRepo.findActiveBinsByWarehouseAndProduct(warehouseId, productId).stream()
                .filter(row -> ((Number) row[1]).doubleValue() >= requestedQty)
                .map(row -> (Long) row[0])
                .findFirst()
                .orElse(null);
    }

    private void validateBinForWarehouse(Long binId, Long warehouseId) {
        Bin bin = binRepo.findByIdEager(binId)
                .orElseThrow(() -> new RuntimeException("Bin not found: " + binId));

        Long binWarehouseId = bin.getLocator() != null
                && bin.getLocator().getZone() != null
                && bin.getLocator().getZone().getWarehouse() != null
                        ? bin.getLocator().getZone().getWarehouse().getId()
                        : null;

        if (binWarehouseId == null || !binWarehouseId.equals(warehouseId)) {
            throw new IllegalStateException("Selected bin does not belong to the chosen warehouse");
        }
    }

    private int calculateRequestedQty(Integer currentQty, Integer foc) {
        return (currentQty != null ? currentQty : 0) + (foc != null ? foc : 0);
    }

    private boolean isBatchControlled(DeliveryNoteItem item) {
        return item != null && item.getProduct() != null && item.getProduct().isBatch();
    }

    private int calculateLineBaseQty(DeliveryNoteItem item) {
        if (item == null || item.getProduct() == null) {
            return 0;
        }
        int qty = item.getCurrentQty() != null ? item.getCurrentQty() : 0;
        int foc = item.getFoc() != null ? item.getFoc() : 0;
        int baseQty = resolveBaseQty(item.getProduct().getId(), item.getUnit(), qty);
        String effectiveFocUnit = (item.getFocUnit() != null && !item.getFocUnit().isBlank())
                ? item.getFocUnit()
                : item.getUnit();
        int baseFoc = resolveBaseQty(item.getProduct().getId(), effectiveFocUnit, foc);
        return baseQty + baseFoc;
    }

    private void ensureBatchSelectionExact(DeliveryNote dn, DeliveryNoteItem item, int requiredQty) {
        int selectedQty = batchSelectionService.getReservedForDeliveryLine(dn.getId(), item.getId()).stream()
                .mapToInt(allocation -> allocation.getQuantity() != null ? allocation.getQuantity() : 0)
                .sum();
        if (selectedQty != requiredQty) {
            throw new IllegalStateException(
                    "Batch selection must exactly match delivery quantity for " + item.getItemCode()
                            + ". Selected: " + selectedQty + " | Required: " + requiredQty);
        }
    }

    private String resolveBinCode(Long binId) {
        if (binId == null) {
            return null;
        }
        return binRepo.findById(binId)
                .map(Bin::getCode)
                .orElse(null);
    }

    private SalesInvoice resolveSourceInvoice(DeliveryNoteRequest req) {
        if (req.linkedSalesInvoiceNumber != null && !req.linkedSalesInvoiceNumber.isBlank()) {
            SalesInvoice invoice = salesInvoiceRepo.findByInvoiceNumber(req.linkedSalesInvoiceNumber)
                    .orElseThrow(() -> new RuntimeException(
                            "Sales Invoice not found: " + req.linkedSalesInvoiceNumber));
            branchAccessService.assertTransactionBranchAccessible(invoice.getBranchId(), "Sales Invoice");
            return invoice;
        }

        if ("SALES_INVOICE".equals(req.sourceDocumentType) && req.sourceDocumentId != null) {
            SalesInvoice invoice = salesInvoiceRepo.findById(req.sourceDocumentId)
                    .orElseThrow(() -> new RuntimeException("Sales Invoice not found: " + req.sourceDocumentId));
            branchAccessService.assertTransactionBranchAccessible(invoice.getBranchId(), "Sales Invoice");
            return invoice;
        }

        return null;
    }

    private Branch resolveBranchForRequest(DeliveryNote dn, SalesInvoice sourceInvoice) {
        if (sourceInvoice != null) {
            if (sourceInvoice.getBranchId() == null) {
                return null;
            }
            Branch branch = branchAccessService.getRequiredCurrentUserBranch();
            if (!branch.getId().equals(sourceInvoice.getBranchId())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Sales Invoice belongs to another branch.");
            }
            return branch;
        }

        if (dn.getId() != null && dn.getBranchId() == null) {
            return null;
        }

        return branchAccessService.getRequiredCurrentUserBranch();
    }

    private void applyBranchSnapshot(DeliveryNote dn, Branch branch) {
        if (branch == null) {
            dn.setBranchId(null);
            dn.setBranchName(null);
            dn.setBranchCode(null);
            return;
        }

        dn.setBranchId(branch.getId());
        dn.setBranchName(branch.getName());
        dn.setBranchCode(branch.getCode());
    }

    /**
     * FIX 1 — Links Before-Sale DNs to an invoice and triggers revenue recognition
     * for any DN that is already in DELIVERED status.
     *
     * Before-Sale flow:
     *   1. DN created + delivered (stock deducted) before invoice exists
     *      → at delivery time dn.linkedSalesInvoice is null → no revenue recognition
     *   2. Invoice raised → save() calls this method
     *      → links DN to invoice → DN is DELIVERED + not financially posted
     *      → revenue + COGS recognized here via recognizeRevenueForDeliveredDn()
     */
    @Transactional
    public void linkDeliveryNotesToInvoice(List<String> dnNumbers,
            com.billbull.backend.sales.invoice.SalesInvoice invoice) {
        List<DeliveryNote> notes = repo.findByDnNumberIn(dnNumbers);
        for (DeliveryNote note : notes) {
            note.setLinkedSalesInvoice(invoice);
            repo.save(note);

            // Before-Sale flow: DN already delivered before invoice was raised.
            // Trigger revenue + COGS recognition now that the link is established.
            if (note.getStatus() == DeliveryNoteStatus.DELIVERED && !note.isFinancialPosted()) {
                Hibernate.initialize(note.getItems());
                Hibernate.initialize(invoice.getItems());
                recognizeRevenueForDeliveredDn(note, invoice);
                repo.save(note); // persist financialPosted=true and recognized amounts
            }
        }
    }

    /**
     * Links a single auto-generated Delivery Note to its parent Sales Invoice.
     * Called from SalesInvoiceService within the same transaction to ensure
     * the FK is persisted immediately.
     */
    @Transactional
    public void linkSingleDeliveryNoteToInvoice(Long dnId,
            com.billbull.backend.sales.invoice.SalesInvoice invoice) {
        DeliveryNote dn = getEntity(dnId);
        dn.setLinkedSalesInvoice(invoice);
        repo.save(dn);
    }

    public boolean existsByDnNumber(String dnNumber) {
        return repo.existsByDnNumber(dnNumber);
    }

    private java.math.BigDecimal lookupPackingPrice(Long productId, String unitName) {
        if (unitName == null || unitName.isBlank()) return null;
        return packingRepo.findByProductId(productId).stream()
                .filter(p -> p.getUnit() != null && unitName.equalsIgnoreCase(p.getUnit().getName()))
                .findFirst()
                .map(com.billbull.backend.inventory.product.ProductPacking::getPrice)
                .orElse(null);
    }

    private java.math.BigDecimal lookupPackingCost(Long productId, String unitName) {
        if (unitName == null || unitName.isBlank()) return null;
        return packingRepo.findByProductId(productId).stream()
                .filter(p -> p.getUnit() != null && unitName.equalsIgnoreCase(p.getUnit().getName()))
                .findFirst()
                .map(com.billbull.backend.inventory.product.ProductPacking::getCost)
                .orElse(null);
    }

    /**
     * Converts a document-level qty (in the item's unit) to base stock units
     * using the matching ProductPacking conversion factor.
     * Falls back to the raw qty when no packing is found (i.e. the unit IS the base unit).
     */
    private int resolveBaseQty(Long productId, String unitName, int qty) {
        if (qty <= 0 || unitName == null || unitName.isBlank()) return qty;
        return packingRepo.findByProductId(productId).stream()
                .filter(p -> p.getUnit() != null && unitName.equalsIgnoreCase(p.getUnit().getName()))
                .findFirst()
                .map(p -> p.getConversion() != null
                        ? BigDecimal.valueOf(qty).multiply(p.getConversion())
                                .setScale(0, java.math.RoundingMode.HALF_UP).intValue()
                        : qty)
                .orElse(qty);
    }

    @Transactional(readOnly = true)
    public boolean hasActiveDeliveryNoteForSource(String type, Long id) {
        List<DeliveryNote> notes = repo.findBySourceDocumentTypeAndSourceDocumentId(type, id);
        for (DeliveryNote note : notes) {
            if (note.getStatus() != DeliveryNoteStatus.CANCELLED) {
                return true;
            }
        }
        return false;
    }

    @Transactional
    public void cancelBySourceDocument(String type, Long id) {
        List<DeliveryNote> notes = repo.findBySourceDocumentTypeAndSourceDocumentId(type, id);
        for (DeliveryNote note : notes) {
            cancel(note.getId());
        }
    }

    /**
     * FIX 5 — Returns DELIVERED DNs that are linked to an invoice but have no GL journal.
     * Used by the reconciliation endpoint to detect accounting gaps.
     * Filters: financialPosted=false AND no journal exists for "DN-{dnNumber}".
     * (Belt-and-suspenders: financialPosted covers new records; journal check covers
     * pre-migration DNs where the flag did not exist.)
     */
    @Transactional(readOnly = true)
    public List<java.util.Map<String, Object>> findDeliveredWithoutAccounting() {
        return repo.findByStatusAndFinancialPostedFalse(DeliveryNoteStatus.DELIVERED)
                .stream()
                .filter(dn -> dn.getLinkedSalesInvoice() != null)
                .filter(dn -> !postingEngineService.hasJournalForReference("DN-" + dn.getDnNumber()))
                .map(dn -> {
                    java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
                    m.put("dnNumber", dn.getDnNumber());
                    m.put("customerName", dn.getCustomerName() != null ? dn.getCustomerName() : "");
                    m.put("dnDate", dn.getDnDate() != null ? dn.getDnDate().toString() : "");
                    m.put("linkedInvoice", dn.getLinkedSalesInvoice().getInvoiceNumber() != null
                            ? dn.getLinkedSalesInvoice().getInvoiceNumber() : "");
                    m.put("issue", "Delivery note DELIVERED but no GL journal found");
                    return m;
                })
                .toList();
    }
}
