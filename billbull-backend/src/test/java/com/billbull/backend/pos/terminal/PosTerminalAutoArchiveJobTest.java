package com.billbull.backend.pos.terminal;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;

@ExtendWith(MockitoExtension.class)
class PosTerminalAutoArchiveJobTest {

    @Mock private BranchRepository branchRepo;
    @Mock private PosSettingsRepository settingsRepo;
    @Mock private PosTerminalRepository terminalRepo;
    @Mock private PosTerminalLifecycleService lifecycleService;

    private PosTerminalAutoArchiveJob job() {
        return new PosTerminalAutoArchiveJob(branchRepo, settingsRepo, terminalRepo, lifecycleService);
    }

    private Branch branch(Long id) {
        Branch b = new Branch();
        b.setId(id);
        return b;
    }

    private PosTerminal terminal(PosTerminalStatus status, LocalDateTime lastActivityAt, Long openSessionId) {
        PosTerminal t = new PosTerminal();
        t.setId(1L);
        t.setTerminalId("T001-AAAA");
        t.setBranchId(1L);
        t.setStatus(status);
        t.setLastActivityAt(lastActivityAt);
        t.setCurrentOpenSessionId(openSessionId);
        return t;
    }

    private PosSettings settings(boolean enabled, int archiveAfterDays, boolean notify, int warningDays) {
        PosSettings s = new PosSettings();
        s.setTerminalAutoArchiveEnabled(enabled);
        s.setTerminalArchiveAfterDays(archiveAfterDays);
        s.setTerminalArchiveNotifyBefore(notify);
        s.setTerminalArchiveWarningDays(warningDays);
        return s;
    }

    @Test
    void skipsBranchWhenMasterSwitchOff() {
        when(branchRepo.findAll()).thenReturn(List.of(branch(1L)));
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.of(settings(false, 30, true, 5)));

        job().sweep();

        verify(terminalRepo, never()).findAutoArchiveCandidates(any());
    }

    @Test
    void skipsBranchWhenNoSettingsRowExists() {
        when(branchRepo.findAll()).thenReturn(List.of(branch(1L)));
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.empty());

        job().sweep();

        verify(terminalRepo, never()).findAutoArchiveCandidates(any());
    }

    @Test
    void skipsTerminalWithOpenSession() {
        when(branchRepo.findAll()).thenReturn(List.of(branch(1L)));
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.of(settings(true, 30, true, 5)));
        PosTerminal t = terminal(PosTerminalStatus.OFFLINE, LocalDateTime.now().minusDays(40), 999L);
        when(terminalRepo.findAutoArchiveCandidates(1L)).thenReturn(List.of(t));

        job().sweep();

        verify(lifecycleService, never()).autoArchive(any(), anyInt());
        verify(lifecycleService, never()).markStale(any(), anyInt(), anyInt(), anyBoolean());
    }

    @Test
    void skipsActiveAndIdleTerminals() {
        when(branchRepo.findAll()).thenReturn(List.of(branch(1L)));
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.of(settings(true, 30, true, 5)));
        PosTerminal active = terminal(PosTerminalStatus.ACTIVE, LocalDateTime.now().minusDays(40), null);
        PosTerminal idle = terminal(PosTerminalStatus.IDLE, LocalDateTime.now().minusDays(40), null);
        when(terminalRepo.findAutoArchiveCandidates(1L)).thenReturn(List.of(active, idle));

        job().sweep();

        verify(lifecycleService, never()).autoArchive(any(), anyInt());
    }

    @Test
    void archivesTerminalPastArchiveThreshold() {
        when(branchRepo.findAll()).thenReturn(List.of(branch(1L)));
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.of(settings(true, 30, true, 5)));
        PosTerminal t = terminal(PosTerminalStatus.OFFLINE, LocalDateTime.now().minusDays(31), null);
        when(terminalRepo.findAutoArchiveCandidates(1L)).thenReturn(List.of(t));

        job().sweep();

        verify(lifecycleService).autoArchive(eq(t), eq(31));
        verify(lifecycleService, never()).markStale(any(), anyInt(), anyInt(), anyBoolean());
    }

    @Test
    void marksStaleWithinWarningWindowButBeforeArchiveThreshold() {
        when(branchRepo.findAll()).thenReturn(List.of(branch(1L)));
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.of(settings(true, 30, true, 5)));
        PosTerminal t = terminal(PosTerminalStatus.OFFLINE, LocalDateTime.now().minusDays(26), null);
        when(terminalRepo.findAutoArchiveCandidates(1L)).thenReturn(List.of(t));

        job().sweep();

        verify(lifecycleService).markStale(eq(t), eq(26), eq(30), eq(true));
        verify(lifecycleService, never()).autoArchive(any(), anyInt());
    }

    @Test
    void doesNotMarkStaleBeforeWarningWindowWhenWellWithinThreshold() {
        when(branchRepo.findAll()).thenReturn(List.of(branch(1L)));
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.of(settings(true, 30, true, 5)));
        PosTerminal t = terminal(PosTerminalStatus.OFFLINE, LocalDateTime.now().minusDays(10), null);
        when(terminalRepo.findAutoArchiveCandidates(1L)).thenReturn(List.of(t));

        job().sweep();

        verify(lifecycleService, never()).markStale(any(), anyInt(), anyInt(), anyBoolean());
        verify(lifecycleService, never()).autoArchive(any(), anyInt());
    }

    @Test
    void doesNotMarkStaleWhenNotifyBeforeArchiveDisabled() {
        when(branchRepo.findAll()).thenReturn(List.of(branch(1L)));
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.of(settings(true, 30, false, 5)));
        PosTerminal t = terminal(PosTerminalStatus.OFFLINE, LocalDateTime.now().minusDays(26), null);
        when(terminalRepo.findAutoArchiveCandidates(1L)).thenReturn(List.of(t));

        job().sweep();

        verify(lifecycleService, never()).markStale(any(), anyInt(), anyInt(), anyBoolean());
    }
}
