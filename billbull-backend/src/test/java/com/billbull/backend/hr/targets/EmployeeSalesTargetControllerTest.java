package com.billbull.backend.hr.targets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;

import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.user.UserRepository;

/**
 * Authorization and self-scoping for the targets API.
 *
 * <p>Reads require {@code canView("hr.employee")} and writes {@code canEdit("hr.employee")} — the
 * existing HR module gates, deliberately reused rather than a new module key. The {@code /me}
 * endpoint takes no employee id at all.
 */
@ExtendWith(MockitoExtension.class)
class EmployeeSalesTargetControllerTest {

    @Mock private EmployeeSalesTargetService targetService;
    @Mock private EmployeePerformanceService performanceService;
    @Mock private ModulePermissionService modulePermissionService;
    @Mock private UserRepository userRepository;
    @Mock private TargetReadinessService readinessService;

    private EmployeeSalesTargetController controller;

    private static final LocalDate SEP = LocalDate.of(2026, 9, 1);

    @BeforeEach
    void setUp() {
        controller = new EmployeeSalesTargetController(
                targetService, performanceService, readinessService,
                modulePermissionService, userRepository);
    }

    private static Authentication auth(String username) {
        return new UsernamePasswordAuthenticationToken(username, "x", List.of());
    }

    private static EmployeeSalesTargetUpsertRequest request() {
        EmployeeSalesTargetUpsertRequest r = new EmployeeSalesTargetUpsertRequest();
        r.setEmployeeId(1L);
        r.setTargetMonth(SEP);
        r.setTargetAmount(new BigDecimal("100000"));
        r.setCommissionRate(new BigDecimal("10"));
        return r;
    }

    // ── read permission ─────────────────────────────────────────────────────

    @Test
    void performanceRequiresViewPermissionOnHrEmployee() {
        when(performanceService.getPerformance(any(), any())).thenReturn(new EmployeePerformanceResponse());

        controller.getPerformance(SEP, null);

        verify(modulePermissionService).requireCanView("hr.employee");
    }

    @Test
    void performanceAccessDeniedPropagatesAndNeverReachesTheService() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanView("hr.employee");

        assertThrows(AccessDeniedException.class, () -> controller.getPerformance(SEP, null));
        verifyNoInteractions(performanceService);
    }

    @Test
    void performancePassesTheBranchFilterThrough() {
        when(performanceService.getPerformance(SEP, 3L)).thenReturn(new EmployeePerformanceResponse());

        controller.getPerformance(SEP, 3L);

        verify(performanceService).getPerformance(SEP, 3L);
    }

    @Test
    void performanceDefaultsToTheCurrentMonthWhenNoneIsGiven() {
        when(performanceService.getPerformance(any(), isNull())).thenReturn(new EmployeePerformanceResponse());

        controller.getPerformance(null, null);

        verify(performanceService).getPerformance(LocalDate.now().withDayOfMonth(1), null);
    }

    // ── write permission ────────────────────────────────────────────────────

    @Test
    void upsertRequiresEditPermissionOnHrEmployee() {
        controller.upsert(request());

        verify(modulePermissionService).requireCanEdit("hr.employee");
        verify(targetService).upsert(eq(1L), eq(SEP), any(), any());
    }

    @Test
    void upsertAccessDeniedPropagatesAndWritesNothing() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanEdit("hr.employee");

        assertThrows(AccessDeniedException.class, () -> controller.upsert(request()));
        verifyNoInteractions(targetService);
    }

    @Test
    void bulkUpsertRequiresEditPermissionOnHrEmployee() {
        controller.upsertBulk(List.of(request()));

        verify(modulePermissionService).requireCanEdit("hr.employee");
        verify(targetService).upsertAll(any());
    }

    @Test
    void bulkUpsertAccessDeniedPropagatesAndWritesNothing() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanEdit("hr.employee");

        assertThrows(AccessDeniedException.class, () -> controller.upsertBulk(List.of(request())));
        verifyNoInteractions(targetService);
    }

    @Test
    void readPermissionDoesNotGrantWriteAccess() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanEdit("hr.employee");
        // View is allowed (default mock = no throw) but the write is still refused.
        assertThrows(AccessDeniedException.class, () -> controller.upsert(request()));
    }

    // ── self service ────────────────────────────────────────────────────────

    @Test
    void meResolvesTheEmployeeFromTheAuthenticatedPrincipalNotFromAnyParameter() {
        // Resolved through the scalar id query — never through the LAZY User.linkedEmployee proxy,
        // which is detached in a controller (open-in-view is off).
        when(userRepository.findLinkedEmployeeIdByUsername("cashier1")).thenReturn(Optional.of(77L));
        when(performanceService.getForEmployeeId(eq(77L), eq(SEP), isNull()))
                .thenReturn(new EmployeePerformanceRow());

        var response = controller.getMyPerformance(SEP, auth("cashier1"));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        // Self view is consolidated across branches (null branchId) — the target is global.
        verify(performanceService).getForEmployeeId(77L, SEP, null);
        verify(userRepository, never()).findByUsername(any());
        // And it never consults the HR module permission: an employee reads their own figures.
        verifyNoInteractions(modulePermissionService);
    }

    @Test
    void meReturnsNoContentWhenTheUserHasNoLinkedEmployee() {
        // No linked employee -> the scalar query finds no row.
        when(userRepository.findLinkedEmployeeIdByUsername("backoffice")).thenReturn(Optional.empty());

        var response = controller.getMyPerformance(SEP, auth("backoffice"));

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        assertNull(response.getBody());
        verify(performanceService, never()).getForEmployeeId(any(), any(), any());
    }

    @Test
    void meReturnsNoContentWhenTheUserRecordIsMissingEntirely() {
        when(userRepository.findLinkedEmployeeIdByUsername("ghost")).thenReturn(Optional.empty());

        assertEquals(HttpStatus.NO_CONTENT,
                controller.getMyPerformance(SEP, auth("ghost")).getStatusCode());
    }

    @Test
    void meReturnsNoContentWhenTheLinkedEmployeeRowNoLongerExists() {
        when(userRepository.findLinkedEmployeeIdByUsername("orphan")).thenReturn(Optional.of(404L));
        when(performanceService.getForEmployeeId(eq(404L), any(), isNull())).thenReturn(null);

        assertEquals(HttpStatus.NO_CONTENT,
                controller.getMyPerformance(SEP, auth("orphan")).getStatusCode());
    }

    @Test
    void meRejectsAnUnauthenticatedCaller() {
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> controller.getMyPerformance(SEP, null));
    }
}
