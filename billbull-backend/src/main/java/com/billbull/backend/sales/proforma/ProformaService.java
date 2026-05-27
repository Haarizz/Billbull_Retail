package com.billbull.backend.sales.proforma;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductBarcode;
import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.inventory.product.ProductMediaRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.WarehouseStockService;
import com.billbull.backend.sales.settings.SalesDocumentNumberingService;
import com.billbull.backend.sales.settings.SalesDocumentType;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.util.DocumentOrderingUtil;

@Service
@Transactional
public class ProformaService {
    private static final BigDecimal ISSUE_BALANCE_TOLERANCE = new BigDecimal("0.01");

    private final ProformaRepository repo;
    private final ProductRepository productRepo;
    private final ProductBarcodeRepository barcodeRepo;
    private final ProductMediaRepository productMediaRepository;
    private final BranchAccessService branchAccessService;
    private final WarehouseStockService warehouseStockService;
    private final SalesDocumentNumberingService numberingService;

    public ProformaService(
            ProformaRepository repo,
            ProductRepository productRepo,
            ProductBarcodeRepository barcodeRepo,
            ProductMediaRepository productMediaRepository,
            BranchAccessService branchAccessService,
            WarehouseStockService warehouseStockService,
            SalesDocumentNumberingService numberingService) {
        this.repo = repo;
        this.productRepo = productRepo;
        this.barcodeRepo = barcodeRepo;
        this.productMediaRepository = productMediaRepository;
        this.branchAccessService = branchAccessService;
        this.warehouseStockService = warehouseStockService;
        this.numberingService = numberingService;
    }

    @Transactional
    public String generateProformaNumber() {
        return numberingService.preview(SalesDocumentType.PROFORMA_INVOICE);
    }

    /* ================= CREATE ================= */

    public ProformaResponse create(ProformaRequest req) {
        req.piNumber = numberingService.resolveNumberForCreate(
                SalesDocumentType.PROFORMA_INVOICE,
                req.piNumber);
        ProformaInvoice pi = buildEntity(req, new ProformaInvoice());
        return toResponse(repo.save(pi));
    }

    /* ================= UPDATE ================= */

    public ProformaResponse update(Long id, ProformaRequest req) {

        ProformaInvoice pi = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Proforma not found"));

        if (pi.getStatus() == ProformaStatus.ISSUED) {
            throw new IllegalStateException("Issued Proforma cannot be edited");
        }

        String existingPiNumber = pi.getPiNumber();
        pi.getItems().clear(); // orphanRemoval handles delete

        buildEntity(req, pi);
        pi.setPiNumber(numberingService.resolveNumberForUpdate(
                SalesDocumentType.PROFORMA_INVOICE,
                existingPiNumber,
                req.piNumber));
        return toResponse(repo.save(pi));
    }

    /* ================= READ ================= */

    @Transactional(readOnly = true)
    public List<ProformaResponse> list() {
        List<ProformaInvoice> proformas = new ArrayList<>(repo.findAll());
        DocumentOrderingUtil.sortByDocumentDateAndNumberDesc(
                proformas,
                ProformaInvoice::getPiDate,
                ProformaInvoice::getPiNumber,
                ProformaInvoice::getId);
        return proformas.stream()
                .map(this::toResponse) // mapping happens INSIDE TX
                .toList();
    }

    @Transactional(readOnly = true)
    public ProformaResponse get(Long id) {
        ProformaInvoice pi = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Proforma not found"));
        return toResponse(pi);
    }

    /* ================= DELETE ================= */

    public void delete(Long id) {
        ProformaInvoice pi = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Proforma not found"));
        if (pi.getStatus() == ProformaStatus.ISSUED) {
            throw new IllegalStateException("Issued proforma cannot be deleted. Cancel it first.");
        }
        repo.deleteById(id);
    }

    /* ================= ISSUE ================= */

    @CacheEvict(value = "stockAvailability", allEntries = true)
    public ProformaResponse issue(Long id) {

        ProformaInvoice pi = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Proforma not found"));

        if (pi.getWarehouse() == null) {
            Warehouse defaultWarehouse = resolveDefaultWarehouse();
            if (defaultWarehouse == null) {
                throw new IllegalStateException(
                        "Default warehouse is not configured for the current branch. Set it before issuing the proforma.");
            }
            pi.setWarehouse(defaultWarehouse);
        }

        if (pi.getStatus() == ProformaStatus.ISSUED) {
            return toResponse(pi);
        }

        if (pi.getStatus() == ProformaStatus.CANCELLED) {
            throw new IllegalStateException("Cancelled proforma cannot be issued.");
        }

        BigDecimal balanceDue = pi.getBalanceDue() != null ? pi.getBalanceDue() : BigDecimal.ZERO;
        if (balanceDue.compareTo(ISSUE_BALANCE_TOLERANCE) > 0) {
            throw new IllegalStateException("Full payment required. Remaining balance: " + balanceDue);
        }

        if (balanceDue.compareTo(BigDecimal.ZERO) > 0) {
            pi.setBalanceDue(BigDecimal.ZERO);
        }

        validateStockAvailability(pi);

        pi.setStatus(ProformaStatus.ISSUED);
        pi.setIssuedAt(java.time.LocalDateTime.now());

        return toResponse(repo.save(pi));
    }

