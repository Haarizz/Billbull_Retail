package com.billbull.backend.pos.settings;

import com.billbull.backend.settings.branch.BranchAccessService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PosSettingsService {

    private final PosSettingsRepository repo;
    private final BranchAccessService branchAccessService;
    private final PasswordEncoder passwordEncoder;

    public PosSettingsService(PosSettingsRepository repo, BranchAccessService branchAccessService,
                              PasswordEncoder passwordEncoder) {
        this.repo = repo;
        this.branchAccessService = branchAccessService;
        this.passwordEncoder = passwordEncoder;
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

    private PosSettings defaultSettings() {
        return new PosSettings();
    }
}
