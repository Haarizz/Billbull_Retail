package com.billbull.backend.sales.returns;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;

/**
 * The one answer to "did goods physically come back into stock, and at what cost" for an
 * approved sales return.
 *
 * <p>Before this existed, two independent predicates decided it. {@code applyNonBatchStockReturns}
 * posted a stock movement when the line's {@code itemStatus} was {@code Good} <em>and</em> a
 * warehouse could be resolved from the invoice's delivery note; {@code applyBatchReturns} posted
 * one when the line was Good <em>and</em> the selected batch's {@code BatchMaster} carried a
 * warehouse id. The restock journal, meanwhile, posted {@code Dr Inventory / Cr COGS} whenever
 * <em>any</em> line was Good at all — so a Good line with no resolvable warehouse logged a
 * warning, moved no stock, and still debited account 1200 by its cost. Inventory rose in the
 * ledger and nowhere else, and {@code reconcileInventory} drifted by that amount permanently.
 *
 * <p>The plan is computed once, before anything is written, and is then the sole input to all
 * three decisions: which stock movements to post, what unit cost to stamp on them, and whether
 * (and for how much) to post the inventory journal. Because the journal's amount is
 * {@link #totalRestockCost()} = Σ {@code restockQty × unitCost} over exactly the lines that post
 * stock, the invariant {@code GL 1200 debit = Σ stock_movements.unit_cost × quantity} holds by
 * construction rather than by coincidence.
 *
 * <p>Keyed by object identity, not by id: the plan is built from the same managed entity graph
 * the apply methods iterate, and a freshly cascaded {@link SalesReturnItem} may not have an id
 * assigned yet.
 */
public final class SalesReturnRestockPlan {

    /** One line's restock verdict. */
    public static final class LineRestock {

        private final SalesReturnItem item;
        private final boolean conditionRestockable;
        private final int restockQty;
        private final Long warehouseId;
        private final Map<Long, Long> batchWarehouseByAllocationId;
        private final BigDecimal unitCost;

        LineRestock(SalesReturnItem item,
                    boolean conditionRestockable,
                    int restockQty,
                    Long warehouseId,
                    Map<Long, Long> batchWarehouseByAllocationId,
                    BigDecimal unitCost) {
            this.item = item;
            this.conditionRestockable = conditionRestockable;
            this.restockQty = restockQty;
            this.warehouseId = warehouseId;
            this.batchWarehouseByAllocationId = batchWarehouseByAllocationId == null
                    ? Map.of()
                    : Map.copyOf(batchWarehouseByAllocationId);
            this.unitCost = unitCost;
        }

        public SalesReturnItem item() {
            return item;
        }

        /** True when the line's condition is resaleable (GOOD). Scrap conditions are false. */
        public boolean conditionRestockable() {
            return conditionRestockable;
        }

        /**
         * True when this line will actually post inbound stock: a resaleable condition, a positive
         * quantity, a destination warehouse, and a resolved unit cost.
         */
        public boolean restocks() {
            return restockQty > 0;
        }

        /** Units that will be posted inbound — never more than the line's return quantity. */
        public int restockQty() {
            return restockQty;
        }

        /** Destination warehouse for a non-batch line, or {@code null} for a batch-controlled one. */
        public Long warehouseId() {
            return warehouseId;
        }

        /**
         * Destination warehouse for one batch selection on a batch-controlled line, or
         * {@code null} when that selection does not restock.
         */
        public Long batchWarehouseId(Long allocationId) {
            return allocationId == null ? null : batchWarehouseByAllocationId.get(allocationId);
        }

        /** Resolved cost per unit, or {@code null} when no cost source could supply one. */
        public BigDecimal unitCost() {
            return unitCost;
        }

        /** {@code restockQty × unitCost}, the line's share of the inventory journal's debit. */
        public BigDecimal restockCost() {
            if (restockQty <= 0 || unitCost == null) return BigDecimal.ZERO;
            return unitCost.multiply(BigDecimal.valueOf(restockQty));
        }
    }

    private final IdentityHashMap<SalesReturnItem, LineRestock> byItem;
    private final List<String> unresolvedCostItemCodes;
    private final List<String> unresolvedWarehouseItemCodes;

    SalesReturnRestockPlan(IdentityHashMap<SalesReturnItem, LineRestock> byItem,
                           List<String> unresolvedCostItemCodes,
                           List<String> unresolvedWarehouseItemCodes) {
        this.byItem = byItem;
        this.unresolvedCostItemCodes = List.copyOf(unresolvedCostItemCodes);
        this.unresolvedWarehouseItemCodes = List.copyOf(unresolvedWarehouseItemCodes);
    }

    static SalesReturnRestockPlan empty() {
        return new SalesReturnRestockPlan(new IdentityHashMap<>(), List.of(), List.of());
    }

    /**
     * This line's verdict. Never {@code null}: a line the planner did not see (quantity zero, no
     * item code) gets a verdict that restocks nothing, so callers never need a null check.
     */
    public LineRestock forLine(SalesReturnItem item) {
        LineRestock line = byItem.get(item);
        return line != null
                ? line
                : new LineRestock(item, false, 0, null, Collections.emptyMap(), null);
    }

    /** True when at least one line puts goods back into stock — the inventory journal's predicate. */
    public boolean restocksAnything() {
        return byItem.values().stream().anyMatch(LineRestock::restocks);
    }

    /**
     * The inventory journal's debit: Σ {@code restockQty × unitCost} over the lines that post
     * stock. Equal, by construction, to the value of the inbound stock movements this plan
     * produces.
     */
    public BigDecimal totalRestockCost() {
        return byItem.values().stream()
                .map(LineRestock::restockCost)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * Item codes on resaleable lines for which no cost source resolved a positive unit cost.
     *
     * <p>Approval is refused when this is non-empty: restocking a unit whose cost is unknown
     * raises on-hand quantity with no matching inventory valuation, which is the one failure the
     * cost hierarchy exists to prevent.
     */
    public List<String> unresolvedCostItemCodes() {
        return unresolvedCostItemCodes;
    }

    /**
     * Item codes on resaleable lines with no destination warehouse.
     *
     * <p>These restock nothing <em>and</em> contribute nothing to the inventory journal, which is
     * the whole point of the shared predicate: the cost stays in COGS exactly as it does for a
     * scrap line, instead of being debited to inventory that never received the goods.
     */
    public List<String> unresolvedWarehouseItemCodes() {
        return unresolvedWarehouseItemCodes;
    }
}