    /* ================= CANCEL ================= */

    @CacheEvict(value = "stockAvailability", allEntries = true)
    public ProformaResponse cancel(Long id) {
        ProformaInvoice pi = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Proforma not found"));

        if (pi.getStatus() == ProformaStatus.CANCELLED) {
            return toResponse(pi);
        }

        pi.setStatus(ProformaStatus.CANCELLED);
        return toResponse(repo.save(pi));
    }

    /* ================= ENTITY BUILDER ================= */

    private ProformaInvoice buildEntity(ProformaRequest req, ProformaInvoice pi) {
        Warehouse defaultWarehouse = resolveDefaultWarehouse();
        if (defaultWarehouse != null) {
            pi.setWarehouse(defaultWarehouse);
        }

        pi.setPiNumber(req.piNumber);
        pi.setPiDate(req.piDate);
        pi.setValidUntil(req.validUntil);

        pi.setCustomerId(req.customerId);
        pi.setCustomerCode(req.customerCode);
        pi.setCustomerName(req.customerName);
        pi.setCustomerTrn(req.customerTrn);

        pi.setQuotationNo(req.quotationNo);
        pi.setSalesOrderNo(req.salesOrderNo);

        pi.setPaymentMethod(req.paymentMethod);
        pi.setAdvancePaid(req.advancePaid != null ? req.advancePaid : BigDecimal.ZERO);
        pi.setPaymentReference(req.paymentReference);
        pi.setPaymentNotes(req.paymentNotes);

        BigDecimal gross = BigDecimal.ZERO;
        BigDecimal lineDiscTotal = BigDecimal.ZERO;
        BigDecimal tax = BigDecimal.ZERO;

        if (pi.getItems() == null) {
            pi.setItems(new ArrayList<>());
        }

        for (ProformaItemRequest i : req.items) {
            BigDecimal qty = i.quantity != null ? i.quantity : BigDecimal.ZERO;
            BigDecimal price = i.price != null ? i.price : BigDecimal.ZERO;
            BigDecimal taxRate = i.taxPercent != null ? i.taxPercent : BigDecimal.ZERO;
            BigDecimal discRate = i.discountPercent != null ? i.discountPercent : BigDecimal.ZERO;

            BigDecimal lineGross = qty.multiply(price);
            
            // Note: Simplistic FOC deduction if units match. 
            // In a real system we'd use unit conversions here, 
            // matching the frontend logic exactly.
            BigDecimal focValue = BigDecimal.ZERO;
            if (i.foc != null && i.foc > 0) {
                focValue = price.multiply(BigDecimal.valueOf(i.foc));
                // Simplified: assuming foc uses same unit as quantity here for brevity 
                // but real logic should track unit conversions.
            }
            
            BigDecimal preDisc = lineGross.subtract(focValue).max(BigDecimal.ZERO);
            BigDecimal lineDisc = preDisc.multiply(discRate).divide(BigDecimal.valueOf(100), 2, BigDecimal.ROUND_HALF_UP);
            BigDecimal taxable = preDisc.subtract(lineDisc);
            BigDecimal lineTax = taxable.multiply(taxRate).divide(BigDecimal.valueOf(100), 2, BigDecimal.ROUND_HALF_UP);
            BigDecimal lineTotal = taxable.add(lineTax);

            ProformaInvoiceItem item = new ProformaInvoiceItem();
            item.setProforma(pi);
            item.setItemCode(i.itemCode);
            item.setBarcode(i.barcode);
            item.setDescription(i.description);
            item.setUnit(i.unit);
            item.setQuantity(qty);
            item.setPrice(price);
            item.setTaxPercent(taxRate);
            item.setDiscountPercent(discRate);
            item.setFoc(i.foc);
            item.setFocUnit(i.focUnit);
            item.setRemarks(i.remarks);
            hydrateProformaItemDisplayData(item);
            item.setLineTotal(lineTotal);

            pi.getItems().add(item);

            gross = gross.add(lineGross);
            lineDiscTotal = lineDiscTotal.add(lineDisc);
            tax = tax.add(lineTax);
        }

        BigDecimal taxableSubtotal = gross.subtract(lineDiscTotal);
        pi.setSubTotal(taxableSubtotal);
        pi.setBillDiscount(req.billDiscount != null ? req.billDiscount : BigDecimal.ZERO);
        
        BigDecimal billDiscAmount = taxableSubtotal.multiply(pi.getBillDiscount()).divide(BigDecimal.valueOf(100), 2, BigDecimal.ROUND_HALF_UP);
        
        pi.setTaxTotal(tax);
        pi.setGrandTotal(taxableSubtotal.subtract(billDiscAmount).add(tax));
        pi.setBalanceDue(pi.getGrandTotal().subtract(pi.getAdvancePaid()));

        return pi;
    }

