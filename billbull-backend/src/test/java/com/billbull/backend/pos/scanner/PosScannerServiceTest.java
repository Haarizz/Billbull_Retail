package com.billbull.backend.pos.scanner;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceStatus;
import com.billbull.backend.pos.device.PosDeviceType;
import com.billbull.backend.pos.devicemanager.DeviceManager;

@ExtendWith(MockitoExtension.class)
class PosScannerServiceTest {

    @Mock
    private PosScannerRepository repo;

    @Mock
    private DeviceManager deviceManager;

    private PosScannerService service;

    @BeforeEach
    void setUp() {
        service = new PosScannerService(repo, deviceManager);
    }

    @Test
    void createRejectsMissingDeviceCode() {
        PosScannerService.UpsertRequest req = new PosScannerService.UpsertRequest(
                null, "Honeywell Scanner", 5L, "Main Branch", "T001", "Counter 1",
                PosScannerConnectionType.USB, PosScannerStatus.ACTIVE, null);

        assertThrows(ResponseStatusException.class, () -> service.create(req));
    }

    @Test
    void createSyncsParentDeviceRecordAsScannerType() {
        PosScannerService.UpsertRequest req = new PosScannerService.UpsertRequest(
                "SCN-01", "Honeywell Scanner", 5L, "Main Branch", "T001", "Counter 1",
                PosScannerConnectionType.USB, PosScannerStatus.ACTIVE, null);
        when(repo.existsByDeviceCode("SCN-01")).thenReturn(false);
        PosDevice device = new PosDevice();
        device.setId(101L);
        when(deviceManager.syncDeviceRecord(eq(PosDeviceType.SCANNER), eq("SCN-01"), eq("Honeywell Scanner"),
                eq(5L), any(), any(), any(), eq(PosDeviceStatus.ACTIVE))).thenReturn(device);
        when(repo.save(any(PosScanner.class))).thenAnswer(inv -> inv.getArgument(0));

        PosScanner saved = service.create(req);

        assertEquals(101L, saved.getDeviceId());
        assertEquals(PosScannerInputMode.KEYBOARD_WEDGE, saved.getInputMode());
    }
}
