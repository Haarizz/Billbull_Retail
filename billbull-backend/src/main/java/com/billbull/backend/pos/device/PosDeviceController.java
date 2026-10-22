package com.billbull.backend.pos.device;

import com.billbull.backend.pos.auth.PosTillPermission;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.BranchAccessService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * §2.7 — POS device registration and management.
 * Devices must be registered and ACTIVE before they can open a POS session.
 *
 * POST   /api/pos/devices                    register a new device
 * GET    /api/pos/devices                    list all devices (optionally by branch / status)
 * GET    /api/pos/devices/{id}               get device by ID
 * GET    /api/pos/devices/code/{code}        get device by device code (used by terminal boot)
 * PUT    /api/pos/devices/{id}               update device details
 * PUT    /api/pos/devices/{id}/status        activate / deactivate / decommission
 * POST   /api/pos/devices/{id}/heartbeat     terminal pings to show it is alive
 * DELETE /api/pos/devices/{id}               soft-delete (sets isActive = false)
 *
 * <p>Registering, editing, changing status and removing a device is device administration:
 * {@code pos.devices} create, edit or delete. These writes used to require a
 * {@code POS_SETTINGS} authority that no login carries, so they were refused for everyone.
 * Reads are for device administrators ({@code pos.devices} view); lookup by code and the
 * heartbeat also admit the till ({@code sales.pos}). Every call is limited to devices of a branch
 * the caller may act on, judged on the stored device and on the requested branch for a write.
 */
@RestController
@RequestMapping("/api/pos/devices")
public class PosDeviceController {

    static final String DEVICE_ADMIN = "pos.devices";
    private static final String LABEL = "Device";

    private final PosDeviceRepository repo;
    private final ModulePermissionService modulePermissionService;
    private final BranchAccessService branchAccessService;

    public PosDeviceController(PosDeviceRepository repo, ModulePermissionService modulePermissionService,
                               BranchAccessService branchAccessService) {
        this.repo = repo;
        this.modulePermissionService = modulePermissionService;
        this.branchAccessService = branchAccessService;
    }

    private PosDevice deviceInScope(Long id) {
        PosDevice device = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Device not found: " + id));
        branchAccessService.assertTransactionBranchAccessible(device.getBranchId(), LABEL);
        return device;
    }

    // ── Registration ─────────────────────────────────────────────────────────

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosDevice> register(@RequestBody RegisterRequest req) {
        modulePermissionService.requireCanCreate(DEVICE_ADMIN);
        if (req == null || req.branchId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Branch is required.");
        }
        branchAccessService.assertTransactionBranchAccessible(req.branchId(), LABEL);
        if (repo.existsByDeviceCode(req.deviceCode())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Device code already registered: " + req.deviceCode());
        }
        PosDevice device = new PosDevice();
        device.setDeviceCode(req.deviceCode());
        device.setDeviceName(req.deviceName());
        device.setBranchId(req.branchId());
        device.setBranchName(req.branchName());
        device.setCounterName(req.counterName());
        device.setNotes(req.notes());
        device.setStatus(PosDeviceStatus.ACTIVE);
        return ResponseEntity.status(HttpStatus.CREATED).body(repo.save(device));
    }

    // ── List / lookup ─────────────────────────────────────────────────────────

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<PosDevice> list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) PosDeviceStatus status) {
        modulePermissionService.requireCanView(DEVICE_ADMIN);
        branchAccessService.assertTransactionBranchAccessible(branchId, LABEL);
        List<PosDevice> devices;
        if (branchId != null && status != null) {
            devices = repo.findByBranchIdAndStatus(branchId, status);
        } else if (status != null) {
            devices = repo.findAllByStatus(status);
        } else {
            devices = repo.findAll();
        }
        // Without a branchId the queries span every branch, so the rows are filtered here.
        Map<Long, Boolean> decided = new java.util.HashMap<>();
        return devices.stream()
                .filter(d -> branchId == null || branchId.equals(d.getBranchId()))
                .filter(d -> decided.computeIfAbsent(d.getBranchId(), branchAccessService::canAccessTransactionBranch))
                .toList();
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosDevice getById(@PathVariable Long id) {
        modulePermissionService.requireCanView(DEVICE_ADMIN);
        return deviceInScope(id);
    }

    @GetMapping("/code/{code}")
    @PreAuthorize("isAuthenticated()")
    public PosDevice getByCode(@PathVariable String code) {
        modulePermissionService.requireCanViewAny(PosTillPermission.MODULE, DEVICE_ADMIN);
        PosDevice device = repo.findByDeviceCode(code)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Device not found: " + code));
        branchAccessService.assertTransactionBranchAccessible(device.getBranchId(), LABEL);
        return device;
    }

    // ── Updates ───────────────────────────────────────────────────────────────

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosDevice update(@PathVariable Long id, @RequestBody RegisterRequest req) {
        modulePermissionService.requireCanEdit(DEVICE_ADMIN);
        PosDevice device = deviceInScope(id);
        if (req == null || req.branchId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Branch is required.");
        }
        branchAccessService.assertTransactionBranchAccessible(req.branchId(), LABEL);
        device.setDeviceName(req.deviceName());
        device.setBranchId(req.branchId());
        device.setBranchName(req.branchName());
        device.setCounterName(req.counterName());
        device.setNotes(req.notes());
        return repo.save(device);
    }

    @PutMapping("/{id}/status")
    @PreAuthorize("isAuthenticated()")
    public PosDevice updateStatus(@PathVariable Long id, @RequestBody Map<String, String> body) {
        modulePermissionService.requireCanEdit(DEVICE_ADMIN);
        PosDevice device = deviceInScope(id);
        String statusStr = body.get("status");
        try {
            device.setStatus(PosDeviceStatus.valueOf(statusStr));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown status: " + statusStr);
        }
        return repo.save(device);
    }

    @PostMapping("/{id}/heartbeat")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> heartbeat(@PathVariable Long id) {
        modulePermissionService.requireCanViewAny(PosTillPermission.MODULE, DEVICE_ADMIN);
        PosDevice device = deviceInScope(id);
        device.setLastHeartbeat(LocalDateTime.now());
        repo.save(device);
        return ResponseEntity.ok().build();
    }

    // ── Soft-delete ───────────────────────────────────────────────────────────

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        modulePermissionService.requireCanDelete(DEVICE_ADMIN);
        PosDevice device = deviceInScope(id);
        device.setActive(false);
        device.setStatus(PosDeviceStatus.DECOMMISSIONED);
        repo.save(device);
        return ResponseEntity.noContent().build();
    }

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public record RegisterRequest(
            String deviceCode,
            String deviceName,
            Long branchId,
            String branchName,
            String counterName,
            String notes
    ) {}
}
