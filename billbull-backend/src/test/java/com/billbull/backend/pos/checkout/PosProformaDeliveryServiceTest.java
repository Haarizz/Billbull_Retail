package com.billbull.backend.pos.checkout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductPackingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.product.ProductType;
import com.billbull.backend.inventory.reservation.PosStockReservationService;
import com.billbull.backend.pos.businessdate.BusinessDayClock;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.sales.salesorder.SalesOrder;
import com.billbull.backend.sales.salesorder.SalesOrderRepository;
import com.billbull.backend.sales.salesorder.SalesOrderStatus;
import com.billbull.backend.settings.branch.BranchRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * The PI Flow delivery workflow: issuing a Pro-forma Invoice holds stock and posts nothing;
 * converting it posts it on the settlement date and session, exactly once.
 */
@ExtendWith(MockitoExtension.class)
class PosProformaDeliveryServiceTest {

    @Mock private SalesInvoiceRepository invoiceRepository;
    @Mock private SalesInvoiceService invoiceService;
    @Mock private PosStockReservationService stockReservationService;
    @Mock private ProductRepository productRepository;
    @Mock private ProductPackingRepository packingRepository;
    @Mock private SalesOrderRepository salesOrderRepository;
    @Mock private PosSessionRepository sessionRepository;
    @Mock private PosSessionService sessionService;
    @Mock private BranchRepository branchRepository;
    @Spy private BusinessDayClock businessDayClock = new BusinessDayClock("Asia/Dubai");
    @InjectMocks private PosProformaDeliveryService service;

    @BeforeEach
    void setUp() {
        lenient().when(packingRepository.findByProductId(anyLong())).thenReturn(List.of());
        lenient().when(invoiceService.getByIdBypassingOwnership(anyLong()))
                .thenAnswer(inv -> invoice(inv.getArgument(0), SalesInvoiceStatus.CONFIRMED));
    }

    // ── issue ────────────────────────────────────────────────────────────────

    @Test
    void issuingFlagsTheDraftAndHoldsOnlyItsNonBatchStockLines() {
        SalesInvoice pi = invoice(10L, SalesInvoiceStatus.DRAFT);
        pi.setItems(new ArrayList<>(List.of(
                line(1L, "STOCK", 3, false),
                line(2L, "SERVICE", 1, false),
                line(3L, "BATCH", 2, false),
                line(4L, "VOIDED", 5, true))));
        when(invoiceRepository.findByIdWithItems(10L)).thenReturn(Optional.of(pi));
        when(productRepository.findByCodeAndIsActiveTrue("STOCK")).thenReturn(Optional.of(product(100L, false, false)));
        when(productRepository.findByCodeAndIsActiveTrue("SERVICE")).thenReturn(Optional.of(product(101L, true, false)));
        when(productRepository.findByCodeAndIsActiveTrue("BATCH")).thenReturn(Optional.of(product(102L, false, true)));

        service.issue(10L);

        assertTrue(pi.getPosProformaPending());
        assertEquals(SalesInvoiceStatus.DRAFT, pi.getStatus());
        verify(stockReservationService).reserveForProformaLine(10L, 1L, 100L, "STOCK", 5L, 3);
        verify(stockReservationService, never()).reserveForProformaLine(eq(10L), eq(2L), any(), any(), any(), anyInt());
        verify(stockReservationService, never()).reserveForProformaLine(eq(10L), eq(3L), any(), any(), any(), anyInt());
        verify(stockReservationService, never()).reserveForProformaLine(eq(10L), eq(4L), any(), any(), any(), anyInt());
        // Nothing is posted when a PI goes out.
        verify(invoiceService, never()).updateStatus(any(), any());
    }

    @Test
    void anOrderTakenUpFromAConfirmedSalesOrderIsNotHeldTwice() {
        SalesInvoice pi = invoice(11L, SalesInvoiceStatus.DRAFT);
        pi.setLinkedSalesOrder("SO-1");
        pi.setItems(new ArrayList<>(List.of(line(1L, "STOCK", 3, false))));
        when(invoiceRepository.findByIdWithItems(11L)).thenReturn(Optional.of(pi));
        SalesOrder so = new SalesOrder();
        so.setStatus(SalesOrderStatus.CONFIRMED);
        when(salesOrderRepository.findBySoNumber("SO-1")).thenReturn(Optional.of(so));

        service.issue(11L);

        verify(stockReservationService, never()).reserveForProformaLine(any(), any(), any(), any(), any(), anyInt());
    }

    @Test
    void onlyADraftCanBeIssued() {
        when(invoiceRepository.findByIdWithItems(12L))
                .thenReturn(Optional.of(invoice(12L, SalesInvoiceStatus.CONFIRMED)));
        assertThrows(IllegalStateException.class, () -> service.issue(12L));
    }

    // ── convert ──────────────────────────────────────────────────────────────

