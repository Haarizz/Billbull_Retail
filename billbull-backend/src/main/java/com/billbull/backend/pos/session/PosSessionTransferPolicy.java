package com.billbull.backend.pos.session;

import java.util.Objects;

import org.springframework.stereotype.Component;

import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import com.billbull.backend.pos.terminal.PosTerminal;

/**
 * Session Roaming Phase 9 — decides whether a session transfer requires supervisor authorization,
 * independent of {@link PosSessionTransferService} (which only performs an already-authorized
 * transfer) and {@link PosSessionController} (which only shapes HTTP request/response). Callers
 * (currently {@link PosSessionService}) evaluate this before invoking the transfer service and
 * before answering an open-session discovery request; the policy never mutates state itself.
 *
 * <p>Only rules backed by domain state that already exists are evaluated: branch membership
 * ({@code PosSession#getBranchId()} vs {@code PosTerminal#getBranchId()}) and destination
 * occupancy ({@code PosTerminal#getCurrentOpenSessionId()}). Rules listed in the Phase 9 brief
 * that have no queryable session-level state yet — active cash drawer, unpaid transactions,
 * pending settlements — are deliberately not implemented; adding them here without the
 * underlying domain support would be inventing business rules. When one of those becomes
 * queryable, add a branch to {@link #evaluate} plus a matching
 * {@link PosSessionTransferReasonCode}, without touching the transfer service or controller.
 */
@Component
public class PosSessionTransferPolicy {

    private final PosSettingsRepository posSettingsRepository;

    public PosSessionTransferPolicy(PosSettingsRepository posSettingsRepository) {
        this.posSettingsRepository = posSettingsRepository;
    }

    /**
     * @param session the session being considered for transfer (not yet moved)
     * @param destination the terminal it would be moved to
     */
    public PosSessionTransferDecision evaluate(PosSession session, PosTerminal destination) {
        if (destination == null) {
            return PosSessionTransferDecision.denied(PosSessionTransferReasonCode.DESTINATION_TERMINAL_NOT_FOUND,
                    "Destination terminal not found.");
        }

        // Same-terminal is never applicable — PosSessionTransferService already hard-rejects this
        // case as a bad request; the policy call is defensive so it never mis-reports here too.
        if (Objects.equals(destination.getId(), session.getTerminalPk())) {
            return PosSessionTransferDecision.allowed(PosSessionTransferReasonCode.SAME_TERMINAL_NOT_APPLICABLE,
                    "Session is already hosted on this terminal.");
        }

        // Destination occupancy: fail fast for discovery/UX purposes. The atomic re-check inside
        // PosSessionTransferService#transfer (via the DB partial-unique-index lock) remains the
        // authoritative guard against a concurrent claim; this is not a duplicate of that guard,
        // it is a best-effort early read so the caller doesn't need to attempt a doomed transfer.
        if (destination.getCurrentOpenSessionId() != null) {
            return PosSessionTransferDecision.denied(PosSessionTransferReasonCode.DESTINATION_TERMINAL_OCCUPIED,
                    "Destination terminal already hosts an open session.");
        }

        // Only a *known* branch mismatch counts as cross-branch — a terminal with no branchId
        // recorded (common on terminals set up before branch scoping, and in existing tests) is
        // treated as same-branch rather than silently requiring supervisor authorization for a
        // fact we don't actually know.
        boolean crossBranch = session.getBranchId() != null && destination.getBranchId() != null
                && !Objects.equals(session.getBranchId(), destination.getBranchId());
        if (!crossBranch) {
            return PosSessionTransferDecision.allowed(PosSessionTransferReasonCode.SAME_BRANCH_TRANSFER,
                    "Same-branch transfer.");
        }

        boolean requireSupervisor = requireSupervisorForCrossBranchTransfer(session.getBranchId());
        if (requireSupervisor) {
            return PosSessionTransferDecision.supervisorRequired(PosSessionTransferReasonCode.CROSS_BRANCH_TRANSFER,
                    "Cross-branch transfer requires supervisor authorization.");
        }
        return PosSessionTransferDecision.allowed(PosSessionTransferReasonCode.CROSS_BRANCH_TRANSFER,
                "Cross-branch transfer (supervisor authorization not required for this branch).");
    }

    /** Defaults to {@code true} (safer default) when the branch has no settings row or the flag
     *  is unset — mirrors {@code PosSettings#requireSupervisorForVoid}'s default-off pattern
     *  inverted, since an unconfigured cross-branch transfer should not silently bypass approval. */
    private boolean requireSupervisorForCrossBranchTransfer(Long branchId) {
        if (branchId == null) return true;
        return posSettingsRepository.findByBranchId(branchId)
                .map(PosSettings::getRequireSupervisorForCrossBranchTransfer)
                .map(Boolean::booleanValue)
                .orElse(true);
    }
}
