package com.billbull.backend.sales.invoice;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;

/**
 * Regression guard for the POS "invoice stays DRAFT / Paid=0 after a successful
 * payment" defect.
 *
 * <p>Root cause: POS checkout posted status/payment/delivery (and the auto-DN, stock
 * deduction and GL) in their own committed transactions, then archived the ZATCA
 * receipt QR by re-saving the <em>stale</em> in-memory invoice entity that had been
 * built as a DRAFT snapshot (amountPaid=null, status=DRAFT, deliveryStatus=PENDING).
 * The full-entity merge reverted every column the prior steps had committed.
 *
 * <p>The fix routes QR archival through {@link SalesInvoiceService#archiveReceiptQr},
 * which must persist the QR via a single-column UPDATE
 * ({@link SalesInvoiceRepository#updatePosReceiptQr}) and must NOT touch the entity
 * (no {@code save}, no {@code findById}+save). This test pins exactly that.
 */
class SalesInvoiceQrArchivalTest {

    @Test
    void archiveReceiptQrUpdatesOnlyTheQrColumnAndNeverSavesTheEntity() {
        SalesInvoiceRepository repo = mock(SalesInvoiceRepository.class);
        SalesInvoiceService service = newServiceWith(repo);

        service.archiveReceiptQr(42L, "ZATCA-QR-PAYLOAD");

        // Persists via the targeted single-column update...
        verify(repo).updatePosReceiptQr(42L, "ZATCA-QR-PAYLOAD");
        // ...and NEVER re-saves the (stale) invoice entity, which would clobber
        // the already-committed amountPaid / balance / status / deliveryStatus.
        verify(repo, never()).save(ArgumentMatchers.any());
        // It must not even re-read the entity for a save-back round-trip.
        verify(repo, never()).findById(ArgumentMatchers.anyLong());
    }

    // ------------------------------------------------------------------
    // Build a SalesInvoiceService with the given repo and all-mock deps.
    // ------------------------------------------------------------------
    private static SalesInvoiceService newServiceWith(SalesInvoiceRepository repo) {
        return new SalesInvoiceService(
                repo,
                mock(com.billbull.backend.financials.generalledger.postingengine.PostingEngineService.class),
                mock(com.billbull.backend.sales.delivery.DeliveryNoteService.class),
                mock(com.billbull.backend.sales.settings.SalesSettingsService.class),
                mock(com.billbull.backend.sales.settings.SalesDocumentNumberingService.class),
                mock(com.billbull.backend.inventory.stockavailability.StockAvailabilityService.class),
                mock(com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService.class),
                mock(com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository.class),
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
                mock(com.billbull.backend.purchase.stockmovement.StockMovementRepository.class),
                mock(com.billbull.backend.inventory.warehouse.BinRepository.class),
                mock(com.billbull.backend.inventory.batch.BatchSelectionService.class),
                mock(com.billbull.backend.sales.payment.PaymentService.class),
                mock(com.billbull.backend.notification.NotificationEventPublisher.class));
    }
}
