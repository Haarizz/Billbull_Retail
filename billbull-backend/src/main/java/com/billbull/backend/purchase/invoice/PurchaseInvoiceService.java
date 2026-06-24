package com.billbull.backend.purchase.invoice;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.inventory.batch.BatchMaster;
import com.billbull.backend.inventory.batch.PurchaseBatchCreationService;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductMediaRepository;
import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.inventory.product.ProductPackingRepository;
import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.serial.SerialMaster;
import com.billbull.backend.inventory.serial.SerialMasterRepository;
import com.billbull.backend.inventory.warehouse.BinRepository;
import com.billbull.backend.inventory.warehouse.BinStockRepository;
import com.billbull.backend.inventory.warehouse.LocatorRepository;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.inventory.warehouse.ZoneRepository;
import com.billbull.backend.purchase.grn.GrnEntity;
import com.billbull.backend.purchase.grn.GrnRepository;
import com.billbull.backend.purchase.lpo.Lpo;
import com.billbull.backend.purchase.lpo.LpoRepository;
import com.billbull.backend.purchase.lpo.LpoStatus;
import com.billbull.backend.purchase.payment.PaymentMode;
import com.billbull.backend.purchase.payment.PaymentVoucher;
import com.billbull.backend.purchase.payment.PaymentVoucherService;
import com.billbull.backend.purchase.serial.PurchaseSerialDraft;
import com.billbull.backend.purchase.serial.PurchaseSerialService;
import com.billbull.backend.purchase.stockmovement.StockMovementService;
import com.billbull.backend.purchase.stockmovement.StockSourceType;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.util.DocumentOrderingUtil;

import jakarta.transaction.Transactional;

@Service
@Transactional
public class PurchaseInvoiceService {

    private final PurchaseInvoiceRepository repository;
    private final GrnRepository grnRepo;
    private final PostingEngineService postingEngineService;
    private final StockMovementService stockService;
    private final ProductRepository productRepository;
    private final ProductPricingRepository productPricingRepository;
    private final BinStockRepository binStockRepository;
    private final WarehouseRepository warehouseRepository;
    private final ZoneRepository zoneRepository;
    private final LocatorRepository locatorRepository;
    private final BinRepository binRepository;
    private final LpoRepository lpoRepository;
    private final PaymentVoucherService paymentVoucherService;
    private final ProductMediaRepository productMediaRepository;
    private final ProductBarcodeRepository productBarcodeRepository;
    private final BranchAccessService branchAccessService;
    private final ProductPackingRepository packingRepository;
    private final PurchaseBatchCreationService purchaseBatchCreationService;
    private final PurchaseSerialService purchaseSerialService;
    private final SerialMasterRepository serialMasterRepository;
    private final com.billbull.backend.purchase.settings.PurchaseDocumentNumberingService documentNumberingService;

    public PurchaseInvoiceService(PurchaseInvoiceRepository repository, GrnRepository grnRepo,
            PostingEngineService postingEngineService, StockMovementService stockService,
            ProductRepository productRepository, ProductPricingRepository productPricingRepository,
            BinStockRepository binStockRepository, WarehouseRepository warehouseRepository,
            ZoneRepository zoneRepository, LocatorRepository locatorRepository, BinRepository binRepository,
            LpoRepository lpoRepository, PaymentVoucherService paymentVoucherService,
            ProductMediaRepository productMediaRepository,
            ProductBarcodeRepository productBarcodeRepository,
            BranchAccessService branchAccessService,
            ProductPackingRepository packingRepository,
            PurchaseBatchCreationService purchaseBatchCreationService,
            PurchaseSerialService purchaseSerialService,
            SerialMasterRepository serialMasterRepository,
            com.billbull.backend.purchase.settings.PurchaseDocumentNumberingService documentNumberingService) {
        super();
        this.repository = repository;
        this.grnRepo = grnRepo;
        this.postingEngineService = postingEngineService;
        this.stockService = stockService;
        this.productRepository = productRepository;
        this.productPricingRepository = productPricingRepository;
        this.binStockRepository = binStockRepository;
        this.warehouseRepository = warehouseRepository;
        this.zoneRepository = zoneRepository;
        this.locatorRepository = locatorRepository;
        this.binRepository = binRepository;
        this.lpoRepository = lpoRepository;
        this.paymentVoucherService = paymentVoucherService;
        this.productMediaRepository = productMediaRepository;
        this.productBarcodeRepository = productBarcodeRepository;
        this.branchAccessService = branchAccessService;
        this.packingRepository = packingRepository;
        this.purchaseBatchCreationService = purchaseBatchCreationService;
        this.purchaseSerialService = purchaseSerialService;
        this.serialMasterRepository = serialMasterRepository;
        this.documentNumberingService = documentNumberingService;
    }

    /* ================= UOM CONVERSION HELPERS ================= */

    private int resolveBaseQty(Long productId, String unitName, int qty) {
        if (qty <= 0 || unitName == null || unitName.isBlank()) return qty;
        return packingRepository.findByProductId(productId).stream()
                .filter(p -> p.getUnit() != null && unitName.equalsIgnoreCase(p.getUnit().getName()))
                .findFirst()
                .map(p -> p.getConversion() != null
                        ? BigDecimal.valueOf(qty).multiply(p.getConversion())
                                .setScale(0, java.math.RoundingMode.HALF_UP).intValue()
                        : qty)
                .orElse(qty);
    }

    private BigDecimal resolveBaseUnitCost(Long productId, String unitName, BigDecimal uomCost) {
        if (uomCost == null || unitName == null || unitName.isBlank()) return uomCost;
        return packingRepository.findByProductId(productId).stream()
                .filter(p -> p.getUnit() != null && unitName.equalsIgnoreCase(p.getUnit().getName()))
                .findFirst()
                .map(p -> (p.getConversion() != null && p.getConversion().compareTo(BigDecimal.ZERO) > 0)
                        ? uomCost.divide(p.getConversion(), 4, java.math.RoundingMode.HALF_UP)
                        : uomCost)
                .orElse(uomCost);
    }

    private BigDecimal nvl(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }

    private List<BigDecimal> calculateLandedCostShares(PurchaseInvoice invoice) {
        List<PurchaseInvoiceItem> items = invoice.getItems() != null ? invoice.getItems() : List.of();
        BigDecimal landedCostTotal = nvl(invoice.getLandedCost());
        if (items.isEmpty() || landedCostTotal.compareTo(BigDecimal.ZERO) <= 0) {
            return java.util.Collections.nCopies(items.size(), BigDecimal.ZERO);
        }

        List<BigDecimal> lineValues = new ArrayList<>(items.size());
        BigDecimal totalLineValue = BigDecimal.ZERO;
        for (PurchaseInvoiceItem item : items) {
            BigDecimal lineValue = nvl(item.getUnitCost())
                    .multiply(BigDecimal.valueOf(item.getQty() != null ? item.getQty() : 0));
            lineValues.add(lineValue);
            totalLineValue = totalLineValue.add(lineValue);
        }

        if (totalLineValue.compareTo(BigDecimal.ZERO) <= 0) {
            return java.util.Collections.nCopies(items.size(), BigDecimal.ZERO);
        }

        List<BigDecimal> shares = new ArrayList<>(items.size());
        BigDecimal allocated = BigDecimal.ZERO;
        for (int i = 0; i < items.size(); i++) {
            BigDecimal share;
            if (i == items.size() - 1) {
                share = landedCostTotal.subtract(allocated);
            } else {
                share = landedCostTotal.multiply(lineValues.get(i))
                        .divide(totalLineValue, 4, RoundingMode.HALF_UP);
                allocated = allocated.add(share);
            }
            shares.add(share.max(BigDecimal.ZERO));
        }
        return shares;
    }

