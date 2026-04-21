package com.billbull.backend.purchase.lpo;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.product.ProductMediaRepository;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.inventory.warehouse.ZoneRepository;
import com.billbull.backend.inventory.warehouse.LocatorRepository;
import com.billbull.backend.inventory.warehouse.BinRepository;
import com.billbull.backend.purchase.grn.GrnRepository;
import com.billbull.backend.purchase.grn.GrnSourceType;
import com.billbull.backend.purchase.stockmovement.StockMovementService;
import com.billbull.backend.purchase.stockmovement.StockSourceType;

import com.billbull.backend.purchase.grn.GrnEntity;
import com.billbull.backend.purchase.grn.GrnEntity;
import com.billbull.backend.purchase.invoice.PurchaseInvoice;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.purchase.invoice.InvoiceStatus;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceItem;
import com.billbull.backend.purchase.lpo.workflow.*;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.util.DocumentOrderingUtil;
import com.billbull.backend.common.workflow.ApprovalStatus;
import jakarta.transaction.Transactional;

@Service
@Transactional
public class LpoService {

    private final LpoRepository repository;
    private final ProductRepository productRepository;
    private final WarehouseRepository warehouseRepository;
    private final ZoneRepository zoneRepository;
    private final LocatorRepository locatorRepository;
    private final BinRepository binRepository;
    private final StockMovementService stockMovementService;
    private final GrnRepository grnRepository;
    private final PurchaseInvoiceRepository invoiceRepository;
    private final ApprovalWorkflowService approvalWorkflowService;
    private final ApprovalHistoryRepository approvalHistoryRepository;
    private final ProductMediaRepository productMediaRepository;
    private final ProductBarcodeRepository productBarcodeRepository;
    private final BranchAccessService branchAccessService;

    public LpoService(
            LpoRepository repository,
            ProductRepository productRepository,
            WarehouseRepository warehouseRepository,
            ZoneRepository zoneRepository,
            LocatorRepository locatorRepository,
            BinRepository binRepository,
            StockMovementService stockMovementService,
            GrnRepository grnRepository,
            PurchaseInvoiceRepository invoiceRepository,
            ApprovalWorkflowService approvalWorkflowService,
            ApprovalHistoryRepository approvalHistoryRepository,
            ProductMediaRepository productMediaRepository,
            ProductBarcodeRepository productBarcodeRepository,
            BranchAccessService branchAccessService) {
        this.repository = repository;
        this.productRepository = productRepository;
        this.warehouseRepository = warehouseRepository;
        this.zoneRepository = zoneRepository;
        this.locatorRepository = locatorRepository;
        this.binRepository = binRepository;
        this.stockMovementService = stockMovementService;
        this.grnRepository = grnRepository;
        this.invoiceRepository = invoiceRepository;
        this.approvalWorkflowService = approvalWorkflowService;
        this.approvalHistoryRepository = approvalHistoryRepository;
        this.productMediaRepository = productMediaRepository;
        this.productBarcodeRepository = productBarcodeRepository;
        this.branchAccessService = branchAccessService;
    }

    /* ================= CREATE ================= */

    /* ================= CREATE ================= */

    public LpoDetailResponse create(LpoRequest request) {
        Lpo lpo = new Lpo();
        lpo.setLpoNumber(generateLpoNumber());
        lpo.setStatus(LpoStatus.DRAFT);
        lpo.setLpoDate(LocalDate.now());

        mapHeader(lpo, request);
        syncItems(lpo, request.getItems());
        calculateTotals(lpo);

        Lpo savedLpo = repository.save(lpo);
        return toDetailDto(savedLpo);
    }

    /* ================= LIST ================= */

    public List<LpoListResponse> list(LpoStatus status) {
        List<Lpo> lpos = new ArrayList<>(branchAccessService.filterBranchScoped((status == null)
                ? repository.findAll()
                : repository.findByStatus(status), Lpo::getBranchId));
        DocumentOrderingUtil.sortByDocumentDateAndNumberDesc(
                lpos,
                Lpo::getLpoDate,
                Lpo::getLpoNumber,
                Lpo::getId);

        return lpos.stream().map(this::toListDto).toList();
    }

    /* ================= GET ================= */

    @Transactional
    public LpoDetailResponse getByNumber(String lpoNumber) {

        Lpo lpo = repository.findByLpoNumber(lpoNumber)
                .orElseThrow(() -> new RuntimeException("LPO not found"));
        branchAccessService.assertTransactionBranchAccessible(lpo.getBranchId(), "LPO");

        return toDetailDto(lpo);
    }

    /* ================= UPDATE ================= */

