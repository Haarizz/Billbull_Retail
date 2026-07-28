package com.billbull.backend.pos.session;

import com.billbull.backend.security.ModulePermissionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

/**
 * Confirms the Cash Drop / Outs Management endpoints are authorized through
 * {@link ModulePermissionService} (permissions.pos.cashmovement.&lt;action&gt;) — same mechanism
 * as {@code PosTerminalControllerTest} — and that a denial happens BEFORE the service is called
 * (no side effect on a rejected request). Also confirms cashiers (holders of {@code view} but
 * not {@code viewall}) cannot list cross-session history without an explicit sessionId.
 */
class PosCashMovementControllerTest {

    @Mock private PosCashMovementService service;
    @Mock private ModulePermissionService modulePermissionService;

    @InjectMocks private PosCashMovementController controller;

    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
    }

    @Test
    void createChecksCreatePermissionBeforeDelegating() {
        PosCashMovementController.CreateRequest body = new PosCashMovementController.CreateRequest();
        body.sessionId = 1L;
        body.movementType = "DROP_IN";
        body.amount = new BigDecimal("50");
        body.description = "Float top-up";

        controller.create(body);

        verify(modulePermissionService).requireCanView("permissions.pos.cashmovement.create");
        verify(service).create(1L, "DROP_IN", new BigDecimal("50"), "Float top-up", null);
    }

    @Test
    void createDeniedStopsBeforeServiceCall() {
        doThrow(new AccessDeniedException("denied")).when(modulePermissionService)
                .requireCanView("permissions.pos.cashmovement.create");

        PosCashMovementController.CreateRequest body = new PosCashMovementController.CreateRequest();
        body.sessionId = 1L;
        body.movementType = "DROP_IN";
        body.amount = new BigDecimal("50");

        assertThrows(AccessDeniedException.class, () -> controller.create(body));
        verifyNoInteractions(service);
    }

    @Test
    void editChecksEditPermissionBeforeDelegating() {
        PosCashMovementController.EditRequest body = new PosCashMovementController.EditRequest();
        body.description = "Corrected";
        body.reference = "REF-2";

        controller.edit(10L, body);

        verify(modulePermissionService).requireCanView("permissions.pos.cashmovement.edit");
        verify(service).edit(10L, "Corrected", "REF-2");
    }

    @Test
    void editDeniedStopsBeforeServiceCall() {
        doThrow(new AccessDeniedException("denied")).when(modulePermissionService)
                .requireCanView("permissions.pos.cashmovement.edit");

        assertThrows(AccessDeniedException.class, () -> controller.edit(10L, new PosCashMovementController.EditRequest()));
        verifyNoInteractions(service);
    }

    @Test
    void voidChecksVoidPermissionBeforeDelegating() {
        PosCashMovementController.VoidRequest body = new PosCashMovementController.VoidRequest();
        body.voidReason = "Miscounted";

        controller.voidMovement(10L, body);

        verify(modulePermissionService).requireCanView("permissions.pos.cashmovement.void");
        verify(service).voidMovement(10L, "Miscounted");
    }

    @Test
    void voidDeniedStopsBeforeServiceCall() {
        doThrow(new AccessDeniedException("denied")).when(modulePermissionService)
                .requireCanView("permissions.pos.cashmovement.void");

        assertThrows(AccessDeniedException.class,
                () -> controller.voidMovement(10L, new PosCashMovementController.VoidRequest()));
        verifyNoInteractions(service);
    }

    @Test
    void listRequiresSessionIdWhenCallerLacksViewAll() {
        when(modulePermissionService.canView("permissions.pos.cashmovement.viewall")).thenReturn(false);

        assertThrows(ResponseStatusException.class,
                () -> controller.list(null, null, null, null, null, null, null, 0, 20));

        verify(modulePermissionService).requireCanView("permissions.pos.cashmovement.view");
        verifyNoInteractions(service);
    }

    @Test
    void listAllowsCrossSessionQueryForViewAllHolders() {
        when(modulePermissionService.canView("permissions.pos.cashmovement.viewall")).thenReturn(true);

        controller.list(7L, null, null, null, null, null, null, 0, 20);

        verify(modulePermissionService).requireCanView("permissions.pos.cashmovement.viewall");
        verify(service).list(7L, null, null, null, null, null, null, 0, 20);
    }
}
