package com.billbull.backend.sales.advance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.financials.receiptvoucher.ReceiptPurpose;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;

/**
 * Covers the historical-data reconciliation gap: advances recorded before
 * apply() was reachable (see StatementService.excludeFromBalance) now get
 * applied against the customer's oldest outstanding invoices FIFO, via the
 * exact same AdvanceApplicationService.apply() path new invoices use.
 */
class AdvanceBackfillServiceTest {

    private final ReceiptVoucherRepository receiptRepo = mock(ReceiptVoucherRepository.class);
    private final SalesInvoiceRepository salesInvoiceRepo = mock(SalesInvoiceRepository.class);
    private final AdvanceApplicationRepository applicationRepo = mock(AdvanceApplicationRepository.class);
    private final PostingEngineService postingEngine = mock(PostingEngineService.class);
    private final com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService receiptVoucherService =
            mock(com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService.class);

    private final AdvanceApplicationService advanceApplicationService =
            new AdvanceApplicationService(applicationRepo, receiptRepo, salesInvoiceRepo, postingEngine, receiptVoucherService);

    private final AdvanceBackfillService backfillService =
            new AdvanceBackfillService(receiptRepo, salesInvoiceRepo, advanceApplicationService);

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
        inv.setInvoiceDate(LocalDate.now());
        return inv;
    }

    @Test
    void appliesOpenAdvanceAgainstOldestOutstandingInvoiceForCustomer() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("1000.00"));
        SalesInvoice inv = invoice("INV-1", "CUST-1", new BigDecimal("3080.00"));

        when(receiptRepo.findByCustomerCodeAndPurposeOrderByDateAsc("CUST-1", ReceiptPurpose.ADVANCE_RECEIVED))
                .thenReturn(List.of(rv));
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(BigDecimal.ZERO);
        when(salesInvoiceRepo.findOutstandingByCustomerCodeOrderByInvoiceDateAsc("CUST-1"))
                .thenReturn(List.of(inv));
        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-1")).thenReturn(Optional.of(inv));
        when(applicationRepo.save(any())).thenAnswer(a -> a.getArgument(0));

        AdvanceBackfillService.CustomerBackfillResult result = backfillService.runForCustomer("CUST-1");

        assertEquals(0, new BigDecimal("1000.00").compareTo(result.totalApplied()));
        assertEquals(1, result.applicationsCreated());
        org.mockito.Mockito.verify(postingEngine)
                .createJournalFromAdvanceApplication(org.mockito.ArgumentMatchers.eq(1L),
                        org.mockito.ArgumentMatchers.eq("INV-1"),
                        org.mockito.ArgumentMatchers.argThat(a -> a.compareTo(new BigDecimal("1000.00")) == 0),
                        any());
    }

    @Test
    void skipsCustomerWithNoOutstandingInvoicesEvenIfAdvanceIsOpen() {
        ReceiptVoucher rv = advance(1L, "CUST-2", new BigDecimal("500.00"));
        when(receiptRepo.findByCustomerCodeAndPurposeOrderByDateAsc("CUST-2", ReceiptPurpose.ADVANCE_RECEIVED))
                .thenReturn(List.of(rv));
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(BigDecimal.ZERO);
        when(salesInvoiceRepo.findOutstandingByCustomerCodeOrderByInvoiceDateAsc("CUST-2"))
                .thenReturn(List.of());

        AdvanceBackfillService.CustomerBackfillResult result = backfillService.runForCustomer("CUST-2");

        assertEquals(0, BigDecimal.ZERO.compareTo(result.totalApplied()));
        assertEquals(0, result.applicationsCreated());
    }
}
