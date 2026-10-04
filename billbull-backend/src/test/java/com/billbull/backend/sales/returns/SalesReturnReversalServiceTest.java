package com.billbull.backend.sales.returns;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.purchase.stockmovement.StockMovement;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.purchase.stockmovement.StockSourceType;
import com.billbull.backend.sales.invoice.InvoiceBalanceService;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.returns.credit.SalesReturnCreditApplication;
import com.billbull.backend.sales.returns.credit.SalesReturnCreditApplicationRepository;
import com.billbull.backend.sales.returns.credit.SalesReturnCreditApplicationStatus;
import com.billbull.backend.sales.voucher.CreditVoucher;
import com.billbull.backend.sales.voucher.CreditVoucherService;
import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.settings.branch.Branch;

import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;

/**
 * Reversal of an approved Sales Return.
 *
 * <p>The cases that matter are the refusals. A reversal unwinds posted money, so the service is
 * built to fail loudly rather than half-unwind, and each guard here pins one of those decisions:
 * only approved returns, always with a reason, never a batch-tracked return, never a voucher the
 * customer has already spent.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SalesReturnReversalServiceTest {

    @Mock private SalesReturnRepository salesReturnRepository;
    @Mock private SalesReturnAuthorizationService authorizationService;
    @Mock private PostingEngineService postingEngineService;
    @Mock private StockMovementRepository stockMovementRepository;
    @Mock private SalesReturnCreditApplicationRepository creditApplicationRepository;
    @Mock private SalesInvoiceRepository salesInvoiceRepository;
    @Mock private InvoiceBalanceService invoiceBalanceService;
    @Mock private CreditVoucherService creditVoucherService;
    @Mock private SalesReturnCashReversalService cashReversalService;
    @Mock private AuditLogService auditLogService;
    @Mock private EntityManager entityManager;

    @InjectMocks private SalesReturnReversalService service;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "entityManager", entityManager);
        when(salesReturnRepository.save(any(SalesReturn.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(stockMovementRepository.findBySourceTypeAndReferenceNo(any(), anyString()))
                .thenReturn(List.of());
        when(creditApplicationRepository.findByReturnNumber(anyString())).thenReturn(List.of());
        stubGlReads(BigDecimal.ZERO, 0L);
    }

    // ── Refusals ────────────────────────────────────────────────────────────────────────

    @Test
    void refusesAReturnThatIsNotApproved() {
        SalesReturn draft = approvedReturn();
        draft.setStatus(SalesReturnStatus.DRAFT);
        stubLookup(draft);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.reverse(1L, "keyed twice", "sup", "pw"));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("Only an approved return can be reversed"));
        verify(postingEngineService, never()).createJournalFromSalesReturnReversal(any(), any(), anyBoolean());
    }

    @Test
    void refusesWhenNoReasonIsGiven() {
        stubLookup(approvedReturn());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.reverse(1L, "   ", "sup", "pw"));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("A reason is required"));
    }

    @Test
    void refusesABatchTrackedReturnRatherThanHalfUnwindingIt() {
        SalesReturn withBatches = approvedReturn();
        SalesReturnItem item = withBatches.getItems().get(0);
        SalesReturnItemBatch batch = new SalesReturnItemBatch();
        batch.setBatchNumber("B-1");
        batch.setQuantity(1);
        item.setBatches(new ArrayList<>(List.of(batch)));
        stubLookup(withBatches);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.reverse(1L, "keyed twice", "sup", "pw"));

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
        assertTrue(ex.getReason().contains("batch-tracked return is not supported yet"));
        verify(stockMovementRepository, never()).save(any());
    }

    @Test
    void refusesWhenTheVoucherHasAlreadyBeenRedeemed() {
        SalesReturn voucherReturn = approvedReturn();
        voucherReturn.setRefundMethod(SalesReturnRefundMethod.CREDIT_VOUCHER);
        stubLookup(voucherReturn);

        CreditVoucher voucher = new CreditVoucher();
        ReflectionTestUtils.setField(voucher, "id", 7L);
        voucher.setVoucherNumber("CV-7");
        voucher.setUsedAmount(new BigDecimal("40.00"));
        when(creditVoucherService.findBySalesReturnNumber("SR-2026-0001"))
                .thenReturn(Optional.of(voucher));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.reverse(1L, "keyed twice", "sup", "pw"));

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
        assertTrue(ex.getReason().contains("already been redeemed"));
        verify(creditVoucherService, never()).cancel(anyLong(), anyString());
    }

    // ── The happy path, leg by leg ──────────────────────────────────────────────────────

    @Test
    void postsTheContraJournalAndMarksTheReturnReversed() {
        SalesReturn approved = approvedReturn();
        stubLookup(approved);
        stubGlReads(BigDecimal.ZERO, 1L); // revenue was recognized, no inventory leg

        SalesReturn result = service.reverse(1L, "customer changed their mind", "sup", "pw");

        verify(authorizationService).authorize(eq(approved),
                eq(SalesReturnReversalService.AUTHORIZATION_REASON), eq("sup"), eq("pw"));
        verify(postingEngineService).createJournalFromSalesReturnReversal(
                eq(approved), eq(LocalDate.now()), eq(true));
        assertEquals(SalesReturnStatus.REVERSED, result.getStatus());
        assertEquals("customer changed their mind", result.getReversalReason());
        assertNotNull(result.getReversedAt());
        verify(auditLogService).logDomainEvent(eq("SALES_RETURN"), eq("SR-2026-0001"),
                eq("RETURN_REVERSED"), anyString());
    }

    @Test
    void contrasTheInventoryLegWithTheAmountTheOriginalEntryDebited() {
        stubLookup(approvedReturn());
        stubGlReads(new BigDecimal("150.00"), 1L);

        service.reverse(1L, "keyed twice", "sup", "pw");

        verify(postingEngineService).createJournalFromSalesReturnReversalInventory(
                any(SalesReturn.class), eq(new BigDecimal("150.00")), eq(LocalDate.now()));
    }

    @Test
    void mirrorsEveryInboundStockMovementBackOutAtTheSameCost() {
        stubLookup(approvedReturn());
        StockMovement inbound = new StockMovement();
        inbound.setSourceType(StockSourceType.SALES_RETURN);
        inbound.setProductId(55L);
        inbound.setWarehouseId(1L);
        inbound.setQuantity(new BigDecimal("3"));
        inbound.setUnitCost(new BigDecimal("12.50"));
        inbound.setReferenceNo("SR-2026-0001");
        when(stockMovementRepository.findBySourceTypeAndReferenceNo(
                StockSourceType.SALES_RETURN, "SR-2026-0001")).thenReturn(List.of(inbound));

        service.reverse(1L, "keyed twice", "sup", "pw");

        ArgumentCaptor<StockMovement> captor = ArgumentCaptor.forClass(StockMovement.class);
        verify(stockMovementRepository).save(captor.capture());
        StockMovement out = captor.getValue();
        assertEquals(0, new BigDecimal("-3").compareTo(out.getQuantity()));
        assertEquals(0, new BigDecimal("12.50").compareTo(out.getUnitCost()));
        assertEquals("SR-2026-0001-REV", out.getReferenceNo());
        assertEquals(55L, out.getProductId());
    }

    @Test
    void movesTheAllocationToReversedAndRecomputesTheInvoice() {
        stubLookup(approvedReturn());
        SalesReturnCreditApplication applied = SalesReturnCreditApplication.applied(
                1L, "SR-2026-0001", "INV-2026-0100", "CUST-1",
                new BigDecimal("100.00"), LocalDate.now());
        when(creditApplicationRepository.findByReturnNumber("SR-2026-0001"))
                .thenReturn(List.of(applied));

        service.reverse(1L, "keyed twice", "sup", "pw");

        assertEquals(SalesReturnCreditApplicationStatus.REVERSED, applied.getStatus());
        verify(creditApplicationRepository).save(applied);
        verify(invoiceBalanceService).recomputeInvoiceBalanceByNumber("INV-2026-0100");
    }

    @Test
    void contrasACardSettlementWithWhatTheRefundEntryActuallyDebited() {
        SalesReturn card = approvedReturn();
        card.setRefundMethod(SalesReturnRefundMethod.CARD_REFUND);
        stubLookup(card);
        stubArDebit("SR-2026-0001-RFND", new BigDecimal("100.00"));

        service.reverse(1L, "keyed twice", "sup", "pw");

        verify(postingEngineService).createJournalFromSalesReturnReversalSettlement(
                eq(card), eq(new BigDecimal("100.00")), eq(false), eq(LocalDate.now()));
    }

    @Test
    void routesACashRefundToTheDrawerCompensation() {
        SalesReturn cash = approvedReturn();
        cash.setRefundMethod(SalesReturnRefundMethod.CASH_REFUND);
        stubLookup(cash);

        service.reverse(1L, "keyed twice", "sup", "pw");

        verify(cashReversalService).recordCashRefundReversal(cash);
    }

    @Test
    void customerCreditHasNoSettlementToUndo() {
        SalesReturn credit = approvedReturn();
        credit.setRefundMethod(SalesReturnRefundMethod.CUSTOMER_CREDIT);
        stubLookup(credit);

        service.reverse(1L, "keyed twice", "sup", "pw");

        verify(cashReversalService, never()).recordCashRefundReversal(any());
        verify(postingEngineService, never()).createJournalFromSalesReturnReversalSettlement(
                any(), any(), anyBoolean(), any());
    }

    // ── Fixtures ────────────────────────────────────────────────────────────────────────

    private void stubLookup(SalesReturn salesReturn) {
        when(salesReturnRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(salesReturn));
        when(salesReturnRepository.findByIdWithItems(1L)).thenReturn(Optional.of(salesReturn));
    }

    private SalesReturn approvedReturn() {
        SalesReturn r = new SalesReturn();
        ReflectionTestUtils.setField(r, "id", 1L);
        r.setReturnNumber("SR-2026-0001");
        r.setReturnDate(LocalDate.of(2026, 9, 1));
        r.setStatus(SalesReturnStatus.APPROVED);
        r.setLinkedInvoice("INV-2026-0100");
        r.setSubTotal(new BigDecimal("100.00"));
        r.setTaxAmount(new BigDecimal("5.00"));
        r.setTotalAmount(new BigDecimal("105.00"));
        r.setRefundAmount(new BigDecimal("105.00"));
        Branch branch = new Branch();
        ReflectionTestUtils.setField(branch, "id", 1L);
        r.setBranch(branch);

        SalesReturnItem item = new SalesReturnItem();
        item.setItemCode("ITEM-1");
        item.setReturnQty(1);
        item.setItemStatus("Good");
        r.setItems(new ArrayList<>(List.of(item)));
        return r;
    }

    /** One stub for all three GL read-backs the service performs. */
    @SuppressWarnings("unchecked")
    private void stubGlReads(BigDecimal inventoryDebit, long salesRevenueLines) {
        TypedQuery<BigDecimal> sumQuery = org.mockito.Mockito.mock(TypedQuery.class);
        when(sumQuery.setParameter(anyString(), any())).thenReturn(sumQuery);
        when(sumQuery.getSingleResult()).thenReturn(inventoryDebit);

        TypedQuery<Long> countQuery = org.mockito.Mockito.mock(TypedQuery.class);
        when(countQuery.setParameter(anyString(), any())).thenReturn(countQuery);
        when(countQuery.getSingleResult()).thenReturn(salesRevenueLines);

        when(entityManager.createQuery(anyString(), eq(BigDecimal.class))).thenReturn(sumQuery);
        when(entityManager.createQuery(anyString(), eq(Long.class))).thenReturn(countQuery);
    }

    /** Narrower stub for the settlement read, which needs a per-reference answer. */
    @SuppressWarnings("unchecked")
    private void stubArDebit(String reference, BigDecimal amount) {
        TypedQuery<BigDecimal> sumQuery = org.mockito.Mockito.mock(TypedQuery.class);
        when(sumQuery.setParameter(eq("ref"), eq(reference))).thenReturn(sumQuery);
        when(sumQuery.setParameter(anyString(), any())).thenReturn(sumQuery);
        when(sumQuery.getSingleResult()).thenReturn(amount);
        when(entityManager.createQuery(anyString(), eq(BigDecimal.class))).thenReturn(sumQuery);
    }

    private static boolean anyBoolean() {
        return org.mockito.ArgumentMatchers.anyBoolean();
    }
}
