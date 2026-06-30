package com.billbull.backend.pos.devicemanager;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceRepository;
import com.billbull.backend.pos.device.PosDeviceRuntimeHealth;

@ExtendWith(MockitoExtension.class)
class HealthServiceTest {

    @Mock
    private PosDeviceRepository deviceRepo;

    @Mock
    private PosDeviceHealthSnapshotRepository snapshotRepo;

    @Mock
    private DeviceManager deviceManager;

    private HealthService service;

    @BeforeEach
    void setUp() {
        service = new HealthService(deviceRepo, snapshotRepo, deviceManager);
    }

    @Test
    void recordSnapshotRejectsUnknownDevice() {
        when(deviceRepo.findById(99L)).thenReturn(Optional.empty());
        HealthService.SnapshotRequest req = new HealthService.SnapshotRequest(
                PosDeviceRuntimeHealth.ONLINE, null, null, null, null, false, 0);

        assertThrows(ResponseStatusException.class, () -> service.recordSnapshot(99L, req));
    }

    @Test
    void recordSnapshotRejectsMissingHealthState() {
        when(deviceRepo.findById(1L)).thenReturn(Optional.of(new PosDevice()));
        HealthService.SnapshotRequest req = new HealthService.SnapshotRequest(
                null, null, null, null, null, false, 0);

        assertThrows(ResponseStatusException.class, () -> service.recordSnapshot(1L, req));
    }

    @Test
    void recordSnapshotPersistsAndUpdatesDeviceHeartbeatAndRuntimeHealth() {
        PosDevice device = new PosDevice();
        device.setId(1L);
        when(deviceRepo.findById(1L)).thenReturn(Optional.of(device));
        when(snapshotRepo.save(any(PosDeviceHealthSnapshot.class))).thenAnswer(inv -> inv.getArgument(0));

        HealthService.SnapshotRequest req = new HealthService.SnapshotRequest(
                PosDeviceRuntimeHealth.PAPER_OUT, "OK", "1.2.3", "OUT", "CLOSED", true, 2);
        PosDeviceHealthSnapshot snapshot = service.recordSnapshot(1L, req);

        assertEquals(PosDeviceRuntimeHealth.PAPER_OUT, snapshot.getHealthState());
        assertEquals(2, snapshot.getQueueLength());
        verify(deviceRepo).save(device);
        verify(deviceManager).updateRuntimeHealth(1L, PosDeviceRuntimeHealth.PAPER_OUT);
    }

    @Test
    void getHistoryDelegatesToRepository() {
        when(snapshotRepo.findTop50ByDeviceIdOrderByCapturedAtDesc(eq(1L))).thenReturn(List.of(new PosDeviceHealthSnapshot()));

        List<PosDeviceHealthSnapshot> history = service.getHistory(1L);

        assertEquals(1, history.size());
    }
}
