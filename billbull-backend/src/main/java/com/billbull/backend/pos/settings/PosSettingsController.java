package com.billbull.backend.pos.settings;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

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
        System.out.println("SAVE REQUEST RECEIVED. maxTerminalsPerBranch=" + settings.getMaxTerminalsPerBranch());
        return ResponseEntity.ok(service.save(settings));
    }

    /**
     * Verify a supervisor PIN server-side (ARCHFIX S5). The PIN is no longer shipped to the client,
     * so the cashier's entered PIN is validated here against the stored BCrypt hash.
     */
    @PostMapping("/verify-pin")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Boolean>> verifyPin(@RequestBody VerifyPinRequest request) {
        boolean valid = service.verifyPin(request == null ? null : request.getPin());
        return ResponseEntity.ok(Map.of("valid", valid));
    }

    /**
     * Verify supervisor identity by user credentials (email/username + password).
     * Returns the supervisor's display name on success for the audit trail shown to the cashier.
     * Roles that qualify: ADMIN, BRANCH_ADMIN, MANAGER.
     */
    @PostMapping("/supervisor-auth")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> supervisorAuth(@RequestBody SupervisorAuthRequest request) {
        if (request == null) {
            return ResponseEntity.ok(Map.of("valid", false, "reason", "Invalid request."));
        }
        PosSettingsService.SupervisorAuthResult result = service.verifySupervisorCredentials(
                request.getEmail(), request.getPassword(),
                request.getTerminalId(), request.getLockedBy());
        if (result.isValid()) {
            return ResponseEntity.ok(Map.of(
                    "valid", true,
                    "supervisorName", result.getSupervisorName(),
                    "supervisorUsername", result.getSupervisorUsername()));
        }
        return ResponseEntity.ok(Map.of("valid", false, "reason", result.getReason()));
    }

    /** Request body for {@link #verifyPin}. */
    public static class VerifyPinRequest {
        private String pin;
        public String getPin() { return pin; }
        public void setPin(String pin) { this.pin = pin; }
    }

    /** Request body for {@link #supervisorAuth}. */
    public static class SupervisorAuthRequest {
        private String email;
        private String password;
        private String terminalId;
        private String lockedBy;

        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }
        public String getTerminalId() { return terminalId; }
        public void setTerminalId(String terminalId) { this.terminalId = terminalId; }
        public String getLockedBy() { return lockedBy; }
        public void setLockedBy(String lockedBy) { this.lockedBy = lockedBy; }
    }
}
