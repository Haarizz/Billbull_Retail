package com.billbull.backend.financials.expensevoucher;

import com.billbull.backend.security.ModulePermissionService;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/expense-vouchers")
@PreAuthorize("isAuthenticated()")
public class ExpenseVoucherController {

    private static final String MODULE = "finance";

    private final ExpenseVoucherService service;
    private final ModulePermissionService modulePermissionService;

    public ExpenseVoucherController(ExpenseVoucherService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public List<ExpenseVoucher> getAll() {
        modulePermissionService.requireCanView(MODULE);
        return service.getAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<ExpenseVoucher> getById(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getById(id));
    }

    @PostMapping
    public ResponseEntity<ExpenseVoucher> create(@RequestBody ExpenseVoucherRequest req) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.create(req));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ExpenseVoucher> update(@PathVariable Long id, @RequestBody ExpenseVoucherRequest req) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.update(id, req));
    }

    /** POST /api/expense-vouchers/{id}/approve — marks Paid and posts GL journal. */
    @PostMapping("/{id}/approve")
    public ResponseEntity<ExpenseVoucher> approve(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.approve(id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
