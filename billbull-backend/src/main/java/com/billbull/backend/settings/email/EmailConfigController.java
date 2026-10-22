package com.billbull.backend.settings.email;

import com.billbull.backend.security.ModulePermissionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/settings/email-config")
public class EmailConfigController {

    private static final Logger log = LoggerFactory.getLogger(EmailConfigController.class);

    private static final String MODULE = "userManagement";

    private final EmailConfigService service;
    private final ModulePermissionService modulePermissionService;

    public EmailConfigController(EmailConfigService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public ResponseEntity<EmailConfigResponse> getConfig() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getConfigView());
    }

    /** Validation failures are 400 {@code {message}} via GlobalExceptionHandler. */
    @PutMapping
    public ResponseEntity<EmailConfigResponse> saveConfig(@RequestBody EmailConfigRequest config) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.saveConfig(config));
    }

    /**
     * Sends a test message with the SAVED settings. Errors are {@code {message}} with one sentence
     * the page can show: 400 for settings the user must fix, 502 when the mail server refused.
     */
    @PostMapping("/test")
    public ResponseEntity<Map<String, String>> sendTestEmail(@RequestBody Map<String, String> body) {
        modulePermissionService.requireCanEdit(MODULE);
        String toEmail = body.get("toEmail") == null ? null : body.get("toEmail").trim();
        if (toEmail == null || toEmail.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Enter the address to send the test to."));
        }
        try {
            EmailConfigService.requireEmail(toEmail);
        } catch (org.springframework.web.server.ResponseStatusException e) {
            return ResponseEntity.badRequest().body(Map.of("message", "The test recipient must be a single email address."));
        }
        try {
            service.sendTestEmail(toEmail);
            return ResponseEntity.ok(Map.of("message", "Test email sent to " + toEmail));
        } catch (IllegalStateException e) {
            // Disabled or not configured: the message says where to fix it.
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (Exception e) {
            EmailConfig cfg = service.getConfig();
            SmtpErrorMessages.Described d = SmtpErrorMessages.describe(e, cfg.getSmtpHost(), cfg.getSmtpPort());
            // Class and JavaMail text for the operator; neither holds the password.
            log.warn("Test email via {}:{} failed ({}): {}: {}", cfg.getSmtpHost(), cfg.getSmtpPort(), d.kind(),
                    e.getClass().getSimpleName(), e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("message", d.message()));
        }
    }
}
