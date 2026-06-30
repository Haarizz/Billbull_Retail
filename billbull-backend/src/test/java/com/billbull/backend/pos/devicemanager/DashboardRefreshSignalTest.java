package com.billbull.backend.pos.devicemanager;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

class DashboardRefreshSignalTest {

    @Test
    void startsAtVersionZeroWithNoChangeTimestamp() {
        DashboardRefreshSignal signal = new DashboardRefreshSignal();

        DashboardRefreshSignal.Snapshot snapshot = signal.snapshot();

        assertEquals(0, snapshot.version());
        assertNull(snapshot.lastChangedAt());
    }

    @Test
    void incrementsVersionOnEveryConfigurationChangedEvent() {
        DashboardRefreshSignal signal = new DashboardRefreshSignal();
        PosConfigurationChangedEvent event = new PosConfigurationChangedEvent("T1", 5L, 1L, 2, "hardwareProfileAssign");

        signal.onConfigurationChanged(event);
        assertEquals(1, signal.snapshot().version());
        assertNotNull(signal.snapshot().lastChangedAt());

        signal.onConfigurationChanged(event);
        assertEquals(2, signal.snapshot().version());
    }
}
