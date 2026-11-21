package com.billbull.backend.pos.terminal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.counter.PosCounter;
import com.billbull.backend.pos.counter.PosCounterRepository;
import com.billbull.backend.pos.counter.PosCounterStatus;
import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * Covers only the behavior touched by the DECOMMISSION workflow addition and the restore()
 * landing-state fix (BillBull-POS-Terminal-Archive-Lifecycle-Review.html Part 09/10) — the rest of
 * PosTerminalService (registerOrRefresh's create/lookup branches, heartbeat's OFFLINE recovery,
 * approve/reject) had no prior test coverage and is unchanged by this work, so is left as-is.
 */
@ExtendWith(MockitoExtension.class)
class PosTerminalServiceTest {

    @Mock private PosTerminalRepository repo;
    @Mock private PosSettingsRepository settingsRepo;
    @Mock private PosCounterRepository counterRepo;
    @Mock private BranchAccessService branchAccessService;

    private PosTerminalService service;

    @BeforeEach
    void setUp() {
        service = new PosTerminalService(repo, settingsRepo, counterRepo, branchAccessService,
                new PosTerminalLimitPolicy(""));
        lenient().when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(counterRepo.save(any())).thenAnswer(inv -> {
            PosCounter c = inv.getArgument(0);
            if (c.getId() == null) c.setId(900L);
            return c;
        });
    }

    private PosCounter counter(Long id, String name) {
        PosCounter c = new PosCounter();
        c.setId(id);
        c.setBranchId(1L);
        c.setCounterCode(String.format("CTR-%03d", id));
        c.setCounterName(name);
        c.setStatus(PosCounterStatus.ACTIVE);
        return c;
    }