    public LpoDetailResponse update(String lpoNumber, LpoRequest request) {

        Lpo lpo = getEntityByNumber(lpoNumber);

        if (lpo.getStatus() != LpoStatus.DRAFT) {
            throw new IllegalStateException("Only DRAFT LPO can be edited");
        }

        mapHeader(lpo, request);
        syncItems(lpo, request.getItems());
        calculateTotals(lpo);

        Lpo savedLpo = repository.save(lpo);
        return toDetailDto(savedLpo);
    }

    /* ================= DELETE ================= */

    public void delete(String lpoNumber) {

        Lpo lpo = getEntityByNumber(lpoNumber);

        if (lpo.getStatus() != LpoStatus.DRAFT) {
            throw new IllegalStateException("Only DRAFT LPO can be deleted");
        }

        repository.delete(lpo);
    }

    /* ================= WORKFLOW ================= */

    @Transactional
    public void submitForApproval(Long id) {

        Lpo lpo = getScopedLpoById(id);

        if (lpo.getStatus() != LpoStatus.DRAFT) {
            throw new IllegalStateException("Only DRAFT LPO can be submitted");
        }

        lpo.setStatus(LpoStatus.PENDING_APPROVAL);
        approvalWorkflowService.initializeApproval(lpo);
    }

    @Transactional
    public void approve(Long id, String username, List<String> roles, String remarks) {

        Lpo lpo = getScopedLpoById(id);

        if (lpo.getStatus() != LpoStatus.PENDING_APPROVAL) {
            throw new IllegalStateException("Only PENDING_APPROVAL LPO can be approved");
        }

        approvalWorkflowService.processApproval(lpo, username, roles, remarks);

        // If approved by final step, update operational status
        if (lpo.getApprovalStatus() == ApprovalStatus.APPROVED) {
            lpo.setStatus(LpoStatus.APPROVED);
        }
    }

    @Transactional
    public void rejectById(Long id, String username, List<String> roles, String remarks) {
        Lpo lpo = getScopedLpoById(id);

        if (lpo.getStatus() != LpoStatus.PENDING_APPROVAL) {
            throw new IllegalStateException("Only PENDING_APPROVAL LPO can be rejected");
        }

        approvalWorkflowService.processRejection(lpo, username, roles, remarks);
        lpo.setStatus(LpoStatus.CANCELLED);
    }

    @Transactional
    public void revertToDraft(Long id) {
        Lpo lpo = getScopedLpoById(id);

        // Check if GRN or Invoice exists (safety check)
        // For now, allow revert if not fully completed
        if (lpo.getStatus() == LpoStatus.COMPLETED) {
            throw new IllegalStateException("Completed LPO cannot be reverted to draft");
        }

        approvalWorkflowService.revertToDraft(lpo);
        lpo.setStatus(LpoStatus.DRAFT);
        repository.save(lpo);
    }

    /* ================= HELPERS ================= */

    private Lpo getEntityByNumber(String lpoNumber) {
        Lpo lpo = repository.findByLpoNumber(lpoNumber)
                .orElseThrow(() -> new RuntimeException("LPO not found"));
        branchAccessService.assertTransactionBranchAccessible(lpo.getBranchId(), "LPO");
        return lpo;
    }

    private void mapHeader(Lpo lpo, LpoRequest r) {

        lpo.setVendorName(r.getVendorName());
        lpo.setVendorCode(r.getVendorCode());
        lpo.setSource(r.getSource());
        lpo.setExpectedDeliveryDate(r.getExpectedDeliveryDate());
        lpo.setPurchaseType(
                r.getPurchaseType() != null ? r.getPurchaseType().name() : null);
        lpo.setBuyerAssigned(r.getBuyerAssigned());
        lpo.setReferenceDocument(r.getReferenceDocument());

        Warehouse warehouse = warehouseRepository.findById(r.getWarehouseId())
                .orElseThrow(() -> new IllegalArgumentException("Invalid warehouseId: " + r.getWarehouseId()));

        Branch branch = resolveBranchForLpo(lpo);
        if (branch != null) {
            branchAccessService.assertWarehouseMatchesBranch(warehouse, branch.getId(), "LPO");
            lpo.setBranchId(branch.getId());
            lpo.setBranchName(branch.getName());
            lpo.setBranchCode(branch.getCode());
        } else {
            lpo.setBranchId(null);
            lpo.setBranchName(null);
            lpo.setBranchCode(null);
        }

        lpo.setWarehouse(warehouse);
        lpo.setDeliveryLocation(warehouse.getName());

        if (r.getZoneId() != null) {
            lpo.setZone(zoneRepository.findById(r.getZoneId()).orElse(null));
        } else {
            lpo.setZone(null);
        }

        if (r.getLocatorId() != null) {
            lpo.setLocator(locatorRepository.findById(r.getLocatorId()).orElse(null));
        } else {
            lpo.setLocator(null);
        }

        if (r.getBinId() != null) {
            lpo.setBin(binRepository.findById(r.getBinId()).orElse(null));
        } else {
            lpo.setBin(null);
        }

    }

