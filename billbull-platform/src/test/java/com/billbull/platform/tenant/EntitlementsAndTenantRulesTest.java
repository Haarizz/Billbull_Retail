package com.billbull.platform.tenant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.platform.plan.Plan;

class EntitlementsAndTenantRulesTest {

    private static Plan starter() {
        Plan p = new Plan();
        p.code = "STARTER";
        p.modules = "pos";
        p.maxUsers = 5;
        p.maxBranches = 1;
        p.maxTerminalsPerBranch = 2;
        return p;
    }

    @Test
    void planDecidesUnlessTenantOverrides() {
        Tenant t = new Tenant();
        Entitlements e = Entitlements.resolve(starter(), t);
        assertEquals(Map.of("pos", true, "purchases", false, "finance", false, "hr", false, "customer", false), e.modules());
        assertEquals(5, e.maxUsers());

        t.moduleOverrides.put("finance", true);
        t.moduleOverrides.put("pos", false);
        t.maxUsers = 0;       // override to unlimited
        t.maxBranches = 4;
        e = Entitlements.resolve(starter(), t);
        assertEquals(true, e.modules().get("finance"));
        assertEquals(false, e.modules().get("pos"));
        assertNull(e.maxUsers());
        assertEquals(4, e.maxBranches());
        assertEquals(2, e.maxTerminalsPerBranch());
        assertEquals(Map.of("maxBranches", 4, "maxTerminalsPerBranch", 2), e.limitsMap());
    }

    @Test
    void noPlanMeansEverythingUnlimited() {
        Entitlements e = Entitlements.resolve(null, new Tenant());
        e.modules().values().forEach(v -> assertEquals(true, v));
        assertEquals(Map.of(), e.limitsMap());
    }

    @Test
    void agentStateMapsArchivedToSuspendedAndHidesMessageWhenActive() {
        Tenant t = new Tenant();
        t.status = TenantStatus.ARCHIVED;
        t.statusMessage = "Account closed";
        t.configVersion = 9;
        Map<String, Object> body = Entitlements.resolve(starter(), t).agentState(t, starter());
        assertEquals("SUSPENDED", body.get("status"));
        assertEquals("Account closed", body.get("statusMessage"));
        assertEquals(9L, body.get("configVersion"));
        assertEquals("STARTER", body.get("planCode"));

        t.status = TenantStatus.ONBOARDING;
        body = Entitlements.resolve(starter(), t).agentState(t, starter());
        assertEquals("ACTIVE", body.get("status"));
        assertNull(body.get("statusMessage"));
    }

    @Test
    void codesAndUrlsAreValidated() {
        assertEquals("royal-tools", TenantService.normaliseCode(" Royal-Tools "));
        assertThrows(ResponseStatusException.class, () -> TenantService.normaliseCode("a"));
        assertThrows(ResponseStatusException.class, () -> TenantService.normaliseCode("bad_code"));
        assertThrows(ResponseStatusException.class, () -> TenantService.normaliseCode("-lead"));
        assertEquals("https://demo.billbull.app", TenantService.url("https://demo.billbull.app/", "appUrl"));
        assertThrows(ResponseStatusException.class, () -> TenantService.url("ftp://x.billbull.app", "appUrl"));
        assertThrows(ResponseStatusException.class, () -> TenantService.url("https://x.billbull.app/?a=1", "appUrl"));
        assertThrows(ResponseStatusException.class, () -> TenantService.url("https://user@x.billbull.app", "appUrl"));
        assertNull(TenantService.url(" ", "appUrl"));
    }

    @Test
    void optionalModulesMatchTheTenantBackend() {
        // Must equal com.billbull.backend.platform.PlatformModules.OPTIONAL's keys.
        assertEquals(java.util.List.of("pos", "purchases", "finance", "hr", "customer"), Modules.OPTIONAL);
    }
}
