package com.billbull.backend.sales.advance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;

/**
 * Covers the plan's manual-verification scenarios for advance application:
 * partial application against one advance, and the validation guards that
 * must reject bad manual-apply requests before any AdvanceApplication row
 * or journal is created.
 */
@ExtendWith(MockitoExtension.class)
class AdvanceApplicationServiceTest {

    @Mock private AdvanceApplicationRepository applicationRepo;
    @Mock private ReceiptVoucherRepository receiptRepo;
    @Mock private SalesInvoiceRepository salesInvoiceRepo;
    @Mock private PostingEngineService postingEngine;
    @Mock private com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService receiptVoucherService;

    private AdvanceApplicationService service;

    @BeforeEach
    void setUp() {
        service = new AdvanceApplicationService(applicationRepo, receiptRepo, salesInvoiceRepo, postingEngine, receiptVoucherService);
    }

    private ReceiptVoucher advance(Long id, String customerCode, BigDecimal amount) {
        ReceiptVoucher rv = new ReceiptVoucher();
        rv.setId(id);
        rv.setCustomerCode(customerCode);
        rv.setAmount(amount);
        rv.setVoucherId("RV-" + id);
        return rv;
    }

    private SalesInvoice invoice(String number, String customerCode, BigDecimal balance) {
        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceNumber(number);
        inv.setCustomerCode(customerCode);
        inv.setBalance(balance);
        return inv;
    }

    // ---- Scenario A: partial application ----

