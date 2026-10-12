package com.billbull.backend.sales.quotation;

import com.billbull.backend.customer.messaging.MessageLog;
import com.billbull.backend.customer.messaging.MessagingService;
import com.billbull.backend.settings.email.DocumentEmailSender;
import com.billbull.backend.settings.email.EmailConfigService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.MailSendException;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Quotation keeps its own defaults and MessageLog; MIME + PDF go through DocumentEmailSender. */
@ExtendWith(MockitoExtension.class)
class QuotationEmailServiceTest {

    @Mock private EmailConfigService emailConfigService;
    @Mock private MessagingService messagingService;
    @Mock private DocumentEmailSender documentEmailSender;

    private QuotationEmailService service;

    @BeforeEach
    void setUp() {
        service = new QuotationEmailService(emailConfigService, messagingService, documentEmailSender);
    }

    @Test
    void delegatesBodyInlineImagesAndPdfWithTheGlobalSenderIdentity() throws Exception {
        List<Map<String, String>> inline = List.of(Map.of("cid", "inline-img-0", "base64", "AA==", "contentType", "image/png"));
        DocumentEmailSender.PdfAttachment pdf = new DocumentEmailSender.PdfAttachment("<html>print</html>", "QTN-1.pdf");

        service.sendQuotationEmail(quotation(), "buyer@example.com", "Our quote", "<p>designed</p>", inline, pdf);

        // branchId null = plain configured From name, no reply-to — as before the refactor.
        verify(documentEmailSender).send("buyer@example.com", "Our quote", "<p>designed</p>", inline, null, pdf);
        ArgumentCaptor<MessageLog> log = ArgumentCaptor.forClass(MessageLog.class);
        verify(messagingService).logMessage(log.capture());
        assertEquals("buyer@example.com", log.getValue().getRecipientContact());
        assertEquals("email", log.getValue().getChannel());
        assertEquals("sent", log.getValue().getStatus());
        assertEquals("Our quote", log.getValue().getTitle());
    }

    @Test
    void defaultsRecipientSubjectAndLegacyBody() throws Exception {
        when(emailConfigService.getFromName()).thenReturn("Acme Trading");

        service.sendQuotationEmail(quotation(), "", "", "", null, null);

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(documentEmailSender).send(eq("customer@example.com"), eq("Quotation QTN-1 from Acme Trading"),
                body.capture(), isNull(), isNull(), isNull());
        assertTrue(body.getValue().contains("QTN-1"), "legacy hand-built body");
    }

    @Test
    void legacyFiveArgOverloadSendsWithoutPdf() throws Exception {
        service.sendQuotationEmail(quotation(), "buyer@example.com", "Quote", "<p>x</p>", null);

        verify(documentEmailSender).send("buyer@example.com", "Quote", "<p>x</p>", null, null, null);
    }

    @Test
    void missingRecipientIsRejectedWithoutSending() throws Exception {
        Quotation q = quotation();
        q.setCustomerEmail(null);

        assertThrows(IllegalArgumentException.class, () ->
                service.sendQuotationEmail(q, null, "Quote", "<p>x</p>", null, null));
        verifyNoInteractions(documentEmailSender, messagingService);
    }

    @Test
    void failedSendOrPdfIsNotLoggedAsSent() throws Exception {
        doThrow(new IllegalStateException("Could not generate the PDF attachment, so the email was not sent."))
                .when(documentEmailSender).send(anyString(), anyString(), anyString(), any(), any(), any());
        assertThrows(IllegalStateException.class, () ->
                service.sendQuotationEmail(quotation(), "buyer@example.com", "Quote", "<p>x</p>", null,
                        new DocumentEmailSender.PdfAttachment("<html/>", "QTN-1.pdf")));

        doThrow(new MailSendException("smtp down"))
                .when(documentEmailSender).send(anyString(), anyString(), anyString(), any(), any(), any());
        assertThrows(MailSendException.class, () ->
                service.sendQuotationEmail(quotation(), "buyer@example.com", "Quote", "<p>x</p>", null, null));

        verifyNoInteractions(messagingService);
    }

    private static Quotation quotation() {
        Quotation q = new Quotation();
        q.setQtnNo("QTN-1");
        q.setCustomer("Buyer LLC");
        q.setCustomerEmail("customer@example.com");
        q.setItems(new ArrayList<>());
        q.setSubTotal(BigDecimal.TEN);
        q.setTaxAmount(BigDecimal.ZERO);
        q.setTotalAmount(BigDecimal.TEN);
        return q;
    }
}
