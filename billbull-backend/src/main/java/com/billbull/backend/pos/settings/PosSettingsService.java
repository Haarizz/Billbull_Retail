package com.billbull.backend.pos.settings;

import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.user.UserRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class PosSettingsService {

    private final PosSettingsRepository repo;
    private final BranchAccessService branchAccessService;
    private final PasswordEncoder passwordEncoder;
    private final UserRepository userRepository;
    private final AuditLogService auditLogService;
    private final PosSessionService posSessionService;

    public PosSettingsService(PosSettingsRepository repo, BranchAccessService branchAccessService,
                              PasswordEncoder passwordEncoder, UserRepository userRepository,
                              AuditLogService auditLogService, PosSessionService posSessionService) {
        this.repo = repo;
        this.branchAccessService = branchAccessService;
        this.passwordEncoder = passwordEncoder;
        this.userRepository = userRepository;
        this.auditLogService = auditLogService;
        this.posSessionService = posSessionService;
    }

    /** A stored PIN already BCrypt-hashed? BCrypt hashes start with $2a/$2b/$2y. */
    private boolean isHashed(String value) {
        return value != null && value.startsWith("$2");
    }

    /** Hash a raw PIN unless it is already hashed (idempotent on re-save of an unchanged hash). */
    private String hashPinIfNeeded(String pin) {
        if (pin == null || pin.isBlank()) return pin;
        return isHashed(pin) ? pin : passwordEncoder.encode(pin);
    }

    @Transactional(readOnly = true)
    public PosSettings getForCurrentBranch() {
        Long branchId = branchAccessService.getCurrentUserBranchId();
        if (branchId == null) return defaultSettings();
        return repo.findByBranchId(branchId).orElseGet(() -> {
            PosSettings s = defaultSettings();
            s.setBranchId(branchId);
            return s;
        });
    }

    @Transactional(readOnly = true)
    public PosSettings getForBranch(Long branchId) {
        return repo.findByBranchId(branchId).orElseGet(() -> {
            PosSettings s = defaultSettings();
            s.setBranchId(branchId);
            return s;
        });
    }

    @Transactional
    public PosSettings save(PosSettings settings) {
        if (settings.getBranchId() == null) {
            Long branchId = branchAccessService.getCurrentUserBranchId();
            settings.setBranchId(branchId);
        }
        // Upsert by branchId
        return repo.findByBranchId(settings.getBranchId())
                .map(existing -> {
                    existing.setMaxTerminalsPerBranch(settings.getMaxTerminalsPerBranch());
                    existing.setRequireSupervisorForVoid(settings.getRequireSupervisorForVoid());
                    existing.setSupervisorApprovalMode(settings.getSupervisorApprovalMode());
                    // ARCHFIX S5: hash a newly supplied PIN; a blank/absent PIN leaves the stored hash untouched.
                    if (settings.getSupervisorPin() != null && !settings.getSupervisorPin().isBlank()) {
                        existing.setSupervisorPin(hashPinIfNeeded(settings.getSupervisorPin()));
                    }
                    existing.setVoidMode(settings.getVoidMode());
                    existing.setCartViewMode(settings.getCartViewMode());
                    existing.setCartShowBarcode(settings.getCartShowBarcode());
                    existing.setCartShowProductCode(settings.getCartShowProductCode());
                    existing.setCartShowBatchNumber(settings.getCartShowBatchNumber());
                    existing.setCartShowSerialNumber(settings.getCartShowSerialNumber());
                    existing.setCartShowExpiryDate(settings.getCartShowExpiryDate());
                    existing.setPriceCheckShowStock(settings.getPriceCheckShowStock());
                    existing.setZReportAccess(settings.getZReportAccess());
                    existing.setCashDrawerTriggers(settings.getCashDrawerTriggers());
                    existing.setReceiptShareEnabled(settings.getReceiptShareEnabled());
                    existing.setReceiptShareWhatsapp(settings.getReceiptShareWhatsapp());
                    existing.setReceiptShareSms(settings.getReceiptShareSms());
                    existing.setReceiptShareEmail(settings.getReceiptShareEmail());
                    existing.setDefaultLayout(settings.getDefaultLayout());
                    existing.setLayoutHideCategoryPanel(settings.getLayoutHideCategoryPanel());
                    existing.setLayoutHideItemsPanel(settings.getLayoutHideItemsPanel());
                    existing.setLayoutHiddenPanelButtons(settings.getLayoutHiddenPanelButtons());
                    existing.setPrintTemplateConfig(settings.getPrintTemplateConfig());
                    existing.setWalkInCustomerCode(settings.getWalkInCustomerCode());
                    existing.setAutoPrintReceipt(settings.getAutoPrintReceipt());
                    existing.setTaxInclusive(settings.getTaxInclusive());
                    existing.setDefaultTaxRate(settings.getDefaultTaxRate());
                    return repo.save(existing);
                })
                .orElseGet(() -> {
                    // New record: hash the PIN before first persist.
                    settings.setSupervisorPin(hashPinIfNeeded(settings.getSupervisorPin()));
                    return repo.save(settings);
                });
    }

    /**
     * Verify a raw supervisor PIN against the stored value for the current branch (ARCHFIX S5).
     * The PIN is never returned to the client; verification happens server-side. Handles legacy
     * plaintext rows transparently: if the stored value is not yet a BCrypt hash, compare plainly
     * and opportunistically upgrade it to a hash on a successful match.
     */
    @Transactional
    public boolean verifyPin(String rawPin) {
        if (rawPin == null || rawPin.isBlank()) return false;
        Long branchId = branchAccessService.getCurrentUserBranchId();
        if (branchId == null) return false;
        return repo.findByBranchId(branchId)
                .map(settings -> {
                    String stored = settings.getSupervisorPin();
                    if (stored == null || stored.isBlank()) return false;
                    if (isHashed(stored)) {
                        return passwordEncoder.matches(rawPin, stored);
                    }
                    // Legacy plaintext: compare directly, then upgrade to a hash if it matched.
                    if (stored.equals(rawPin)) {
                        settings.setSupervisorPin(passwordEncoder.encode(rawPin));
                        repo.save(settings);
                        return true;
                    }
                    return false;
                })
                .orElse(false);
    }

    /**
     * Verify supervisor identity by email/username + password and role membership.
     * Roles that qualify as supervisor: ADMIN, BRANCH_ADMIN, MANAGER, SUPERVISOR.
     * On success, logs a SUPERVISOR_HANDOVER domain event for audit trail.
     */
    @Transactional
    public SupervisorAuthResult verifySupervisorCredentials(String emailOrUsername, String password,
                                                            String terminalId, String lockedBy) {
        if (emailOrUsername == null || emailOrUsername.isBlank()
                || password == null || password.isBlank()) {
            return SupervisorAuthResult.invalid("Email and password are required.");
        }

        // Accept email or username — same dual-lookup as AuthController login
        var userOpt = userRepository.findByEmailAndIsActiveTrue(emailOrUsername);
        if (userOpt.isEmpty()) {
            userOpt = userRepository.findByUsernameAndIsActiveTrue(emailOrUsername);
        }

        if (userOpt.isEmpty()) {
            return SupervisorAuthResult.invalid("Account not found or inactive.");
        }

        var user = userOpt.get();

        if (!passwordEncoder.matches(password, user.getPassword())) {
            return SupervisorAuthResult.invalid("Incorrect password.");
        }

        boolean hasSupervisorRole = user.getRoles().stream()
                .anyMatch(r -> List.of("ADMIN", "BRANCH_ADMIN", "MANAGER", "SUPERVISOR").contains(r.getName()));

        if (!hasSupervisorRole) {
            auditLogService.logDomainEvent("POS_TERMINAL", terminalId,
                    "SUPERVISOR_HANDOVER_DENIED",
                    String.format("User '%s' attempted terminal handover but lacks supervisor role. Locked by: %s",
                            user.getUsername(), lockedBy));
            return SupervisorAuthResult.invalid("This account does not have supervisor privileges.");
        }

        String displayName = (user.getFullName() != null && !user.getFullName().isBlank())
                ? user.getFullName() : user.getUsername();

        auditLogService.logDomainEvent("POS_TERMINAL", terminalId,
                "SUPERVISOR_HANDOVER",
                String.format("Supervisor '%s' (%s) authorized shift handover from cashier '%s'.",
                        displayName, user.getUsername(), lockedBy));

        // Reassign the open session to whoever is actually logged into this browser
        // (the incoming cashier), so they resume the existing session instead of
        // being forced into "Start Session".
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String incomingCashier = auth != null ? auth.getName() : null;
        if (incomingCashier != null) {
            posSessionService.reassignSessionOwner(terminalId, incomingCashier);
        }

        return SupervisorAuthResult.valid(displayName, user.getUsername());
    }

    /** Result type for {@link #verifySupervisorCredentials}. */
    public static class SupervisorAuthResult {
        private final boolean valid;
        private final String supervisorName;
        private final String supervisorUsername;
        private final String reason;

        private SupervisorAuthResult(boolean valid, String supervisorName, String supervisorUsername, String reason) {
            this.valid = valid;
            this.supervisorName = supervisorName;
            this.supervisorUsername = supervisorUsername;
            this.reason = reason;
        }

        public static SupervisorAuthResult valid(String name, String username) {
            return new SupervisorAuthResult(true, name, username, null);
        }

        public static SupervisorAuthResult invalid(String reason) {
            return new SupervisorAuthResult(false, null, null, reason);
        }

        public boolean isValid() { return valid; }
        public String getSupervisorName() { return supervisorName; }
        public String getSupervisorUsername() { return supervisorUsername; }
        public String getReason() { return reason; }
    }

    private PosSettings defaultSettings() {
        return new PosSettings();
    }
}
