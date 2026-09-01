package com.billbull.backend.sales.payment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.receiptvoucher.ReceiptPurpose;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.customerledger.OpeningInvoice;
import com.billbull.backend.sales.customerledger.OpeningInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.settings.SalesDocumentNumberingService;
import com.billbull.backend.sales.settings.SalesDocumentType;

@ExtendWith(MockitoExtension.class)
class PaymentServiceTest {

    @Mock
    private PaymentRepository paymentRepository;

    @Mock
    private SalesInvoiceRepository salesInvoiceRepository;

    @Mock
    private OpeningInvoiceRepository openingInvoiceRepository;

    @Mock
    private CustomerRepository customerRepository;

    @Mock
    private ReceiptVoucherService receiptVoucherService;

    @Mock
    private SalesDocumentNumberingService numberingService;

    @Mock
    private com.billbull.backend.settings.branch.BranchAccessService branchAccessService;

    @Mock
    private com.billbull.backend.notification.NotificationEventPublisher notifPublisher;

    @Mock
    private com.billbull.backend.sales.advance.AdvanceApplicationService advanceApplicationService;

    @Mock
    private com.billbull.backend.sales.invoice.history.SalesInvoiceHistoryService invoiceHistoryService;

    @Mock
    private com.billbull.backend.pos.session.PosDrawerSessionValidator drawerSessionValidator;

    private PaymentService paymentService;

    @BeforeEach
    void setUp() {
        paymentService = new PaymentService();
        ReflectionTestUtils.setField(paymentService, "paymentRepository", paymentRepository);
        ReflectionTestUtils.setField(paymentService, "salesInvoiceRepository", salesInvoiceRepository);
        ReflectionTestUtils.setField(paymentService, "openingInvoiceRepository", openingInvoiceRepository);
        ReflectionTestUtils.setField(paymentService, "customerRepository", customerRepository);
        ReflectionTestUtils.setField(paymentService, "receiptVoucherService", receiptVoucherService);
        ReflectionTestUtils.setField(paymentService, "numberingService", numberingService);
        ReflectionTestUtils.setField(paymentService, "branchAccessService", branchAccessService);
        ReflectionTestUtils.setField(paymentService, "ownershipAccessService",
                new com.billbull.backend.common.ownership.OwnershipAccessService(
                        org.mockito.Mockito.mock(com.billbull.backend.security.RolePermissionRepository.class), false));
        ReflectionTestUtils.setField(paymentService, "notifPublisher", notifPublisher);
        ReflectionTestUtils.setField(paymentService, "advanceApplicationService", advanceApplicationService);
        ReflectionTestUtils.setField(paymentService, "invoiceHistoryService", invoiceHistoryService);
        ReflectionTestUtils.setField(paymentService, "drawerSessionValidator", drawerSessionValidator);
    }

    // ── POS drawer attribution (Cross-module cash reconciliation, release 1 item 1) ────────
    //
    // A customer credit receipt taken at a till is physical cash entering that drawer, so it
    // must reach the collecting session's Expected Cash. Before this path existed, the POS
    // Customer view posted through this same service with no way to say which drawer took the
    // money -- Payment.posSessionId is READ_ONLY to Jackson -- so the cash was invisible to
    // reconciliation and every such receipt produced a false shortage at close.

    /** A helper Payment shaped like the POS Customer view's cash receipt. */
    private Payment posCashReceipt() {
        Payment payment = new Payment();
        payment.setPaymentNumber("PAY-2026-0900");
        payment.setPaymentDate(LocalDate.of(2026, 8, 31));
        payment.setPaymentType(PaymentType.RECEIVED);
        payment.setCustomerCode("CUST-900");
        payment.setCustomerName("Walk-in Credit Customer");
        payment.setAmount(new java.math.BigDecimal("250.00"));
        payment.setPaymentMode("Cash");
        payment.setStatus(PaymentStatus.COMPLETED);
        return payment;
    }

