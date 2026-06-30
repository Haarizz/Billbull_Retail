package com.billbull.backend.pos.devicemanager;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceStatus;
import com.billbull.backend.pos.device.PosDeviceType;
import com.billbull.backend.pos.printer.PosPrinter;
import com.billbull.backend.pos.printer.PosPrinterRepository;
import com.billbull.backend.pos.printer.PosPrinterStatus;

@ExtendWith(MockitoExtension.class)
class PosPrinterDeviceBackfillSeederTest {

    @Mock
    private PosPrinterRepository printerRepo;

    @Mock
    private DeviceManager deviceManager;

    private PosPrinterDeviceBackfillSeeder seeder;

    @BeforeEach
    void setUp() {
        seeder = new PosPrinterDeviceBackfillSeeder(printerRepo, deviceManager);
    }

    @Test
    void noOrphanedPrintersDoesNothing() {
        when(printerRepo.findByDeviceIdIsNull()).thenReturn(List.of());

        seeder.backfill();

        verify(deviceManager, never()).syncDeviceRecord(any(), any(), any(), any(), any(), any(), any(), any());
        verify(printerRepo, never()).save(any());
    }

    @Test
    void linksOrphanedPrinterToNewDeviceRecord() {
        PosPrinter printer = printer(1L, "PR-01", PosPrinterStatus.ACTIVE);
        when(printerRepo.findByDeviceIdIsNull()).thenReturn(List.of(printer));
        PosDevice device = new PosDevice();
        device.setId(55L);
        when(deviceManager.syncDeviceRecord(eq(PosDeviceType.PRINTER), eq("PR-01"), any(), eq(5L), any(), any(),
                any(), eq(PosDeviceStatus.ACTIVE))).thenReturn(device);

        seeder.backfill();

        assertEquals(55L, printer.getDeviceId());
        verify(printerRepo).save(printer);
    }

    @Test
    void skipsPrinterWithBlankDeviceCodeWithoutCallingDeviceManager() {
        PosPrinter printer = printer(2L, "  ", PosPrinterStatus.ACTIVE);
        when(printerRepo.findByDeviceIdIsNull()).thenReturn(List.of(printer));

        seeder.backfill();

        verify(deviceManager, never()).syncDeviceRecord(any(), any(), any(), any(), any(), any(), any(), any());
        verify(printerRepo, never()).save(any());
        assertNull(printer.getDeviceId());
    }

    @Test
    void continuesProcessingRemainingPrintersAfterOneFails() {
        PosPrinter failing = printer(3L, "PR-FAIL", PosPrinterStatus.ACTIVE);
        PosPrinter healthy = printer(4L, "PR-OK", PosPrinterStatus.ACTIVE);
        when(printerRepo.findByDeviceIdIsNull()).thenReturn(List.of(failing, healthy));
        when(deviceManager.syncDeviceRecord(eq(PosDeviceType.PRINTER), eq("PR-FAIL"), any(), any(), any(), any(),
                any(), any())).thenThrow(new RuntimeException("boom"));
        PosDevice device = new PosDevice();
        device.setId(77L);
        when(deviceManager.syncDeviceRecord(eq(PosDeviceType.PRINTER), eq("PR-OK"), any(), any(), any(), any(),
                any(), any())).thenReturn(device);

        seeder.backfill();

        assertNull(failing.getDeviceId());
        assertEquals(77L, healthy.getDeviceId());
        verify(printerRepo, times(1)).save(healthy);
        verify(printerRepo, never()).save(failing);
    }

    private PosPrinter printer(Long id, String deviceCode, PosPrinterStatus status) {
        PosPrinter printer = new PosPrinter();
        printer.setId(id);
        printer.setDeviceCode(deviceCode);
        printer.setDeviceName("Printer " + id);
        printer.setBranchId(5L);
        printer.setBranchName("Main Branch");
        printer.setTerminalId("T001");
        printer.setCounterName("Counter 1");
        printer.setStatus(status);
        return printer;
    }
}
