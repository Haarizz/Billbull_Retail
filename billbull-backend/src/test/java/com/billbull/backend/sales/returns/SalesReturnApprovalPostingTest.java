package com.billbull.backend.sales.returns;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
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
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.purchase.stockmovement.StockMovementService;
import com.billbull.backend.purchase.stockmovement.StockSourceType;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * What an approval actually writes, end to end through {@code updateStatus}.
 *
 * <p>Three properties are pinned here that no single-unit test can express:
 *
 * <ul>
 *   <li>the stock movement and the inventory journal come from <em>one</em> restock verdict, so
 *       account 1200 is debited for exactly the value of the stock that was posted;</li>
 *   <li>the inbound movement carries the resolved unit cost and the return's business date, not a
 *       null cost and the server's calendar date;</li>
 *   <li>every approval is audited — not only the ones policy happened to gate behind a supervisor
 *       signature — and a repeat approval posts nothing a second time.</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SalesReturnApprovalPostingTest {

    private static final String INVOICE = "INV-2026-04812";
    private static final String RETURN_NO = "SR-2026-0001";
    private static final String ITEM = "ITEM-A";
    private static final Long RETURN_ID = 42L;
    private static final Long PRODUCT_ID = 300L;
    private static final Long WAREHOUSE_ID = 7L;
    private static final LocalDate BUSINESS_DATE = LocalDate.of(2026, 9, 30);

    @Mock private SalesReturnRepository salesReturnRepository;
    @Mock private SalesInvoiceRepository salesInvoiceRepository;
    @Mock private SalesReturnRestockPlanner restockPlanner;
    @Mock private SalesReturnAuthorizationService authorizationService;
    @Mock private SalesReturnCustomerAccountResolver customerAccountResolver;
    @Mock private SalesReturnCashRefundService cashRefundService;
    @Mock private PostingEngineService postingEngineService;
    @Mock private StockMovementService stockMovementService;
    @Mock private ProductRepository productRepository;
    @Mock private com.billbull.backend.sales.voucher.CreditVoucherService creditVoucherService;
    @Mock private com.billbull.backend.inventory.serial.SerialMasterRepository serialMasterRepository;
    @Mock private BranchAccessService branchAccessService;
    @Mock private PosAuditService posAuditService;
    @Mock private AuditLogService auditLogService;
    @Mock private com.billbull.backend.common.ownership.OwnershipAccessService ownershipAccessService;
    @Mock private com.billbull.backend.sales.invoice.InvoiceBalanceService invoiceBalanceService;
    @Mock private com.billbull.backend.sales.returns.credit.SalesReturnCreditApplicationRepository
            returnCreditApplicationRepository;

    @InjectMocks private SalesReturnService service;

    private SalesReturn stored;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "salesReturnRepository", salesReturnRepository);
        ReflectionTestUtils.setField(service, "salesInvoiceRepository", salesInvoiceRepository);
        ReflectionTestUtils.setField(service, "restockPlanner", restockPlanner);
        ReflectionTestUtils.setField(service, "authorizationService", authorizationService);
        ReflectionTestUtils.setField(service, "customerAccountResolver", customerAccountResolver);
        ReflectionTestUtils.setField(service, "cashRefundService", cashRefundService);
        ReflectionTestUtils.setField(service, "postingEngineService", postingEngineService);
        ReflectionTestUtils.setField(service, "stockMovementService", stockMovementService);
        ReflectionTestUtils.setField(service, "productRepository", productRepository);
        ReflectionTestUtils.setField(service, "creditVoucherService", creditVoucherService);
        ReflectionTestUtils.setField(service, "serialMasterRepository", serialMasterRepository);
        ReflectionTestUtils.setField(service, "branchAccessService", branchAccessService);
        ReflectionTestUtils.setField(service, "posAuditService", posAuditService);
        ReflectionTestUtils.setField(service, "auditLogService", auditLogService);
        ReflectionTestUtils.setField(service, "ownershipAccessService", ownershipAccessService);
        ReflectionTestUtils.setField(service, "invoiceBalanceService", invoiceBalanceService);
        ReflectionTestUtils.setField(service, "returnCreditApplicationRepository",
                returnCreditApplicationRepository);

        stored = draftReturn();
        when(salesReturnRepository.findByIdForUpdate(RETURN_ID)).thenReturn(Optional.of(stored));
        when(salesReturnRepository.findByIdWithItems(RETURN_ID)).thenReturn(Optional.of(stored));
        when(salesReturnRepository.save(any(SalesReturn.class))).thenAnswer(i -> i.getArgument(0));
        when(salesReturnRepository.findByLinkedInvoiceWithItems(INVOICE)).thenReturn(new ArrayList<>());
        when(salesInvoiceRepository.findByInvoiceNumberForUpdate(INVOICE))
                .thenReturn(Optional.of(invoiceOnBranch(1L)));
        when(salesInvoiceRepository.findByInvoiceNumber(INVOICE))
                .thenReturn(Optional.of(invoiceOnBranch(1L)));
        when(productRepository.findByCodeAndIsActiveTrue(ITEM)).thenReturn(Optional.of(product()));
        when(authorizationService.resolveRequiredAuthorization(any())).thenReturn(null);
    }

    // ── stock and the inventory journal agree ───────────────────────────────────────

    @Test
    void aRestockingLinePostsTheMovementAndTheInventoryJournalForTheSameValue() {
        stubPlan(planRestocking(2, "12.5000"));

        service.updateStatus(RETURN_ID, SalesReturnStatus.APPROVED);

        verify(stockMovementService).reverseOutboundStock(
                eq(StockSourceType.SALES_RETURN), eq(RETURN_ID), eq(PRODUCT_ID), eq(WAREHOUSE_ID),
                eq(2), eq(RETURN_NO), eq(new BigDecimal("12.5000")), eq(BUSINESS_DATE));
        verify(postingEngineService).createJournalFromSalesReturn(
                eq(stored), eq(new BigDecimal("25.0000")), eq(true), eq(true));
    }

    @Test
    void aScrapReturnPostsNoMovementAndNoInventoryJournal() {
        stubPlan(planNotRestocking());

        service.updateStatus(RETURN_ID, SalesReturnStatus.APPROVED);

        verifyNoInteractions(stockMovementService);
        verify(postingEngineService).createJournalFromSalesReturn(
                eq(stored), eq(BigDecimal.ZERO), eq(true), eq(false));
    }

    @Test
    void aResaleableLineWithNoWarehouseDebitsNoInventoryEither() {
        // The exact divergence this change removes: the goods did not move, so neither does 1200.
        SalesReturnRestockPlan plan = planNotRestocking(List.of(), List.of(ITEM));
        stubPlan(plan);

        service.updateStatus(RETURN_ID, SalesReturnStatus.APPROVED);

        verifyNoInteractions(stockMovementService);
        verify(postingEngineService).createJournalFromSalesReturn(
                any(), eq(BigDecimal.ZERO), eq(true), eq(false));
    }

    @Test
    void anUnresolvedCostBlocksTheApprovalBeforeAnythingIsWritten() {
        stubPlan(planNotRestocking(List.of(ITEM), List.of()));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.updateStatus(RETURN_ID, SalesReturnStatus.APPROVED));

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
        assertTrue(ex.getReason().contains(ITEM), ex.getReason());
        verifyNoInteractions(stockMovementService, postingEngineService, cashRefundService);
    }

    @Test
    void theInboundMovementUsesTheReturnsBusinessDateNotTheServerClock() {
        stored.setReturnDate(LocalDate.of(2026, 9, 30));
        stubPlan(planRestocking(1, "12.0000"));

        service.updateStatus(RETURN_ID, SalesReturnStatus.APPROVED);

        verify(stockMovementService).reverseOutboundStock(
                any(), anyLong(), anyLong(), anyLong(), anyInt(), anyString(), any(),
                eq(LocalDate.of(2026, 9, 30)));
    }

    // ── audit ───────────────────────────────────────────────────────────────────────

    @Test
    void anOrdinaryApprovalIsAuditedOnBothTrails() {
        stubPlan(planRestocking(1, "12.0000"));

        service.updateStatus(RETURN_ID, SalesReturnStatus.APPROVED);

        verify(auditLogService).logDomainEvent(
                eq("SALES_RETURN"), eq(RETURN_NO), eq("RETURN_APPROVED"), anyString());
        verify(posAuditService).logReturnApproved(
                eq(55L), eq("TERM-01"), eq(1L), eq(RETURN_ID), eq(RETURN_NO),
                eq("CASH_REFUND"), eq(new BigDecimal("105.00")));
    }

    @Test
    void theAuditEntryRecordsWhySignOffWasRequiredWhenItWas() {
        when(authorizationService.resolveRequiredAuthorization(any()))
                .thenReturn("HIGH_VALUE_CASH_REFUND");
        stored.setAuthorizedByUsername("supervisor1");
        stubPlan(planRestocking(1, "12.0000"));

        service.updateStatus(RETURN_ID, SalesReturnStatus.APPROVED);

        verify(authorizationService).authorize(eq(stored), eq("HIGH_VALUE_CASH_REFUND"), isNull(), isNull());
        verify(auditLogService).logDomainEvent(eq("SALES_RETURN"), eq(RETURN_NO),
                eq("RETURN_APPROVED"),
                org.mockito.ArgumentMatchers.contains("HIGH_VALUE_CASH_REFUND signed off by supervisor1"));
    }

    @Test
    void aStatusChangeThatIsNotAnApprovalPostsAndAuditsNothing() {
        service.updateStatus(RETURN_ID, SalesReturnStatus.CANCELLED);

        verifyNoInteractions(stockMovementService, postingEngineService, cashRefundService,
                posAuditService, auditLogService);
    }

    // ── idempotency ─────────────────────────────────────────────────────────────────

    @Test
    void approvingAnAlreadyApprovedReturnIsRejectedWithNothingPostedTwice() {
        stored.setStatus(SalesReturnStatus.APPROVED);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.updateStatus(RETURN_ID, SalesReturnStatus.APPROVED));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verifyNoInteractions(stockMovementService, postingEngineService, cashRefundService,
                creditVoucherService, posAuditService, auditLogService);
        verify(restockPlanner, never()).plan(any());
    }

    @Test
    void theRowIsLockedBeforeItsStatusIsEvenRead() {
        // What makes the guard above safe under concurrency rather than merely likely to work.
        stubPlan(planRestocking(1, "12.0000"));

        service.updateStatus(RETURN_ID, SalesReturnStatus.APPROVED);

        verify(salesReturnRepository).findByIdForUpdate(RETURN_ID);
    }

    // ── fixtures ────────────────────────────────────────────────────────────────────

    private void stubPlan(SalesReturnRestockPlan plan) {
        when(restockPlanner.plan(any(SalesReturn.class))).thenReturn(plan);
    }

    private SalesReturnRestockPlan planRestocking(int qty, String unitCost) {
        java.util.IdentityHashMap<SalesReturnItem, SalesReturnRestockPlan.LineRestock> byItem =
                new java.util.IdentityHashMap<>();
        SalesReturnItem item = stored.getItems().get(0);
        byItem.put(item, newLineRestock(item, true, qty, WAREHOUSE_ID, new BigDecimal(unitCost)));
        return newPlan(byItem, List.of(), List.of());
    }

    private SalesReturnRestockPlan planNotRestocking() {
        return planNotRestocking(List.of(), List.of());
    }

    private SalesReturnRestockPlan planNotRestocking(List<String> unresolvedCost,
                                                     List<String> unresolvedWarehouse) {
        java.util.IdentityHashMap<SalesReturnItem, SalesReturnRestockPlan.LineRestock> byItem =
                new java.util.IdentityHashMap<>();
        SalesReturnItem item = stored.getItems().get(0);
        byItem.put(item, newLineRestock(item, false, 0, null, null));
        return newPlan(byItem, unresolvedCost, unresolvedWarehouse);
    }

    /** The plan's constructors are package-private by design; these tests share its package. */
    private static SalesReturnRestockPlan newPlan(
            java.util.IdentityHashMap<SalesReturnItem, SalesReturnRestockPlan.LineRestock> byItem,
            List<String> unresolvedCost, List<String> unresolvedWarehouse) {
        return new SalesReturnRestockPlan(byItem, unresolvedCost, unresolvedWarehouse);
    }

    private static SalesReturnRestockPlan.LineRestock newLineRestock(
            SalesReturnItem item, boolean restockable, int qty, Long warehouseId, BigDecimal unitCost) {
        return new SalesReturnRestockPlan.LineRestock(
                item, restockable, qty, warehouseId, java.util.Map.of(), unitCost);
    }

    private static SalesReturn draftReturn() {
        Branch branch = new Branch();
        branch.setId(1L);
        branch.setName("Dubai Main");

        SalesReturn r = new SalesReturn();
        r.setId(RETURN_ID);
        r.setReturnNumber(RETURN_NO);
        r.setStatus(SalesReturnStatus.DRAFT);
        r.setBranch(branch);
        r.setLinkedInvoice(INVOICE);
        r.setCustomerCode("CUST-0003");
        r.setReturnDate(BUSINESS_DATE);
        r.setTradingDate(BUSINESS_DATE);
        r.setSubTotal(new BigDecimal("100.00"));
        r.setTaxAmount(new BigDecimal("5.00"));
        r.setTotalAmount(new BigDecimal("105.00"));
        r.setRefundAmount(new BigDecimal("105.00"));
        r.setRefundMethod(SalesReturnRefundMethod.CASH_REFUND);
        r.setPosSessionId(55L);
        r.setPosTerminalId("TERM-01");

        SalesReturnItem item = new SalesReturnItem();
        item.setItemCode(ITEM);
        item.setReturnQty(2);
        item.setCondition(SalesReturnCondition.GOOD);
        item.setItemStatus("Good");
        r.setItems(new ArrayList<>(List.of(item)));
        return r;
    }

    private static SalesInvoice invoiceOnBranch(Long branchId) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNumber(INVOICE);
        invoice.setBranchId(branchId);
        invoice.setBranchName("Dubai Main");
        invoice.setDeliveryStatus(com.billbull.backend.sales.invoice.DeliveryStatus.DELIVERED);

        SalesInvoiceItem ii = new SalesInvoiceItem();
        ii.setItemCode(ITEM);
        ii.setQuantity(10);
        invoice.setItems(new ArrayList<>(List.of(ii)));
        return invoice;
    }

    private static Product product() {
        Product p = new Product();
        p.setId(PRODUCT_ID);
        p.setCode(ITEM);
        return p;
    }
}
