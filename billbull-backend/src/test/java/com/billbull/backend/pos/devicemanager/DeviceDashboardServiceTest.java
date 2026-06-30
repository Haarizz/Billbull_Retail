package com.billbull.backend.pos.devicemanager;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.pos.cashdrawer.PosCashDrawer;
import com.billbull.backend.pos.cashdrawer.PosCashDrawerKickResult;
import com.billbull.backend.pos.cashdrawer.PosCashDrawerRepository;
import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceRuntimeHealth;
import com.billbull.backend.pos.printjob.PosPrintJob;
import com.billbull.backend.pos.printjob.PosPrintJobRepository;
import com.billbull.backend.pos.printjob.PrintJobStatus;

@ExtendWith(MockitoExtension.class)
class DeviceDashboardServiceTest {

    @Mock
    private DeviceManager deviceManager;
    @Mock
    private HardwareProfileService hardwareProfileService;
    @Mock
    private DiscoveryService discoveryService;
    @Mock
    private PosPrintJobRepository printJobRepo;
    @Mock
    private PosDeviceEventLogRepository eventLogRepo;
    @Mock
    private PosCashDrawerRepository cashDrawerRepo;
    @Mock
    private DashboardRefreshSignal refreshSignal;

    private DeviceDashboardService service;

    @BeforeEach
    void setUp() {
        service = new DeviceDashboardService(deviceManager, hardwareProfileService, discoveryService,
                printJobRepo, eventLogRepo, cashDrawerRepo, refreshSignal);
    }

    @Test
    void returnsEmptyOverviewWhenBranchIdMissing() {
        when(refreshSignal.snapshot()).thenReturn(new DashboardRefreshSignal.Snapshot(0, null));

        DeviceDashboardService.Overview overview = service.getOverview(null);

        assertEquals(0, overview.devices().size());
        assertEquals(0, overview.metrics().devicesOnline());
    }

    @Test
    void computesOnlineOfflineAndWarningCounts() {
        when(deviceManager.getDashboard(5L)).thenReturn(List.of(
                device(PosDeviceRuntimeHealth.ONLINE),
                device(PosDeviceRuntimeHealth.BUSY),
                device(PosDeviceRuntimeHealth.OFFLINE),
                device(PosDeviceRuntimeHealth.DISCONNECTED),
                device(PosDeviceRuntimeHealth.PAPER_OUT),
                device(PosDeviceRuntimeHealth.UNKNOWN)
        ));
        when(hardwareProfileService.listForBranch(5L)).thenReturn(List.of());
        when(discoveryService.listAwaitingRegistration()).thenReturn(List.of());
        when(printJobRepo.findByBranchIdAndStatusIn(eq5(), any())).thenReturn(List.of());
        when(printJobRepo.findByBranchIdAndStatus(5L, PrintJobStatus.SUCCEEDED)).thenReturn(List.of());
        when(eventLogRepo.findTop20ByBranchIdOrderByCreatedAtDesc(5L)).thenReturn(List.of());
        when(cashDrawerRepo.findByBranchIdAndIsActiveTrueOrderByDeviceNameAsc(5L)).thenReturn(List.of());
        when(refreshSignal.snapshot()).thenReturn(new DashboardRefreshSignal.Snapshot(3, LocalDateTime.now()));

        DeviceDashboardService.Overview overview = service.getOverview(5L);

        assertEquals(2, overview.metrics().devicesOnline());   // ONLINE + BUSY
        assertEquals(2, overview.metrics().devicesOffline());  // OFFLINE + DISCONNECTED
        assertEquals(1, overview.metrics().healthWarnings());  // PAPER_OUT
        assertEquals(3, overview.refreshSignal().version());
    }

    @Test
    void queueLengthCountsOnlyQueuedNotDispatched() {
        when(deviceManager.getDashboard(5L)).thenReturn(List.of());
        when(hardwareProfileService.listForBranch(5L)).thenReturn(List.of());
        when(discoveryService.listAwaitingRegistration()).thenReturn(List.of());
        PosPrintJob queued = printJob(PrintJobStatus.QUEUED, null, null);
        PosPrintJob dispatched = printJob(PrintJobStatus.DISPATCHED, LocalDateTime.now(), null);
        when(printJobRepo.findByBranchIdAndStatusIn(eq5(), any())).thenReturn(List.of(queued, dispatched));
        when(printJobRepo.findByBranchIdAndStatus(5L, PrintJobStatus.SUCCEEDED)).thenReturn(List.of());
        when(eventLogRepo.findTop20ByBranchIdOrderByCreatedAtDesc(5L)).thenReturn(List.of());
        when(cashDrawerRepo.findByBranchIdAndIsActiveTrueOrderByDeviceNameAsc(5L)).thenReturn(List.of());
        when(refreshSignal.snapshot()).thenReturn(new DashboardRefreshSignal.Snapshot(0, null));

        DeviceDashboardService.Overview overview = service.getOverview(5L);

        assertEquals(2, overview.metrics().pendingPrintJobs());  // QUEUED + DISPATCHED
        assertEquals(1, overview.metrics().totalQueueLength());  // QUEUED only
    }

