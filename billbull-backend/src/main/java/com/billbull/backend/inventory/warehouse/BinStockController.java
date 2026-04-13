package com.billbull.backend.inventory.warehouse;

import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/warehouses/bins/{binId}/stock")
public class BinStockController {

    private final BinStockService binStockService;

    public BinStockController(BinStockService binStockService) {
        this.binStockService = binStockService;
    }

    @GetMapping
    public List<BinStockResponse> getStock(@PathVariable Long binId) {
        return binStockService.getStockByBin(binId);
    }

    @GetMapping("/summary")
    public BinStockSummary getSummary(@PathVariable Long binId) {
        return new BinStockSummary(
                binStockService.getTotalQuantityByBin(binId),
                binStockService.getSkuCountByBin(binId));
    }

    public record BinStockSummary(int currentQuantity, int skuCount) {
    }
}
