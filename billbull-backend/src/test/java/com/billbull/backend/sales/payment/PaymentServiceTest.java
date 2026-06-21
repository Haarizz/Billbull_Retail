package com.billbull.backend.sales.payment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
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
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.financials.receiptvoucher.ReceiptPurpose;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.customerledger.OpeningInvoice;
import com.billbull.backend.sales.customerledger.OpeningInvoiceRepository;
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
        ReflectionTestUtils.setField(paymentService, "notifPublisher", notifPublisher);
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
