package com.billbull.backend.pos.devicemanager;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceRepository;
import com.billbull.backend.pos.device.PosDeviceRuntimeHealth;
import com.billbull.backend.pos.device.PosDeviceStatus;

@ExtendWith(MockitoExtension.class)
class PosDeviceHealthSweepJobTest {

    @Mock
    private PosDeviceRepository deviceRepo;

    @Mock
    private DeviceManager deviceManager;

    private PosDeviceHealthSweepJob sweepJob;

    @BeforeEach
    void setUp() {
        sweepJob = new PosDeviceHealthSweepJob(deviceRepo, deviceManager);
        ReflectionTestUtils.setField(sweepJob, "offlineThresholdMinutes", 5);
    }

    @Test
    void marksDeviceWithStaleHeartbeatOffline() {
        PosDevice device = new PosDevice();
        device.setId(1L);
        device.setRuntimeHealth(PosDeviceRuntimeHealth.ONLINE);
        device.setLastHeartbeat(LocalDateTime.now().minusMinutes(10));
        when(deviceRepo.findAllByStatus(PosDeviceStatus.ACTIVE)).thenReturn(List.of(device));

        sweepJob.sweepOffline();

        verify(deviceManager).updateRuntimeHealth(1L, PosDeviceRuntimeHealth.OFFLINE);
    }

    @Test
    void marksDeviceThatNeverHeartbeatOffline() {
        PosDevice device = new PosDevice();
        device.setId(2L);
        device.setRuntimeHealth(PosDeviceRuntimeHealth.UNKNOWN);
        device.setLastHeartbeat(null);
        when(deviceRepo.findAllByStatus(PosDeviceStatus.ACTIVE)).thenReturn(List.of(device));

        sweepJob.sweepOffline();

        verify(deviceManager).updateRuntimeHealth(2L, PosDeviceRuntimeHealth.OFFLINE);
    }

    @Test
    void leavesRecentHeartbeatAlone() {
        PosDevice device = new PosDevice();
        device.setId(3L);
        device.setRuntimeHealth(PosDeviceRuntimeHealth.ONLINE);
        device.setLastHeartbeat(LocalDateTime.now().minusMinutes(1));
        when(deviceRepo.findAllByStatus(PosDeviceStatus.ACTIVE)).thenReturn(List.of(device));

        sweepJob.sweepOffline();

        verify(deviceManager, never()).updateRuntimeHealth(any(), any());
    }

    @Test
    void skipsDeviceAlreadyOfflineToAvoidRedundantWrites() {
        PosDevice device = new PosDevice();
        device.setId(4L);
        device.setRuntimeHealth(PosDeviceRuntimeHealth.OFFLINE);
        device.setLastHeartbeat(LocalDateTime.now().minusMinutes(99));
        when(deviceRepo.findAllByStatus(PosDeviceStatus.ACTIVE)).thenReturn(List.of(device));

        sweepJob.sweepOffline();

        verify(deviceManager, never()).updateRuntimeHealth(any(), any());
    }
}