    /* ================= DTO MAPPER ================= */

    public ProformaResponse toResponse(ProformaInvoice pi) {
        hydrateProformaItemDisplayData(pi);

        ProformaResponse res = new ProformaResponse();

        res.setId(pi.getId());
        res.setPiNumber(pi.getPiNumber());
        res.setPiDate(pi.getPiDate());
        res.setValidUntil(pi.getValidUntil());

        res.setCustomerId(pi.getCustomerId());
        res.setCustomerCode(pi.getCustomerCode());
        res.setCustomerName(pi.getCustomerName());
        res.setCustomerTrn(pi.getCustomerTrn());

        res.setQuotationNo(pi.getQuotationNo());
        res.setSalesOrderNo(pi.getSalesOrderNo());
        res.setWarehouseId(pi.getWarehouse() != null ? pi.getWarehouse().getId() : null);
        res.setWarehouseName(pi.getWarehouse() != null ? pi.getWarehouse().getName() : null);

        res.setSubTotal(pi.getSubTotal());
        res.setBillDiscount(pi.getBillDiscount());
        res.setTaxTotal(pi.getTaxTotal());
        res.setGrandTotal(pi.getGrandTotal());

        res.setAdvancePaid(pi.getAdvancePaid());
        res.setBalanceDue(pi.getBalanceDue());

        res.setPaymentMethod(pi.getPaymentMethod());
        res.setPaymentNotes(pi.getPaymentNotes());

        res.setStatus(pi.getStatus());
        res.setRevisionNo(pi.getRevisionNo());

        List<ProformaItemResponse> itemResponses = pi.getItems().stream().map(item -> {
                    ProformaItemResponse ir = new ProformaItemResponse();
                    ir.setId(item.getId());
                    ir.setItemCode(item.getItemCode());
                    ir.setBarcode(item.getBarcode());
                    ir.setDescription(item.getDescription());
                    ir.setUnit(item.getUnit());
                    ir.setQuantity(item.getQuantity());
                    ir.setPrice(item.getPrice());
                    ir.setTaxPercent(item.getTaxPercent());
                    ir.setDiscountPercent(item.getDiscountPercent());
                    ir.setFoc(item.getFoc());
                    ir.setFocUnit(item.getFocUnit());
                    ir.setRemarks(item.getRemarks());
                    ir.setLineTotal(item.getLineTotal());
                    return ir;
                }).toList();

        List<String> codes = itemResponses.stream()
                .map(ProformaItemResponse::getItemCode)
                .filter(c -> c != null && !c.isBlank())
                .distinct()
                .toList();

        if (!codes.isEmpty()) {
            Map<String, String> imageMap = new HashMap<>();
            productMediaRepository.findPrimaryByProductCodesIn(codes)
                    .forEach(m -> imageMap.put(m.getProduct().getCode(), m.getImageUrl()));
            itemResponses.forEach(ir -> ir.setImage(imageMap.get(ir.getItemCode())));
        }

        res.setItems(itemResponses);

        return res;
    }

    private void hydrateProformaItemDisplayData(ProformaInvoice pi) {
        if (pi == null || pi.getItems() == null) {
            return;
        }

        pi.getItems().forEach(this::hydrateProformaItemDisplayData);
    }

    private void hydrateProformaItemDisplayData(ProformaInvoiceItem item) {
        if (item == null || item.getItemCode() == null || item.getItemCode().isBlank()) {
            return;
        }

        Product product = productRepo.findByCodeAndIsActiveTrue(item.getItemCode()).orElse(null);
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
    }

    private void validateStockAvailability(ProformaInvoice pi) {
        Warehouse warehouse = pi.getWarehouse();
        if (warehouse == null) {
            return;
        }

        List<Object[]> requiredStock = repo.getRequiredStockByProduct(pi.getId());
        List<String> shortfall = new ArrayList<>();

        for (Object[] row : requiredStock) {
            String itemCode = (String) row[0];
            Long productId = (Long) row[1];
            BigDecimal required = new BigDecimal(row[2].toString());

            BigDecimal available = warehouseStockService.getAvailableStock(warehouse.getId(), productId);
            if (available.compareTo(required) < 0) {
                shortfall.add(itemCode + " (need " + required.stripTrailingZeros().toPlainString()
                        + ", available " + available.stripTrailingZeros().toPlainString() + ")");
            }
        }

        if (!shortfall.isEmpty()) {
            throw new IllegalStateException(
                    "Insufficient stock in warehouse '" + warehouse.getName() + "' for: "
                    + String.join(", ", shortfall));
        }
    }

    private Warehouse resolveDefaultWarehouse() {
        Branch currentBranch = branchAccessService.getCurrentUserBranchOrNull();
        return currentBranch != null ? currentBranch.getDefaultWarehouse() : null;
    }
}
