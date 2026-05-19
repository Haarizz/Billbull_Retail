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

    private PaymentService paymentService;

    @BeforeEach
    void setUp() {
        paymentService = new PaymentService();
        ReflectionTestUtils.setField(paymentService, "paymentRepository", paymentRepository);
        ReflectionTestUtils.setField(paymentService, "salesInvoiceRepository", salesInvoiceRepository);
        ReflectionTestUtils.setField(paymentService, "openingInvoiceRepository", openingInvoiceRepository);
        ReflectionTestUtils.setField(paymentService, "customerRepository", customerRepository);
        ReflectionTestUtils.setField(paymentService, "receiptVoucherService", receiptVoucherService);
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
        payment.setAmount(75.0);
        payment.setPaymentMode("Cash");
        payment.setStatus(PaymentStatus.COMPLETED);

        OpeningInvoice openingInvoice = new OpeningInvoice();
        openingInvoice.setId(9L);
        openingInvoice.setNumber("12");

        ReceiptVoucher savedReceipt = new ReceiptVoucher();
        savedReceipt.setId(77L);

        when(paymentRepository.save(any(Payment.class))).thenAnswer(invocation -> invocation.getArgument(0));
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
}
