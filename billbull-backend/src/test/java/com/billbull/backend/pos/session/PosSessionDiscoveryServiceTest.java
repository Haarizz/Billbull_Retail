package com.billbull.backend.pos.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * Session Roaming Phase 6 — unit tests for {@link PosSessionDiscoveryService}. This service is
 * read-only and unused by production workflows; these tests only verify its classification logic.
 */
@ExtendWith(MockitoExtension.class)
class PosSessionDiscoveryServiceTest {

    @Mock private PosSessionRepository repo;

    @Test
    void noSession_whenNeitherTerminalNorOwnerHasOpenSession() {
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T001", PosSessionStatus.OPEN))
                .thenReturn(Optional.empty());
        when(repo.findByOwnerUserIdAndStatus(99L, PosSessionStatus.OPEN)).thenReturn(List.of());

        PosSessionDiscoveryService service = new PosSessionDiscoveryService(repo);
        PosSessionDiscoveryResult result = service.discover(1L, "T001", 99L);

        assertThat(result.status()).isEqualTo(PosSessionDiscoveryStatus.NO_SESSION);
        assertThat(result.terminalSession()).isEmpty();
        assertThat(result.ownerSession()).isEmpty();
        assertThat(result.ownerSessionCount()).isZero();
    }

    @Test
    void terminalSession_whenOnlyTerminalHasOpenSession() {
        PosSession terminalSession = session(10L, 1L, "T001", 5L);
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T001", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(terminalSession));
        when(repo.findByOwnerUserIdAndStatus(99L, PosSessionStatus.OPEN)).thenReturn(List.of());

        PosSessionDiscoveryService service = new PosSessionDiscoveryService(repo);
        PosSessionDiscoveryResult result = service.discover(1L, "T001", 99L);

        assertThat(result.status()).isEqualTo(PosSessionDiscoveryStatus.TERMINAL_SESSION);
        assertThat(result.terminalSession()).contains(terminalSession);
        assertThat(result.ownerSession()).isEmpty();
    }

    @Test
    void ownerSession_whenOnlyOwnerHasOpenSessionElsewhere() {
        PosSession ownerSession = session(20L, 1L, "T002", 99L);
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T001", PosSessionStatus.OPEN))
                .thenReturn(Optional.empty());
        when(repo.findByOwnerUserIdAndStatus(99L, PosSessionStatus.OPEN)).thenReturn(List.of(ownerSession));

        PosSessionDiscoveryService service = new PosSessionDiscoveryService(repo);
        PosSessionDiscoveryResult result = service.discover(1L, "T001", 99L);

        assertThat(result.status()).isEqualTo(PosSessionDiscoveryStatus.OWNER_SESSION);
        assertThat(result.terminalSession()).isEmpty();
        assertThat(result.ownerSession()).contains(ownerSession);
        assertThat(result.ownerSessionCount()).isEqualTo(1);
    }

    @Test
    void sameSession_whenTerminalSessionIsTheUsersOwnedSession() {
        PosSession session = session(30L, 1L, "T001", 99L);
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T001", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(session));
        when(repo.findByOwnerUserIdAndStatus(99L, PosSessionStatus.OPEN)).thenReturn(List.of(session));

        PosSessionDiscoveryService service = new PosSessionDiscoveryService(repo);
        PosSessionDiscoveryResult result = service.discover(1L, "T001", 99L);

        assertThat(result.status()).isEqualTo(PosSessionDiscoveryStatus.SAME_SESSION);
        assertThat(result.terminalSession()).contains(session);
        assertThat(result.ownerSession()).contains(session);
    }

    @Test
    void conflict_whenTerminalAndOwnerHaveDifferentOpenSessions() {
        PosSession terminalSession = session(10L, 1L, "T001", 5L);
        PosSession ownerSession = session(20L, 1L, "T002", 99L);
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T001", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(terminalSession));
        when(repo.findByOwnerUserIdAndStatus(99L, PosSessionStatus.OPEN)).thenReturn(List.of(ownerSession));

        PosSessionDiscoveryService service = new PosSessionDiscoveryService(repo);
        PosSessionDiscoveryResult result = service.discover(1L, "T001", 99L);

        assertThat(result.status()).isEqualTo(PosSessionDiscoveryStatus.CONFLICT);
        assertThat(result.terminalSession()).contains(terminalSession);
        assertThat(result.ownerSession()).contains(ownerSession);
    }

