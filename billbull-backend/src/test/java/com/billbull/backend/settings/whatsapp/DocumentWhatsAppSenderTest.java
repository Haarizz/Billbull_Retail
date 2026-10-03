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
        when(pdfService.render("<html/>")).thenReturn(new byte[]{1, 2, 3});
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
        when(pdfService.render(anyString())).thenReturn(new byte[]{1});
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
        when(pdfService.render(anyString())).thenReturn(new byte[]{1});
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
        return c;
    }

    private static DocumentWhatsAppSender.SendRequest request(WhatsAppDocumentType type, String docNo, String phone) {
        return new DocumentWhatsAppSender.SendRequest(type, 16L, docNo, 1L, phone, "<html/>", docNo,
                List.of("Test Customer", docNo, "AED 2,800.00", "08 Oct 2026"));
    }
}
