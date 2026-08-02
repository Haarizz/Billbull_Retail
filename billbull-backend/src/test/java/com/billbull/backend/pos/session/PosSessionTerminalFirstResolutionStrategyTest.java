package com.billbull.backend.pos.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * Session Roaming Phase 2 (terminal-first, production-active) / Phase 5 (user-first discovery) —
 * unit tests for the only active {@link PosSessionResolutionStrategy} implementation.
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
    void resolveByOwner_returnsActiveSession() {
        PosSession session = session(10L, 1L, 99L);
        when(repo.findByOwnerUserIdAndStatus(99L, PosSessionStatus.OPEN)).thenReturn(List.of(session));

        PosSessionTerminalFirstResolutionStrategy strategy = new PosSessionTerminalFirstResolutionStrategy(repo);

        assertThat(strategy.resolveByOwner(99L)).contains(session);
    }

    @Test
    void resolveByOwner_returnsEmptyWhenNoneExist() {
        when(repo.findByOwnerUserIdAndStatus(99L, PosSessionStatus.OPEN)).thenReturn(List.of());

        PosSessionTerminalFirstResolutionStrategy strategy = new PosSessionTerminalFirstResolutionStrategy(repo);

        assertThat(strategy.resolveByOwner(99L)).isEmpty();
    }

    @Test
    void resolveByOwner_ignoresClosedSessions() {
        // The repository query itself filters by status=OPEN, so a user whose only sessions are
        // closed/cancelled simply yields an empty list here.
        when(repo.findByOwnerUserIdAndStatus(99L, PosSessionStatus.OPEN)).thenReturn(List.of());

        PosSessionTerminalFirstResolutionStrategy strategy = new PosSessionTerminalFirstResolutionStrategy(repo);

        assertThat(strategy.resolveByOwner(99L)).isEmpty();
        verify(repo, never()).findByOwnerUserIdAndStatus(99L, PosSessionStatus.CLOSED);
    }

    @Test
    void resolveByOwner_multipleOpenSessions_doesNotGuess() {
        PosSession first = session(10L, 1L, 99L);
        PosSession second = session(11L, 2L, 99L);
        when(repo.findByOwnerUserIdAndStatus(99L, PosSessionStatus.OPEN)).thenReturn(List.of(first, second));

        PosSessionTerminalFirstResolutionStrategy strategy = new PosSessionTerminalFirstResolutionStrategy(repo);

        assertThat(strategy.resolveByOwner(99L)).isEmpty();
    }

    @Test
    void resolveSession_terminalFirstWinsWhenBothExist() {
        PosSession terminalSession = session(10L, 1L, 99L);
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T001", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(terminalSession));

        PosSessionTerminalFirstResolutionStrategy strategy = new PosSessionTerminalFirstResolutionStrategy(repo);
        Optional<PosSession> result = strategy.resolveSession(1L, "T001", 99L);

        assertThat(result).contains(terminalSession);
        verify(repo, never()).findByOwnerUserIdAndStatus(99L, PosSessionStatus.OPEN);
    }

    @Test
    void resolveSession_fallsBackToOwnerWhenNoTerminalSession() {
        // Owner session lives on the same branch, at a different terminal than T001.
        PosSession ownerSession = session(20L, 1L, 99L);
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T001", PosSessionStatus.OPEN))
                .thenReturn(Optional.empty());
        when(repo.findByOwnerUserIdAndStatus(99L, PosSessionStatus.OPEN)).thenReturn(List.of(ownerSession));

        PosSessionTerminalFirstResolutionStrategy strategy = new PosSessionTerminalFirstResolutionStrategy(repo);
        Optional<PosSession> result = strategy.resolveSession(1L, "T001", 99L);

        assertThat(result).contains(ownerSession);
    }

    @Test
    void resolveSession_ignoresOwnerSessionOnAnotherBranch() {
        PosSession otherBranchSession = session(20L, 2L, 99L);
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T001", PosSessionStatus.OPEN))
                .thenReturn(Optional.empty());
        when(repo.findByOwnerUserIdAndStatus(99L, PosSessionStatus.OPEN)).thenReturn(List.of(otherBranchSession));

        PosSessionTerminalFirstResolutionStrategy strategy = new PosSessionTerminalFirstResolutionStrategy(repo);

        assertThat(strategy.resolveSession(1L, "T001", 99L)).isEmpty();
    }

    @Test
    void resolveSession_returnsEmptyWhenNeitherLookupFinds() {
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T001", PosSessionStatus.OPEN))
                .thenReturn(Optional.empty());
        when(repo.findByOwnerUserIdAndStatus(99L, PosSessionStatus.OPEN)).thenReturn(List.of());

        PosSessionTerminalFirstResolutionStrategy strategy = new PosSessionTerminalFirstResolutionStrategy(repo);

        assertThat(strategy.resolveSession(1L, "T001", 99L)).isEmpty();
    }

    @Test
    void resolveSession_multipleOwnerSessions_doesNotGuess() {
        PosSession first = session(20L, 2L, 99L);
        PosSession second = session(21L, 3L, 99L);
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T001", PosSessionStatus.OPEN))
                .thenReturn(Optional.empty());
        when(repo.findByOwnerUserIdAndStatus(99L, PosSessionStatus.OPEN)).thenReturn(List.of(first, second));

        PosSessionTerminalFirstResolutionStrategy strategy = new PosSessionTerminalFirstResolutionStrategy(repo);

        assertThat(strategy.resolveSession(1L, "T001", 99L)).isEmpty();
    }

    private static PosSession session(Long id, Long branchId, Long ownerUserId) {
        PosSession session = new PosSession();
        session.setId(id);
        session.setBranchId(branchId);
        session.setOwnerUserId(ownerUserId);
        return session;
    }
}
