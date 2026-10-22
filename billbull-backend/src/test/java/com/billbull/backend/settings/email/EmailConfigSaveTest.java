package com.billbull.backend.settings.email;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * E1/E2: saving and reloading Email Settings. The repository is an in-memory single row, so a
 * save followed by a reload reads back what was stored.
 */
class EmailConfigSaveTest {

    private static final String STORED = "stored-app-password-1234";

    private final EmailConfigRepository repo = mock(EmailConfigRepository.class);
    private final AtomicReference<EmailConfig> row = new AtomicReference<>();
    private EmailConfigService service;

    @BeforeEach
    void setUp() {
        when(repo.findById(1L)).thenAnswer(inv -> Optional.ofNullable(row.get()));
        when(repo.save(any())).thenAnswer(inv -> {
            EmailConfig saved = copy(inv.getArgument(0));
            row.set(saved);
            return saved;
        });
        service = new EmailConfigService(repo);
    }

    // ---------------- E1: the stored password ----------------

    @Test
    void aSavedPasswordIsNeverReturnedOnlyWhetherOneIsSet() throws Exception {
        row.set(existing());

        EmailConfigResponse view = service.getConfigView();

        assertTrue(view.passwordSet());
        String json = new ObjectMapper().writeValueAsString(view);
        assertFalse(json.contains(STORED), json);
        assertFalse(json.contains("\"password\""), "no password field at all: " + json);
        assertFalse(json.contains(EmailConfigService.LEGACY_MASK), "no mask either: " + json);
    }

    @Test
    void anUntouchedOrBlankPasswordKeepsTheStoredOneAcrossSaveAndReload() {
        row.set(existing());

        for (String untouched : new String[] {null, "", "   ", EmailConfigService.LEGACY_MASK}) {
            EmailConfigRequest req = gmailRequest();
            req.setPassword(untouched);
            req.setFromName("Renamed " + (untouched == null ? "null" : untouched.length()));

            EmailConfigResponse saved = service.saveConfig(req);

            assertTrue(saved.passwordSet(), "after save with " + describe(untouched));
            assertEquals(STORED, row.get().getPassword(), "stored password after save with " + describe(untouched));
            assertTrue(service.getConfigView().passwordSet(), "reload after save with " + describe(untouched));
        }
    }

    @Test
    void aTypedPasswordReplacesTheStoredOne() {
        row.set(existing());
        EmailConfigRequest req = gmailRequest();
        req.setPassword("  brand-new-app-password  ");

        service.saveConfig(req);

        assertEquals("brand-new-app-password", row.get().getPassword(), "surrounding spaces trimmed");
    }

    @Test
    void typingIntoTheOldMaskIsAReplacementNotAnAppendToTheStoredValue() {
        // The old page let the user type after the dots; the server must not keep "dots + text"
        // as if it were the mask, and must not silently keep the old password either.
        row.set(existing());
        EmailConfigRequest req = gmailRequest();
        req.setPassword(EmailConfigService.LEGACY_MASK + "x");

        service.saveConfig(req);

        assertEquals(EmailConfigService.LEGACY_MASK + "x", row.get().getPassword());
    }

    @Test
    void removingThePasswordIsAnExplicitRequest() {
        row.set(existing());
        EmailConfigRequest req = gmailRequest();
        req.setEnabled(false);
        req.setClearPassword(true);

        EmailConfigResponse saved = service.saveConfig(req);

        assertFalse(saved.passwordSet());
        assertNull(row.get().getPassword());
        assertFalse(service.getConfigView().passwordSet());
    }

    @Test
    void clearingAndReplacingInOneRequestIsRefused() {
        row.set(existing());
        EmailConfigRequest req = gmailRequest();
        req.setClearPassword(true);
        req.setPassword("new-one-1234");

        assertBadRequest(req, "not both");
        assertEquals(STORED, row.get().getPassword());
    }

    @Test
    void emailCannotBeEnabledWithoutAPasswordOrAddress() {
        EmailConfigRequest noPassword = gmailRequest();
        assertBadRequest(noPassword, "app password");

        EmailConfigRequest noAddress = gmailRequest();
        noAddress.setUsername("  ");
        noAddress.setPassword("some-password-1");
        assertBadRequest(noAddress, "Email Address");
        verify(repo, never()).save(any());
    }

