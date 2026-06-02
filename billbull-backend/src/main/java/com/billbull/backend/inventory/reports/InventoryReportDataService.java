package com.billbull.backend.inventory.reports;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductBarcode;
import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.inventory.product.ProductInventoryPolicy;
import com.billbull.backend.inventory.product.ProductInventoryPolicyRepository;
import com.billbull.backend.inventory.product.ProductPricing;
import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.product.ProductType;
import com.billbull.backend.inventory.stocktransfer.StockTransfer;
import com.billbull.backend.inventory.stocktransfer.StockTransferItem;
import com.billbull.backend.inventory.stocktransfer.StockTransferRepository;
import com.billbull.backend.inventory.warehouse.Bin;
import com.billbull.backend.inventory.warehouse.BinRepository;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.purchase.grn.GrnEntity;
import com.billbull.backend.purchase.grn.GrnItemEntity;
import com.billbull.backend.purchase.grn.GrnRepository;
import com.billbull.backend.purchase.invoice.PurchaseInvoice;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceItem;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.purchase.stockmovement.StockMovement;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.purchase.stockmovement.StockSourceType;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;

@Service
@Transactional(readOnly = true)
public class InventoryReportDataService {

    private static final BigDecimal HUNDRED = new BigDecimal("100");

    private final InventoryReportService stockReportService;
    private final ProductRepository productRepo;
    private final ProductPricingRepository pricingRepo;
    private final ProductInventoryPolicyRepository inventoryRepo;
    private final ProductBarcodeRepository barcodeRepo;
    private final StockMovementRepository stockRepo;
    private final WarehouseRepository warehouseRepo;
    private final BinRepository binRepo;
    private final StockTransferRepository stockTransferRepo;
    private final SalesInvoiceRepository salesInvoiceRepo;
    private final PurchaseInvoiceRepository purchaseInvoiceRepo;
    private final GrnRepository grnRepo;

    public InventoryReportDataService(
            InventoryReportService stockReportService,
            ProductRepository productRepo,
            ProductPricingRepository pricingRepo,
            ProductInventoryPolicyRepository inventoryRepo,
            ProductBarcodeRepository barcodeRepo,
            StockMovementRepository stockRepo,
            WarehouseRepository warehouseRepo,
            BinRepository binRepo,
            StockTransferRepository stockTransferRepo,
            SalesInvoiceRepository salesInvoiceRepo,
            PurchaseInvoiceRepository purchaseInvoiceRepo,
            GrnRepository grnRepo) {
        this.stockReportService = stockReportService;
        this.productRepo = productRepo;
        this.pricingRepo = pricingRepo;
        this.inventoryRepo = inventoryRepo;
        this.barcodeRepo = barcodeRepo;
        this.stockRepo = stockRepo;
        this.warehouseRepo = warehouseRepo;
        this.binRepo = binRepo;
        this.stockTransferRepo = stockTransferRepo;
        this.salesInvoiceRepo = salesInvoiceRepo;
        this.purchaseInvoiceRepo = purchaseInvoiceRepo;
        this.grnRepo = grnRepo;
    }

    public InventoryReportDataResponse getReport(String reportId, Long warehouseId) {
        return getReport(reportId, warehouseId, null, null, null, null, null, null);
    }

    public InventoryReportDataResponse getReport(
            String reportId,
            Long warehouseId,
            LocalDate dateFrom,
            LocalDate dateTo,
            String department,
            String brand,
            String search,
            String stockCondition) {
        String id = reportId == null ? "stock-on-hand" : reportId.trim().toLowerCase();
        InventoryReportDataResponse report = switch (id) {
            case "soh", "stock-on-hand" -> stockOnHand(warehouseId);
            case "low_stock", "low-stock", "low-stock-reorder" -> lowStock(warehouseId);
            case "out_of_stock", "out-of-stock" -> outOfStock(warehouseId);
            case "negative_stock", "negative-stock", "negative-stock-mismatch" -> negativeStock(warehouseId);
            case "valuation", "stock-valuation" -> stockValuation(warehouseId);
            case "expiry", "expiry-batch-ageing", "expiry-batch-aging" -> expiryBatchAgeing(warehouseId);
            case "movement_ledger", "stock-movement-ledger" -> stockMovementLedger(warehouseId);
            case "transfer", "stock-transfer-report" -> stockTransferReport(warehouseId);
            case "reconciliation", "stock-reconciliation-report" -> stockReconciliationReport(warehouseId);
            case "wastage", "wastage-internal-consumption" -> wastageInternalConsumption(warehouseId);
            case "in_out_summary", "inflow-outflow-summary" -> inflowOutflowSummary(warehouseId);
            case "price_audit", "price-level-audit" -> priceLevelAudit();
            case "cost_variance", "grn-invoice-cost-variance" -> grnInvoiceCostVariance();
            case "margin", "item-margin-report" -> itemMarginReport();
            case "master_completeness", "item-master-completeness" -> itemMasterCompleteness();
            case "barcode_audit", "barcode-label-audit" -> barcodeLabelAudit();
            case "scale_export", "weighing-scale-export" -> weighingScaleExport();
            case "dead_stock", "dead-slow-moving-stock" -> deadSlowMovingStock(warehouseId);
            case "fast_moving", "fast-moving-items" -> fastMovingItems();
            case "bin_stock", "warehouse-bin-stock" -> warehouseBinStock(warehouseId);
            default -> throw new IllegalArgumentException("Unknown inventory report: " + reportId);
        };
        applyFilters(report, dateFrom, dateTo, department, brand, search, stockCondition);
        return report;
    }

