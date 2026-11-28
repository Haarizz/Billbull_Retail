package com.billbull.platform.announcement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.platform.tenant.Tenant;
import com.billbull.platform.tenant.TenantRepository;
import com.billbull.platform.tenant.TenantStatus;
import com.fasterxml.jackson.databind.ObjectMapper;

class AnnouncementRulesTest {

    private static final Instant NOW = Instant.parse("2026-11-28T10:00:00Z");

    private static Announcement announcement(long id, boolean all, Set<Long> tenants) {
        Announcement a = new Announcement();
        a.id = id;
        a.title = "Title " + id;
        a.message = "Body";
        a.targetAll = all;
        a.tenantIds.addAll(tenants);
        a.publishedAt = NOW;
        return a;
    }

    private static AnnouncementSyncService syncService() {
        return new AnnouncementSyncService(null, null, null, null, null, new ObjectMapper(), 300_000);
    }

    @Test
    void payloadHoldsEveryClientAnnouncementsAndTheChosenOnesOnlyForTheirClients() {
        List<Announcement> live = List.of(announcement(2, true, Set.of()), announcement(1, false, Set.of(7L)));
        assertEquals(List.of(1L, 2L), AnnouncementSyncService.payloadFor(7, live).stream().map(m -> m.get("id")).toList());
        assertEquals(List.of(2L), AnnouncementSyncService.payloadFor(8, live).stream().map(m -> m.get("id")).toList());
    }

    @Test
    void hashIsStableAndChangesWithTheText() {
        AnnouncementSyncService s = syncService();
        Announcement a = announcement(1, true, Set.of());
        String h1 = s.hash(AnnouncementSyncService.payloadFor(1, List.of(a)));
        assertEquals(h1, s.hash(AnnouncementSyncService.payloadFor(1, List.of(a))));
        a.message = "Edited";
        assertNotEquals(h1, s.hash(AnnouncementSyncService.payloadFor(1, List.of(a))));
    }

    @Test
    void resendWhenNeverSentChangedFailedOrCountsStale() {
        AnnouncementSyncService s = syncService();
        assertTrue(s.due(null, "h", NOW));
        assertTrue(s.due(new AnnouncementSyncService.SyncRow("old", NOW, NOW, null), "h", NOW));
        assertTrue(s.due(new AnnouncementSyncService.SyncRow("h", NOW, NOW, "Unreachable"), "h", NOW));
        assertFalse(s.due(new AnnouncementSyncService.SyncRow("h", NOW.minusSeconds(60), NOW, null), "h", NOW));
        assertTrue(s.due(new AnnouncementSyncService.SyncRow("h", NOW.minus(Duration.ofMinutes(6)), NOW, null), "h", NOW));
    }

    @Test
    void endedOrArchivedAnnouncementsAreNotDeliverable() {
        Announcement a = announcement(1, true, Set.of());
        assertTrue(a.deliverable(NOW));
        a.endsAt = NOW.minusSeconds(1);
        assertFalse(a.deliverable(NOW));
        assertEquals("ENDED", AnnouncementController.phase(a, NOW));
        a.endsAt = null;
        a.startsAt = NOW.plusSeconds(60);
        assertTrue(a.deliverable(NOW), "scheduled ones are delivered early; the client holds them until the start");
        assertEquals("SCHEDULED", AnnouncementController.phase(a, NOW));
        a.status = Announcement.ARCHIVED;
        assertFalse(a.deliverable(NOW));
        assertEquals("ARCHIVED", AnnouncementController.phase(a, NOW));
    }

    private static AnnouncementController controller(TenantRepository tenants) {
        return new AnnouncementController(null, tenants, null, null, null, null);
    }

    private static AnnouncementController.AnnouncementInput input(String title, String kind, Boolean all,
                                                                  List<Long> ids, String ends) {
        return new AnnouncementController.AnnouncementInput(title, "Message", kind, null, all, ids, null, ends);
    }

    @Test
    void applyValidatesTextTypeTargetsAndWindow() {
        TenantRepository tenants = mock(TenantRepository.class);
        Tenant archived = new Tenant();
        archived.id = 3L;
        archived.name = "Old shop";
        archived.status = TenantStatus.ARCHIVED;
        when(tenants.findById(3L)).thenReturn(Optional.of(archived));
        when(tenants.findById(4L)).thenReturn(Optional.empty());
        AnnouncementController c = controller(tenants);
        Announcement a = new Announcement();

        assertThrows(ResponseStatusException.class, () -> c.apply(a, input(" ", null, true, null, null)));
        assertThrows(ResponseStatusException.class, () -> c.apply(a, input("t", "PARTY", true, null, null)));
        assertThrows(ResponseStatusException.class, () -> c.apply(a, input("t", null, false, List.of(), null)));
        assertThrows(ResponseStatusException.class, () -> c.apply(a, input("t", null, false, List.of(3L), null)));
        assertThrows(ResponseStatusException.class, () -> c.apply(a, input("t", null, false, List.of(4L), null)));
        assertThrows(ResponseStatusException.class,
                () -> c.apply(a, input("t", null, true, null, "2000-01-01T00:00:00Z")));

        c.apply(a, input("  Hello ", "maintenance", null, null, null));
        assertEquals("Hello", a.title);
        assertEquals("MAINTENANCE", a.kind);
        assertEquals("EVERYONE", a.audience);
        assertTrue(a.targetAll);
    }

    @Test
    void itemCarriesWhatTheTenantAgentReads() {
        Map<String, Object> m = AnnouncementSyncService.item(announcement(9, true, Set.of()));
        assertEquals(Set.of("id", "version", "title", "message", "kind", "audience", "startsAt", "endsAt", "publishedAt"),
                m.keySet());
    }
}
