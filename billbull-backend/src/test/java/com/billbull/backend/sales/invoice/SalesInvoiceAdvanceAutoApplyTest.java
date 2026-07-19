package com.billbull.backend.sales.invoice;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
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
import com.billbull.backend.sales.advance.AdvanceApplication;
import com.billbull.backend.sales.advance.AdvanceApplicationRepository;
import com.billbull.backend.sales.advance.AdvanceApplicationService;

/**
 * Covers the plan's Scenario B (FIFO multi-advance auto-apply): an invoice's
 * unmatched paid amount is applied against a customer's open advances oldest
 * first, fully consuming earlier ones before touching later ones.
 *
 * <p>Exercises the real {@link AdvanceApplicationService} (only its
 * repository/posting collaborators are mocked) wired into
 * {@link SalesInvoiceService#applyCustomerAdvances}, so both the FIFO
 * candidate ordering and the per-advance partial-application math are
 * genuinely covered end-to-end, not just asserted independently.
 */
class SalesInvoiceAdvanceAutoApplyTest {

    private final AdvanceApplicationRepository applicationRepo = mock(AdvanceApplicationRepository.class);
    private final ReceiptVoucherRepository receiptRepo = mock(ReceiptVoucherRepository.class);
    private final com.billbull.backend.sales.invoice.SalesInvoiceRepository salesInvoiceRepo =
            mock(com.billbull.backend.sales.invoice.SalesInvoiceRepository.class);
    private final PostingEngineService postingEngine = mock(PostingEngineService.class);
    private final com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService receiptVoucherService =
            mock(com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService.class);

    private final AdvanceApplicationService advanceApplicationService =
            new AdvanceApplicationService(applicationRepo, receiptRepo, salesInvoiceRepo, postingEngine, receiptVoucherService);

    private final SalesInvoiceService service = newServiceWithMockedDeps(advanceApplicationService);

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
    void fifoConsumesOlderAdvanceFirstThenPartiallyConsumesNext() {
        ReceiptVoucher advanceA = advance(1L, "CUST-1", new BigDecimal("500.00")); // older
        ReceiptVoucher advanceB = advance(2L, "CUST-1", new BigDecimal("700.00")); // newer
        SalesInvoice inv = invoice("INV-900", "CUST-1", new BigDecimal("900.00"));

        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(advanceA));
        when(receiptRepo.findByIdForUpdate(2L)).thenReturn(Optional.of(advanceB));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-900")).thenReturn(Optional.of(inv));
        when(applicationRepo.save(any())).thenAnswer(a -> a.getArgument(0));

        // findOpenAdvances(customerCode) is called once per candidate row inside
        // applyCustomerAdvances to look up that row's current open balance — it lists
        // both advances every time (the repo lookup is customer-scoped, not per-row).
        when(receiptRepo.findByCustomerCodeAndPurposeOrderByDateAsc("CUST-1", ReceiptPurpose.ADVANCE_RECEIVED))
                .thenReturn(List.of(advanceA, advanceB));

        // sumAppliedByReceiptId(1L) is read multiple times per advance-processing turn
        // (once by findOpenAdvances's balance calc, once by apply()'s own re-validation
        // under the lock) — stays 0 throughout advance A's own turn, then reflects the
        // full 500 once B's turn re-lists the customer's advances afterwards.
        when(applicationRepo.sumAppliedByReceiptId(1L))
                .thenReturn(BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("500.00"));
        when(applicationRepo.sumAppliedByReceiptId(2L)).thenReturn(BigDecimal.ZERO);

        List<ReceiptVoucher> candidates = List.of(advanceA, advanceB); // caller supplies FIFO order

        BigDecimal remaining = service.applyCustomerAdvances(inv, candidates, new BigDecimal("900.00"));

        // Advance A (500) fully consumed, Advance B partially consumed (400 of 700),
        // leaving Advance B with 300 open and nothing left uncovered on the invoice.
        assertEquals(0, BigDecimal.ZERO.compareTo(remaining));

