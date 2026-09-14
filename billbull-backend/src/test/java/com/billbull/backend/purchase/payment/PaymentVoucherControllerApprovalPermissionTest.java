package com.billbull.backend.purchase.payment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;

/**
 * A payment-voucher status change is an approval decision, not an edit: POSTED applies the
 * payment to the invoice and posts the journal, REJECTED declines it. These pin the endpoint to
 * {@code requireCanApprove}, because gating it on {@code canEdit} inverted the seeded role model
 * (MANAGER approves purchases but cannot edit; INVENTORY_MANAGER edits but does not approve).
 */
@ExtendWith(MockitoExtension.class)
class PaymentVoucherControllerApprovalPermissionTest {

    private static final String MODULE = "purchases.payment";

    @Mock private PaymentVoucherService service;
    @Mock private AuditLogService auditLogService;
    @Mock private ModulePermissionService modulePermissionService;

    @InjectMocks private PaymentVoucherController controller;

    @Test
    void anApproverCanPostAVoucher() {
        when(service.updateStatus(1L, PaymentStatus.POSTED)).thenReturn(voucher(1L, "PV-10001", PaymentStatus.POSTED));

        var response = controller.updateStatus(1L, "POSTED");

        assertEquals(200, response.getStatusCode().value());
        verify(modulePermissionService).requireCanApprove(MODULE);
        verify(service).updateStatus(1L, PaymentStatus.POSTED);
    }

    @Test
    void anApproverCanRejectAVoucher() {
        when(service.updateStatus(2L, PaymentStatus.REJECTED))
                .thenReturn(voucher(2L, "PV-10002", PaymentStatus.REJECTED));

        var response = controller.updateStatus(2L, "REJECTED");

        assertEquals(200, response.getStatusCode().value());
        verify(modulePermissionService).requireCanApprove(MODULE);
        verify(service).updateStatus(2L, PaymentStatus.REJECTED);
    }

    /**
     * The edit-only role. The denial must happen before the service is reached, so no journal is
     * posted and no payment is applied to the invoice.
     */
    @Test
    void anEditOnlyUserCannotPostAVoucher() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanApprove(MODULE);

        assertThrows(AccessDeniedException.class, () -> controller.updateStatus(1L, "POSTED"));

        verify(service, never()).updateStatus(any(), any());
    }

    @Test
    void anEditOnlyUserCannotRejectAVoucher() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanApprove(MODULE);

        assertThrows(AccessDeniedException.class, () -> controller.updateStatus(2L, "REJECTED"));

        verify(service, never()).updateStatus(any(), any());
    }

    /** The endpoint must no longer accept a bare edit right as sufficient. */
    @Test
    void theEndpointDoesNotGateOnEdit() {
        when(service.updateStatus(eq(1L), any())).thenReturn(voucher(1L, "PV-10001", PaymentStatus.POSTED));

        controller.updateStatus(1L, "POSTED");

        verify(modulePermissionService, never()).requireCanEdit(MODULE);
    }

    private PaymentVoucher voucher(Long id, String number, PaymentStatus status) {
        PaymentVoucher v = new PaymentVoucher();
        v.setId(id);
        v.setVoucherNumber(number);
        v.setStatus(status);
        return v;
    }
}