    @Test
    void averagePrintDurationComputedFromDispatchToCompletion() {
        when(deviceManager.getDashboard(5L)).thenReturn(List.of());
        when(hardwareProfileService.listForBranch(5L)).thenReturn(List.of());
        when(discoveryService.listAwaitingRegistration()).thenReturn(List.of());
        when(printJobRepo.findByBranchIdAndStatusIn(eq5(), any())).thenReturn(List.of());
        LocalDateTime start = LocalDateTime.now();
        PosPrintJob job1 = printJob(PrintJobStatus.SUCCEEDED, start, start.plusSeconds(10));
        PosPrintJob job2 = printJob(PrintJobStatus.SUCCEEDED, start, start.plusSeconds(20));
        when(printJobRepo.findByBranchIdAndStatus(5L, PrintJobStatus.SUCCEEDED)).thenReturn(List.of(job1, job2));
        when(eventLogRepo.findTop20ByBranchIdOrderByCreatedAtDesc(5L)).thenReturn(List.of());
        when(cashDrawerRepo.findByBranchIdAndIsActiveTrueOrderByDeviceNameAsc(5L)).thenReturn(List.of());
        when(refreshSignal.snapshot()).thenReturn(new DashboardRefreshSignal.Snapshot(0, null));

        DeviceDashboardService.Overview overview = service.getOverview(5L);

        assertEquals(15.0, overview.metrics().averagePrintDurationSeconds());
    }

    @Test
    void averagePrintDurationIsNullWhenNoCompletedJobs() {
        when(deviceManager.getDashboard(5L)).thenReturn(List.of());
        when(hardwareProfileService.listForBranch(5L)).thenReturn(List.of());
        when(discoveryService.listAwaitingRegistration()).thenReturn(List.of());
        when(printJobRepo.findByBranchIdAndStatusIn(eq5(), any())).thenReturn(List.of());
        when(printJobRepo.findByBranchIdAndStatus(5L, PrintJobStatus.SUCCEEDED)).thenReturn(List.of());
        when(eventLogRepo.findTop20ByBranchIdOrderByCreatedAtDesc(5L)).thenReturn(List.of());
        when(cashDrawerRepo.findByBranchIdAndIsActiveTrueOrderByDeviceNameAsc(5L)).thenReturn(List.of());
        when(refreshSignal.snapshot()).thenReturn(new DashboardRefreshSignal.Snapshot(0, null));

        DeviceDashboardService.Overview overview = service.getOverview(5L);

        assertNull(overview.metrics().averagePrintDurationSeconds());
    }

    @Test
    void countsDrawerFailures() {
        when(deviceManager.getDashboard(5L)).thenReturn(List.of());
        when(hardwareProfileService.listForBranch(5L)).thenReturn(List.of());
        when(discoveryService.listAwaitingRegistration()).thenReturn(List.of());
        when(printJobRepo.findByBranchIdAndStatusIn(eq5(), any())).thenReturn(List.of());
        when(printJobRepo.findByBranchIdAndStatus(5L, PrintJobStatus.SUCCEEDED)).thenReturn(List.of());
        when(eventLogRepo.findTop20ByBranchIdOrderByCreatedAtDesc(5L)).thenReturn(List.of());
        when(cashDrawerRepo.findByBranchIdAndIsActiveTrueOrderByDeviceNameAsc(5L)).thenReturn(List.of(
                drawer(PosCashDrawerKickResult.FAILED), drawer(PosCashDrawerKickResult.SUCCESS), drawer(PosCashDrawerKickResult.FAILED)
        ));
        when(refreshSignal.snapshot()).thenReturn(new DashboardRefreshSignal.Snapshot(0, null));

        DeviceDashboardService.Overview overview = service.getOverview(5L);

        assertEquals(2, overview.metrics().drawerFailures());
    }

    private Long eq5() {
        return org.mockito.ArgumentMatchers.eq(5L);
    }

    private static <T> T any() {
        return org.mockito.ArgumentMatchers.any();
    }

    private PosDevice device(PosDeviceRuntimeHealth health) {
        PosDevice d = new PosDevice();
        d.setRuntimeHealth(health);
        return d;
    }

    private PosPrintJob printJob(PrintJobStatus status, LocalDateTime dispatchedAt, LocalDateTime completedAt) {
        PosPrintJob job = new PosPrintJob();
        job.setStatus(status);
        job.setDispatchedAt(dispatchedAt);
        job.setCompletedAt(completedAt);
        return job;
    }

    private PosCashDrawer drawer(PosCashDrawerKickResult result) {
        PosCashDrawer d = new PosCashDrawer();
        d.setLastKickResult(result);
        return d;
    }
}
