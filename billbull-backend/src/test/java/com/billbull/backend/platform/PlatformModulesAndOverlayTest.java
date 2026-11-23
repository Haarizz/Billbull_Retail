package com.billbull.backend.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

class PlatformModulesAndOverlayTest {

    @Test
    void pathsMapToModulesOnSegmentBoundaries() {
        assertEquals(Optional.of("pos"), PlatformModules.moduleForPath("/api/pos"));
        assertEquals(Optional.of("pos"), PlatformModules.moduleForPath("/api/pos/checkout"));
        assertEquals(Optional.empty(), PlatformModules.moduleForPath("/api/possible"));
        assertEquals(Optional.of("finance"), PlatformModules.moduleForPath("/api/ledger/accounts/opening-balance"));
        assertEquals(Optional.of("purchases"), PlatformModules.moduleForPath("/api/purchase/returns"));
        assertEquals(Optional.empty(), PlatformModules.moduleForPath("/api/purchases-anything"));
        assertEquals(Optional.empty(), PlatformModules.moduleForPath("/api/sales/invoices"));
        assertEquals(Optional.empty(), PlatformModules.moduleForPath("/api/products"));
    }

    @Test
    void permissionKeysMapToOwningModule() {
        assertEquals(Optional.of("pos"), PlatformModules.owningOptionalModule("sales.pos"));
        assertEquals(Optional.of("pos"), PlatformModules.owningOptionalModule("pos.terminals"));
        assertEquals(Optional.of("pos"), PlatformModules.owningOptionalModule("permissions.pos.terminal.block"));
        assertEquals(Optional.of("finance"), PlatformModules.owningOptionalModule("finance.ledger"));
        assertEquals(Optional.empty(), PlatformModules.owningOptionalModule("sales.invoice"));
        assertEquals(Optional.empty(), PlatformModules.owningOptionalModule("inventory"));
    }

    @Test
    void overlayDeniesDisabledModulesAndAddsEntitlements() {
        Map<String, Object> merged = new HashMap<>();
        merged.put("pos", grant());
        merged.put("pos.terminals", grant());
        merged.put("sales", grant());
        merged.put("sales.invoice", grant());
        merged.put("finance", grant());
        PlatformState state = new PlatformState(true, TenantLifecycleStatus.ACTIVE, null, "STARTER",
                Map.of("pos", false, "hr", false), Map.of(), 2L, null, null);

        PlatformEntitlementOverlay.apply(merged, state);

        assertFalse(view(merged, "pos"));
        assertFalse(view(merged, "pos.terminals"));
        assertFalse(view(merged, "sales.pos"), "the till key is added as an explicit deny");
        assertFalse(view(merged, "hr"));
        assertTrue(view(merged, "sales"));
        assertTrue(view(merged, "sales.invoice"));
        assertTrue(view(merged, "finance"));
        @SuppressWarnings("unchecked")
        Map<String, Object> ent = (Map<String, Object>) merged.get("_entitlements");
        assertEquals("STARTER", ent.get("planCode"));
    }

    @Test
    void overlayLeavesUnmanagedTenantsUntouched() {
        Map<String, Object> merged = new HashMap<>(Map.of("pos", grant()));
        PlatformEntitlementOverlay.apply(merged, PlatformState.unmanaged());
        assertTrue(view(merged, "pos"));
        assertFalse(merged.containsKey("_entitlements"));
    }

    @Test
    void tenantIdentityPrefersPropertyThenClientProfile() {
        assertEquals("acme", TenantIdentity.resolve(" ACME ", new String[] {"demo"}));
        assertEquals("demo", TenantIdentity.resolve("", new String[] {"prod", "demo"}));
        assertEquals("local", TenantIdentity.resolve(null, new String[] {}));
        assertEquals("local", TenantIdentity.resolve(null, new String[] {"prod"}));
    }

    private static Map<String, Object> grant() {
        Map<String, Object> p = new HashMap<>();
        for (String a : new String[] {"view", "create", "edit", "delete", "approve", "export"}) p.put(a, true);
        return p;
    }

    @SuppressWarnings("unchecked")
    private static boolean view(Map<String, Object> merged, String key) {
        return Boolean.TRUE.equals(((Map<String, Object>) merged.get(key)).get("view"));
    }
}
