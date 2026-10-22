package com.billbull.backend.settings.whatsapp;

import com.billbull.backend.document.HtmlPdfService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DocumentWhatsAppSenderTest {

    private static final byte[] PDF = "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n".getBytes(java.nio.charset.StandardCharsets.US_ASCII);

    @Mock private WhatsAppConfigService configService;
    @Mock private WhatsAppCloudApiClient client;
    @Mock private WhatsAppMessageLogRepository logRepository;
    @Mock private HtmlPdfService pdfService;

    private DocumentWhatsAppSender sender;

    @BeforeEach
    void setUp() {
        sender = new DocumentWhatsAppSender(configService, client, logRepository, pdfService);
    }

    @Test
    void rendersUploadsSendsTemplateAndLogsAccepted() {
        WhatsAppConfig cfg = readyConfig();
        when(configService.requireReady(WhatsAppDocumentType.QUOTATION)).thenReturn(cfg);
        when(pdfService.render("<html/>")).thenReturn(PDF);
        when(client.uploadMedia(eq(cfg), any(), eq("QTN-2026-0016.pdf"), eq("application/pdf"))).thenReturn("media-1");
        when(client.sendDocumentTemplate(eq(cfg), eq("971501234567"), eq("quotation_document"), eq("media-1"),
                eq("QTN-2026-0016.pdf"), anyList())).thenReturn("wamid.ABC");
        when(logRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        WhatsAppMessageLog result = sender.send(request(WhatsAppDocumentType.QUOTATION, "QTN-2026-0016", "0501234567"));

        assertEquals(WhatsAppMessageStatus.ACCEPTED, result.getStatus());
        assertEquals("wamid.ABC", result.getWamid());
        assertEquals("971501234567", result.getToPhone());
        assertEquals("QUOTATION", result.getDocumentType());
    }

    @Test
    void eachDocumentTypeUsesItsOwnTemplate() {
        WhatsAppConfig cfg = readyConfig();
        when(configService.requireReady(any())).thenReturn(cfg);
        when(pdfService.render(anyString())).thenReturn(PDF);
        when(client.uploadMedia(any(), any(), anyString(), anyString())).thenReturn("media-1");
        when(client.sendDocumentTemplate(any(), anyString(), anyString(), anyString(), anyString(), anyList())).thenReturn("wamid.X");
        when(logRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        WhatsAppMessageLog order = sender.send(request(WhatsAppDocumentType.SALES_ORDER, "SO-1", "0501234567"));
        WhatsAppMessageLog invoice = sender.send(request(WhatsAppDocumentType.SALES_INVOICE, "INV-1", "0501234567"));

        verify(client).sendDocumentTemplate(any(), anyString(), eq("sales_order_document"), anyString(), eq("SO-1.pdf"), anyList());
        verify(client).sendDocumentTemplate(any(), anyString(), eq("sales_invoice_document"), anyString(), eq("INV-1.pdf"), anyList());
        assertEquals("SALES_ORDER", order.getDocumentType());
        assertEquals("SALES_INVOICE", invoice.getDocumentType());
    }

    @Test
    void metaRejectionIsLoggedAsFailedAndRethrown() {
        when(configService.requireReady(WhatsAppDocumentType.QUOTATION)).thenReturn(readyConfig());
        when(pdfService.render(anyString())).thenReturn(PDF);
        when(client.uploadMedia(any(), any(), anyString(), anyString())).thenReturn("media-1");
        when(client.sendDocumentTemplate(any(), anyString(), anyString(), anyString(), anyString(), anyList()))
                .thenThrow(new WhatsAppApiException("WhatsApp error 132001: Template name does not exist", 132001));

        assertThrows(WhatsAppApiException.class,
                () -> sender.send(request(WhatsAppDocumentType.QUOTATION, "QTN-1", "0501234567")));

        verify(logRepository).save(argThat(e -> e.getStatus() == WhatsAppMessageStatus.FAILED
                && Integer.valueOf(132001).equals(e.getErrorCode()) && e.getWamid() == null));
    }

    @Test
    void invalidPhoneFailsBeforeRenderingOrCallingMeta() {
        when(configService.requireReady(WhatsAppDocumentType.SALES_ORDER)).thenReturn(readyConfig());

        assertThrows(IllegalArgumentException.class,
                () -> sender.send(request(WhatsAppDocumentType.SALES_ORDER, "SO-1", "")));
        verifyNoInteractions(pdfService, client, logRepository);
    }

    @Test
    void missingHtmlIsRejectedBeforeAnything() {
        DocumentWhatsAppSender.SendRequest noHtml = new DocumentWhatsAppSender.SendRequest(
                WhatsAppDocumentType.SALES_INVOICE, 1L, "INV-1", 1L, "0501234567", " ", "INV-1", List.of());
        assertThrows(IllegalArgumentException.class, () -> sender.send(noHtml));
        verifyNoInteractions(configService, pdfService, client, logRepository);
    }

    // ---------------- W4: the PDF is checked before anything is uploaded ----------------

    @Test
    void aRenderFailureUploadsAndLogsNothing() {
        when(configService.requireReady(WhatsAppDocumentType.QUOTATION)).thenReturn(readyConfig());
        when(pdfService.render(anyString())).thenThrow(new RuntimeException("Timeout 30000ms exceeded"));

        com.billbull.backend.document.DocumentPdfGuard.PdfRejectedException e = assertThrows(
                com.billbull.backend.document.DocumentPdfGuard.PdfRejectedException.class,
                () -> sender.send(request(WhatsAppDocumentType.QUOTATION, "QTN-1", "0501234567")));

        assertEquals(com.billbull.backend.document.DocumentPdfGuard.Reason.RENDER_FAILED, e.reason());
        assertEquals("Could not generate the PDF, so nothing was sent on WhatsApp.", e.getMessage());
        assertFalse(e.getMessage().contains("Timeout"), "renderer internals stay in the log");
        verifyNoInteractions(client, logRepository);
    }

    @Test
    void contentThatIsNotACompletePdfIsNeverUploaded() {
        when(configService.requireReady(WhatsAppDocumentType.QUOTATION)).thenReturn(readyConfig());
        byte[][] bad = {
                new byte[0],
                "<html>error page</html>".getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                "%PDF-1.7\n1 0 obj\n<<>>".getBytes(java.nio.charset.StandardCharsets.US_ASCII), // truncated: no %%EOF
                null};
        for (byte[] bytes : bad) {
            when(pdfService.render(anyString())).thenReturn(bytes);
            com.billbull.backend.document.DocumentPdfGuard.PdfRejectedException e = assertThrows(
                    com.billbull.backend.document.DocumentPdfGuard.PdfRejectedException.class,
                    () -> sender.send(request(WhatsAppDocumentType.QUOTATION, "QTN-1", "0501234567")));
            assertEquals(com.billbull.backend.document.DocumentPdfGuard.Reason.NOT_A_PDF, e.reason());
        }
        verifyNoInteractions(client, logRepository);
    }

    @Test
    void aPdfOverMetasDocumentLimitIsNeverUploaded() {
        when(configService.requireReady(WhatsAppDocumentType.QUOTATION)).thenReturn(readyConfig());
        byte[] huge = new byte[DocumentWhatsAppSender.MAX_PDF_BYTES + 1];
        System.arraycopy(PDF, 0, huge, 0, PDF.length);
        when(pdfService.render(anyString())).thenReturn(huge);

        com.billbull.backend.document.DocumentPdfGuard.PdfRejectedException e = assertThrows(
                com.billbull.backend.document.DocumentPdfGuard.PdfRejectedException.class,
                () -> sender.send(request(WhatsAppDocumentType.QUOTATION, "QTN-1", "0501234567")));
        assertEquals(com.billbull.backend.document.DocumentPdfGuard.Reason.TOO_LARGE, e.reason());
        assertEquals("The PDF is larger than 100 MB, so nothing was sent on WhatsApp.", e.getMessage());
        verifyNoInteractions(client, logRepository);
    }

    @Test
    void oversizedHtmlIsRefusedBeforeConfigOrRendering() {
        DocumentWhatsAppSender.SendRequest tooBig = new DocumentWhatsAppSender.SendRequest(
                WhatsAppDocumentType.QUOTATION, 1L, "QTN-1", 1L, "0501234567",
                "x".repeat(com.billbull.backend.document.DocumentPdfGuard.MAX_HTML_CHARS + 1), "QTN-1", List.of());
        assertThrows(IllegalArgumentException.class, () -> sender.send(tooBig));
        verifyNoInteractions(configService, pdfService, client, logRepository);
    }

    @Test
    void theUploadedBytesAreExactlyTheValidatedPdf() {
        WhatsAppConfig cfg = readyConfig();
        when(configService.requireReady(WhatsAppDocumentType.QUOTATION)).thenReturn(cfg);
        when(pdfService.render(anyString())).thenReturn(PDF);
        when(client.uploadMedia(any(), any(), anyString(), anyString())).thenReturn("media-1");
        when(client.sendDocumentTemplate(any(), anyString(), anyString(), anyString(), anyString(), anyList())).thenReturn("wamid.X");
        when(logRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        sender.send(request(WhatsAppDocumentType.QUOTATION, "QTN-1", "0501234567"));

        verify(client).uploadMedia(eq(cfg), eq(PDF), eq("QTN-1.pdf"), eq("application/pdf"));
    }

    @Test
    void phoneNumbersAreMaskedForLogs() {
        assertEquals("********4567", DocumentWhatsAppSender.maskPhone("971501234567"));
        assertEquals("****", DocumentWhatsAppSender.maskPhone("12"));
        assertEquals("****", DocumentWhatsAppSender.maskPhone(null));
    }

    @Test
    void filenameIsSanitisedAndGetsPdfExtension() {
        assertEquals("QTN_2026_1.pdf", DocumentWhatsAppSender.safeFilename("QTN/2026/1", null));
        assertEquals("QTN-1.pdf", DocumentWhatsAppSender.safeFilename(null, "QTN-1"));
    }

    // ---------------- fixtures ----------------

    private static WhatsAppConfig readyConfig() {
        WhatsAppConfig c = new WhatsAppConfig();
        c.setEnabled(true);
        c.setPhoneNumberId("123");
        c.setAccessToken("token");
        c.setDefaultCountryCode("971");
        c.setQuotationTemplateName("quotation_document");
        c.setSalesOrderTemplateName("sales_order_document");
        c.setSalesInvoiceTemplateName("sales_invoice_document");
        return c;
    }

    private static DocumentWhatsAppSender.SendRequest request(WhatsAppDocumentType type, String docNo, String phone) {
        return new DocumentWhatsAppSender.SendRequest(type, 16L, docNo, 1L, phone, "<html/>", docNo,
                List.of("Test Customer", docNo, "AED 2,800.00", "08 Oct 2026"));
    }
}
