package com.billbull.backend.sales.invoice;

import com.billbull.backend.common.ownership.OwnershipAccessService;
import com.billbull.backend.settings.branch.BranchAccessService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * {@link SalesInvoiceService#getByIdForReceiptReprint(Long)} is the reprint-specific lookup: it
 * keeps branch/tenant isolation but deliberately does NOT apply the ownership (createdBy) filter
 * that {@link SalesInvoiceService#getById(Long)} uses for the Sales Invoice list/detail screens —
 * that filter is what made a colleague's POS receipt 404 at the reprint counter.
 */
class SalesInvoiceReceiptReprintLookupTest {

    @Mock private SalesInvoiceRepository invoiceRepo;
    @Mock private BranchAccessService branchAccessService;
    @Mock private OwnershipAccessService ownershipAccessService;
    @Mock private com.billbull.backend.inventory.batch.BatchSelectionService batchSelectionService;

    @InjectMocks private SalesInvoiceService service;

    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
    }

    @Test
    void returnsInvoiceCreatedByAnotherCashierWithoutConsultingOwnership() {
        SalesInvoice invoice = posInvoice(166L, 1L, 9001L);
        when(invoiceRepo.findById(166L)).thenReturn(Optional.of(invoice));

        SalesInvoice found = service.getByIdForReceiptReprint(166L);

        assertSame(invoice, found);
        verify(branchAccessService).assertTransactionBranchAccessible(1L, "Sales Invoice");
        verifyNoInteractions(ownershipAccessService);
    }

    @Test
    void missingInvoiceIs404() {
        when(invoiceRepo.findById(999L)).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.getByIdForReceiptReprint(999L));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
        verifyNoInteractions(branchAccessService);
    }

    @Test
    void foreignBranchInvoiceIsRejectedByBranchScope() {
        SalesInvoice invoice = posInvoice(166L, 77L, 9001L);
        when(invoiceRepo.findById(166L)).thenReturn(Optional.of(invoice));
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "another branch"))
                .when(branchAccessService).assertTransactionBranchAccessible(any(), anyString());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.getByIdForReceiptReprint(166L));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    /** Regression guard: the ownership filter must stay on the ordinary detail path. */
    @Test
    void getByIdStillAppliesOwnershipFilter() {
        SalesInvoice invoice = posInvoice(166L, 1L, 9001L);
        when(invoiceRepo.findById(166L)).thenReturn(Optional.of(invoice));

        service.getById(166L);

        verify(ownershipAccessService).assertCanAccessRecord(9001L, "Sales Invoice");
    }

    private SalesInvoice posInvoice(Long id, Long branchId, Long createdByUserId) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setId(id);
        invoice.setInvoiceNumber("INV-2026-0166");
        invoice.setBranchId(branchId);
        invoice.setCreatedByUserId(createdByUserId);
        invoice.setItems(new ArrayList<>());
        return invoice;
    }
}
