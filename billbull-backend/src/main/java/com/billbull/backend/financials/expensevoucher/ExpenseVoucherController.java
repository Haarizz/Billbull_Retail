package com.billbull.backend.financials.expensevoucher;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/expense-vouchers")
@PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
public class ExpenseVoucherController {

    private final ExpenseVoucherService service;

    public ExpenseVoucherController(ExpenseVoucherService service) {
        this.service = service;
    }

    @GetMapping
    public List<ExpenseVoucher> getAll() {
        return service.getAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<ExpenseVoucher> getById(@PathVariable Long id) {
        return ResponseEntity.ok(service.getById(id));
    }

    @PostMapping
    public ResponseEntity<ExpenseVoucher> create(@RequestBody ExpenseVoucherRequest req) {
        return ResponseEntity.ok(service.create(req));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ExpenseVoucher> update(@PathVariable Long id, @RequestBody ExpenseVoucherRequest req) {
        return ResponseEntity.ok(service.update(id, req));
    }

    /** POST /api/expense-vouchers/{id}/approve — marks Paid and posts GL journal. */
    @PostMapping("/{id}/approve")
    public ResponseEntity<ExpenseVoucher> approve(@PathVariable Long id) {
        return ResponseEntity.ok(service.approve(id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
