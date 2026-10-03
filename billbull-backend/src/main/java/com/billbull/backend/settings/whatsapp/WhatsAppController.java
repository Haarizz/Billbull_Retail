package com.billbull.backend.settings.whatsapp;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * {@code /api/whatsapp/status} and {@code /messages} need a signed-in user.
 * {@code /api/whatsapp/webhook} is permitAll in SecurityConfig — Meta calls it with no JWT, so it
 * is protected by the verify token (GET) and the X-Hub-Signature-256 HMAC (POST) instead.
 */
@RestController
@RequestMapping("/api/whatsapp")
public class WhatsAppController {

    private final WhatsAppConfigService configService;
    private final WhatsAppMessageLogRepository logRepository;
    private final WhatsAppWebhookService webhookService;
    private final ModulePermissionService permissionService;

    public WhatsAppController(WhatsAppConfigService configService,
                              WhatsAppMessageLogRepository logRepository,
                              WhatsAppWebhookService webhookService,
                              ModulePermissionService permissionService) {
        this.configService = configService;
        this.logRepository = logRepository;
        this.webhookService = webhookService;
        this.permissionService = permissionService;
    }

    /** Whether the API path is usable — the frontend falls back to wa.me + manual attach when it isn't. */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status() {
        return ResponseEntity.ok(configService.publicStatus());
    }

    @GetMapping("/messages")
    public ResponseEntity<List<WhatsAppMessageLog>> messages(@RequestParam String documentType,
                                                             @RequestParam Long documentId) {
        WhatsAppDocumentType type = WhatsAppDocumentType.parse(documentType);
        if (type == null) {
            return ResponseEntity.badRequest().build();
        }
        // Reading a document's send history needs "view" on that document's module.
        permissionService.requireCan(type.module(), "view");
        return ResponseEntity.ok(logRepository.findTop20ByDocumentTypeAndDocumentIdOrderByIdDesc(type.name(), documentId));
    }

    // ---------------- META WEBHOOK (public) ----------------

    @GetMapping(value = "/webhook", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> verifyWebhook(@RequestParam(name = "hub.mode", required = false) String mode,
                                                @RequestParam(name = "hub.verify_token", required = false) String token,
                                                @RequestParam(name = "hub.challenge", required = false) String challenge) {
        String echo = webhookService.verify(mode, token, challenge);
        return echo != null ? ResponseEntity.ok(echo) : ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    @PostMapping("/webhook")
    public ResponseEntity<Void> receiveWebhook(@RequestBody byte[] rawBody,
                                               @RequestHeader(name = "X-Hub-Signature-256", required = false) String signature) {
        if (!webhookService.isSignatureValid(rawBody, signature)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        webhookService.applyStatuses(rawBody);
        // Always 200 once authenticated — Meta retries non-2xx responses for days.
        return ResponseEntity.ok().build();
    }
}
