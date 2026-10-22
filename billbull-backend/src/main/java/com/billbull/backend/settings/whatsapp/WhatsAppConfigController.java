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
    private final WhatsAppConnectionCheck connectionCheck;
    private final ModulePermissionService modulePermissionService;

    public WhatsAppConfigController(WhatsAppConfigService service,
                                    WhatsAppCloudApiClient client,
                                    ModulePermissionService modulePermissionService) {
        this.service = service;
        this.connectionCheck = new WhatsAppConnectionCheck(service, client);
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

    /**
     * Checks the SAVED settings against Meta (see {@link WhatsAppConnectionCheck}); nothing is sent.
     * 200 with credentials, business account and per-template results, or 400 {@code {message}}
     * when the credentials themselves are missing or rejected.
     */
    @PostMapping("/test")
    public ResponseEntity<?> testConnection() {
        modulePermissionService.requireCanEdit(MODULE);
        try {
            return ResponseEntity.ok(connectionCheck.run());
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (WhatsAppApiException e) {
            return ResponseEntity.badRequest().body(Map.of(
                    "message", WhatsAppConnectionCheck.describe(e),
                    "metaCode", e.getMetaCode() == null ? "" : String.valueOf(e.getMetaCode())));
        }
    }
}
