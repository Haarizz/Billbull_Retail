package com.billbull.backend.security.accessaudit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;

import com.billbull.backend.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class AccessAuditServiceTest {

    @Mock private AccessAuditRepository repository;
    @Mock private UserRepository userRepository;

    /** In-memory stand-in for the append-only table. */
    private final List<AccessAuditEvent> table = new ArrayList<>();
    private AccessAuditService service;
    private MockHttpServletRequest request;

    @BeforeEach
    void setUp() {
        service = new AccessAuditService(repository, userRepository, new ObjectMapper());

        lenient().when(repository.save(any(AccessAuditEvent.class))).thenAnswer(inv -> {
            AccessAuditEvent e = inv.getArgument(0);
            ReflectionTestUtils.setField(e, "id", (long) table.size() + 1);
            table.add(e);
            return e;
        });
        lenient().when(repository.findTopByOrderByIdDesc()).thenAnswer(inv ->
                table.isEmpty() ? Optional.empty() : Optional.of(table.get(table.size() - 1)));
        lenient().when(repository.findChainPage(anyLong(), any(Pageable.class))).thenAnswer(inv -> {
            long after = inv.getArgument(0);
            return table.stream().filter(e -> e.getId() > after).toList();
        });
        lenient().when(userRepository.findByUsername(any())).thenReturn(Optional.empty());

        request = new MockHttpServletRequest();
        request.setRemoteAddr("10.0.0.9");
        request.setServerName("geebu.billbull.app");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        SecurityContextHolder.getContext().setAuthentication(
                new TestingAuthenticationToken("admin", null, "ROLE_ADMIN"));
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
        SecurityContextHolder.clearContext();
    }

    @Test
    void recordsActorRequestContextReasonAndValues() {
        request.addHeader("X-Forwarded-For", "203.0.113.7, 10.0.0.1");
        request.addHeader("User-Agent", "Mozilla/5.0 Test");
        request.addHeader(AccessAuditService.REASON_HEADER,
                URLEncoder.encode("Auditor asked — مراجعة", StandardCharsets.UTF_8));

        AccessAuditEvent e = service.record(AccessAuditService.Entry.of(AccessAuditAction.PERMISSION_CHANGED)
                .target(5L, "SALES · sales.invoice")
                .role("SALES")
                .module("sales.invoice")
                .previous(AccessAuditService.flags(true, false, false, false, false, false))
                .next(AccessAuditService.flags(true, true, false, false, false, false))
                .summary("+create")
                .affected(AccessAuditService.Affected.of(List.of(3L, 4L), List.of("cashier1", "cashier2"))));

        assertEquals("admin", e.getActorUsername());
        assertEquals("ADMIN", e.getActorRoles());
        assertEquals("PERMISSION_CHANGED", e.getAction());
        assertEquals("ROLE_PERMISSION", e.getTargetType());
        assertEquals("203.0.113.7", e.getIpAddress(), "first X-Forwarded-For hop is the client");
        assertEquals("Mozilla/5.0 Test", e.getUserAgent());
        assertEquals("geebu.billbull.app", e.getTenant());
        assertEquals("Auditor asked — مراجعة", e.getReason(), "URL-encoded header decodes, non-Latin text survives");
        assertTrue(e.getPreviousValue().contains("\"create\":false"));
        assertTrue(e.getNewValue().contains("\"create\":true"));
        assertEquals("3,4", e.getAffectedUserIds());
        assertEquals("cashier1,cashier2", e.getAffectedUsernames());
        assertEquals(2, e.getAffectedUserCount());
        assertNotNull(e.getRowHash());
    }

    @Test
    void rowsOfOneRequestShareAChangeSetAndChainTogether() {
        AccessAuditEvent first = service.record(entry("a"));
        AccessAuditEvent second = service.record(entry("b"));

        assertNull(first.getPrevHash(), "genesis row has no predecessor");
        assertEquals(first.getRowHash(), second.getPrevHash());
        assertEquals(first.getChangeSetId(), second.getChangeSetId());

        // A new request starts a new change set
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
        AccessAuditEvent third = service.record(entry("c"));
        assertFalse(third.getChangeSetId().equals(first.getChangeSetId()));
    }

    @Test
    void verifyPassesOnAnUntouchedChain() {
        service.record(entry("a"));
        service.record(entry("b"));
        service.record(entry("c"));

        AccessAuditService.ChainVerification v = service.verifyChain();
        assertTrue(v.intact());
        assertEquals(3, v.rowsChecked());
    }

    @Test
    void verifyDetectsAnEditedRow() {
        service.record(entry("a"));
        service.record(entry("b"));
        service.record(entry("c"));

        ReflectionTestUtils.setField(table.get(1), "reason", "rewritten later");

        AccessAuditService.ChainVerification v = service.verifyChain();
        assertFalse(v.intact());
        assertEquals(2L, v.firstBrokenId());
    }

    @Test
    void verifyDetectsADeletedRow() {
        service.record(entry("a"));
        service.record(entry("b"));
        service.record(entry("c"));

        table.remove(1);

        AccessAuditService.ChainVerification v = service.verifyChain();
        assertFalse(v.intact());
        assertEquals(3L, v.firstBrokenId());
    }

    @Test
    void requireReasonRejectsMissingOrTooShortReason() {
        assertThrows(ResponseStatusException.class, service::requireReason);
        service.useReason("ok");
        assertThrows(ResponseStatusException.class, service::requireReason);
        service.useReason("Quarterly access review");
        assertEquals("Quarterly access review", service.requireReason());
    }

    @Test
    void bodyReasonTakesPrecedenceOverHeader() {
        request.addHeader(AccessAuditService.REASON_HEADER, "from header");
        service.useReason("from body");
        AccessAuditEvent e = service.record(AccessAuditService.Entry.of(AccessAuditAction.ROLE_UPDATED).target(1L, "x"));
        assertEquals("from body", e.getReason());
    }

    @Test
    void recordsSystemActorOutsideAnHttpRequest() {
        RequestContextHolder.resetRequestAttributes();
        SecurityContextHolder.clearContext();

        AccessAuditEvent e = service.record(entry("seed"));
        assertEquals("SYSTEM", e.getActorUsername());
        assertNull(e.getIpAddress());
        assertNotNull(e.getChangeSetId());
    }

    @Test
    void csvCellQuotesAndNeutralisesFormulas() {
        assertEquals("\"plain\"", AccessAuditController.cell("plain"));
        assertEquals("\"say \"\"hi\"\"\"", AccessAuditController.cell("say \"hi\""));
        assertEquals("\"'=HYPERLINK(1)\"", AccessAuditController.cell("=HYPERLINK(1)"));
        assertEquals("", AccessAuditController.cell(null));
    }

    private static AccessAuditService.Entry entry(String label) {
        return AccessAuditService.Entry.of(AccessAuditAction.ROLE_UPDATED)
                .target(1L, label)
                .role("SALES")
                .reason("test reason " + label);
    }
}
