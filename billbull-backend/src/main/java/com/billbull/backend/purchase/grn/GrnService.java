package com.billbull.backend.purchase.grn;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.cache.annotation.CacheEvict;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.purchase.lpo.Lpo;
import com.billbull.backend.purchase.lpo.LpoRepository;

import com.billbull.backend.purchase.stockmovement.StockMovementService;
import com.billbull.backend.purchase.stockmovement.StockSourceType;

import com.billbull.backend.inventory.warehouse.BinRepository;
import com.billbull.backend.inventory.warehouse.ZoneRepository;
import com.billbull.backend.inventory.warehouse.LocatorRepository;
import com.billbull.backend.inventory.product.ProductMediaRepository;

@Service
@Transactional
public class GrnService {

    private final StockMovementService stockMovementService;
    private final GrnRepository grnRepo;
    private final WarehouseRepository warehouseRepo;
    private final ProductRepository productRepo;
    private final LpoRepository lpoRepo;

    private final BinRepository binRepo;
    private final ZoneRepository zoneRepo;
    private final LocatorRepository locatorRepo;
    private final com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository invoiceRepo;
    private final com.billbull.backend.financials.generalledger.postingengine.PostingEngineService postingEngineService;
    private final ProductMediaRepository productMediaRepo;
    private final ProductBarcodeRepository productBarcodeRepo;

    public GrnService(
            StockMovementService stockMovementService,
            GrnRepository grnRepo,
            WarehouseRepository warehouseRepo,
            ProductRepository productRepo,
            LpoRepository lpoRepo,
            BinRepository binRepo,
            ZoneRepository zoneRepo,
            LocatorRepository locatorRepo,
            com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository invoiceRepo,
            com.billbull.backend.financials.generalledger.postingengine.PostingEngineService postingEngineService,
            ProductMediaRepository productMediaRepo,
            ProductBarcodeRepository productBarcodeRepo) {
        this.stockMovementService = stockMovementService;
        this.grnRepo = grnRepo;
        this.warehouseRepo = warehouseRepo;
        this.productRepo = productRepo;
        this.lpoRepo = lpoRepo;

        this.binRepo = binRepo;
        this.zoneRepo = zoneRepo;
        this.locatorRepo = locatorRepo;
        this.invoiceRepo = invoiceRepo;
        this.postingEngineService = postingEngineService;
        this.productMediaRepo = productMediaRepo;
        this.productBarcodeRepo = productBarcodeRepo;
    }

    /* ================= CREATE / UPDATE ================= */

