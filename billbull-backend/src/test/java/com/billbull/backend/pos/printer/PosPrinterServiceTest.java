package com.billbull.backend.pos.printer;

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
class PosPrinterServiceTest {

    @Mock
    private PosPrinterRepository repo;

    @Mock
    private DeviceManager deviceManager;

    private PosPrinterService service;

    @BeforeEach
    void setUp() {
        service = new PosPrinterService(repo, deviceManager);
    }

    @Test
    void createSyncsParentDeviceRecordAndLinksDeviceId() {
        PosPrinterService.UpsertRequest req = upsertRequest();
        when(repo.existsByDeviceCode("PR-01")).thenReturn(false);
        PosDevice device = new PosDevice();
        device.setId(101L);
        when(deviceManager.syncDeviceRecord(eq(PosDeviceType.PRINTER), eq("PR-01"), eq("Counter 1 Printer"),
                eq(5L), any(), any(), any(), eq(PosDeviceStatus.ACTIVE))).thenReturn(device);
        when(repo.save(any(PosPrinter.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PosPrinter saved = service.create(req);

        assertEquals(101L, saved.getDeviceId());
        verify(deviceManager).syncDeviceRecord(eq(PosDeviceType.PRINTER), eq("PR-01"), eq("Counter 1 Printer"),
                eq(5L), any(), any(), any(), eq(PosDeviceStatus.ACTIVE));
    }

    @Test
    void createRejectsMissingDeviceCode() {
        PosPrinterService.UpsertRequest req = new PosPrinterService.UpsertRequest(
                null, PosPrinterType.RECEIPT_PRINTER, "Counter 1 Printer", null, 5L, "Main Branch",
                null, null, null, PosPrinterConnectionType.WINDOWS_QUEUE, "EPSON-TM", null, null, null,
                "80mm", "receipt", true, PosPrinterStatus.ACTIVE, null);

        assertThrows(ResponseStatusException.class, () -> service.create(req));
    }

    private PosPrinterService.UpsertRequest upsertRequest() {
        return new PosPrinterService.UpsertRequest(
                "PR-01", PosPrinterType.RECEIPT_PRINTER, "Counter 1 Printer", null, 5L, "Main Branch",
                "T001", "Till 1", "Counter 1", PosPrinterConnectionType.WINDOWS_QUEUE, "EPSON-TM", null, null, null,
                "80mm", "receipt", true, PosPrinterStatus.ACTIVE, null);
    }
}
