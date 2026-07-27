package com.billbull.backend.pos.checkout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.web.server.ResponseStatusException;

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

    private SalesInvoice draftInvoice(long id, String number, String total) {
        SalesInvoice draft = new SalesInvoice();
        draft.setId(id);
        draft.setInvoiceNumber(number);
        draft.setInvoiceTotal(new BigDecimal(total));
        draft.setTaxTotal(BigDecimal.ZERO);
        draft.setInvoiceDate(LocalDate.now());
        draft.setStatus(SalesInvoiceStatus.DRAFT);
        return draft;
    }

    private PosCheckoutRequest.PosCardLeg cardLeg(String type, double amount, String reference) {
        PosCheckoutRequest.PosCardLeg leg = new PosCheckoutRequest.PosCardLeg();
        leg.setCardType(type);
        leg.setAmount(amount);
        leg.setReferenceNumber(reference);
        return leg;
    }

    @Test
    void multiCardCheckoutRecordsOnePaymentPerLegWithSharedSplitGroupIdAndCombinedMode() {
        SalesInvoice draft = draftInvoice(50L, "INV-2026-0050", "1000.00");
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(50L)).thenReturn(draft);

        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("card");
        req.setCardLegs(List.of(
                cardLeg("Visa", 300.0, "REF-1"),
                cardLeg("Mastercard", 450.0, "REF-2"),
                cardLeg("Amex", 250.0, "REF-3")));

        controller.checkout(req);

        verify(invoiceService).updateStatus(50L, SalesInvoiceStatus.PAID);

        ArgumentCaptor<String> splitGroupCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> combinedModeCaptor = ArgumentCaptor.forClass(String.class);
        verify(invoiceService).recordPayment(eq(50L), eq(300.0), eq("Visa"), eq("REF-1"),
                any(LocalDate.class), isNull(), isNull(), splitGroupCaptor.capture(), combinedModeCaptor.capture());
        verify(invoiceService).recordPayment(eq(50L), eq(450.0), eq("Mastercard"), eq("REF-2"),
                any(LocalDate.class), isNull(), isNull(), anyString(), anyString());
        verify(invoiceService).recordPayment(eq(50L), eq(250.0), eq("Amex"), eq("REF-3"),
                any(LocalDate.class), isNull(), isNull(), anyString(), anyString());

        // All three legs must share one splitGroupId and one combined-mode label.
        assertNotNull(splitGroupCaptor.getValue());
        assertEquals("Visa + Mastercard + Amex", combinedModeCaptor.getValue());
    }

    @Test
    void mixedCashAndTwoCardLegsShareOneSplitGroupId() {
        SalesInvoice draft = draftInvoice(51L, "INV-2026-0051", "1000.00");
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(51L)).thenReturn(draft);

        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("mixed");
        req.setCashAmount(400.0);
        req.setCardLegs(List.of(
                cardLeg("Visa", 350.0, null),
                cardLeg("Mastercard", 250.0, null)));

        controller.checkout(req);

        verify(invoiceService).recordPayment(eq(51L), eq(400.0), eq("Cash"),
                isNull(), any(LocalDate.class), isNull(), isNull(), anyString(), eq("Cash + Visa + Mastercard"));
        verify(invoiceService).recordPayment(eq(51L), eq(350.0), eq("Visa"),
                isNull(), any(LocalDate.class), isNull(), isNull(), anyString(), eq("Cash + Visa + Mastercard"));
        verify(invoiceService).recordPayment(eq(51L), eq(250.0), eq("Mastercard"),
                isNull(), any(LocalDate.class), isNull(), isNull(), anyString(), eq("Cash + Visa + Mastercard"));
    }

    @Test
    void singleLegCheckoutStillGetsNoSplitGroupId() {
        SalesInvoice draft = draftInvoice(52L, "INV-2026-0052", "3080.00");
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(52L)).thenReturn(draft);

        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("Cash");
        req.setAmountTendered(3080.0);

        controller.checkout(req);

        // Unchanged legacy behavior: a single-leg checkout passes a null splitGroupId.
        verify(invoiceService).recordPayment(eq(52L), eq(3080.0), eq("Cash"),
                isNull(), any(LocalDate.class), isNull(), isNull(), isNull(), isNull());
    }

    @Test
    void legacyScalarCardFieldsStillWorkWhenCardLegsAbsent() {
        SalesInvoice draft = draftInvoice(53L, "INV-2026-0053", "500.00");
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(53L)).thenReturn(draft);

        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("card");
        req.setCardAmount(500.0);
        req.setCardType("Visa");
        req.setCardReference("LEGACY-REF");

        controller.checkout(req);

        verify(invoiceService).recordPayment(eq(53L), eq(500.0), eq("Visa"), eq("LEGACY-REF"),
                any(LocalDate.class), isNull(), isNull(), isNull(), isNull());
    }

    @Test
    void cardLegMissingCardTypeIsRejectedBeforeInvoiceIsCreated() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("card");
        req.setCardLegs(List.of(cardLeg(null, 100.0, null), cardLeg("Visa", 900.0, null)));

        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
        verify(invoiceService, never()).save(any());
    }

    @Test
    void cardLegWithZeroAmountIsRejected() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("card");
        req.setCardLegs(List.of(cardLeg("Visa", 0.0, null), cardLeg("Mastercard", 1000.0, null)));

        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
        verify(invoiceService, never()).save(any());
    }

    @Test
    void duplicateReferenceNumbersAcrossCardLegsAreRejected() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("card");
        req.setCardLegs(List.of(
                cardLeg("Visa", 500.0, "DUP-1"),
                cardLeg("Mastercard", 500.0, "dup-1")));

        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
        verify(invoiceService, never()).save(any());
    }

    @Test
    void moreThanFiveCardLegsIsRejected() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("card");
        req.setCardLegs(List.of(
                cardLeg("Visa", 100.0, null), cardLeg("Visa", 100.0, null),
                cardLeg("Visa", 100.0, null), cardLeg("Visa", 100.0, null),
                cardLeg("Visa", 100.0, null), cardLeg("Visa", 100.0, null)));

        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
        verify(invoiceService, never()).save(any());
    }

    @Test
    void cardLegTotalMismatchOnNonCreditCheckoutIsRejectedAndDraftInvoiceIsCleanedUp() {
        SalesInvoice draft = draftInvoice(54L, "INV-2026-0054", "1000.00");
        when(invoiceService.save(any())).thenReturn(draft);

        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("card");
        // Legs only sum to 900 against a 1000 invoice — must be rejected, not silently truncated.
        req.setCardLegs(List.of(cardLeg("Visa", 500.0, null), cardLeg("Mastercard", 400.0, null)));

        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
        verify(invoiceService, never()).updateStatus(anyLong(), any());
        verify(invoiceService, never()).recordPayment(anyLong(), anyDouble(), anyString(),
                any(), any(), any(), any(), any(), any());
        verify(invoiceService).delete(54L);
    }

    @Test
    void cardLegPartialReceiptIsAllowedOnCreditCheckout() {
        SalesInvoice draft = draftInvoice(55L, "INV-2026-0055", "1000.00");
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(55L)).thenReturn(draft);

        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("credit");
        // Partial receipt against a Credit sale — legs need not sum to the full invoice total.
        req.setCardLegs(List.of(cardLeg("Visa", 300.0, null), cardLeg("Mastercard", 200.0, null)));

        controller.checkout(req);

        verify(invoiceService, times(2)).recordPayment(eq(55L), anyDouble(), anyString(),
                any(), any(LocalDate.class), isNull(), isNull(), anyString(), eq("Visa + Mastercard"));
    }
}
