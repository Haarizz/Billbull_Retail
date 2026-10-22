package com.billbull.backend.settings;

import com.billbull.backend.common.ownership.OwnershipAccessService;
import com.billbull.backend.customer.messaging.MessagingService;
import com.billbull.backend.document.HtmlPdfService;
import com.billbull.backend.exception.GlobalExceptionHandler;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherController;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService;
import com.billbull.backend.pos.admin.EffectiveCorrectionViewService;
import com.billbull.backend.sales.delivery.DeliveryNote;
import com.billbull.backend.sales.delivery.DeliveryNoteController;
import com.billbull.backend.sales.delivery.DeliveryNoteRepository;
import com.billbull.backend.sales.delivery.DeliveryNoteService;
import com.billbull.backend.sales.invoice.InvoiceCustomerContactService;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceController;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.sales.invoice.SalespersonAttributionService;
import com.billbull.backend.sales.proforma.ProformaController;
import com.billbull.backend.sales.proforma.ProformaInvoice;
import com.billbull.backend.sales.proforma.ProformaRepository;
import com.billbull.backend.sales.proforma.ProformaService;
import com.billbull.backend.sales.quotation.Quotation;
import com.billbull.backend.sales.quotation.QuotationController;
import com.billbull.backend.sales.quotation.QuotationEmailService;
import com.billbull.backend.sales.quotation.QuotationRepository;
import com.billbull.backend.sales.quotation.QuotationService;
import com.billbull.backend.sales.salesorder.SalesOrder;
import com.billbull.backend.sales.salesorder.SalesOrderAttachmentRepository;
import com.billbull.backend.sales.salesorder.SalesOrderController;
import com.billbull.backend.sales.salesorder.SalesOrderRepository;
import com.billbull.backend.sales.salesorder.SalesOrderService;
import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.security.RolePermissionRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.settings.company.CompanyProfile;
import com.billbull.backend.settings.company.CompanyProfileService;
import com.billbull.backend.settings.email.DocumentEmailSender;
import com.billbull.backend.settings.email.EmailConfigService;
import com.billbull.backend.settings.whatsapp.DocumentWhatsAppSender;
import com.billbull.backend.settings.whatsapp.WhatsAppCloudApiClient;
import com.billbull.backend.settings.whatsapp.WhatsAppConfigService;
import com.billbull.backend.settings.whatsapp.WhatsAppMessageLogRepository;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.mockito.Spy;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import java.util.Set;
import java.util.concurrent.Callable;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * F-20: a branch-restricted user who holds the send permission still cannot send another branch's
 * document by guessing its id, on any of the 9 send handlers (6 email, 3 WhatsApp).
 *
 * <p>The document services are real, so the check under test is the one in their by-id lookup
 * ({@link BranchAccessService#assertTransactionBranchAccessible}), over a real
 * {@link BranchAccessService} reading the request's {@link BranchContextHolder}. Repositories and
 * the SMTP, Chromium and Graph edges are mocked. Module permissions are granted throughout:
 * {@link DocumentSendAuthorizationTest} covers those.
 */
class DocumentSendBranchScopeTest {

    private static final long MY_BRANCH = 10L;
    private static final long OTHER_BRANCH = 20L;
    private static final byte[] PDF = "%PDF-1.7\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);
    private static final Map<String, Object> EMAIL_BODY = Map.of(
            "toEmail", "customer@example.com",
            "subject", "Your document",
            "htmlBody", "<p>Hello</p>",
            "pdfHtml", "<html><body>print</body></html>");
    private static final Map<String, Object> WHATSAPP_BODY = Map.of(
            "toPhone", "0501234567",
            "html", "<html><body>print</body></html>");

    // Real access rules
    private final UserRepository userRepository = mock(UserRepository.class);
    private final BranchRepository branchRepository = mock(BranchRepository.class);
    @Spy private BranchAccessService branchAccessService = new BranchAccessService(userRepository, branchRepository);
    @Spy private OwnershipAccessService ownershipAccessService =
            new OwnershipAccessService(mock(RolePermissionRepository.class), false);

    // Repositories behind the by-id lookups
    @Mock private DeliveryNoteRepository deliveryNoteRepository;
    @Mock private SalesInvoiceRepository invoiceRepository;
    @Mock private jakarta.persistence.EntityManager entityManager;
    @InjectMocks private DeliveryNoteService deliveryNoteService;
    @InjectMocks private SalesInvoiceService invoiceService;
    private final QuotationRepository quotationRepository = mock(QuotationRepository.class);
    private final SalesOrderRepository salesOrderRepository = mock(SalesOrderRepository.class);
    private final ProformaRepository proformaRepository = mock(ProformaRepository.class);
    private final ReceiptVoucherRepository receiptVoucherRepository = mock(ReceiptVoucherRepository.class);
    private final EffectiveCorrectionViewService correctionView = mock(EffectiveCorrectionViewService.class);

    // External edges
    private final EmailConfigService emailConfigService = mock(EmailConfigService.class);
    private final JavaMailSender mailSender = mock(JavaMailSender.class);
    private final HtmlPdfService pdfService = mock(HtmlPdfService.class);
    private final WhatsAppConfigService whatsAppConfigService = mock(WhatsAppConfigService.class);
    private final WhatsAppCloudApiClient graphClient = mock(WhatsAppCloudApiClient.class);
    private final MessagingService messagingService = mock(MessagingService.class);

    private AutoCloseable mocks;
    private QuotationController quotations;
    private SalesOrderController salesOrders;
    private SalesInvoiceController invoices;
    private DeliveryNoteController deliveryNotes;
    private ProformaController proformas;
    private ReceiptVoucherController receiptVouchers;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);

        QuotationService quotationService = new QuotationService(
                quotationRepository,
                new ObjectMapper(),
                mock(com.billbull.backend.inventory.product.ProductRepository.class),
                mock(com.billbull.backend.inventory.product.ProductPricingRepository.class),
                mock(com.billbull.backend.inventory.product.ProductTaxRepository.class),
                mock(com.billbull.backend.inventory.product.ProductInventoryPolicyRepository.class),
                mock(com.billbull.backend.purchase.stockmovement.StockMovementRepository.class),
                mock(SalesOrderRepository.class),
                mock(SalesInvoiceRepository.class),
                mock(com.billbull.backend.inventory.product.ProductPackingRepository.class),
                mock(com.billbull.backend.inventory.product.ProductMediaRepository.class),
                mock(com.billbull.backend.inventory.product.ProductBarcodeRepository.class),
                mock(com.billbull.backend.customer.inquiries.CustomerInquiryRepository.class),
                mock(com.billbull.backend.customer.inquiries.InquiryFollowUpRepository.class),
                mock(com.billbull.backend.sales.settings.SalesSettingsService.class),
                mock(com.billbull.backend.sales.settings.SalesDocumentNumberingService.class),
                branchAccessService,
                ownershipAccessService);
        SalesOrderService salesOrderService = new SalesOrderService(
                salesOrderRepository,
                mock(QuotationRepository.class),
                mock(com.billbull.backend.inventory.warehouse.WarehouseStockService.class),
                mock(com.billbull.backend.inventory.product.ProductRepository.class),
                mock(com.billbull.backend.inventory.product.ProductBarcodeRepository.class),
                mock(com.billbull.backend.inventory.product.ProductMediaRepository.class),
                mock(com.billbull.backend.inventory.product.ProductPackingRepository.class),
                branchAccessService,
                ownershipAccessService,
                mock(com.billbull.backend.purchase.stockmovement.StockMovementRepository.class),
                mock(com.billbull.backend.inventory.warehouse.BinRepository.class),
                mock(com.billbull.backend.inventory.batch.BatchSelectionService.class),
                mock(com.billbull.backend.sales.settings.SalesSettingsService.class),
                mock(com.billbull.backend.sales.settings.SalesDocumentNumberingService.class),
                mock(ReceiptVoucherService.class),
                mock(ReceiptVoucherRepository.class));
        ProformaService proformaService = new ProformaService(
                proformaRepository,
                mock(com.billbull.backend.inventory.product.ProductRepository.class),
                mock(com.billbull.backend.inventory.product.ProductBarcodeRepository.class),
                mock(com.billbull.backend.inventory.product.ProductMediaRepository.class),
                branchAccessService,
                ownershipAccessService,
                mock(com.billbull.backend.inventory.warehouse.WarehouseStockService.class),
                mock(com.billbull.backend.sales.settings.SalesDocumentNumberingService.class),
                mock(com.billbull.backend.inventory.product.ProductPackingRepository.class));
        ReceiptVoucherService receiptVoucherService = new ReceiptVoucherService(
                receiptVoucherRepository,
                mock(com.billbull.backend.financials.generalledger.postingengine.PostingEngineService.class),
                mock(com.billbull.backend.financials.audit.FinancialAuditService.class),
                mock(SalesInvoiceRepository.class),
                mock(com.billbull.backend.sales.customerledger.OpeningInvoiceRepository.class),
                mock(com.billbull.backend.sales.customerledger.CustomerRepository.class),
                branchAccessService,
                ownershipAccessService,
                mock(com.billbull.backend.sales.invoice.InvoiceBalanceService.class),
                entityManager,
                correctionView,
                "target/test-receipts");
        when(correctionView.resolveOverlay(any(), anyLong(), any())).thenAnswer(inv -> inv.getArgument(2));

        ModulePermissionService permissions = mock(ModulePermissionService.class); // everything granted
        InvoiceCustomerContactService contacts = mock(InvoiceCustomerContactService.class);
        when(contacts.attach(any(SalesInvoice.class))).thenAnswer(inv -> inv.getArgument(0));
        CompanyProfileService company = mock(CompanyProfileService.class);
        when(company.getProfile()).thenReturn(new CompanyProfile());

        DocumentEmailSender emailSender = new DocumentEmailSender(emailConfigService, branchRepository, pdfService);
        DocumentWhatsAppSender whatsAppSender = new DocumentWhatsAppSender(
                whatsAppConfigService, graphClient, mock(WhatsAppMessageLogRepository.class), pdfService);

        quotations = new QuotationController(quotationService, mock(AuditLogService.class), permissions,
                new QuotationEmailService(emailConfigService, messagingService, emailSender), whatsAppSender);
        salesOrders = new SalesOrderController(salesOrderService, mock(SalesOrderAttachmentRepository.class),
                mock(AuditLogService.class), emailSender, permissions, whatsAppSender, company, "uploads/");
        invoices = new SalesInvoiceController(invoiceService, contacts, permissions, emailSender,
                mock(SalespersonAttributionService.class), whatsAppSender, company);
        deliveryNotes = new DeliveryNoteController(deliveryNoteService, emailSender, permissions);
        proformas = new ProformaController(proformaService, mock(AuditLogService.class), emailSender, permissions);
        receiptVouchers = new ReceiptVoucherController(receiptVoucherService, new ObjectMapper(),
                mock(AuditLogService.class), emailSender, permissions);

        // The signed-in clerk works in MY_BRANCH only.
        User clerk = new User();
        clerk.setUsername("clerk");
        clerk.setBranch(branch(MY_BRANCH));
        when(userRepository.findByUsername("clerk")).thenReturn(Optional.of(clerk));
        when(branchRepository.findById(MY_BRANCH)).thenReturn(Optional.of(branch(MY_BRANCH)));
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("clerk", "pw", "ROLE_BRANCH_ADMIN"));
    }

    @AfterEach
    void tearDown() throws Exception {
        BranchContextHolder.clear();
        SecurityContextHolder.clearContext();
        mocks.close();
    }

    @Test
    void aRestrictedUserCannotSendAnotherBranchsDocumentOnAnySendEndpoint() {
        restrictedTo(MY_BRANCH);
        documentsIn(OTHER_BRANCH);
        mailAndWhatsAppReady();

        for (Map.Entry<String, Callable<ResponseEntity<?>>> endpoint : allEndpoints().entrySet()) {
            ResponseStatusException denied = assertThrows(ResponseStatusException.class,
                    () -> endpoint.getValue().call(), endpoint.getKey() + " must refuse another branch's document");
            assertEquals(HttpStatus.FORBIDDEN, denied.getStatusCode(), endpoint.getKey());
        }

        verifyNothingRenderedOrSent();
    }

    @Test
    void theRefusalIsAn403ThroughTheDispatcherNotA500() throws Exception {
        restrictedTo(MY_BRANCH);
        documentsIn(OTHER_BRANCH);
        mailAndWhatsAppReady();
        MockMvc mvc = MockMvcBuilders
                .standaloneSetup(quotations, salesOrders, invoices, deliveryNotes, proformas, receiptVouchers)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
        String email = new ObjectMapper().writeValueAsString(EMAIL_BODY);
        String whatsApp = new ObjectMapper().writeValueAsString(WHATSAPP_BODY);

        Map<String, String> requests = new LinkedHashMap<>();
        requests.put("/api/sales/quotations/1/send-email", email);
        requests.put("/api/sales/sales-orders/2/send-email", email);
        requests.put("/api/sales/invoices/3/send-email", email);
        requests.put("/api/delivery-notes/4/send-email", email);
        requests.put("/api/proforma/5/send-email", email);
        requests.put("/api/sales/receipt-vouchers/6/send-email", email);
        requests.put("/api/sales/quotations/1/send-whatsapp", whatsApp);
        requests.put("/api/sales/sales-orders/2/send-whatsapp", whatsApp);
        requests.put("/api/sales/invoices/3/send-whatsapp", whatsApp);
        for (Map.Entry<String, String> request : requests.entrySet()) {
            mvc.perform(post(request.getKey()).contentType(MediaType.APPLICATION_JSON).content(request.getValue()))
                    .andExpect(status().isForbidden());
        }

        verifyNothingRenderedOrSent();
    }

    /** Positive control: the same calls succeed for the user's own branch, so the denial above is the branch. */
    @Test
    void theSameUserSendsTheirOwnBranchsDocuments() throws Exception {
        restrictedTo(MY_BRANCH);
        documentsIn(MY_BRANCH);
        mailAndWhatsAppReady();

        for (Map.Entry<String, Callable<ResponseEntity<?>>> endpoint : emailEndpoints().entrySet()) {
            assertEquals(HttpStatus.OK, endpoint.getValue().call().getStatusCode(), endpoint.getKey());
        }
        verify(mailSender, times(6)).send(any(MimeMessage.class));
    }

    @Test
    void anAdminWithAllBranchesMaySendAnyBranchsDocument() throws Exception {
        BranchContextHolder.set(new BranchContextHolder.BranchContext(MY_BRANCH, Set.of(), true));
        documentsIn(OTHER_BRANCH);
        mailAndWhatsAppReady();

        for (Map.Entry<String, Callable<ResponseEntity<?>>> endpoint : emailEndpoints().entrySet()) {
            assertEquals(HttpStatus.OK, endpoint.getValue().call().getStatusCode(), endpoint.getKey());
        }
        verify(mailSender, times(6)).send(any(MimeMessage.class));
    }

    @Test
    void aSecondAssignedBranchCounts() throws Exception {
        BranchContextHolder.set(new BranchContextHolder.BranchContext(MY_BRANCH, Set.of(MY_BRANCH, OTHER_BRANCH), false));
        documentsIn(OTHER_BRANCH);
        mailAndWhatsAppReady();

        assertEquals(HttpStatus.OK, quotations.sendEmail(1L, EMAIL_BODY).getStatusCode());
        assertEquals(HttpStatus.OK, receiptVouchers.sendEmail(6L, EMAIL_BODY).getStatusCode());
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────

    private Map<String, Callable<ResponseEntity<?>>> emailEndpoints() {
        Map<String, Callable<ResponseEntity<?>>> endpoints = new LinkedHashMap<>();
        endpoints.put("quotation email", () -> quotations.sendEmail(1L, EMAIL_BODY));
        endpoints.put("sales order email", () -> salesOrders.sendEmail(2L, EMAIL_BODY));
        endpoints.put("sales invoice email", () -> invoices.sendEmail(3L, EMAIL_BODY));
        endpoints.put("delivery note email", () -> deliveryNotes.sendEmail(4L, EMAIL_BODY));
        endpoints.put("proforma email", () -> proformas.sendEmail(5L, EMAIL_BODY));
        endpoints.put("receipt voucher email", () -> receiptVouchers.sendEmail(6L, EMAIL_BODY));
        return endpoints;
    }

    private Map<String, Callable<ResponseEntity<?>>> allEndpoints() {
        Map<String, Callable<ResponseEntity<?>>> endpoints = emailEndpoints();
        endpoints.put("quotation WhatsApp", () -> quotations.sendWhatsApp(1L, WHATSAPP_BODY));
        endpoints.put("sales order WhatsApp", () -> salesOrders.sendWhatsApp(2L, WHATSAPP_BODY));
        endpoints.put("sales invoice WhatsApp", () -> invoices.sendWhatsApp(3L, WHATSAPP_BODY));
        return endpoints;
    }

    private static void restrictedTo(long branchId) {
        BranchContextHolder.set(new BranchContextHolder.BranchContext(branchId, Set.of(branchId), false));
    }

    private void documentsIn(long branchId) {
        Quotation quotation = new Quotation();
        quotation.setId(1L);
        quotation.setQtnNo("QTN-1");
        quotation.setCustomerEmail("customer@example.com");
        quotation.setBranchId(branchId);
        when(quotationRepository.findById(1L)).thenReturn(Optional.of(quotation));

        SalesOrder order = new SalesOrder();
        order.setId(2L);
        order.setSoNumber("SO-2");
        order.setBranch(branch(branchId));
        when(salesOrderRepository.findById(2L)).thenReturn(Optional.of(order));

        SalesInvoice invoice = new SalesInvoice();
        invoice.setId(3L);
        invoice.setInvoiceNumber("SI-3");
        invoice.setBranchId(branchId);
        when(invoiceRepository.findById(3L)).thenReturn(Optional.of(invoice));

        DeliveryNote dn = new DeliveryNote();
        dn.setId(4L);
        dn.setDnNumber("DN-4");
        dn.setBranchId(branchId);
        when(deliveryNoteRepository.findById(4L)).thenReturn(Optional.of(dn));

        ProformaInvoice pi = new ProformaInvoice();
        pi.setId(5L);
        pi.setPiNumber("PI-5");
        pi.setBranch(branch(branchId));
        when(proformaRepository.findById(5L)).thenReturn(Optional.of(pi));

        ReceiptVoucher rv = new ReceiptVoucher();
        rv.setId(6L);
        rv.setVoucherId("RV-6");
        rv.setBranchEntity(branch(branchId));
        when(receiptVoucherRepository.findById(6L)).thenReturn(Optional.of(rv));
    }

    private void mailAndWhatsAppReady() {
        when(emailConfigService.buildMailSender()).thenReturn(mailSender);
        when(emailConfigService.getFromAddress()).thenReturn("billing@example.com");
        when(emailConfigService.getFromName()).thenReturn("Acme Trading");
        when(mailSender.createMimeMessage()).thenAnswer(inv -> new MimeMessage(Session.getInstance(new Properties())));
        when(pdfService.render(any())).thenReturn(PDF);
        when(whatsAppConfigService.requireReady(any())).thenReturn(new com.billbull.backend.settings.whatsapp.WhatsAppConfig());
        when(graphClient.uploadMedia(any(), any(), any(), any())).thenReturn("media-1");
        when(graphClient.sendDocumentTemplate(any(), any(), any(), any(), any(), any())).thenReturn("wamid.1");
    }

    private void verifyNothingRenderedOrSent() {
        verify(mailSender, never()).send(any(MimeMessage.class));
        verify(pdfService, never()).render(any());
        verify(graphClient, never()).uploadMedia(any(), any(), any(), any());
        verify(graphClient, never()).sendDocumentTemplate(any(), any(), any(), any(), any(), any());
        verify(messagingService, never()).logMessage(any());
        verify(branchAccessService, atLeastOnce()).assertTransactionBranchAccessible(eq(OTHER_BRANCH), any());
    }

    private static Branch branch(long id) {
        Branch b = new Branch();
        b.setId(id);
        b.setName("Branch " + id);
        return b;
    }
}
