package com.billbull.backend.pos.checkout;

import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.BranchRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Reprint authorization contract for {@code GET /api/pos/checkout/invoices/{id}/reprint}.
 *
 * <p>Reprinting is authorized by permission + branch access, never by who created the invoice —
 * Cashier2 on terminal T003 must be able to hand a customer a duplicate of a receipt Cashier1 rang
 * up on T002. These tests pin that, plus the status contract (403 without the permission, 404 for a
 * genuinely missing invoice) and the audit split between the original creator and the reprinter.
 */
class PosCheckoutControllerReprintTest {

    private static final String PERM = "permissions.pos.receipt.reprint";

    @Mock private SalesInvoiceService invoiceService;
    @Mock private ModulePermissionService modulePermissionService;
    @Mock private PosAuditService auditService;
    @Mock private BranchRepository branchRepository;

    @InjectMocks private PosCheckoutController controller;

    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("cashier2", "n/a", java.util.List.of()));
        when(branchRepository.findById(any())).thenReturn(Optional.empty());
    }

    @AfterEach
    void tearDown() throws Exception {
        SecurityContextHolder.clearContext();
        mocks.close();
    }

    @Test
    void anotherCashierInTheSameBranchCanReprintAndTheAuditNamesThem() {
        SalesInvoice invoice = posInvoice();
        when(invoiceService.getByIdForReceiptReprint(166L)).thenReturn(invoice);

        var response = controller.reprintReceipt(166L, 71L, "T003-256D", 1L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(invoice, response.getBody().get("invoice"));

        // Permission-gated, and resolved through the ownership-free reprint lookup.
        verify(modulePermissionService).requireCanView(PERM);
        verify(invoiceService).getByIdForReceiptReprint(166L);
        verify(invoiceService, never()).getById(anyLong());

        // Audit + reprint stamp name the reprinting user, not the creator...
        verify(auditService).logReceiptReprinted(71L, "T003-256D", 1L, 166L, "INV-2026-0166", "cashier2");
        verify(invoiceService).recordReprint(166L, "cashier2");
        assertEquals("cashier2", invoice.getLastReprintedBy());
        assertEquals(1, invoice.getReprintCount());
        // ...and the original creator is left untouched.
        assertEquals(9001L, invoice.getCreatedByUserId());
    }

    @Test
    void withoutTheReprintPermissionItIs403AndNothingIsRecorded() {
        doThrow(new AccessDeniedException("denied")).when(modulePermissionService).requireCanView(PERM);

        assertThrows(AccessDeniedException.class,
                () -> controller.reprintReceipt(166L, 71L, "T003-256D", 1L));

        verifyNoInteractions(invoiceService);
        verifyNoInteractions(auditService);
    }

    @Test
    void missingInvoiceStillPropagates404() {
        when(invoiceService.getByIdForReceiptReprint(999L)).thenThrow(
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Sales Invoice not found: 999"));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.reprintReceipt(999L, 71L, "T003-256D", 1L));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
        verifyNoInteractions(auditService);
        verify(invoiceService, never()).recordReprint(anyLong(), anyString());
    }

    @Test
    void foreignBranchInvoiceIsRejectedBeforeAnythingIsRecorded() {
        when(invoiceService.getByIdForReceiptReprint(166L)).thenThrow(
                new ResponseStatusException(HttpStatus.FORBIDDEN, "another branch"));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.reprintReceipt(166L, 71L, "T003-256D", 99L));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        verifyNoInteractions(auditService);
        verify(invoiceService, never()).recordReprint(anyLong(), anyString());
    }

    /** Invoice created by cashier1 on T002; already carries its checkout-time ZATCA QR. */
    private SalesInvoice posInvoice() {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setId(166L);
        invoice.setInvoiceNumber("INV-2026-0166");
        invoice.setBranchId(1L);
        invoice.setBranchName("BR-01");
        invoice.setCreatedByUserId(9001L); // cashier1, on terminal T002
        invoice.setPosReceiptQr("STORED-QR");
        invoice.setItems(new ArrayList<>());
        return invoice;
    }
}
