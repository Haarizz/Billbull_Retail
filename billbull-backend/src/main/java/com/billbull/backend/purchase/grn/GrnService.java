package com.billbull.backend.purchase.grn;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;

import com.billbull.backend.inventory.batch.BatchMaster;
import com.billbull.backend.inventory.batch.PurchaseBatchCreationService;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.inventory.product.ProductPackingRepository;
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
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.util.DocumentOrderingUtil;

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
    private final BranchAccessService branchAccessService;
    private final ProductPackingRepository packingRepository;
    private final PurchaseBatchCreationService purchaseBatchCreationService;

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
            ProductBarcodeRepository productBarcodeRepo,
            BranchAccessService branchAccessService,
            ProductPackingRepository packingRepository,
            PurchaseBatchCreationService purchaseBatchCreationService) {
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
        this.branchAccessService = branchAccessService;
        this.packingRepository = packingRepository;
        this.purchaseBatchCreationService = purchaseBatchCreationService;
    }

    /* ================= UOM CONVERSION HELPERS ================= */

    private int resolveBaseQty(Long productId, String unitName, int qty) {
        if (qty <= 0 || unitName == null || unitName.isBlank()) return qty;
        return packingRepository.findByProductId(productId).stream()
                .filter(p -> p.getUnit() != null && unitName.equalsIgnoreCase(p.getUnit().getName()))
                .findFirst()
                .map(p -> p.getConversion() != null
                        ? BigDecimal.valueOf(qty).multiply(p.getConversion())
                                .setScale(0, RoundingMode.HALF_UP).intValue()
                        : qty)
                .orElse(qty);
    }

    /* ================= CREATE / UPDATE ================= */

    public GrnDetailResponse saveOrUpdate(Long id, GrnSaveRequest req) {

        GrnEntity grn = (id == null)
                ? new GrnEntity()
                : grnRepo.findById(id)
                        .orElseThrow(() -> new RuntimeException("GRN not found"));

        if (id != null) {
            branchAccessService.assertTransactionBranchAccessible(grn.getBranchId(), "GRN");
        }

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
                branchAccessService.assertTransactionBranchAccessible(lpo.getBranchId(), "LPO");
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

        Branch resolvedBranch = resolveBranchForGrn(grn);
        if (resolvedBranch != null) {
            branchAccessService.assertWarehouseMatchesBranch(warehouse, resolvedBranch.getId(), "GRN");
            grn.setBranchId(resolvedBranch.getId());
            grn.setBranchName(resolvedBranch.getName());
            grn.setBranchCode(resolvedBranch.getCode());
        } else {
            grn.setBranchId(null);
            grn.setBranchName(null);
            grn.setBranchCode(null);
        }
        grn.setWarehouse(warehouse);

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
            item.setDiscountPercent(i.discountPercent() != null ? i.discountPercent() : BigDecimal.ZERO);
            item.setTaxAmount(i.taxAmt());
            item.setPurchaseTax(i.purchaseTax());
            item.setBatchManaged(i.batch());
            item.setFocQty(i.focQty());
            item.setFocUnit(i.focUnit());
            item.setRemarks(i.remarks());

            subtotal = subtotal.add(i.total());
            grn.getItems().add(item);
        }

        grn.setSubtotal(subtotal);

        BigDecimal tax = grn.getItems().stream()
                .map(item -> {
                    BigDecimal lineTotal = item.getLineTotal() != null ? item.getLineTotal() : BigDecimal.ZERO;
                    if (item.getTaxAmount() != null) {
                        return item.getTaxAmount();
                    }
                    BigDecimal taxPercent = item.getPurchaseTax() != null
                            ? item.getPurchaseTax()
                            : (item.getProduct() != null
                            && item.getProduct().getTax() != null
                            && item.getProduct().getTax().getPurchaseTax() != null)
                            ? item.getProduct().getTax().getPurchaseTax()
                            : BigDecimal.valueOf(5);
                    return lineTotal.multiply(taxPercent).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
                })
                .reduce(BigDecimal.ZERO, BigDecimal::add)
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
        List<GrnEntity> grns = new ArrayList<>(
                branchAccessService.filterBranchScoped(grnRepo.findAll(), GrnEntity::getBranchId));
        DocumentOrderingUtil.sortByDocumentDateAndNumberDesc(
                grns,
                GrnEntity::getGrnDate,
                GrnEntity::getGrnNo,
                GrnEntity::getId);

        return grns.stream().map(g -> {
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
                    g.getSourceType() != null ? g.getSourceType().name() : null,
                    g.getBranchId(),
                    g.getBranchName(),
                    g.getBranchCode());
        }).toList();
    }

    @Transactional(readOnly = true)
    public GrnDetailResponse get(Long id) {
        GrnEntity grn = getScopedGrn(id);
        branchAccessService.assertTransactionBranchAccessible(grn.getBranchId(), "GRN");
        return mapDetail(grn);
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

        GrnEntity g = getScopedGrn(id);

        if (g.getStatus() != GrnStatus.DRAFT) {
            throw new IllegalStateException("Only DRAFT GRN can be submitted for QC");
        }

        if (g.getZone() == null) {
            throw new IllegalArgumentException("Zone is required before submitting GRN for QC");
        }
        if (g.getLocator() == null) {
            throw new IllegalArgumentException("Locator is required before submitting GRN for QC");
        }
        if (g.getBin() == null) {
            throw new IllegalArgumentException("Bin is required before submitting GRN for QC");
        }

        g.setStatus(GrnStatus.QC_PENDING);
        g.setQcStatus(QcStatus.IN_PROGRESS);
    }

    public void approveQc(Long id) {

        GrnEntity g = getScopedGrn(id);

        if (g.getQcStatus() != QcStatus.IN_PROGRESS) {
            throw new IllegalStateException("QC not in progress");
        }

        g.setStatus(GrnStatus.QC_COMPLETED);
        g.setQcStatus(QcStatus.COMPLETED);
    }

    /* ================= POST STOCK (ONLY PLACE) ================= */
    @Caching(evict = {
        @CacheEvict(value = "stockAvailability", allEntries = true),
        @CacheEvict(value = "productList", allEntries = true)
    })
    public void postGrn(Long grnId, GrnPostRequest postReq) {

        GrnEntity grn = getScopedGrn(grnId);

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

        purchaseBatchCreationService.createForGrnPost(grn, productBinMap);

        for (GrnItemEntity item : grn.getItems()) {

            Integer accepted = item.getAcceptedQty() != null ? item.getAcceptedQty() : 0;
            Integer foc = item.getFocQty() != null ? item.getFocQty() : 0;

            if (accepted <= 0 && foc <= 0) {
                continue; // Skip rejected/zero items
            }

            Long productId = item.getProduct().getId();
            int baseAccepted = resolveBaseQty(productId, item.getUom(), accepted);
            int baseFoc = resolveBaseQty(productId, item.getFocUnit(), foc);

            // Use per-item bin override if provided, otherwise fall back to GRN header bin
            Long effectiveBinId = productBinMap.getOrDefault(productId, grnBinId);

            if (item.getProduct().isBatch()) {
                int baseQty = baseAccepted + baseFoc;
                List<BatchMaster> batches = purchaseBatchCreationService.findForGrnLine(grn.getId(), item.getId());
                if (batches.size() != baseQty) {
                    throw new IllegalStateException(
                            "Expected " + baseQty + " purchase batches for GRN " + grn.getGrnNo()
                                    + " line #" + item.getId() + " but found " + batches.size());
                }
                for (BatchMaster batch : batches) {
                    stockMovementService.postInboundStock(
                            StockSourceType.GRN,
                            grn.getId(),
                            productId,
                            grn.getWarehouse().getId(),
                            grnZoneId,
                            grnLocatorId,
                            effectiveBinId,
                            batch.getBatchNumber(),
                            batch.getExpiryDate(),
                            batch.getUnitCost(),
                            1,
                            grn.getGrnNo());
                }
            } else {
                stockMovementService.postInboundStock(
                    StockSourceType.GRN,
                    grn.getId(),
                    productId,
                    grn.getWarehouse().getId(),
                    grnZoneId, // Zone from GRN header
                    grnLocatorId, // Locator from GRN header
                    effectiveBinId, // Per-item override or GRN-level bin
                    baseAccepted + baseFoc,
                    grn.getGrnNo());
            }
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
                g.getSubtotal(),
                g.getTaxAmount(),
                g.getGrandTotal(),
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
                        i.getDiscountPercent(),
                        i.getTaxAmount(),
                        i.isBatchManaged(),
                        i.getFocQty(),
                        i.getFocUnit(),
                        i.getRemarks(),
                        i.getPurchaseTax() != null
                                ? i.getPurchaseTax()
                                : (i.getProduct().getTax() != null && i.getProduct().getTax().getPurchaseTax() != null)
                                ? i.getProduct().getTax().getPurchaseTax()
                                : java.math.BigDecimal.valueOf(5))).toList(),
                g.getBranchId(),
                g.getBranchName(),
                g.getBranchCode());
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

    private GrnEntity getScopedGrn(Long id) {
        GrnEntity grn = grnRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("GRN not found"));
        branchAccessService.assertTransactionBranchAccessible(grn.getBranchId(), "GRN");
        return grn;
    }

    private Branch resolveBranchForGrn(GrnEntity grn) {
        if (grn.getLpo() != null) {
            if (grn.getLpo().getBranchId() == null) {
                return null;
            }
            Branch currentBranch = branchAccessService.getRequiredCurrentUserBranch();
            if (!currentBranch.getId().equals(grn.getLpo().getBranchId())) {
                throw new IllegalStateException("LPO belongs to another branch.");
            }
            return currentBranch;
        }

        if (grn.getId() != null && grn.getBranchId() == null) {
            return null;
        }

        return branchAccessService.getRequiredCurrentUserBranch();
    }
}
