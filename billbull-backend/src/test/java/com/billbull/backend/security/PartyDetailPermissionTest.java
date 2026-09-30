package com.billbull.backend.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.purchase.lpo.LpoController;
import com.billbull.backend.purchase.lpo.LpoService;
import com.billbull.backend.purchase.lpo.VendorRecentLpoResponse;
import com.billbull.backend.sales.customerledger.CustomerController;
import com.billbull.backend.sales.customerledger.CustomerService;
import com.billbull.backend.sales.customerledger.CustomerSummaryResponse;
import com.billbull.backend.sales.invoice.CustomerRecentInvoiceResponse;
import com.billbull.backend.sales.invoice.SalesInvoiceController;
import com.billbull.backend.sales.invoice.SalesInvoiceService;

/**
 * The permission split behind the Customer and Vendor details panels.
 *
 * <p>Each panel is assembled from more than one grant, and that is the point of these
 * tests: a party's record and that party's documents are separate permissions, so a user
 * can hold one without the other. The panel is built to render a denial per section, and
 * that only works if the backend actually gates the two reads separately.
 *
 * <ul>
 *   <li>customer record → {@code sales.customer}, customer invoices → {@code sales.invoice}
 *   <li>vendor record → {@code purchases.vendor}, vendor LPOs → {@code purchases.lpo}
 * </ul>
 *
 * <p>Every gate must also run <em>before</em> the read, so a denied caller never reaches
 * the repository at all.
 */
@ExtendWith(MockitoExtension.class)
class PartyDetailPermissionTest {

    @Mock private ModulePermissionService modulePermissionService;
    @Mock private AuditLogService auditLogService;

    // ── Customer summary: sales.customer ─────────────────────────────────────

    @Mock private CustomerService customerService;

    private CustomerController customerController() {
        CustomerController controller = new CustomerController();
        ReflectionTestUtils.setField(controller, "service", customerService);
        ReflectionTestUtils.setField(controller, "modulePermissionService", modulePermissionService);
        ReflectionTestUtils.setField(controller, "auditLogService", auditLogService);
        return controller;
    }

    @Test
    void customerSummaryRequiresTheCustomerViewPermission() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanView("sales.customer");

        assertThatThrownBy(() -> customerController().getCustomerSummary(3L))
                .isInstanceOf(AccessDeniedException.class);

        verifyNoInteractions(customerService);
    }

    @Test
    void customerSummaryReturnsThePayloadWhenThePermissionIsHeld() {
        CustomerSummaryResponse payload = new CustomerSummaryResponse();
        payload.setCustomerCode("CUST-003");
        when(customerService.getCustomerSummary(3L)).thenReturn(payload);

        ResponseEntity<CustomerSummaryResponse> response = customerController().getCustomerSummary(3L);

        verify(modulePermissionService).requireCanView("sales.customer");
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody().getCustomerCode()).isEqualTo("CUST-003");
    }

    @Test
    void customerSummaryIsNotFoundForAnUnknownId() {
        when(customerService.getCustomerSummary(999L)).thenReturn(null);

        assertThat(customerController().getCustomerSummary(999L).getStatusCode().value()).isEqualTo(404);
    }

    // ── Customer invoices: sales.invoice ─────────────────────────────────────

    @Mock private SalesInvoiceService salesInvoiceService;
    @Mock private com.billbull.backend.sales.invoice.InvoiceCustomerContactService customerContactService;
    @Mock private com.billbull.backend.settings.email.DocumentEmailSender emailSender;
    @Mock private com.billbull.backend.sales.invoice.SalespersonAttributionService salespersonAttributionService;

    private SalesInvoiceController invoiceController() {
        return new SalesInvoiceController(salesInvoiceService, customerContactService,
                modulePermissionService, emailSender, salespersonAttributionService);
    }

    @Test
    void recentCustomerInvoicesRequireTheInvoicePermissionNotTheCustomerOne() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanView("sales.invoice");

        assertThatThrownBy(() -> invoiceController().getRecentForCustomer("CUST-003", 5))
                .isInstanceOf(AccessDeniedException.class);

        // Seeing a customer does not imply seeing that customer's invoices.
        verify(modulePermissionService, never()).requireCanView("sales.customer");
        verify(salesInvoiceService, never()).getRecentInvoicesForCustomer(anyString(), anyInt());
    }

    @Test
    void recentCustomerInvoicesPassTheCustomerCodeAndSizeThrough() {
        when(salesInvoiceService.getRecentInvoicesForCustomer("CUST-003", 5))
                .thenReturn(List.of(new CustomerRecentInvoiceResponse()));

        ResponseEntity<List<CustomerRecentInvoiceResponse>> response =
                invoiceController().getRecentForCustomer("CUST-003", 5);

        verify(modulePermissionService).requireCanView("sales.invoice");
        verify(salesInvoiceService).getRecentInvoicesForCustomer("CUST-003", 5);
        assertThat(response.getBody()).hasSize(1);
    }

    // ── Vendor LPOs: purchases.lpo ───────────────────────────────────────────

    @Mock private LpoService lpoService;

    private LpoController lpoController() {
        return new LpoController(lpoService, auditLogService, modulePermissionService);
    }

    @Test
    void recentVendorLposRequireTheLpoPermissionNotTheVendorOne() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanView("purchases.lpo");

        assertThatThrownBy(() -> lpoController().recentForVendor(21L, 5))
                .isInstanceOf(AccessDeniedException.class);

        // Seeing a vendor does not imply seeing that vendor's purchase orders.
        verify(modulePermissionService, never()).requireCanView("purchases.vendor");
        verifyNoInteractions(lpoService);
    }

    @Test
    void recentVendorLposPassTheVendorIdAndSizeThrough() {
        when(lpoService.getRecentForVendor(21L, 5)).thenReturn(List.of(new VendorRecentLpoResponse()));

        List<VendorRecentLpoResponse> rows = lpoController().recentForVendor(21L, 5);

        verify(modulePermissionService).requireCanView("purchases.lpo");
        verify(lpoService).getRecentForVendor(21L, 5);
        assertThat(rows).hasSize(1);
    }
}