    @Test
    void multipleOwnerSessions_whenUserOwnsMoreThanOneOpenSession_doesNotGuess() {
        PosSession terminalSession = session(10L, 1L, "T001", 5L);
        PosSession first = session(20L, 1L, "T002", 99L);
        PosSession second = session(21L, 2L, "T003", 99L);
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T001", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(terminalSession));
        when(repo.findByOwnerUserIdAndStatus(99L, PosSessionStatus.OPEN)).thenReturn(List.of(first, second));

        PosSessionDiscoveryService service = new PosSessionDiscoveryService(repo);
        PosSessionDiscoveryResult result = service.discover(1L, "T001", 99L);

        assertThat(result.status()).isEqualTo(PosSessionDiscoveryStatus.MULTIPLE_OWNER_SESSIONS);
        assertThat(result.terminalSession()).contains(terminalSession);
        assertThat(result.ownerSession()).isEmpty();
        assertThat(result.ownerSessionCount()).isEqualTo(2);
    }

    @Test
    void branchMismatch_isTreatedAsIndependentLookups_stillReportsBothSessions() {
        // Discovery does not scope the owner lookup by branch itself (unlike
        // PosSessionResolutionStrategy#resolveSession's fallback filter) — it reports whatever
        // exists on the terminal and whatever the user owns, letting the caller judge relevance.
        PosSession terminalSession = session(10L, 1L, "T001", 5L);
        PosSession ownerSessionOtherBranch = session(20L, 2L, "T002", 99L);
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T001", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(terminalSession));
        when(repo.findByOwnerUserIdAndStatus(99L, PosSessionStatus.OPEN))
                .thenReturn(List.of(ownerSessionOtherBranch));

        PosSessionDiscoveryService service = new PosSessionDiscoveryService(repo);
        PosSessionDiscoveryResult result = service.discover(1L, "T001", 99L);

        assertThat(result.status()).isEqualTo(PosSessionDiscoveryStatus.CONFLICT);
        assertThat(result.ownerSession()).contains(ownerSessionOtherBranch);
    }

    @Test
    void closedSessions_areIgnoredByRepositoryQueryContract() {
        // Both repository methods are status-scoped to OPEN at the call site, so a user/terminal
        // whose only sessions are closed simply yields empty/no-match here — nothing for
        // discovery to special-case.
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T001", PosSessionStatus.OPEN))
                .thenReturn(Optional.empty());
        when(repo.findByOwnerUserIdAndStatus(99L, PosSessionStatus.OPEN)).thenReturn(List.of());

        PosSessionDiscoveryService service = new PosSessionDiscoveryService(repo);
        PosSessionDiscoveryResult result = service.discover(1L, "T001", 99L);

        assertThat(result.status()).isEqualTo(PosSessionDiscoveryStatus.NO_SESSION);
    }

    @Test
    void noSession_whenOwnerUserIdIsNull() {
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T001", PosSessionStatus.OPEN))
                .thenReturn(Optional.empty());

        PosSessionDiscoveryService service = new PosSessionDiscoveryService(repo);
        PosSessionDiscoveryResult result = service.discover(1L, "T001", null);

        assertThat(result.status()).isEqualTo(PosSessionDiscoveryStatus.NO_SESSION);
    }

    @Test
    void terminalSession_whenOwnerUserIdIsNull() {
        PosSession terminalSession = session(10L, 1L, "T001", 5L);
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T001", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(terminalSession));

        PosSessionDiscoveryService service = new PosSessionDiscoveryService(repo);
        PosSessionDiscoveryResult result = service.discover(1L, "T001", null);

        assertThat(result.status()).isEqualTo(PosSessionDiscoveryStatus.TERMINAL_SESSION);
        assertThat(result.terminalSession()).contains(terminalSession);
    }

    private static PosSession session(Long id, Long branchId, String terminalId, Long ownerUserId) {
        PosSession session = new PosSession();
        session.setId(id);
        session.setBranchId(branchId);
        session.setTerminalId(terminalId);
        session.setOwnerUserId(ownerUserId);
        return session;
    }
}
