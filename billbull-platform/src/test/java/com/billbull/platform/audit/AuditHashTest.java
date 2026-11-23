package com.billbull.platform.audit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import java.time.Instant;

import org.junit.jupiter.api.Test;

class AuditHashTest {

    private static AuditEvent event(String detail, String prev) {
        AuditEvent e = new AuditEvent();
        e.occurredAt = Instant.parse("2026-11-22T10:00:00.123456Z");
        e.actorId = 1L;
        e.actorEmail = "ops@billbull.app";
        e.action = "TENANT_STATUS_CHANGED";
        e.targetType = "Tenant";
        e.targetId = "7";
        e.tenantId = 7L;
        e.detail = detail;
        e.ip = "10.0.0.1";
        e.prevHash = prev;
        return e;
    }

    @Test
    void hashIsStableAndCoversContentAndChain() {
        String h = AuditService.hash(event("ACTIVE → SUSPENDED", null));
        assertEquals(64, h.length());
        assertEquals(h, AuditService.hash(event("ACTIVE → SUSPENDED", null)));
        assertNotEquals(h, AuditService.hash(event("ACTIVE → READ_ONLY", null)), "editing the detail breaks it");
        assertNotEquals(h, AuditService.hash(event("ACTIVE → SUSPENDED", "00")), "re-linking breaks it");
    }
}
