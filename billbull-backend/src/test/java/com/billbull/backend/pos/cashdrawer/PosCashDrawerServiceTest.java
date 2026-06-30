package com.billbull.backend.pos.cashdrawer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

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
import com.billbull.backend.pos.devicemanager.PosDeviceEventLogService;
import com.billbull.backend.pos.devicemanager.PosDeviceEventType;
import com.billbull.backend.pos.printer.PosPrinter;
import com.billbull.backend.pos.printer.PosPrinterRepository;

@ExtendWith(MockitoExtension.class)
class PosCashDrawerServiceTest {

    @Mock
    private PosCashDrawerRepository repo;
    @Mock
    private PosPrinterRepository printerRepo;
    @Mock
    private DeviceManager deviceManager;
    @Mock
    private PosDeviceEventLogService eventLogService;

    private PosCashDrawerService service;

    @BeforeEach
    void setUp() {
        service = new PosCashDrawerService(repo, printerRepo, deviceManager, eventLogService);
    }

    @Test
    void createRejectsMissingAttachedPrinter() {
        PosCashDrawerService.UpsertRequest req = new PosCashDrawerService.UpsertRequest(
                "DRW-01", "Counter 1 Drawer", 5L, "Main Branch", "T001", "Counter 1",
                null, PosCashDrawerStatus.ACTIVE, null);

        assertThrows(ResponseStatusException.class, () -> service.create(req));
    }

    @Test
    void createRejectsUnknownAttachedPrinter() {
        PosCashDrawerService.UpsertRequest req = new PosCashDrawerService.UpsertRequest(
                "DRW-01", "Counter 1 Drawer", 5L, "Main Branch", "T001", "Counter 1",
                99L, PosCashDrawerStatus.ACTIVE, null);
        when(printerRepo.findByIdAndIsActiveTrue(99L)).thenReturn(Optional.empty());

        assertThrows(ResponseStatusException.class, () -> service.create(req));
    }

    @Test
    void createSyncsParentDeviceRecordAsCashDrawerType() {
        PosCashDrawerService.UpsertRequest req = new PosCashDrawerService.UpsertRequest(
                "DRW-01", "Counter 1 Drawer", 5L, "Main Branch", "T001", "Counter 1",
                3L, PosCashDrawerStatus.ACTIVE, null);
        when(printerRepo.findByIdAndIsActiveTrue(3L)).thenReturn(Optional.of(new PosPrinter()));
        when(repo.existsByDeviceCode("DRW-01")).thenReturn(false);
        PosDevice device = new PosDevice();
        device.setId(202L);
        when(deviceManager.syncDeviceRecord(eq(PosDeviceType.CASH_DRAWER), eq("DRW-01"), any(), eq(5L), any(),
                any(), any(), eq(PosDeviceStatus.ACTIVE))).thenReturn(device);
        when(repo.save(any(PosCashDrawer.class))).thenAnswer(inv -> inv.getArgument(0));

        PosCashDrawer saved = service.create(req);

        assertEquals(202L, saved.getDeviceId());
        assertEquals(3L, saved.getAttachedPrinterId());
    }

    @Test
    void recordKickResultUpdatesTimestampAndLogsDeviceEvent() {
        PosCashDrawer drawer = new PosCashDrawer();
        drawer.setId(1L);
        drawer.setDeviceId(202L);
        drawer.setBranchId(5L);
        drawer.setTerminalId("T001");
        when(repo.findByIdAndIsActiveTrue(1L)).thenReturn(Optional.of(drawer));
        when(repo.save(any(PosCashDrawer.class))).thenAnswer(inv -> inv.getArgument(0));

        PosCashDrawer result = service.recordKickResult(1L, true);

        assertEquals(PosCashDrawerKickResult.SUCCESS, result.getLastKickResult());
        verify(eventLogService).record(eq(202L), eq(PosDeviceEventType.DRAWER_KICK), any(), any(), any(), eq(5L), eq("T001"));
    }

    @Test
    void recordKickResultFailureIsLoggedAsFailed() {
        PosCashDrawer drawer = new PosCashDrawer();
        drawer.setId(1L);
        when(repo.findByIdAndIsActiveTrue(1L)).thenReturn(Optional.of(drawer));
        when(repo.save(any(PosCashDrawer.class))).thenAnswer(inv -> inv.getArgument(0));

        PosCashDrawer result = service.recordKickResult(1L, false);

        assertEquals(PosCashDrawerKickResult.FAILED, result.getLastKickResult());
    }
}
