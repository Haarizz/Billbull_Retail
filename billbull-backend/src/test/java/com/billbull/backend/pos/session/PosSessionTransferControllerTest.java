package com.billbull.backend.pos.session;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.businessdate.PosBusinessDateService;
import com.billbull.backend.pos.businessdate.PosDayStatusService;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.fasterxml.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Session Roaming Phase 8 — controller-level tests for {@code POST /{id}/transfer}. The service
 * ({@link PosSessionService#transferSession}) is mocked here; these tests only confirm the
 * controller's request-shape validation (confirm flag, destinationTerminalId presence) and that
 * it delegates without adding its own business logic.
 */
class PosSessionTransferControllerTest {

    @Mock private PosSessionService service;
    @Mock private ObjectMapper objectMapper;
    @Mock private PosDayStatusService dayStatusService;
    @Mock private PosBusinessDateService businessDateService;
    @Mock private BranchAccessService branchAccessService;

    @InjectMocks private PosSessionController controller;

    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
    }

    private static Map<String, Object> body(String destinationTerminalId, Boolean confirm, String reason, String pin) {
        Map<String, Object> body = new HashMap<>();
        if (destinationTerminalId != null) body.put("destinationTerminalId", destinationTerminalId);
        if (confirm != null) body.put("confirm", confirm);
        if (reason != null) body.put("reason", reason);
        if (pin != null) body.put("supervisorPin", pin);
        return body;
    }

    @Test
    void transferDelegatesToServiceWhenConfirmedWithDestination() {
        PosSessionTransferResponse expected = PosSessionTransferResponse.of(
                sessionMoved(), "T1", null, "counter relocation", null);
        when(service.transferSession(5L, "T2", "counter relocation", null)).thenReturn(expected);

        ResponseEntity<PosSessionTransferResponse> response =
                controller.transferSession(5L, body("T2", true, "counter relocation", null));

        assertEquals(200, response.getStatusCode().value());
        assertEquals(expected, response.getBody());
        verify(service).transferSession(5L, "T2", "counter relocation", null);
    }

    @Test
    void transferPassesSupervisorPinThrough() {
        PosSessionTransferResponse expected = PosSessionTransferResponse.of(sessionMoved(), "T1", null, null, null);
        when(service.transferSession(5L, "T2", null, "1234")).thenReturn(expected);

        controller.transferSession(5L, body("T2", true, null, "1234"));

        verify(service).transferSession(5L, "T2", null, "1234");
    }

    @Test
    void transferRejectsMissingConfirmationFlag() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.transferSession(5L, body("T2", null, null, null)));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verifyNoInteractions(service);
    }

    @Test
    void transferRejectsExplicitFalseConfirmation() {
        assertThrows(ResponseStatusException.class,
                () -> controller.transferSession(5L, body("T2", false, null, null)));

        verifyNoInteractions(service);
    }

    @Test
    void transferRejectsMissingDestinationTerminalId() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.transferSession(5L, body(null, true, null, null)));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verifyNoInteractions(service);
    }

    @Test
    void transferRejectsBlankDestinationTerminalId() {
        assertThrows(ResponseStatusException.class,
                () -> controller.transferSession(5L, body("  ", true, null, null)));

        verifyNoInteractions(service);
    }

    private static PosSession sessionMoved() {
        PosSession s = new PosSession();
        s.setId(5L);
        s.setTerminalId("T2");
        s.setOwnerUserId(42L);
        s.setOpenedBy("cashier1");
        return s;
    }
}
