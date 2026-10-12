package com.billbull.backend.settings.email;

import com.billbull.backend.document.HtmlPdfService;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import jakarta.mail.BodyPart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * MIME-level tests for document emails. The captured message is written to bytes
 * and parsed back, so the assertions run against the wire format SMTP would get.
 */
@ExtendWith(MockitoExtension.class)
class DocumentEmailSenderTest {

    private static final byte[] PDF = "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 1, 2, 3};
    private static final String HTML = "<html><body><img src=\"cid:inline-img-0\"/>Invoice</body></html>";
    private static final String PRINT_HTML = "<html><head><style>@page{size:A4}</style></head><body>print</body></html>";

    @Mock private EmailConfigService emailConfigService;
    @Mock private BranchRepository branchRepository;
    @Mock private HtmlPdfService pdfService;
    @Mock private JavaMailSender mailSender;

    private DocumentEmailSender sender;
    private final Session session = Session.getInstance(new Properties());

    @BeforeEach
    void setUp() {
        sender = new DocumentEmailSender(emailConfigService, branchRepository, pdfService);
    }

    // ---------------------------------------------------------------- happy paths

    @Test
    void pdfIsAttachedAlongsideInlineImagesInMixedRelatedTree() throws Exception {
        mailReady();
        when(pdfService.render(PRINT_HTML)).thenReturn(PDF);

        sender.send("customer@example.com", "Sales Invoice INV-1", HTML, inline(),
                null, new DocumentEmailSender.PdfAttachment(PRINT_HTML, "INV-2026-0001.pdf"));

        MimeMessage sent = roundTrip(captureSent());
        MimeMultipart mixed = (MimeMultipart) sent.getContent();
        assertTrue(mixed.getContentType().startsWith("multipart/mixed"), mixed.getContentType());
        assertEquals(2, mixed.getCount());

        MimeMultipart related = (MimeMultipart) mixed.getBodyPart(0).getContent();
        assertTrue(related.getContentType().startsWith("multipart/related"), related.getContentType());
        assertEquals(2, related.getCount());
        BodyPart html = related.getBodyPart(0);
        assertTrue(html.isMimeType("text/html"));
        assertEquals(HTML, html.getContent());
        BodyPart image = related.getBodyPart(1);
        assertTrue(image.isMimeType("image/png"));
        assertEquals("<inline-img-0>", image.getHeader("Content-ID")[0]);
        assertEquals(Part.INLINE, image.getDisposition());
        assertArrayEquals(PNG, read(image));

        BodyPart pdf = mixed.getBodyPart(1);
        assertTrue(pdf.isMimeType("application/pdf"), pdf.getContentType());
        assertEquals(Part.ATTACHMENT, pdf.getDisposition());
        assertEquals("INV-2026-0001.pdf", pdf.getFileName());
        byte[] pdfBytes = read(pdf);
        assertArrayEquals(PDF, pdfBytes);
        assertEquals("%PDF-", new String(Arrays.copyOf(pdfBytes, 5), StandardCharsets.US_ASCII));
    }

    @Test
    void pdfIsAttachedWhenTheBodyHasNoInlineImages() throws Exception {
        mailReady();
        when(pdfService.render(PRINT_HTML)).thenReturn(PDF);

        sender.send("customer@example.com", "SO-1", "<p>Order</p>", List.of(),
                null, new DocumentEmailSender.PdfAttachment(PRINT_HTML, "SO-1.pdf"));

        MimeMultipart mixed = (MimeMultipart) roundTrip(captureSent()).getContent();
        assertTrue(mixed.getContentType().startsWith("multipart/mixed"));
        MimeMultipart related = (MimeMultipart) mixed.getBodyPart(0).getContent();
        assertEquals(1, related.getCount());
        assertEquals("<p>Order</p>", related.getBodyPart(0).getContent());
        assertEquals("SO-1.pdf", mixed.getBodyPart(1).getFileName());
        assertTrue(mixed.getBodyPart(1).isMimeType("application/pdf"));
    }

    @Test
    void branchFromNameAndReplyToSurviveThePdfPath() throws Exception {
        mailReady();
        Branch branch = new Branch();
        branch.setName("Dubai Branch");
        branch.setEmail("dubai@example.com");
        when(branchRepository.findById(7L)).thenReturn(Optional.of(branch));
        when(pdfService.render(PRINT_HTML)).thenReturn(PDF);

        sender.send("customer@example.com", "INV-1", HTML, inline(), 7L,
                new DocumentEmailSender.PdfAttachment(PRINT_HTML, "INV-1.pdf"));

        MimeMessage sent = roundTrip(captureSent());
        InternetAddress from = (InternetAddress) sent.getFrom()[0];
        assertEquals("billing@example.com", from.getAddress());
        assertEquals("Acme Trading — Dubai Branch", from.getPersonal());
        assertEquals("dubai@example.com", ((InternetAddress) sent.getReplyTo()[0]).getAddress());
        assertEquals("customer@example.com", ((InternetAddress) sent.getAllRecipients()[0]).getAddress());
        assertEquals("INV-1", sent.getSubject());
    }

