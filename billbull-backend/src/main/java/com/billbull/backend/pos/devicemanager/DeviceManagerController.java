package com.billbull.backend.pos.devicemanager;

import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceRepository;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.BranchAccessService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Cross-cutting Device Manager surface: a branch-wide read of every registered device (Phase A),
 * health push/history (Phase C), discovered-candidate ingestion/listing (Phase C), and the
 * unified dashboard overview + refresh signal (Phase F). Per-type CRUD (printers, scanners, cash
 * drawers) stays in its own controller; this is the shared view/ingest surface, not a replacement
 * for them.
 *
 * <p>Device administration ({@code pos.devices}): view to read the dashboard, events and health,
 * edit to push a health snapshot or ignore a discovery candidate, create to report one. Reads and
 * health pushes are limited to devices of a branch the caller may act on. Discovery candidates
 * carry no branch (they are not yet registered anywhere), so only the permission applies to them.
 * The refresh token is a bare version counter with no device data and stays open to any
 * signed-in user.
 */
@RestController
@RequestMapping("/api/pos/devices")
@CrossOrigin
public class DeviceManagerController {

    private final DeviceManager deviceManager;
    private final HealthService healthService;
    private final DiscoveryService discoveryService;
    private final DeviceDashboardService dashboardService;
    private final DashboardRefreshSignal refreshSignal;
    private final ModulePermissionService modulePermissionService;
    private final BranchAccessService branchAccessService;
    private final PosDeviceRepository deviceRepository;

    static final String DEVICE_ADMIN = "pos.devices";

    public DeviceManagerController(DeviceManager deviceManager, HealthService healthService,
                                    DiscoveryService discoveryService, DeviceDashboardService dashboardService,
                                    DashboardRefreshSignal refreshSignal,
                                    ModulePermissionService modulePermissionService,
                                    BranchAccessService branchAccessService,
                                    PosDeviceRepository deviceRepository) {
        this.modulePermissionService = modulePermissionService;
        this.branchAccessService = branchAccessService;
        this.deviceRepository = deviceRepository;
        this.deviceManager = deviceManager;
        this.healthService = healthService;
        this.discoveryService = discoveryService;
        this.dashboardService = dashboardService;
        this.refreshSignal = refreshSignal;
    }

    private void requireBranchInScope(Long branchId) {
        branchAccessService.assertTransactionBranchAccessible(branchId, "Device");
    }

    private void requireDeviceInScope(Long deviceId) {
        PosDevice device = deviceRepository.findById(deviceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Device not found: " + deviceId));
        requireBranchInScope(device.getBranchId());
    }

    @GetMapping("/dashboard")
    @PreAuthorize("isAuthenticated()")
    public List<PosDevice> dashboard(@RequestParam Long branchId) {
        modulePermissionService.requireCanView(DEVICE_ADMIN);
        requireBranchInScope(branchId);
        return deviceManager.getDashboard(branchId);
    }

    // ── Unified Dashboard Overview (Phase F) ─────────────────────────────────

    @GetMapping("/dashboard/overview")
    @PreAuthorize("isAuthenticated()")
    public DeviceDashboardService.Overview overview(@RequestParam Long branchId) {
        modulePermissionService.requireCanView(DEVICE_ADMIN);
        requireBranchInScope(branchId);
        return dashboardService.getOverview(branchId);
    }

    /** Cheap poll target: the frontend only re-fetches /dashboard/overview when this version
     *  number has moved since its last check (see DashboardRefreshSignal). */
    @GetMapping("/dashboard/refresh-token")
    @PreAuthorize("isAuthenticated()")
    public DashboardRefreshSignal.Snapshot refreshToken() {
        return refreshSignal.snapshot();
    }

    @GetMapping("/{id}/events")
    @PreAuthorize("isAuthenticated()")
    public List<PosDeviceEventLog> events(@PathVariable Long id) {
        modulePermissionService.requireCanView(DEVICE_ADMIN);
        requireDeviceInScope(id);
        return deviceManager.getEvents(id);
    }

    // ── Health (Phase C) ─────────────────────────────────────────────────────

    @PostMapping("/{id}/health")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosDeviceHealthSnapshot> reportHealth(@PathVariable Long id,
                                                                  @RequestBody HealthService.SnapshotRequest req) {
        modulePermissionService.requireCanEdit(DEVICE_ADMIN);
        requireDeviceInScope(id);
        return ResponseEntity.status(HttpStatus.CREATED).body(healthService.recordSnapshot(id, req));
    }

    @GetMapping("/{id}/health/history")
    @PreAuthorize("isAuthenticated()")
    public List<PosDeviceHealthSnapshot> healthHistory(@PathVariable Long id) {
        modulePermissionService.requireCanView(DEVICE_ADMIN);
        requireDeviceInScope(id);
        return healthService.getHistory(id);
    }

    // ── Discovery (Phase C) ──────────────────────────────────────────────────

    @PostMapping("/discovery")
    @PreAuthorize("isAuthenticated()")
    public PosDiscoveredDevice reportDiscoveredDevice(@RequestParam String agentIdentifier,
                                                        @RequestBody DiscoveryService.CandidateRequest candidate) {
        modulePermissionService.requireCanCreate(DEVICE_ADMIN);
        return discoveryService.ingest(agentIdentifier, candidate);
    }

    @GetMapping("/discovery/awaiting")
    @PreAuthorize("isAuthenticated()")
    public List<PosDiscoveredDevice> awaitingRegistration() {
        modulePermissionService.requireCanView(DEVICE_ADMIN);
        return discoveryService.listAwaitingRegistration();
    }

    @PutMapping("/discovery/{id}/ignore")
    @PreAuthorize("isAuthenticated()")
    public PosDiscoveredDevice ignoreDiscoveredDevice(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(DEVICE_ADMIN);
        return discoveryService.ignore(id);
    }
}