    private void syncItems(Lpo lpo, List<LpoItemRequest> requests) {

        lpo.getItems().clear();

        for (LpoItemRequest r : requests) {

            Product product = productRepository.findById(r.getProductId())
                    .orElseThrow(() -> new IllegalArgumentException("Invalid productId: " + r.getProductId()));

            if (r.getQuantity() == null || r.getQuantity() <= 0) {
                throw new IllegalArgumentException("Item quantity must be greater than zero");
            }

            LpoItem item = new LpoItem();
            item.setLpo(lpo);
            item.setProduct(product);
            item.setItemCode(product.getCode());
            item.setItemName(r.getItemName() != null && !r.getItemName().isBlank() ? r.getItemName() : product.getName());
            item.setBarcode(r.getBarcode());
            item.setUom(r.getUom());
            item.setQuantity(r.getQuantity());
            item.setUnitPrice(r.getUnitPrice());
            item.setDiscountPercent(r.getDiscountPercent());
            item.setLastPrice(r.getLastPrice());
            item.setCurrentCost(r.getCurrentCost());
            item.setRemarks(r.getRemarks());
            item.setFocQty(r.getFocQty());
            item.setFocUnit(r.getFocUnit());

            BigDecimal fallbackLineTotal = r.getUnitPrice().multiply(BigDecimal.valueOf(r.getQuantity()));
            item.setLineTotal(r.getLineTotal() != null ? r.getLineTotal() : fallbackLineTotal);

            lpo.getItems().add(item);
        }
    }

    private static final BigDecimal DEFAULT_PURCHASE_TAX = BigDecimal.valueOf(5);

    private BigDecimal resolveItemPurchaseTax(Product product) {
        if (product != null && product.getTax() != null && product.getTax().getPurchaseTax() != null) {
            return product.getTax().getPurchaseTax();
        }
        return DEFAULT_PURCHASE_TAX;
    }

    private void calculateTotals(Lpo lpo) {

        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal taxTotal = BigDecimal.ZERO;

        for (LpoItem item : lpo.getItems()) {
            BigDecimal lineTotal = item.getLineTotal() != null ? item.getLineTotal() : BigDecimal.ZERO;
            BigDecimal taxPercent = resolveItemPurchaseTax(item.getProduct());
            BigDecimal lineTax = lineTotal.multiply(taxPercent).divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
            subtotal = subtotal.add(lineTotal);
            taxTotal = taxTotal.add(lineTax);
        }

        lpo.setSubtotal(subtotal);
        lpo.setDiscount(BigDecimal.ZERO);
        lpo.setTax(taxTotal);
        lpo.setGrandTotal(subtotal.add(taxTotal));
    }

    private String generateLpoNumber() {
        return "LPO-" + System.currentTimeMillis();
    }

    private LpoListResponse toListDto(Lpo lpo) {

        LpoListResponse dto = new LpoListResponse(
                lpo.getLpoNumber(),
                lpo.getVendorName(),
                lpo.getVendorCode(),
                lpo.getSource() != null ? lpo.getSource().name() : "MANUAL",
                lpo.getLpoDate(),
                lpo.getItems() != null ? lpo.getItems().size() : 0,
                lpo.getGrandTotal(),
                lpo.getStatus(),
                lpo.getApprovedBy(),
                lpo.getExpectedDeliveryDate(),
                calculateOverallReceivedPercentage(lpo, getFulfilledQuantitiesMap(lpo)),
                lpo.isStockPosted(),
                lpo.getApprovalStatus() != null ? lpo.getApprovalStatus().name() : null);

        dto.setDbId(lpo.getId());
        dto.setWarehouseId(lpo.getWarehouse() != null ? lpo.getWarehouse().getId() : null);
        dto.setBranchId(lpo.getBranchId());
        dto.setBranchName(lpo.getBranchName());
        dto.setBranchCode(lpo.getBranchCode());
        return dto;
    }

