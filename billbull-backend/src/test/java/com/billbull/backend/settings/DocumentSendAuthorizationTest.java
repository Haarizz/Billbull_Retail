package com.billbull.backend.settings;

import com.billbull.backend.customer.messaging.MessagingService;
import com.billbull.backend.document.HtmlPdfService;
import com.billbull.backend.exception.GlobalExceptionHandler;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherController;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService;
import com.billbull.backend.role.Role;
import com.billbull.backend.sales.delivery.DeliveryNoteController;
import com.billbull.backend.sales.delivery.DeliveryNoteResponse;
import com.billbull.backend.sales.delivery.DeliveryNoteService;
import com.billbull.backend.sales.invoice.InvoiceCustomerContactService;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceController;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.sales.invoice.SalesType;
import com.billbull.backend.sales.invoice.SalespersonAttributionService;
import com.billbull.backend.sales.proforma.ProformaController;
import com.billbull.backend.sales.proforma.ProformaResponse;
import com.billbull.backend.sales.proforma.ProformaService;
import com.billbull.backend.sales.quotation.Quotation;
import com.billbull.backend.sales.quotation.QuotationController;
import com.billbull.backend.sales.quotation.QuotationEmailService;
import com.billbull.backend.sales.quotation.QuotationService;
import com.billbull.backend.sales.salesorder.SalesOrder;
import com.billbull.backend.sales.salesorder.SalesOrderAttachmentRepository;
import com.billbull.backend.sales.salesorder.SalesOrderController;
import com.billbull.backend.sales.salesorder.SalesOrderService;
import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.security.RolePermission;
import com.billbull.backend.security.RolePermissionRepository;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.settings.company.CompanyProfile;
import com.billbull.backend.settings.company.CompanyProfileService;
import com.billbull.backend.settings.email.DocumentEmailSender;
import com.billbull.backend.settings.email.EmailConfigService;
import com.billbull.backend.settings.whatsapp.DocumentWhatsAppSender;
import com.billbull.backend.settings.whatsapp.WhatsAppCloudApiClient;
import com.billbull.backend.settings.whatsapp.WhatsAppConfig;
import com.billbull.backend.settings.whatsapp.WhatsAppConfigService;
import com.billbull.backend.settings.whatsapp.WhatsAppMessageLogRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.Callable;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * T-P0-1: every document send endpoint (6 email handlers, one of which also carries the POS
 * receipt, and 3 WhatsApp handlers) checks a module permission before it loads the document,
 * renders a PDF, opens SMTP or calls Meta.
 *
 * <p>Permissions run through the real {@link ModulePermissionService} over role_permissions rows,
 * so parent fallback and explicit denies behave as in production. The real
 * {@link DocumentEmailSender} and {@link DocumentWhatsAppSender} are wired; only their edges are
 * mocked: SMTP ({@link EmailConfigService#buildMailSender}), Chromium ({@link HtmlPdfService}) and
 * the Graph API ({@link WhatsAppCloudApiClient}).
 *
 * <p>Rules: Quotation, Sales Order, Sales Invoice (and POS receipt) and Delivery Note need VIEW on
 * their module. Proforma keeps EXPORT and Receipt Voucher keeps EDIT on {@code finance.voucher};
 * both were stricter than VIEW before this change and are deliberately not loosened.
 */
class DocumentSendAuthorizationTest {

    private static final byte[] PDF = "%PDF-1.7\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);
    private static final Map<String, Object> EMAIL_BODY = Map.of(
            "toEmail", "customer@example.com",
            "subject", "Your document",
            "htmlBody", "<p>Hello</p>",
            "pdfHtml", "<html><body>print</body></html>");
    private static final Map<String, Object> WHATSAPP_BODY = Map.of(
            "toPhone", "0501234567",
            "html", "<html><body>print</body></html>");

    // Permission storage
    private final RolePermissionRepository rolePermissionRepository = mock(RolePermissionRepository.class);
    private final ModulePermissionService permissions = new ModulePermissionService(rolePermissionRepository);

    // Document services
    private final QuotationService quotationService = mock(QuotationService.class);
    private final SalesOrderService salesOrderService = mock(SalesOrderService.class);
    private final SalesInvoiceService invoiceService = mock(SalesInvoiceService.class);
    private final DeliveryNoteService deliveryNoteService = mock(DeliveryNoteService.class);
    private final ProformaService proformaService = mock(ProformaService.class);
    private final ReceiptVoucherService receiptVoucherService = mock(ReceiptVoucherService.class);
    private final InvoiceCustomerContactService customerContactService = mock(InvoiceCustomerContactService.class);
    private final CompanyProfileService companyProfileService = mock(CompanyProfileService.class);
    private final MessagingService messagingService = mock(MessagingService.class);

    // External edges
    private final EmailConfigService emailConfigService = mock(EmailConfigService.class);
    private final JavaMailSender mailSender = mock(JavaMailSender.class);
    private final HtmlPdfService pdfService = mock(HtmlPdfService.class);
    private final WhatsAppConfigService whatsAppConfigService = mock(WhatsAppConfigService.class);
    private final WhatsAppCloudApiClient graphClient = mock(WhatsAppCloudApiClient.class);
    private final WhatsAppMessageLogRepository whatsAppLogRepository = mock(WhatsAppMessageLogRepository.class);

    private QuotationController quotations;
    private SalesOrderController salesOrders;
    private SalesInvoiceController invoices;
    private DeliveryNoteController deliveryNotes;
    private ProformaController proformas;
    private ReceiptVoucherController receiptVouchers;

    @BeforeEach
    void setUp() {
        when(rolePermissionRepository.findByRole_NameIn(anyCollection())).thenAnswer(inv -> {
            List<RolePermission> rows = new ArrayList<>();
            for (Object role : (Collection<?>) inv.getArgument(0)) {
                rows.addAll(rowsFor(role.toString()));
            }
            return rows;
        });

        DocumentEmailSender emailSender = new DocumentEmailSender(emailConfigService, mock(BranchRepository.class), pdfService);
        DocumentWhatsAppSender whatsAppSender =
                new DocumentWhatsAppSender(whatsAppConfigService, graphClient, whatsAppLogRepository, pdfService);

        quotations = new QuotationController(quotationService, mock(AuditLogService.class), permissions,
                new QuotationEmailService(emailConfigService, messagingService, emailSender), whatsAppSender);
        salesOrders = new SalesOrderController(salesOrderService, mock(SalesOrderAttachmentRepository.class),
                mock(AuditLogService.class), emailSender, permissions, whatsAppSender, companyProfileService,
                "uploads/");
        invoices = new SalesInvoiceController(invoiceService, customerContactService, permissions, emailSender,
                mock(SalespersonAttributionService.class), whatsAppSender, companyProfileService);
        deliveryNotes = new DeliveryNoteController(deliveryNoteService, emailSender, permissions);
        proformas = new ProformaController(proformaService, mock(AuditLogService.class), emailSender, permissions);
        receiptVouchers = new ReceiptVoucherController(receiptVoucherService, new ObjectMapper(),
                mock(AuditLogService.class), emailSender, permissions);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    // ── Denials ──────────────────────────────────────────────────────────────────────────

    @Test
    void aTillOnlyUserIsRefusedOnAllTenSendEndpointsBeforeAnythingIsLoadedRenderedOrSent() {
        signIn("TILL_ONLY");

        for (Map.Entry<String, Callable<ResponseEntity<?>>> endpoint : allEndpoints().entrySet()) {
            assertThrows(AccessDeniedException.class, () -> endpoint.getValue().call(),
                    endpoint.getKey() + " must refuse a till-only user");
        }

        assertNothingLoadedOrSent();
    }

    @Test
    void deniedSendsAnswerHttp403ThroughTheDispatcher() throws Exception {
        MockMvc mvc = MockMvcBuilders
                .standaloneSetup(quotations, salesOrders, invoices, deliveryNotes, proformas, receiptVouchers)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
        String email = new ObjectMapper().writeValueAsString(EMAIL_BODY);
        Map<String, Object> posReceipt = new HashMap<>(EMAIL_BODY);
        posReceipt.put("pdfKind", "POS_RECEIPT");
        String posReceiptEmail = new ObjectMapper().writeValueAsString(posReceipt);
        String whatsApp = new ObjectMapper().writeValueAsString(WHATSAPP_BODY);

        signIn("TILL_ONLY");
        Map<String, String> requests = new java.util.LinkedHashMap<>();
        requests.put("/api/sales/quotations/1/send-email", email);
        requests.put("/api/sales/sales-orders/2/send-email", email);
        requests.put("/api/sales/invoices/3/send-email", email);
        requests.put("/api/sales/invoices/3/send-email#pos", posReceiptEmail);
        requests.put("/api/delivery-notes/4/send-email", email);
        requests.put("/api/proforma/5/send-email", email);
        requests.put("/api/sales/receipt-vouchers/6/send-email", email);
        requests.put("/api/sales/quotations/1/send-whatsapp", whatsApp);
        requests.put("/api/sales/sales-orders/2/send-whatsapp", whatsApp);
        requests.put("/api/sales/invoices/3/send-whatsapp", whatsApp);
        for (Map.Entry<String, String> request : requests.entrySet()) {
            mvc.perform(post(request.getKey().replace("#pos", ""))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(request.getValue()))
                    .andExpect(status().isForbidden());
        }

        assertNothingLoadedOrSent();
    }

    @Test
    void salesOrderAndDeliveryNoteEmailHonourAnExplicitDenyOnTheirOwnModule() {
        // SALES_NO_SO_DN can view "sales" but has explicit view=false rows for sales.order and
        // sales.delivery. Before T-P0-1 these two email handlers had no check at all.
        signIn("SALES_NO_SO_DN");

        assertThrows(AccessDeniedException.class, () -> salesOrders.sendEmail(2L, EMAIL_BODY));
        assertThrows(AccessDeniedException.class, () -> deliveryNotes.sendEmail(4L, EMAIL_BODY));
        assertThrows(AccessDeniedException.class, () -> salesOrders.sendWhatsApp(2L, WHATSAPP_BODY));

        assertNothingLoadedOrSent();
    }

    @Test
    void proformaStillNeedsExportAndReceiptVoucherStillNeedsEdit() {
        signIn("SALES_VIEWER");
        assertThrows(AccessDeniedException.class, () -> proformas.sendEmail(5L, EMAIL_BODY));
        assertThrows(AccessDeniedException.class, () -> receiptVouchers.sendEmail(6L, EMAIL_BODY));

        signIn("FINANCE_VIEWER");
        assertThrows(AccessDeniedException.class, () -> receiptVouchers.sendEmail(6L, EMAIL_BODY));

        assertNothingLoadedOrSent();
    }

    @Test
    void aDocumentHiddenByOwnershipOrBranchScopeIsNeverSent() throws Exception {
        signIn("SALES_VIEWER");
        ResponseStatusException hidden = new ResponseStatusException(HttpStatus.NOT_FOUND, "not found");
        when(salesOrderService.getById(2L)).thenThrow(hidden);
        when(deliveryNoteService.get(4L)).thenThrow(hidden);
        when(invoiceService.getById(3L)).thenThrow(hidden);

        // The lookup's 404/403 propagates unchanged; the email catch-all must not turn it into a 500.
        assertSame(hidden, assertThrows(ResponseStatusException.class, () -> salesOrders.sendEmail(2L, EMAIL_BODY)));
        assertSame(hidden, assertThrows(ResponseStatusException.class, () -> deliveryNotes.sendEmail(4L, EMAIL_BODY)));
        assertSame(hidden, assertThrows(ResponseStatusException.class, () -> invoices.sendWhatsApp(3L, WHATSAPP_BODY)));

        verifyNoInteractions(emailConfigService, mailSender, pdfService, whatsAppConfigService, graphClient);
    }

    // ── Allowed ──────────────────────────────────────────────────────────────────────────

    @Test
    void aSalesViewerSendsQuotationOrderInvoiceAndDeliveryNoteEmails() throws Exception {
        signIn("SALES_VIEWER");
        documentsExist();
        mailReady();

        assertOk(quotations.sendEmail(1L, EMAIL_BODY));
        assertOk(salesOrders.sendEmail(2L, EMAIL_BODY));
        assertOk(invoices.sendEmail(3L, EMAIL_BODY));
        Map<String, Object> posReceipt = new HashMap<>(EMAIL_BODY);
        posReceipt.put("pdfKind", "POS_RECEIPT");
        assertOk(invoices.sendEmail(3L, posReceipt));
        assertOk(deliveryNotes.sendEmail(4L, EMAIL_BODY));

        verify(mailSender, times(5)).send(any(MimeMessage.class));
        verify(pdfService, times(5)).render(any());
    }

    @Test
    void exportAndEditHoldersSendProformaAndReceiptVoucherEmails() throws Exception {
        documentsExist();
        mailReady();

        signIn("SALES_EXPORTER");
        assertOk(proformas.sendEmail(5L, EMAIL_BODY));
        signIn("FINANCE_CLERK");
        assertOk(receiptVouchers.sendEmail(6L, EMAIL_BODY));

        verify(mailSender, times(2)).send(any(MimeMessage.class));
    }

    @Test
    void aSalesViewerSendsQuotationOrderAndInvoiceOnWhatsApp() {
        signIn("SALES_VIEWER");
        documentsExist();
        WhatsAppConfig cfg = new WhatsAppConfig();
        cfg.setEnabled(true);
        cfg.setPhoneNumberId("123456789012345");
        cfg.setAccessToken("test-token");
        when(whatsAppConfigService.requireReady(any())).thenReturn(cfg);
        when(pdfService.render(any())).thenReturn(PDF);
        when(graphClient.uploadMedia(any(), any(), any(), any())).thenReturn("media-1");
        when(graphClient.sendDocumentTemplate(any(), any(), any(), any(), any(), any())).thenReturn("wamid.1");
        when(whatsAppLogRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        assertOk(quotations.sendWhatsApp(1L, WHATSAPP_BODY));
        assertOk(salesOrders.sendWhatsApp(2L, WHATSAPP_BODY));
        assertOk(invoices.sendWhatsApp(3L, WHATSAPP_BODY));

        verify(graphClient, times(3)).sendDocumentTemplate(any(), any(), any(), any(), any(), any());
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────

    private Map<String, Callable<ResponseEntity<?>>> allEndpoints() {
        Map<String, Object> posReceipt = new HashMap<>(EMAIL_BODY);
        posReceipt.put("pdfKind", "POS_RECEIPT");
        Map<String, Callable<ResponseEntity<?>>> endpoints = new java.util.LinkedHashMap<>();
        endpoints.put("quotation email", () -> quotations.sendEmail(1L, EMAIL_BODY));
        endpoints.put("sales order email", () -> salesOrders.sendEmail(2L, EMAIL_BODY));
        endpoints.put("sales invoice email", () -> invoices.sendEmail(3L, EMAIL_BODY));
        endpoints.put("POS receipt email", () -> invoices.sendEmail(3L, posReceipt));
        endpoints.put("delivery note email", () -> deliveryNotes.sendEmail(4L, EMAIL_BODY));
        endpoints.put("proforma email", () -> proformas.sendEmail(5L, EMAIL_BODY));
        endpoints.put("receipt voucher email", () -> receiptVouchers.sendEmail(6L, EMAIL_BODY));
        endpoints.put("quotation WhatsApp", () -> quotations.sendWhatsApp(1L, WHATSAPP_BODY));
        endpoints.put("sales order WhatsApp", () -> salesOrders.sendWhatsApp(2L, WHATSAPP_BODY));
        endpoints.put("sales invoice WhatsApp", () -> invoices.sendWhatsApp(3L, WHATSAPP_BODY));
        return endpoints;
    }

    private void assertNothingLoadedOrSent() {
        verifyNoInteractions(quotationService, salesOrderService, invoiceService, deliveryNoteService,
                proformaService, receiptVoucherService, customerContactService, messagingService,
                emailConfigService, mailSender, pdfService, whatsAppConfigService, graphClient,
                whatsAppLogRepository);
    }

    private static void assertOk(ResponseEntity<?> response) {
        assertEquals(HttpStatus.OK, response.getStatusCode(), String.valueOf(response.getBody()));
    }

    private void signIn(String role) {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("user", "pw", "ROLE_" + role));
    }

    private void mailReady() {
        when(emailConfigService.buildMailSender()).thenReturn(mailSender);
        when(emailConfigService.getFromAddress()).thenReturn("billing@example.com");
        when(emailConfigService.getFromName()).thenReturn("Acme Trading");
        when(mailSender.createMimeMessage()).thenAnswer(inv -> new MimeMessage(Session.getInstance(new Properties())));
        when(pdfService.render(any())).thenReturn(PDF);
    }

    private void documentsExist() {
        Quotation quotation = new Quotation();
        quotation.setId(1L);
        quotation.setQtnNo("QTN-1");
        quotation.setCustomerEmail("customer@example.com");
        when(quotationService.getQuotationById(1L)).thenReturn(quotation);

        SalesOrder order = new SalesOrder();
        order.setId(2L);
        order.setSoNumber("SO-2");
        when(salesOrderService.getById(2L)).thenReturn(order);

        SalesInvoice invoice = new SalesInvoice();
        invoice.setId(3L);
        invoice.setInvoiceNumber("SI-3");
        invoice.setSalesType(SalesType.POS_SALE);
        when(invoiceService.getById(3L)).thenReturn(invoice);
        when(customerContactService.attach(invoice)).thenReturn(invoice);

        DeliveryNoteResponse dn = new DeliveryNoteResponse();
        dn.dnNumber = "DN-4";
        when(deliveryNoteService.get(4L)).thenReturn(dn);

        ProformaResponse pi = new ProformaResponse();
        pi.setPiNumber("PI-5");
        when(proformaService.get(5L)).thenReturn(pi);

        ReceiptVoucher rv = new ReceiptVoucher();
        rv.setVoucherId("RV-6");
        when(receiptVoucherService.getReceiptById(6L)).thenReturn(rv);

        when(companyProfileService.getProfile()).thenReturn(new CompanyProfile());
    }

    /** role_permissions rows per role: (module, view, create, edit, delete, approve, export). */
    private static List<RolePermission> rowsFor(String role) {
        return switch (role) {
            // Operates the till only: POS rows, no sales-document or finance module.
            case "TILL_ONLY" -> List.of(
                    row(role, "pos", true, true, true, true, true, true),
                    row(role, "sales.pos", true, true, false, false, false, false));
            case "SALES_VIEWER" -> List.of(row(role, "sales", true, false, false, false, false, false));
            case "SALES_EXPORTER" -> List.of(row(role, "sales", true, false, false, false, false, true));
            case "SALES_NO_SO_DN" -> List.of(
                    row(role, "sales", true, true, true, true, true, true),
                    row(role, "sales.order", false, false, false, false, false, false),
                    row(role, "sales.delivery", false, false, false, false, false, false));
            case "FINANCE_VIEWER" -> List.of(row(role, "finance", true, false, false, false, false, false));
            case "FINANCE_CLERK" -> List.of(row(role, "finance.voucher", true, true, true, false, false, false));
            default -> List.of();
        };
    }

    private static RolePermission row(String roleName, String module, boolean view, boolean create,
                                      boolean edit, boolean delete, boolean approve, boolean export) {
        Role role = new Role();
        role.setName(roleName);
        RolePermission rp = new RolePermission();
        rp.setRole(role);
        rp.setModule(module);
        rp.setCanView(view);
        rp.setCanCreate(create);
        rp.setCanEdit(edit);
        rp.setCanDelete(delete);
        rp.setCanApprove(approve);
        rp.setCanExport(export);
        return rp;
    }
}