    private InventoryReportDataResponse stockOnHand(Long warehouseId) {
        List<StockReportResponse> source = stockReportService.getStockOnHand(warehouseId);
        List<Map<String, Object>> rows = source.stream().map(this::stockRow).toList();
        BigDecimal totalQty = source.stream().map(StockReportResponse::getOnHand).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalValue = source.stream().map(StockReportResponse::getValue).reduce(BigDecimal.ZERO, BigDecimal::add);

        InventoryReportDataResponse report = base("stock-on-hand", "Stock on Hand (SOH)",
                "Current available quantity by item, category, batch, and warehouse.");
        report.setCards(List.of(
                card("Total SKUs", source.stream().map(StockReportResponse::getProductId).filter(Objects::nonNull).collect(Collectors.toSet()).size(), "across selected warehouses", "number"),
                card("Total Units", totalQty, "on hand now", "number"),
                card("Total Value", totalValue, "at item cost", "currency"),
                card("Warehouses", source.stream().map(StockReportResponse::getWarehouse).filter(Objects::nonNull).collect(Collectors.toSet()).size(), "with stock", "number")));
        report.setCharts(List.of(
                chart("Stock Qty by Category", "bar", aggregate(source, r -> label(r.getCategory()), StockReportResponse::getOnHand)),
                chart("Value Distribution", "pie", aggregate(source, r -> label(r.getCategory()), StockReportResponse::getValue))));
        report.setColumns(stockColumns(true));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse lowStock(Long warehouseId) {
        List<StockReportResponse> source = stockReportService.getStockOnHand(warehouseId).stream()
                .filter(r -> bd(r.getMinStock()).compareTo(BigDecimal.ZERO) > 0)
                .filter(r -> bd(r.getOnHand()).compareTo(bd(r.getMinStock())) <= 0)
                .sorted(Comparator.comparing(r -> ratio(bd(r.getOnHand()), bd(r.getMinStock()))))
                .toList();

        List<Map<String, Object>> rows = source.stream().map(r -> {
            BigDecimal onHand = bd(r.getOnHand());
            BigDecimal min = bd(r.getMinStock());
            BigDecimal shortage = min.subtract(onHand).max(BigDecimal.ZERO);
            String urgency = urgencyByRatio(ratio(onHand, min));
            return row(
                    "sku", r.getSku(),
                    "item", r.getItem(),
                    "category", r.getCategory(),
                    "department", r.getDepartment(),
                    "brand", r.getBrand(),
                    "warehouse", r.getWarehouse(),
                    "onHand", onHand,
                    "minStock", min,
                    "shortage", shortage,
                    "suggestedPoQty", bd(r.getSuggestedPoQty()).compareTo(BigDecimal.ZERO) > 0 ? r.getSuggestedPoQty() : shortage,
                    "urgency", urgency,
                    "defaultVendor", r.getDefaultVendor(),
                    "batchNumber", r.getBatchNumber(),
                    "expiryDate", r.getExpiryDate());
        }).toList();

        InventoryReportDataResponse report = base("low-stock-reorder", "Low Stock / Reorder",
                "Items at or below configured minimum stock.");
        report.setCards(List.of(
                card("Items Below Min", rows.size(), "need reorder review", "number"),
                card("Critical", countRows(rows, "urgency", "Critical"), "0-50% of minimum", "number"),
                card("High", countRows(rows, "urgency", "High"), "50-75% of minimum", "number"),
                card("Total Suggested PO", sum(rows, "suggestedPoQty"), "units", "number")));
        report.setColumns(List.of(
                column("SKU", "sku", "text"),
                column("Item", "item", "text"),
                column("Category", "category", "text"),
                column("Warehouse", "warehouse", "text"),
                column("On Hand", "onHand", "number"),
                column("Min Qty", "minStock", "number"),
                column("Shortage", "shortage", "number"),
                column("Suggested PO", "suggestedPoQty", "number"),
                column("Urgency", "urgency", "badge"),
                column("Vendor", "defaultVendor", "text")));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse outOfStock(Long warehouseId) {
        List<StockReportResponse> source = stockReportService.getOutOfStock(warehouseId);
        List<Map<String, Object>> rows = source.stream()
                .map(r -> row(
                        "sku", r.getSku(),
                        "item", r.getItem(),
                        "category", r.getCategory(),
                        "department", r.getDepartment(),
                        "brand", r.getBrand(),
                        "warehouse", r.getWarehouse(),
                        "onHand", BigDecimal.ZERO,
                        "lastSold", r.getLastSold(),
                        "lastReceived", r.getLastReceived(),
                        "suggestedPoQty", r.getSuggestedPoQty()))
                .toList();

        InventoryReportDataResponse report = base("out-of-stock", "Out of Stock",
                "Zero or negative stock items with last movement signals.");
        report.setCards(List.of(
                card("Out of Stock SKUs", rows.size(), "zero inventory", "number"),
                card("With Sales Signal", rows.stream().filter(r -> !blank(r.get("lastSold")) && !"N/A".equals(r.get("lastSold"))).count(), "had prior sales", "number"),
                card("With Receiving Signal", rows.stream().filter(r -> !blank(r.get("lastReceived")) && !"N/A".equals(r.get("lastReceived"))).count(), "had prior receipts", "number"),
                card("Suggested PO Total", sum(rows, "suggestedPoQty"), "units", "number")));
        report.setColumns(List.of(
                column("SKU", "sku", "text"),
                column("Item", "item", "text"),
                column("Category", "category", "text"),
                column("Warehouse", "warehouse", "text"),
                column("Last Sold", "lastSold", "date"),
                column("Last Received", "lastReceived", "date"),
                column("Suggested PO", "suggestedPoQty", "number")));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse negativeStock(Long warehouseId) {
        List<StockReportResponse> source = stockReportService.getStockOnHand(warehouseId).stream()
                .filter(r -> bd(r.getOnHand()).compareTo(BigDecimal.ZERO) < 0)
                .sorted(Comparator.comparing(StockReportResponse::getValue))
                .toList();
        List<Map<String, Object>> rows = source.stream()
                .map(r -> row(
                        "sku", r.getSku(),
                        "item", r.getItem(),
                        "category", r.getCategory(),
                        "warehouse", r.getWarehouse(),
                        "qty", r.getOnHand(),
                        "rootIssue", "Negative stock ledger balance",
                        "lastTxn", r.getLastSold(),
                        "costImpact", r.getValue(),
                        "severity", severityForCost(r.getValue().abs()),
                        "batchNumber", r.getBatchNumber()))
                .toList();
        InventoryReportDataResponse report = base("negative-stock-mismatch", "Negative Stock / Mismatch",
                "Items with stock below zero and cost exposure.");
        report.setCards(List.of(
                card("Negative SKUs", rows.size(), "data integrity issues", "number"),
                card("Critical", countRows(rows, "severity", "Critical"), "immediate fix needed", "number"),
                card("High Severity", countRows(rows, "severity", "High"), "action required", "number"),
                card("Cost Impact", sum(rows, "costImpact"), "financial exposure", "currency")));
        report.setColumns(List.of(
                column("SKU", "sku", "text"),
                column("Item", "item", "text"),
                column("Category", "category", "text"),
                column("Warehouse", "warehouse", "text"),
                column("Qty", "qty", "number"),
                column("Root Issue", "rootIssue", "text"),
                column("Cost Impact", "costImpact", "currency"),
                column("Severity", "severity", "badge")));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse stockValuation(Long warehouseId) {
        List<StockReportResponse> source = stockReportService.getStockValuation(warehouseId);
        List<Map<String, Object>> rows = source.stream().map(r -> {
            BigDecimal qty = bd(r.getOnHand());
            BigDecimal unitCost = bd(r.getUnitCost());
            BigDecimal fifoCost = bd(r.getFifoUnitCost()).compareTo(BigDecimal.ZERO) > 0 ? bd(r.getFifoUnitCost()) : unitCost;
            BigDecimal lifoCost = bd(r.getLifoUnitCost()).compareTo(BigDecimal.ZERO) > 0 ? bd(r.getLifoUnitCost()) : unitCost;
            return row(
                    "sku", r.getSku(),
                    "item", r.getItem(),
                    "category", r.getCategory(),
                    "department", r.getDepartment(),
                    "brand", r.getBrand(),
                    "warehouse", r.getWarehouse(),
                    "qty", qty,
                    "unitCost", unitCost,
                    "fifoUnitCost", fifoCost,
                    "lastPurchaseCost", lifoCost,
                    "value", unitCost.multiply(qty),
                    "fifoValue", fifoCost.multiply(qty),
                    "lastPurchaseValue", lifoCost.multiply(qty),
                    "costMethod", r.getCostMethod(),
                    "batchNumber", r.getBatchNumber(),
                    "expiryDate", r.getExpiryDate());
        }).toList();

        InventoryReportDataResponse report = base("stock-valuation", "Stock Valuation",
                "Inventory valuation by configured cost, FIFO, and last purchase cost.");
        report.setCards(List.of(
                card("Average/Method Cost", sum(rows, "value"), "configured cost method", "currency"),
                card("FIFO Cost Method", sum(rows, "fifoValue"), "first-in first-out basis", "currency"),
                card("Last Purchase Cost", sum(rows, "lastPurchaseValue"), "latest purchase price", "currency")));
        report.setCharts(List.of(
                chart("Valuation by Category", "bar", sumBy(rows, "category", "value")),
                chart("Warehouse Distribution", "pie", sumBy(rows, "warehouse", "value"))));
        report.setColumns(List.of(
                column("SKU", "sku", "text"),
                column("Item", "item", "text"),
                column("Category", "category", "text"),
                column("Warehouse", "warehouse", "text"),
                column("Qty", "qty", "number"),
                column("Cost Method", "costMethod", "badge"),
                column("Unit Cost", "unitCost", "currency"),
                column("FIFO Cost", "fifoUnitCost", "currency"),
                column("Last Cost", "lastPurchaseCost", "currency"),
                column("Value", "value", "currency")));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse expiryBatchAgeing(Long warehouseId) {
        LocalDate today = LocalDate.now();
        List<Map<String, Object>> rows = stockReportService.getStockOnHand(warehouseId).stream()
                .filter(r -> r.getExpiryDate() != null)
                .filter(r -> bd(r.getOnHand()).compareTo(BigDecimal.ZERO) > 0)
                .map(r -> {
                    long days = ChronoUnit.DAYS.between(today, r.getExpiryDate());
                    return row(
                            "sku", r.getSku(),
                            "item", r.getItem(),
                            "category", r.getCategory(),
                            "warehouse", r.getWarehouse(),
                            "batchNumber", r.getBatchNumber(),
                            "totalQty", r.getOnHand(),
                            "totalValue", r.getValue(),
                            "nearestExpiry", r.getExpiryDate(),
                            "daysToExpiry", days,
                            "worstStatus", expiryStatus(days));
                })
                .sorted(Comparator.comparing(r -> ((Number) r.get("daysToExpiry")).longValue()))
                .toList();

        InventoryReportDataResponse report = base("expiry-batch-ageing", "Expiry / Batch Ageing",
                "Expiring stock by batch, nearest expiry, and risk band.");
        report.setCards(List.of(
                card("Items Tracked", rows.size(), "batch expiry rows", "number"),
                card("Critical Batches <7d", rows.stream().filter(r -> "Critical".equals(r.get("worstStatus"))).count(), "urgent review", "number"),
                card("High Batches 8-14d", rows.stream().filter(r -> "High".equals(r.get("worstStatus"))).count(), "near expiry", "number"),
                card("At-Risk Value", rows.stream().filter(r -> ((Number) r.get("daysToExpiry")).longValue() <= 14).map(r -> bd(r.get("totalValue"))).reduce(BigDecimal.ZERO, BigDecimal::add), "critical + high batches", "currency")));
        report.setCharts(List.of(chart("Batch Ageing Distribution", "bar", expiryBuckets(rows))));
        report.setColumns(List.of(
                column("SKU", "sku", "text"),
                column("Item", "item", "text"),
                column("Category", "category", "text"),
                column("Batch", "batchNumber", "text"),
                column("Total Qty", "totalQty", "number"),
                column("Total Value", "totalValue", "currency"),
                column("Nearest Expiry", "nearestExpiry", "date"),
                column("Days", "daysToExpiry", "number"),
                column("Status", "worstStatus", "badge")));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse stockMovementLedger(Long warehouseId) {
        Map<Long, Product> products = productMapFromMovements();
        Map<Long, String> warehouses = warehouseNameMap();
        Map<String, BigDecimal> currentBalance = stockRepo.findAllStockGroupedByProductAndWarehouse().stream()
                .collect(Collectors.toMap(
                        r -> key(r[0], r[1]),
                        r -> bd(r[2]),
                        BigDecimal::add,
                        LinkedHashMap::new));

        List<Map<String, Object>> rows = stockRepo.findAll(Sort.by(Sort.Order.desc("movementDate"), Sort.Order.desc("id"))).stream()
                .filter(m -> warehouseId == null || Objects.equals(m.getWarehouseId(), warehouseId))
                .limit(500)
                .map(m -> {
                    Product p = products.get(m.getProductId());
                    BigDecimal qty = bd(m.getQuantity());
                    return row(
                            "date", m.getMovementDate(),
                            "type", movementLabel(m.getSourceType()),
                            "reference", m.getReferenceNo(),
                            "item", p != null ? p.getName() : "Product #" + m.getProductId(),
                            "sku", p != null ? firstNonBlank(p.getSku(), p.getCode()) : m.getProductId(),
                            "warehouse", warehouses.getOrDefault(m.getWarehouseId(), "Warehouse"),
                            "inQty", qty.compareTo(BigDecimal.ZERO) > 0 ? qty : null,
                            "outQty", qty.compareTo(BigDecimal.ZERO) < 0 ? qty.abs() : null,
                            "balance", currentBalance.getOrDefault(key(m.getProductId(), m.getWarehouseId()), BigDecimal.ZERO),
                            "unitCost", bd(m.getUnitCost()),
                            "batchNumber", m.getBatchNumber());
                })
                .toList();

        InventoryReportDataResponse report = base("stock-movement-ledger", "Stock Movement Ledger",
                "All stock in/out transactions with current balance.");
        report.setCards(List.of(
                card("Transactions", rows.size(), "latest ledger rows", "number"),
                card("Inbound Qty", sum(rows, "inQty"), "units", "number"),
                card("Outbound Qty", sum(rows, "outQty"), "units", "number"),
                card("Net Qty", sum(rows, "inQty").subtract(sum(rows, "outQty")), "units", "number")));
        report.setColumns(List.of(
                column("Date", "date", "date"),
                column("Type", "type", "badge"),
                column("Reference", "reference", "text"),
                column("Item", "item", "text"),
                column("SKU", "sku", "text"),
                column("Warehouse", "warehouse", "text"),
                column("In", "inQty", "number"),
                column("Out", "outQty", "number"),
                column("Balance", "balance", "number"),
                column("Unit Cost", "unitCost", "currency")));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse stockTransferReport(Long warehouseId) {
        List<Map<String, Object>> rows = stockTransferRepo.findAll(Sort.by(Sort.Order.desc("transferDate"), Sort.Order.desc("id"))).stream()
                .filter(t -> warehouseId == null
                        || (t.getFromWarehouse() != null && Objects.equals(t.getFromWarehouse().getId(), warehouseId))
                        || (t.getToWarehouse() != null && Objects.equals(t.getToWarehouse().getId(), warehouseId)))
                .flatMap(t -> t.getItems().stream().map(i -> transferRow(t, i)))
                .toList();

        InventoryReportDataResponse report = base("stock-transfer-report", "Stock Transfer Report",
                "Pending, in-transit, completed, and variance transfers.");
        report.setCards(List.of(
                card("Transfer Lines", rows.size(), "item movement rows", "number"),
                card("Pending", countRows(rows, "status", "Pending"), "awaiting action", "number"),
                card("In-Transit", countRows(rows, "status", "In-Transit"), "sent not received", "number"),
                card("Completed Value", rows.stream().filter(r -> "Completed".equals(r.get("status"))).map(r -> bd(r.get("value"))).reduce(BigDecimal.ZERO, BigDecimal::add), "received transfers", "currency")));
        report.setColumns(List.of(
                column("Ref", "ref", "text"),
                column("Date", "date", "date"),
                column("From", "fromWarehouse", "text"),
                column("To", "toWarehouse", "text"),
                column("Item", "item", "text"),
                column("SKU", "sku", "text"),
                column("Qty", "qty", "number"),
                column("Unit Cost", "unitCost", "currency"),
                column("Value", "value", "currency"),
                column("Approver", "approver", "text"),
                column("Status", "status", "badge")));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse stockReconciliationReport(Long warehouseId) {
        Map<Long, Product> products = productMapFromMovements();
        Map<Long, String> warehouses = warehouseNameMap();
        List<Map<String, Object>> rows = stockRepo.findAll(Sort.by(Sort.Order.desc("movementDate"), Sort.Order.desc("id"))).stream()
                .filter(m -> m.getSourceType() == StockSourceType.STOCK_TAKE_ADJUSTMENT)
                .filter(m -> warehouseId == null || Objects.equals(m.getWarehouseId(), warehouseId))
                .map(m -> {
                    Product p = products.get(m.getProductId());
                    BigDecimal diff = bd(m.getQuantity());
                    BigDecimal impact = bd(m.getUnitCost()).multiply(diff);
                    return row(
                            "date", m.getMovementDate(),
                            "ref", m.getReferenceNo(),
                            "item", p != null ? p.getName() : "Product #" + m.getProductId(),
                            "sku", p != null ? firstNonBlank(p.getSku(), p.getCode()) : m.getProductId(),
                            "warehouse", warehouses.getOrDefault(m.getWarehouseId(), "Warehouse"),
                            "beforeQty", null,
                            "afterQty", null,
                            "diff", diff,
                            "reason", "Stock take adjustment",
                            "approver", firstNonBlank(m.getUpdatedBy(), m.getCreatedBy(), "System"),
                            "costImpact", impact);
                })
                .toList();

        InventoryReportDataResponse report = base("stock-reconciliation-report", "Stock Reconciliation Report",
                "Approved stock-take adjustments with quantity and cost impact.");
        report.setCards(List.of(
                card("Adjustments", rows.size(), "posted stock corrections", "number"),
                card("Positive Adj.", rows.stream().filter(r -> bd(r.get("diff")).compareTo(BigDecimal.ZERO) > 0).count(), "stock increases", "number"),
                card("Negative Adj.", rows.stream().filter(r -> bd(r.get("diff")).compareTo(BigDecimal.ZERO) < 0).count(), "stock decreases", "number"),
                card("Net Cost Impact", sum(rows, "costImpact"), "financial effect", "currency")));
        report.setColumns(List.of(
                column("Date", "date", "date"),
                column("Ref", "ref", "text"),
                column("Item", "item", "text"),
                column("SKU", "sku", "text"),
                column("Warehouse", "warehouse", "text"),
                column("Diff", "diff", "number"),
                column("Reason", "reason", "text"),
                column("Approver", "approver", "text"),
                column("Cost Impact", "costImpact", "currency")));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse wastageInternalConsumption(Long warehouseId) {
        Map<Long, Product> products = productMapFromMovements();
        Map<Long, String> warehouses = warehouseNameMap();
        List<Map<String, Object>> rows = stockRepo.findAll(Sort.by(Sort.Order.desc("movementDate"), Sort.Order.desc("id"))).stream()
                .filter(m -> warehouseId == null || Objects.equals(m.getWarehouseId(), warehouseId))
                .filter(this::isWastageMovement)
                .map(m -> {
                    Product p = products.get(m.getProductId());
                    BigDecimal qty = bd(m.getQuantity()).abs();
                    BigDecimal impact = qty.multiply(bd(m.getUnitCost()));
                    return row(
                            "date", m.getMovementDate(),
                            "ref", m.getReferenceNo(),
                            "item", p != null ? p.getName() : "Product #" + m.getProductId(),
                            "sku", p != null ? firstNonBlank(p.getSku(), p.getCode()) : m.getProductId(),
                            "category", p != null ? p.getCategory() : null,
                            "reason", wastageReason(m),
                            "warehouse", warehouses.getOrDefault(m.getWarehouseId(), "Warehouse"),
                            "qty", qty,
                            "unitCost", bd(m.getUnitCost()),
                            "impact", impact);
                })
                .toList();

        InventoryReportDataResponse report = base("wastage-internal-consumption", "Wastage / Internal Consumption",
                "Expired, damaged, and internal-use write-offs posted to the stock ledger.");
        report.setCards(List.of(
                card("Total Wastage Events", rows.size(), "ledger write-offs", "number"),
                card("Total Cost Impact", sum(rows, "impact"), "write-off value", "currency"),
                card("Avg per Event", rows.isEmpty() ? BigDecimal.ZERO : sum(rows, "impact").divide(new BigDecimal(rows.size()), 2, RoundingMode.HALF_UP), "cost per event", "currency")));
        report.setCharts(List.of(chart("Wastage by Category", "bar", sumBy(rows, "category", "impact"))));
        report.setColumns(List.of(
                column("Date", "date", "date"),
                column("Ref", "ref", "text"),
                column("Item", "item", "text"),
                column("SKU", "sku", "text"),
                column("Reason", "reason", "text"),
                column("Warehouse", "warehouse", "text"),
                column("Qty", "qty", "number"),
                column("Unit Cost", "unitCost", "currency"),
                column("Impact", "impact", "currency")));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse inflowOutflowSummary(Long warehouseId) {
        Map<Long, Product> products = productMapFromMovements();
        List<StockMovement> movements = stockRepo.findAll(Sort.by(Sort.Order.asc("movementDate")));
        if (warehouseId != null) {
            movements = movements.stream().filter(m -> Objects.equals(m.getWarehouseId(), warehouseId)).toList();
        }

        Map<String, Map<String, BigDecimal>> weekly = new LinkedHashMap<>();
        Map<String, Map<String, BigDecimal>> category = new LinkedHashMap<>();
        for (StockMovement movement : movements) {
            BigDecimal qty = bd(movement.getQuantity());
            BigDecimal value = qty.abs().multiply(bd(movement.getUnitCost()));
            String bucket = qty.compareTo(BigDecimal.ZERO) >= 0 ? "inflow" : "outflow";
            String week = weekLabel(movement.getMovementDate());
            Product product = products.get(movement.getProductId());
            String cat = product != null ? label(product.getCategory()) : "Uncategorized";
            addNested(weekly, week, bucket, value);
            addNested(category, cat, bucket, value);
        }
        List<Map<String, Object>> rows = weekly.entrySet().stream()
                .map(e -> {
                    BigDecimal inflow = e.getValue().getOrDefault("inflow", BigDecimal.ZERO);
                    BigDecimal outflow = e.getValue().getOrDefault("outflow", BigDecimal.ZERO);
                    return row("period", e.getKey(), "inflow", inflow, "outflow", outflow, "net", inflow.subtract(outflow));
                })
                .toList();

        InventoryReportDataResponse report = base("inflow-outflow-summary", "Inflow vs Outflow Summary",
                "Net inventory movement by period and category.");
        report.setCards(List.of(
                card("Inflow", sum(rows, "inflow"), "received value", "currency"),
                card("Outflow", sum(rows, "outflow"), "issued value", "currency"),
                card("Net", sum(rows, "net"), "movement value", "currency"),
                card("Periods", rows.size(), "weekly buckets", "number")));
        report.setCharts(List.of(
                chart("Weekly Inflow vs Outflow", "groupedBar", rows),
                chart("By Category", "horizontalBar", category.entrySet().stream()
                        .map(e -> row("name", e.getKey(), "inflow", e.getValue().getOrDefault("inflow", BigDecimal.ZERO), "outflow", e.getValue().getOrDefault("outflow", BigDecimal.ZERO)))
                        .toList())));
        report.setColumns(List.of(
                column("Period", "period", "text"),
                column("Inflow", "inflow", "currency"),
                column("Outflow", "outflow", "currency"),
                column("Net", "net", "currency")));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse priceLevelAudit() {
        List<Product> products = activeStockProducts();
        List<Long> productIds = products.stream().map(Product::getId).toList();
        Map<Long, ProductPricing> pricing = pricingMap(productIds);
        List<Map<String, Object>> rows = products.stream().map(p -> {
            ProductPricing pr = pricing.get(p.getId());
            return row(
                    "sku", firstNonBlank(p.getSku(), p.getCode()),
                    "item", p.getName(),
                    "category", p.getCategory(),
                    "cost", pr != null ? pr.getCost() : null,
                    "retailPrice", pr != null ? pr.getRetailPrice() : null,
                    "wholesalePrice", pr != null ? pr.getWholesalePrice() : null,
                    "minPrice", pr != null ? pr.getMinPrice() : null,
                    "maxPrice", pr != null ? pr.getMaxPrice() : null,
                    "onlinePrice", pr != null ? pr.getOnlinePrice() : null,
                    "gp", pr != null ? pr.getGp() : null,
                    "updatedBy", pr != null ? pr.getUpdatedBy() : p.getUpdatedBy(),
                    "updatedAt", pr != null ? pr.getUpdatedAt() : p.getUpdatedAt());
        }).toList();

        InventoryReportDataResponse report = base("price-level-audit", "Price Level / Price Change Audit",
                "Current price levels and latest pricing update metadata.");
        report.setCards(List.of(
                card("Priced Items", rows.stream().filter(r -> bd(r.get("retailPrice")).compareTo(BigDecimal.ZERO) > 0).count(), "with retail price", "number"),
                card("Missing Cost", rows.stream().filter(r -> bd(r.get("cost")).compareTo(BigDecimal.ZERO) == 0).count(), "needs costing", "number"),
                card("Missing Retail", rows.stream().filter(r -> bd(r.get("retailPrice")).compareTo(BigDecimal.ZERO) == 0).count(), "needs selling price", "number")));
        report.setColumns(List.of(
                column("SKU", "sku", "text"),
                column("Item", "item", "text"),
                column("Category", "category", "text"),
                column("Cost", "cost", "currency"),
                column("Retail", "retailPrice", "currency"),
                column("Wholesale", "wholesalePrice", "currency"),
                column("Min", "minPrice", "currency"),
                column("Max", "maxPrice", "currency"),
                column("Online", "onlinePrice", "currency"),
                column("GP %", "gp", "number"),
                column("Updated By", "updatedBy", "text"),
                column("Updated At", "updatedAt", "date")));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse grnInvoiceCostVariance() {
        Map<String, GrnItemEntity> grnItems = new HashMap<>();
        for (GrnEntity grn : grnRepo.findAll()) {
            for (GrnItemEntity item : grn.getItems()) {
                grnItems.put(key(grn.getGrnNo(), item.getProductCode()), item);
            }
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        for (PurchaseInvoice invoice : purchaseInvoiceRepo.findAll()) {
            if (blank(invoice.getGrnNo())) continue;
            for (PurchaseInvoiceItem item : invoice.getItems()) {
                GrnItemEntity grnItem = grnItems.get(key(invoice.getGrnNo(), item.getItemCode()));
                if (grnItem == null) continue;
                BigDecimal grnCost = bd(grnItem.getUnitCost());
                BigDecimal invoiceCost = bd(item.getUnitCost());
                BigDecimal variance = invoiceCost.subtract(grnCost);
                if (variance.compareTo(BigDecimal.ZERO) == 0) continue;
                BigDecimal qty = bd(item.getQty());
                rows.add(row(
                        "invoiceDate", invoice.getInvoiceDate(),
                        "invoiceNo", invoice.getInvoiceNumber(),
                        "grnNo", invoice.getGrnNo(),
                        "vendor", invoice.getVendorName(),
                        "sku", item.getItemCode(),
                        "item", item.getItemName(),
                        "qty", qty,
                        "grnCost", grnCost,
                        "invoiceCost", invoiceCost,
                        "varianceUnit", variance,
                        "varianceTotal", variance.multiply(qty),
                        "status", severityForCost(variance.abs().multiply(qty))));
            }
        }

        InventoryReportDataResponse report = base("grn-invoice-cost-variance", "GRN vs Invoice Cost Variance",
                "Cost differences between receiving and invoicing stages.");
        report.setCards(List.of(
                card("Variance Lines", rows.size(), "GRN/invoice mismatches", "number"),
                card("Total Variance", sum(rows, "varianceTotal"), "invoice minus GRN", "currency"),
                card("Critical", countRows(rows, "status", "Critical"), "large cost differences", "number")));
        report.setColumns(List.of(
                column("Invoice Date", "invoiceDate", "date"),
                column("Invoice", "invoiceNo", "text"),
                column("GRN", "grnNo", "text"),
                column("Vendor", "vendor", "text"),
                column("SKU", "sku", "text"),
                column("Item", "item", "text"),
                column("Qty", "qty", "number"),
                column("GRN Cost", "grnCost", "currency"),
                column("Invoice Cost", "invoiceCost", "currency"),
                column("Variance", "varianceTotal", "currency"),
                column("Status", "status", "badge")));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse itemMarginReport() {
        Map<String, MarginAccumulator> acc = new LinkedHashMap<>();
        for (SalesInvoice invoice : salesInvoiceRepo.findAll()) {
            if (invoice.getStatus() == SalesInvoiceStatus.CANCELLED || invoice.getStatus() == SalesInvoiceStatus.DRAFT) {
                continue;
            }
            for (SalesInvoiceItem item : invoice.getItems()) {
                String key = firstNonBlank(item.getSku(), item.getItemCode(), item.getItemName());
                MarginAccumulator a = acc.computeIfAbsent(key, k -> new MarginAccumulator(key, item.getItemName()));
                BigDecimal qty = bd(item.getQuantity());
                BigDecimal revenue = bd(item.getNetAmount());
                BigDecimal cogs = bd(item.getRecognizedCogs()).compareTo(BigDecimal.ZERO) > 0
                        ? bd(item.getRecognizedCogs())
                        : bd(item.getCost()).multiply(qty);
                a.qty = a.qty.add(qty);
                a.sales = a.sales.add(revenue);
                a.cost = a.cost.add(cogs);
            }
        }

        List<Map<String, Object>> rows = acc.values().stream()
                .map(a -> {
                    BigDecimal margin = a.sales.subtract(a.cost);
                    return row(
                            "sku", a.sku,
                            "item", a.item,
                            "qtySold", a.qty,
                            "salesValue", a.sales,
                            "costValue", a.cost,
                            "grossProfit", margin,
                            "gpPercent", percent(margin, a.sales));
                })
                .sorted((a, b) -> bd(b.get("grossProfit")).compareTo(bd(a.get("grossProfit"))))
                .toList();

        InventoryReportDataResponse report = base("item-margin-report", "Item Margin Report (GP%)",
                "Sales versus cost by item using posted sales invoice data.");
        report.setCards(List.of(
                card("Sales Value", sum(rows, "salesValue"), "posted invoices", "currency"),
                card("Cost Value", sum(rows, "costValue"), "line cost/COGS", "currency"),
                card("Gross Profit", sum(rows, "grossProfit"), "sales minus cost", "currency"),
                card("GP %", percent(sum(rows, "grossProfit"), sum(rows, "salesValue")), "overall margin", "number")));
        report.setColumns(List.of(
                column("SKU", "sku", "text"),
                column("Item", "item", "text"),
                column("Qty Sold", "qtySold", "number"),
                column("Sales", "salesValue", "currency"),
                column("Cost", "costValue", "currency"),
                column("Gross Profit", "grossProfit", "currency"),
                column("GP %", "gpPercent", "number")));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse itemMasterCompleteness() {
        List<Product> products = activeStockProducts();
        List<Long> productIds = products.stream().map(Product::getId).toList();
        Map<Long, ProductPricing> pricing = pricingMap(productIds);
        Map<Long, ProductInventoryPolicy> inventory = inventoryMap(productIds);
        Set<Long> productsWithBarcode = barcodeRepo.findByProductIdIn(productIds).stream()
                .filter(b -> !blank(b.getBarcode()))
                .map(b -> b.getProduct().getId())
                .collect(Collectors.toSet());

        List<Map<String, Object>> rows = products.stream().map(p -> {
            ProductPricing pr = pricing.get(p.getId());
            ProductInventoryPolicy inv = inventory.get(p.getId());
            List<String> issues = new ArrayList<>();
            if (blank(p.getSku()) && blank(p.getCode())) issues.add("SKU");
            if (!productsWithBarcode.contains(p.getId())) issues.add("Barcode");
            if (blank(p.getCategory())) issues.add("Category");
            if (p.getDepartment() == null) issues.add("Department");
            if (p.getBrand() == null) issues.add("Brand");
            if (pr == null || bd(pr.getCost()).compareTo(BigDecimal.ZERO) == 0) issues.add("Cost");
            if (inv == null || inv.getDefaultUnit() == null) issues.add("UOM");
            int score = Math.max(0, 100 - (issues.size() * 14));
            return row(
                    "sku", firstNonBlank(p.getSku(), p.getCode()),
                    "item", p.getName(),
                    "category", p.getCategory(),
                    "department", p.getDepartment() != null ? p.getDepartment().getName() : null,
                    "brand", p.getBrand() != null ? p.getBrand().getName() : null,
                    "score", score,
                    "issues", String.join(", ", issues),
                    "status", issues.isEmpty() ? "Complete" : (issues.size() <= 2 ? "Review" : "Incomplete"));
        }).toList();

        InventoryReportDataResponse report = base("item-master-completeness", "Item Master Completeness",
                "Missing barcode, cost, category, department, brand, and unit data.");
        report.setCards(List.of(
                card("Items Checked", rows.size(), "active stock items", "number"),
                card("Complete", countRows(rows, "status", "Complete"), "ready", "number"),
                card("Needs Review", rows.stream().filter(r -> !"Complete".equals(r.get("status"))).count(), "missing data", "number")));
        report.setColumns(List.of(
                column("SKU", "sku", "text"),
                column("Item", "item", "text"),
                column("Category", "category", "text"),
                column("Department", "department", "text"),
                column("Brand", "brand", "text"),
                column("Score", "score", "number"),
                column("Issues", "issues", "text"),
                column("Status", "status", "badge")));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse barcodeLabelAudit() {
        List<Map<String, Object>> rows = barcodeRepo.findAll().stream()
                .map(b -> row(
                        "barcode", b.getBarcode(),
                        "sku", b.getProduct() != null ? firstNonBlank(b.getProduct().getSku(), b.getProduct().getCode()) : null,
                        "item", b.getProduct() != null ? b.getProduct().getName() : null,
                        "includePrice", b.isIncludePrice() ? "Yes" : "No",
                        "perBranch", b.isPerBranch() ? "Yes" : "No",
                        "labelLayout", b.getLabelLayout(),
                        "active", b.isActive() ? "Active" : "Inactive",
                        "updatedAt", b.getUpdatedAt()))
                .toList();

        InventoryReportDataResponse report = base("barcode-label-audit", "Barcode / Label Audit",
                "Label templates, product barcode coverage, and label flags.");
        report.setCards(List.of(
                card("Barcodes", rows.size(), "registered labels", "number"),
                card("Price Labels", countRows(rows, "includePrice", "Yes"), "include price", "number"),
                card("Per Branch", countRows(rows, "perBranch", "Yes"), "branch-specific", "number")));
        report.setColumns(List.of(
                column("Barcode", "barcode", "text"),
                column("SKU", "sku", "text"),
                column("Item", "item", "text"),
                column("Include Price", "includePrice", "badge"),
                column("Per Branch", "perBranch", "badge"),
                column("Layout", "labelLayout", "text"),
                column("Active", "active", "badge"),
                column("Updated", "updatedAt", "date")));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse weighingScaleExport() {
        List<Product> products = activeStockProducts().stream().filter(Product::isWeighing).toList();
        List<Long> productIds = products.stream().map(Product::getId).toList();
        Map<Long, ProductPricing> pricing = pricingMap(productIds);
        Map<Long, String> barcode = primaryBarcodeMap(productIds);

        List<Map<String, Object>> rows = products.stream().map(p -> {
            ProductPricing pr = pricing.get(p.getId());
            return row(
                    "sku", firstNonBlank(p.getSku(), p.getCode()),
                    "barcode", barcode.get(p.getId()),
                    "item", p.getName(),
                    "department", p.getDepartment() != null ? p.getDepartment().getName() : null,
                    "unit", p.getInventory() != null && p.getInventory().getDefaultUnit() != null ? p.getInventory().getDefaultUnit().getName() : null,
                    "price", pr != null ? pr.getRetailPrice() : null,
                    "status", "Ready");
        }).toList();

        InventoryReportDataResponse report = base("weighing-scale-export", "Weighing Scale Export Report",
                "Items configured for weighing scale sync.");
        report.setCards(List.of(
                card("Scale Items", rows.size(), "weighing products", "number"),
                card("Missing Barcode", rows.stream().filter(r -> blank(r.get("barcode"))).count(), "cannot sync cleanly", "number"),
                card("Missing Price", rows.stream().filter(r -> bd(r.get("price")).compareTo(BigDecimal.ZERO) == 0).count(), "needs retail price", "number")));
        report.setColumns(List.of(
                column("SKU", "sku", "text"),
                column("Barcode", "barcode", "text"),
                column("Item", "item", "text"),
                column("Department", "department", "text"),
                column("Unit", "unit", "text"),
                column("Price", "price", "currency"),
                column("Status", "status", "badge")));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse deadSlowMovingStock(Long warehouseId) {
        List<StockReportResponse> stock = stockReportService.getStockOnHand(warehouseId).stream()
                .filter(r -> bd(r.getOnHand()).compareTo(BigDecimal.ZERO) > 0)
                .toList();
        Map<Long, Timestamp> lastSold = lastSoldMap(stock.stream().map(StockReportResponse::getProductId).filter(Objects::nonNull).toList());
        LocalDate today = LocalDate.now();
        List<Map<String, Object>> rows = stock.stream()
                .map(r -> {
                    Timestamp last = lastSold.get(r.getProductId());
                    Long days = last != null ? ChronoUnit.DAYS.between(last.toLocalDateTime().toLocalDate(), today) : null;
                    return row(
                            "sku", r.getSku(),
                            "item", r.getItem(),
                            "category", r.getCategory(),
                            "warehouse", r.getWarehouse(),
                            "onHand", r.getOnHand(),
                            "value", r.getValue(),
                            "lastSold", last != null ? last.toLocalDateTime().toLocalDate() : null,
                            "daysSinceSold", days,
                            "status", days == null ? "Dead" : (days >= 90 ? "Dead" : days >= 30 ? "Slow" : "Moving"));
                })
                .filter(r -> !"Moving".equals(r.get("status")))
                .sorted((a, b) -> bd(b.get("value")).compareTo(bd(a.get("value"))))
                .toList();

        InventoryReportDataResponse report = base("dead-slow-moving-stock", "Dead / Slow Moving Stock",
                "No sales in X days with ageing and stock value.");
        report.setCards(List.of(
                card("Dead Items", countRows(rows, "status", "Dead"), "no recent sale", "number"),
                card("Slow Items", countRows(rows, "status", "Slow"), "30-89 days", "number"),
                card("Stock Value", sum(rows, "value"), "slow/dead exposure", "currency")));
        report.setColumns(List.of(
                column("SKU", "sku", "text"),
                column("Item", "item", "text"),
                column("Category", "category", "text"),
                column("Warehouse", "warehouse", "text"),
                column("On Hand", "onHand", "number"),
                column("Value", "value", "currency"),
                column("Last Sold", "lastSold", "date"),
                column("Days", "daysSinceSold", "number"),
                column("Status", "status", "badge")));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse fastMovingItems() {
        LocalDate cutoff = LocalDate.now().minusDays(30);
        Map<String, MarginAccumulator> acc = new LinkedHashMap<>();
        for (SalesInvoice invoice : salesInvoiceRepo.findAll()) {
            if (invoice.getStatus() == SalesInvoiceStatus.CANCELLED || invoice.getInvoiceDate() == null || invoice.getInvoiceDate().isBefore(cutoff)) {
                continue;
            }
            for (SalesInvoiceItem item : invoice.getItems()) {
                String key = firstNonBlank(item.getSku(), item.getItemCode(), item.getItemName());
                MarginAccumulator a = acc.computeIfAbsent(key, k -> new MarginAccumulator(key, item.getItemName()));
                a.qty = a.qty.add(bd(item.getQuantity()));
                a.sales = a.sales.add(bd(item.getNetAmount()));
            }
        }
        List<Map<String, Object>> rows = acc.values().stream()
                .map(a -> row(
                        "sku", a.sku,
                        "item", a.item,
                        "qtySold", a.qty,
                        "salesValue", a.sales,
                        "avgDailyQty", a.qty.divide(new BigDecimal("30"), 2, RoundingMode.HALF_UP),
                        "rankBy", "Qty"))
                .sorted((a, b) -> bd(b.get("qtySold")).compareTo(bd(a.get("qtySold"))))
                .toList();

        InventoryReportDataResponse report = base("fast-moving-items", "Fast Moving Items",
                "Top movers by quantity and sales value over the last 30 days.");
        report.setCards(List.of(
                card("Items Sold", rows.size(), "last 30 days", "number"),
                card("Units Sold", sum(rows, "qtySold"), "quantity", "number"),
                card("Sales Value", sum(rows, "salesValue"), "net sales", "currency")));
        report.setColumns(List.of(
                column("SKU", "sku", "text"),
                column("Item", "item", "text"),
                column("Qty Sold", "qtySold", "number"),
                column("Sales Value", "salesValue", "currency"),
                column("Avg Daily Qty", "avgDailyQty", "number"),
                column("Rank By", "rankBy", "badge")));
        report.setRows(rows);
        return report;
    }

    private InventoryReportDataResponse warehouseBinStock(Long warehouseId) {
        Map<Long, Product> products = productMapFromMovements();
        Map<Long, String> warehouses = warehouseNameMap();
        Map<Long, Bin> bins = binRepo.findAll().stream().collect(Collectors.toMap(Bin::getId, Function.identity(), (a, b) -> a));
        Map<String, BigDecimal> grouped = new LinkedHashMap<>();
        for (StockMovement movement : stockRepo.findAll()) {
            if (warehouseId != null && !Objects.equals(movement.getWarehouseId(), warehouseId)) continue;
            String key = movement.getProductId() + "|" + movement.getWarehouseId() + "|" + movement.getBinId();
            grouped.merge(key, bd(movement.getQuantity()), BigDecimal::add);
        }
        List<Map<String, Object>> rows = grouped.entrySet().stream()
                .map(e -> {
                    String[] parts = e.getKey().split("\\|", -1);
                    Long productId = parseLong(parts[0]);
                    Long whId = parseLong(parts[1]);
                    Long binId = parseLong(parts[2]);
                    Product p = products.get(productId);
                    Bin bin = bins.get(binId);
                    BigDecimal qty = e.getValue();
                    Integer capacity = bin != null ? bin.getCapacity() : null;
                    return row(
                            "sku", p != null ? firstNonBlank(p.getSku(), p.getCode()) : productId,
                            "item", p != null ? p.getName() : "Product #" + productId,
                            "warehouse", warehouses.getOrDefault(whId, "Warehouse"),
                            "bin", bin != null ? firstNonBlank(bin.getCode(), bin.getName()) : "Unlocated",
                            "zone", bin != null && bin.getLocator() != null && bin.getLocator().getZone() != null ? bin.getLocator().getZone().getName() : null,
                            "locator", bin != null && bin.getLocator() != null ? bin.getLocator().getName() : null,
                            "qty", qty,
                            "capacity", capacity,
                            "utilization", capacity != null && capacity > 0 ? percent(qty, bd(capacity)) : null,
                            "status", qty.compareTo(BigDecimal.ZERO) > 0 ? "Stocked" : qty.compareTo(BigDecimal.ZERO) < 0 ? "Negative" : "Empty");
                })
                .filter(r -> bd(r.get("qty")).compareTo(BigDecimal.ZERO) != 0)
                .sorted(Comparator.comparing(r -> String.valueOf(r.get("warehouse"))))
                .toList();

        InventoryReportDataResponse report = base("warehouse-bin-stock", "Warehouse Bin Stock",
                "Bin and rack-wise stock by product and warehouse location.");
        report.setCards(List.of(
                card("Bin Rows", rows.size(), "stock identities", "number"),
                card("Bins Used", rows.stream().map(r -> r.get("bin")).collect(Collectors.toSet()).size(), "occupied bins", "number"),
                card("Total Qty", sum(rows, "qty"), "units", "number")));
        report.setColumns(List.of(
                column("SKU", "sku", "text"),
                column("Item", "item", "text"),
                column("Warehouse", "warehouse", "text"),
                column("Zone", "zone", "text"),
                column("Locator", "locator", "text"),
                column("Bin", "bin", "text"),
                column("Qty", "qty", "number"),
                column("Capacity", "capacity", "number"),
                column("Utilization %", "utilization", "number"),
                column("Status", "status", "badge")));
        report.setRows(rows);
        return report;
    }

    private List<Map<String, Object>> stockColumns(boolean includeUom) {
        List<Map<String, Object>> columns = new ArrayList<>();
        columns.add(column("SKU", "sku", "text"));
        columns.add(column("Item", "item", "text"));
        columns.add(column("Category", "category", "text"));
        columns.add(column("Warehouse", "warehouse", "text"));
        columns.add(column("Batch", "batchNumber", "text"));
        columns.add(column("Expiry", "expiryDate", "date"));
        columns.add(column("Qty", "onHand", "number"));
        if (includeUom) columns.add(column("UOM", "uom", "text"));
        columns.add(column("Unit Cost", "unitCost", "currency"));
        columns.add(column("Value", "value", "currency"));
        return columns;
    }

    private void applyFilters(
            InventoryReportDataResponse report,
            LocalDate dateFrom,
            LocalDate dateTo,
            String department,
            String brand,
            String search,
            String stockCondition) {
        List<Map<String, Object>> filtered = report.getRows().stream()
                .filter(row -> matchesDate(row, dateFrom, dateTo))
                .filter(row -> matchesText(row.get("department"), department))
                .filter(row -> matchesText(row.get("brand"), brand))
                .filter(row -> matchesSearch(row, search))
                .filter(row -> matchesStockCondition(report.getReportId(), row, stockCondition))
                .toList();
        report.setRows(filtered);
    }

    private boolean matchesDate(Map<String, Object> row, LocalDate dateFrom, LocalDate dateTo) {
        if (dateFrom == null && dateTo == null) return true;
        LocalDate rowDate = extractDate(row);
        if (rowDate == null) return true;
        if (dateFrom != null && rowDate.isBefore(dateFrom)) return false;
        return dateTo == null || !rowDate.isAfter(dateTo);
    }

    private LocalDate extractDate(Map<String, Object> row) {
        for (String key : List.of("date", "movementDate", "transferDate", "invoiceDate",
                "expiryDate", "nearestExpiry", "lastSold", "lastReceived", "updatedAt")) {
            Object value = row.get(key);
            LocalDate parsed = parseDate(value);
            if (parsed != null) return parsed;
        }
        return null;
    }

    private LocalDate parseDate(Object value) {
        if (value == null) return null;
        if (value instanceof LocalDate localDate) return localDate;
        if (value instanceof LocalDateTime localDateTime) return localDateTime.toLocalDate();
        if (value instanceof Timestamp timestamp) return timestamp.toLocalDateTime().toLocalDate();
        String text = String.valueOf(value);
        if (text.isBlank() || "N/A".equalsIgnoreCase(text)) return null;
        try {
            return LocalDate.parse(text.length() > 10 ? text.substring(0, 10) : text);
        } catch (Exception ignored) {
            return null;
        }
    }

    private boolean matchesText(Object value, String filter) {
        if (blank(filter) || "All".equalsIgnoreCase(filter)) return true;
        return value != null && String.valueOf(value).equalsIgnoreCase(filter);
    }

    private boolean matchesSearch(Map<String, Object> row, String search) {
        if (blank(search)) return true;
        String q = search.toLowerCase();
        return row.values().stream()
                .filter(Objects::nonNull)
                .map(value -> String.valueOf(value).toLowerCase())
                .anyMatch(value -> value.contains(q));
    }

    private boolean matchesStockCondition(String reportId, Map<String, Object> row, String stockCondition) {
        if (blank(stockCondition) || "All".equalsIgnoreCase(stockCondition)) return true;
        if (!supportsStockCondition(reportId)) return true;
        BigDecimal qty = bd(firstPresent(row, "onHand", "qty", "balance"));
        if ("Positive only".equalsIgnoreCase(stockCondition)) return qty.compareTo(BigDecimal.ZERO) > 0;
        if ("Zero only".equalsIgnoreCase(stockCondition)) return qty.compareTo(BigDecimal.ZERO) == 0;
        if ("Negative only".equalsIgnoreCase(stockCondition)) return qty.compareTo(BigDecimal.ZERO) < 0;
        return true;
    }

    private boolean supportsStockCondition(String reportId) {
        return Set.of("stock-on-hand", "stock-valuation", "warehouse-bin-stock").contains(reportId);
    }

    private Object firstPresent(Map<String, Object> row, String... keys) {
        for (String key : keys) {
            if (row.containsKey(key)) return row.get(key);
        }
        return BigDecimal.ZERO;
    }

    private Map<String, Object> stockRow(StockReportResponse r) {
        return row(
                "productId", r.getProductId(),
                "sku", r.getSku(),
                "item", r.getItem(),
                "category", r.getCategory(),
                "department", r.getDepartment(),
                "brand", r.getBrand(),
                "warehouse", r.getWarehouse(),
                "batchNumber", r.getBatchNumber(),
                "expiryDate", r.getExpiryDate(),
                "onHand", r.getOnHand(),
                "uom", r.getUom(),
                "minStock", r.getMinStock(),
                "unitCost", r.getUnitCost(),
                "value", r.getValue());
    }

    private Map<String, Object> transferRow(StockTransfer transfer, StockTransferItem item) {
        Product product = item.getProduct();
        BigDecimal qty = bd(item.getQuantity());
        BigDecimal cost = bd(item.getUnitCostAtSend());
        return row(
                "ref", transfer.getTransferNo(),
                "date", transfer.getTransferDate(),
                "fromWarehouse", transfer.getFromWarehouse() != null ? transfer.getFromWarehouse().getName() : null,
                "toWarehouse", transfer.getToWarehouse() != null ? transfer.getToWarehouse().getName() : null,
                "item", product != null ? product.getName() : null,
                "sku", product != null ? firstNonBlank(product.getSku(), product.getCode()) : null,
                "qty", qty,
                "unitCost", cost,
                "value", bd(item.getLineValue()).compareTo(BigDecimal.ZERO) != 0 ? item.getLineValue() : qty.multiply(cost),
                "approver", firstNonBlank(transfer.getUpdatedBy(), transfer.getRequestedBy()),
                "status", transferStatus(transfer));
    }

    private String transferStatus(StockTransfer transfer) {
        if (transfer.getStatus() == null) return "Draft";
        return switch (transfer.getStatus()) {
            case RECEIVED -> "Completed";
            case SENT -> "In-Transit";
            case PENDING_APPROVAL -> "Pending";
            case CANCELLED -> "Cancelled";
            default -> "Draft";
        };
    }

    private boolean isWastageMovement(StockMovement movement) {
        if (movement.getQuantity() == null || movement.getQuantity() >= 0) return false;
        String ref = movement.getReferenceNo() == null ? "" : movement.getReferenceNo().toUpperCase();
        String type = movement.getSourceType() == null ? "" : movement.getSourceType().name();
        return ref.contains("WST") || ref.contains("WASTE") || ref.contains("IC-")
                || ref.contains("CONSUM") || type.contains("WASTE") || type.contains("CONSUM");
    }

    private String wastageReason(StockMovement movement) {
        String ref = movement.getReferenceNo() == null ? "" : movement.getReferenceNo().toUpperCase();
        if (ref.contains("IC") || ref.contains("CONSUM")) return "Internal use";
        if (ref.contains("EXP")) return "Expired";
        if (ref.contains("DMG") || ref.contains("DAMAGE")) return "Damaged";
        return "Write-off";
    }

    private InventoryReportDataResponse base(String reportId, String title, String subtitle) {
        InventoryReportDataResponse response = new InventoryReportDataResponse();
        response.setReportId(reportId);
        response.setTitle(title);
        response.setSubtitle(subtitle);
        response.setGeneratedAt(LocalDateTime.now());
        return response;
    }

    private Map<String, Object> card(String label, Object value, String sub, String type) {
        return row("label", label, "value", value, "sub", sub, "type", type);
    }

    private Map<String, Object> chart(String title, String type, List<Map<String, Object>> data) {
        return row("title", title, "type", type, "data", data);
    }

    private Map<String, Object> column(String header, String key, String type) {
        return row("header", header, "key", key, "type", type, "width", defaultWidth(type));
    }

    private int defaultWidth(String type) {
        if ("currency".equals(type)) return 18;
        if ("number".equals(type)) return 14;
        if ("date".equals(type)) return 16;
        return 22;
    }

    private Map<String, Object> row(Object... pairs) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length - 1; i += 2) {
            map.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return map;
    }

    private BigDecimal bd(Object value) {
        if (value == null) return BigDecimal.ZERO;
        if (value instanceof BigDecimal v) return v;
        if (value instanceof Number v) return new BigDecimal(v.toString());
        try {
            return new BigDecimal(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return BigDecimal.ZERO;
        }
    }

    private String label(String value) {
        return blank(value) ? "Uncategorized" : value;
    }

    private boolean blank(Object value) {
        return value == null || String.valueOf(value).isBlank();
    }

    private String firstNonBlank(Object... values) {
        for (Object value : values) {
            if (!blank(value)) return String.valueOf(value);
        }
        return "";
    }

    private BigDecimal ratio(BigDecimal numerator, BigDecimal denominator) {
        if (denominator.compareTo(BigDecimal.ZERO) == 0) return BigDecimal.ZERO;
        return numerator.multiply(HUNDRED).divide(denominator, 2, RoundingMode.HALF_UP);
    }

    private BigDecimal percent(BigDecimal numerator, BigDecimal denominator) {
        return ratio(numerator, denominator);
    }

    private String urgencyByRatio(BigDecimal ratio) {
        if (ratio.compareTo(new BigDecimal("50")) <= 0) return "Critical";
        if (ratio.compareTo(new BigDecimal("75")) <= 0) return "High";
        if (ratio.compareTo(HUNDRED) <= 0) return "Medium";
        return "Low";
    }

    private String severityForCost(BigDecimal cost) {
        if (cost.compareTo(new BigDecimal("1000")) >= 0) return "Critical";
        if (cost.compareTo(new BigDecimal("100")) >= 0) return "High";
        if (cost.compareTo(new BigDecimal("25")) >= 0) return "Medium";
        return "Low";
    }

    private String expiryStatus(long days) {
        if (days <= 7) return "Critical";
        if (days <= 14) return "High";
        if (days <= 30) return "Warning";
        if (days <= 90) return "Watch";
        return "OK";
    }

    private long countRows(List<Map<String, Object>> rows, String key, Object value) {
        return rows.stream().filter(r -> Objects.equals(r.get(key), value)).count();
    }

    private BigDecimal sum(List<Map<String, Object>> rows, String key) {
        return rows.stream().map(r -> bd(r.get(key))).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private List<Map<String, Object>> aggregate(
            List<StockReportResponse> rows,
            Function<StockReportResponse, String> group,
            Function<StockReportResponse, BigDecimal> amount) {
        Map<String, BigDecimal> totals = new LinkedHashMap<>();
        for (StockReportResponse row : rows) {
            totals.merge(group.apply(row), bd(amount.apply(row)), BigDecimal::add);
        }
        return totals.entrySet().stream()
                .map(e -> row("name", e.getKey(), "value", e.getValue()))
                .toList();
    }

    private List<Map<String, Object>> sumBy(List<Map<String, Object>> rows, String groupKey, String valueKey) {
        Map<String, BigDecimal> totals = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            totals.merge(label((String) row.get(groupKey)), bd(row.get(valueKey)), BigDecimal::add);
        }
        return totals.entrySet().stream()
                .map(e -> row("name", e.getKey(), "value", e.getValue()))
                .sorted((a, b) -> bd(b.get("value")).compareTo(bd(a.get("value"))))
                .toList();
    }

    private List<Map<String, Object>> expiryBuckets(List<Map<String, Object>> rows) {
        Map<String, Long> buckets = new LinkedHashMap<>();
        buckets.put("<=7d (Critical)", 0L);
        buckets.put("8-14d (High)", 0L);
        buckets.put("15-30d (Warn)", 0L);
        buckets.put("31-90d (Watch)", 0L);
        buckets.put(">90d (OK)", 0L);
        for (Map<String, Object> row : rows) {
            long days = ((Number) row.get("daysToExpiry")).longValue();
            String bucket = days <= 7 ? "<=7d (Critical)"
                    : days <= 14 ? "8-14d (High)"
                    : days <= 30 ? "15-30d (Warn)"
                    : days <= 90 ? "31-90d (Watch)"
                    : ">90d (OK)";
            buckets.merge(bucket, 1L, Long::sum);
        }
        return buckets.entrySet().stream()
                .map(e -> row("name", e.getKey(), "value", e.getValue()))
                .toList();
    }

    private void addNested(Map<String, Map<String, BigDecimal>> map, String group, String key, BigDecimal value) {
        map.computeIfAbsent(group, ignored -> new LinkedHashMap<>()).merge(key, value, BigDecimal::add);
    }

    private String weekLabel(LocalDate date) {
        if (date == null) return "No date";
        int week = ((date.getDayOfMonth() - 1) / 7) + 1;
        return date.getMonth().name().substring(0, 3) + " W" + week;
    }

    private String key(Object a, Object b) {
        return String.valueOf(a) + "|" + String.valueOf(b);
    }

    private Long parseLong(String value) {
        if (blank(value) || "null".equals(value)) return null;
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private String movementLabel(StockSourceType sourceType) {
        if (sourceType == null) return "Adjustment";
        return switch (sourceType) {
            case GRN, DIRECT_PURCHASE, LPO, SALES_RETURN, STOCK_TRANSFER_IN -> "In";
            case DELIVERY_NOTE, SALES_INVOICE, STOCK_TRANSFER_OUT -> "Out";
            case STOCK_TAKE_ADJUSTMENT, STOCK_TAKE, STOCK_TAKE_BATCH -> "Adj";
            default -> sourceType.name().replace('_', ' ');
        };
    }

    private Map<Long, Product> productMapFromMovements() {
        Set<Long> ids = stockRepo.findAll().stream()
                .map(StockMovement::getProductId)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (ids.isEmpty()) return Map.of();
        return productRepo.findAllById(ids).stream().collect(Collectors.toMap(Product::getId, Function.identity(), (a, b) -> a));
    }

    private Map<Long, String> warehouseNameMap() {
        return warehouseRepo.findAll().stream().collect(Collectors.toMap(Warehouse::getId, Warehouse::getName, (a, b) -> a));
    }

    private Map<Long, ProductPricing> pricingMap(List<Long> productIds) {
        if (productIds.isEmpty()) return Map.of();
        return pricingRepo.findByProductIdIn(productIds).stream()
                .collect(Collectors.toMap(p -> p.getProduct().getId(), Function.identity(), (a, b) -> a));
    }

    private Map<Long, ProductInventoryPolicy> inventoryMap(List<Long> productIds) {
        if (productIds.isEmpty()) return Map.of();
        return inventoryRepo.findByProductIdIn(productIds).stream()
                .collect(Collectors.toMap(p -> p.getProduct().getId(), Function.identity(), (a, b) -> a));
    }

    private Map<Long, String> primaryBarcodeMap(List<Long> productIds) {
        if (productIds.isEmpty()) return Map.of();
        Map<Long, String> map = new HashMap<>();
        for (ProductBarcode barcode : barcodeRepo.findByProductIdIn(productIds)) {
            if (barcode.getProduct() != null && !blank(barcode.getBarcode())) {
                map.putIfAbsent(barcode.getProduct().getId(), barcode.getBarcode());
            }
        }
        return map;
    }

    private List<Product> activeStockProducts() {
        return productRepo.findAllByIsActiveTrue().stream()
                .filter(p -> p.getProductType() == null || p.getProductType() != ProductType.SERVICE)
                .toList();
    }

    private Map<Long, Timestamp> lastSoldMap(List<Long> productIds) {
        if (productIds.isEmpty()) return Map.of();
        Map<Long, Timestamp> map = new HashMap<>();
        for (Object[] row : stockRepo.findLastMovementDates(productIds)) {
            if (row[0] != null && row[1] != null) {
                map.put(((Number) row[0]).longValue(), (Timestamp) row[1]);
            }
        }
        return map;
    }

    private static class MarginAccumulator {
        private final String sku;
        private final String item;
        private BigDecimal qty = BigDecimal.ZERO;
        private BigDecimal sales = BigDecimal.ZERO;
        private BigDecimal cost = BigDecimal.ZERO;

        private MarginAccumulator(String sku, String item) {
            this.sku = sku;
            this.item = item;
        }
    }
}