    private LpoDetailResponse toDetailDto(Lpo lpo) {
        LpoDetailResponse res = new LpoDetailResponse();
        res.setId(lpo.getId());
        res.setDbId(lpo.getId());
        res.setLpoNumber(lpo.getLpoNumber());
        res.setLpoDate(lpo.getLpoDate());
        res.setVendorName(lpo.getVendorName());
        res.setVendorCode(lpo.getVendorCode());
        res.setStatus(lpo.getStatus().name());
        res.setWarehouseName(lpo.getDeliveryLocation());
        res.setWarehouseId(lpo.getWarehouse() != null ? lpo.getWarehouse().getId() : null);
        res.setZoneId(lpo.getZone() != null ? lpo.getZone().getId() : null);
        res.setLocatorId(lpo.getLocator() != null ? lpo.getLocator().getId() : null);
        res.setBinId(lpo.getBin() != null ? lpo.getBin().getId() : null);

        res.setSubtotal(lpo.getSubtotal());
        res.setTax(lpo.getTax());
        res.setDiscount(lpo.getDiscount());
        res.setGrandTotal(lpo.getGrandTotal());

        res.setExpectedDeliveryDate(lpo.getExpectedDeliveryDate());
        res.setPurchaseType(lpo.getPurchaseType());
        res.setBuyerAssigned(lpo.getBuyerAssigned());
        res.setReferenceDocument(lpo.getReferenceDocument());
        res.setCreatedFrom(lpo.getSource() != null ? lpo.getSource().name() : "MANUAL");
        res.setBranchId(lpo.getBranchId());
        res.setBranchName(lpo.getBranchName());
        res.setBranchCode(lpo.getBranchCode());

        // 🟢 FULFILLMENT LOGIC: Calculate received or billed quantities
        Map<Long, Integer> fulfilledMap = getFulfilledQuantitiesMap(lpo);
        res.setReceivedPercentage(calculateOverallReceivedPercentage(lpo, fulfilledMap));

        List<Long> productIds = lpo.getItems().stream().map(i -> i.getProduct().getId()).toList();
        Map<Long, String> imageMap = new HashMap<>();
        productMediaRepository.findByProductIdInAndIsPrimaryTrue(productIds)
                .forEach(m -> imageMap.put(m.getProduct().getId(), m.getImageUrl()));

        List<LpoItemResponse> itemResponses = lpo.getItems().stream()
                .map(item -> {
                    LpoItemResponse itemDto = new LpoItemResponse(item);
                    itemDto.setReceivedQuantity(fulfilledMap.getOrDefault(itemDto.getProductId(), 0));
                    itemDto.setImage(imageMap.get(itemDto.getProductId()));
                    if (itemDto.getBarcode() == null || itemDto.getBarcode().isBlank()) {
                        String barcode = productBarcodeRepository.findByProductId(itemDto.getProductId()).stream()
                                .map(b -> b.getBarcode())
                                .filter(b -> b != null && !b.isBlank())
                                .findFirst()
                                .orElse(null);
                        itemDto.setBarcode(barcode);
                    }
                    return itemDto;
                })
                .toList();

        res.setItems(itemResponses);

        // Dynamic Approval Data
        res.setApprovalStatus(lpo.getApprovalStatus() != null ? lpo.getApprovalStatus().name() : null);
        res.setApprovedBy(lpo.getApprovedBy());
        res.setApprovedAt(lpo.getApprovedAt());

        List<ApprovalHistory> history = approvalHistoryRepository
                .findAllByTenantIdAndDocumentIdAndModuleOrderByStepOrderAsc(
                        lpo.getTenantId(), lpo.getId(), "LPO");

        res.setApprovalHistory(history.stream().map(h -> ApprovalHistoryResponse.builder()
                .stepOrder(h.getStepOrder())
                .roleCode(h.getRoleCode())
                .displayName(h.getDisplayName())
                .approvedBy(h.getApprovedBy())
                .approvedAt(h.getApprovedAt())
                .status(h.getStatus().name())
                .remarks(h.getRemarks())
                .build()).collect(java.util.stream.Collectors.toList()));

        return res;
    }

