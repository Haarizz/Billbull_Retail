package com.billbull.backend.settings.whatsapp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;

/**
 * Handles Meta's webhook: the GET verification handshake and POSTed delivery statuses.
 *
 * Security: the endpoint is public (Meta cannot send a JWT), so every POST must carry a valid
 * {@code X-Hub-Signature-256} = HMAC-SHA256(rawBody, appSecret). Without an app secret configured
 * we reject all POSTs rather than accept unsigned status changes.
 */
@Service
public class WhatsAppWebhookService {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppWebhookService.class);

    private final WhatsAppConfigService configService;
    private final WhatsAppMessageLogRepository logRepository;
    private final ObjectMapper mapper;

    public WhatsAppWebhookService(WhatsAppConfigService configService,
                                  WhatsAppMessageLogRepository logRepository,
                                  ObjectMapper mapper) {
        this.configService = configService;
        this.logRepository = logRepository;
        this.mapper = mapper;
    }

    /** Returns the challenge to echo when mode/token match, else null (→ 403). */
    public String verify(String mode, String token, String challenge) {
        String expected = configService.getConfig().getWebhookVerifyToken();
        if ("subscribe".equals(mode) && expected != null && !expected.isBlank()
                && MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                (token == null ? "" : token).getBytes(StandardCharsets.UTF_8))) {
            return challenge;
        }
        return null;
    }

    public boolean isSignatureValid(byte[] rawBody, String signatureHeader) {
        String secret = configService.getConfig().getAppSecret();
        if (secret == null || secret.isBlank() || signatureHeader == null || !signatureHeader.startsWith("sha256=")) {
            return false;
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String expected = "sha256=" + HexFormat.of().formatHex(mac.doFinal(rawBody));
            return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                    signatureHeader.trim().toLowerCase().getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            return false;
        }
    }

    /** Applies every status in the payload; returns how many log rows changed. Unknown wamids are ignored. */
    @Transactional
    public int applyStatuses(byte[] rawBody) {
        JsonNode root;
        try {
            root = mapper.readTree(rawBody);
        } catch (IOException e) {
            log.warn("WhatsApp webhook: unreadable payload");
            return 0;
        }
        int changed = 0;
        for (JsonNode entry : root.path("entry")) {
            for (JsonNode change : entry.path("changes")) {
                for (JsonNode st : change.path("value").path("statuses")) {
                    if (applyStatus(st)) changed++;
                }
            }
        }
        return changed;
    }

    private boolean applyStatus(JsonNode st) {
        String wamid = st.path("id").asText(null);
        WhatsAppMessageStatus next = WhatsAppMessageStatus.fromMeta(st.path("status").asText(null));
        if (wamid == null || next == null) return false;

        WhatsAppMessageLog entry = logRepository.findByWamid(wamid).orElse(null);
        if (entry == null || !entry.getStatus().canAdvanceTo(next)) return false;

        entry.setStatus(next);
        entry.setStatusUpdatedAt(LocalDateTime.now());
        if (next == WhatsAppMessageStatus.FAILED) {
            JsonNode err = st.path("errors").path(0);
            if (err.has("code")) entry.setErrorCode(err.path("code").asInt());
            String details = err.path("error_data").path("details").asText("");
            String title = err.path("title").asText(err.path("message").asText("Delivery failed"));
            entry.setErrorMessage(details.isBlank() ? title : title + " — " + details);
        }
        logRepository.save(entry);
        return true;
    }
}
