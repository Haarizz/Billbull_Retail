package com.billbull.backend.settings.whatsapp;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WhatsAppConfigServiceTest {

    @Mock private WhatsAppConfigRepository repo;

    private WhatsAppConfigService service;

    @BeforeEach
    void setUp() {
        service = new WhatsAppConfigService(repo);
    }

    @Test
    void requireReadyRejectsADocumentWithoutATemplate() {
        WhatsAppConfig cfg = connected();
        cfg.setSalesInvoiceTemplateName(null);
        when(repo.findById(1L)).thenReturn(Optional.of(cfg));

        assertSame(cfg, service.requireReady(WhatsAppDocumentType.QUOTATION));
        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> service.requireReady(WhatsAppDocumentType.SALES_INVOICE));
        assertTrue(e.getMessage().contains("Sales Invoice"));
    }

    @Test
    void requireReadyRejectsWhenDisabled() {
        WhatsAppConfig cfg = connected();
        cfg.setEnabled(false);
        when(repo.findById(1L)).thenReturn(Optional.of(cfg));

        assertThrows(IllegalStateException.class, () -> service.requireReady(WhatsAppDocumentType.QUOTATION));
    }

    @Test
    void publicStatusReportsTemplatesPerDocumentAndNoSecrets() {
        WhatsAppConfig cfg = connected();
        cfg.setSalesOrderTemplateName(null);
        when(repo.findById(1L)).thenReturn(Optional.of(cfg));

        Map<String, Object> status = service.publicStatus();

        assertEquals(true, status.get("enabled"));
        assertEquals(Map.of("QUOTATION", true, "SALES_ORDER", false, "SALES_INVOICE", true), status.get("templates"));
        assertFalse(status.toString().contains("secret-token"));
    }

    @Test
    void savingTheMaskKeepsStoredSecrets() {
        when(repo.findById(1L)).thenReturn(Optional.of(connected()));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        WhatsAppConfig incoming = connected();
        incoming.setAccessToken(WhatsAppConfigService.MASK);
        WhatsAppConfig result = service.saveConfig(incoming);

        assertEquals("secret-token", incoming.getAccessToken());
        assertEquals(WhatsAppConfigService.MASK, result.getAccessToken());
    }

    // ---------------- T-P0-4: Meta identifiers ----------------

    @Test
    void anAutofilledUsernameIsRefusedAsTheWabaIdAndNothingIsSaved() {
        WhatsAppConfig incoming = connected();
        incoming.setBusinessAccountId("admin");

        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> service.saveConfig(incoming));

        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertTrue(e.getReason().startsWith("WhatsApp Business Account ID must contain digits only"), e.getReason());
        assertFalse(e.getReason().contains("admin"), "the rejected value is never echoed");
        verify(repo, never()).save(any());
    }

    @Test
    void aNonNumericPhoneNumberIdIsRefused() {
        for (String bad : new String[] {"+971501234567", "1065 4035 2242", "10654035224292x", "١٢٣", "a".repeat(10)}) {
            WhatsAppConfig incoming = connected();
            incoming.setPhoneNumberId(bad);
            ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> service.saveConfig(incoming), bad);
            assertTrue(e.getReason().startsWith("Phone Number ID must contain digits only"), e.getReason());
        }
        WhatsAppConfig tooLong = connected();
        tooLong.setPhoneNumberId("1".repeat(65));
        assertThrows(ResponseStatusException.class, () -> service.saveConfig(tooLong), "longer than the column");
        verify(repo, never()).save(any());
    }

    @Test
    void numericIdsAreTrimmedAndSavedAndBlankIdsStayUnset() {
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        WhatsAppConfig incoming = connected();
        incoming.setPhoneNumberId("  106540352242922 ");
        incoming.setBusinessAccountId("\t102290129340398");
        WhatsAppConfig saved = service.saveConfig(incoming);
        assertEquals("106540352242922", saved.getPhoneNumberId());
        assertEquals("102290129340398", saved.getBusinessAccountId());

        WhatsAppConfig blank = connected();
        blank.setPhoneNumberId("   ");
        blank.setBusinessAccountId("");
        WhatsAppConfig savedBlank = service.saveConfig(blank);
        assertNull(savedBlank.getPhoneNumberId());
        assertNull(savedBlank.getBusinessAccountId());
    }

    @Test
    void unchangedMaskedSecretsAreAllKeptAndStillMaskedInTheResponse() {
        WhatsAppConfig stored = connected();
        stored.setAppSecret("stored-app-secret");
        stored.setWebhookVerifyToken("stored-verify-token");
        when(repo.findById(1L)).thenReturn(Optional.of(stored));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        WhatsAppConfig incoming = connected();
        incoming.setAccessToken(WhatsAppConfigService.MASK);
        incoming.setAppSecret(WhatsAppConfigService.MASK);
        incoming.setWebhookVerifyToken(WhatsAppConfigService.MASK);
        WhatsAppConfig result = service.saveConfig(incoming);

        assertEquals("secret-token", incoming.getAccessToken());
        assertEquals("stored-app-secret", incoming.getAppSecret());
        assertEquals("stored-verify-token", incoming.getWebhookVerifyToken());
        assertEquals(WhatsAppConfigService.MASK, result.getAccessToken());
        assertEquals(WhatsAppConfigService.MASK, result.getAppSecret());
        assertEquals(WhatsAppConfigService.MASK, result.getWebhookVerifyToken());
    }

    // ---------------- fixtures ----------------

    private static WhatsAppConfig connected() {
        WhatsAppConfig c = new WhatsAppConfig();
        c.setEnabled(true);
        c.setPhoneNumberId("123");
        c.setAccessToken("secret-token");
        c.setQuotationTemplateName("quotation_document");
        c.setSalesOrderTemplateName("sales_order_document");
        c.setSalesInvoiceTemplateName("sales_invoice_document");
        return c;
    }
}