    private void newDeviceInBranch1() {
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(1L));
        when(repo.findByDeviceFingerprintAndBranchId("new-device-fp", 1L)).thenReturn(Optional.empty());
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.of(new PosSettings()));
        when(repo.countActiveLimitByBranchId(1L)).thenReturn(1L);
    }

    // ── counter linking ────────────────────────────────────────────────────

    @Test
    void newTerminalTakesTheCounterAnArchivedTerminalFreed() {
        newDeviceInBranch1();
        PosCounter busy = counter(5L, "Counter 1");
        PosCounter free = counter(6L, "Counter 2");
        when(counterRepo.findByBranchIdAndStatusAndIsActiveTrueOrderByDisplayOrderAsc(1L, PosCounterStatus.ACTIVE))
                .thenReturn(List.of(busy, free));
        when(repo.countLiveByCounterIdExcluding(5L, -1L)).thenReturn(1L);
        when(repo.countLiveByCounterIdExcluding(6L, -1L)).thenReturn(0L);

        PosTerminal t = (PosTerminal) service.registerOrRefresh(null, "new-device-fp", null, null, null, null, null, null)
                .get("terminal");

        assertEquals(6L, t.getCounterId());
        assertEquals("Counter 2", t.getCounterName());
        verify(counterRepo, never()).save(any());
    }

    @Test
    void newTerminalCreatesARealCounterWhenAllAreTaken() {
        newDeviceInBranch1();
        PosCounter busy = counter(5L, "Counter 1");
        when(counterRepo.findByBranchIdAndStatusAndIsActiveTrueOrderByDisplayOrderAsc(1L, PosCounterStatus.ACTIVE))
                .thenReturn(List.of(busy));
        when(counterRepo.findByBranchIdAndIsActiveTrueOrderByDisplayOrderAscCounterNameAsc(1L)).thenReturn(List.of(busy));
        when(repo.countLiveByCounterIdExcluding(5L, -1L)).thenReturn(1L);
        when(counterRepo.findMaxCounterCodeByBranchId(1L)).thenReturn("CTR-001");

        PosTerminal t = (PosTerminal) service.registerOrRefresh(null, "new-device-fp", null, null, null, null, null, null)
                .get("terminal");

        ArgumentCaptor<PosCounter> created = ArgumentCaptor.forClass(PosCounter.class);
        verify(counterRepo).save(created.capture());
        assertEquals("Counter 2", created.getValue().getCounterName());
        assertEquals("CTR-002", created.getValue().getCounterCode());
        assertEquals(900L, t.getCounterId());
        assertEquals("Counter 2", t.getCounterName());
    }

    @Test
    void renamingTheCounterMovesTheLinkNotJustTheText() {
        PosTerminal t = terminal(1L, PosTerminalStatus.ACTIVE);
        t.setCounterId(5L);
        t.setCounterName("Counter 1");
        when(repo.findByTerminalId("T001-AAAA")).thenReturn(Optional.of(t));
        when(counterRepo.findFirstByBranchIdAndCounterNameIgnoreCaseAndIsActiveTrueOrderByIdAsc(1L, "counter 2"))
                .thenReturn(Optional.of(counter(6L, "Counter 2")));

        PosTerminal result = service.rename("T001-AAAA", null, " counter 2 ");

        assertEquals(6L, result.getCounterId());
        assertEquals("Counter 2", result.getCounterName());
    }

    @Test
    void restoreRelinksWhenTheOldCounterWasDeleted() {
        PosTerminal t = terminal(1L, PosTerminalStatus.ARCHIVED);
        t.setCounterId(5L);
        when(repo.findById(1L)).thenReturn(Optional.of(t));
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.of(new PosSettings()));
        when(repo.countActiveLimitByBranchId(1L)).thenReturn(1L);
        PosCounter deleted = counter(5L, "Old");
        deleted.setActive(false);
        when(counterRepo.findById(5L)).thenReturn(Optional.of(deleted));
        when(counterRepo.findByBranchIdAndStatusAndIsActiveTrueOrderByDisplayOrderAsc(1L, PosCounterStatus.ACTIVE))
                .thenReturn(List.of(counter(6L, "Counter 2")));
        when(repo.countLiveByCounterIdExcluding(6L, 1L)).thenReturn(0L);

        PosTerminal result = service.restore(1L);

        assertEquals(6L, result.getCounterId());
        assertEquals("Counter 2", result.getCounterName());
    }

    private PosTerminal terminal(Long id, PosTerminalStatus status) {
        PosTerminal t = new PosTerminal();
        t.setId(id);
        t.setTerminalId("T00" + id + "-AAAA");
        t.setBranchId(1L);
        t.setStatus(status);
        return t;
    }

    // ── decommission ───────────────────────────────────────────────────────

    @Test
    void decommissionSetsStatusAndTimestampAndReason() {
        PosTerminal t = terminal(1L, PosTerminalStatus.ARCHIVED);
        t.setArchivedAt(LocalDateTime.now());
        t.setArchiveReason("Auto-archived: inactive");
        when(repo.findById(1L)).thenReturn(Optional.of(t));

        PosTerminal result = service.decommission(1L, "Hardware retired");

        assertEquals(PosTerminalStatus.DECOMMISSIONED, result.getStatus());
        assertEquals("Hardware retired", result.getDecommissionReason());
        assertEquals(java.time.LocalDate.now(), result.getDecommissionedAt().toLocalDate());
        // Decommissioning clears any lingering archive bookkeeping — no double-status residue.
        assertNull(result.getArchivedAt());
        assertNull(result.getArchiveReason());
    }

    @Test
    void decommissionThrowsWhenAlreadyDecommissioned() {
        PosTerminal t = terminal(1L, PosTerminalStatus.DECOMMISSIONED);
        when(repo.findById(1L)).thenReturn(Optional.of(t));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.decommission(1L, "reason"));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void decommissionThrowsWhenOpenSessionExists() {
        PosTerminal t = terminal(1L, PosTerminalStatus.ACTIVE);
        t.setCurrentOpenSessionId(99L);
        when(repo.findById(1L)).thenReturn(Optional.of(t));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.decommission(1L, "reason"));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
    }

    @Test
    void decommissionThrowsWhenTerminalNotFound() {
        when(repo.findById(99L)).thenReturn(Optional.empty());

        assertThrows(ResponseStatusException.class, () -> service.decommission(99L, "reason"));
    }

    // ── restore landing state ──────────────────────────────────────────────

    @Test
    void restoreLandsInActiveWhenRecentHeartbeatAndOpenSession() {
        PosTerminal t = terminal(1L, PosTerminalStatus.ARCHIVED);
        t.setLastHeartbeatAt(LocalDateTime.now().minusMinutes(2));
        t.setCurrentOpenSessionId(5L);
        when(repo.findById(1L)).thenReturn(Optional.of(t));
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.of(new PosSettings()));
        when(repo.countActiveLimitByBranchId(1L)).thenReturn(1L);

        PosTerminal result = service.restore(1L);

        assertEquals(PosTerminalStatus.ACTIVE, result.getStatus());
    }

    @Test
    void restoreLandsInIdleWhenRecentHeartbeatButNoOpenSession() {
        PosTerminal t = terminal(1L, PosTerminalStatus.ARCHIVED);
        t.setLastHeartbeatAt(LocalDateTime.now().minusMinutes(2));
        when(repo.findById(1L)).thenReturn(Optional.of(t));
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.of(new PosSettings()));
        when(repo.countActiveLimitByBranchId(1L)).thenReturn(1L);

        PosTerminal result = service.restore(1L);

        assertEquals(PosTerminalStatus.IDLE, result.getStatus());
    }

    @Test
    void restoreLandsInOfflineWhenNoRecentHeartbeat() {
        PosTerminal t = terminal(1L, PosTerminalStatus.ARCHIVED);
        t.setLastHeartbeatAt(LocalDateTime.now().minusDays(10));
        when(repo.findById(1L)).thenReturn(Optional.of(t));
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.of(new PosSettings()));
        when(repo.countActiveLimitByBranchId(1L)).thenReturn(1L);

        PosTerminal result = service.restore(1L);

        assertEquals(PosTerminalStatus.OFFLINE, result.getStatus());
    }

    @Test
    void restoreLandsInOfflineWhenHeartbeatNeverRecorded() {
        PosTerminal t = terminal(1L, PosTerminalStatus.ARCHIVED);
        when(repo.findById(1L)).thenReturn(Optional.of(t));
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.of(new PosSettings()));
        when(repo.countActiveLimitByBranchId(1L)).thenReturn(1L);

        PosTerminal result = service.restore(1L);

        assertEquals(PosTerminalStatus.OFFLINE, result.getStatus());
    }

    @Test
    void restoreStillEnforcesSlotLimit() {
        PosTerminal t = terminal(1L, PosTerminalStatus.ARCHIVED);
        when(repo.findById(1L)).thenReturn(Optional.of(t));
        PosSettings settings = new PosSettings();
        settings.setMaxTerminalsPerBranch(5);
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.of(settings));
        when(repo.countActiveLimitByBranchId(1L)).thenReturn(5L);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.restore(1L));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    @Test
    void restoreStillRejectsNonArchivedTerminal() {
        PosTerminal t = terminal(1L, PosTerminalStatus.ACTIVE);
        when(repo.findById(1L)).thenReturn(Optional.of(t));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.restore(1L));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    // ── heartbeat guard: DECOMMISSIONED still rejected, MAINTENANCE still allowed ─────────────

    @Test
    void heartbeatRejectsDecommissionedTerminal() {
        PosTerminal t = terminal(1L, PosTerminalStatus.DECOMMISSIONED);
        t.setTerminalId("T001-AAAA");
        when(repo.findByTerminalId("T001-AAAA")).thenReturn(Optional.of(t));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.heartbeat("T001-AAAA", "127.0.0.1"));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertEquals("Terminal is DECOMMISSIONED", ex.getReason());
    }

    @Test
    void heartbeatAllowsMaintenanceTerminalToContinue() {
        PosTerminal t = terminal(1L, PosTerminalStatus.MAINTENANCE);
        t.setTerminalId("T001-AAAA");
        when(repo.findByTerminalId("T001-AAAA")).thenReturn(Optional.of(t));

        // Deliberate: MAINTENANCE lets an in-progress session finish rather than being cut off
        // immediately (confirmed decision, Part 09/10 of the lifecycle review).
        PosTerminal result = service.heartbeat("T001-AAAA", "127.0.0.1");

        assertEquals(PosTerminalStatus.MAINTENANCE, result.getStatus());
    }

    // ── slot-counting: DECOMMISSIONED must free its slot exactly like ARCHIVED ────────────────
    // (bug found post-release: countActiveLimitByBranchId only excluded ARCHIVED, so a
    // permanently-retired terminal still blocked new registrations — see repository query fix)

    private com.billbull.backend.settings.branch.Branch branch(Long id) {
        com.billbull.backend.settings.branch.Branch b = new com.billbull.backend.settings.branch.Branch();
        b.setId(id);
        b.setName("Main Branch");
        return b;
    }

    @Test
    void registerOrRefreshAllowsNewTerminalWhenOnlyDecommissionedTerminalsExist() {
        // Branch has 2 terminals, both decommissioned — the repository (post-fix) reports 0
        // slot-occupying terminals, so a brand-new registration must succeed, not 403.
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(1L));
        when(repo.findByDeviceFingerprintAndBranchId("new-device-fp", 1L)).thenReturn(Optional.empty());
        PosSettings settings = new PosSettings();
        settings.setMaxTerminalsPerBranch(2);
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.of(settings));
        when(repo.countActiveLimitByBranchId(1L)).thenReturn(0L);

        var result = service.registerOrRefresh(null, "new-device-fp", null, null, null, null, null, null);

        assertEquals(Boolean.TRUE, result.get("isNew"));
    }

    @Test
    void registerOrRefreshStillBlocksWhenLimitReachedByNonDecommissionedTerminals() {
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(1L));
        when(repo.findByDeviceFingerprintAndBranchId("new-device-fp", 1L)).thenReturn(Optional.empty());
        PosSettings settings = new PosSettings();
        settings.setMaxTerminalsPerBranch(2);
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.of(settings));
        when(repo.countActiveLimitByBranchId(1L)).thenReturn(2L);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.registerOrRefresh(null, "new-device-fp", null, null, null, null, null, null));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    @Test
    void restoreAllowedWhenOnlyDecommissionedTerminalsOccupySlots() {
        PosTerminal t = terminal(1L, PosTerminalStatus.ARCHIVED);
        t.setLastHeartbeatAt(LocalDateTime.now().minusDays(10));
        when(repo.findById(1L)).thenReturn(Optional.of(t));
        PosSettings settings = new PosSettings();
        settings.setMaxTerminalsPerBranch(2);
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.of(settings));
        // Only decommissioned siblings exist besides this one — post-fix, they don't count.
        when(repo.countActiveLimitByBranchId(1L)).thenReturn(0L);

        PosTerminal result = service.restore(1L);

        assertEquals(PosTerminalStatus.OFFLINE, result.getStatus());
    }
    @Test
    void tenantOverrideLiftsTheStoredPerBranchTerminalCap() {
        // The demo tenant sets pos.terminal.max-per-branch-override=999: a branch whose stored row
        // still says 2 and already holds 2 terminals must register a third rather than 403.
        PosTerminalService overridden = new PosTerminalService(repo, settingsRepo, counterRepo,
                branchAccessService, new PosTerminalLimitPolicy("999"));
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(1L));
        when(repo.findByDeviceFingerprintAndBranchId("new-device-fp", 1L)).thenReturn(Optional.empty());
        PosSettings settings = new PosSettings();
        settings.setMaxTerminalsPerBranch(2);
        when(settingsRepo.findByBranchId(1L)).thenReturn(Optional.of(settings));
        when(repo.countActiveLimitByBranchId(1L)).thenReturn(2L);

        var result = overridden.registerOrRefresh(null, "new-device-fp", null, null, null, null, null, null);

        assertEquals(Boolean.TRUE, result.get("isNew"));
    }

    @Test
    void blankOverrideLeavesEveryOtherTenantOnItsStoredCap() {
        assertNull(new PosTerminalLimitPolicy("").getOverride());
        assertEquals(2, new PosTerminalLimitPolicy("").resolveLimit(settingsWithCap(2)));
        // A cap above the T%03d terminal-ID width is clamped, not honoured verbatim.
        assertEquals(PosTerminalLimitPolicy.MAX_SUPPORTED,
                new PosTerminalLimitPolicy("100000").resolveLimit(settingsWithCap(2)));
    }

    private PosSettings settingsWithCap(int cap) {
        PosSettings s = new PosSettings();
        s.setMaxTerminalsPerBranch(cap);
        return s;
    }
}
