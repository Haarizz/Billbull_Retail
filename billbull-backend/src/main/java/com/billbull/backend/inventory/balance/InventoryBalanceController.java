package com.billbull.backend.inventory.balance;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/inventory/balances")
public class InventoryBalanceController {

    private static final String MODULE = "inventory";

    private final InventoryBalanceService service;
    private final ModulePermissionService modulePermissionService;

    public InventoryBalanceController(InventoryBalanceService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    /** All products with positive on-hand stock. */
    @GetMapping
    public List<InventoryBalance> getAll() {
        modulePermissionService.requireCanView(MODULE);
        return service.findAll();
    }

    /** All balances for one warehouse. */
    @GetMapping("/by-warehouse/{warehouseId}")
    public List<InventoryBalance> getByWarehouse(@PathVariable Long warehouseId) {
        modulePermissionService.requireCanView(MODULE);
        return service.findByWarehouse(warehouseId);
    }

    /** Total inventory value (all warehouses). */
    @GetMapping("/total-value")
    public ResponseEntity<Map<String, BigDecimal>> getTotalValue(
            @RequestParam(required = false) Long warehouseId) {
        modulePermissionService.requireCanView(MODULE);
        BigDecimal value = warehouseId != null
                ? service.totalInventoryValueByWarehouse(warehouseId)
                : service.totalInventoryValue();
        return ResponseEntity.ok(Map.of("totalValue", value != null ? value : BigDecimal.ZERO));
    }

    /** Full rebuild from stock_movements — use after bulk imports or data correction. */
    @PostMapping("/rebuild")
    public ResponseEntity<Map<String, Integer>> rebuild() {
        modulePermissionService.requireCanEdit(MODULE);
        int count = service.rebuildAll();
        return ResponseEntity.ok(Map.of("rebuiltRows", count));
    }
}
