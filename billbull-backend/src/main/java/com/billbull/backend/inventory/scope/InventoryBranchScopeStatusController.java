package com.billbull.backend.inventory.scope;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Branch-Level Inventory Phase 11 — read-only exposure of the per-tenant
 * {@code inventory.branch-scope.enabled} flag so the SPA can gate branch labels/badges (e.g.
 * "On-hand @ &lt;branch&gt;", "Global/Shared") to the tenants where scoping is actually active,
 * avoiding cosmetic drift where a label claims branch-specificity while the backend is still
 * company-wide.
 *
 * <p>This is CONFIG EXPOSURE ONLY — a single boolean read from {@link InventoryBranchScopeResolver}.
 * No business logic, no behaviour change; the flag still defaults false and still governs the
 * backend read-path scoping exactly as before.
 */
@RestController
@RequestMapping("/api/inventory/branch-scope")
public class InventoryBranchScopeStatusController {

    private final InventoryBranchScopeResolver resolver;

    public InventoryBranchScopeStatusController(InventoryBranchScopeResolver resolver) {
        this.resolver = resolver;
    }

    /** {@code { "enabled": <inventory.branch-scope.enabled> }} for the current tenant. */
    @GetMapping("/status")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Boolean>> status() {
        return ResponseEntity.ok(Map.of("enabled", resolver.isEnabled()));
    }
}
