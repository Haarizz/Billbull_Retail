package com.billbull.platform.health;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

import com.billbull.platform.agent.AgentResponse;
import com.fasterxml.jackson.databind.ObjectMapper;

class HealthMappingTest {

    private static HealthSnapshot map(AgentResponse r) {
        HealthSnapshot s = new HealthSnapshot();
        HealthService.fill(s, r);
        return s;
    }

    @Test
    void mapsAHealthyTenantReport() throws Exception {
        String json = """
                {"status":"UP","uptimeSeconds":120,
                 "build":{"version":"dev","artifactSha256":"abc123","artifactTime":"2026-11-20T10:00:00Z"},
                 "database":{"ok":true,"sizeBytes":5000},
                 "flyway":{"currentVersion":"148","pendingCount":0,"failedCount":0},
                 "usage":{"activeUsers":7,"branches":2,"terminals":3,"openPosSessions":1,"salesInvoices30d":40,
                          "lastSalesInvoiceAt":"2026-11-21 09:00:00"},
                 "jvm":{"heapUsedBytes":100,"heapMaxBytes":1000,"diskFreeBytes":50,"diskTotalBytes":100},
                 "state":{"status":"ACTIVE","configVersion":4},
                 "errors":{}}
                """;
        HealthSnapshot s = map(new AgentResponse(200, new ObjectMapper().readTree(json), 35, null));
        assertEquals("UP", s.status);
        assertEquals("148", s.flywayVersion);
        assertEquals(7L, s.activeUsers);
        assertEquals(4L, s.reportedConfigVersion);
        assertEquals("abc123", s.artifactSha256);
        assertEquals(35L, s.latencyMs);
        assertNull(s.error);
    }

    @Test
    void classifiesFailures() {
        assertEquals("UNREACHABLE", map(new AgentResponse(0, null, 4000, "ConnectException")).status);
        assertEquals("AUTH_FAILED", map(new AgentResponse(401, null, 10, null)).status);
        assertEquals("AUTH_FAILED", map(new AgentResponse(503, null, 10, null)).status);
        assertEquals("AGENT_OFF", map(new AgentResponse(404, null, 10, null)).status);
        assertEquals("ERROR", map(new AgentResponse(500, null, 10, null)).status);
    }
}
