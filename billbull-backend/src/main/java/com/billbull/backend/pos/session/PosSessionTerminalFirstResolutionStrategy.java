package com.billbull.backend.pos.session;

import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Session Roaming Phase 2 (backend plumbing only — not injected into any production flow yet).
 * The current, only-active {@link PosSessionResolutionStrategy}: wraps the exact repository call
 * {@code PosSessionService#openSession} already makes inline
 * ({@code repo.findByBranchIdAndTerminalIdAndStatus}), so this class introduces no new query and
 * no behavior change. {@code PosSessionService} keeps calling the repository directly for now;
 * this wrapper exists so a later phase's resolver can compose terminal-first and user-first
 * strategies without touching {@code PosSessionService} itself.
 */
@Service
public class PosSessionTerminalFirstResolutionStrategy implements PosSessionResolutionStrategy {

    private final PosSessionRepository repo;

    public PosSessionTerminalFirstResolutionStrategy(PosSessionRepository repo) {
        this.repo = repo;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<PosSession> resolveByTerminal(Long branchId, String terminalId) {
        return repo.findByBranchIdAndTerminalIdAndStatus(branchId, terminalId, PosSessionStatus.OPEN);
    }

    @Override
    public Optional<PosSession> resolveByOwner(Long ownerUserId) {
        throw new UnsupportedOperationException(
                "User-first session resolution is not implemented until a later Session Roaming phase.");
    }
}
