package com.billbull.backend.pos.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.terminal.PosTerminal;
import com.billbull.backend.pos.terminal.PosTerminalHostingService;
import com.billbull.backend.pos.terminal.PosTerminalRepository;

/**
 * Session Roaming Phase 7 — unit tests for {@link PosSessionTransferService}. This service is not
 * wired into any controller yet; these tests only verify its transfer/eligibility/logging logic in
 * isolation.
 */
@ExtendWith(MockitoExtension.class)
class PosSessionTransferServiceTest {

    @Mock private PosSessionRepository sessionRepository;
    @Mock private PosTerminalRepository terminalRepository;
    @Mock private PosSessionTerminalHistoryRepository historyRepository;
    @Mock private PosSessionTransferLogRepository transferLogRepository;

    private PosSessionTransferService transferService;

    @BeforeEach
    void setUp() {
        PosTerminalHostingService hostingService = new PosTerminalHostingService(terminalRepository, historyRepository);
        transferService = new PosSessionTransferService(sessionRepository, terminalRepository, hostingService, transferLogRepository);
    }

    private static PosSession session(Long id, Long terminalPk, String terminalId, PosSessionStatus status) {
        PosSession s = new PosSession();
        s.setId(id);
        s.setTerminalPk(terminalPk);
        s.setTerminalId(terminalId);
        s.setStatus(status);
        s.setOwnerUserId(42L);
        s.setOpenedBy("cashier1");
        return s;
    }

    private static PosTerminal terminal(Long id, String terminalId, Long currentOpenSessionId) {
        PosTerminal t = new PosTerminal();
        t.setId(id);
        t.setTerminalId(terminalId);
        t.setCounterId(6L);
        t.setCounterName("Counter 2");
        t.setCurrentOpenSessionId(currentOpenSessionId);
        return t;
    }

    @Test
    void transferMovesSessionUpdatesHostingAndWritesTransferLog() {
        PosSession session = session(1L, 99L, "T1", PosSessionStatus.OPEN);
        when(sessionRepository.findById(1L)).thenReturn(Optional.of(session));
        PosTerminal destination = terminal(200L, "T2", null);
        when(terminalRepository.findByTerminalId("T2")).thenReturn(Optional.of(destination));
        when(terminalRepository.clearOpenSession(99L, 1L)).thenReturn(1);
        when(terminalRepository.setOpenSession(200L, 1L)).thenReturn(1);
        when(sessionRepository.save(any(PosSession.class))).thenAnswer(inv -> inv.getArgument(0));
        PosSessionTerminalHistory openSegment = new PosSessionTerminalHistory();
        openSegment.setTerminalId(99L);
        when(historyRepository.findFirstBySessionIdAndEndedAtIsNullOrderByStartedAtDesc(1L))
                .thenReturn(Optional.of(openSegment));
        when(historyRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        ArgumentCaptor<PosSessionTransferLog> logCaptor = ArgumentCaptor.forClass(PosSessionTransferLog.class);
        when(transferLogRepository.save(logCaptor.capture())).thenAnswer(inv -> inv.getArgument(0));

        PosSession moved = transferService.transfer(1L, "T2", 42L, true);

        assertEquals("T2", moved.getTerminalId());
        assertEquals(200L, moved.getTerminalPk());
        assertEquals(6L, moved.getCounterId());
        assertEquals("cashier1", moved.getOpenedBy());
        assertEquals(42L, moved.getOwnerUserId());

        PosSessionTransferLog logged = logCaptor.getValue();
        assertEquals(1L, logged.getSessionId());
        assertEquals(99L, logged.getFromTerminalId());
        assertEquals(200L, logged.getToTerminalId());
        assertEquals(42L, logged.getInitiatedByUserId());
        assertEquals(Boolean.TRUE, logged.getSupervisorAuthorized());
    }

    @Test
    void transferRejectsSessionThatIsNeitherOpenNorSuspended() {
        PosSession session = session(1L, 99L, "T1", PosSessionStatus.CLOSED);
        when(sessionRepository.findById(1L)).thenReturn(Optional.of(session));

        assertThrows(ResponseStatusException.class, () -> transferService.transfer(1L, "T2", 42L, false));

        verify(terminalRepository, never()).setOpenSession(any(), any());
        verify(transferLogRepository, never()).save(any());
    }

    @Test
    void transferRejectsWhenDestinationTerminalAlreadyHostsASession() {
        PosSession session = session(1L, 99L, "T1", PosSessionStatus.OPEN);
        when(sessionRepository.findById(1L)).thenReturn(Optional.of(session));
        PosTerminal destination = terminal(200L, "T2", 555L);
        when(terminalRepository.findByTerminalId("T2")).thenReturn(Optional.of(destination));

        assertThrows(ResponseStatusException.class, () -> transferService.transfer(1L, "T2", 42L, false));

        verify(terminalRepository, never()).clearOpenSession(any(), any());
        verify(sessionRepository, never()).save(any());
        verify(transferLogRepository, never()).save(any());
    }

    @Test
    void transferRejectsWhenDestinationIsSameAsCurrentTerminal() {
        PosSession session = session(1L, 200L, "T2", PosSessionStatus.OPEN);
        when(sessionRepository.findById(1L)).thenReturn(Optional.of(session));
        PosTerminal destination = terminal(200L, "T2", 1L);
        when(terminalRepository.findByTerminalId("T2")).thenReturn(Optional.of(destination));

        assertThrows(ResponseStatusException.class, () -> transferService.transfer(1L, "T2", 42L, false));

        verify(transferLogRepository, never()).save(any());
    }

    @Test
    void transferAbortsWhenDestinationLockIsClaimedConcurrently() {
        PosSession session = session(1L, 99L, "T1", PosSessionStatus.OPEN);
        when(sessionRepository.findById(1L)).thenReturn(Optional.of(session));
        PosTerminal destination = terminal(200L, "T2", null);
        when(terminalRepository.findByTerminalId("T2")).thenReturn(Optional.of(destination));
        when(terminalRepository.clearOpenSession(99L, 1L)).thenReturn(1);
        when(terminalRepository.setOpenSession(200L, 1L)).thenReturn(0);

        assertThrows(ResponseStatusException.class, () -> transferService.transfer(1L, "T2", 42L, false));

        verify(sessionRepository, never()).save(any());
        verify(historyRepository, never()).save(any());
        verify(transferLogRepository, never()).save(any());
    }

    @Test
    void transferRejectsUnknownSession() {
        when(sessionRepository.findById(1L)).thenReturn(Optional.empty());

        assertThrows(ResponseStatusException.class, () -> transferService.transfer(1L, "T2", 42L, false));
    }

    @Test
    void transferRejectsUnknownDestinationTerminal() {
        PosSession session = session(1L, 99L, "T1", PosSessionStatus.OPEN);
        when(sessionRepository.findById(1L)).thenReturn(Optional.of(session));
        when(terminalRepository.findByTerminalId("T2")).thenReturn(Optional.empty());

        assertThrows(ResponseStatusException.class, () -> transferService.transfer(1L, "T2", 42L, false));
    }
}
