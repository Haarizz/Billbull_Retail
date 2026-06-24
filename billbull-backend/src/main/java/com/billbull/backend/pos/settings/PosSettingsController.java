package com.billbull.backend.pos.settings;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/pos/settings")
@CrossOrigin
public class PosSettingsController {

    private final PosSettingsService service;

    public PosSettingsController(PosSettingsService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSettings> get() {
        return ResponseEntity.ok(service.getForCurrentBranch());
    }

    @GetMapping("/branch/{branchId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSettings> getForBranch(@PathVariable Long branchId) {
        return ResponseEntity.ok(service.getForBranch(branchId));
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSettings> save(@RequestBody PosSettings settings) {
        return ResponseEntity.ok(service.save(settings));
    }

    /**
     * Verify a supervisor PIN server-side (ARCHFIX S5). The PIN is no longer shipped to the client,
     * so the cashier's entered PIN is validated here against the stored BCrypt hash.
     */
    @PostMapping("/verify-pin")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<java.util.Map<String, Boolean>> verifyPin(@RequestBody VerifyPinRequest request) {
        boolean valid = service.verifyPin(request == null ? null : request.getPin());
        return ResponseEntity.ok(java.util.Map.of("valid", valid));
    }

    /** Request body for {@link #verifyPin}. */
    public static class VerifyPinRequest {
        private String pin;
        public String getPin() { return pin; }
        public void setPin(String pin) { this.pin = pin; }
    }
}
