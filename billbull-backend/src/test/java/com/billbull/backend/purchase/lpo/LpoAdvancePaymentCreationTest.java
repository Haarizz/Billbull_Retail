package com.billbull.backend.purchase.lpo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.common.ownership.OwnershipAccessService;
import com.billbull.backend.purchase.payment.PaymentStatus;
import com.billbull.backend.purchase.payment.PaymentVoucher;
import com.billbull.backend.purchase.payment.PaymentVoucherRepository;
import com.billbull.backend.purchase.payment.PaymentVoucherService;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * An LPO advance used to be saved straight through the repository with no branch and a
 * self-minted {@code "PV-" + (10000 + id)} number. Both are financial defects: the voucher and
 * its journal carried a null branch and fell outside every branch-scoped report, and an
 * unchecked number could collide with one the numbering service had already issued — after
 * which {@code PostingEngineService.findDuplicate(ref)} matches the other voucher's journal on
 * approval and the advance silently never posts.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LpoAdvancePaymentCreationTest {

    @Mock private LpoRepository repository;
    @Mock private BranchAccessService branchAccessService;
    @Mock private OwnershipAccessService ownershipAccessService;
    @Mock private PaymentVoucherRepository paymentVoucherRepository;
    @Mock private PaymentVoucherService paymentVoucherService;

    @InjectMocks private LpoService service;

    /** A. The advance carries the LPO's branch, not whichever branch the caller is viewing. */
    @Test
    void advanceIsStampedWithTheLposOwnBranch() {
        Branch lpoBranch = branch(7L, "Deira");
        when(repository.findById(1L)).thenReturn(Optional.of(lpo(1L, 7L, lpoBranch)));
        when(paymentVoucherService.createVoucher(any(), any())).thenAnswer(i -> i.getArgument(0));

        service.createAdvancePayment(1L, payload("2500.00"));

        ArgumentCaptor<Branch> branchArg = ArgumentCaptor.forClass(Branch.class);
        verify(paymentVoucherService).createVoucher(any(PaymentVoucher.class), branchArg.capture());
        assertSame(lpoBranch, branchArg.getValue(), "the LPO's branch must win");
        verify(branchAccessService, never()).getRequiredCurrentUserBranch();
    }

    /** A (null case). A legacy LPO with no branch defers to the shared path's default. */
    @Test
    void anLpoWithoutABranchFallsBackRatherThanFailing() {
        when(repository.findById(2L)).thenReturn(Optional.of(lpo(2L, null, null)));
        when(paymentVoucherService.createVoucher(any(), any())).thenAnswer(i -> i.getArgument(0));

        service.createAdvancePayment(2L, payload("100.00"));

        ArgumentCaptor<Branch> branchArg = ArgumentCaptor.forClass(Branch.class);
        verify(paymentVoucherService).createVoucher(any(PaymentVoucher.class), branchArg.capture());
        assertNull(branchArg.getValue(), "null defers to the current user's branch downstream");
    }

    /**
     * B and C. Creation goes through the shared path, which is what allocates a
     * collision-checked number. The old code saved directly and assigned the number itself.
     */
    @Test
    void advanceIsCreatedThroughTheSharedPathAndNeverSelfNumbers() {
        when(repository.findById(3L)).thenReturn(Optional.of(lpo(3L, 7L, branch(7L, "Deira"))));
        when(paymentVoucherService.createVoucher(any(), any())).thenAnswer(i -> i.getArgument(0));

        PaymentVoucher created = service.createAdvancePayment(3L, payload("400.00"));

        verify(paymentVoucherService).createVoucher(any(PaymentVoucher.class), any());
        verify(paymentVoucherRepository, never()).save(any(PaymentVoucher.class));
        assertNull(created.getVoucherNumber(),
                "numbering belongs to PurchaseDocumentNumberingService, not to this method");
    }

    /** D. The advance stays pending; it is never auto-posted. */
    @Test
    void advanceRemainsPendingApproval() {
        when(repository.findById(4L)).thenReturn(Optional.of(lpo(4L, 7L, branch(7L, "Deira"))));
        when(paymentVoucherService.createVoucher(any(), any())).thenAnswer(i -> {
            PaymentVoucher v = i.getArgument(0);
            v.setStatus(PaymentStatus.PENDING_APPROVAL); // what the shared path stamps
            return v;
        });

        PaymentVoucher created = service.createAdvancePayment(4L, payload("750.00"));

        assertEquals(PaymentStatus.PENDING_APPROVAL, created.getStatus());
        verify(paymentVoucherService, never()).updateStatus(any(), any());
    }

    /** The advance keeps the LPO link and no invoice — the discriminator that selects 1105. */
    @Test
    void advanceKeepsLpoIdAndHasNoInvoice() {
        when(repository.findById(5L)).thenReturn(Optional.of(lpo(5L, 7L, branch(7L, "Deira"))));
        when(paymentVoucherService.createVoucher(any(), any())).thenAnswer(i -> i.getArgument(0));

        service.createAdvancePayment(5L, payload("900.00"));

        ArgumentCaptor<PaymentVoucher> voucherArg = ArgumentCaptor.forClass(PaymentVoucher.class);
        verify(paymentVoucherService).createVoucher(voucherArg.capture(), any());
        PaymentVoucher sent = voucherArg.getValue();
        assertEquals(5L, sent.getLpoId());
        assertNull(sent.getInvoiceId(), "an advance settles no invoice");
        assertNotNull(sent.getAmount());
    }

    // ── Fixtures ────────────────────────────────────────────────────────────

    private Map<String, Object> payload(String amount) {
        return Map.of("amount", amount, "mode", "CASH", "date", "2026-06-12");
    }

    private Branch branch(Long id, String name) {
        Branch b = new Branch();
        b.setId(id);
        b.setName(name);
        return b;
    }

    private Lpo lpo(Long id, Long branchId, Branch branch) {
        Lpo lpo = new Lpo();
        lpo.setId(id);
        lpo.setVendorName("Global Electronics FZE");
        lpo.setVendorCode("VND-001");
        lpo.setBranchId(branchId);
        ReflectionTestUtils.setField(lpo, "branch", branch);
        return lpo;
    }
}