    @Test
    void convertingReleasesTheHoldThenPostsOnTheSettlementDateAndSession() {
        SalesInvoice pi = invoice(20L, SalesInvoiceStatus.DRAFT);
        pi.setPosProformaPending(Boolean.TRUE);
        pi.setPosSessionId(99L);
        pi.setInvoiceDate(LocalDate.of(2026, 10, 20));
        when(invoiceRepository.findByIdForUpdate(20L)).thenReturn(Optional.of(pi));
        when(sessionRepository.findById(100L)).thenReturn(Optional.of(session(100L, PosSessionStatus.OPEN)));

        LocalDate settledOn = LocalDate.of(2026, 10, 22);
        assertTrue(service.convert(20L, 100L, settledOn));

        assertFalse(pi.getPosProformaPending());
        assertEquals(settledOn, pi.getInvoiceDate());
        assertEquals(100L, pi.getPosSessionId());
        InOrder order = inOrder(stockReservationService, invoiceService, sessionService);
        order.verify(stockReservationService).releaseSourceDocument(PosStockReservationService.DOC_TYPE_POS_PROFORMA, 20L);
        order.verify(invoiceService).updateStatus(20L, SalesInvoiceStatus.CONFIRMED);
        order.verify(invoiceService).completeSalesOrderConversion(20L);
        order.verify(sessionService).recordInvoiceOnSession(eq(100L), any(SalesInvoice.class));
        verify(invoiceService).archiveReceiptQr(eq(20L), any());
    }

    @Test
    void aClosedOrMissingSessionKeepsTheOriginalSessionAndCountsNothing() {
        SalesInvoice pi = invoice(21L, SalesInvoiceStatus.DRAFT);
        pi.setPosProformaPending(Boolean.TRUE);
        pi.setPosSessionId(99L);
        when(invoiceRepository.findByIdForUpdate(21L)).thenReturn(Optional.of(pi));
        when(sessionRepository.findById(100L)).thenReturn(Optional.of(session(100L, PosSessionStatus.CLOSED)));

        assertTrue(service.convert(21L, 100L, LocalDate.of(2026, 10, 22)));

        assertEquals(99L, pi.getPosSessionId());
        verify(invoiceService).updateStatus(21L, SalesInvoiceStatus.CONFIRMED);
        verify(sessionService, never()).recordInvoiceOnSession(any(), any());
    }

    @Test
    void convertingIsIdempotent() {
        SalesInvoice alreadyConverted = invoice(22L, SalesInvoiceStatus.CONFIRMED);
        alreadyConverted.setPosProformaPending(Boolean.FALSE);
        when(invoiceRepository.findByIdForUpdate(22L)).thenReturn(Optional.of(alreadyConverted));

        assertFalse(service.convert(22L, 100L, LocalDate.of(2026, 10, 22)));

        verify(invoiceService, never()).updateStatus(any(), any());
        verify(stockReservationService, never()).releaseSourceDocument(any(), any());
    }

    @Test
    void aStaleFlagOnAnAlreadyPostedInvoiceIsClearedNotPostedAgain() {
        SalesInvoice posted = invoice(23L, SalesInvoiceStatus.CONFIRMED);
        posted.setPosProformaPending(Boolean.TRUE);
        when(invoiceRepository.findByIdForUpdate(23L)).thenReturn(Optional.of(posted));

        assertFalse(service.convert(23L, null, null));

        assertFalse(posted.getPosProformaPending());
        verify(invoiceService, never()).updateStatus(any(), any());
    }

    @Test
    void theAdvanceShownForAPendingPiComesFromItsSalesOrder() {
        SalesInvoice pi = invoice(24L, SalesInvoiceStatus.DRAFT);
        pi.setPosProformaPending(Boolean.TRUE);
        pi.setLinkedSalesOrder("SO-9");
        when(invoiceService.openSalesOrderAdvance("SO-9")).thenReturn(new BigDecimal("150.00"));

        assertEquals(new BigDecimal("150.00"), service.pendingSalesOrderAdvance(pi));
        assertEquals(BigDecimal.ZERO, service.pendingSalesOrderAdvance(invoice(25L, SalesInvoiceStatus.CONFIRMED)));
    }

    // ── fixtures ─────────────────────────────────────────────────────────────

    private static SalesInvoice invoice(Long id, SalesInvoiceStatus status) {
        SalesInvoice inv = new SalesInvoice();
        inv.setId(id);
        inv.setInvoiceNumber("INV-" + id);
        inv.setStatus(status);
        inv.setInvoiceTotal(new BigDecimal("100.00"));
        return inv;
    }

    private static SalesInvoiceItem line(Long id, String code, int qty, boolean voided) {
        SalesInvoiceItem item = new SalesInvoiceItem();
        item.setId(id);
        item.setItemCode(code);
        item.setQuantity(qty);
        item.setUnit("PCS");
        item.setWarehouseId(5L);
        item.setVoided(voided);
        return item;
    }

    private static Product product(Long id, boolean service, boolean batch) {
        Product p = new Product();
        p.setId(id);
        p.setProductType(service ? ProductType.SERVICE : ProductType.STOCK);
        p.setBatch(batch);
        return p;
    }

    private static PosSession session(Long id, PosSessionStatus status) {
        PosSession s = new PosSession();
        s.setId(id);
        s.setStatus(status);
        return s;
    }
}
