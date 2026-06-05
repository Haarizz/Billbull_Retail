package com.billbull.backend.financials.paymentterms;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/financials/payment-terms")
@CrossOrigin(origins = "*")
@PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT', 'MANAGER')")
public class PaymentTermsController {

    private final PaymentTermsService service;

    public PaymentTermsController(PaymentTermsService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<PaymentTerms>> getAll() {
        return ResponseEntity.ok(service.getAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<PaymentTerms> getById(@PathVariable Long id) {
        return service.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
    public ResponseEntity<PaymentTerms> save(@RequestBody PaymentTerms terms) {
        return ResponseEntity.ok(service.save(terms));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
    public ResponseEntity<PaymentTerms> update(@PathVariable Long id, @RequestBody PaymentTerms terms) {
        terms.setId(id);
        return ResponseEntity.ok(service.save(terms));
    }
}
