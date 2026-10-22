package com.billbull.backend.pos.settings;

import com.billbull.backend.pos.auth.PosTillPermission;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.BranchAccessService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * POS settings, one row per branch.
 *
 * <p>Reading is for the till ({@code sales.pos}) or a POS settings administrator
 * ({@code pos.settings} view). Saving is administration: {@code pos.settings} edit, for a branch
 * the caller may act on; supervisor and voucher-expiry fields additionally keep the supervisor
 * role check in {@link PosSettingsService#save}. Reading another branch's settings needs that
 * branch to be reachable. The PIN and supervisor-credential checks serve only the till, so they
 * need the till permission.
 */
@RestController
@RequestMapping("/api/pos/settings")
@CrossOrigin
public class PosSettingsController {

    static final String SETTINGS_ADMIN = "pos.settings";
    private static final String LABEL = "POS settings";

    private final PosSettingsService service;
    private final ModulePermissionService modulePermissionService;
    private final BranchAccessService branchAccessService;

    public PosSettingsController(PosSettingsService service, ModulePermissionService modulePermissionService,
                                 BranchAccessService branchAccessService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
        this.branchAccessService = branchAccessService;
    }

    private void requireReader() {
        modulePermissionService.requireCanViewAny(PosTillPermission.MODULE, SETTINGS_ADMIN);
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSettings> get() {
        requireReader();
        return ResponseEntity.ok(service.getForCurrentBranch());
    }

    @GetMapping("/branch/{branchId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSettings> getForBranch(@PathVariable Long branchId) {
        requireReader();
        branchAccessService.assertTransactionBranchAccessible(branchId, LABEL);
        return ResponseEntity.ok(service.getForBranch(branchId));
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSettings> save(@RequestBody PosSettings settings) {
        // Before the row is locked or written. A save without a branchId lands on the caller's
        // active branch (see PosSettingsService.save), which is reachable by definition.
        modulePermissionService.requireCanEdit(SETTINGS_ADMIN);
        branchAccessService.assertTransactionBranchAccessible(settings != null ? settings.getBranchId() : null, LABEL);
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
        modulePermissionService.requireCanView(PosTillPermission.MODULE);
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
        modulePermissionService.requireCanView(PosTillPermission.MODULE);
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
