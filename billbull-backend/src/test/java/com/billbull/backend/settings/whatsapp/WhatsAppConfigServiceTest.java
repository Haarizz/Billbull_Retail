package com.billbull.backend.settings.whatsapp;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
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

    // ---------------- fixtures ----------------

    private static WhatsAppConfig connected() {
        WhatsAppConfig c = new WhatsAppConfig();
        c.setEnabled(true);
        c.setPhoneNumberId("123");
        c.setAccessToken("secret-token");
        return c;
    }
}