    @Test
    void appliesPartialAmountAndLeavesRemainderOpen() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("1000.00"));
        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-1"))
                .thenReturn(Optional.of(invoice("INV-1", "CUST-1", new BigDecimal("600.00"))));
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(BigDecimal.ZERO);
        when(applicationRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AdvanceApplication result = service.apply(1L, "INV-1", new BigDecimal("600.00"), LocalDate.now());

        assertEquals(0, new BigDecimal("600.00").compareTo(result.getAppliedAmount()));
    }

    @Test
    void secondPartialApplicationRespectsRemainingOpenBalance() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("1000.00"));
        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-2"))
                .thenReturn(Optional.of(invoice("INV-2", "CUST-1", new BigDecimal("300.00"))));
        // 600 already applied from a prior call (Scenario A), 400 left open
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(new BigDecimal("600.00"));
        when(applicationRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AdvanceApplication result = service.apply(1L, "INV-2", new BigDecimal("300.00"), LocalDate.now());

        assertEquals(0, new BigDecimal("300.00").compareTo(result.getAppliedAmount()));
    }

    // ---- Validation guards (never trust the caller) ----

    @Test
    void rejectsUnknownInvoice() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("500.00"));
        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-MISSING")).thenReturn(Optional.empty());

        assertThrows(IllegalArgumentException.class,
                () -> service.apply(1L, "INV-MISSING", new BigDecimal("100.00"), LocalDate.now()));
    }

    @Test
    void rejectsInvoiceBelongingToAnotherCustomer() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("500.00"));
        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-OTHER"))
                .thenReturn(Optional.of(invoice("INV-OTHER", "CUST-2", new BigDecimal("100.00"))));

        assertThrows(IllegalArgumentException.class,
                () -> service.apply(1L, "INV-OTHER", new BigDecimal("100.00"), LocalDate.now()));
    }

    @Test
    void rejectsAlreadySettledInvoice() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("500.00"));
        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-PAID"))
                .thenReturn(Optional.of(invoice("INV-PAID", "CUST-1", BigDecimal.ZERO)));

        assertThrows(IllegalArgumentException.class,
                () -> service.apply(1L, "INV-PAID", new BigDecimal("50.00"), LocalDate.now()));
    }

    @Test
    void rejectsAmountExceedingInvoiceBalance() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("500.00"));
        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-1"))
                .thenReturn(Optional.of(invoice("INV-1", "CUST-1", new BigDecimal("100.00"))));

        assertThrows(IllegalArgumentException.class,
                () -> service.apply(1L, "INV-1", new BigDecimal("200.00"), LocalDate.now()));
    }

    @Test
    void rejectsAmountExceedingAdvanceOpenBalance() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("500.00"));
        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-1"))
                .thenReturn(Optional.of(invoice("INV-1", "CUST-1", new BigDecimal("1000.00"))));
        // Advance already fully applied elsewhere
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(new BigDecimal("500.00"));

        assertThrows(IllegalArgumentException.class,
                () -> service.apply(1L, "INV-1", new BigDecimal("1.00"), LocalDate.now()));
    }

    @Test
    void rejectsNonPositiveAmount() {
        assertThrows(IllegalArgumentException.class,
                () -> service.apply(1L, "INV-1", BigDecimal.ZERO, LocalDate.now()));
    }

    @Test
    void usesRowLockedLookupNotPlainFindById() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("500.00"));
        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-1"))
                .thenReturn(Optional.of(invoice("INV-1", "CUST-1", new BigDecimal("500.00"))));
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(BigDecimal.ZERO);
        when(applicationRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.apply(1L, "INV-1", new BigDecimal("100.00"), LocalDate.now());

        org.mockito.Mockito.verify(receiptRepo).findByIdForUpdate(1L);
        org.mockito.Mockito.verify(receiptRepo, org.mockito.Mockito.never()).findById(any());
    }

    // ---- applyAgainstOutstandingInvoices: general receipt settles existing balance ----

    @Test
    void appliesReceiptAgainstOldestOutstandingInvoiceFirst() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("1000.00"));
        when(receiptRepo.findByCustomerCodeAndPurposeOrderByDateAsc(
                eq("CUST-1"), eq(com.billbull.backend.financials.receiptvoucher.ReceiptPurpose.ADVANCE_RECEIVED)))
                .thenReturn(List.of(rv));
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(BigDecimal.ZERO);

        SalesInvoice older = invoice("INV-OLD", "CUST-1", new BigDecimal("400.00"));
        older.setInvoiceDate(LocalDate.of(2026, 1, 1));
        SalesInvoice newer = invoice("INV-NEW", "CUST-1", new BigDecimal("800.00"));
        newer.setInvoiceDate(LocalDate.of(2026, 2, 1));
        when(salesInvoiceRepo.findOutstandingByCustomerCodeOrderByInvoiceDateAsc("CUST-1"))
                .thenReturn(List.of(older, newer));

        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-OLD")).thenReturn(Optional.of(older));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-NEW")).thenReturn(Optional.of(newer));
        when(applicationRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        BigDecimal totalApplied = service.applyAgainstOutstandingInvoices("CUST-1", 1L);

        // 400 to the older invoice, remaining 600 of the 1000 open advance to the newer one
        assertEquals(0, new BigDecimal("1000.00").compareTo(totalApplied));
        org.mockito.Mockito.verify(salesInvoiceRepo).findByInvoiceNumber("INV-OLD");
        org.mockito.Mockito.verify(salesInvoiceRepo).findByInvoiceNumber("INV-NEW");
    }

    @Test
    void leavesRemainderUnappliedWhenAdvanceExceedsOutstandingInvoices() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("1000.00"));
        when(receiptRepo.findByCustomerCodeAndPurposeOrderByDateAsc(
                eq("CUST-1"), eq(com.billbull.backend.financials.receiptvoucher.ReceiptPurpose.ADVANCE_RECEIVED)))
                .thenReturn(List.of(rv));
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(BigDecimal.ZERO);

        SalesInvoice onlyInvoice = invoice("INV-1", "CUST-1", new BigDecimal("300.00"));
        onlyInvoice.setInvoiceDate(LocalDate.of(2026, 1, 1));
        when(salesInvoiceRepo.findOutstandingByCustomerCodeOrderByInvoiceDateAsc("CUST-1"))
                .thenReturn(List.of(onlyInvoice));

        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-1")).thenReturn(Optional.of(onlyInvoice));
        when(applicationRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        BigDecimal totalApplied = service.applyAgainstOutstandingInvoices("CUST-1", 1L);

        // Only the 300 outstanding balance gets applied; the remaining 700 stays an open advance
        assertEquals(0, new BigDecimal("300.00").compareTo(totalApplied));
    }

    @Test
    void noOutstandingInvoicesLeavesAdvanceFullyOpen() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("500.00"));
        when(receiptRepo.findByCustomerCodeAndPurposeOrderByDateAsc(
                eq("CUST-1"), eq(com.billbull.backend.financials.receiptvoucher.ReceiptPurpose.ADVANCE_RECEIVED)))
                .thenReturn(List.of(rv));
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(BigDecimal.ZERO);
        when(salesInvoiceRepo.findOutstandingByCustomerCodeOrderByInvoiceDateAsc("CUST-1"))
                .thenReturn(List.of());

        BigDecimal totalApplied = service.applyAgainstOutstandingInvoices("CUST-1", 1L);

        assertEquals(0, BigDecimal.ZERO.compareTo(totalApplied));
        org.mockito.Mockito.verify(applicationRepo, org.mockito.Mockito.never()).save(any());
    }

    // ---- FIFO ordering plumbing ----

    @Test
    void findOpenAdvancesUsesDbLevelFifoOrdering() {
        when(receiptRepo.findByCustomerCodeAndPurposeOrderByDateAsc(
                eq("CUST-1"), eq(com.billbull.backend.financials.receiptvoucher.ReceiptPurpose.ADVANCE_RECEIVED)))
                .thenReturn(List.of(advance(1L, "CUST-1", new BigDecimal("500.00"))));
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(BigDecimal.ZERO);

        List<AdvanceApplicationService.AdvanceBalance> result = service.findOpenAdvances("CUST-1");

        assertEquals(1, result.size());
        org.mockito.Mockito.verify(receiptRepo)
                .findByCustomerCodeAndPurposeOrderByDateAsc(eq("CUST-1"), any());
        org.mockito.Mockito.verify(receiptRepo, org.mockito.Mockito.never())
                .findByCustomerCodeAndPurpose(any(), any());
    }
}
