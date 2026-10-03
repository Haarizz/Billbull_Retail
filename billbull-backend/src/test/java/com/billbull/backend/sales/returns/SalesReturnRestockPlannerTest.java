package com.billbull.backend.sales.returns;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.inventory.batch.BatchAllocation;
import com.billbull.backend.inventory.batch.BatchAllocationRepository;
import com.billbull.backend.inventory.batch.BatchMaster;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductPricing;
import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.sales.delivery.DeliveryNote;
import com.billbull.backend.sales.delivery.DeliveryNoteBatchConsumption;
import com.billbull.backend.sales.delivery.DeliveryNoteBatchConsumptionRepository;
import com.billbull.backend.sales.delivery.DeliveryNoteRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;

/**
 * The single restock verdict that stock posting, unit-cost stamping and the inventory journal all
 * read.
 *
 * <p>Three predicates used to decide this independently. A resaleable line whose warehouse could
 * not be resolved logged a warning, moved no stock, and still had its cost debited to account 1200
 * by the {@code {ref}-INV} journal — because that journal asked only "is any line Good?". These
 * cases pin the property that replaces all three: whatever the plan says restocks is exactly what
 * posts stock, and {@link SalesReturnRestockPlan#totalRestockCost()} is exactly the value of those
 * movements, so {@code GL 1200 debit = Σ unit_cost × quantity} holds by construction.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SalesReturnRestockPlannerTest {

    private static final String INVOICE = "INV-2026-04812";
    private static final String ITEM = "ITEM-A";
    private static final Long WAREHOUSE_ID = 7L;
    private static final Long BATCH_WAREHOUSE_ID = 9L;
    private static final Long PRODUCT_ID = 300L;
    private static final Long DN_ID = 500L;

    @Mock private SalesInvoiceRepository salesInvoiceRepository;
    @Mock private DeliveryNoteRepository deliveryNoteRepository;
    @Mock private DeliveryNoteBatchConsumptionRepository consumptionRepo;
    @Mock private ProductRepository productRepository;
    @Mock private ProductPricingRepository productPricingRepository;
    @Mock private BatchAllocationRepository batchAllocationRepository;

    @InjectMocks private SalesReturnRestockPlanner planner;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(planner, "salesInvoiceRepository", salesInvoiceRepository);
        ReflectionTestUtils.setField(planner, "deliveryNoteRepository", deliveryNoteRepository);
        ReflectionTestUtils.setField(planner, "consumptionRepo", consumptionRepo);
        ReflectionTestUtils.setField(planner, "productRepository", productRepository);
        ReflectionTestUtils.setField(planner, "productPricingRepository", productPricingRepository);
        ReflectionTestUtils.setField(planner, "batchAllocationRepository", batchAllocationRepository);

        stubInvoiceWithDeliveryNote(null);
        stubDeliveryNoteWarehouse(WAREHOUSE_ID);
        stubProduct();
    }

    // ── the cost hierarchy ──────────────────────────────────────────────────────────

    @Test
    void theDeliveryNoteConsumptionCostWinsOverEveryOtherSource() {
        // 3 units consumed at 36.00 total = 12.00 each — the cost these units actually left at.
        stubDnConsumption(3, "36.00");
        stubInvoiceWithDeliveryNote("18.00");
        stubProductMasterCost("25.00");

        SalesReturnRestockPlan.LineRestock line = planLine(goodReturn(2));

        assertEquals(new BigDecimal("12.0000"), line.unitCost());
        assertEquals(2, line.restockQty());
        assertEquals(new BigDecimal("24.0000"), line.restockCost());
    }

    @Test
    void theInvoiceCostAtSaleSnapshotIsTheSecondChoice() {
        // No delivery-note history, but the invoice line kept what the unit cost at checkout.
        stubInvoiceWithDeliveryNote("18.00");
        stubProductMasterCost("25.00");

        SalesReturnRestockPlan.LineRestock line = planLine(goodReturn(2));

        assertEquals(new BigDecimal("18.00"), line.unitCost());
        assertEquals(new BigDecimal("36.00"), line.restockCost());
    }

    @Test
    void theCurrentProductMasterCostIsTheLastResort() {
        stubProductMasterCost("25.00");

        SalesReturnRestockPlan.LineRestock line = planLine(goodReturn(2));

        assertEquals(new BigDecimal("25.00"), line.unitCost());
    }

    @Test
    void anUnresolvedCostBlocksTheLineAndIsNamedForTheCashier() {
        // No DN snapshot, no invoice snapshot, and no cost price on the product.
        SalesReturn r = goodReturn(2);
        SalesReturnRestockPlan plan = planner.plan(r);

        assertEquals(List.of(ITEM), plan.unresolvedCostItemCodes());
        assertFalse(plan.restocksAnything(),
                "A unit with no cost must not restock: on-hand would rise with nothing to value it at");
        assertEquals(BigDecimal.ZERO, plan.totalRestockCost());
    }

    @Test
    void anExplicitZeroCostPriceCountsAsMissingNotAsFree() {
        stubProductMasterCost("0.00");

        assertEquals(List.of(ITEM), planner.plan(goodReturn(1)).unresolvedCostItemCodes());
    }

    @Test
    void anItemMissingFromTheProductMasterIsAnUnresolvedCost() {
        when(productRepository.findByCodeAndIsActiveTrue(ITEM)).thenReturn(Optional.empty());

        assertEquals(List.of(ITEM), planner.plan(goodReturn(1)).unresolvedCostItemCodes());
    }

    // ── conditions ──────────────────────────────────────────────────────────────────

    @Test
    void onlyGoodRestocksAndEveryScrapConditionRestocksNothing() {
        stubProductMasterCost("25.00");

        SalesReturnRestockPlan good = planner.plan(returnWithCondition(SalesReturnCondition.GOOD, 2));
        assertTrue(good.restocksAnything());
        assertEquals(new BigDecimal("50.00"), good.totalRestockCost());

        for (SalesReturnCondition scrap : List.of(SalesReturnCondition.DAMAGED,
                SalesReturnCondition.OPENED, SalesReturnCondition.DEFECTIVE,
                SalesReturnCondition.EXPIRED)) {
            SalesReturnPlanAssertion.assertNoRestock(planner.plan(returnWithCondition(scrap, 2)), scrap);
        }
    }

    @Test
    void aScrapLineIsNotReportedAsAnUnresolvedCostOrWarehouse() {
        // Zero COGS is the correct answer for scrap, not a missing one — the approval must not
        // be blocked and nothing should be debited to inventory.
        SalesReturnRestockPlan plan = planner.plan(returnWithCondition(SalesReturnCondition.DAMAGED, 2));

        assertTrue(plan.unresolvedCostItemCodes().isEmpty());
        assertTrue(plan.unresolvedWarehouseItemCodes().isEmpty());
    }

    @Test
    void theLegacyItemStatusDecidesWhenNoStructuredConditionIsPresent() {
        stubProductMasterCost("25.00");

        SalesReturn legacyGood = goodReturn(1);
        legacyGood.getItems().get(0).setCondition(null);
        legacyGood.getItems().get(0).setItemStatus("Good");
        assertTrue(planner.plan(legacyGood).restocksAnything());

        SalesReturn legacyScrap = goodReturn(1);
        legacyScrap.getItems().get(0).setCondition(null);
        legacyScrap.getItems().get(0).setItemStatus("Damaged");
        assertFalse(planner.plan(legacyScrap).restocksAnything());
    }

    // ── destinations: the gap that let 1200 be debited for goods that never moved ───

    @Test
    void aGoodLineWithNoWarehouseRestocksNothingAndDebitsNoInventory() {
        stubProductMasterCost("25.00");
        when(deliveryNoteRepository.findByDnNumberIn(List.of("DN-1"))).thenReturn(List.of());

        SalesReturnRestockPlan plan = planner.plan(goodReturn(2));

        assertFalse(plan.restocksAnything(),
                "No destination means no stock movement — and therefore no inventory debit");
        assertEquals(BigDecimal.ZERO, plan.totalRestockCost(),
                "This is the defect: the journal used to debit 1200 for this line anyway");
        assertEquals(List.of(ITEM), plan.unresolvedWarehouseItemCodes());
        // Not a cost problem, so the approval is not blocked with a misleading message.
        assertTrue(plan.unresolvedCostItemCodes().isEmpty());
    }

    @Test
    void aDeliveryNoteWithNoWarehouseIsTheSameAsNoDeliveryNote() {
        stubProductMasterCost("25.00");
        DeliveryNote dn = new DeliveryNote();
        dn.setId(DN_ID);
        dn.setWarehouse(null);
        when(deliveryNoteRepository.findByDnNumberIn(List.of("DN-1"))).thenReturn(List.of(dn));

        assertFalse(planner.plan(goodReturn(1)).restocksAnything());
    }

    // ── batch lines ─────────────────────────────────────────────────────────────────

    @Test
    void aBatchLineTakesItsWarehouseFromTheAllocationsBatchMaster() {
        stubProductMasterCost("25.00");
        stubAllocation(81L, BATCH_WAREHOUSE_ID);

        SalesReturnRestockPlan.LineRestock line = planLine(batchReturn(81L, 3));

        assertTrue(line.restocks());
        assertEquals(3, line.restockQty());
        assertEquals(BATCH_WAREHOUSE_ID, line.batchWarehouseId(81L));
        assertNull(line.warehouseId(), "A batch line's destination is per lot, not per line");
        assertEquals(new BigDecimal("75.00"), line.restockCost());
    }

    @Test
    void aBatchLotWhoseMasterHasNoWarehouseIsExcludedFromBothQuantityAndCost() {
        stubProductMasterCost("25.00");
        stubAllocation(81L, BATCH_WAREHOUSE_ID);
        stubAllocation(82L, null);

        SalesReturn r = batchReturn(81L, 3);
        r.getItems().get(0).getBatches().add(batchSelection(82L, 2));
        r.getItems().get(0).setReturnQty(5);

        SalesReturnRestockPlan.LineRestock line = planLine(r);

        assertEquals(3, line.restockQty(), "Only the lot with a destination comes back");
        assertEquals(new BigDecimal("75.00"), line.restockCost(),
                "And only that lot's cost is debited to inventory");
        assertNull(line.batchWarehouseId(82L));
    }

    @Test
    void aBatchLineWithNoRestockableLotAtAllRestocksNothing() {
        stubProductMasterCost("25.00");
        stubAllocation(81L, null);

        SalesReturnRestockPlan plan = planner.plan(batchReturn(81L, 3));

        assertFalse(plan.restocksAnything());
        assertEquals(List.of(ITEM), plan.unresolvedWarehouseItemCodes());
    }

    @Test
    void aMissingAllocationIsLeftForTheApplyPassToReport() {
        stubProductMasterCost("25.00");
        when(batchAllocationRepository.findById(81L)).thenReturn(Optional.empty());

        // applyBatchReturns throws a specific "Allocation not found" error; the planner must not
        // pre-empt it with a warehouse complaint that names the wrong cause.
        assertFalse(planner.plan(batchReturn(81L, 3)).restocksAnything());
    }

    // ── the invariant ───────────────────────────────────────────────────────────────

    @Test
    void theTotalRestockCostIsExactlyQuantityTimesUnitCostAcrossEveryRestockingLine() {
        stubProductMasterCost("25.00");

        SalesReturn r = goodReturn(4);
        SalesReturnRestockPlan plan = planner.plan(r);
        SalesReturnRestockPlan.LineRestock line = plan.forLine(r.getItems().get(0));

        assertEquals(
                line.unitCost().multiply(BigDecimal.valueOf(line.restockQty())),
                plan.totalRestockCost());
    }

    @Test
    void aLineWithNoQuantityIsNotInThePlanAtAll() {
        stubProductMasterCost("25.00");
        SalesReturn r = goodReturn(0);

        SalesReturnRestockPlan plan = planner.plan(r);

        assertFalse(plan.forLine(r.getItems().get(0)).restocks());
        assertEquals(BigDecimal.ZERO, plan.totalRestockCost());
    }

    @Test
    void aReturnWithNoLinesPlansNothing() {
        SalesReturn r = new SalesReturn();
        r.setReturnNumber("SR-EMPTY");

        SalesReturnRestockPlan plan = planner.plan(r);

        assertFalse(plan.restocksAnything());
        assertEquals(BigDecimal.ZERO, plan.totalRestockCost());
    }

    // ── fixtures ────────────────────────────────────────────────────────────────────

    /** Small helper so the per-condition loop above reads as one assertion per condition. */
    private static final class SalesReturnPlanAssertion {
        static void assertNoRestock(SalesReturnRestockPlan plan, SalesReturnCondition condition) {
            assertFalse(plan.restocksAnything(), condition + " must not restock");
            assertEquals(BigDecimal.ZERO, plan.totalRestockCost(),
                    condition + " must not debit inventory — the cost stays on the books as a loss");
        }
    }

    private SalesReturnRestockPlan.LineRestock planLine(SalesReturn r) {
        return planner.plan(r).forLine(r.getItems().get(0));
    }

    private void stubInvoiceWithDeliveryNote(String costAtSale) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNumber(INVOICE);
        invoice.setLinkedDeliveryNote("DN-1");

        SalesInvoiceItem ii = new SalesInvoiceItem();
        ii.setItemCode(ITEM);
        ii.setQuantity(10);
        if (costAtSale != null) ii.setCost(new BigDecimal(costAtSale));
        invoice.setItems(new ArrayList<>(List.of(ii)));

        when(salesInvoiceRepository.findByInvoiceNumber(INVOICE)).thenReturn(Optional.of(invoice));
    }

    private void stubDeliveryNoteWarehouse(Long warehouseId) {
        Warehouse wh = new Warehouse();
        wh.setId(warehouseId);
        DeliveryNote dn = new DeliveryNote();
        dn.setId(DN_ID);
        dn.setWarehouse(wh);
        when(deliveryNoteRepository.findByDnNumberIn(List.of("DN-1"))).thenReturn(List.of(dn));
        when(deliveryNoteRepository.findByLinkedInvoiceNumber(INVOICE)).thenReturn(List.of(dn));
    }

    private void stubDnConsumption(int qty, String totalCost) {
        DeliveryNoteBatchConsumption row = new DeliveryNoteBatchConsumption();
        ReflectionTestUtils.setField(row, "itemCode", ITEM);
        ReflectionTestUtils.setField(row, "quantity", qty);
        ReflectionTestUtils.setField(row, "totalCost", new BigDecimal(totalCost));
        when(consumptionRepo.findByDeliveryNoteId(DN_ID)).thenReturn(List.of(row));
    }

    private void stubProduct() {
        Product p = new Product();
        p.setId(PRODUCT_ID);
        p.setCode(ITEM);
        when(productRepository.findByCodeAndIsActiveTrue(ITEM)).thenReturn(Optional.of(p));
    }

    private void stubProductMasterCost(String cost) {
        ProductPricing pricing = new ProductPricing();
        pricing.setCost(new BigDecimal(cost));
        when(productPricingRepository.findByProductId(PRODUCT_ID)).thenReturn(Optional.of(pricing));
    }

    private void stubAllocation(Long allocationId, Long warehouseId) {
        BatchAllocation allocation = new BatchAllocation();
        allocation.setId(allocationId);
        allocation.setProductId(PRODUCT_ID);
        allocation.setProductCode(ITEM);
        if (warehouseId != null) {
            BatchMaster master = new BatchMaster();
            master.setWarehouseId(warehouseId);
            allocation.setBatchMaster(master);
        }
        when(batchAllocationRepository.findById(allocationId)).thenReturn(Optional.of(allocation));
    }

    private static SalesReturn goodReturn(int qty) {
        return returnWithCondition(SalesReturnCondition.GOOD, qty);
    }

    private static SalesReturn returnWithCondition(SalesReturnCondition condition, int qty) {
        SalesReturn r = new SalesReturn();
        r.setReturnNumber("SR-2026-0001");
        r.setLinkedInvoice(INVOICE);

        SalesReturnItem item = new SalesReturnItem();
        item.setItemCode(ITEM);
        item.setReturnQty(qty);
        item.setCondition(condition);
        item.setItemStatus(condition.toLegacyItemStatus());
        r.setItems(new ArrayList<>(List.of(item)));
        return r;
    }

    private static SalesReturn batchReturn(Long allocationId, int qty) {
        SalesReturn r = goodReturn(qty);
        r.getItems().get(0).setBatches(new ArrayList<>(List.of(batchSelection(allocationId, qty))));
        return r;
    }

    private static SalesReturnItemBatch batchSelection(Long allocationId, int qty) {
        SalesReturnItemBatch sel = new SalesReturnItemBatch();
        sel.setOriginalAllocationId(allocationId);
        sel.setQuantity(qty);
        sel.setBatchNumber("B-" + allocationId);
        return sel;
    }
}
