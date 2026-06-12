package com.billbull.backend.financials.paymentterms;

import com.billbull.backend.security.ModulePermissionService;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/financials/payment-terms")
@PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT', 'MANAGER')")
public class PaymentTermsController {

    private static final String MODULE = "finance";

    private final PaymentTermsService service;
    private final ModulePermissionService modulePermissionService;

    public PaymentTermsController(PaymentTermsService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public ResponseEntity<List<PaymentTerms>> getAll() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<PaymentTerms> getById(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return service.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
    public ResponseEntity<PaymentTerms> save(@RequestBody PaymentTerms terms) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.save(terms));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
    public ResponseEntity<PaymentTerms> update(@PathVariable Long id, @RequestBody PaymentTerms terms) {
        modulePermissionService.requireCanEdit(MODULE);
        terms.setId(id);
        return ResponseEntity.ok(service.save(terms));
    }
}
