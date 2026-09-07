package com.billbull.backend.purchase.payment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
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
import com.billbull.backend.settings.branch.Branch;
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

    @Mock
    private com.billbull.backend.purchase.settings.PurchaseDocumentNumberingService documentNumberingService;

    private PaymentVoucherService service;

    @BeforeEach
    void setUp() {
        service = new PaymentVoucherService();
        ReflectionTestUtils.setField(service, "repository", repository);
        ReflectionTestUtils.setField(service, "invoiceRepository", invoiceRepository);
        ReflectionTestUtils.setField(service, "postingEngineService", postingEngineService);
        ReflectionTestUtils.setField(service, "branchAccessService", branchAccessService);
        ReflectionTestUtils.setField(service, "documentNumberingService", documentNumberingService);
        ReflectionTestUtils.setField(service, "ownershipAccessService",
                new com.billbull.backend.common.ownership.OwnershipAccessService(
                        org.mockito.Mockito.mock(com.billbull.backend.security.RolePermissionRepository.class), false));
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

    /**
     * E/F. An LPO advance carries an lpoId and no invoiceId. That pair is the discriminator
     * PostingEngineService uses to debit Vendor Advances Paid (1105) instead of Accounts
     * Payable, so it must survive to the posting call — and, with no invoice behind it, the
     * approval must not touch any invoice balance.
     */
    @Test
    void approvingAnLpoAdvancePostsAgainstTheLpoAndTouchesNoInvoice() {
        PaymentVoucher advance = new PaymentVoucher();
        advance.setId(20L);
        advance.setVoucherNumber("PV-0007");
        advance.setVendorName("Global Electronics FZE");
        advance.setPaymentDate(LocalDate.of(2026, 6, 12));
        advance.setPaymentMode(PaymentMode.CASH);
        advance.setAmount(new BigDecimal("2500.00"));
        advance.setStatus(PaymentStatus.PENDING_APPROVAL);
        advance.setLpoId(77L);

        when(repository.findById(20L)).thenReturn(Optional.of(advance));
        when(repository.save(advance)).thenReturn(advance);

        PaymentVoucher posted = service.updateStatus(20L, PaymentStatus.POSTED);

        assertEquals(PaymentStatus.POSTED, posted.getStatus());
        org.mockito.ArgumentCaptor<PaymentVoucher> sent =
                org.mockito.ArgumentCaptor.forClass(PaymentVoucher.class);
        verify(postingEngineService).createJournalFromPaymentVoucher(
                sent.capture(), org.mockito.ArgumentMatchers.eq("Global Electronics FZE"));
        assertEquals(77L, sent.getValue().getLpoId(), "lpoId selects the advance account");
        assertNull(sent.getValue().getInvoiceId(), "and no invoice may be implied");
        // F: nothing is read from or written to the invoice side.
        verifyNoInteractions(invoiceRepository);
    }

    /** Posting is idempotent: an already-POSTED voucher does not post a second journal. */
    @Test
    void reApprovingAnAlreadyPostedVoucherDoesNotPostTwice() {
        PaymentVoucher voucher = new PaymentVoucher();
        voucher.setId(21L);
        voucher.setStatus(PaymentStatus.POSTED);
        when(repository.findById(21L)).thenReturn(Optional.of(voucher));

        service.updateStatus(21L, PaymentStatus.POSTED);

        verifyNoInteractions(postingEngineService);
    }

    /** Rejecting posts nothing. */
    @Test
    void rejectingAVoucherPostsNoJournal() {
        PaymentVoucher voucher = new PaymentVoucher();
        voucher.setId(22L);
        voucher.setStatus(PaymentStatus.PENDING_APPROVAL);
        when(repository.findById(22L)).thenReturn(Optional.of(voucher));
        when(repository.save(voucher)).thenReturn(voucher);

        PaymentVoucher rejected = service.updateStatus(22L, PaymentStatus.REJECTED);

        assertEquals(PaymentStatus.REJECTED, rejected.getStatus());
        verifyNoInteractions(postingEngineService);
        verifyNoInteractions(invoiceRepository);
    }

    /**
     * G. The screen-driven creation path is unchanged: no branch override means the current
     * user's branch, and the number still comes from the numbering service.
     */
    @Test
    void normalCreationStillUsesTheCurrentUsersBranch() {
        Branch userBranch = new Branch();
        userBranch.setId(3L);
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(userBranch);
        when(documentNumberingService.resolveNumberForCreate(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenReturn("PV-0001");
        PaymentVoucher voucher = new PaymentVoucher();
        voucher.setAmount(new BigDecimal("50.00"));
        when(repository.save(voucher)).thenReturn(voucher);

        PaymentVoucher created = service.createVoucher(voucher);

        assertEquals(userBranch, created.getBranch());
        assertEquals("PV-0001", created.getVoucherNumber());
        assertEquals(PaymentStatus.PENDING_APPROVAL, created.getStatus());
    }

    /**
     * A/B. The LPO advance path supplies the branch it already knows, and the number still
     * comes from the numbering service rather than being minted by the caller.
     */
    @Test
    void aBranchOverrideWinsAndTheNumberStillComesFromTheNumberingService() {
        Branch lpoBranch = new Branch();
        lpoBranch.setId(9L);
        when(documentNumberingService.resolveNumberForCreate(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenReturn("PV-0042");
        PaymentVoucher voucher = new PaymentVoucher();
        voucher.setAmount(new BigDecimal("2500.00"));
        voucher.setLpoId(77L);
        when(repository.save(voucher)).thenReturn(voucher);

        PaymentVoucher created = service.createVoucher(voucher, lpoBranch);

        assertEquals(lpoBranch, created.getBranch(), "the override wins");
        assertEquals("PV-0042", created.getVoucherNumber());
        assertEquals(PaymentStatus.PENDING_APPROVAL, created.getStatus());
        assertEquals(new BigDecimal("2500.00"), created.getUnallocated());
        verify(branchAccessService, org.mockito.Mockito.never()).getRequiredCurrentUserBranch();
    }
}