    @Test
    void validationMessagesNeverEchoThePassword() {
        row.set(existing());
        EmailConfigRequest req = gmailRequest();
        req.setSmtpHost("not a host");
        req.setPassword("very-secret-new-password");

        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> service.saveConfig(req));
        assertFalse(String.valueOf(e.getReason()).contains("very-secret-new-password"));
        assertFalse(String.valueOf(e.getReason()).contains(STORED));
        assertFalse(req.toString().contains("very-secret-new-password"), "request toString must not print it");
    }

    // ---------------- E2: host, port, security, sender ----------------

    @Test
    void gmailStaysTheDefaultForANewInstallation() {
        EmailConfigResponse view = service.getConfigView();
        assertEquals("smtp.gmail.com", view.smtpHost());
        assertEquals(587, view.smtpPort());
        assertEquals("STARTTLS", view.smtpSecurity());
        assertFalse(view.passwordSet());
    }

    @Test
    void anOldPageThatSendsNoSecurityModeKeepsWorking() {
        row.set(existing());
        EmailConfigRequest req = gmailRequest();
        req.setSmtpSecurity(null);

        assertEquals("STARTTLS", service.saveConfig(req).smtpSecurity());

        req.setSmtpPort(465);
        assertEquals("SSL", service.saveConfig(req).smtpSecurity());
    }

    @Test
    void otherProvidersAreSavedWithTheirHostPortAndMode() {
        row.set(existing());
        EmailConfigRequest office = gmailRequest();
        office.setSmtpHost("  SMTP.Office365.com ");
        office.setSmtpPort(587);
        office.setSmtpSecurity("starttls");
        EmailConfigResponse saved = service.saveConfig(office);
        assertEquals("smtp.office365.com", saved.smtpHost());
        assertEquals("STARTTLS", saved.smtpSecurity());

        EmailConfigRequest zoho = gmailRequest();
        zoho.setSmtpHost("smtp.zoho.com");
        zoho.setSmtpPort(465);
        zoho.setSmtpSecurity("SSL");
        assertEquals("SSL", service.saveConfig(zoho).smtpSecurity());

        EmailConfigRequest custom = gmailRequest();
        custom.setSmtpHost("mail.client-domain.ae");
        custom.setSmtpPort(2525);
        custom.setSmtpSecurity("SSL");
        assertEquals(2525, service.saveConfig(custom).smtpPort());
    }

    @Test
    void invalidHostsAreRefused() {
        for (String host : new String[] {null, "", "smtp", "http://smtp.gmail.com", "smtp.gmail.com:587",
                "smtp gmail.com", "-smtp.gmail.com", "smtp..gmail.com", "192.168.1.10", "::1", "smtp.gmail.c0m"}) {
            EmailConfigRequest req = gmailRequest();
            req.setPassword("x-password-1");
            req.setSmtpHost(host);
            assertThrows(ResponseStatusException.class, () -> service.saveConfig(req), "host " + host);
        }
        verify(repo, never()).save(any());
    }

    @Test
    void invalidPortsAreRefused() {
        for (Integer port : new Integer[] {null, 0, -1, 65_536}) {
            EmailConfigRequest req = gmailRequest();
            req.setPassword("x-password-1");
            req.setSmtpPort(port);
            assertBadRequest(req, "port");
        }
    }

    @Test
    void aSecurityModeThatCannotWorkOnThatPortIsRefused() {
        EmailConfigRequest starttls465 = gmailRequest();
        starttls465.setPassword("x-password-1");
        starttls465.setSmtpPort(465);
        starttls465.setSmtpSecurity("STARTTLS");
        assertBadRequest(starttls465, "465");

        for (int port : new int[] {587, 25}) {
            EmailConfigRequest ssl = gmailRequest();
            ssl.setPassword("x-password-1");
            ssl.setSmtpPort(port);
            ssl.setSmtpSecurity("SSL");
            assertBadRequest(ssl, "STARTTLS");
        }

        EmailConfigRequest unknown = gmailRequest();
        unknown.setPassword("x-password-1");
        unknown.setSmtpSecurity("NONE");
        assertBadRequest(unknown, "STARTTLS or SSL");
    }

    @Test
    void invalidSenderAddressesAreRefused() {
        for (String address : new String[] {"admin", "admin@", "@example.com", "a@localhost",
                "Accounts <accounts@example.com>", "a@example.com, b@example.com", "a b@example.com"}) {
            EmailConfigRequest req = gmailRequest();
            req.setPassword("x-password-1");
            req.setUsername(address);
            assertBadRequest(req, "Email Address");
        }
    }

    @Test
    void aSenderNameWithLineBreaksIsRefused() {
        EmailConfigRequest req = gmailRequest();
        req.setPassword("x-password-1");
        req.setFromName("Acme\r\nBcc: victim@example.com");
        assertBadRequest(req, "line breaks");
    }

    @Test
    void aRefusedSaveChangesNothing() {
        row.set(existing());
        EmailConfigRequest req = gmailRequest();
        req.setSmtpPort(465); // STARTTLS on 465

        assertThrows(ResponseStatusException.class, () -> service.saveConfig(req));

        verify(repo, never()).save(any());
        assertEquals(587, row.get().getSmtpPort());
        assertEquals(STORED, row.get().getPassword());
    }

    // ---------------- fixtures ----------------

    private void assertBadRequest(EmailConfigRequest req, String messagePart) {
        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> service.saveConfig(req));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertTrue(String.valueOf(e.getReason()).contains(messagePart), e.getReason());
    }

    private static String describe(String s) {
        return s == null ? "null" : "\"" + s + "\"";
    }

    private static EmailConfigRequest gmailRequest() {
        EmailConfigRequest r = new EmailConfigRequest();
        r.setSmtpHost("smtp.gmail.com");
        r.setSmtpPort(587);
        r.setSmtpSecurity("STARTTLS");
        r.setUsername("accounts@example.com");
        r.setFromName("Acme Trading");
        r.setEnabled(true);
        return r;
    }

    private static EmailConfig existing() {
        EmailConfig c = new EmailConfig();
        c.setId(1L);
        c.setSmtpHost("smtp.gmail.com");
        c.setSmtpPort(587);
        c.setUsername("accounts@example.com");
        c.setPassword(STORED);
        c.setFromName("Acme Trading");
        c.setEnabled(true);
        return c;
    }

    private static EmailConfig copy(EmailConfig src) {
        EmailConfig c = new EmailConfig();
        c.setId(src.getId());
        c.setSmtpHost(src.getSmtpHost());
        c.setSmtpPort(src.getSmtpPort());
        c.setSmtpSecurity(src.getSmtpSecurity());
        c.setUsername(src.getUsername());
        c.setPassword(src.getPassword());
        c.setFromName(src.getFromName());
        c.setEnabled(src.getEnabled());
        return c;
    }
}