    // ------------------------------------------------- legacy (no pdfHtml) path

    @Test
    void withoutPdfAndInlineImagesTheMessageStaysSinglePartHtml() throws Exception {
        mailReady();

        sender.send("customer@example.com", "DN-1", "<p>Delivery</p>", null);

        MimeMessage sent = roundTrip(captureSent());
        assertTrue(sent.isMimeType("text/html"), sent.getContentType());
        assertEquals("<p>Delivery</p>", sent.getContent());
        verifyNoInteractions(pdfService);
    }

    @Test
    void withoutPdfInlineImagesKeepTheirExistingStructure() throws Exception {
        mailReady();

        sender.send("customer@example.com", "RV-1", HTML, inline());

        MimeMultipart mixed = (MimeMultipart) roundTrip(captureSent()).getContent();
        assertEquals(1, mixed.getCount(), "no attachment part without pdfHtml");
        MimeMultipart related = (MimeMultipart) mixed.getBodyPart(0).getContent();
        assertEquals("<inline-img-0>", related.getBodyPart(1).getHeader("Content-ID")[0]);
        verifyNoInteractions(pdfService);
    }

    // ------------------------------------------------------- failures: no send

    @Test
    void rendererFailurePreventsTheSend() throws Exception {
        when(emailConfigService.buildMailSender()).thenReturn(mailSender);
        when(emailConfigService.getFromAddress()).thenReturn("billing@example.com");
        when(emailConfigService.getFromName()).thenReturn("Acme Trading");
        when(pdfService.render(anyString())).thenThrow(new RuntimeException("Timeout 30000ms exceeded"));

        IllegalStateException e = assertThrows(IllegalStateException.class, () ->
                sender.send("customer@example.com", "INV-1", HTML, inline(), null,
                        new DocumentEmailSender.PdfAttachment(PRINT_HTML, "INV-1.pdf")));
        assertTrue(e.getMessage().contains("PDF attachment"));
        verify(mailSender, never()).send(any(MimeMessage.class));
    }

    @Test
    void nonPdfEmptyOrNullRendererOutputIsRejected() throws Exception {
        for (byte[] bad : new byte[][]{"<html>".getBytes(), new byte[0], "%PDF-".getBytes(), null}) {
            when(emailConfigService.buildMailSender()).thenReturn(mailSender);
            when(emailConfigService.getFromAddress()).thenReturn("billing@example.com");
            when(emailConfigService.getFromName()).thenReturn("Acme Trading");
            when(pdfService.render(anyString())).thenReturn(bad);

            assertThrows(IllegalStateException.class, () ->
                    sender.send("customer@example.com", "INV-1", HTML, null, null,
                            new DocumentEmailSender.PdfAttachment(PRINT_HTML, "INV-1.pdf")));
        }
        verify(mailSender, never()).send(any(MimeMessage.class));
    }

    @Test
    void oversizedPdfIsRejected() throws Exception {
        when(emailConfigService.buildMailSender()).thenReturn(mailSender);
        when(emailConfigService.getFromAddress()).thenReturn("billing@example.com");
        when(emailConfigService.getFromName()).thenReturn("Acme Trading");
        byte[] huge = new byte[DocumentEmailSender.MAX_PDF_BYTES + 1];
        System.arraycopy(PDF, 0, huge, 0, PDF.length);
        when(pdfService.render(anyString())).thenReturn(huge);

        assertThrows(IllegalStateException.class, () ->
                sender.send("customer@example.com", "INV-1", HTML, null, null,
                        new DocumentEmailSender.PdfAttachment(PRINT_HTML, "INV-1.pdf")));
        verify(mailSender, never()).send(any(MimeMessage.class));
    }

    @Test
    void blankOrOversizedPdfHtmlIsRejectedBeforeConfigOrRendering() {
        String tooBig = "x".repeat(DocumentEmailSender.MAX_PDF_HTML_CHARS + 1);
        for (String html : new String[]{"", "   ", tooBig}) {
            assertThrows(IllegalArgumentException.class, () ->
                    sender.send("customer@example.com", "INV-1", HTML, null, null,
                            new DocumentEmailSender.PdfAttachment(html, "INV-1.pdf")));
        }
        verifyNoInteractions(pdfService, emailConfigService);
    }

