package com.billbull.backend.financials.payment;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/financials/payment-methods")
@PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
public class PaymentMethodController {

    private static final String MODULE = "finance";

    private final PaymentMethodRepository repository;
    private final ModulePermissionService modulePermissionService;

    public PaymentMethodController(PaymentMethodRepository repository, ModulePermissionService modulePermissionService) {
        this.repository = repository;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public List<PaymentMethod> getAllPaymentMethods() {
        modulePermissionService.requireCanView(MODULE);
        return repository.findAll();
    }

    @GetMapping("/active")
    public List<PaymentMethod> getActivePaymentMethods() {
        modulePermissionService.requireCanView(MODULE);
        return repository.findByIsActiveTrue();
    }

    @PostMapping
    public PaymentMethod createPaymentMethod(@RequestBody PaymentMethod method) {
        modulePermissionService.requireCanCreate(MODULE);
        return repository.save(method);
    }

    @PutMapping("/{id}")
    public PaymentMethod updatePaymentMethod(@PathVariable Long id, @RequestBody PaymentMethod method) {
        modulePermissionService.requireCanEdit(MODULE);
        PaymentMethod existing = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Payment Method not found: " + id));

        existing.setName(method.getName());
        existing.setCode(method.getCode());
        existing.setAccountCode(method.getAccountCode());
        existing.setIsActive(method.getIsActive());
        existing.setDescription(method.getDescription());

        return repository.save(existing);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deletePaymentMethod(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        if (!repository.existsById(id)) {
            throw new RuntimeException("Payment Method not found: " + id);
        }
        repository.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
