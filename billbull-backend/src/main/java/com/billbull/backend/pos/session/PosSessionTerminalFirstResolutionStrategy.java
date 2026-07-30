package com.billbull.backend.pos.session;

import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Session Roaming Phase 2 (terminal-first, production-active) / Phase 5 (user-first discovery,
 * not yet invoked by production). The current, only {@link PosSessionResolutionStrategy}
 * implementation.
 *
 * <p>{@link #resolveByTerminal} wraps the exact repository call
 * {@code PosSessionService#openSession} already makes inline
 * ({@code repo.findByBranchIdAndTerminalIdAndStatus}), so it introduces no new query and no
 * behavior change. {@code PosSessionService} keeps calling the repository directly for its
 * existing flows; this wrapper exists so callers can compose terminal-first and user-first
 * lookups without touching {@code PosSessionService} itself.
 *
 * <p>{@link #resolveByOwner} and {@link #resolveSession} are Phase 5 additions: pure discovery,
 * no side effects, and no production caller yet.
 */
@Service
public class PosSessionTerminalFirstResolutionStrategy implements PosSessionResolutionStrategy {

    private static final Logger log = LoggerFactory.getLogger(PosSessionTerminalFirstResolutionStrategy.class);

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
    @Transactional(readOnly = true)
    public Optional<PosSession> resolveByOwner(Long ownerUserId) {
        List<PosSession> owned = repo.findByOwnerUserIdAndStatus(ownerUserId, PosSessionStatus.OPEN);
        if (owned.isEmpty()) {
            return Optional.empty();
        }
        if (owned.size() > 1) {
            log.warn("User-first session resolution found {} OPEN sessions owned by user {}; "
                            + "refusing to guess and returning empty (session IDs: {})",
                    owned.size(), ownerUserId, owned.stream().map(PosSession::getId).toList());
            return Optional.empty();
        }
        return Optional.of(owned.get(0));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<PosSession> resolveSession(Long branchId, String terminalId, Long ownerUserId) {
        Optional<PosSession> terminalMatch = resolveByTerminal(branchId, terminalId);
        if (terminalMatch.isPresent()) {
            return terminalMatch;
        }
        if (ownerUserId == null) {
            return Optional.empty();
        }
        return resolveByOwner(ownerUserId)
                .filter(session -> branchId == null || branchId.equals(session.getBranchId()));
    }
}
