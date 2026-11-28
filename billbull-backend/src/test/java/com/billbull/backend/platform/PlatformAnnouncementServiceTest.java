package com.billbull.backend.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

class PlatformAnnouncementServiceTest {

    private static PlatformAnnouncementService.Item item(Long id, String title, String message, String kind,
                                                         String audience, String startsAt) {
        return new PlatformAnnouncementService.Item(id, 2, title, message, kind, audience, startsAt, null, null);
    }

    @Test
    void validateNormalisesKindAndAudienceAndTrims() {
        var v = PlatformAnnouncementService.validate(item(5L, "  Hi ", " body ", "feature", "admins", null));
        assertEquals("Hi", v.title());
        assertEquals("body", v.message());
        assertEquals("FEATURE", v.kind());
        assertEquals("ADMINS", v.audience());
        assertEquals(2, v.version());
    }

    @Test
    void unknownKindFromANewerControlPlaneFallsBackToInfo() {
        assertEquals("INFO", PlatformAnnouncementService.validate(item(5L, "t", "m", "PARTY", null, null)).kind());
    }

    @Test
    void validateRejectsMissingIdTextBadAudienceAndBadTimestamps() {
        assertThrows(ResponseStatusException.class,
                () -> PlatformAnnouncementService.validate(item(null, "t", "m", null, null, null)));
        assertThrows(ResponseStatusException.class,
                () -> PlatformAnnouncementService.validate(item(1L, " ", "m", null, null, null)));
        assertThrows(ResponseStatusException.class,
                () -> PlatformAnnouncementService.validate(item(1L, "t", "m", null, "CASHIERS", null)));
        assertThrows(ResponseStatusException.class,
                () -> PlatformAnnouncementService.validate(item(1L, "t", "m", null, null, "tomorrow")));
    }

    @Test
    void longTextIsClipped() {
        var v = PlatformAnnouncementService.validate(item(1L, "x".repeat(400), "y".repeat(9000), null, null, null));
        assertEquals(150, v.title().length());
        assertEquals(4000, v.message().length());
    }

    @Test
    void replaceRefusesDuplicateIds() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var service = new PlatformAnnouncementService(jdbc, props());
        var push = new PlatformAnnouncementService.Push(List.of(
                item(1L, "a", "b", null, null, null), item(1L, "c", "d", null, null, null)));
        assertThrows(ResponseStatusException.class, () -> service.replace(push));
    }

    @Test
    void supportUserNeverSeesOrCountsAnnouncements() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var service = new PlatformAnnouncementService(jdbc, props());
        assertTrue(service.pendingFor("platform.support", true).isEmpty());
        assertEquals(false, service.markSeen(3, "PLATFORM.SUPPORT"));
        verifyNoInteractions(jdbc);
    }

    private static PlatformAgentProperties props() {
        PlatformAgentProperties p = mock(PlatformAgentProperties.class);
        when(p.getSupportUsername()).thenReturn("platform.support");
        return p;
    }
}