        org.mockito.Mockito.verify(postingEngine)
                .createJournalFromAdvanceApplication(eqLong(1L), eqStr("INV-900"), eqAmount("500.00"), any());
        org.mockito.Mockito.verify(postingEngine)
                .createJournalFromAdvanceApplication(eqLong(2L), eqStr("INV-900"), eqAmount("400.00"), any());
    }

    @Test
    void appliesOpenAdvanceAgainstUnpaidInvoiceOutstandingBalanceEvenWithZeroCashCollected() {
        // Reproduces the reported symptom: invoice posted on credit (Paid = 0), customer
        // already has an open general advance sitting on account. The auto-apply must
        // still fire based on the invoice's outstanding BALANCE, not on cash collected
        // at this invoice's own creation (that's a separate, paid>0-gated code path).
        ReceiptVoucher advance = advance(1L, "CUST-1", new BigDecimal("1000.00"));
        SalesInvoice inv = invoice("INV-2800", "CUST-1", new BigDecimal("2800.00"));

        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(advance));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-2800")).thenReturn(Optional.of(inv));
        when(applicationRepo.save(any())).thenAnswer(a -> a.getArgument(0));
        when(receiptRepo.findByCustomerCodeAndPurposeOrderByDateAsc("CUST-1", ReceiptPurpose.ADVANCE_RECEIVED))
                .thenReturn(List.of(advance));
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(BigDecimal.ZERO);

        // No cash collected (paid = 0) — this is the exact case the invoice's own
        // outstanding balance (2800.00) is passed in, not the amount paid.
        BigDecimal remaining = service.applyCustomerAdvances(inv, List.of(advance), inv.getBalance());

        // Advance (1000) is smaller than the invoice balance, so it's fully consumed
        // and 1800.00 of the invoice remains genuinely unpaid.
        assertEquals(0, new BigDecimal("1800.00").compareTo(remaining));

        org.mockito.Mockito.verify(postingEngine)
                .createJournalFromAdvanceApplication(eqLong(1L), eqStr("INV-2800"), eqAmount("1000.00"), any());
        // Confirms the invoice-balance sync (amountPaid/balance/status) fires so the
        // invoice's own outstanding figure — and everything derived from it, like the
        // Customer List "Outstanding Balance" stat — reflects the applied advance.
        org.mockito.Mockito.verify(receiptVoucherService).syncInvoiceAfterAdvanceApplication(any());
    }

    private static Long eqLong(long v) { return org.mockito.ArgumentMatchers.eq(v); }
    private static String eqStr(String v) { return org.mockito.ArgumentMatchers.eq(v); }
    private static BigDecimal eqAmount(String v) {
        return org.mockito.ArgumentMatchers.argThat(bd -> bd != null && bd.compareTo(new BigDecimal(v)) == 0);
    }

    private static SalesInvoiceService newServiceWithMockedDeps(AdvanceApplicationService advanceApplicationService) {
        return new SalesInvoiceService(
                mock(SalesInvoiceRepository.class),
                mock(PostingEngineService.class),
                mock(com.billbull.backend.sales.delivery.DeliveryNoteService.class),
                mock(com.billbull.backend.sales.settings.SalesSettingsService.class),
                mock(com.billbull.backend.sales.settings.SalesDocumentNumberingService.class),
                mock(com.billbull.backend.inventory.stockavailability.StockAvailabilityService.class),
                mock(com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService.class),
                mock(ReceiptVoucherRepository.class),
                mock(com.billbull.backend.inventory.product.ProductRepository.class),
                mock(com.billbull.backend.inventory.product.ProductBarcodeRepository.class),
                mock(com.billbull.backend.inventory.product.ProductMediaRepository.class),
                mock(com.billbull.backend.inventory.product.ProductPackingRepository.class),
                mock(com.billbull.backend.sales.salesorder.SalesOrderRepository.class),
                mock(com.billbull.backend.sales.quotation.QuotationRepository.class),
                mock(com.billbull.backend.sales.delivery.DeliveryNoteRepository.class),
                mock(com.billbull.backend.sales.customerledger.CustomerRepository.class),
                mock(com.billbull.backend.sales.customerledger.OpeningInvoiceRepository.class),
                mock(com.billbull.backend.inventory.warehouse.WarehouseRepository.class),
                mock(com.billbull.backend.settings.branch.BranchRepository.class),
                mock(com.billbull.backend.settings.branch.BranchAccessService.class),
                new com.billbull.backend.common.ownership.OwnershipAccessService(
                        mock(com.billbull.backend.security.RolePermissionRepository.class), false),
                mock(com.billbull.backend.purchase.stockmovement.StockMovementRepository.class),
                mock(com.billbull.backend.inventory.warehouse.BinRepository.class),
                mock(com.billbull.backend.inventory.batch.BatchSelectionService.class),
                mock(com.billbull.backend.sales.payment.PaymentService.class),
                mock(com.billbull.backend.notification.NotificationEventPublisher.class),
                mock(com.billbull.backend.pos.dayclose.PosDayCloseRepository.class),
                advanceApplicationService,
                mock(com.billbull.backend.sales.invoice.history.SalesInvoiceHistoryService.class));
    }
}
