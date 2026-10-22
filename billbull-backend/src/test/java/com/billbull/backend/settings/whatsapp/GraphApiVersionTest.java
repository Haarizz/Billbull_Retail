package com.billbull.backend.settings.whatsapp;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

/** W1: which Graph API versions may be saved, and when the settings page warns. */
class GraphApiVersionTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 14);

    @Test
    void blankBecomesTheNewDefault() {
        assertEquals("v25.0", GraphApiVersion.requireUsable(null, TODAY));
        assertEquals("v25.0", GraphApiVersion.requireUsable("  ", TODAY));
        assertEquals("v25.0", GraphApiVersion.DEFAULT);
    }

    @Test
    void supportedVersionsChosenOnPurposeAreKept() {
        for (String v : new String[] {"v21.0", "v22.0", "v23.0", "v24.0", "v25.0", "v26.0", " v24.0 "}) {
            assertEquals(v.trim(), GraphApiVersion.requireUsable(v, TODAY), v);
        }
        // Newer than anything Meta had published on the check date: allowed, expiry unknown.
        assertEquals("v27.0", GraphApiVersion.requireUsable("v27.0", TODAY));
    }

    @Test
    void malformedVersionsAreRefused() {
        for (String v : new String[] {"21.0", "v21", "v21.1", "V21.0", "v2.12", "v021.0", "latest", "v25.0/", "v25.0?x=1", "../v25.0"}) {
            IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                    () -> GraphApiVersion.requireUsable(v, TODAY), v);
            assertTrue(e.getMessage().contains("v25.0"), e.getMessage());
        }
    }

    @Test
    void expiredVersionsAreRefused() {
        assertThrows(IllegalArgumentException.class, () -> GraphApiVersion.requireUsable("v20.0", TODAY));
        assertThrows(IllegalArgumentException.class, () -> GraphApiVersion.requireUsable("v19.0", TODAY));
        assertThrows(IllegalArgumentException.class,
                () -> GraphApiVersion.requireUsable("v21.0", LocalDate.of(2027, 1, 22)), "the day after v21.0 expires");
        assertEquals("v21.0", GraphApiVersion.requireUsable("v21.0", LocalDate.of(2027, 1, 21)), "its last day still works");
    }

    @Test
    void theStatusWarnsWithinNinetyDaysAndAfterExpiry() {
        GraphApiVersion.Status safe = GraphApiVersion.status("v25.0", TODAY);
        assertEquals(LocalDate.of(2028, 7, 29), safe.expiresOn());
        assertNull(safe.warning());

        GraphApiVersion.Status soon = GraphApiVersion.status("v21.0", LocalDate.of(2026, 11, 1));
        assertFalse(soon.expired());
        assertTrue(soon.warning().contains("2027-01-21"), soon.warning());

        GraphApiVersion.Status gone = GraphApiVersion.status("v20.0", TODAY);
        assertTrue(gone.expired());
        assertTrue(gone.warning().contains("expired"), gone.warning());

        assertNull(GraphApiVersion.status("v26.0", TODAY).expiresOn(), "Meta has not published v26.0's date");
        assertNotNull(GraphApiVersion.status("not-a-version", TODAY).warning());
    }
}