    private void stubBareSave(String number) {
        when(paymentRepository.save(any(Payment.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(numberingService.resolveNumberForCreate(SalesDocumentType.SALES_PAYMENT, number)).thenReturn(number);
        when(receiptVoucherService.createReceipt(any(ReceiptVoucher.class), any())).thenReturn(null);
    }

    @Test
    void declaredPosSessionIsValidatedAndStampedOnTheTender() {
        Payment payment = posCashReceipt();
        stubBareSave("PAY-2026-0900");

        com.billbull.backend.pos.session.PosSession session = new com.billbull.backend.pos.session.PosSession();
        ReflectionTestUtils.setField(session, "id", 4242L);
        when(drawerSessionValidator.requireOpenDrawerSession(eq(4242L), any())).thenReturn(session);

        Payment saved = paymentService.savePayment(payment, 4242L);

        assertEquals(4242L, saved.getPosSessionId(),
                "cash collected at a till must carry the collecting drawer session");
        verify(drawerSessionValidator).requireOpenDrawerSession(eq(4242L), any());
    }

    @Test
    void backOfficeReceiptWithNoDeclaredSessionIsNeverAttributedToADrawer() {
        Payment payment = posCashReceipt();
        stubBareSave("PAY-2026-0900");

        Payment saved = paymentService.savePayment(payment, null);

        assertNull(saved.getPosSessionId(),
                "a receipt with no declared drawer must stay out of POS reconciliation");
        // The critical half: no session is discovered from terminal, branch, cashier or
        // "whatever is currently open". The validator is not consulted at all.
        verify(drawerSessionValidator, never()).requireOpenDrawerSession(any(), any());
    }

    @Test
    void editingAPaymentPreservesItsOriginalDrawerAttribution() {
        // The entity arriving from client JSON always has posSessionId == null (READ_ONLY), so
        // without carrying the stored value forward an ordinary edit would erase the drawer
        // attribution and move the amount out of that session's Expected Cash.
        Payment edited = posCashReceipt();
        edited.setId(55L);

        Payment stored = posCashReceipt();
        stored.setId(55L);
        stored.setPosSessionId(4242L);

        when(paymentRepository.findById(55L)).thenReturn(Optional.of(stored));
        when(paymentRepository.save(any(Payment.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(numberingService.resolveNumberForUpdate(SalesDocumentType.SALES_PAYMENT, "PAY-2026-0900", "PAY-2026-0900"))
                .thenReturn("PAY-2026-0900");
        when(receiptVoucherService.createReceipt(any(ReceiptVoucher.class), any())).thenReturn(null);

        Payment saved = paymentService.savePayment(edited, null);

        assertEquals(4242L, saved.getPosSessionId());
    }

    @Test
    void reattributingCollectedCashToADifferentDrawerIsRefused() {
        Payment edited = posCashReceipt();
        edited.setId(55L);

        Payment stored = posCashReceipt();
        stored.setId(55L);
        stored.setPosSessionId(4242L);

        when(paymentRepository.findById(55L)).thenReturn(Optional.of(stored));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> paymentService.savePayment(edited, 9999L));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verify(paymentRepository, never()).save(any(Payment.class));
    }

    @Test
    void savePaymentForOpeningInvoiceCreatesReceiptAgainstAccountsReceivable() {
        Payment payment = new Payment();
        payment.setPaymentNumber("PAY-2026-0001");
        payment.setPaymentDate(LocalDate.of(2026, 5, 19));
        payment.setPaymentType(PaymentType.RECEIVED);
        payment.setCustomerCode("CUST-001");
        payment.setCustomerName("Acme Trading");
        payment.setLinkedInvoice("12");
        payment.setAmount(new java.math.BigDecimal("75.0"));
        payment.setPaymentMode("Cash");
        payment.setStatus(PaymentStatus.COMPLETED);

        OpeningInvoice openingInvoice = new OpeningInvoice();
        openingInvoice.setId(9L);
        openingInvoice.setNumber("12");

        ReceiptVoucher savedReceipt = new ReceiptVoucher();
        savedReceipt.setId(77L);

        when(paymentRepository.save(any(Payment.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(numberingService.resolveNumberForCreate(SalesDocumentType.SALES_PAYMENT, "PAY-2026-0001"))
                .thenReturn("PAY-2026-0001");
        when(salesInvoiceRepository.findByInvoiceNumber("12")).thenReturn(Optional.empty());
        when(openingInvoiceRepository.findByCustomer_Code("CUST-001")).thenReturn(List.of(openingInvoice));
        when(receiptVoucherService.createReceipt(any(ReceiptVoucher.class), any())).thenReturn(savedReceipt);

        Payment saved = paymentService.savePayment(payment);

        ArgumentCaptor<ReceiptVoucher> receiptCaptor = ArgumentCaptor.forClass(ReceiptVoucher.class);
        verify(receiptVoucherService).createReceipt(receiptCaptor.capture(), any());

        ReceiptVoucher receipt = receiptCaptor.getValue();
        assertEquals(ReceiptPurpose.AGAINST_INVOICE, receipt.getPurpose());
        assertNull(receipt.getSalesInvoiceId());
        assertEquals(9L, receipt.getOpeningInvoiceId());
        assertEquals(77L, saved.getReceiptVoucherRecordId());
    }

    // ---------------------------------------------------------------------
    // General "Customer Receipt" (no invoice picked) must settle the
    // customer's existing outstanding balance immediately, not just sit as
    // an unapplied advance until some future invoice happens to be saved.
    // ---------------------------------------------------------------------

    @Test
    void generalReceiptWithNoLinkedInvoiceAppliesAgainstOutstandingBalance() {
        Payment payment = new Payment();
        payment.setPaymentNumber("PAY-2026-0010");
        payment.setPaymentDate(LocalDate.of(2026, 6, 1));
        payment.setPaymentType(PaymentType.RECEIVED);
        payment.setCustomerCode("CUST-100");
        payment.setCustomerName("Walk-in Co");
        payment.setAmount(new java.math.BigDecimal("500.0"));
        payment.setPaymentMode("Cash");
        payment.setStatus(PaymentStatus.COMPLETED);
        // No linkedInvoice — this is a general receipt against outstanding balance.

        ReceiptVoucher savedReceipt = new ReceiptVoucher();
        savedReceipt.setId(88L);
        savedReceipt.setCustomerCode("CUST-100");
        savedReceipt.setStatus("Completed");

        when(paymentRepository.save(any(Payment.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(numberingService.resolveNumberForCreate(SalesDocumentType.SALES_PAYMENT, "PAY-2026-0010"))
                .thenReturn("PAY-2026-0010");
        when(receiptVoucherService.createReceipt(any(ReceiptVoucher.class), any())).thenReturn(savedReceipt);
        when(receiptVoucherService.isCompletedStatus("Completed")).thenReturn(true);

        paymentService.savePayment(payment);

        ArgumentCaptor<ReceiptVoucher> receiptCaptor = ArgumentCaptor.forClass(ReceiptVoucher.class);
        verify(receiptVoucherService).createReceipt(receiptCaptor.capture(), any());
        assertEquals(ReceiptPurpose.ADVANCE_RECEIVED, receiptCaptor.getValue().getPurpose());
        assertNull(receiptCaptor.getValue().getSalesInvoiceId());

        verify(advanceApplicationService).applyAgainstOutstandingInvoices("CUST-100", 88L);
    }

    @Test
    void receiptLinkedToInvoiceDoesNotTriggerOutstandingBalanceSweep() {
        Payment payment = new Payment();
        payment.setPaymentNumber("PAY-2026-0011");
        payment.setPaymentDate(LocalDate.of(2026, 6, 1));
        payment.setPaymentType(PaymentType.RECEIVED);
        payment.setCustomerCode("CUST-101");
        payment.setLinkedInvoice("INV-500");
        payment.setAmount(new java.math.BigDecimal("120.0"));
        payment.setPaymentMode("Cash");
        payment.setStatus(PaymentStatus.COMPLETED);

        com.billbull.backend.sales.invoice.SalesInvoice invoice =
                new com.billbull.backend.sales.invoice.SalesInvoice();
        invoice.setId(5L);
        invoice.setInvoiceNumber("INV-500");
        invoice.setCustomerCode("CUST-101");

        ReceiptVoucher savedReceipt = new ReceiptVoucher();
        savedReceipt.setId(89L);
        savedReceipt.setCustomerCode("CUST-101");
        savedReceipt.setSalesInvoiceId(5L);
        savedReceipt.setStatus("Completed");

        when(paymentRepository.save(any(Payment.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(numberingService.resolveNumberForCreate(SalesDocumentType.SALES_PAYMENT, "PAY-2026-0011"))
                .thenReturn("PAY-2026-0011");
        when(salesInvoiceRepository.findByInvoiceNumber("INV-500")).thenReturn(Optional.of(invoice));
        when(receiptVoucherService.createReceipt(any(ReceiptVoucher.class), any())).thenReturn(savedReceipt);

        paymentService.savePayment(payment);

        verify(advanceApplicationService, org.mockito.Mockito.never())
                .applyAgainstOutstandingInvoices(any(), any());
    }

    // ---------------------------------------------------------------------
    // recomputeInvoiceBalances() — running remaining-balance fold.
    // Characterization: pins the per-payment invoiceBalance math so the
    // Double -> BigDecimal flip is provably behaviour-preserving. Reached
    // through the public getPaymentsByInvoice() entry point. All figures are
    // exactly representable, so assertions hold identically before/after.
    // ---------------------------------------------------------------------

    @Test
    void recomputeAssignsRunningBalanceNewestEqualsTerminal() {
        // Two payments on invoice "100"; current DB invoice balance (terminal) = 30.
        // Newest payment's invoiceBalance = terminal (30); older = terminal + newest.amount.
        Payment newest = paymentOnInvoice("PAY-0002", LocalDate.of(2026, 5, 20), "100", "40.0");
        Payment older  = paymentOnInvoice("PAY-0001", LocalDate.of(2026, 5, 10), "100", "30.0");

        when(paymentRepository.findByLinkedInvoice("100")).thenReturn(List.of(newest, older));
        com.billbull.backend.sales.invoice.SalesInvoice inv =
                new com.billbull.backend.sales.invoice.SalesInvoice();
        inv.setBalance(bd("30.0"));
        when(salesInvoiceRepository.findByInvoiceNumber("100")).thenReturn(Optional.of(inv));

        List<Payment> result = paymentService.getPaymentsByInvoice("100");

        // newest first after desc sort
        assertMoney(30.0, byNumber(result, "PAY-0002").getInvoiceBalance()); // = terminal
        assertMoney(70.0, byNumber(result, "PAY-0001").getInvoiceBalance()); // terminal + 40
    }

    @Test
    void recomputeClampsNegativeBalanceToZero() {
        // Terminal balance 0; the fold must never produce a negative invoiceBalance.
        Payment only = paymentOnInvoice("PAY-0001", LocalDate.of(2026, 5, 10), "200", "50.0");
        when(paymentRepository.findByLinkedInvoice("200")).thenReturn(List.of(only));
        com.billbull.backend.sales.invoice.SalesInvoice inv =
                new com.billbull.backend.sales.invoice.SalesInvoice();
        inv.setBalance(bd("0.0"));
        when(salesInvoiceRepository.findByInvoiceNumber("200")).thenReturn(Optional.of(inv));

        List<Payment> result = paymentService.getPaymentsByInvoice("200");

        assertMoney(0.0, byNumber(result, "PAY-0001").getInvoiceBalance());
    }

    @Test
    void recomputeTreatsNullInvoiceBalanceAndNullAmountAsZero() {
        Payment newest = paymentOnInvoice("PAY-0002", LocalDate.of(2026, 5, 20), "300", null); // null amount
        Payment older  = paymentOnInvoice("PAY-0001", LocalDate.of(2026, 5, 10), "300", "25.0");
        when(paymentRepository.findByLinkedInvoice("300")).thenReturn(List.of(newest, older));
        com.billbull.backend.sales.invoice.SalesInvoice inv =
                new com.billbull.backend.sales.invoice.SalesInvoice();
        inv.setBalance(null); // terminal coalesces to 0
        when(salesInvoiceRepository.findByInvoiceNumber("300")).thenReturn(Optional.of(inv));

        List<Payment> result = paymentService.getPaymentsByInvoice("300");

        assertMoney(0.0, byNumber(result, "PAY-0002").getInvoiceBalance());  // terminal 0
        assertMoney(0.0, byNumber(result, "PAY-0001").getInvoiceBalance());  // terminal 0 + null-amount(0)
    }

    @Test
    void recomputeWhenInvoiceMissingUsesZeroTerminal() {
        Payment newest = paymentOnInvoice("PAY-0002", LocalDate.of(2026, 5, 20), "404", "10.0");
        Payment older  = paymentOnInvoice("PAY-0001", LocalDate.of(2026, 5, 10), "404", "15.0");
        when(paymentRepository.findByLinkedInvoice("404")).thenReturn(List.of(newest, older));
        when(salesInvoiceRepository.findByInvoiceNumber("404")).thenReturn(Optional.empty());

        List<Payment> result = paymentService.getPaymentsByInvoice("404");

        assertMoney(0.0,  byNumber(result, "PAY-0002").getInvoiceBalance()); // terminal 0
        assertMoney(10.0, byNumber(result, "PAY-0001").getInvoiceBalance()); // 0 + newest amount 10
    }

    // ---------------------------------------------------------------------
    // deletePayment() — 2026-08-29 incident hardening. A Payment whose
    // receiptVoucherRecordId is unset can still have a real, GL-posted Receipt
    // Voucher linked to the same invoice; deleting it in that state used to
    // silently orphan the voucher. These pin the new guard's three branches.
    // ---------------------------------------------------------------------

    @Test
    void deletePaymentUsesReceiptVoucherRecordIdWhenPresent() {
        Payment payment = new Payment();
        payment.setId(1L);
        payment.setPaymentType(PaymentType.RECEIVED);
        payment.setReceiptVoucherRecordId(55L);

        when(paymentRepository.findById(1L)).thenReturn(Optional.of(payment));

        paymentService.deletePayment(1L);

        verify(receiptVoucherService).deleteReceipt(55L);
        verify(receiptVoucherService, never()).hasCompletedReceiptForInvoice(any());
        verify(paymentRepository).delete(payment);
    }

    @Test
    void deletePaymentProceedsWhenNoCompletedReceiptExistsForInvoice() {
        Payment payment = new Payment();
        payment.setId(2L);
        payment.setPaymentType(PaymentType.RECEIVED);
        payment.setLinkedInvoice("INV-700");
        payment.setReceiptVoucherRecordId(null);

        SalesInvoice invoice = new SalesInvoice();
        invoice.setId(70L);
        invoice.setInvoiceNumber("INV-700");

        when(paymentRepository.findById(2L)).thenReturn(Optional.of(payment));
        when(paymentRepository.findByLinkedInvoice("INV-700")).thenReturn(List.of(payment));
        when(salesInvoiceRepository.findByInvoiceNumber("INV-700")).thenReturn(Optional.of(invoice));
        when(receiptVoucherService.hasCompletedReceiptForInvoice(70L)).thenReturn(false);

        paymentService.deletePayment(2L);

        verify(paymentRepository).delete(payment);
        verify(receiptVoucherService, never()).deleteReceipt(any());
    }

    @Test
    void deletePaymentBlockedWhenOrphanedCompletedReceiptExists() {
        Payment payment = new Payment();
        payment.setId(3L);
        payment.setPaymentType(PaymentType.RECEIVED);
        payment.setLinkedInvoice("INV-701");
        payment.setReceiptVoucherRecordId(null);

        SalesInvoice invoice = new SalesInvoice();
        invoice.setId(71L);
        invoice.setInvoiceNumber("INV-701");

        when(paymentRepository.findById(3L)).thenReturn(Optional.of(payment));
        when(paymentRepository.findByLinkedInvoice("INV-701")).thenReturn(List.of(payment));
        when(salesInvoiceRepository.findByInvoiceNumber("INV-701")).thenReturn(Optional.of(invoice));
        when(receiptVoucherService.hasCompletedReceiptForInvoice(71L)).thenReturn(true);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> paymentService.deletePayment(3L));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());

        verify(paymentRepository, never()).delete(any());
    }

    @Test
    void deletePaymentSkipsGuardForMadeTypePayments() {
        // A vendor/refund-leg payment (paymentType = MADE) is never paired with an
        // AGAINST_INVOICE receipt voucher the way a RECEIVED payment is — the guard
        // must not apply to it, even with no receiptVoucherRecordId and a linked invoice.
        Payment payment = new Payment();
        payment.setId(4L);
        payment.setPaymentType(PaymentType.MADE);
        payment.setLinkedInvoice("INV-702");
        payment.setReceiptVoucherRecordId(null);

        when(paymentRepository.findById(4L)).thenReturn(Optional.of(payment));
        when(paymentRepository.findByLinkedInvoice("INV-702")).thenReturn(List.of(payment));
        when(salesInvoiceRepository.findByInvoiceNumber("INV-702")).thenReturn(Optional.empty());

        paymentService.deletePayment(4L);

        verify(paymentRepository).delete(payment);
        verify(receiptVoucherService, never()).hasCompletedReceiptForInvoice(any());
    }

    // ----- helpers -----

    private static java.math.BigDecimal bd(String v) { return new java.math.BigDecimal(v); }

    /** Asserts a money value by numeric value (scale-independent): 30 == 30.00. */
    private static void assertMoney(double expected, java.math.BigDecimal actual) {
        assertEquals(0, java.math.BigDecimal.valueOf(expected).compareTo(actual),
                () -> "expected " + expected + " but was " + actual);
    }

    private static Payment byNumber(List<Payment> payments, String number) {
        return payments.stream().filter(p -> number.equals(p.getPaymentNumber())).findFirst().orElseThrow();
    }

    /** {@code amount} may be null to exercise the null-coalescing path. */
    private static Payment paymentOnInvoice(String number, LocalDate date, String invoice, String amount) {
        Payment p = new Payment();
        p.setPaymentNumber(number);
        p.setPaymentDate(date);
        p.setLinkedInvoice(invoice);
        p.setAmount(amount != null ? bd(amount) : null);
        return p;
    }
}