    public GrnDetailResponse saveOrUpdate(Long id, GrnSaveRequest req) {

        GrnEntity grn = (id == null)
                ? new GrnEntity()
                : grnRepo.findById(id)
                        .orElseThrow(() -> new RuntimeException("GRN not found"));

        if (id != null && grn.isStockPosted()) {
            throw new IllegalStateException("Posted GRN cannot be edited");
        }

        grn.setGrnDate(req.date());
        grn.setVendorName(req.vendor());

        // 🔓 PARTIAL GRN SUPPORT: Removed "GRN already exists" check to allow multiple
        // GRNs per LPO.
        // The check for stock posting via Invoice remains relevant if strict flow is
        // needed,
        // but for now we trust the partial logic.
        if (id == null && req.lpo() != null && !req.lpo().isBlank()) {
            lpoRepo.findByLpoNumber(req.lpo().trim()).ifPresent(lpo -> {
                if (invoiceRepo.existsByLpoIdAndStockPostedTrue(lpo.getId())) {
                    throw new IllegalStateException(
                            "Stock for this LPO has already been posted via an Invoice. Cannot create GRN.");
                }
            });
        }

        Warehouse warehouse = warehouseRepo.findById(req.warehouseId())
                .orElseThrow(() -> new IllegalArgumentException("Invalid warehouse"));
        grn.setWarehouse(warehouse);

        if (req.zoneId() != null) {
            grn.setZone(zoneRepo.findById(req.zoneId()).orElse(null));
        } else {
            grn.setZone(null);
        }

        if (req.locatorId() != null) {
            grn.setLocator(locatorRepo.findById(req.locatorId()).orElse(null));
        } else {
            grn.setLocator(null);
        }

        if (req.binId() != null) {
            grn.setBin(binRepo.findById(req.binId()).orElse(null));
        } else {
            grn.setBin(null);
        }

        grn.setPackageCount(req.packages());

        // ✅ LINK SOURCE DOCUMENT (LPO or Direct Purchase)
        if (req.lpo() != null && !req.lpo().isBlank() && !req.lpo().equalsIgnoreCase("Manual")
                && !req.lpo().equalsIgnoreCase("(Link-Lost)")) {

            String refNum = req.lpo().trim();
            grn.setLpoNumber(refNum);

            // 1. Try LPO
            var lpoOpt = lpoRepo.findByLpoNumber(refNum);
            if (lpoOpt.isPresent()) {
                Lpo lpo = lpoOpt.get();
                grn.setLpo(lpo);
                grn.setLpoNumber(lpo.getLpoNumber());
                grn.setSourceType(GrnSourceType.SYSTEM_AUTO);
                grn.setReferenceId(lpo.getId());
            } else {
                // 2. Try Direct Purchase - REMOVED
                // var dpOpt = dpRepo.findByDpNumber(req.lpo()); ...
                {
                    // Document not found. If this is a NEW GRN, it's manual with a ref number.
                    if (id == null) {
                        grn.setSourceType(GrnSourceType.MANUAL);
                        grn.setLpo(null);
                        // grn.setLpoNumber already set above
                    }
                }
            }
        } else if (req.lpo() == null || req.lpo().isBlank()) {
            // Explicitly clearing the reference only if the input is empty
            grn.setSourceType(GrnSourceType.MANUAL);
            grn.setReferenceId(null);
            grn.setLpo(null);
            grn.setLpoNumber(null);
        }
        // If req.lpo() is "Manual" or "(Link-Lost)", we preserve the existing state.

        if (id == null) {
            grn.setGrnNo(generateGrnNo());
            grn.setStatus(GrnStatus.DRAFT);
            grn.setQcStatus(QcStatus.NOT_STARTED);
            grn.setStockPosted(false);
        }

        grn.getItems().clear();

        BigDecimal subtotal = BigDecimal.ZERO;

        for (GrnItemRequest i : req.items()) {

            Product product = productRepo.findById(i.productId())
                    .orElseThrow(() -> new IllegalArgumentException("Invalid product ID"));

            if (i.received() == null || i.received() < 0) {
                throw new IllegalStateException("Received quantity invalid");
            }

            if (i.accepted() == null || i.accepted() < 0 || i.accepted() > i.received()) {
                throw new IllegalStateException("Accepted quantity invalid");
            }

            GrnItemEntity item = new GrnItemEntity();
            item.setGrn(grn);
            item.setProduct(product);

            item.setProductCode(i.code());
            item.setProductName(i.name());
            item.setBarcode(i.barcode());
            item.setUom(i.uom());

            item.setLpoQty(i.lpoQty());
            item.setReceivedQty(i.received());
            item.setAcceptedQty(i.accepted());
            item.setRejectedQty(i.received() - i.accepted());

            item.setUnitCost(i.unitCost());
            item.setNetCost(i.netCost());
            item.setLineTotal(i.total());
            item.setBatchManaged(i.batch());
            item.setFocQty(i.focQty());
            item.setFocUnit(i.focUnit());
            item.setRemarks(i.remarks());

            subtotal = subtotal.add(i.total());
            grn.getItems().add(item);
        }

        grn.setSubtotal(subtotal);

        BigDecimal tax = subtotal
                .multiply(BigDecimal.valueOf(0.05))
                .setScale(2, RoundingMode.HALF_UP);

        grn.setTaxAmount(tax);
        grn.setGrandTotal(subtotal.add(tax));

        return

        mapDetail(grnRepo.save(grn));
    }

    /* ================= READ ================= */
    private String getDocRef(GrnEntity g) {
        // 1. Prefer join field if available (for LPOs)
        if (g.getLpo() != null) {
            return g.getLpo().getLpoNumber();
        }

        // 2. Handle Direct Purchases - REMOVED

        // 3. Fallback to lpoNumber field (stores LPO number or DP number or Manual Ref)
        // Ensure we don't return generic labels if we have a real referenceId or
        // something else
        if (g.getLpoNumber() != null && !g.getLpoNumber().isBlank() &&
                !g.getLpoNumber().equalsIgnoreCase("Manual") &&
                !g.getLpoNumber().equalsIgnoreCase("(Link-Lost)")) {
            return g.getLpoNumber();
        }

        // 4. Ultimate fallback
        return (g.getSourceType() == GrnSourceType.MANUAL) ? "Manual" : "(Link-Lost)";
    }

