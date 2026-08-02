package com.billbull.backend.pos.session;

import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Session Roaming Phase 6 — read-only discovery layer for the current session landscape around a
 * cashier.
 *
 * <p>This service answers "what OPEN sessions exist that could matter to this user right now?"
 * and classifies the answer via {@link PosSessionDiscoveryStatus}. It does not open, close, host,
 * or transfer anything, and it is not wired into any production workflow (Open Session, Resume
 * Session, Checkout, Cash Movement, Login) — it exists so a later phase can decide how the
 * application should react to these discovery results.
 *
 * <p>Unlike {@link PosSessionTerminalFirstResolutionStrategy#resolveByOwner}, which collapses an
 * ambiguous multi-session owner lookup to an empty {@code Optional} for callers that need a single
 * answer, this service surfaces the ambiguity explicitly via
 * {@link PosSessionDiscoveryStatus#MULTIPLE_OWNER_SESSIONS} — discovery's job is to report, not to
 * resolve.
 */
@Service
public class PosSessionDiscoveryService {

    private static final Logger log = LoggerFactory.getLogger(PosSessionDiscoveryService.class);

    private final PosSessionRepository repo;

    public PosSessionDiscoveryService(PosSessionRepository repo) {
        this.repo = repo;
    }

    /**
     * Looks up the OPEN session on {@code branchId}+{@code terminalId} and the OPEN session(s)
     * owned by {@code ownerUserId} independently, then classifies the combination. Either
     * {@code terminalId} or {@code ownerUserId} may be absent from the result depending on what
     * exists in the database — this method never opens or modifies a session.
     *
     * @param ownerUserId may be {@code null} (e.g. anonymous/system lookups); in that case only
     *                    the terminal session is considered and the result can only be
     *                    {@link PosSessionDiscoveryStatus#NO_SESSION} or
     *                    {@link PosSessionDiscoveryStatus#TERMINAL_SESSION}.
     */
    @Transactional(readOnly = true)
    public PosSessionDiscoveryResult discover(Long branchId, String terminalId, Long ownerUserId) {
        Optional<PosSession> terminalSession =
                repo.findByBranchIdAndTerminalIdAndStatus(branchId, terminalId, PosSessionStatus.OPEN);

        List<PosSession> ownedSessions =
                ownerUserId == null ? List.of() : repo.findByOwnerUserIdAndStatus(ownerUserId, PosSessionStatus.OPEN);

        if (ownedSessions.size() > 1) {
            log.warn("Session discovery found {} OPEN sessions owned by user {}; reporting "
                            + "MULTIPLE_OWNER_SESSIONS without guessing (session IDs: {})",
                    ownedSessions.size(), ownerUserId, ownedSessions.stream().map(PosSession::getId).toList());
            return PosSessionDiscoveryResult.multipleOwnerSessions(terminalSession, ownedSessions.size());
        }

        Optional<PosSession> ownerSession = ownedSessions.isEmpty() ? Optional.empty() : Optional.of(ownedSessions.get(0));

        if (terminalSession.isEmpty() && ownerSession.isEmpty()) {
            return PosSessionDiscoveryResult.noSession();
        }
        if (terminalSession.isPresent() && ownerSession.isEmpty()) {
            return PosSessionDiscoveryResult.terminalOnly(terminalSession.get());
        }
        if (terminalSession.isEmpty()) {
            return PosSessionDiscoveryResult.ownerOnly(ownerSession.get());
        }

        PosSession terminal = terminalSession.get();
        PosSession owner = ownerSession.get();
        if (terminal.getId() != null && terminal.getId().equals(owner.getId())) {
            return PosSessionDiscoveryResult.sameSession(terminal);
        }

        log.warn("Session discovery conflict: terminal {}/{} is hosting session {} (owner {}), "
                        + "but user {} separately owns session {} at terminal {}",
                branchId, terminalId, terminal.getId(), terminal.getOwnerUserId(),
                ownerUserId, owner.getId(), owner.getTerminalId());
        return PosSessionDiscoveryResult.conflict(terminal, owner);
    }
}
