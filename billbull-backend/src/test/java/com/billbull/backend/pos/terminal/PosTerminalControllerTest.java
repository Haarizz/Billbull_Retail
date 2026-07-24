package com.billbull.backend.pos.terminal;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.security.access.AccessDeniedException;

import com.billbull.backend.security.ModulePermissionService;

/**
 * Confirms terminal lifecycle endpoints are authorized through
 * {@link ModulePermissionService} (permissions.pos.terminal.&lt;action&gt;) rather than a
 * hardcoded role list — see BillBull RBAC-for-POS extension. Every action-permission check must
 * run BEFORE the underlying service mutation; a denial must not leave a side effect.
 */
class PosTerminalControllerTest {

    @Mock private PosTerminalService service;
    @Mock private PosTerminalLifecycleService lifecycleService;
    @Mock private PosTerminalActivityService activityService;
    @Mock private ModulePermissionService modulePermissionService;

    @InjectMocks private PosTerminalController controller;

    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        lenient().when(service.archive(anyLong(), any())).thenReturn(new PosTerminal());
        lenient().when(lifecycleService.restore(anyLong())).thenReturn(new PosTerminal());
        lenient().when(lifecycleService.decommission(anyLong(), any())).thenReturn(new PosTerminal());
        lenient().when(service.approve(anyLong())).thenReturn(new PosTerminal());
        lenient().when(service.reject(anyLong(), any())).thenReturn(new PosTerminal());
        lenient().when(service.assignCounter(anyLong(), any())).thenReturn(new PosTerminal());
        lenient().when(service.rename(anyString(), any(), any())).thenReturn(new PosTerminal());
        lenient().when(service.setMainPos(anyString())).thenReturn(new PosTerminal());
        lenient().when(lifecycleService.keepActive(anyLong())).thenReturn(new PosTerminal());
        lenient().when(lifecycleService.manualArchiveNow(anyLong())).thenReturn(new PosTerminal());
        lenient().when(lifecycleService.setAutoArchiveExempt(anyLong(), org.mockito.ArgumentMatchers.anyBoolean()))
                .thenReturn(new PosTerminal());
        lenient().when(service.getForBranch(anyLong())).thenReturn(java.util.List.of());
        lenient().when(service.getAllForBranch(anyLong())).thenReturn(java.util.List.of());
        lenient().when(service.getPendingApproval(anyLong())).thenReturn(java.util.List.of());
    }

    @Test
    void archiveChecksArchivePermissionBeforeDelegating() {
        controller.archive(1L, Map.of("reason", "test"));
        verify(modulePermissionService).requireCanView("permissions.pos.terminal.archive");
        verify(service).archive(1L, "test");
    }

    @Test
    void archiveDeniedStopsBeforeServiceCall() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanView("permissions.pos.terminal.archive");

        assertThrows(AccessDeniedException.class, () -> controller.archive(1L, Map.of()));
        verify(service, never()).archive(anyLong(), any());
    }

    @Test
    void restoreChecksRestorePermission() {
        controller.restore(1L);
        verify(modulePermissionService).requireCanView("permissions.pos.terminal.restore");
        verify(lifecycleService).restore(1L);
    }

    @Test
    void decommissionChecksDecommissionPermission() {
        controller.decommission(1L, Map.of("reason", "retired"));
        verify(modulePermissionService).requireCanView("permissions.pos.terminal.decommission");
        verify(lifecycleService).decommission(1L, "retired");
    }

    @Test
    void decommissionDeniedStopsBeforeServiceCall() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanView("permissions.pos.terminal.decommission");

        assertThrows(AccessDeniedException.class, () -> controller.decommission(1L, null));
        verify(lifecycleService, never()).decommission(anyLong(), any());
    }

    @Test
    void approveChecksApprovePermission() {
        controller.approve(1L);
        verify(modulePermissionService).requireCanView("permissions.pos.terminal.approve");
        verify(service).approve(1L);
    }

    @Test
    void rejectChecksRejectPermission() {
        controller.reject(1L, Map.of("reason", "no"));
        verify(modulePermissionService).requireCanView("permissions.pos.terminal.reject");
        verify(service).reject(1L, "no");
    }

    @Test
    void renameChecksRenamePermission() {
        controller.rename("T001-AAAA", Map.of("terminalName", "Front Desk"));
        verify(modulePermissionService).requireCanView("permissions.pos.terminal.rename");
        verify(service).rename("T001-AAAA", "Front Desk", null);
    }

    @Test
    void assignCounterChecksAssignCounterPermission() {
        controller.assignCounter(1L, Map.of("counterId", "5"));
        verify(modulePermissionService).requireCanView("permissions.pos.terminal.assigncounter");
        verify(service).assignCounter(1L, 5L);
    }

    @Test
    void setMainChecksSetMainPermission() {
        controller.setMainPos("T001-AAAA");
        verify(modulePermissionService).requireCanView("permissions.pos.terminal.setmain");
        verify(service).setMainPos("T001-AAAA");
    }

    // ── setStatus branching: BLOCKED needs block permission, un-blocking needs unblock, ──
    // ── everything else falls back to the base pos.terminals edit permission ──────────

    @Test
    void setStatusToBlockedChecksBlockPermission() {
        when(service.findByTerminalIdOrThrow("T001-AAAA")).thenReturn(terminal(PosTerminalStatus.ACTIVE));
        when(service.setStatus("T001-AAAA", PosTerminalStatus.BLOCKED)).thenReturn(new PosTerminal());

        controller.setStatus("T001-AAAA", Map.of("status", "BLOCKED"));

        verify(modulePermissionService).requireCanView("permissions.pos.terminal.block");
        verify(modulePermissionService, never()).requireCanView("permissions.pos.terminal.unblock");
    }

    @Test
    void setStatusFromBlockedToActiveChecksUnblockPermission() {
        when(service.findByTerminalIdOrThrow("T001-AAAA")).thenReturn(terminal(PosTerminalStatus.BLOCKED));
        when(service.setStatus("T001-AAAA", PosTerminalStatus.ACTIVE)).thenReturn(new PosTerminal());

        controller.setStatus("T001-AAAA", Map.of("status", "ACTIVE"));

        verify(modulePermissionService).requireCanView("permissions.pos.terminal.unblock");
        verify(modulePermissionService, never()).requireCanView("permissions.pos.terminal.block");
    }

    @Test
    void setStatusPlainDeactivateFallsBackToBaseEditPermission() {
        when(service.findByTerminalIdOrThrow("T001-AAAA")).thenReturn(terminal(PosTerminalStatus.ACTIVE));
        when(service.setStatus("T001-AAAA", PosTerminalStatus.INACTIVE)).thenReturn(new PosTerminal());

        controller.setStatus("T001-AAAA", Map.of("status", "INACTIVE"));

        verify(modulePermissionService).requireCanEdit("pos.terminals");
        verify(modulePermissionService, never()).requireCanView(eq("permissions.pos.terminal.block"));
        verify(modulePermissionService, never()).requireCanView(eq("permissions.pos.terminal.unblock"));
    }

    @Test
    void setStatusBlockDeniedStopsBeforeServiceCall() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanView("permissions.pos.terminal.block");

        assertThrows(AccessDeniedException.class,
                () -> controller.setStatus("T001-AAAA", Map.of("status", "BLOCKED")));
        verify(service, never()).setStatus(anyString(), any());
    }

    // ── Auto-Archive lifecycle admin actions: keep-active / archive-now / exempt toggle ────────
    // (the gap flagged in the prior hardening pass — must now match every other admin action)

    @Test
    void keepActiveChecksKeepActivePermission() {
        controller.keepActive(1L);
        verify(modulePermissionService).requireCanView("permissions.pos.terminal.keepactive");
        verify(lifecycleService).keepActive(1L);
    }

    @Test
    void keepActiveDeniedStopsBeforeServiceCall() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanView("permissions.pos.terminal.keepactive");

        assertThrows(AccessDeniedException.class, () -> controller.keepActive(1L));
        verify(lifecycleService, never()).keepActive(anyLong());
    }

    @Test
    void archiveNowChecksArchivePermission() {
        controller.archiveNow(1L);
        verify(modulePermissionService).requireCanView("permissions.pos.terminal.archive");
        verify(lifecycleService).manualArchiveNow(1L);
    }

    @Test
    void archiveNowDeniedStopsBeforeServiceCall() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanView("permissions.pos.terminal.archive");

        assertThrows(AccessDeniedException.class, () -> controller.archiveNow(1L));
        verify(lifecycleService, never()).manualArchiveNow(anyLong());
    }

    @Test
    void setAutoArchiveExemptChecksDedicatedPermission() {
        controller.setAutoArchiveExempt(1L, Map.of("exempt", true));
        verify(modulePermissionService).requireCanView("permissions.pos.terminal.setautoarchiveexempt");
        verify(lifecycleService).setAutoArchiveExempt(1L, true);
    }

    @Test
    void setAutoArchiveExemptDeniedStopsBeforeServiceCall() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanView("permissions.pos.terminal.setautoarchiveexempt");

        assertThrows(AccessDeniedException.class,
                () -> controller.setAutoArchiveExempt(1L, Map.of("exempt", true)));
        verify(lifecycleService, never()).setAutoArchiveExempt(anyLong(), org.mockito.ArgumentMatchers.anyBoolean());
    }

    // ── Listing endpoints: view access, not a specific action ───────────────────────────────

    @Test
    void getForBranchChecksViewPermission() {
        controller.getForBranch(10L);
        verify(modulePermissionService).requireCanView("pos.terminals");
        verify(service).getForBranch(10L);
    }

    @Test
    void getForBranchDeniedStopsBeforeServiceCall() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanView("pos.terminals");

        assertThrows(AccessDeniedException.class, () -> controller.getForBranch(10L));
        verify(service, never()).getForBranch(anyLong());
    }

    @Test
    void getAllForBranchChecksViewPermission() {
        controller.getAllForBranch(10L);
        verify(modulePermissionService).requireCanView("pos.terminals");
        verify(service).getAllForBranch(10L);
    }

    @Test
    void getPendingChecksViewPermission() {
        controller.getPending(10L);
        verify(modulePermissionService).requireCanView("pos.terminals");
        verify(service).getPendingApproval(10L);
    }

    // ── Device self-service endpoints stay ungated: register/heartbeat must work for EVERY
    // authenticated POS user, not just permission holders — confirmed here by asserting they
    // never touch ModulePermissionService at all. ──────────────────────────────────────────

    @Test
    void heartbeatNeverConsultsModulePermissionService() {
        PosTerminal t = terminal(PosTerminalStatus.ACTIVE);
        t.setTerminalId("T001-AAAA");
        t.setLastHeartbeatAt(java.time.LocalDateTime.now());
        when(service.heartbeat(anyString(), any())).thenReturn(t);

        controller.heartbeat("T001-AAAA", org.mockito.Mockito.mock(jakarta.servlet.http.HttpServletRequest.class));

        verify(modulePermissionService, never()).requireCanView(anyString());
        verify(modulePermissionService, never()).requireCanEdit(anyString());
    }

    private PosTerminal terminal(PosTerminalStatus status) {
        PosTerminal t = new PosTerminal();
        t.setStatus(status);
        return t;
    }
}
