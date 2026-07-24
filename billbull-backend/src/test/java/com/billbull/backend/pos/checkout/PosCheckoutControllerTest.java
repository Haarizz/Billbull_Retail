package com.billbull.backend.pos.checkout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.serial.SerialMasterRepository;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.security.RolePermissionService;
import com.billbull.backend.settings.branch.BranchRepository;

/**
 * Regression tests for {@link PosCheckoutController#checkout}.
 *
 * <p>Pins the fix for the "invoice stays DRAFT / Paid=0 after a successful payment"
 * defect: a cash checkout must (1) save the draft, (2) transition status to PAID, and
 * (3) record the payment — and the §4.1 QR archival that runs last must persist through
 * {@link SalesInvoiceService#archiveReceiptQr} (single-column UPDATE), never by
 * re-saving the stale draft entity via {@code invoiceRepository.save}, which would
 * revert the just-committed PAID/payment state.
 */
class PosCheckoutControllerTest {

    @Mock private SalesInvoiceService invoiceService;
    @Mock private PosSessionService sessionService;
    @Mock private SalesInvoiceRepository invoiceRepository;
    @Mock private CustomerRepository customerRepository;
    @Mock private PosAuditService auditService;
    @Mock private BranchRepository branchRepository;
    @Mock private SerialMasterRepository serialMasterRepository;
    @Mock private ProductRepository productRepository;
    @Mock private ProductPricingRepository pricingRepository;
    @Mock private RolePermissionService permissionService;
    @Mock private com.billbull.backend.pos.terminal.PosTerminalActivityService terminalActivityService;
    @Mock private com.billbull.backend.common.tax.BranchTaxResolutionService branchTaxResolutionService;

    @InjectMocks private PosCheckoutController controller;

    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        lenient().when(branchTaxResolutionService.resolveSalesTaxRateForProduct(any(), any()))
                .thenReturn(BigDecimal.ZERO);
    }

    @Test
    void cashCheckoutPostsPaidStatusRecordsPaymentAndArchivesQrWithoutResavingInvoice()
            throws Exception {
        // Draft built by save() — total 3080, paid 0, DRAFT (the snapshot that the
        // old code wrongly re-saved at QR time).
        SalesInvoice draft = new SalesInvoice();
        draft.setId(42L);
        draft.setInvoiceNumber("INV-2026-0041");
        draft.setInvoiceTotal(new BigDecimal("3080.00"));
        draft.setTaxTotal(new BigDecimal("280.00"));
        draft.setInvoiceDate(LocalDate.now());
        draft.setStatus(SalesInvoiceStatus.DRAFT);

        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(42L)).thenReturn(draft);

        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("Cash");
        req.setAmountTendered(3080.0);
        PosCheckoutRequest.PosCheckoutItem item = new PosCheckoutRequest.PosCheckoutItem();
        item.setItemCode("10593");
        item.setItemName("WATER TANK");
        item.setQuantity(1);
        item.setPrice(3500.0);
        req.setItems(List.of(item));

        controller.checkout(req);

        // Full-payment cash sale must transition the draft to PAID.
        verify(invoiceService).updateStatus(42L, SalesInvoiceStatus.PAID);
        // Payment of the full 3080 must be recorded against the invoice.
        verify(invoiceService).recordPayment(eq(42L), eq(3080.0), eq("Cash"),
                isNull(), any(LocalDate.class), isNull(), isNull(), isNull(), isNull());
        // QR is archived through the safe single-column update path...
        verify(invoiceService).archiveReceiptQr(eq(42L), anyString());
        // ...and the controller NEVER re-saves the stale invoice entity (the bug).
        verify(invoiceRepository, never()).save(any());
    }

    @Test
    void idempotentReplayReturnsExistingInvoiceWithoutReposting() {
        SalesInvoice existing = new SalesInvoice();
        existing.setId(42L);
        existing.setInvoiceNumber("INV-2026-0041");
        existing.setStatus(SalesInvoiceStatus.PAID);

        when(invoiceRepository.findByPosCheckoutKey("KEY-1"))
                .thenReturn(java.util.Optional.of(existing));
        when(invoiceService.getById(42L)).thenReturn(existing);

        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setCheckoutKey("KEY-1");

        var resp = controller.checkout(req);

        assertEquals(SalesInvoiceStatus.PAID, resp.getBody().getStatus());
        // No new invoice, no status change, no payment, no QR write on replay.
        verify(invoiceService, never()).save(any());
        verify(invoiceService, never()).updateStatus(anyLong(), any());
        verify(invoiceService, never()).recordPayment(anyLong(), anyDouble(), anyString(),
                any(), any(), any(), any(), any(), any());
    }
}
