package com.billbull.backend.pos.terminal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionTerminalHistory;
import com.billbull.backend.pos.session.PosSessionTerminalHistoryRepository;

/**
 * Session Roaming Phase 2 (backend plumbing) — unit tests for {@link PosTerminalHostingService},
 * a dormant helper no controller or existing service calls yet.
 */
@ExtendWith(MockitoExtension.class)
class PosTerminalHostingServiceTest {

    @Mock private PosTerminalRepository terminalRepository;
    @Mock private PosSessionTerminalHistoryRepository historyRepository;

    private PosTerminalHostingService service() {
        return new PosTerminalHostingService(terminalRepository, historyRepository);
    }

    @Test
    void resolveHostingTerminal_returnsEmpty_forNullSession() {
        assertThat(service().resolveHostingTerminal(null)).isEmpty();
        verifyNoInteractions(terminalRepository);
    }

    @Test
    void resolveHostingTerminal_delegatesToTerminalFirstLookupBySessionTerminalId() {
        PosSession session = new PosSession();
        session.setTerminalId("T001");
        PosTerminal terminal = new PosTerminal();
        when(terminalRepository.findByTerminalId("T001")).thenReturn(Optional.of(terminal));

        Optional<PosTerminal> result = service().resolveHostingTerminal(session);

        assertThat(result).contains(terminal);
        verify(terminalRepository).findByTerminalId("T001");
    }

    @Test
    void isLocked_falseWhenNoLockedSessionId() {
        PosTerminal terminal = new PosTerminal();
        assertThat(service().isLocked(terminal)).isFalse();
        assertThat(service().isLocked(null)).isFalse();
    }

    @Test
    void isLocked_trueWhenLockedSessionIdSet() {
        PosTerminal terminal = new PosTerminal();
        terminal.setLockedSessionId(99L);
        assertThat(service().isLocked(terminal)).isTrue();
    }

    @Test
    void beginHostingSegment_savesOpenSegmentWithTerminalAndCounterSnapshot() {
        PosSession session = new PosSession();
        session.setId(10L);
        PosTerminal terminal = new PosTerminal();
        terminal.setId(20L);
        terminal.setCounterId(30L);
        terminal.setCounterName("Counter 1");

        ArgumentCaptor<PosSessionTerminalHistory> captor = ArgumentCaptor.forClass(PosSessionTerminalHistory.class);
        when(historyRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        service().beginHostingSegment(session, terminal);

        PosSessionTerminalHistory saved = captor.getValue();
        assertThat(saved.getSessionId()).isEqualTo(10L);
        assertThat(saved.getTerminalId()).isEqualTo(20L);
        assertThat(saved.getCounterId()).isEqualTo(30L);
        assertThat(saved.getCounterName()).isEqualTo("Counter 1");
        assertThat(saved.getStartedAt()).isNotNull();
        assertThat(saved.getEndedAt()).isNull();
    }

    @Test
    void endOpenHostingSegment_closesTheOpenSegmentIfPresent() {
        PosSessionTerminalHistory openSegment = new PosSessionTerminalHistory();
        when(historyRepository.findFirstBySessionIdAndEndedAtIsNullOrderByStartedAtDesc(10L))
                .thenReturn(Optional.of(openSegment));
        when(historyRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Optional<PosSessionTerminalHistory> result = service().endOpenHostingSegment(10L);

        assertThat(result).isPresent();
        assertThat(result.get().getEndedAt()).isNotNull();
    }

    @Test
    void endOpenHostingSegment_returnsEmpty_whenNoOpenSegment() {
        when(historyRepository.findFirstBySessionIdAndEndedAtIsNullOrderByStartedAtDesc(10L))
                .thenReturn(Optional.empty());

        assertThat(service().endOpenHostingSegment(10L)).isEmpty();
    }
}
