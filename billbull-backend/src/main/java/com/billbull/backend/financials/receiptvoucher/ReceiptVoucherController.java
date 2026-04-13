package com.billbull.backend.financials.receiptvoucher;

import com.billbull.backend.security.AuditLogService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/sales/receipt-vouchers")
@CrossOrigin(origins = "*")
@PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
public class ReceiptVoucherController {

    private final ReceiptVoucherService service;
    private final ObjectMapper objectMapper;
    private final AuditLogService auditLogService;

    public ReceiptVoucherController(ReceiptVoucherService service, ObjectMapper objectMapper,
            AuditLogService auditLogService) {
        this.service = service;
        this.objectMapper = objectMapper;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public ResponseEntity<List<ReceiptVoucher>> getAllReceipts() {
        return ResponseEntity.ok(service.getAllReceipts());
    }

    @GetMapping("/{id}")
    public ResponseEntity<ReceiptVoucher> getReceiptById(@PathVariable Long id) {
        return ResponseEntity.ok(service.getReceiptById(id));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ReceiptVoucher> createReceipt(
            @RequestPart("data") String receiptData,
            @RequestPart(value = "file", required = false) MultipartFile file) throws Exception {

        ReceiptVoucher receipt = objectMapper.readValue(receiptData, ReceiptVoucher.class);
        return ResponseEntity.ok(service.createReceipt(receipt, file));
    }

    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ReceiptVoucher> updateReceipt(
            @PathVariable Long id,
            @RequestPart("data") String receiptData,
            @RequestPart(value = "file", required = false) MultipartFile file) throws Exception {

        ReceiptVoucher receipt = objectMapper.readValue(receiptData, ReceiptVoucher.class);
        return ResponseEntity.ok(service.updateReceipt(id, receipt, file));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteReceipt(@PathVariable Long id) {
        service.deleteReceipt(id);
        return ResponseEntity.ok().build();
    }
}
