package com.billbull.backend.platform;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class PlatformStateServiceTest {

    /** Repository double that stores what it is given. */
    private static PlatformStateService service(AtomicReference<PlatformState> store) {
        PlatformStateRepository repo = mock(PlatformStateRepository.class);
        when(repo.load()).thenAnswer(i -> Optional.ofNullable(store.get()));
        doAnswer(i -> { store.set(i.getArgument(0)); return null; }).when(repo).save(any());
        return new PlatformStateService(repo);
    }

    @Test
    void noRowMeansUnmanagedAndEverythingEnabled() {
        PlatformState s = service(new AtomicReference<>()).current();
        assertFalse(s.managed());
        assertEquals(TenantLifecycleStatus.ACTIVE, s.status());
        assertTrue(s.isModuleEnabled("pos"));
        assertEquals(null, s.limit(PlatformState.LIMIT_USERS));
    }

    @Test
    void appliesStatusModulesAndLimits() {
        AtomicReference<PlatformState> store = new AtomicReference<>();
        PlatformStateService svc = service(store);
        PlatformState s = svc.apply(new PlatformStateUpdate("read_only", "Overdue", "STARTER",
                Map.of("POS", false), Map.of("maxUsers", 5, "maxBranches", 0), 7L), "ops@billbull.app");
        assertTrue(s.managed());
        assertEquals(TenantLifecycleStatus.READ_ONLY, s.status());
        assertFalse(s.isModuleEnabled("pos"));
        assertTrue(s.isModuleEnabled("finance"));
        assertEquals(5, s.limit(PlatformState.LIMIT_USERS));
        assertEquals(null, s.limit(PlatformState.LIMIT_BRANCHES), "0 means unlimited");
        assertEquals(7L, s.configVersion());
        assertEquals("ops@billbull.app", store.get().updatedBy());
    }

    @Test
    void refusesCoreModulesUnknownLimitsAndUnknownStatus() {
        PlatformStateService svc = service(new AtomicReference<>());
        assertThrows(ResponseStatusException.class, () -> svc.apply(
                new PlatformStateUpdate("ACTIVE", null, null, Map.of("sales", false), null, 1L), "x"));
        assertThrows(ResponseStatusException.class, () -> svc.apply(
                new PlatformStateUpdate("ACTIVE", null, null, null, Map.of("maxCats", 3), 1L), "x"));
        assertThrows(ResponseStatusException.class, () -> svc.apply(
                new PlatformStateUpdate("DELETED", null, null, null, null, 1L), "x"));
    }

    @Test
    void limitCheckThrows409AtTheLimit() {
        AtomicReference<PlatformState> store = new AtomicReference<>();
        PlatformStateService svc = service(store);
        svc.apply(new PlatformStateUpdate("ACTIVE", null, null, null, Map.of("maxUsers", 3), 1L), "x");
        assertDoesNotThrow(() -> svc.assertWithinLimit(PlatformState.LIMIT_USERS, 2, "active users"));
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> svc.assertWithinLimit(PlatformState.LIMIT_USERS, 3, "active users"));
        assertEquals(409, e.getStatusCode().value());
    }

    @Test
    void unreadableStateFailsOpen() {
        PlatformStateRepository repo = mock(PlatformStateRepository.class);
        when(repo.load()).thenThrow(new IllegalStateException("relation does not exist"));
        PlatformState s = new PlatformStateService(repo).current();
        assertFalse(s.managed());
        assertEquals(TenantLifecycleStatus.ACTIVE, s.status());
    }
}
