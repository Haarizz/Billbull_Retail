package com.billbull.backend.sales.invoice;

import com.billbull.backend.document.HtmlPdfService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.settings.company.CompanyProfileService;
import com.billbull.backend.settings.email.DocumentEmailSender;
import com.billbull.backend.settings.email.EmailConfigService;
import com.billbull.backend.settings.whatsapp.DocumentWhatsAppSender;
import jakarta.mail.BodyPart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * The POS till's "Email Receipt" goes through the sales-invoice send-email endpoint with
 * the receipt's print HTML as pdfHtml and pdfKind POS_RECEIPT. The controller is wired to
 * the real DocumentEmailSender (SMTP, config and Chromium mocked) and the sent message is
 * parsed back, so these assert on what the customer would receive.
 */
@ExtendWith(MockitoExtension.class)
class SalesInvoicePosReceiptEmailTest {

    private static final byte[] PDF = "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 1, 2, 3};
    private static final String BODY = "<p>Invoice: SI-POS-000124, Total: AED 378.00</p>";
    private static final String RECEIPT_HTML =
            "<html><head><style>@page{size:80mm 180mm;margin:0}</style></head><body>Invoice No: SI-POS-000124</body></html>";

    @Mock private SalesInvoiceService service;
    @Mock private InvoiceCustomerContactService customerContactService;
    @Mock private ModulePermissionService modulePermissionService;
    @Mock private SalespersonAttributionService salespersonAttributionService;
    @Mock private DocumentWhatsAppSender whatsAppSender;
    @Mock private CompanyProfileService companyProfileService;
    @Mock private EmailConfigService emailConfigService;
    @Mock private BranchRepository branchRepository;
    @Mock private HtmlPdfService pdfService;
    @Mock private JavaMailSender mailSender;

    private SalesInvoiceController controller;
    private final Session session = Session.getInstance(new Properties());

    @BeforeEach
    void setUp() {
        DocumentEmailSender sender = new DocumentEmailSender(emailConfigService, branchRepository, pdfService);
        controller = new SalesInvoiceController(service, customerContactService, modulePermissionService,
                sender, salespersonAttributionService, whatsAppSender, companyProfileService);
    }

    @Test
    void posReceiptIsAttachedAsPosReceiptPdfNextToTheUnchangedBody() throws Exception {
        when(service.getById(42L)).thenReturn(posInvoice());
        mailReady();
        when(pdfService.render(RECEIPT_HTML)).thenReturn(PDF);

        ResponseEntity<?> res = controller.sendEmail(42L, request(true, inline()));

        assertEquals(200, res.getStatusCode().value());
        verify(modulePermissionService).requireCanView("sales.invoice");
        // The receipt's print HTML is what gets rendered, never the email body.
        verify(pdfService).render(RECEIPT_HTML);

        MimeMessage sent = roundTrip(captureSent());
        assertEquals("Receipt SI-POS-000124", sent.getSubject());
        MimeMultipart mixed = (MimeMultipart) sent.getContent();
        assertTrue(mixed.getContentType().startsWith("multipart/mixed"), mixed.getContentType());
        assertEquals(2, mixed.getCount());

        MimeMultipart related = (MimeMultipart) mixed.getBodyPart(0).getContent();
        assertEquals(BODY, related.getBodyPart(0).getContent());
        BodyPart logo = related.getBodyPart(1);
        assertEquals("<inline-img-0>", logo.getHeader("Content-ID")[0]);
        assertEquals(Part.INLINE, logo.getDisposition());
        assertArrayEquals(PNG, read(logo));

        BodyPart pdf = mixed.getBodyPart(1);
        assertTrue(pdf.isMimeType("application/pdf"), pdf.getContentType());
        assertEquals(Part.ATTACHMENT, pdf.getDisposition());
        assertEquals("POS_Receipt_SI-POS-000124.pdf", pdf.getFileName());
        assertArrayEquals(PDF, read(pdf));
    }

    @Test
    void theFilenameComesFromTheStoredInvoiceNotTheRequest() throws Exception {
        when(service.getById(42L)).thenReturn(posInvoice());
        mailReady();
        when(pdfService.render(anyString())).thenReturn(PDF);
        Map<String, Object> body = request(true, List.of());
        body.put("filename", "../../evil.exe");
        body.put("invoiceNumber", "SI-POS-999999");

        controller.sendEmail(42L, body);

        MimeMultipart mixed = (MimeMultipart) roundTrip(captureSent()).getContent();
        assertEquals("POS_Receipt_SI-POS-000124.pdf", mixed.getBodyPart(1).getFileName());
    }

    @Test
    void pdfRenderFailureSendsNothingAndIsReportedAsAFailure() throws Exception {
        when(service.getById(42L)).thenReturn(posInvoice());
        when(emailConfigService.buildMailSender()).thenReturn(mailSender);
        when(emailConfigService.getFromAddress()).thenReturn("billing@example.com");
        when(emailConfigService.getFromName()).thenReturn("Acme Trading");
        when(pdfService.render(anyString())).thenThrow(new RuntimeException("Timeout 30000ms exceeded"));

        ResponseEntity<?> res = controller.sendEmail(42L, request(true, inline()));

        assertEquals(500, res.getStatusCode().value());
        assertTrue(String.valueOf(res.getBody()).contains("PDF attachment"), String.valueOf(res.getBody()));
        verify(mailSender, never()).send(any(MimeMessage.class));
    }

