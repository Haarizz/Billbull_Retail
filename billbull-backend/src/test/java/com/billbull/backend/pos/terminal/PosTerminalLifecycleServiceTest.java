package com.billbull.backend.pos.terminal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.notification.NotificationEventPublisher;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

@ExtendWith(MockitoExtension.class)
class PosTerminalLifecycleServiceTest {

    @Mock private PosTerminalRepository repo;
    @Mock private PosTerminalService terminalService;
    @Mock private PosSessionRepository sessionRepo;
    @Mock private SalesInvoiceRepository salesInvoiceRepo;
    @Mock private PosAuditService auditService;
    @Mock private NotificationEventPublisher notificationPublisher;

    private PosTerminalLifecycleService service;

    @BeforeEach
    void setUp() {
        service = new PosTerminalLifecycleService(repo, terminalService, sessionRepo, salesInvoiceRepo,
                auditService, notificationPublisher, new ObjectMapper().registerModule(new JavaTimeModule()));
        lenient().when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    private PosTerminal terminal(Long id, PosTerminalStatus status) {
        PosTerminal t = new PosTerminal();
        t.setId(id);
        t.setTerminalId("T00" + id + "-AAAA");
        t.setBranchId(1L);
        t.setTerminalName("Terminal " + id);
        t.setStatus(status);
        return t;
    }

    // ── markStale ──────────────────────────────────────────────────────────

    @Test
    void markStaleTransitionsAndAuditsOnFirstEntry() {
        PosTerminal t = terminal(1L, PosTerminalStatus.OFFLINE);

        service.markStale(t, 25, 30, true);

        assertEquals(PosTerminalStatus.STALE, t.getStatus());
        assertNotNull(t.getStaleAt());
        verify(auditService).logTerminalStale("T001-AAAA", 1L, 25);
    }

    @Test
    void markStaleIsIdempotentOnRepeatedCalls() {
        PosTerminal t = terminal(1L, PosTerminalStatus.STALE);
        t.setStaleAt(LocalDateTime.now().minusDays(1));

        service.markStale(t, 26, 30, false);

        verify(auditService, never()).logTerminalStale(anyString(), any(), anyInt());
    }

    @Test
    void markStaleSendsFirstWarningWhenNeverSent() {
        PosTerminal t = terminal(1L, PosTerminalStatus.OFFLINE);

        service.markStale(t, 25, 30, true);

        verify(notificationPublisher).terminalStaleWarning(
                eq("Terminal 1"), eq(25), eq(5), eq("T001-AAAA"), anyBoolean());
        verify(auditService).logTerminalStaleWarningSent("T001-AAAA", 1L, 25, 5);
        assertNotNull(t.getStaleWarningSentAt());
    }

    @Test
    void markStaleDoesNotResendWarningWithinTwoDays() {
        PosTerminal t = terminal(1L, PosTerminalStatus.STALE);
        t.setStaleAt(LocalDateTime.now().minusDays(1));
        t.setStaleWarningSentAt(LocalDateTime.now().minusHours(12));

        service.markStale(t, 26, 30, true);

        verify(notificationPublisher, never()).terminalStaleWarning(any(), anyInt(), anyInt(), any(), anyBoolean());
    }

    @Test
    void markStaleResendsWarningAfterTwoDays() {
        PosTerminal t = terminal(1L, PosTerminalStatus.STALE);
        t.setStaleAt(LocalDateTime.now().minusDays(3));
        t.setStaleWarningSentAt(LocalDateTime.now().minusDays(3));

        service.markStale(t, 28, 30, true);

        verify(notificationPublisher).terminalStaleWarning(any(), eq(28), eq(2), eq("T001-AAAA"), anyBoolean());
    }

    @Test
    void markStaleSkipsNotificationWhenNotifyDisabled() {
        PosTerminal t = terminal(1L, PosTerminalStatus.OFFLINE);

        service.markStale(t, 25, 30, false);

        verify(notificationPublisher, never()).terminalStaleWarning(any(), anyInt(), anyInt(), any(), anyBoolean());
    }

    // ── recoverFromStale ───────────────────────────────────────────────────

    @Test
    void recoverFromStaleRestoresActiveOnHeartbeat() {
        PosTerminal t = terminal(1L, PosTerminalStatus.STALE);
        t.setStaleAt(LocalDateTime.now());
        t.setStaleWarningSentAt(LocalDateTime.now());

        service.recoverFromStale(t, "HEARTBEAT");

        assertEquals(PosTerminalStatus.ACTIVE, t.getStatus());
        assertNull(t.getStaleAt());
        assertNull(t.getStaleWarningSentAt());
        verify(auditService).logTerminalRecoveredFromStale("T001-AAAA", 1L, "HEARTBEAT");
    }

    @Test
    void recoverFromStaleRestoresOfflineOnNonLiveActivity() {
        PosTerminal t = terminal(1L, PosTerminalStatus.STALE);

        service.recoverFromStale(t, "CHECKOUT");

        assertEquals(PosTerminalStatus.OFFLINE, t.getStatus());
    }

    @Test
    void recoverFromStaleIsNoOpWhenNotStale() {
        PosTerminal t = terminal(1L, PosTerminalStatus.ACTIVE);

        service.recoverFromStale(t, "HEARTBEAT");

        assertEquals(PosTerminalStatus.ACTIVE, t.getStatus());
        verify(auditService, never()).logTerminalRecoveredFromStale(anyString(), any(), anyString());
    }

    // ── autoArchive / manualArchiveNow ─────────────────────────────────────

    @Test
    void autoArchiveDelegatesToTerminalServiceAndAudits() {
        PosTerminal t = terminal(1L, PosTerminalStatus.STALE);
        when(terminalService.archive(eq(1L), anyString())).thenReturn(t);
        when(sessionRepo.findTopByTerminalPkOrderByOpenedAtDesc(1L)).thenReturn(Optional.empty());
        when(salesInvoiceRepo.findTopByPosTerminalIdOrderByCreatedAtDesc(anyString())).thenReturn(Optional.empty());

        service.autoArchive(t, 47);

        verify(terminalService).archive(eq(1L), anyString());
        verify(auditService).logTerminalAutoArchived(eq("T001-AAAA"), eq(1L), anyString());
        assertNotNull(t.getArchiveContextJson());
        assertNull(t.getStaleAt());
    }

    @Test
    void manualArchiveNowThrowsWhenTerminalNotFound() {
        when(repo.findById(99L)).thenReturn(Optional.empty());
        org.junit.jupiter.api.Assertions.assertThrows(
                org.springframework.web.server.ResponseStatusException.class,
                () -> service.manualArchiveNow(99L));
    }

    // ── restore / keepActive / exempt ──────────────────────────────────────

    @Test
    void restoreClearsStaleFieldsAndAudits() {
        PosTerminal t = terminal(1L, PosTerminalStatus.ARCHIVED);
        t.setStaleAt(LocalDateTime.now());
        t.setArchiveContextJson("{}");
        when(terminalService.restore(1L)).thenReturn(t);

        service.restore(1L);

        assertNull(t.getStaleAt());
        assertNull(t.getArchiveContextJson());
        verify(auditService).logTerminalRestored(eq("T001-AAAA"), eq(1L), anyString());
    }

    @Test
    void keepActiveClearsStaleAndAudits() {
        PosTerminal t = terminal(1L, PosTerminalStatus.STALE);
        t.setStaleAt(LocalDateTime.now());
        when(repo.findById(1L)).thenReturn(Optional.of(t));

        service.keepActive(1L);

        assertNull(t.getStaleAt());
        assertNull(t.getStaleWarningSentAt());
        verify(auditService).logTerminalKeptActive(eq("T001-AAAA"), eq(1L), anyString());
    }

    @Test
    void setAutoArchiveExemptTogglesFlagAndAudits() {
        PosTerminal t = terminal(1L, PosTerminalStatus.OFFLINE);
        when(repo.findById(1L)).thenReturn(Optional.of(t));

        service.setAutoArchiveExempt(1L, true);

        assertEquals(Boolean.TRUE, t.getAutoArchiveExempt());
        verify(auditService).logTerminalExemptChanged(eq("T001-AAAA"), eq(1L), anyString(), eq(true));
    }

    // ── decommission ───────────────────────────────────────────────────────

    @Test
    void decommissionDelegatesToTerminalServiceAndAudits() {
        PosTerminal t = terminal(1L, PosTerminalStatus.ARCHIVED);
        t.setStaleAt(LocalDateTime.now());
        when(terminalService.decommission(eq(1L), anyString())).thenReturn(t);

        service.decommission(1L, "Hardware retired");

        verify(terminalService).decommission(eq(1L), eq("Hardware retired"));
        verify(auditService).logTerminalDecommissioned(eq("T001-AAAA"), eq(1L), anyString(), eq("Hardware retired"));
        assertNull(t.getStaleAt());
    }

    @Test
    void decommissionDefaultsReasonWhenBlank() {
        PosTerminal t = terminal(1L, PosTerminalStatus.ACTIVE);
        when(terminalService.decommission(eq(1L), anyString())).thenReturn(t);

        service.decommission(1L, null);

        verify(terminalService).decommission(eq(1L), eq("Decommissioned by admin"));
    }
}
