package com.billbull.backend.pos.businessdate;

import com.billbull.backend.pos.settings.PosSettingsRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read-only lookup for the Stage 3B.2B rollout switch
 * ({@code pos_settings.business_day_login_gate_v2_enabled}) — per-branch,
 * database-backed (via the existing {@code PosSettings} entity/repository, so no
 * restart is required to change it: a branch's admin flips it through the
 * existing settings save flow and the next read picks it up), OFF by default.
 *
 * <p><b>Stage 3B.2A.5 (this phase):</b> this service exists purely as
 * infrastructure. Nothing in the codebase calls {@link #isLoginGateV2Enabled}
 * yet — {@code openSession()} still makes its decision entirely through the
 * legacy {@code PosBusinessDateService} pointer and the (still shadow-only)
 * {@code BusinessDayValidationService}, exactly as before this phase. Flipping
 * the underlying flag for any branch today has zero observable effect. Stage
 * 3B.2B is what will start consulting this lookup to decide, per branch,
 * whether the new engine is authoritative — see docs/business-day-architecture.md.
 */
@Service
public class BusinessDayFeatureFlagService {

    private final PosSettingsRepository settingsRepository;

    public BusinessDayFeatureFlagService(PosSettingsRepository settingsRepository) {
        this.settingsRepository = settingsRepository;
    }

    /** Whether the Stage 3B.2B login-gate enforcement switch is on for this
     *  branch. Defaults to {@code false} when the branch has no settings row yet,
     *  or the column is unset — matching the "default OFF" requirement even for
     *  a branch that predates this flag's existence. */
    @Transactional(readOnly = true)
    public boolean isLoginGateV2Enabled(Long branchId) {
        return settingsRepository.findByBranchId(branchId)
                .map(settings -> Boolean.TRUE.equals(settings.getBusinessDayLoginGateV2Enabled()))
                .orElse(false);
    }
}
