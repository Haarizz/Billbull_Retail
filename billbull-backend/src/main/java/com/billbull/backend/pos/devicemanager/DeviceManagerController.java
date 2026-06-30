package com.billbull.backend.pos.devicemanager;

import com.billbull.backend.pos.device.PosDevice;
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

import java.util.List;

/**
 * Cross-cutting Device Manager surface: a branch-wide read of every registered device (Phase A),
 * health push/history (Phase C), discovered-candidate ingestion/listing (Phase C), and the
 * unified dashboard overview + refresh signal (Phase F). Per-type CRUD (printers, scanners, cash
 * drawers) stays in its own controller; this is the shared view/ingest surface, not a replacement
 * for them.
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

    public DeviceManagerController(DeviceManager deviceManager, HealthService healthService,
                                    DiscoveryService discoveryService, DeviceDashboardService dashboardService,
                                    DashboardRefreshSignal refreshSignal) {
        this.deviceManager = deviceManager;
        this.healthService = healthService;
        this.discoveryService = discoveryService;
        this.dashboardService = dashboardService;
        this.refreshSignal = refreshSignal;
    }

    @GetMapping("/dashboard")
    @PreAuthorize("isAuthenticated()")
    public List<PosDevice> dashboard(@RequestParam Long branchId) {
        return deviceManager.getDashboard(branchId);
    }

    // ── Unified Dashboard Overview (Phase F) ─────────────────────────────────

    @GetMapping("/dashboard/overview")
    @PreAuthorize("isAuthenticated()")
    public DeviceDashboardService.Overview overview(@RequestParam Long branchId) {
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
        return deviceManager.getEvents(id);
    }

    // ── Health (Phase C) ─────────────────────────────────────────────────────

    @PostMapping("/{id}/health")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosDeviceHealthSnapshot> reportHealth(@PathVariable Long id,
                                                                  @RequestBody HealthService.SnapshotRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(healthService.recordSnapshot(id, req));
    }

    @GetMapping("/{id}/health/history")
    @PreAuthorize("isAuthenticated()")
    public List<PosDeviceHealthSnapshot> healthHistory(@PathVariable Long id) {
        return healthService.getHistory(id);
    }

    // ── Discovery (Phase C) ──────────────────────────────────────────────────

    @PostMapping("/discovery")
    @PreAuthorize("isAuthenticated()")
    public PosDiscoveredDevice reportDiscoveredDevice(@RequestParam String agentIdentifier,
                                                        @RequestBody DiscoveryService.CandidateRequest candidate) {
        return discoveryService.ingest(agentIdentifier, candidate);
    }

    @GetMapping("/discovery/awaiting")
    @PreAuthorize("isAuthenticated()")
    public List<PosDiscoveredDevice> awaitingRegistration() {
        return discoveryService.listAwaitingRegistration();
    }

    @PutMapping("/discovery/{id}/ignore")
    @PreAuthorize("isAuthenticated()")
    public PosDiscoveredDevice ignoreDiscoveredDevice(@PathVariable Long id) {
        return discoveryService.ignore(id);
    }
}
