package com.billbull.backend.inventory.balance;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/inventory/balances")
@CrossOrigin(origins = "*")
public class InventoryBalanceController {

    private final InventoryBalanceService service;

    public InventoryBalanceController(InventoryBalanceService service) {
        this.service = service;
    }

    /** All products with positive on-hand stock. */
    @GetMapping
    public List<InventoryBalance> getAll() {
        return service.findAll();
    }

    /** All balances for one warehouse. */
    @GetMapping("/by-warehouse/{warehouseId}")
    public List<InventoryBalance> getByWarehouse(@PathVariable Long warehouseId) {
        return service.findByWarehouse(warehouseId);
    }

    /** Total inventory value (all warehouses). */
    @GetMapping("/total-value")
    public ResponseEntity<Map<String, BigDecimal>> getTotalValue(
            @RequestParam(required = false) Long warehouseId) {
        BigDecimal value = warehouseId != null
                ? service.totalInventoryValueByWarehouse(warehouseId)
                : service.totalInventoryValue();
        return ResponseEntity.ok(Map.of("totalValue", value != null ? value : BigDecimal.ZERO));
    }

    /** Full rebuild from stock_movements — use after bulk imports or data correction. */
    @PostMapping("/rebuild")
    public ResponseEntity<Map<String, Integer>> rebuild() {
        int count = service.rebuildAll();
        return ResponseEntity.ok(Map.of("rebuiltRows", count));
    }
}