    /* ================= VENDOR INVOICE NO VALIDATION ================= */

    private void validateVendorInvoiceNo(String vendorName, String vendorInvoiceNo, Long excludeId) {
        if (vendorInvoiceNo == null || vendorInvoiceNo.isBlank()) {
            throw new IllegalArgumentException("Vendor invoice number is required");
        }
        String trimmed = vendorInvoiceNo.trim();
        if (trimmed.length() < 3 || trimmed.length() > 50) {
            throw new IllegalArgumentException("Vendor invoice number must be between 3 and 50 characters");
        }
        boolean duplicate = excludeId != null
                ? repository.existsByVendorNameAndVendorInvoiceNoAndIdNot(vendorName, trimmed, excludeId)
                : repository.existsByVendorNameAndVendorInvoiceNo(vendorName, trimmed);
        if (duplicate) {
            throw new IllegalStateException(
                    "Vendor invoice number '" + trimmed + "' already exists for this vendor");
        }
    }

    /* ================= CREATE (DRAFT) ================= */

    public PurchaseInvoice createDraft(PurchaseInvoiceRequest req) {
        validateVendorInvoiceNo(req.getVendorName(), req.getVendorInvoiceNo(), null);
        PurchaseInvoice invoice = mapToEntity(req);
        invoice.setStatus(InvoiceStatus.DRAFT);
        invoice.setPaymentStatus(PaymentStatus.UNPAID);
        PurchaseInvoice saved = repository.saveAndFlush(invoice);
        purchaseBatchCreationService.replaceForPurchaseInvoice(saved);
        return saved;
    }

    public PurchaseInvoiceResponse createDraftFromLpo(Long lpoId) {
        Lpo lpo = lpoRepository.findById(lpoId)
                .orElseThrow(() -> new IllegalArgumentException("LPO not found"));
        branchAccessService.assertTransactionBranchAccessible(lpo.getBranchId(), "LPO");

        List<LpoStatus> allowed = List.of(
                LpoStatus.APPROVED, LpoStatus.SENT_TO_VENDOR, LpoStatus.PARTIALLY_RECEIVED);
        if (!allowed.contains(lpo.getStatus())) {
            throw new IllegalStateException("Only APPROVED LPOs can be directly invoiced");
        }

        PurchaseInvoiceResponse dto = new PurchaseInvoiceResponse();
        dto.setSourceType("AGAINST_LPO");
        dto.setInvoiceDate(LocalDate.now());
        dto.setVendorInvoiceDate(LocalDate.now());
        dto.setVendorName(lpo.getVendorName());
        if (lpo.getWarehouse() != null) {
            dto.setWarehouseName(lpo.getWarehouse().getName());
            dto.setWarehouseId(lpo.getWarehouse().getId());
        }
        if (lpo.getZone() != null) dto.setZoneId(lpo.getZone().getId());
        if (lpo.getLocator() != null) dto.setLocatorId(lpo.getLocator().getId());
        if (lpo.getBin() != null) dto.setBinId(lpo.getBin().getId());
        dto.setLpoId(lpo.getId());
        dto.setReferenceNo(lpo.getLpoNumber());
        dto.setBranchId(lpo.getBranchId());
        dto.setBranchName(lpo.getBranchName());
        dto.setBranchCode(lpo.getBranchCode());

        BigDecimal headerSubTotal = BigDecimal.ZERO;
        BigDecimal headerTaxTotal = BigDecimal.ZERO;
        BigDecimal headerDiscountTotal = BigDecimal.ZERO;
        var imageMap = buildPrimaryImageMap(
                lpo.getItems().stream()
                        .map(i -> i.getItemCode())
                        .toList());

        var lineItems = lpo.getItems().stream().map(i -> {
            InvoiceItemDraft d = new InvoiceItemDraft();
            d.setItemCode(i.getItemCode());
            d.setItemName(i.getItemName());
            d.setImage(imageMap.get(i.getItemCode()));
            d.setUom(i.getUom());
            d.setQty(i.getQuantity());
            BigDecimal unitCost = i.getUnitPrice() != null ? i.getUnitPrice() : BigDecimal.ZERO;
            d.setUnitCost(unitCost);

            BigDecimal taxPercent = (i.getProduct() != null
                    && i.getProduct().getTax() != null
                    && i.getProduct().getTax().getPurchaseTax() != null)
                    ? i.getProduct().getTax().getPurchaseTax()
                    : BigDecimal.valueOf(5);
            
            BigDecimal base = unitCost.multiply(BigDecimal.valueOf(i.getQuantity() != null ? i.getQuantity() : 0));
            
            d.setDiscountPercent(i.getDiscountPercent());
            BigDecimal discountAmt = BigDecimal.ZERO;
            if (i.getDiscountPercent() != null && i.getDiscountPercent().compareTo(BigDecimal.ZERO) > 0) {
                discountAmt = base.multiply(i.getDiscountPercent()).divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
            }
            d.setDiscountAmount(discountAmt);
            
            BigDecimal taxableBase = base.subtract(discountAmt);
            BigDecimal taxAmount = taxableBase.multiply(taxPercent).divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);

            d.setTaxPercent(taxPercent);
            d.setTaxAmount(taxAmount);
            d.setLineTotal(taxableBase.add(taxAmount));
            d.setFocQty(i.getFocQty());
            d.setFocUnit(i.getFocUnit());
            d.setRemarks(i.getRemarks());
            
            if (i.getProduct() != null) {
                d.setSku(i.getProduct().getSku());
                d.setBrandName(i.getProduct().getBrand() != null ? i.getProduct().getBrand().getName() : null);
                d.setShortDesc(i.getProduct().getShortDesc());
                d.setLocalName(i.getProduct().getLocalName());
                d.setDetailedDesc(i.getProduct().getDetailedDesc());
                d.setSerialEnabled(i.getProduct().isSerial());
                d.setBarcode(productBarcodeRepository.findByProductId(i.getProduct().getId()).stream()
                        .map(b -> b.getBarcode())
                        .filter(b -> b != null && !b.isBlank())
                        .findFirst()
                        .orElse(null));
            }
            d.setSerials(List.of());

            return d;
        }).toList();

