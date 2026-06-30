package com.billbull.backend.pos.devicemanager;

import com.billbull.backend.pos.cashdrawer.PosCashDrawer;
import com.billbull.backend.pos.cashdrawer.PosCashDrawerKickResult;
import com.billbull.backend.pos.cashdrawer.PosCashDrawerRepository;
import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceRuntimeHealth;
import com.billbull.backend.pos.printjob.PosPrintJob;
import com.billbull.backend.pos.printjob.PosPrintJobRepository;
import com.billbull.backend.pos.printjob.PrintJobStatus;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;
import java.util.Set;

/**
 * Single aggregate read for the Device Dashboard (Phase F): Hardware Profiles, devices, health,
 * discovery, print queue, event log, and the metric widgets — assembled from the read paths
 * already built in Phases A-E, not a new source of truth. This is a query-composition service,
 * not a new entity hierarchy, matching the same "shared facade over existing repositories"
 * principle used by {@link DeviceManager} itself.
 * See docs/pos-device-architecture-specification-v2-2026-06-30.md §8 (Device Dashboard) and the
 * Phase F brief: "a unified view... instead of exposing these as isolated pages."
 */
@Service
public class DeviceDashboardService {

    private static final Set<PosDeviceRuntimeHealth> ONLINE_STATES =
            Set.of(PosDeviceRuntimeHealth.ONLINE, PosDeviceRuntimeHealth.BUSY);
    private static final Set<PosDeviceRuntimeHealth> OFFLINE_STATES =
            Set.of(PosDeviceRuntimeHealth.OFFLINE, PosDeviceRuntimeHealth.DISCONNECTED);
    private static final Set<PosDeviceRuntimeHealth> WARNING_STATES =
            Set.of(PosDeviceRuntimeHealth.ERROR, PosDeviceRuntimeHealth.PAPER_OUT, PosDeviceRuntimeHealth.COVER_OPEN);
    private static final Set<PrintJobStatus> IN_FLIGHT_STATUSES =
            Set.of(PrintJobStatus.QUEUED, PrintJobStatus.DISPATCHED);

    private final DeviceManager deviceManager;
    private final HardwareProfileService hardwareProfileService;
    private final DiscoveryService discoveryService;
    private final PosPrintJobRepository printJobRepo;
    private final PosDeviceEventLogRepository eventLogRepo;
    private final PosCashDrawerRepository cashDrawerRepo;
    private final DashboardRefreshSignal refreshSignal;

    public DeviceDashboardService(DeviceManager deviceManager, HardwareProfileService hardwareProfileService,
                                   DiscoveryService discoveryService, PosPrintJobRepository printJobRepo,
                                   PosDeviceEventLogRepository eventLogRepo, PosCashDrawerRepository cashDrawerRepo,
                                   DashboardRefreshSignal refreshSignal) {
        this.deviceManager = deviceManager;
        this.hardwareProfileService = hardwareProfileService;
        this.discoveryService = discoveryService;
        this.printJobRepo = printJobRepo;
        this.eventLogRepo = eventLogRepo;
        this.cashDrawerRepo = cashDrawerRepo;
        this.refreshSignal = refreshSignal;
    }

    public Overview getOverview(Long branchId) {
        if (branchId == null) {
            return new Overview(List.of(), List.of(), List.of(), List.of(), List.of(), emptyMetrics(), refreshSignal.snapshot());
        }

        List<PosDevice> devices = deviceManager.getDashboard(branchId);
        List<PosHardwareProfile> profiles = hardwareProfileService.listForBranch(branchId);
        List<PosDiscoveredDevice> discovered = discoveryService.listAwaitingRegistration();
        List<PosPrintJob> inFlightJobs = printJobRepo.findByBranchIdAndStatusIn(branchId, IN_FLIGHT_STATUSES);
        List<PosPrintJob> succeededJobs = printJobRepo.findByBranchIdAndStatus(branchId, PrintJobStatus.SUCCEEDED);
        List<PosDeviceEventLog> recentEvents = eventLogRepo.findTop20ByBranchIdOrderByCreatedAtDesc(branchId);
        List<PosCashDrawer> drawers = cashDrawerRepo.findByBranchIdAndIsActiveTrueOrderByDeviceNameAsc(branchId);

        Metrics metrics = computeMetrics(devices, inFlightJobs, succeededJobs, discovered, drawers);

        return new Overview(profiles, devices, discovered, inFlightJobs, recentEvents, metrics, refreshSignal.snapshot());
    }

    private Metrics computeMetrics(List<PosDevice> devices, List<PosPrintJob> inFlightJobs,
                                    List<PosPrintJob> succeededJobs, List<PosDiscoveredDevice> discovered,
                                    List<PosCashDrawer> drawers) {
        int devicesOnline = (int) devices.stream().filter(d -> ONLINE_STATES.contains(d.getRuntimeHealth())).count();
        int devicesOffline = (int) devices.stream().filter(d -> OFFLINE_STATES.contains(d.getRuntimeHealth())).count();
        int healthWarnings = (int) devices.stream().filter(d -> WARNING_STATES.contains(d.getRuntimeHealth())).count();

        int pendingPrintJobs = inFlightJobs.size();
        int totalQueueLength = (int) inFlightJobs.stream().filter(j -> j.getStatus() == PrintJobStatus.QUEUED).count();

        int discoveredAwaiting = discovered.size();
        int drawerFailures = (int) drawers.stream()
                .filter(d -> d.getLastKickResult() == PosCashDrawerKickResult.FAILED).count();

        Double avgPrintDurationSeconds = averageDurationSeconds(succeededJobs);

        return new Metrics(devicesOnline, devicesOffline, pendingPrintJobs, totalQueueLength,
                discoveredAwaiting, healthWarnings, drawerFailures, avgPrintDurationSeconds);
    }

    /** Average dispatch-to-completion time for SUCCEEDED jobs that have both timestamps set. */
    private Double averageDurationSeconds(List<PosPrintJob> succeededJobs) {
        List<Duration> durations = succeededJobs.stream()
                .filter(j -> j.getDispatchedAt() != null && j.getCompletedAt() != null)
                .map(j -> Duration.between(j.getDispatchedAt(), j.getCompletedAt()))
                .toList();
        if (durations.isEmpty()) {
            return null;
        }
        double totalSeconds = durations.stream().mapToLong(Duration::getSeconds).sum();
        return totalSeconds / durations.size();
    }

    private Metrics emptyMetrics() {
        return new Metrics(0, 0, 0, 0, 0, 0, 0, null);
    }

    public record Overview(
            List<PosHardwareProfile> hardwareProfiles,
            List<PosDevice> devices,
            List<PosDiscoveredDevice> discoveredDevices,
            List<PosPrintJob> printQueue,
            List<PosDeviceEventLog> recentEvents,
            Metrics metrics,
            DashboardRefreshSignal.Snapshot refreshSignal
    ) {}

    public record Metrics(
            int devicesOnline,
            int devicesOffline,
            int pendingPrintJobs,
            int totalQueueLength,
            int discoveredDevicesAwaiting,
            int healthWarnings,
            int drawerFailures,
            Double averagePrintDurationSeconds
    ) {}
}
