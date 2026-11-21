package com.billbull.backend.pos.terminal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import com.billbull.backend.pos.audit.PosAuditAction;
import com.billbull.backend.pos.audit.PosAuditLog;
import com.billbull.backend.pos.audit.PosAuditLogRepository;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;

@ExtendWith(MockitoExtension.class)
class PosTerminalInsightServiceTest {

    @Mock private PosSessionRepository sessionRepo;
    @Mock private PosAuditLogRepository auditRepo;
    @Mock private PosTerminalRepository terminalRepo;
    @Mock private UserRepository userRepo;

    private PosTerminalInsightService service;

    @BeforeEach
    void setUp() {
        service = new PosTerminalInsightService(sessionRepo, auditRepo, terminalRepo, userRepo,
                new com.billbull.backend.pos.businessdate.BusinessDayClock("Asia/Dubai"));
    }

    @Test
    void enrichAddsSignedInUserAndOpenShiftSummary() {
        PosTerminal withShift = terminal("T001-AAAA", "Front", 77L, "cashier1");
        PosTerminal idle = terminal("T002-BBBB", "Back", null, "cashier1");
        LocalDateTime opened = LocalDateTime.now().minusHours(3);
        when(sessionRepo.findAllById(List.of(77L))).thenReturn(List.of(session(77L, "cashier1", "Asha K", opened)));
        when(userRepo.findByUsername("cashier1")).thenReturn(Optional.of(user("cashier1", "Asha K")));

        service.enrich(List.of(withShift, idle));

        assertEquals("Asha K", withShift.getLastUserDisplayName());
        assertEquals("cashier1", withShift.getShiftOpenedBy());
        assertEquals("Asha K", withShift.getShiftOpenedByDisplayName());
        assertEquals(opened.atZone(java.time.ZoneId.of("Asia/Dubai")), withShift.getShiftOpenedAt());
        assertEquals(12, withShift.getShiftInvoiceCount());
        assertEquals(new BigDecimal("845.50"), withShift.getShiftTotalSales());
        assertFalse(withShift.getShiftClosing());

        assertEquals("Asha K", idle.getLastUserDisplayName());
        assertNull(idle.getShiftOpenedBy());
        // One user lookup for both terminals: names are cached per call.
        verify(userRepo, times(1)).findByUsername("cashier1");
    }

    @Test
    void enrichSkipsSessionLookupWhenNoShiftIsOpen() {
        service.enrich(List.of(terminal("T001-AAAA", "Front", null, null)));
        verify(sessionRepo, never()).findAllById(any());
        verify(userRepo, never()).findByUsername(any());
    }

    @Test
    void recentActivityNarrowsToTerminalAndCapsTheLimit() {
        PosAuditLog log = new PosAuditLog();
        log.setAction(PosAuditAction.SESSION_OPENED);
        log.setTerminalId("T001-AAAA");
        log.setUserId("cashier1");
        log.setDescription("POS session opened on terminal T001-AAAA");
        when(auditRepo.findByBranchIdAndTerminalIdOrderByCreatedAtDescIdDesc(eq(5L), eq("T001-AAAA"), any(Pageable.class)))
                .thenReturn(List.of(log));
        when(terminalRepo.findByBranchIdOrderByTerminalIdAsc(5L)).thenReturn(List.of(terminal("T001-AAAA", "Front", null, null)));
        when(userRepo.findByUsername("cashier1")).thenReturn(Optional.of(user("cashier1", "Asha K")));

        List<Map<String, Object>> out = service.recentActivity(5L, " T001-AAAA ", 10_000);

        assertEquals(1, out.size());
        assertEquals("SESSION_OPENED", out.get(0).get("action"));
        assertEquals("Front", out.get(0).get("terminalName"));
        assertEquals("Asha K", out.get(0).get("userDisplayName"));
        verify(auditRepo).findByBranchIdAndTerminalIdOrderByCreatedAtDescIdDesc(eq(5L), eq("T001-AAAA"),
                org.mockito.ArgumentMatchers.argThat(p -> p.getPageSize() == PosTerminalInsightService.MAX_ACTIVITY_LIMIT));
    }

    @Test
    void recentActivityWithoutTerminalReadsTheWholeBranch() {
        when(auditRepo.findByBranchIdOrderByCreatedAtDescIdDesc(eq(5L), any(Pageable.class))).thenReturn(List.of());
        assertTrue(service.recentActivity(5L, null, null).isEmpty());
        verify(auditRepo).findByBranchIdOrderByCreatedAtDescIdDesc(eq(5L),
                org.mockito.ArgumentMatchers.argThat(p -> p.getPageSize() == PosTerminalInsightService.DEFAULT_ACTIVITY_LIMIT));
        verify(auditRepo, never()).findByBranchIdAndTerminalIdOrderByCreatedAtDescIdDesc(anyLong(), any(), any());
    }

    // ── fixtures ────────────────────────────────────────────────────────────

    private static PosTerminal terminal(String terminalId, String name, Long openSessionId, String lastUser) {
        PosTerminal t = new PosTerminal();
        t.setTerminalId(terminalId);
        t.setTerminalName(name);
        t.setCurrentOpenSessionId(openSessionId);
        t.setLastUser(lastUser);
        return t;
    }

    private static PosSession session(Long id, String openedBy, String displayName, LocalDateTime openedAt) {
        PosSession s = new PosSession();
        s.setId(id);
        s.setOpenedBy(openedBy);
        s.setOpenedByDisplayName(displayName);
        s.setOpenedAt(openedAt);
        s.setInvoiceCount(12);
        s.setTotalSales(new BigDecimal("845.50"));
        return s;
    }

    private static User user(String username, String fullName) {
        User u = new User();
        u.setUsername(username);
        u.setFullName(fullName);
        return u;
    }
}
