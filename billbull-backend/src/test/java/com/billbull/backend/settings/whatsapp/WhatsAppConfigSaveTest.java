package com.billbull.backend.settings.whatsapp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** W1/W2: saving and reloading WhatsApp Settings, over an in-memory single row. */
class WhatsAppConfigSaveTest {

    private final WhatsAppConfigRepository repo = mock(WhatsAppConfigRepository.class);
    private final AtomicReference<WhatsAppConfig> row = new AtomicReference<>();
    private WhatsAppConfigService service;

    @BeforeEach
    void setUp() {
        when(repo.findById(1L)).thenAnswer(inv -> Optional.ofNullable(row.get()));
        when(repo.save(any())).thenAnswer(inv -> {
            row.set(inv.getArgument(0));
            return inv.getArgument(0);
        });
        service = new WhatsAppConfigService(repo);
    }

    // ---------------- W2: template names ----------------

    @Test
    void aClearedTemplateNameStaysEmptyAfterSaveAndReload() {
        WhatsAppConfig form = filledForm();
        form.setSalesOrderTemplateName("   ");
        form.setSalesInvoiceTemplateName("");

        service.saveConfig(form);
        WhatsAppConfig reloaded = service.getConfigMasked();

        assertEquals("quotation_document", reloaded.getQuotationTemplateName());
        assertNull(reloaded.getSalesOrderTemplateName());
        assertNull(reloaded.getSalesInvoiceTemplateName());
        assertEquals(Map.of("QUOTATION", true, "SALES_ORDER", false, "SALES_INVOICE", false),
                service.publicStatus().get("templates"));
    }

    @Test
    void aRequestThatOmitsTemplateNamesStoresNoneNoDefaultIsPersisted() throws Exception {
        // The page sends every field, but a direct client may not: an omitted name must not turn into a guess.
        WhatsAppConfig parsed = new ObjectMapper().readValue(
                "{\"enabled\":false,\"phoneNumberId\":\"123456789012345\",\"templateLanguage\":\"en\"}", WhatsAppConfig.class);

        service.saveConfig(parsed);

        assertNull(row.get().getQuotationTemplateName());
        assertNull(row.get().getSalesOrderTemplateName());
        assertNull(row.get().getSalesInvoiceTemplateName());
    }

    @Test
    void aFreshTenantHasNoTemplatesSet() {
        WhatsAppConfig fresh = service.getConfigMasked();
        assertNull(fresh.getQuotationTemplateName());
        assertNull(fresh.getSalesOrderTemplateName());
        assertNull(fresh.getSalesInvoiceTemplateName());
        assertEquals("v25.0", fresh.getGraphApiVersion());
    }

    @Test
    void templateNamesAndLanguageMustBeMetaShaped() {
        for (String bad : new String[] {"Quotation Document", "quotation-document", "quotation_document;drop", "QUOTATION"}) {
            WhatsAppConfig form = filledForm();
            form.setQuotationTemplateName(bad);
            assertBadRequest(form, "template name");
        }
        for (String bad : new String[] {"english", "EN", "en-US", "e"}) {
            WhatsAppConfig form = filledForm();
            form.setTemplateLanguage(bad);
            assertBadRequest(form, "Language Code");
        }
        for (String ok : new String[] {"en", "ar", "en_US", "pt_BR"}) {
            WhatsAppConfig form = filledForm();
            form.setTemplateLanguage(ok);
            assertEquals(ok, service.saveConfig(form).getTemplateLanguage());
        }
    }

    // ---------------- W1: Graph API version ----------------

    @Test
    void aBlankVersionIsSavedAsTheNewDefault() {
        WhatsAppConfig form = filledForm();
        form.setGraphApiVersion(" ");
        assertEquals("v25.0", service.saveConfig(form).getGraphApiVersion());
    }

    @Test
    void anExplicitSupportedVersionIsNotOverwritten() {
        WhatsAppConfig form = filledForm();
        form.setGraphApiVersion("v23.0");
        assertEquals("v23.0", service.saveConfig(form).getGraphApiVersion());
    }

    @Test
    void invalidOrExpiredVersionsAreRefusedAndNothingIsSaved() {
        for (String v : new String[] {"21", "v21.1", "v25.0/../x", "v19.0"}) {
            WhatsAppConfig form = filledForm();
            form.setGraphApiVersion(v);
            assertBadRequest(form, "v25.0");
        }
        verify(repo, never()).save(any());
    }

    @Test
    void theResponseCarriesTheVersionStatusButNoSecrets() throws Exception {
        WhatsAppConfig form = filledForm();
        form.setAccessToken("EAAG-real-looking-token-value");
        form.setAppSecret("app-secret-value-123");

        WhatsAppConfig saved = service.saveConfig(form);
        // Spring Boot's mapper writes dates as ISO strings, not [yyyy,m,d] arrays.
        String json = new ObjectMapper().findAndRegisterModules()
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                .writeValueAsString(saved);

        assertTrue(json.contains("\"graphApiVersionStatus\""), json);
        assertTrue(json.contains("2028-07-29"), json);
        assertFalse(json.contains("EAAG-real-looking-token-value"));
        assertFalse(json.contains("app-secret-value-123"));
    }

    // ---------------- fixtures ----------------

    private void assertBadRequest(WhatsAppConfig form, String part) {
        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> service.saveConfig(form));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertTrue(String.valueOf(e.getReason()).contains(part), e.getReason());
    }

    private static WhatsAppConfig filledForm() {
        WhatsAppConfig c = new WhatsAppConfig();
        c.setEnabled(false);
        c.setGraphApiVersion("v25.0");
        c.setPhoneNumberId("123456789012345");
        c.setBusinessAccountId("102290129340398");
        c.setQuotationTemplateName("quotation_document");
        c.setSalesOrderTemplateName("sales_order_document");
        c.setSalesInvoiceTemplateName("sales_invoice_document");
        c.setTemplateLanguage("en");
        c.setDefaultCountryCode("971");
        return c;
    }
}
