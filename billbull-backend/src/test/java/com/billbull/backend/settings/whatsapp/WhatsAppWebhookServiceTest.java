package com.billbull.backend.settings.whatsapp;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WhatsAppWebhookServiceTest {

    @Mock private WhatsAppConfigService configService;
    @Mock private WhatsAppMessageLogRepository logRepository;

    private WhatsAppWebhookService service;

    @BeforeEach
    void setUp() {
        service = new WhatsAppWebhookService(configService, logRepository, new ObjectMapper());
    }

    @Test
    void verifyEchoesChallengeOnlyForMatchingToken() {
        when(configService.getConfig()).thenReturn(config("secret", "my-verify-token"));
        assertEquals("12345", service.verify("subscribe", "my-verify-token", "12345"));
        assertNull(service.verify("subscribe", "wrong", "12345"));
    }

    @Test
    void signatureMustMatchAppSecretHmac() throws Exception {
        when(configService.getConfig()).thenReturn(config("app-secret", "t"));
        byte[] body = "{\"entry\":[]}".getBytes(StandardCharsets.UTF_8);
        assertTrue(service.isSignatureValid(body, sign(body, "app-secret")));
        assertFalse(service.isSignatureValid(body, sign(body, "other-secret")));
        assertFalse(service.isSignatureValid(body, null));
    }

    @Test
    void unsignedPostsAreRejectedWhenNoAppSecretIsConfigured() {
        when(configService.getConfig()).thenReturn(config(null, "t"));
        assertFalse(service.isSignatureValid("{}".getBytes(StandardCharsets.UTF_8), "sha256=abc"));
    }

    @Test
    void deliveredStatusAdvancesTheLog() {
        WhatsAppMessageLog entry = logEntry(WhatsAppMessageStatus.ACCEPTED);
        when(logRepository.findByWamid("wamid.1")).thenReturn(Optional.of(entry));

        int changed = service.applyStatuses(payload("wamid.1", "delivered", ""));

        assertEquals(1, changed);
        assertEquals(WhatsAppMessageStatus.DELIVERED, entry.getStatus());
        verify(logRepository).save(entry);
    }

    @Test
    void lateSentCallbackDoesNotDowngradeARead() {
        WhatsAppMessageLog entry = logEntry(WhatsAppMessageStatus.READ);
        when(logRepository.findByWamid("wamid.1")).thenReturn(Optional.of(entry));

        assertEquals(0, service.applyStatuses(payload("wamid.1", "sent", "")));
        assertEquals(WhatsAppMessageStatus.READ, entry.getStatus());
        verify(logRepository, never()).save(any());
    }

    @Test
    void failedStatusRecordsMetaError() {
        WhatsAppMessageLog entry = logEntry(WhatsAppMessageStatus.SENT);
        when(logRepository.findByWamid("wamid.1")).thenReturn(Optional.of(entry));

        String errors = ",\"errors\":[{\"code\":131026,\"title\":\"Message undeliverable\",\"error_data\":{\"details\":\"Not on WhatsApp\"}}]";
        service.applyStatuses(payload("wamid.1", "failed", errors));

        assertEquals(WhatsAppMessageStatus.FAILED, entry.getStatus());
        assertEquals(131026, entry.getErrorCode());
        assertEquals("Message undeliverable — Not on WhatsApp", entry.getErrorMessage());
    }

    // ---------------- fixtures ----------------

    private static WhatsAppConfig config(String appSecret, String verifyToken) {
        WhatsAppConfig c = new WhatsAppConfig();
        c.setAppSecret(appSecret);
        c.setWebhookVerifyToken(verifyToken);
        return c;
    }

    private static WhatsAppMessageLog logEntry(WhatsAppMessageStatus status) {
        WhatsAppMessageLog e = new WhatsAppMessageLog();
        e.setWamid("wamid.1");
        e.setStatus(status);
        return e;
    }

    private static byte[] payload(String wamid, String status, String extra) {
        String json = "{\"object\":\"whatsapp_business_account\",\"entry\":[{\"id\":\"1\",\"changes\":[{\"field\":\"messages\","
                + "\"value\":{\"statuses\":[{\"id\":\"" + wamid + "\",\"status\":\"" + status + "\"" + extra + "}]}}]}]}";
        return json.getBytes(StandardCharsets.UTF_8);
    }

    private static String sign(byte[] body, String secret) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return "sha256=" + HexFormat.of().formatHex(mac.doFinal(body));
    }
}
