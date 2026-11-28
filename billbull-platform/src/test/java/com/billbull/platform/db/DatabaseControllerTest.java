package com.billbull.platform.db;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.platform.agent.AgentResponse;
import com.billbull.platform.backup.BackupReport;
import com.billbull.platform.backup.BackupReportRepository;
import com.billbull.platform.tenant.Tenant;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

class DatabaseControllerTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private JsonNode json(String s) throws Exception {
        return mapper.readTree(s);
    }

    @Test
    void okAnswersPassThrough() throws Exception {
        JsonNode body = json("{\"rows\":[]}");
        assertSame(body, DatabaseController.relay(new AgentResponse(200, body, 5, null)));
    }

    @Test
    void refusalsKeepTheirStatusAndCode() throws Exception {
        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> DatabaseController.relay(
                new AgentResponse(403, json("{\"code\":\"DB_CONSOLE_DISABLED\",\"message\":\"Switched off\"}"), 5, null)));
        assertEquals(403, e.getStatusCode().value());
        assertEquals("DB_CONSOLE_DISABLED: Switched off", e.getReason());
    }

    @Test
    void agentProblemsBecomeBadGateway() throws Exception {
        assertEquals(502, assertThrows(ResponseStatusException.class,
                () -> DatabaseController.relay(new AgentResponse(0, null, 0, "Connection refused"))).getStatusCode().value());
        ResponseStatusException auth = assertThrows(ResponseStatusException.class, () -> DatabaseController.relay(
                new AgentResponse(401, json("{\"code\":\"SIGNATURE_INVALID\"}"), 5, null)));
        assertEquals(502, auth.getStatusCode().value()); // never a 401: the admin app would sign the user out
        ResponseStatusException old = assertThrows(ResponseStatusException.class, () -> DatabaseController.relay(
                new AgentResponse(404, json("{\"code\":\"NOT_FOUND\",\"message\":\"Not found\"}"), 5, null)));
        assertTrue(old.getReason().startsWith("AGENT_NO_DB_TOOLS"));
        assertEquals(502, assertThrows(ResponseStatusException.class,
                () -> DatabaseController.relay(new AgentResponse(500, null, 5, null))).getStatusCode().value());
    }

    @Test
    void waitForAddsHeadroomToTheStatementTimeout() {
        assertEquals(Duration.ofSeconds(50), DatabaseController.waitFor(null));
        assertEquals(Duration.ofSeconds(140), DatabaseController.waitFor(120));
        assertEquals(Duration.ofSeconds(620), DatabaseController.waitFor(10_000));
    }

    @Test
    void finishedConsoleBackupsAreFiledOnceUnderBackups() throws Exception {
        BackupReportRepository reports = mock(BackupReportRepository.class);
        DatabaseController c = new DatabaseController(null, null, null, null, reports);
        Tenant t = new Tenant();
        t.id = 7L;
        t.code = "demo";
        when(reports.existsByTenantIdAndLocation(7L, "agent:demo-20261128T100000Z.dump")).thenReturn(true);
        JsonNode body = json("{\"backups\":["
                + "{\"name\":\"demo-20261128T100000Z.dump\",\"status\":\"SUCCESS\",\"finishedAt\":\"2026-11-28T10:01:00Z\"},"
                + "{\"name\":\"demo-20261128T110000Z.dump\",\"status\":\"SUCCESS\",\"startedAt\":\"2026-11-28T11:00:00Z\","
                + "\"finishedAt\":\"2026-11-28T11:01:00Z\",\"sizeBytes\":1234,\"sha256\":\"ab\",\"requestedBy\":\"ops@x\",\"database\":\"billbull_demo\"},"
                + "{\"name\":\"demo-20261128T120000Z.dump\",\"status\":\"RUNNING\"}]}");
        c.recordFinished(t, body);
        ArgumentCaptor<BackupReport> saved = ArgumentCaptor.forClass(BackupReport.class);
        verify(reports).save(saved.capture());
        assertEquals("agent:demo-20261128T110000Z.dump", saved.getValue().location);
        assertEquals(1234L, saved.getValue().sizeBytes);
        assertEquals("billbull_demo", saved.getValue().databaseName);
        verify(reports, never()).existsByTenantIdAndLocation(eq(7L), eq("agent:demo-20261128T120000Z.dump"));
    }
}
