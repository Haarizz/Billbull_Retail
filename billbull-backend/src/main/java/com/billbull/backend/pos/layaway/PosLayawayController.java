package com.billbull.backend.pos.layaway;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * POS layaway endpoints: create a reserved sale from the cart, list/search them,
 * cancel (supervisor), and stamp as converted once the conversion sale has posted.
 */
@RestController
@RequestMapping("/api/pos/layaways")
@CrossOrigin
public class PosLayawayController {

    private final PosLayawayService service;

    public PosLayawayController(PosLayawayService service) {
        this.service = service;
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosLayaway> create(@RequestBody PosLayawayCreateRequest request) {
        return ResponseEntity.ok(service.create(request));
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PosLayaway>> list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) PosLayawayStatus status,
            @RequestParam(required = false) String customer,
            @RequestParam(required = false) String number) {
        return ResponseEntity.ok(service.search(branchId, status, customer, number));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosLayaway> get(@PathVariable Long id) {
        return ResponseEntity.ok(service.getById(id));
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosLayaway> cancel(@PathVariable Long id) {
        return ResponseEntity.ok(service.cancel(id));
    }

    @PostMapping("/{id}/convert")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosLayaway> convert(@PathVariable Long id, @RequestBody ConvertRequest body) {
        return ResponseEntity.ok(service.markConverted(id, body.getInvoiceId(), body.getInvoiceNumber()));
    }

    public static class ConvertRequest {
        private Long invoiceId;
        private String invoiceNumber;

        public Long getInvoiceId() { return invoiceId; }
        public void setInvoiceId(Long invoiceId) { this.invoiceId = invoiceId; }
        public String getInvoiceNumber() { return invoiceNumber; }
        public void setInvoiceNumber(String invoiceNumber) { this.invoiceNumber = invoiceNumber; }
    }
}
