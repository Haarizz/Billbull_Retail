package com.billbull.backend.sales.quotation;

import java.io.IOException;
import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.billbull.backend.security.AuditLogService;

@RestController
@RequestMapping("/api/sales/quotations")
@CrossOrigin(origins = "*")
@PreAuthorize("hasAnyRole('ADMIN','SALES')")
public class QuotationController {

    private final QuotationService service;
    private final AuditLogService auditLogService;

    public QuotationController(QuotationService service, AuditLogService auditLogService) {
        this.service = service;
        this.auditLogService = auditLogService;
    }

    // ---------------- PRODUCTS ----------------
    @GetMapping("/products-lookup")
    public ResponseEntity<List<SalesProductDTO>> getProductsForQuotation() {
        return ResponseEntity.ok(service.getProductsForSales());
    }

    // ---------------- CRUD ----------------
    @GetMapping("/next-qtn-no")
    public ResponseEntity<String> getNextQtnNo() {
        return ResponseEntity.ok(service.generateNextQuotationNo());
    }

    @GetMapping
    public ResponseEntity<List<Quotation>> getAll() {
        return ResponseEntity.ok(service.getAllQuotations());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Quotation> getById(@PathVariable Long id) {
        return ResponseEntity.ok(service.getQuotationById(id));
    }

    @PostMapping
    public ResponseEntity<Quotation> save(@RequestBody Quotation quotation) {
        return ResponseEntity.ok(service.createOrUpdateQuotation(quotation));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.deleteQuotation(id);
        return ResponseEntity.ok().build();
    }

    // ---------------- STATUS UPDATE ----------------
    @PutMapping("/{id}/status")
    public ResponseEntity<?> updateStatus(
            @PathVariable Long id,
            @RequestParam String status) {

        try {
            QuotationStatus enumStatus = QuotationStatus.valueOf(status);
            return ResponseEntity.ok(service.updateStatus(id, enumStatus));

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body("Invalid quotation status: " + status);

        } catch (IllegalStateException e) {
            return ResponseEntity.status(409)
                    .body(e.getMessage());
        }
    }

    // ---------------- STOCK CHECK (READ-ONLY) ----------------
    @GetMapping("/{id}/stock-check")
    public ResponseEntity<List<QuotationStockCheckDTO>> checkStock(
            @PathVariable Long id) {

        return ResponseEntity.ok(service.checkStockForApproval(id));
    }

    // ---------------- PRICE HISTORY ----------------
    @GetMapping("/history/item/{itemCode}")
    public ResponseEntity<List<QuotationHistoryDTO>> getItemPriceHistory(
            @PathVariable String itemCode) {
        return ResponseEntity.ok(service.getItemPriceHistory(itemCode));
    }

    // ---------------- ATTACHMENTS ----------------
    @PostMapping(value = "/{id}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> uploadAttachment(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) {

        try {
            return ResponseEntity.ok(service.uploadAttachment(id, file));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body("File upload failed");
        }
    }

    // ---------------- REVISIONS ----------------
    @PostMapping("/{id}/revise")
    public ResponseEntity<?> createRevision(
            @PathVariable Long id,
            @RequestBody String note) {

        try {
            return ResponseEntity.ok(service.createRevision(id, note));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body("Failed to create revision");
        }
    }
}