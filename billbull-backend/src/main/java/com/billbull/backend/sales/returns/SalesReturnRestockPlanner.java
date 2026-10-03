package com.billbull.backend.sales.returns;

import com.billbull.backend.inventory.batch.BatchAllocation;
import com.billbull.backend.inventory.batch.BatchAllocationRepository;
import com.billbull.backend.inventory.batch.BatchMaster;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductPricing;
import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.sales.delivery.DeliveryNote;
import com.billbull.backend.sales.delivery.DeliveryNoteBatchConsumption;
import com.billbull.backend.sales.delivery.DeliveryNoteBatchConsumptionRepository;
import com.billbull.backend.sales.delivery.DeliveryNoteRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Builds the one {@link SalesReturnRestockPlan} an approval acts on.
 *
 * <p>This class is the single place that answers three questions that previously had three
 * answers: does this line put goods back into stock, where do they go, and what does a unit cost.
 * Stock posting, unit-cost stamping and the {@code Dr Inventory / Cr COGS} journal all read the
 * same plan, so they cannot disagree.
 *
 * <h3>The cost hierarchy</h3>
 * Unchanged in substance, and still in this order:
 * <ol>
 *   <li>{@link DeliveryNoteBatchConsumption} — the exact batch/WAC cost the units left at. Exact
 *       where it exists, and re-entering units at the cost they departed at restores the pre-sale
 *       weighted average rather than distorting it.</li>
 *   <li>{@link SalesInvoiceItem#getCost()} — the cost-at-sale snapshot stamped at checkout.
 *       Survives a later change to the product master.</li>
 *   <li>{@link ProductPricing#getCost()} — current master cost, for legacy rows predating both
 *       snapshots.</li>
 * </ol>
 * An explicit {@code 0.00} counts as missing, not as a real cost.
 */
@Service
@Slf4j
public class SalesReturnRestockPlanner {

    @Autowired
    private SalesInvoiceRepository salesInvoiceRepository;

    @Autowired
    private DeliveryNoteRepository deliveryNoteRepository;

    @Autowired
    private DeliveryNoteBatchConsumptionRepository consumptionRepo;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ProductPricingRepository productPricingRepository;

    @Autowired
    private BatchAllocationRepository batchAllocationRepository;

    /**
     * Resolves every line's restock verdict, destination and unit cost, writing nothing.
     *
     * <p>Called once at the top of the approval, before stock, journals or cash move, so the
     * decision a line's stock movement is posted on is literally the same object the inventory
     * journal's amount is computed from.
     */
    @Transactional(readOnly = true)
    public SalesReturnRestockPlan plan(SalesReturn salesReturn) {
        if (salesReturn.getItems() == null || salesReturn.getItems().isEmpty()) {
            return SalesReturnRestockPlan.empty();
        }

        SalesInvoice invoice = findLinkedInvoice(salesReturn);
        Long nonBatchWarehouseId = resolveNonBatchWarehouseId(invoice);
        Long sourceDnId = resolveSourceDnId(salesReturn);
        Map<String, BigDecimal> dnUnitCostByCode = dnUnitCostsByItemCode(sourceDnId);
        Map<String, BigDecimal> invoiceCostByCode = invoiceCostsByItemCode(invoice);
        // Exact per-line costs, so a product appearing on the invoice twice at different
        // costs values each return line at its own line's cost rather than the first match's.
        Map<Long, BigDecimal> invoiceCostByLineId = invoiceCostsByLineId(invoice);

        IdentityHashMap<SalesReturnItem, SalesReturnRestockPlan.LineRestock> byItem = new IdentityHashMap<>();
        List<String> unresolvedCost = new ArrayList<>();
        List<String> unresolvedWarehouse = new ArrayList<>();

        for (SalesReturnItem item : salesReturn.getItems()) {
            String itemCode = item.getItemCode();
            int returnQty = item.getReturnQty() != null ? item.getReturnQty() : 0;
            if (itemCode == null || returnQty <= 0) continue;

            boolean restockable = isRestockable(item);
            if (!restockable) {
                // Scrap: no stock comes back and the cost stays on the books as a loss. Recorded
                // in the plan so the journal and the stock pass agree it posts nothing for it.
                byItem.put(item, new SalesReturnRestockPlan.LineRestock(
                        item, false, 0, null, Map.of(), null));
                log.info("[SalesReturn] {} — line '{}' condition {} is not resaleable; no restock,"
                                + " no inventory journal, cost stays in COGS.",
                        salesReturn.getReturnNumber(), itemCode, describeCondition(item));
                continue;
            }

            boolean batchControlled = item.getBatches() != null && !item.getBatches().isEmpty();
            Map<Long, Long> batchWarehouses = batchControlled
                    ? resolveBatchWarehouses(salesReturn, item)
                    : Map.of();
            int qualifyingQty = batchControlled
                    ? sumQualifyingBatchQty(item, batchWarehouses)
                    : returnQty;
            Long warehouseId = batchControlled ? null : nonBatchWarehouseId;

            boolean hasDestination = batchControlled ? qualifyingQty > 0 : warehouseId != null;
            if (!hasDestination) {
                unresolvedWarehouse.add(itemCode);
                byItem.put(item, new SalesReturnRestockPlan.LineRestock(
                        item, true, 0, warehouseId, batchWarehouses, null));
                log.warn("[SalesReturn] {} — resaleable line '{}' has no destination warehouse"
                                + " (no delivery note warehouse, or no batch master warehouse). No stock"
                                + " movement and no inventory journal: account 1200 is not debited for"
                                + " goods the system cannot place. Post a manual stock adjustment if the"
                                + " units were physically received.",
                        salesReturn.getReturnNumber(), itemCode);
                continue;
            }

            BigDecimal unitCost = resolveUnitCost(salesReturn, item, dnUnitCostByCode,
                    invoiceCostByCode, invoiceCostByLineId);
            if (unitCost == null) {
                unresolvedCost.add(itemCode);
                byItem.put(item, new SalesReturnRestockPlan.LineRestock(
                        item, true, 0, warehouseId, batchWarehouses, null));
                continue;
            }

            byItem.put(item, new SalesReturnRestockPlan.LineRestock(
                    item, true, qualifyingQty, warehouseId, batchWarehouses, unitCost));
        }

        return new SalesReturnRestockPlan(byItem, unresolvedCost, unresolvedWarehouse);
    }

    // ── restock condition ────────────────────────────────────────────────────────────

    /**
     * The condition test, in one place.
     *
     * <p>{@link SalesReturnCondition} is authoritative when present; the legacy {@code itemStatus}
     * string is the fallback for rows written before the column existed.
     * {@code SalesReturnService.normaliseLineConditions} keeps the two in agreement on every save,
     * so this reads whichever one the row actually carries.
     */
    static boolean isRestockable(SalesReturnItem item) {
        if (item.getCondition() != null) return item.getCondition().isRestockable();
        return "Good".equalsIgnoreCase(item.getItemStatus());
    }

    private static String describeCondition(SalesReturnItem item) {
        return item.getCondition() != null ? item.getCondition().name() : String.valueOf(item.getItemStatus());
    }

    // ── destinations ─────────────────────────────────────────────────────────────────

    /**
     * Where non-batch goods physically arrive: the warehouse on the first delivery note linked to
     * the original invoice. {@code null} when none resolves, which the caller turns into "this
     * line restocks nothing and debits no inventory".
     */
    private Long resolveNonBatchWarehouseId(SalesInvoice invoice) {
        if (invoice == null) return null;
        if (invoice.getLinkedDeliveryNote() == null || invoice.getLinkedDeliveryNote().isBlank()) return null;

        List<String> dnNumbers = Arrays.stream(invoice.getLinkedDeliveryNote().split(","))
                .map(String::trim)
                .filter(sv -> !sv.isBlank())
                .toList();
        if (dnNumbers.isEmpty()) return null;

        for (DeliveryNote note : deliveryNoteRepository.findByDnNumberIn(dnNumbers)) {
            if (note.getWarehouse() != null && note.getWarehouse().getId() != null) {
                return note.getWarehouse().getId();
            }
        }
        return null;
    }

    /**
     * Per-selection destinations for a batch-controlled line: the warehouse on each selected
     * allocation's {@link BatchMaster}. Entries are present only for selections that can actually
     * be restocked, so {@code applyBatchReturns} needs no second test.
     */
    private Map<Long, Long> resolveBatchWarehouses(SalesReturn salesReturn, SalesReturnItem item) {
        Map<Long, Long> warehouses = new LinkedHashMap<>();
        for (SalesReturnItemBatch sel : item.getBatches()) {
            Long allocationId = sel.getOriginalAllocationId();
            int qty = sel.getQuantity() != null ? sel.getQuantity() : 0;
            if (allocationId == null || qty <= 0) continue;

            Optional<BatchAllocation> allocation = batchAllocationRepository.findById(allocationId);
            if (allocation.isEmpty()) continue; // the apply pass reports a missing allocation itself

            BatchMaster master = allocation.get().getBatchMaster();
            Long warehouseId = master != null ? master.getWarehouseId() : null;
            if (warehouseId == null) {
                log.warn("[SalesReturn] {} — batch {} on line '{}' has no warehouse on its batch"
                                + " master; that lot restocks nothing and is excluded from the inventory"
                                + " journal.",
                        salesReturn.getReturnNumber(), sel.getBatchNumber(), item.getItemCode());
                continue;
            }
            warehouses.put(allocationId, warehouseId);
        }
        return warehouses;
    }

    private int sumQualifyingBatchQty(SalesReturnItem item, Map<Long, Long> batchWarehouses) {
        int total = 0;
        for (SalesReturnItemBatch sel : item.getBatches()) {
            Long allocationId = sel.getOriginalAllocationId();
            if (allocationId == null || !batchWarehouses.containsKey(allocationId)) continue;
            total += sel.getQuantity() != null ? sel.getQuantity() : 0;
        }
        return total;
    }

    // ── cost hierarchy ───────────────────────────────────────────────────────────────

    private BigDecimal resolveUnitCost(SalesReturn salesReturn,
                                       SalesReturnItem item,
                                       Map<String, BigDecimal> dnUnitCostByCode,
                                       Map<String, BigDecimal> invoiceCostByCode,
                                       Map<Long, BigDecimal> invoiceCostByLineId) {
        String itemCode = item.getItemCode();
        BigDecimal dnCost = dnUnitCostByCode.get(itemCode);
        if (isPositive(dnCost)) {
            log.info("[SalesReturn] {} — item '{}' unit cost {} from the original delivery note's"
                    + " batch consumption.", salesReturn.getReturnNumber(), itemCode, dnCost);
            return dnCost;
        }

        // Tier 2, by the strongest line identity available. Keying this on item code alone meant
        // the first matching invoice line won, so two lines of the same product at different
        // costs both restocked at the first line's cost and GL 1200 was debited by the wrong
        // figure for one of them.
        BigDecimal saleCost = null;
        if (item.getInvoiceItemId() != null) {
            saleCost = invoiceCostByLineId.get(item.getInvoiceItemId());
        }
        if (!isPositive(saleCost)) {
            saleCost = invoiceCostByCode.get(itemCode);
        }
        if (isPositive(saleCost)) {
            log.info("[SalesReturn] {} — item '{}' unit cost {} from the invoice's cost-at-sale"
                    + " snapshot.", salesReturn.getReturnNumber(), itemCode, saleCost);
            return saleCost;
        }

        Optional<Product> productOpt = productRepository.findByCodeAndIsActiveTrue(itemCode);
        if (productOpt.isEmpty()) {
            log.warn("[SalesReturn] {} — item '{}' is not in the product master, so no cost can be"
                    + " resolved.", salesReturn.getReturnNumber(), itemCode);
            return null;
        }
        Optional<ProductPricing> pricingOpt = productPricingRepository.findByProductId(productOpt.get().getId());
        BigDecimal masterCost = pricingOpt.map(ProductPricing::getCost).orElse(null);
        if (!isPositive(masterCost)) {
            log.warn("[SalesReturn] {} — no cost price for product '{}'.",
                    salesReturn.getReturnNumber(), itemCode);
            return null;
        }
        log.warn("[SalesReturn] {} — item '{}' falling back to the current product-master cost {}"
                        + " (no delivery-note history and no invoice snapshot).",
                salesReturn.getReturnNumber(), itemCode, masterCost);
        return masterCost;
    }

    /**
     * Unit cost per item code from the original delivery note's consumption rows: total consumed
     * cost ÷ total consumed quantity, which is the weighted average the units actually left at.
     */
    private Map<String, BigDecimal> dnUnitCostsByItemCode(Long sourceDnId) {
        if (sourceDnId == null) return Map.of();

        Map<String, BigDecimal> costByCode = new HashMap<>();
        Map<String, Integer> qtyByCode = new HashMap<>();
        for (DeliveryNoteBatchConsumption row : consumptionRepo.findByDeliveryNoteId(sourceDnId)) {
            String code = row.getItemCode();
            if (code == null) continue;
            costByCode.merge(code,
                    row.getTotalCost() != null ? row.getTotalCost() : BigDecimal.ZERO,
                    BigDecimal::add);
            qtyByCode.merge(code, row.getQuantity() != null ? row.getQuantity() : 0, Integer::sum);
        }

        Map<String, BigDecimal> unitCosts = new HashMap<>();
        costByCode.forEach((code, totalCost) -> {
            int qty = qtyByCode.getOrDefault(code, 0);
            if (qty > 0 && isPositive(totalCost)) {
                unitCosts.put(code, totalCost.divide(BigDecimal.valueOf(qty), 4, RoundingMode.HALF_UP));
            }
        });
        return unitCosts;
    }

    /** Cost-at-sale per invoice LINE — exact, unlike the item-code map below. */
    private Map<Long, BigDecimal> invoiceCostsByLineId(SalesInvoice invoice) {
        if (invoice == null || invoice.getItems() == null) return Map.of();
        Map<Long, BigDecimal> costs = new HashMap<>();
        for (SalesInvoiceItem ii : invoice.getItems()) {
            if (ii.getId() != null && isPositive(ii.getCost())) {
                costs.put(ii.getId(), ii.getCost());
            }
        }
        return costs;
    }

    private Map<String, BigDecimal> invoiceCostsByItemCode(SalesInvoice invoice) {
        if (invoice == null || invoice.getItems() == null) return Map.of();
        Map<String, BigDecimal> costs = new HashMap<>();
        for (SalesInvoiceItem ii : invoice.getItems()) {
            if (ii.getItemCode() != null && isPositive(ii.getCost())) {
                costs.putIfAbsent(ii.getItemCode(), ii.getCost());
            }
        }
        return costs;
    }

    // ── lookups ──────────────────────────────────────────────────────────────────────

    private SalesInvoice findLinkedInvoice(SalesReturn salesReturn) {
        String linkedInvoice = salesReturn.getLinkedInvoice();
        if (linkedInvoice == null || linkedInvoice.isBlank()) return null;
        return salesInvoiceRepository.findByInvoiceNumber(linkedInvoice).orElse(null);
    }

    private Long resolveSourceDnId(SalesReturn salesReturn) {
        String linkedInvoice = salesReturn.getLinkedInvoice();
        if (linkedInvoice == null || linkedInvoice.isBlank()) return null;
        List<DeliveryNote> dns = deliveryNoteRepository.findByLinkedInvoiceNumber(linkedInvoice);
        return dns.isEmpty() ? null : dns.get(0).getId();
    }

    private static boolean isPositive(BigDecimal value) {
        return value != null && value.compareTo(BigDecimal.ZERO) > 0;
    }
}
