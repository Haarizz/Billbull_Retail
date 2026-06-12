package com.billbull.backend.inventory.warehouse;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/warehouses/bins/{binId}/stock")
public class BinStockController {

    private static final String MODULE = "inventory";

    private final BinStockService binStockService;
    private final ModulePermissionService modulePermissionService;

    public BinStockController(BinStockService binStockService, ModulePermissionService modulePermissionService) {
        this.binStockService = binStockService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public List<BinStockResponse> getStock(@PathVariable Long binId) {
        modulePermissionService.requireCanView(MODULE);
        return binStockService.getStockByBin(binId);
    }

    @GetMapping("/summary")
    public BinStockSummary getSummary(@PathVariable Long binId) {
        modulePermissionService.requireCanView(MODULE);
        return new BinStockSummary(
                binStockService.getTotalQuantityByBin(binId),
                binStockService.getSkuCountByBin(binId));
    }

    public record BinStockSummary(int currentQuantity, int skuCount) {
    }
}
