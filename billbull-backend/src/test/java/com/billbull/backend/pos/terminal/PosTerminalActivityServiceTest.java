package com.billbull.backend.pos.terminal;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** Terminal Auto-Archive lifecycle — activity recording + real-time STALE recovery. */
@ExtendWith(MockitoExtension.class)
class PosTerminalActivityServiceTest {

    @Mock private PosTerminalRepository terminalRepo;
    @Mock private PosTerminalLifecycleService lifecycleService;

    private PosTerminalActivityService service() {
        return new PosTerminalActivityService(terminalRepo, lifecycleService);
    }

    private PosTerminal terminal(PosTerminalStatus status) {
        PosTerminal t = new PosTerminal();
        t.setTerminalId("T001-AAAA");
        t.setStatus(status);
        return t;
    }

    @Test
    void blankTerminalIdIsNoOp() {
        service().recordActivity("", "HEARTBEAT");
        service().recordActivity(null, "HEARTBEAT");
        verify(terminalRepo, never()).touchLastActivity(anyString(), any());
    }

    @Test
    void touchesLastActivityForAnyRecordedSource() {
        when(terminalRepo.findByTerminalId("T001-AAAA")).thenReturn(Optional.of(terminal(PosTerminalStatus.ACTIVE)));

        service().recordActivity("T001-AAAA", "CHECKOUT");

        verify(terminalRepo, times(1)).touchLastActivity(org.mockito.ArgumentMatchers.eq("T001-AAAA"), any());
    }

    @Test
    void doesNotTriggerRecoveryWhenTerminalIsNotStale() {
        when(terminalRepo.findByTerminalId("T001-AAAA")).thenReturn(Optional.of(terminal(PosTerminalStatus.ACTIVE)));

        service().recordActivity("T001-AAAA", "HEARTBEAT");

        verify(lifecycleService, never()).recoverFromStale(any(), anyString());
    }

    @Test
    void triggersRecoveryWhenTerminalIsCurrentlyStale() {
        PosTerminal stale = terminal(PosTerminalStatus.STALE);
        when(terminalRepo.findByTerminalId("T001-AAAA")).thenReturn(Optional.of(stale));

        service().recordActivity("T001-AAAA", "SESSION_OPEN");

        verify(lifecycleService).recoverFromStale(stale, "SESSION_OPEN");
    }

    @Test
    void unknownTerminalIdIsSafeNoOp() {
        when(terminalRepo.findByTerminalId("UNKNOWN")).thenReturn(Optional.empty());

        service().recordActivity("UNKNOWN", "HEARTBEAT");

        verify(terminalRepo).touchLastActivity(org.mockito.ArgumentMatchers.eq("UNKNOWN"), any());
        verify(lifecycleService, never()).recoverFromStale(any(), anyString());
    }
}
