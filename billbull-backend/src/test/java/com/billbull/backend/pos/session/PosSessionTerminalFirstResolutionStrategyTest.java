package com.billbull.backend.pos.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * Session Roaming Phase 2 (backend plumbing) — unit tests for the only active
 * {@link PosSessionResolutionStrategy} implementation. Confirms it wraps the exact repository
 * call {@code PosSessionService#openSession} already makes inline (no new query), and that the
 * reserved user-first path stays unimplemented until a later phase.
 */
@ExtendWith(MockitoExtension.class)
class PosSessionTerminalFirstResolutionStrategyTest {

    @Mock private PosSessionRepository repo;

    @Test
    void resolveByTerminal_delegatesToExistingTerminalFirstQuery() {
        PosSession session = new PosSession();
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T001", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(session));

        PosSessionTerminalFirstResolutionStrategy strategy = new PosSessionTerminalFirstResolutionStrategy(repo);
        Optional<PosSession> result = strategy.resolveByTerminal(1L, "T001");

        assertThat(result).contains(session);
        verify(repo).findByBranchIdAndTerminalIdAndStatus(1L, "T001", PosSessionStatus.OPEN);
    }

    @Test
    void resolveByOwner_notYetImplemented() {
        PosSessionTerminalFirstResolutionStrategy strategy = new PosSessionTerminalFirstResolutionStrategy(repo);
        assertThatThrownBy(() -> strategy.resolveByOwner(1L))
                .isInstanceOf(UnsupportedOperationException.class);
    }
}