    @Test
    void blankReceiptHtmlIsRejectedWithoutRenderingOrSending() {
        when(service.getById(42L)).thenReturn(posInvoice());
        Map<String, Object> body = request(true, inline());
        body.put("pdfHtml", "   ");

        ResponseEntity<?> res = controller.sendEmail(42L, body);

        assertEquals(400, res.getStatusCode().value());
        verifyNoInteractions(pdfService, mailSender);
    }

    @Test
    void smtpFailureIsReportedAsAFailure() throws Exception {
        when(service.getById(42L)).thenReturn(posInvoice());
        mailReady();
        when(pdfService.render(anyString())).thenReturn(PDF);
        doThrow(new MailSendException("535 Authentication failed")).when(mailSender).send(any(MimeMessage.class));

        ResponseEntity<?> res = controller.sendEmail(42L, request(true, inline()));

        assertEquals(500, res.getStatusCode().value());
        assertTrue(String.valueOf(res.getBody()).startsWith("Failed to send email"));
    }

    // ------------------------------------------------------------- naming rule

    @Test
    void posReceiptPrefixNeedsBothTheTillRequestAndAPosInvoice() {
        SalesInvoice pos = posInvoice();
        assertEquals("POS_Receipt_SI-POS-000124", SalesInvoiceController.emailPdfDocumentName(pos, request(true, null)));
        // The back-office Sales Invoice screen sends no pdfKind: plain invoice name, as before.
        assertEquals("SI-POS-000124", SalesInvoiceController.emailPdfDocumentName(pos, request(false, null)));
        assertEquals("SI-POS-000124", SalesInvoiceController.emailPdfDocumentName(pos, null));

        SalesInvoice backOffice = posInvoice();
        backOffice.setSalesType(SalesType.STANDARD_FLOW);
        backOffice.setPosSessionId(null);
        assertEquals("SI-POS-000124", SalesInvoiceController.emailPdfDocumentName(backOffice, request(true, null)));

        Map<String, Object> other = request(false, null);
        other.put("pdfKind", "../../x");
        assertEquals("SI-POS-000124", SalesInvoiceController.emailPdfDocumentName(pos, other));
    }

    @Test
    void aPosInvoiceIsRecognisedBySessionWhenTheSalesTypeIsMissing() {
        SalesInvoice inv = posInvoice();
        inv.setSalesType(null);
        assertEquals("POS_Receipt_SI-POS-000124", SalesInvoiceController.emailPdfDocumentName(inv, request(true, null)));
    }

    @Test
    void aMissingInvoiceNumberFallsBackToTheIdBasedName() {
        SalesInvoice inv = posInvoice();
        inv.setInvoiceNumber(null);
        assertNull(SalesInvoiceController.emailPdfDocumentName(inv, request(true, null)));
        assertEquals("Sales-Invoice-42.pdf", DocumentEmailSender.pdfFilename(null, "Sales-Invoice-42"));
    }

    // ------------------------------------------------------------- fixtures

    private static SalesInvoice posInvoice() {
        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceNumber("SI-POS-000124");
        inv.setSalesType(SalesType.POS_SALE);
        inv.setPosSessionId(9L);
        inv.setPosTerminalId("TERM-01");
        return inv;
    }

    private static Map<String, Object> request(boolean posReceipt, List<Map<String, String>> inlineAttachments) {
        Map<String, Object> body = new HashMap<>();
        body.put("toEmail", "customer@example.com");
        body.put("subject", "Receipt SI-POS-000124");
        body.put("htmlBody", BODY);
        body.put("inlineAttachments", inlineAttachments);
        body.put("pdfHtml", RECEIPT_HTML);
        if (posReceipt) body.put("pdfKind", "POS_RECEIPT");
        return body;
    }

    private static List<Map<String, String>> inline() {
        return List.of(Map.of(
                "cid", "inline-img-0",
                "contentType", "image/png",
                "base64", Base64.getEncoder().encodeToString(PNG)));
    }

    private void mailReady() {
        when(emailConfigService.buildMailSender()).thenReturn(mailSender);
        when(emailConfigService.getFromAddress()).thenReturn("billing@example.com");
        when(emailConfigService.getFromName()).thenReturn("Acme Trading");
        when(mailSender.createMimeMessage()).thenReturn(new MimeMessage(session));
    }

    private MimeMessage captureSent() {
        ArgumentCaptor<MimeMessage> captor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mailSender).send(captor.capture());
        return captor.getValue();
    }

    private MimeMessage roundTrip(MimeMessage message) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        message.writeTo(out);
        return new MimeMessage(session, new ByteArrayInputStream(out.toByteArray()));
    }

    private static byte[] read(Part part) throws Exception {
        try (InputStream in = part.getInputStream()) {
            return in.readAllBytes();
        }
    }
}
