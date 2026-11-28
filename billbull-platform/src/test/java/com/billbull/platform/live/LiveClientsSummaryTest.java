package com.billbull.platform.live;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.billbull.platform.agent.AgentResponse;
import com.billbull.platform.tenant.Tenant;
import com.billbull.platform.tenant.TenantStatus;
import com.fasterxml.jackson.databind.ObjectMapper;

class LiveClientsSummaryTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void countsOnlineDevicesPeopleAndAppsFromThePresenceAnswer() throws Exception {
        String body = """
                {"devices":[
                  {"userId":1,"username":"admin","app":"RETAIL","online":true,"lastSeenAt":"2026-11-28T10:00:00Z"},
                  {"userId":1,"username":"admin","app":"POS_DESKTOP","online":true,"lastSeenAt":"2026-11-28T10:02:00Z"},
                  {"userId":2,"username":"cashier","app":"POS","online":false,"lastSeenAt":"2026-11-28T09:00:00Z"}],
                 "activeUsersToday":4,
                 "pos":{"terminalsOnline":1,"terminalsTotal":3},
                 "sales":{"invoicesToday":17},
                 "openPosSessions":[{"id":9,"cashier":"cashier"}],
                 "errors":{}}
                """;
        Map<String, Object> row = LiveClientsService.summarize(tenant("UP"),
                new AgentResponse(200, mapper.readTree(body), 40, null), mapper);

        assertThat(row.get("connection")).isEqualTo("ONLINE");
        assertThat(row.get("devicesOnline")).isEqualTo(2);
        assertThat(row.get("peopleOnline")).isEqualTo(1);
        assertThat(row.get("appsOnline")).isEqualTo(Map.of("RETAIL", 1, "POS_DESKTOP", 1));
        assertThat(row.get("lastActivityAt")).isEqualTo("2026-11-28T10:02:00Z");
        assertThat(row.get("activeToday")).isEqualTo(4L);
        assertThat((List<?>) row.get("devices")).hasSize(3);
        assertThat(row.get("error")).isNull();

        Map<String, Object> totals = LiveClientsService.totals(List.of(row,
                LiveClientsService.summarize(tenant("UP"), new AgentResponse(0, null, 4000, "refused"), mapper)));
        assertThat(totals.get("clients")).isEqualTo(2);
        assertThat(totals.get("clientsOnline")).isEqualTo(1);
        assertThat(totals.get("clientsReporting")).isEqualTo(1);
        assertThat(totals.get("devicesOnline")).isEqualTo(2);
        assertThat(totals.get("terminalsTotal")).isEqualTo(3L);
        assertThat(totals.get("invoicesToday")).isEqualTo(17L);
        assertThat(totals.get("openPosSessions")).isEqualTo(1);
    }

    @Test
    void namesWhyAClientCannotReport() throws Exception {
        assertThat(LiveClientsService.summarize(tenant(null), null, mapper).get("connection")).isEqualTo("NOT_CONFIGURED");
        assertThat(conn(tenant("UP"), new AgentResponse(0, null, 4000, "refused"))).isEqualTo("UNREACHABLE");
        assertThat(conn(tenant("UP"), new AgentResponse(404, null, 10, null))).isEqualTo("OUTDATED");
        assertThat(conn(tenant("AGENT_OFF"), new AgentResponse(404, null, 10, null))).isEqualTo("AGENT_OFF");
        assertThat(conn(tenant("UP"), new AgentResponse(401, null, 10, null))).isEqualTo("AUTH_FAILED");
        assertThat(conn(tenant("UP"), new AgentResponse(200, mapper.readTree("{\"devices\":[]}"), 10, null))).isEqualTo("OFFLINE");
    }

    @Test
    void fleetHistorySumsTenantsPerBucket() {
        var history = LiveClientsService.fleetHistory(Map.of(
                1L, List.of(Map.of("at", "a", "devices", 2L, "users", 1L), Map.of("at", "b", "devices", 1L, "users", 1L)),
                2L, List.of(Map.of("at", "a", "devices", 3L, "users", 2L))));
        assertThat(history).containsExactly(
                Map.of("at", "a", "devices", 5L, "users", 3L),
                Map.of("at", "b", "devices", 1L, "users", 1L));
    }

    private String conn(Tenant t, AgentResponse r) {
        return (String) LiveClientsService.summarize(t, r, mapper).get("connection");
    }

    private static Tenant tenant(String health) {
        Tenant t = new Tenant();
        t.id = 1L;
        t.code = "demo";
        t.name = "Demo Store";
        t.status = TenantStatus.ACTIVE;
        t.lastHealthStatus = health;
        return t;
    }
}
