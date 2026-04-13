package com.billbull.backend.financials.payment;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/financials/payment-methods")
@CrossOrigin(origins = "*")
@PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
public class PaymentMethodController {

    private final PaymentMethodRepository repository;

    public PaymentMethodController(PaymentMethodRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<PaymentMethod> getAllPaymentMethods() {
        return repository.findAll();
    }

    @GetMapping("/active")
    public List<PaymentMethod> getActivePaymentMethods() {
        return repository.findByIsActiveTrue();
    }

    @PostMapping
    public PaymentMethod createPaymentMethod(@RequestBody PaymentMethod method) {
        return repository.save(method);
    }

    @PutMapping("/{id}")
    public PaymentMethod updatePaymentMethod(@PathVariable Long id, @RequestBody PaymentMethod method) {
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
        if (!repository.existsById(id)) {
            throw new RuntimeException("Payment Method not found: " + id);
        }
        repository.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