    @Test
    void disabledEmailFailsBeforeTheExpensiveRender() {
        when(emailConfigService.buildMailSender()).thenThrow(new IllegalStateException(
                "Email is disabled. Go to Settings → Email Settings and enable it."));

        IllegalStateException e = assertThrows(IllegalStateException.class, () ->
                sender.send("customer@example.com", "INV-1", HTML, null, null,
                        new DocumentEmailSender.PdfAttachment(PRINT_HTML, "INV-1.pdf")));
        assertTrue(e.getMessage().startsWith("Email is disabled"));
        verifyNoInteractions(pdfService);
    }

    @Test
    void smtpFailurePropagatesAfterTheMessageWasBuilt() throws Exception {
        mailReady();
        when(pdfService.render(PRINT_HTML)).thenReturn(PDF);
        doThrow(new MailSendException("535 Authentication failed")).when(mailSender).send(any(MimeMessage.class));

        assertThrows(MailSendException.class, () ->
                sender.send("customer@example.com", "INV-1", HTML, null, null,
                        new DocumentEmailSender.PdfAttachment(PRINT_HTML, "INV-1.pdf")));
    }

    // ------------------------------------------------------ request + filename

    @Test
    void fromRequestIgnoresClientFilenameAndUsesTheDocumentNumber() {
        Map<String, Object> body = new HashMap<>();
        body.put("pdfHtml", PRINT_HTML);
        body.put("filename", "../../evil.exe");
        body.put("pdfFilename", "evil.exe");

        DocumentEmailSender.PdfAttachment pdf =
                DocumentEmailSender.PdfAttachment.fromRequest(body, "INV-2026-0001", "Sales-Invoice-1");

        assertEquals(PRINT_HTML, pdf.html());
        assertEquals("INV-2026-0001.pdf", pdf.filename());
    }

    @Test
    void fromRequestReturnsNullForOlderFrontendsAndRejectsNonStrings() {
        assertNull(DocumentEmailSender.PdfAttachment.fromRequest(null, "INV-1", "x"));
        assertNull(DocumentEmailSender.PdfAttachment.fromRequest(Map.of("htmlBody", HTML), "INV-1", "x"));
        Map<String, Object> nullValue = new HashMap<>();
        nullValue.put("pdfHtml", null);
        assertNull(DocumentEmailSender.PdfAttachment.fromRequest(nullValue, "INV-1", "x"));
        assertThrows(IllegalArgumentException.class, () ->
                DocumentEmailSender.PdfAttachment.fromRequest(Map.of("pdfHtml", List.of()), "INV-1", "x"));
        // Present but blank is a PDF request, so it fails at send time instead of dropping the PDF.
        assertNotNull(DocumentEmailSender.PdfAttachment.fromRequest(Map.of("pdfHtml", ""), "INV-1", "x"));
    }

    @Test
    void pdfFilenameIsSafeAscii() {
        assertEquals("INV-2026-0001.pdf", DocumentEmailSender.pdfFilename("INV-2026-0001", "fallback"));
        assertEquals("INV_2026_001.pdf", DocumentEmailSender.pdfFilename("INV/2026/001", "fallback"));
        assertEquals("_.._etc_passwd.pdf", DocumentEmailSender.pdfFilename("../../etc/passwd", "fallback"));
        assertEquals("QTN-7.pdf", DocumentEmailSender.pdfFilename("QTN-7.PDF", "fallback"));
        assertEquals("Sales-Invoice-9.pdf", DocumentEmailSender.pdfFilename(null, "Sales-Invoice-9"));
        assertEquals("Sales-Invoice-9.pdf", DocumentEmailSender.pdfFilename("  ", "Sales-Invoice-9"));
        assertEquals("______-1.pdf", DocumentEmailSender.pdfFilename("فاتورة-1", "fallback"));
        String longName = DocumentEmailSender.pdfFilename("A".repeat(300), "fallback");
        assertEquals(104, longName.length());
    }

    // ------------------------------------------------------------- fixtures

    private void mailReady() {
        when(emailConfigService.buildMailSender()).thenReturn(mailSender);
        when(emailConfigService.getFromAddress()).thenReturn("billing@example.com");
        when(emailConfigService.getFromName()).thenReturn("Acme Trading");
        when(mailSender.createMimeMessage()).thenReturn(new MimeMessage(session));
    }

    private static List<Map<String, String>> inline() {
        return List.of(Map.of(
                "cid", "inline-img-0",
                "contentType", "image/png",
                "base64", Base64.getEncoder().encodeToString(PNG)));
    }

    private MimeMessage captureSent() {
        ArgumentCaptor<MimeMessage> captor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mailSender).send(captor.capture());
        return captor.getValue();
    }

    /** Serialise exactly as SMTP would and parse it back. */
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
