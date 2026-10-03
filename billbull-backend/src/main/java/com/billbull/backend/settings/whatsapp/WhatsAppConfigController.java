package com.billbull.backend.settings.whatsapp;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/settings/whatsapp-config")
public class WhatsAppConfigController {

    // Same gate as Email Settings — both are tenant-level outbound-channel setup.
    private static final String MODULE = "userManagement";

    private final WhatsAppConfigService service;
    private final WhatsAppCloudApiClient client;
    private final ModulePermissionService modulePermissionService;

    public WhatsAppConfigController(WhatsAppConfigService service,
                                    WhatsAppCloudApiClient client,
                                    ModulePermissionService modulePermissionService) {
        this.service = service;
        this.client = client;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public ResponseEntity<WhatsAppConfig> getConfig() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getConfigMasked());
    }

    @PutMapping
    public ResponseEntity<WhatsAppConfig> saveConfig(@RequestBody WhatsAppConfig config) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.saveConfig(config));
    }

    /** Calls Meta with the SAVED credentials and returns the sender number's verified name / quality. */
    @PostMapping("/test")
    public ResponseEntity<?> testConnection() {
        modulePermissionService.requireCanEdit(MODULE);
        WhatsAppConfig cfg = service.getConfig();
        if (cfg.getPhoneNumberId() == null || cfg.getAccessToken() == null) {
            return ResponseEntity.badRequest().body("Save the Phone Number ID and Access Token first.");
        }
        try {
            Map<String, Object> info = client.getPhoneNumberInfo(cfg);
            return ResponseEntity.ok(info);
        } catch (WhatsAppApiException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }
}
