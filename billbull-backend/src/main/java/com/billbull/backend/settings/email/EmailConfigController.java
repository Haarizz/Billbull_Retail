package com.billbull.backend.settings.email;

import jakarta.mail.MessagingException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.UnsupportedEncodingException;
import java.util.Map;

@RestController
@RequestMapping("/api/settings/email-config")
@CrossOrigin(origins = "*")
public class EmailConfigController {

    private final EmailConfigService service;

    public EmailConfigController(EmailConfigService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<EmailConfig> getConfig() {
        return ResponseEntity.ok(service.getConfigMasked());
    }

    @PutMapping
    public ResponseEntity<EmailConfig> saveConfig(@RequestBody EmailConfig config) {
        EmailConfig saved = service.saveConfig(config);
        saved.setPassword("••••••••••••••••");
        return ResponseEntity.ok(saved);
    }

    @PostMapping("/test")
    public ResponseEntity<?> sendTestEmail(@RequestBody Map<String, String> body) {
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
