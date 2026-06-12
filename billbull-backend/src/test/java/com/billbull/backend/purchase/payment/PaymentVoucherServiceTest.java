package com.billbull.backend.purchase.payment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.settings.branch.BranchAccessService;

@ExtendWith(MockitoExtension.class)
class PaymentVoucherServiceTest {

    @Mock
    private PaymentVoucherRepository repository;

    @Mock
    private PurchaseInvoiceRepository invoiceRepository;

    @Mock
    private PostingEngineService postingEngineService;

    @Mock
    private BranchAccessService branchAccessService;

    private PaymentVoucherService service;

    @BeforeEach
    void setUp() {
        service = new PaymentVoucherService();
        ReflectionTestUtils.setField(service, "repository", repository);
        ReflectionTestUtils.setField(service, "invoiceRepository", invoiceRepository);
        ReflectionTestUtils.setField(service, "postingEngineService", postingEngineService);
        ReflectionTestUtils.setField(service, "branchAccessService", branchAccessService);
    }

    @Test
    void approvingOnAccountVoucherPostsPaymentJournal() {
        PaymentVoucher voucher = new PaymentVoucher();
        voucher.setId(10L);
        voucher.setVoucherNumber("PV-10010");
        voucher.setVendorName("Global Electronics FZE");
        voucher.setPaymentDate(LocalDate.of(2026, 6, 12));
        voucher.setPaymentMode(PaymentMode.CASH);
        voucher.setAmount(new BigDecimal("993.75"));
        voucher.setStatus(PaymentStatus.PENDING_APPROVAL);

        when(repository.findById(10L)).thenReturn(Optional.of(voucher));
        when(repository.save(voucher)).thenReturn(voucher);

        PaymentVoucher saved = service.updateStatus(10L, PaymentStatus.POSTED);

        assertEquals(PaymentStatus.POSTED, saved.getStatus());
        verify(postingEngineService).createJournalFromPaymentVoucher(voucher, "Global Electronics FZE");
        verify(repository).save(voucher);
    }
}
