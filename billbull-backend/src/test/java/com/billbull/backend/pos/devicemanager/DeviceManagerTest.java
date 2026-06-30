package com.billbull.backend.pos.devicemanager;

import static org.junit.jupiter.api.Assertions.assertEquals;
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

import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceRepository;
import com.billbull.backend.pos.device.PosDeviceRuntimeHealth;
import com.billbull.backend.pos.device.PosDeviceStatus;
import com.billbull.backend.pos.device.PosDeviceType;

@ExtendWith(MockitoExtension.class)
class DeviceManagerTest {

    @Mock
    private PosDeviceRepository deviceRepo;

    @Mock
    private PosDeviceEventLogService eventLogService;

    private DeviceManager deviceManager;

    @BeforeEach
    void setUp() {
        deviceManager = new DeviceManager(deviceRepo, eventLogService);
    }

    @Test
    void syncDeviceRecordCreatesNewDeviceAndLogsRegistration() {
        when(deviceRepo.findByDeviceCode("PR-01")).thenReturn(Optional.empty());
        when(deviceRepo.save(any(PosDevice.class))).thenAnswer(invocation -> {
            PosDevice d = invocation.getArgument(0);
            d.setId(99L);
            return d;
        });

        PosDevice device = deviceManager.syncDeviceRecord(PosDeviceType.PRINTER, "PR-01", "Counter 1 Printer",
                5L, "Main Branch", "T001", "Counter 1", PosDeviceStatus.ACTIVE);

        assertEquals(99L, device.getId());
        assertEquals(PosDeviceType.PRINTER, device.getDeviceType());
        assertEquals("PR-01", device.getDeviceCode());
        verify(eventLogService).record(eq(99L), eq(PosDeviceEventType.DEVICE_REGISTERED),
                eq(PosDeviceEventResult.SUCCESS), any(), any(), eq(5L), eq("T001"));
    }

    @Test
    void syncDeviceRecordUpdatesExistingDeviceAndLogsConfigChange() {
        PosDevice existing = new PosDevice();
        existing.setId(42L);
        existing.setDeviceCode("PR-01");
        when(deviceRepo.findByDeviceCode("PR-01")).thenReturn(Optional.of(existing));
        when(deviceRepo.save(any(PosDevice.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PosDevice device = deviceManager.syncDeviceRecord(PosDeviceType.PRINTER, "PR-01", "Renamed Printer",
                5L, "Main Branch", "T001", "Counter 1", PosDeviceStatus.ACTIVE);

        assertEquals(42L, device.getId());
        assertEquals("Renamed Printer", device.getDeviceName());
        verify(eventLogService).record(eq(42L), eq(PosDeviceEventType.CONFIGURATION_UPDATED),
                eq(PosDeviceEventResult.SUCCESS), any(), any(), eq(5L), eq("T001"));
    }

    @Test
    void updateRuntimeHealthLogsOnlyWhenHealthChanges() {
        PosDevice existing = new PosDevice();
        existing.setId(42L);
        existing.setRuntimeHealth(PosDeviceRuntimeHealth.ONLINE);
        when(deviceRepo.findById(42L)).thenReturn(Optional.of(existing));
        when(deviceRepo.save(any(PosDevice.class))).thenAnswer(invocation -> invocation.getArgument(0));

        deviceManager.updateRuntimeHealth(42L, PosDeviceRuntimeHealth.ONLINE);
        verify(eventLogService, org.mockito.Mockito.never()).record(any(), eq(PosDeviceEventType.HEALTH_CHANGED),
                any(), any(), any(), any(), any());

        deviceManager.updateRuntimeHealth(42L, PosDeviceRuntimeHealth.OFFLINE);
        verify(eventLogService).record(eq(42L), eq(PosDeviceEventType.HEALTH_CHANGED), any(), any(), any(), any(), any());
    }

    @Test
    void getDashboardReturnsOnlyDevicesForRequestedBranch() {
        PosDevice inBranch = new PosDevice();
        inBranch.setBranchId(5L);
        PosDevice otherBranch = new PosDevice();
        otherBranch.setBranchId(9L);
        when(deviceRepo.findAll()).thenReturn(List.of(inBranch, otherBranch));

        List<PosDevice> result = deviceManager.getDashboard(5L);

        assertEquals(1, result.size());
        assertEquals(5L, result.get(0).getBranchId());
    }

    @Test
    void getDashboardReturnsEmptyWhenBranchIdMissing() {
        assertEquals(List.of(), deviceManager.getDashboard(null));
    }
}