    private Map<Long, Integer> getFulfilledQuantitiesMap(Lpo lpo) {
        Map<Long, Integer> fulfilledMap = new HashMap<>();

        // 1. Fetch linked GRNs
        List<GrnEntity> linkedGrns = grnRepository.findByReferenceIdAndSourceTypeIn(
                lpo.getId(),
                List.of(GrnSourceType.MANUAL, GrnSourceType.SYSTEM_AUTO));

        for (GrnEntity grn : linkedGrns) {
            if (grn.getStatus() == com.billbull.backend.purchase.grn.GrnStatus.REVERSED) {
                continue;
            }
            for (com.billbull.backend.purchase.grn.GrnItemEntity grnItem : grn.getItems()) {
                if (grnItem.getProduct() == null)
                    continue;
                Long pid = grnItem.getProduct().getId();
                int qty = grnItem.getReceivedQty() != null ? grnItem.getReceivedQty() : 0;
                fulfilledMap.put(pid, fulfilledMap.getOrDefault(pid, 0) + qty);
            }
        }

        // 2. Fetch linked posted Invoices (for direct invoicing flow)
        List<PurchaseInvoice> linkedInvoices = invoiceRepository.findByLpoIdOrReferenceNo(lpo.getId(),
                lpo.getLpoNumber());
        Map<Long, Integer> billedMap = new HashMap<>();

        for (PurchaseInvoice invoice : linkedInvoices) {
            if (invoice.getStatus() != InvoiceStatus.POSTED) {
                continue;
            }
            for (PurchaseInvoiceItem invItem : invoice.getItems()) {
                if (invItem.getItemCode() == null)
                    continue;

                // Resolve product ID from code (could be optimized with a map if needed)
                var productOpt = productRepository.findByCodeAndIsActiveTrue(invItem.getItemCode());
                if (productOpt.isPresent()) {
                    Long pid = productOpt.get().getId();
                    int qty = invItem.getQty() != null ? invItem.getQty() : 0;
                    billedMap.put(pid, billedMap.getOrDefault(pid, 0) + qty);
                }
            }
        }

        // 3. Combine: Fulfillment is the maximum of what was physically received or
        // billed
        // (This handles cases where billing might precede or skip receipt)
        for (Map.Entry<Long, Integer> billedEntry : billedMap.entrySet()) {
            Long pid = billedEntry.getKey();
            int billedQty = billedEntry.getValue();
            int receivedQty = fulfilledMap.getOrDefault(pid, 0);
            fulfilledMap.put(pid, Math.max(receivedQty, billedQty));
        }

        return fulfilledMap;
    }

    private int calculateOverallReceivedPercentage(Lpo lpo, Map<Long, Integer> receivedMap) {
        if (lpo.getItems() == null || lpo.getItems().isEmpty()) {
            return 0;
        }

        long totalOrdered = 0;
        long totalReceived = 0;

        for (LpoItem item : lpo.getItems()) {
            int ordered = item.getQuantity() != null ? item.getQuantity() : 0;
            int received = receivedMap.getOrDefault(item.getProduct().getId(), 0);

            totalOrdered += ordered;
            totalReceived += Math.min(received, ordered); // Don't exceed 100% per item for overall bar
        }

        if (totalOrdered == 0)
            return 0;
        return (int) ((totalReceived * 100) / totalOrdered);
    }

    public Lpo getById(Long id) {
        Lpo lpo = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("LPO not found"));
        branchAccessService.assertTransactionBranchAccessible(lpo.getBranchId(), "LPO");
        return lpo;
    }

    @Transactional
    public void postStockFromLpo(Long lpoId) {

        Lpo lpo = getScopedLpoById(lpoId);

        if (lpo.getStatus() != LpoStatus.APPROVED) {
            throw new IllegalStateException("Only APPROVED LPO can post stock");
        }

        if (lpo.isStockPosted()) {
            throw new IllegalStateException("Stock already posted for this LPO");
        }

        // 🔒 HARD BLOCK — GRN EXISTS FOR THIS LPO

        if (grnRepository.existsByReferenceIdAndSourceTypeIn(
                lpo.getId(),
                List.of(
                        GrnSourceType.MANUAL,
                        GrnSourceType.SYSTEM_AUTO))) {
            throw new IllegalStateException(
                    "GRN exists for this LPO. Stock must be added from GRN only.");
        }

        if (lpo.getItems().isEmpty()) {
            throw new IllegalStateException("LPO has no items");
        }

        for (LpoItem item : lpo.getItems()) {
            stockMovementService.inward(
                    StockSourceType.LPO,
                    lpo.getId(),
                    item.getProduct().getId(),
                    lpo.getWarehouse().getId(),
                    item.getQuantity(),
                    lpo.getLpoNumber());
        }

        lpo.setStockPosted(true);
        repository.save(lpo);
    }

    private Branch resolveBranchForLpo(Lpo lpo) {
        if (lpo.getId() != null && lpo.getBranchId() == null) {
            return null;
        }
        return branchAccessService.getRequiredCurrentUserBranch();
    }

    private Lpo getScopedLpoById(Long id) {
        Lpo lpo = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("LPO not found"));
        branchAccessService.assertTransactionBranchAccessible(lpo.getBranchId(), "LPO");
        return lpo;
    }

}
