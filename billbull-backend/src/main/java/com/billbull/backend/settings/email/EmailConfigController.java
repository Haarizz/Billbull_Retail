package com.billbull.backend.settings.email;

import com.billbull.backend.security.ModulePermissionService;
import jakarta.mail.MessagingException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.UnsupportedEncodingException;
import java.util.Map;

@RestController
@RequestMapping("/api/settings/email-config")
public class EmailConfigController {

    private static final String MODULE = "userManagement";

    private final EmailConfigService service;
    private final ModulePermissionService modulePermissionService;

    public EmailConfigController(EmailConfigService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public ResponseEntity<EmailConfig> getConfig() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getConfigMasked());
    }

    @PutMapping
    public ResponseEntity<EmailConfig> saveConfig(@RequestBody EmailConfig config) {
        modulePermissionService.requireCanEdit(MODULE);
        EmailConfig saved = service.saveConfig(config);
        saved.setPassword("••••••••••••••••");
        return ResponseEntity.ok(saved);
    }

    @PostMapping("/test")
    public ResponseEntity<?> sendTestEmail(@RequestBody Map<String, String> body) {
        modulePermissionService.requireCanEdit(MODULE);
        String toEmail = body.get("toEmail");
        if (toEmail == null || toEmail.isBlank()) {
            return ResponseEntity.badRequest().body("toEmail is required");
        }
        try {
            service.sendTestEmail(toEmail);
            return ResponseEntity.ok(Map.of("message", "Test email sent to " + toEmail));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (MessagingException | UnsupportedEncodingException e) {
            return ResponseEntity.internalServerError()
                    .body("Failed to send test email: " + e.getMessage());
        }
    }
}