    @Transactional(readOnly = true)
    public List<GrnListResponse> list() {
        return grnRepo.findAll().stream().map(g -> {
            return new GrnListResponse(
                    g.getId(),
                    g.getGrnNo(),
                    g.getGrnDate(),
                    g.getVendorName(),
                    getDocRef(g),
                    g.getWarehouse() != null ? g.getWarehouse().getName() : null,
                    g.getPackageCount(),
                    g.getGrandTotal(),
                    g.getQcStatus().name(),
                    "Not Invoiced",
                    g.isStockPosted(),
                    g.getStatus().name(),
                    g.getReferenceId(),
                    g.getSourceType() != null ? g.getSourceType().name() : null);
        }).toList();
    }

    @Transactional(readOnly = true)
    public GrnDetailResponse get(Long id) {
        return mapDetail(
                grnRepo.findById(id)
                        .orElseThrow(() -> new RuntimeException("GRN not found")));
    }

    /* ================= DELETE ================= */

    public void delete(Long id) {

        GrnEntity grn = grnRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("GRN not found"));

        if (grn.isStockPosted()) {
            throw new IllegalStateException("Cannot delete posted GRN");
        }

        grnRepo.delete(grn);
    }

    /* ================= QC FLOW ================= */

    public void submitQc(Long id) {

        GrnEntity g = grnRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("GRN not found"));

        if (g.getStatus() != GrnStatus.DRAFT) {
            throw new IllegalStateException("Only DRAFT GRN can be submitted for QC");
        }

        g.setStatus(GrnStatus.QC_PENDING);
        g.setQcStatus(QcStatus.IN_PROGRESS);
    }

    public void approveQc(Long id) {

        GrnEntity g = grnRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("GRN not found"));

        if (g.getQcStatus() != QcStatus.IN_PROGRESS) {
            throw new IllegalStateException("QC not in progress");
        }

        g.setStatus(GrnStatus.QC_COMPLETED);
        g.setQcStatus(QcStatus.COMPLETED);
    }

    /* ================= POST STOCK (ONLY PLACE) ================= */
    @CacheEvict(value = "stockAvailability", allEntries = true)
    public void postGrn(Long grnId, GrnPostRequest postReq) {

        GrnEntity grn = grnRepo.findById(grnId)
                .orElseThrow(() -> new RuntimeException("GRN not found"));

        if (grn.isStockPosted()) {
            throw new IllegalStateException("GRN already posted");
        }

        if (grn.getQcStatus() != QcStatus.COMPLETED) {
            throw new IllegalStateException("QC not completed");
        }

        if (grn.getItems().isEmpty()) {
            throw new IllegalStateException("GRN has no items");
        }

        // Extract location hierarchy from GRN header
        Long grnZoneId = grn.getZone() != null ? grn.getZone().getId() : null;
        Long grnLocatorId = grn.getLocator() != null ? grn.getLocator().getId() : null;
        Long grnBinId = grn.getBin() != null ? grn.getBin().getId() : null;

        // Per-item bin override map (takes precedence over GRN-level bin)
        java.util.Map<Long, Long> productBinMap = new java.util.HashMap<>();
        if (postReq != null && postReq.binMappings() != null) {
            for (GrnPostRequest.ItemBinMapping mapping : postReq.binMappings()) {
                if (mapping.binCode() != null && !mapping.binCode().isBlank()) {
                    binRepo.findByCode(mapping.binCode())
                            .ifPresent(bin -> productBinMap.put(mapping.productId(), bin.getId()));
                }
            }
        }

        for (GrnItemEntity item : grn.getItems()) {

            Integer accepted = item.getAcceptedQty() != null ? item.getAcceptedQty() : 0;
            Integer foc = item.getFocQty() != null ? item.getFocQty() : 0;

            if (accepted <= 0 && foc <= 0) {
                continue; // Skip rejected/zero items
            }

            // Use per-item bin override if provided, otherwise fall back to GRN header bin
            Long effectiveBinId = productBinMap.getOrDefault(item.getProduct().getId(), grnBinId);

            stockMovementService.postInboundStock(
                    StockSourceType.GRN,
                    grn.getId(),
                    item.getProduct().getId(),
                    grn.getWarehouse().getId(),
                    grnZoneId, // Zone from GRN header
                    grnLocatorId, // Locator from GRN header
                    effectiveBinId, // Per-item override or GRN-level bin
                    accepted + foc,
                    grn.getGrnNo());
        }

        grn.setStockPosted(true);
        grn.setStatus(GrnStatus.POSTED);

        // Update linked LPO to COMPLETED
        if (grn.getLpo() != null) {
            Lpo lpo = grn.getLpo();
            lpo.setStatus(com.billbull.backend.purchase.lpo.LpoStatus.COMPLETED);
            lpoRepo.save(lpo);
        }

        grnRepo.save(grn);

        // 🔵 TRIGGER ACCOUNTING POSTING
        // Dr. Inventory, Cr. GRN Clearing (Accrual)
        postingEngineService.createJournalFromGRN(grn);
    }

    /* ================= MAPPER ================= */

    private GrnDetailResponse mapDetail(GrnEntity g) {
        // Bulk-fetch primary images for all items in one query
        java.util.List<Long> productIds = g.getItems().stream()
                .map(i -> i.getProduct().getId()).toList();
        java.util.Map<Long, String> imageMap = new java.util.HashMap<>();
        productMediaRepo.findByProductIdInAndIsPrimaryTrue(productIds)
                .forEach(m -> imageMap.put(m.getProduct().getId(), m.getImageUrl()));

        return new GrnDetailResponse(
                g.getId(),
                g.getGrnNo(),
                g.getGrnDate(),
                g.getVendorName(),
                getDocRef(g),
                g.getStatus().name(),
                g.getQcStatus().name(),
                g.isStockPosted(),
                g.getWarehouse() != null ? g.getWarehouse().getId() : null,
                g.getWarehouse() != null ? g.getWarehouse().getName() : null,
                g.getZone() != null ? g.getZone().getId() : null,
                g.getZone() != null ? g.getZone().getName() : null,
                g.getLocator() != null ? g.getLocator().getId() : null,
                g.getLocator() != null ? g.getLocator().getName() : null,
                g.getBin() != null ? g.getBin().getId() : null,
                g.getBin() != null ? g.getBin().getName() : null,
                g.getItems().stream().map(i -> new GrnItemResponse(
                        i.getId(),
                        i.getProduct().getId(),
                        i.getProductCode(),
                        i.getProductName(),
                        i.getBarcode() != null && !i.getBarcode().isBlank()
                                ? i.getBarcode()
                                : productBarcodeRepo.findByProductId(i.getProduct().getId()).stream()
                                        .map(b -> b.getBarcode())
                                        .filter(b -> b != null && !b.isBlank())
                                        .findFirst()
                                        .orElse(null),
                        imageMap.get(i.getProduct().getId()),
                        i.getUom(),
                        i.getLpoQty(),
                        i.getReceivedQty(),
                        i.getAcceptedQty(),
                        i.getRejectedQty(),
                        i.getUnitCost(),
                        i.getNetCost(),
                        i.getLineTotal(),
                        i.isBatchManaged(),
                        i.getFocQty(),
                        i.getFocUnit(),
                        i.getRemarks())).toList());
    }

    private String generateGrnNo() {
        String year = String.valueOf(LocalDate.now().getYear());
        String prefix = "GRN-" + year + "-";

        return grnRepo.findTopByGrnNoStartingWithOrderByGrnNoDesc(prefix)
                .map(lastGrn -> {
                    try {
                        String lastNo = lastGrn.getGrnNo();
                        int sequence = Integer.parseInt(lastNo.substring(prefix.length()));
                        return prefix + String.format("%05d", sequence + 1);
                    } catch (Exception e) {
                        return prefix + "00001"; // Fallback if parsing fails
                    }
                })
                .orElse(prefix + "00001");
    }
}