        for (InvoiceItemDraft d : lineItems) {
            BigDecimal lineBase = d.getUnitCost().multiply(BigDecimal.valueOf(d.getQty() != null ? d.getQty() : 0));
            headerSubTotal = headerSubTotal.add(lineBase);
            headerDiscountTotal = headerDiscountTotal.add(d.getDiscountAmount() != null ? d.getDiscountAmount() : BigDecimal.ZERO);
            headerTaxTotal = headerTaxTotal.add(d.getTaxAmount() != null ? d.getTaxAmount() : BigDecimal.ZERO);
        }

        dto.setItems(lineItems);
        dto.setSubTotal(headerSubTotal);
        dto.setTaxTotal(headerTaxTotal);
        dto.setGrandTotal(headerSubTotal.subtract(headerDiscountTotal).add(headerTaxTotal));

        return dto;
    }

    public PurchaseInvoiceResponse createDraftFromGrn(Long grnId) {

        GrnEntity grn = grnRepo.findById(grnId)
                .orElseThrow(() -> new IllegalArgumentException("GRN not found"));
        branchAccessService.assertTransactionBranchAccessible(grn.getBranchId(), "GRN");

        if (!grn.isStockPosted()) {
            throw new IllegalStateException("Only POSTED GRN can be invoiced");
        }

        PurchaseInvoiceResponse dto = new PurchaseInvoiceResponse();

        dto.setSourceType("AGAINST_GRN");
        dto.setInvoiceDate(LocalDate.now());
        dto.setVendorInvoiceDate(LocalDate.now());
        dto.setVendorName(grn.getVendorName());
        dto.setWarehouseName(grn.getWarehouse().getName());
        dto.setWarehouseId(grn.getWarehouse().getId());
        if (grn.getZone() != null) dto.setZoneId(grn.getZone().getId());
        if (grn.getLocator() != null) dto.setLocatorId(grn.getLocator().getId());
        if (grn.getBin() != null) dto.setBinId(grn.getBin().getId());
        dto.setGrnId(grn.getId());
        dto.setGrnNo(grn.getGrnNo());
        dto.setReferenceNo(grn.getGrnNo());
        dto.setBranchId(grn.getBranchId());
        dto.setBranchName(grn.getBranchName());
        dto.setBranchCode(grn.getBranchCode());

        BigDecimal headerSubTotal = BigDecimal.ZERO;
        BigDecimal headerTaxTotal = BigDecimal.ZERO;
        var imageMap = buildPrimaryImageMap(
                grn.getItems().stream()
                        .map(i -> i.getProductCode())
                        .toList());

        var lineItems = grn.getItems().stream().map(i -> {
            InvoiceItemDraft d = new InvoiceItemDraft();

            d.setItemCode(i.getProductCode());
            d.setItemName(i.getProductName());
            d.setImage(imageMap.get(i.getProductCode()));
            d.setUom(i.getUom());
            d.setQty(i.getAcceptedQty());
            BigDecimal qty = BigDecimal.valueOf(i.getAcceptedQty() != null ? i.getAcceptedQty() : 0);
            BigDecimal grossUnitCost = nvl(i.getUnitCost());
            BigDecimal netLineBase = i.getLineTotal() != null
                    ? i.getLineTotal()
                    : (i.getNetCost() != null ? i.getNetCost() : grossUnitCost).multiply(qty);
            BigDecimal netUnitCost = i.getNetCost() != null
                    ? i.getNetCost()
                    : (qty.compareTo(BigDecimal.ZERO) > 0
                            ? netLineBase.divide(qty, 4, java.math.RoundingMode.HALF_UP)
                            : grossUnitCost);
            BigDecimal grossBase = grossUnitCost.multiply(qty);
            BigDecimal discountAmount = grossBase.subtract(netLineBase).max(BigDecimal.ZERO).setScale(2, java.math.RoundingMode.HALF_UP);
            BigDecimal discountPercent = i.getDiscountPercent() != null
                    ? i.getDiscountPercent()
                    : (grossBase.compareTo(BigDecimal.ZERO) > 0
                            ? discountAmount.multiply(BigDecimal.valueOf(100)).divide(grossBase, 4, java.math.RoundingMode.HALF_UP)
                            : BigDecimal.ZERO);

            d.setUnitCost(netUnitCost);
            d.setNetCost(netUnitCost);
            d.setDiscountPercent(discountPercent);
            d.setDiscountAmount(discountAmount);

            BigDecimal taxPercent = i.getPurchaseTax() != null
                    ? i.getPurchaseTax()
                    : (i.getProduct() != null
                    && i.getProduct().getTax() != null
                    && i.getProduct().getTax().getPurchaseTax() != null)
                    ? i.getProduct().getTax().getPurchaseTax()
                    : BigDecimal.valueOf(5);
            BigDecimal taxAmount = i.getTaxAmount() != null
                    ? i.getTaxAmount()
                    : netLineBase
                            .multiply(taxPercent)
                            .divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);

            d.setTaxPercent(taxPercent);
            d.setTaxAmount(taxAmount);
            d.setLineTotal(netLineBase.add(taxAmount));
            
            if (i.getProduct() != null) {
                d.setSku(i.getProduct().getSku());
                d.setBrandName(i.getProduct().getBrand() != null ? i.getProduct().getBrand().getName() : null);
                d.setShortDesc(i.getProduct().getShortDesc());
                d.setLocalName(i.getProduct().getLocalName());
                d.setDetailedDesc(i.getProduct().getDetailedDesc());
                d.setSerialEnabled(i.getProduct().isSerial());
                d.setBarcode(productBarcodeRepository.findByProductId(i.getProduct().getId()).stream()
                        .map(b -> b.getBarcode())
                        .filter(b -> b != null && !b.isBlank())
                        .findFirst()
                        .orElse(null));
            }
            d.setSerials(i.getSerials() != null ? i.getSerials().stream().map(this::toSerialDraft).toList() : List.of());

            return d;
        }).toList();

        for (InvoiceItemDraft d : lineItems) {
            BigDecimal lineBase = d.getNetCost() != null
                    ? d.getNetCost().multiply(BigDecimal.valueOf(d.getQty() != null ? d.getQty() : 0))
                    : d.getLineTotal().subtract(d.getTaxAmount() != null ? d.getTaxAmount() : BigDecimal.ZERO);
            headerSubTotal = headerSubTotal.add(lineBase);
            headerTaxTotal = headerTaxTotal.add(d.getTaxAmount());
        }

        dto.setItems(lineItems);
        dto.setSubTotal(headerSubTotal);
        dto.setTaxTotal(headerTaxTotal);
        dto.setGrandTotal(headerSubTotal.add(headerTaxTotal));

        return dto;
    }

    /* ================= UPDATE (DRAFT ONLY) ================= */

    public PurchaseInvoice update(Long id, PurchaseInvoiceRequest req) {
        PurchaseInvoice invoice = getEntity(id);

        if (invoice.getStatus() != InvoiceStatus.DRAFT) {
            throw new IllegalStateException("Only DRAFT invoices can be updated");
        }

        validateVendorInvoiceNo(req.getVendorName(), req.getVendorInvoiceNo(), id);

        invoice.getItems().clear();
        invoice.getLandedCosts().clear();

        mapHeader(invoice, req);
        syncItems(invoice, req);
        syncLandedCosts(invoice, req);

        PurchaseInvoice saved = repository.saveAndFlush(invoice);
        purchaseBatchCreationService.replaceForPurchaseInvoice(saved);
        return saved;
    }

    /* ================= SUBMIT ================= */

    public PurchaseInvoiceResponse submitForApproval(Long id, String username) {
        PurchaseInvoice invoice = getEntity(id);

        if (invoice.getStatus() != InvoiceStatus.DRAFT) {
            throw new IllegalStateException("Only DRAFT invoices can be submitted");
        }

        if (invoice.getVendorInvoiceNo() == null || invoice.getVendorInvoiceNo().isBlank()) {
            throw new IllegalArgumentException("Vendor invoice number is required before submitting for approval");
        }

        if (invoice.getWarehouse() == null) {
            throw new IllegalArgumentException("Warehouse is required before submitting invoice for approval");
        }
        if (invoice.getZone() == null) {
            throw new IllegalArgumentException("Zone is required before submitting invoice for approval");
        }
        if (invoice.getLocator() == null) {
            throw new IllegalArgumentException("Locator is required before submitting invoice for approval");
        }
        if (invoice.getBin() == null) {
            throw new IllegalArgumentException("Bin is required before submitting invoice for approval");
        }

        invoice.setStatus(InvoiceStatus.PENDING_APPROVAL);
        invoice.setSubmittedBy(username);
        invoice.setSubmittedAt(LocalDateTime.now());

        return toResponse(invoice);
    }

    /* ================= APPROVE ================= */

    @Caching(evict = {
        @CacheEvict(value = "stockAvailability", allEntries = true),
        @CacheEvict(value = "productList", allEntries = true)
    })
    public PurchaseInvoice approve(Long id, String approver) {

        PurchaseInvoice invoice = getEntity(id);

        if (invoice.getStatus() != InvoiceStatus.PENDING_APPROVAL) {
            throw new IllegalStateException("Invoice is not pending approval");
        }

        if (invoice.getVendorInvoiceNo() == null || invoice.getVendorInvoiceNo().isBlank()) {
            throw new IllegalArgumentException("Vendor invoice number is required before approval");
        }

        if (invoice.isStockPosted()) {
            throw new IllegalStateException("Stock already posted for this invoice");
        }

        // ── ROUTING RULE ──────────────────────────────────────────────────────────
        // AGAINST_GRN → Stock was already posted at GRN approval. Do NOT post again.
        // AGAINST_LPO → No GRN involved. Post stock now at invoice approval.
        // DIRECT → No LPO, no GRN. Post stock now at invoice approval.
        // ─────────────────────────────────────────────────────────────────────────
        boolean isAgainstGrn = "AGAINST_GRN".equalsIgnoreCase(invoice.getSourceType())
                && invoice.getGrnId() != null;
        List<BigDecimal> landedCostShares = calculateLandedCostShares(invoice);

        if (isAgainstGrn) {
            // Validate the GRN still exists
            grnRepo.findById(invoice.getGrnId())
                    .orElseThrow(() -> new IllegalStateException(
                            "Referenced GRN #" + invoice.getGrnId() + " not found"));
        } else if (invoice.getWarehouse() == null) {
            throw new IllegalStateException(
                    "Warehouse is required before stock can be posted. " +
                            "Please update the invoice with a valid warehouse.");
        }

        if (!isAgainstGrn) {
            purchaseBatchCreationService.ensureForPurchaseInvoice(invoice);
        }

        invoice.setStatus(InvoiceStatus.POSTED);
        invoice.setApprovedBy(approver);
        invoice.setApprovedAt(LocalDateTime.now());

        Long warehouseId = invoice.getWarehouse() != null ? invoice.getWarehouse().getId() : null;
        Long zoneId = invoice.getZone() != null ? invoice.getZone().getId() : null;
        Long locatorId = invoice.getLocator() != null ? invoice.getLocator().getId() : null;
        Long binId = invoice.getBin() != null ? invoice.getBin().getId() : null;

        for (int index = 0; index < invoice.getItems().size(); index++) {
            PurchaseInvoiceItem item = invoice.getItems().get(index);

            var productOpt = productRepository.findByCodeAndIsActiveTrue(item.getItemCode());
            if (productOpt.isEmpty()) {
                throw new IllegalStateException(
                        "Product not found for code '" + item.getItemCode() +
                                "'. Cannot process invoice " + invoice.getInvoiceNumber());
            }

            int qty = item.getQty() != null ? item.getQty() : 0;
            int focQty = item.getFocQty() != null ? item.getFocQty() : 0;
            if (qty <= 0 && focQty <= 0) {
                continue;
            }

            Product product = productOpt.get();
            Long productId = product.getId();
            int baseQty = resolveBaseQty(productId, item.getUom(), qty)
                    + resolveBaseQty(productId, item.getFocUnit(), focQty);
            if (baseQty <= 0) {
                continue;
            }

            int currentQty = binStockRepository.findByProductId(productId)
                    .stream()
                    .mapToInt(bs -> bs.getQuantity() != null ? bs.getQuantity().intValue() : 0)
                    .sum();

            if (!isAgainstGrn && product.isSerial()) {
                List<PurchaseInvoiceItemSerial> serials = item.getSerials() != null ? item.getSerials() : List.of();
                if (serials.size() != baseQty) {
                    throw new IllegalStateException(
                            "Expected " + baseQty + " serial numbers for invoice " + invoice.getInvoiceNumber()
                                    + " line #" + item.getId() + " but found " + serials.size());
                }

                List<String> serialNumbers = serials.stream()
                        .map(PurchaseInvoiceItemSerial::getSerialNumber)
                        .toList();
                purchaseSerialService.assertNoDuplicateSerials(serialNumbers,
                        "purchase invoice " + invoice.getInvoiceNumber() + " line " + item.getItemCode());
                purchaseSerialService.assertSerialsNotAlreadyPosted(serialNumbers,
                        "purchase invoice " + invoice.getInvoiceNumber() + " line " + item.getItemCode());

                BigDecimal baseUnitCost = resolveBaseUnitCost(productId, item.getUom(), item.getUnitCost());
                List<SerialMaster> serialMasters = new ArrayList<>(serials.size());
                for (PurchaseInvoiceItemSerial serial : serials) {
                    stockService.postInboundSerializedStock(
                            StockSourceType.DIRECT_PURCHASE,
                            invoice.getId(),
                            productId,
                            warehouseId,
                            zoneId,
                            locatorId,
                            binId,
                            serial.getSerialNumber(),
                            serial.getExpiryDate(),
                            baseUnitCost,
                            invoice.getInvoiceNumber());
                    serialMasters.add(purchaseSerialService.newSerialMaster(
                            serial.getSerialNumber(),
                            item.getItemCode(),
                            item.getItemName(),
                            invoice.getInvoiceNumber(),
                            invoice.getWarehouseName(),
                            invoice.getBranchCode()));
                }
                serialMasterRepository.saveAll(serialMasters);
            } else if (!isAgainstGrn && product.isBatch()) {
                List<BatchMaster> batches = purchaseBatchCreationService
                        .findForPurchaseInvoiceLine(invoice.getId(), item.getId());
                if (batches.size() != baseQty) {
                    throw new IllegalStateException(
                            "Expected " + baseQty + " purchase batches for invoice " + invoice.getInvoiceNumber()
                                    + " line #" + item.getId() + " but found " + batches.size());
                }
                for (BatchMaster batch : batches) {
                    stockService.postInboundStock(
                            StockSourceType.DIRECT_PURCHASE,
                            invoice.getId(),
                            productId,
                            warehouseId,
                            zoneId,
                            locatorId,
                            binId,
                            batch.getBatchNumber(),
                            batch.getExpiryDate(),
                            batch.getUnitCost(),
                            1,
                            invoice.getInvoiceNumber());
                }
            } else if (!isAgainstGrn) {
                stockService.postInboundStock(
                        StockSourceType.DIRECT_PURCHASE,
                        invoice.getId(),
                        productId,
                        warehouseId,
                        zoneId,
                        locatorId,
                        binId,
                        baseQty,
                        invoice.getInvoiceNumber());
            }

            BigDecimal landedCostShare = index < landedCostShares.size()
                    ? landedCostShares.get(index)
                    : BigDecimal.ZERO;

            if (nvl(item.getUnitCost()).compareTo(BigDecimal.ZERO) > 0
                    || landedCostShare.compareTo(BigDecimal.ZERO) > 0) {
                BigDecimal baseUnitCost = nvl(resolveBaseUnitCost(productId, item.getUom(), nvl(item.getUnitCost())));
                BigDecimal landedCostPerBaseUnit = landedCostShare.divide(
                        BigDecimal.valueOf(baseQty),
                        4,
                        RoundingMode.HALF_UP);
                BigDecimal enrichedBaseUnitCost = baseUnitCost.add(landedCostPerBaseUnit);

                int qtyBeforeThisInvoice = isAgainstGrn
                        ? Math.max(currentQty - baseQty, 0)
                        : currentQty;

                productPricingRepository.findByProductId(productId).ifPresent(pricing -> {
                    BigDecimal existingCost = pricing.getCost() != null ? pricing.getCost() : BigDecimal.ZERO;
                    BigDecimal incomingQtyBD = BigDecimal.valueOf(baseQty);
                    BigDecimal existingQtyBD = BigDecimal.valueOf(qtyBeforeThisInvoice);
                    BigDecimal totalQty = existingQtyBD.add(incomingQtyBD);
                    BigDecimal newCost = totalQty.compareTo(BigDecimal.ZERO) > 0
                            ? existingQtyBD.multiply(existingCost).add(incomingQtyBD.multiply(enrichedBaseUnitCost))
                                    .divide(totalQty, 4, RoundingMode.HALF_UP)
                            : enrichedBaseUnitCost;
                    pricing.setCost(newCost);
                    productPricingRepository.save(pricing);
                });
            }
        }

        if (!isAgainstGrn) {
            invoice.setStockPosted(true);
        }

        // 🔵 UPDATE LPO STATUS TO COMPLETED
        if (invoice.getLpoId() != null) {
            lpoRepository.findById(invoice.getLpoId()).ifPresent(lpo -> {
                lpo.setStatus(LpoStatus.COMPLETED);
                lpoRepository.save(lpo);
            });
        } else if (invoice.getGrnId() != null) {
            grnRepo.findById(invoice.getGrnId()).ifPresent(grn -> {
                if (grn.getLpo() != null) {
                    Lpo lpo = grn.getLpo();
                    lpo.setStatus(LpoStatus.COMPLETED);
                    lpoRepository.save(lpo);
                }
            });
        }

        // 🔵 AUTO-GENERATE JOURNAL ENTRY
        // If AGAINST_GRN: Dr. GRN Clearing, Cr. Accounts Payable
        // If DIRECT: Dr. Inventory, Cr. Accounts Payable
        postingEngineService.createJournalFromPurchaseInvoice(invoice);

        return invoice;
    }

    /* ================= PAYMENT ================= */

    public PurchaseInvoice recordPayment(Long id, BigDecimal amount, String paymentModeStr, String bankAccount, String chequeDateStr) {
        PurchaseInvoice invoice = getEntity(id);

        if (invoice.getStatus() != InvoiceStatus.POSTED) {
            throw new IllegalStateException("Only POSTED invoices can receive payments");
        }

        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Payment amount must be greater than zero");
        }

        BigDecimal paidSoFar = resolveAmountPaid(invoice);

        if (paidSoFar.add(amount).compareTo(invoice.getGrandTotal()) > 0) {
            throw new IllegalStateException("Payment exceeds invoice total");
        }

        // AUTO-GENERATE PAYMENT VOUCHER FOR SETTLEMENT
        // This leverages PaymentVoucherService which already handles InvoicePayment
        // creation + Journal Entries
        PaymentVoucher pv = new PaymentVoucher();
        pv.setVendorName(invoice.getVendorName() != null ? invoice.getVendorName() : "Unknown Vendor");
        pv.setPaymentDate(LocalDate.now());
        PaymentMode resolvedMode;
        try {
            resolvedMode = PaymentMode.valueOf(paymentModeStr != null ? paymentModeStr.toUpperCase() : "BANK_TRANSFER");
        } catch (IllegalArgumentException e) {
            resolvedMode = PaymentMode.BANK_TRANSFER;
        }
        pv.setPaymentMode(resolvedMode);
        pv.setAmount(amount);
        pv.setReferenceNumber("Auto-PV for INV: " + invoice.getInvoiceNumber());
        pv.setInvoiceId(invoice.getId());
        if (bankAccount != null && !bankAccount.isBlank()) {
            pv.setBankAccount(bankAccount);
        }
        if (chequeDateStr != null && !chequeDateStr.isBlank()) {
            try { pv.setChequeDate(java.time.LocalDate.parse(chequeDateStr)); } catch (Exception ignored) {}
        }

        PaymentVoucher savedPv = paymentVoucherService.createVoucher(pv);

        // Approving the PV will invoke applyPaymentToInvoice() and create the JV
        paymentVoucherService.updateStatus(savedPv.getId(), com.billbull.backend.purchase.payment.PaymentStatus.POSTED);

        // Fetch the fresh invoice since paymentVoucherService updated and saved it
        return getEntity(id);
    }

    /* ================= DELETE ================= */

    public void delete(Long id) {
        PurchaseInvoice invoice = getEntity(id);

        if (invoice.getStatus() != InvoiceStatus.DRAFT) {
            throw new IllegalStateException("Only DRAFT invoices can be deleted");
        }

        purchaseBatchCreationService.deleteUnprintedPurchaseInvoiceBatches(invoice.getId());
        repository.delete(invoice);
    }

    /* ================= READ ================= */

    public List<PurchaseInvoiceResponse> listAll() {
        List<PurchaseInvoice> invoices = new ArrayList<>(
                branchAccessService.filterBranchScoped(repository.findAll(), PurchaseInvoice::getBranchId));
        DocumentOrderingUtil.sortByDocumentNumberAndDateDesc(
                invoices,
                PurchaseInvoice::getInvoiceDate,
                PurchaseInvoice::getInvoiceNumber,
                PurchaseInvoice::getId);

        return invoices.stream()
                .map(this::toResponse)
                .toList();
    }

    public PurchaseInvoiceResponse getResponse(Long id) {
        return toResponse(getEntity(id));
    }

    /* ================= INTERNAL HELPERS ================= */

    private PurchaseInvoice getEntity(Long id) {
        PurchaseInvoice invoice = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Purchase Invoice not found"));
        branchAccessService.assertTransactionBranchAccessible(invoice.getBranchId(), "Purchase Invoice");
        return invoice;
    }

    private PurchaseInvoice mapToEntity(PurchaseInvoiceRequest req) {
        PurchaseInvoice invoice = new PurchaseInvoice();
        mapHeader(invoice, req);
        syncItems(invoice, req);
        syncLandedCosts(invoice, req);
        return invoice;
    }

    private void mapHeader(PurchaseInvoice invoice, PurchaseInvoiceRequest req) {
        if (invoice.getId() == null) {
            // New invoice: resolve via the central numbering service. In auto mode the
            // requested number is ignored and a sequenced PINV-YYYY-NNNN is issued; in
            // manual mode the user-typed number is validated for uniqueness.
            invoice.setInvoiceNumber(documentNumberingService.resolveNumberForCreate(
                    com.billbull.backend.purchase.settings.PurchaseDocumentType.PURCHASE_INVOICE,
                    req.getInvoiceNumber()));
        } else if (req.getInvoiceNumber() != null && !req.getInvoiceNumber().trim().isEmpty()) {
            invoice.setInvoiceNumber(documentNumberingService.resolveNumberForUpdate(
                    com.billbull.backend.purchase.settings.PurchaseDocumentType.PURCHASE_INVOICE,
                    invoice.getInvoiceNumber(),
                    req.getInvoiceNumber()));
        }
        invoice.setInvoiceDate(req.getInvoiceDate());
        invoice.setVendorName(req.getVendorName());
        invoice.setVendorInvoiceNo(req.getVendorInvoiceNo());
        invoice.setVendorInvoiceDate(req.getVendorInvoiceDate() != null ? req.getVendorInvoiceDate() : req.getInvoiceDate());
        invoice.setSourceType(req.getSourceType());
        invoice.setReferenceNo(req.getReferenceNo());
        invoice.setGrnId(req.getGrnId());
        invoice.setGrnNo(req.getGrnNo());
        invoice.setLpoId(req.getLpoId());

        if (req.getWarehouseId() != null) {
            invoice.setWarehouse(warehouseRepository.findById(req.getWarehouseId()).orElse(null));
        }
        if (req.getZoneId() != null) {
            invoice.setZone(zoneRepository.findById(req.getZoneId()).orElse(null));
        }
        if (req.getLocatorId() != null) {
            invoice.setLocator(locatorRepository.findById(req.getLocatorId()).orElse(null));
        }
        if (req.getBinId() != null) {
            invoice.setBin(binRepository.findById(req.getBinId()).orElse(null));
        }
        // Also map warehouseName string if available from entity
        if (invoice.getWarehouse() != null) {
            invoice.setWarehouseName(invoice.getWarehouse().getName());
        }

        Branch branch = resolveBranchForInvoice(invoice, req);
        if (branch != null) {
            invoice.setBranchId(branch.getId());
            invoice.setBranchName(branch.getName());
            invoice.setBranchCode(branch.getCode());
            if (invoice.getWarehouse() != null) {
                branchAccessService.assertWarehouseMatchesBranch(invoice.getWarehouse(), branch.getId(), "Purchase Invoice");
            }
        } else {
            invoice.setBranchId(null);
            invoice.setBranchName(null);
            invoice.setBranchCode(null);
        }

        invoice.setSubTotal(req.getSubTotal());
        invoice.setDiscountTotal(req.getDiscountTotal());
        invoice.setTaxTotal(req.getTaxTotal());
        invoice.setLandedCost(req.getLandedCost());
        invoice.setGrandTotal(req.getGrandTotal());
        invoice.setDueDate(req.getDueDate());

        invoice.setFreight(req.getFreight());
        invoice.setCustomsDuty(req.getCustomsDuty());
        invoice.setHandling(req.getHandling());
        invoice.setClearing(req.getClearing());
        invoice.setInsurance(req.getInsurance());
        invoice.setOtherCosts(req.getOtherCosts());
    }

    private Branch resolveBranchForInvoice(PurchaseInvoice invoice, PurchaseInvoiceRequest req) {
        if (req.getGrnId() != null) {
            GrnEntity grn = grnRepo.findById(req.getGrnId())
                    .orElseThrow(() -> new IllegalArgumentException("GRN not found"));
            branchAccessService.assertTransactionBranchAccessible(grn.getBranchId(), "GRN");
            if (grn.getBranchId() == null) {
                return null;
            }
            Branch currentBranch = branchAccessService.getRequiredCurrentUserBranch();
            if (!currentBranch.getId().equals(grn.getBranchId())) {
                throw new IllegalStateException("GRN belongs to another branch.");
            }
            return currentBranch;
        }

        if (req.getLpoId() != null) {
            Lpo lpo = lpoRepository.findById(req.getLpoId())
                    .orElseThrow(() -> new IllegalArgumentException("LPO not found"));
            branchAccessService.assertTransactionBranchAccessible(lpo.getBranchId(), "LPO");
            if (lpo.getBranchId() == null) {
                return null;
            }
            Branch currentBranch = branchAccessService.getRequiredCurrentUserBranch();
            if (!currentBranch.getId().equals(lpo.getBranchId())) {
                throw new IllegalStateException("LPO belongs to another branch.");
            }
            return currentBranch;
        }

        // UPDATE — branch is locked to the existing value (PDF §3.4). Return a
        // stub so warehouse validation can match; setBranchId/Name/Code downstream
        // re-stamp the same values, effectively a no-op.
        if (invoice.getId() != null) {
            if (invoice.getBranchId() == null) {
                return null;
            }
            Branch stub = new Branch();
            stub.setId(invoice.getBranchId());
            stub.setName(invoice.getBranchName());
            stub.setCode(invoice.getBranchCode());
            return stub;
        }

        return branchAccessService.getRequiredCurrentUserBranch();
    }

    private void syncItems(PurchaseInvoice invoice, PurchaseInvoiceRequest req) {
        Set<String> documentSerials = new HashSet<>();
        req.getItems().forEach(i -> {
            PurchaseInvoiceItem item = new PurchaseInvoiceItem();
            item.setItemCode(i.getItemCode());
            item.setItemName(i.getItemName());
            item.setBarcode(i.getBarcode());
            item.setUom(i.getUom());
            item.setQty(i.getQty());
            item.setFocQty(i.getFocQty());
            item.setFocUnit(i.getFocUnit());
            item.setUnitCost(i.getUnitCost());
            item.setDiscountPercent(i.getDiscountPercent());
            item.setDiscountAmount(i.getDiscountAmount());
            item.setTaxPercent(i.getTaxPercent());
            item.setTaxAmount(i.getTaxAmount());
            item.setLineTotal(i.getLineTotal());
            item.setWarehouseName(i.getWarehouseName());
            item.setRemarks(i.getRemarks());
            item.setInvoice(invoice);
            syncItemSerials(item, i.getSerials(), documentSerials, invoice.getInvoiceNumber());
            invoice.getItems().add(item);
        });
    }

    private void syncLandedCosts(PurchaseInvoice invoice, PurchaseInvoiceRequest req) {
        req.getLandedCosts().forEach(lc -> {
            InvoiceLandedCost cost = new InvoiceLandedCost();
            cost.setCostName(lc.getCostName());
            cost.setDescription(lc.getDescription());
            cost.setAmount(lc.getAmount());
            cost.setInvoice(invoice);
            invoice.getLandedCosts().add(cost);
        });
    }

    private PurchaseInvoiceResponse toResponse(PurchaseInvoice invoice) {

        PurchaseInvoiceResponse dto = new PurchaseInvoiceResponse();
        BigDecimal amountPaid = resolveAmountPaid(invoice);
        PaymentStatus resolvedPaymentStatus = resolvePaymentStatus(invoice, amountPaid);
        BigDecimal balanceDue = resolveBalanceDue(invoice, amountPaid);

        if (invoice.getPaymentStatus() != resolvedPaymentStatus) {
            invoice.setPaymentStatus(resolvedPaymentStatus);
        }

        dto.setId(invoice.getId());
        dto.setInvoiceNumber(invoice.getInvoiceNumber());
        dto.setInvoiceDate(invoice.getInvoiceDate());

        dto.setVendorName(invoice.getVendorName());
        dto.setVendorInvoiceNo(invoice.getVendorInvoiceNo());
        dto.setVendorInvoiceDate(invoice.getVendorInvoiceDate() != null ? invoice.getVendorInvoiceDate() : invoice.getInvoiceDate());

        dto.setSourceType(invoice.getSourceType());
        dto.setReferenceNo(invoice.getReferenceNo());
        dto.setGrnNo(invoice.getGrnNo());
        dto.setGrnId(invoice.getGrnId());
        dto.setLpoId(invoice.getLpoId());
        dto.setBranchId(invoice.getBranchId());
        dto.setBranchName(invoice.getBranchName());
        dto.setBranchCode(invoice.getBranchCode());
        dto.setWarehouseName(invoice.getWarehouseName());

        if (invoice.getWarehouse() != null)
            dto.setWarehouseId(invoice.getWarehouse().getId());
        if (invoice.getZone() != null)
            dto.setZoneId(invoice.getZone().getId());
        if (invoice.getLocator() != null)
            dto.setLocatorId(invoice.getLocator().getId());
        if (invoice.getBin() != null)
            dto.setBinId(invoice.getBin().getId());

        dto.setFreight(invoice.getFreight());
        dto.setCustomsDuty(invoice.getCustomsDuty());
        dto.setHandling(invoice.getHandling());
        dto.setClearing(invoice.getClearing());
        dto.setInsurance(invoice.getInsurance());
        dto.setOtherCosts(invoice.getOtherCosts());

        dto.setSubTotal(invoice.getSubTotal());
        dto.setTaxTotal(invoice.getTaxTotal());
        dto.setGrandTotal(invoice.getGrandTotal());
        dto.setLandedCost(invoice.getLandedCost());
        if (invoice.getLandedCosts() != null) {
            dto.setLandedCosts(invoice.getLandedCosts().stream().map(lc -> {
                LandedCostRequest r = new LandedCostRequest();
                r.setCostName(lc.getCostName());
                r.setDescription(lc.getDescription());
                r.setAmount(lc.getAmount());
                return r;
            }).toList());
        }
        dto.setAmountPaid(amountPaid);
        dto.setBalanceDue(balanceDue);

        dto.setDueDate(invoice.getDueDate());
        dto.setStatus(invoice.getStatus());
        dto.setPaymentStatus(resolvedPaymentStatus);

        if (invoice.getItems() != null) {
            // Bulk-fetch primary images by item code
            java.util.List<String> codes = invoice.getItems().stream()
                    .map(i -> i.getItemCode())
                    .filter(c -> c != null)
                    .distinct()
                    .toList();
            java.util.Map<String, String> imageMap = new java.util.HashMap<>();
            productMediaRepository.findPrimaryByProductCodesIn(codes)
                    .forEach(m -> imageMap.put(m.getProduct().getCode(), m.getImageUrl()));

            dto.setItems(invoice.getItems().stream().map(i -> {
                InvoiceItemDraft d = new InvoiceItemDraft();
                d.setId(i.getId());
                d.setItemCode(i.getItemCode());
                d.setItemName(i.getItemName());
                d.setBarcode(i.getBarcode());
                d.setImage(imageMap.get(i.getItemCode()));
                d.setUom(i.getUom());
                d.setQty(i.getQty());
                d.setFocQty(i.getFocQty());
                d.setFocUnit(i.getFocUnit());
                d.setUnitCost(i.getUnitCost());
                d.setNetCost(i.getUnitCost());
                d.setDiscountPercent(i.getDiscountPercent());
                d.setDiscountAmount(i.getDiscountAmount());
                d.setTaxPercent(i.getTaxPercent());
                d.setTaxAmount(i.getTaxAmount());
                d.setLineTotal(i.getLineTotal());
                d.setRemarks(i.getRemarks());
                if (i.getItemCode() != null) {
                    productRepository.findByCodeAndIsActiveTrue(i.getItemCode()).ifPresent(product -> {
                        if (d.getBarcode() == null || d.getBarcode().isBlank()) {
                            String barcode = productBarcodeRepository.findByProductId(product.getId()).stream()
                                    .map(b -> b.getBarcode())
                                    .filter(b -> b != null && !b.isBlank())
                                    .findFirst()
                                    .orElse(null);
                            d.setBarcode(barcode);
                        }
                        if (d.getDetailedDesc() == null && product.getDetailedDesc() != null) {
                            d.setDetailedDesc(product.getDetailedDesc());
                        }
                        d.setSerialEnabled(product.isSerial());
                        d.setSku(product.getSku());
                        d.setBrandName(product.getBrand() != null ? product.getBrand().getName() : null);
                        d.setShortDesc(product.getShortDesc());
                        d.setLocalName(product.getLocalName());
                    });
                }
                List<PurchaseSerialDraft> serials = findSerialsForResponse(invoice, i);
                d.setSerials(serials);
                List<BatchMaster> batches = findBatchesForResponse(invoice, i);
                d.setBatches(batches.stream().map(this::toBatchDraft).toList());
                d.setBatchEnabled(!batches.isEmpty());
                return d;
            }).toList());
        }

        return dto;
    }

    private List<BatchMaster> findBatchesForResponse(PurchaseInvoice invoice, PurchaseInvoiceItem item) {
        if (invoice == null || item == null || invoice.getId() == null || item.getId() == null) {
            return List.of();
        }

        List<BatchMaster> invoiceBatches = purchaseBatchCreationService
                .findForPurchaseInvoiceLine(invoice.getId(), item.getId());
        if (!invoiceBatches.isEmpty() || invoice.getGrnId() == null) {
            return invoiceBatches;
        }

        return grnRepo.findById(invoice.getGrnId())
                .map(grn -> grn.getItems().stream()
                        .filter(grnItem -> java.util.Objects.equals(grnItem.getProductCode(), item.getItemCode()))
                        .flatMap(grnItem -> purchaseBatchCreationService
                                .findForGrnLine(grn.getId(), grnItem.getId())
                                .stream())
                        .sorted(java.util.Comparator.comparing(
                                BatchMaster::getUnitIndex,
                                java.util.Comparator.nullsLast(Integer::compareTo)))
                        .toList())
                .orElse(List.of());
    }

    private List<PurchaseSerialDraft> findSerialsForResponse(PurchaseInvoice invoice, PurchaseInvoiceItem item) {
        if (item == null) {
            return List.of();
        }
        if (item.getSerials() != null && !item.getSerials().isEmpty()) {
            return item.getSerials().stream().map(this::toSerialDraft).toList();
        }
        if (invoice == null || invoice.getGrnId() == null) {
            return List.of();
        }
        return grnRepo.findById(invoice.getGrnId())
                .map(grn -> grn.getItems().stream()
                        .filter(grnItem -> java.util.Objects.equals(grnItem.getProductCode(), item.getItemCode()))
                        .findFirst()
                        .map(grnItem -> grnItem.getSerials().stream().map(this::toSerialDraft).toList())
                        .orElse(List.of()))
                .orElse(List.of());
    }

    private InvoiceItemBatchDraft toBatchDraft(BatchMaster batch) {
        InvoiceItemBatchDraft dto = new InvoiceItemBatchDraft();
        dto.setId(batch.getId());
        dto.setBatchNumber(batch.getBatchNumber());
        dto.setBatchBarcode(batch.getBatchNumber());
        dto.setExpiryDate(batch.getExpiryDate());
        dto.setUnitIndex(batch.getUnitIndex());
        dto.setQuantity(batch.getQuantity());
        dto.setUnitCost(batch.getUnitCost());
        return dto;
    }

    private PurchaseSerialDraft toSerialDraft(PurchaseInvoiceItemSerial serial) {
        PurchaseSerialDraft dto = new PurchaseSerialDraft();
        dto.setId(serial.getId());
        dto.setSerialNumber(serial.getSerialNumber());
        dto.setManufacturingDate(serial.getManufacturingDate());
        dto.setExpiryDate(serial.getExpiryDate());
        return dto;
    }

    private PurchaseSerialDraft toSerialDraft(com.billbull.backend.purchase.grn.GrnItemSerial serial) {
        PurchaseSerialDraft dto = new PurchaseSerialDraft();
        dto.setId(serial.getId());
        dto.setSerialNumber(serial.getSerialNumber());
        dto.setManufacturingDate(serial.getManufacturingDate());
        dto.setExpiryDate(serial.getExpiryDate());
        return dto;
    }

    private void syncItemSerials(
            PurchaseInvoiceItem item,
            List<PurchaseSerialDraft> requestSerials,
            Set<String> documentSerials,
            String invoiceNumber) {
        item.getSerials().clear();

        List<PurchaseSerialDraft> normalized = purchaseSerialService.normalizeDrafts(requestSerials);
        purchaseSerialService.assertNoDuplicateSerials(
                normalized.stream().map(PurchaseSerialDraft::getSerialNumber).toList(),
                "purchase invoice item " + item.getItemCode());

        for (PurchaseSerialDraft serial : normalized) {
            if (!documentSerials.add(serial.getSerialNumber())) {
                throw new IllegalArgumentException(
                        "Duplicate serial number '" + serial.getSerialNumber() + "' in purchase invoice " + invoiceNumber);
            }
            PurchaseInvoiceItemSerial entity = new PurchaseInvoiceItemSerial();
            entity.setInvoiceItem(item);
            entity.setSerialNumber(serial.getSerialNumber());
            entity.setManufacturingDate(serial.getManufacturingDate());
            entity.setExpiryDate(serial.getExpiryDate());
            item.getSerials().add(entity);
        }
    }

    private java.util.Map<String, String> buildPrimaryImageMap(List<String> itemCodes) {
        java.util.List<String> codes = itemCodes.stream()
                .filter(code -> code != null && !code.isBlank())
                .distinct()
                .toList();

        java.util.Map<String, String> imageMap = new java.util.HashMap<>();
        if (codes.isEmpty()) {
            return imageMap;
        }

        productMediaRepository.findPrimaryByProductCodesIn(codes)
                .forEach(media -> imageMap.put(media.getProduct().getCode(), media.getImageUrl()));

        return imageMap;
    }

    private BigDecimal resolveAmountPaid(PurchaseInvoice invoice) {
        BigDecimal paidViaPostedVouchers = paymentVoucherService.getPostedAmountForInvoice(invoice.getId());
        if (paidViaPostedVouchers.compareTo(BigDecimal.ZERO) > 0) {
            return paidViaPostedVouchers;
        }

        return invoice.getPayments().stream()
                .map(InvoicePayment::getPaidAmount)
                .filter(amount -> amount != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private PaymentStatus resolvePaymentStatus(PurchaseInvoice invoice, BigDecimal amountPaid) {
        BigDecimal invoiceTotal = invoice.getGrandTotal() != null ? invoice.getGrandTotal() : BigDecimal.ZERO;

        if (amountPaid == null || amountPaid.compareTo(BigDecimal.ZERO) <= 0) {
            return PaymentStatus.UNPAID;
        }

        if (amountPaid.compareTo(invoiceTotal) >= 0) {
            return PaymentStatus.PAID;
        }

        return PaymentStatus.PARTIALLY_PAID;
    }

    private BigDecimal resolveBalanceDue(PurchaseInvoice invoice, BigDecimal amountPaid) {
        BigDecimal invoiceTotal = invoice.getGrandTotal() != null ? invoice.getGrandTotal() : BigDecimal.ZERO;
        BigDecimal balanceDue = invoiceTotal.subtract(amountPaid != null ? amountPaid : BigDecimal.ZERO);
        return balanceDue.compareTo(BigDecimal.ZERO) > 0 ? balanceDue : BigDecimal.ZERO;
    }

    /* ================= GET POSTED FOR PAYMENT (NEW) ================= */

    @Transactional
    public List<PurchaseInvoiceResponse> getPostedInvoicesForPayment() {
        List<PurchaseInvoice> invoices = new ArrayList<>(
                branchAccessService.filterBranchScoped(repository.findByStatus(InvoiceStatus.POSTED), PurchaseInvoice::getBranchId));
        DocumentOrderingUtil.sortByDocumentNumberAndDateDesc(
                invoices,
                PurchaseInvoice::getInvoiceDate,
                PurchaseInvoice::getInvoiceNumber,
                PurchaseInvoice::getId);

        return invoices.stream()
                .map(this::toResponse)
                .toList();
    }

}
