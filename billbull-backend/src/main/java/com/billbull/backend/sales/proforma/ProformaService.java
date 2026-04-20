package com.billbull.backend.sales.proforma;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductBarcode;
import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.inventory.product.ProductMediaRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.util.DocumentOrderingUtil;

@Service
@Transactional
public class ProformaService {

    private final ProformaRepository repo;
    private final ProductRepository productRepo;
    private final ProductBarcodeRepository barcodeRepo;
    private final ProductMediaRepository productMediaRepository;

    public ProformaService(
            ProformaRepository repo,
            ProductRepository productRepo,
            ProductBarcodeRepository barcodeRepo,
            ProductMediaRepository productMediaRepository) {
        this.repo = repo;
        this.productRepo = productRepo;
        this.barcodeRepo = barcodeRepo;
        this.productMediaRepository = productMediaRepository;
    }

    /* ================= CREATE ================= */

    public ProformaResponse create(ProformaRequest req) {
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

        pi.getItems().clear(); // orphanRemoval handles delete

        buildEntity(req, pi);
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
        repo.deleteById(id);
    }

    /* ================= ISSUE ================= */

    public ProformaResponse issue(Long id) {

        ProformaInvoice pi = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Proforma not found"));

        if (pi.getBalanceDue().compareTo(BigDecimal.ZERO) > 0) {
            throw new IllegalStateException("Full payment required");
        }

        pi.setStatus(ProformaStatus.ISSUED);
        pi.setIssuedAt(java.time.LocalDateTime.now());

        return toResponse(repo.save(pi));
    }

    /* ================= ENTITY BUILDER ================= */

    private ProformaInvoice buildEntity(ProformaRequest req, ProformaInvoice pi) {

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

        BigDecimal sub = BigDecimal.ZERO;
        BigDecimal tax = BigDecimal.ZERO;

        if (pi.getItems() == null) {
            pi.setItems(new ArrayList<>());
        }

        for (ProformaItemRequest i : req.items) {

            BigDecimal base = i.quantity.multiply(i.price);
            BigDecimal taxAmt = base.multiply(i.taxPercent).divide(BigDecimal.valueOf(100));
            BigDecimal total = base.add(taxAmt);

            ProformaInvoiceItem item = new ProformaInvoiceItem();
            item.setProforma(pi);
            item.setItemCode(i.itemCode);
            item.setBarcode(i.barcode);
            item.setDescription(i.description);
            item.setUnit(i.unit);
            item.setQuantity(i.quantity);
            item.setPrice(i.price);
            item.setTaxPercent(i.taxPercent);
            item.setFoc(i.foc);
            item.setFocUnit(i.focUnit);
            item.setRemarks(i.remarks);
            hydrateProformaItemDisplayData(item);
            item.setLineTotal(total);

            pi.getItems().add(item);

            sub = sub.add(base);
            tax = tax.add(taxAmt);
        }

        pi.setSubTotal(sub);
        pi.setTaxTotal(tax);
        pi.setGrandTotal(sub.add(tax));
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

        res.setSubTotal(pi.getSubTotal());
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
                    ir.setQuantity(item.getQuantity().intValue());
                    ir.setPrice(item.getPrice());
                    ir.setTaxPercent(item.getTaxPercent());
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
}
