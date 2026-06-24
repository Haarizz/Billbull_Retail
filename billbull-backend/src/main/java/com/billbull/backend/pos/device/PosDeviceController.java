package com.billbull.backend.pos.device;

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
 */
@RestController
@RequestMapping("/api/pos/devices")
public class PosDeviceController {

    private final PosDeviceRepository repo;

    public PosDeviceController(PosDeviceRepository repo) {
        this.repo = repo;
    }

    // ── Registration ─────────────────────────────────────────────────────────

    @PostMapping
    @PreAuthorize("hasAuthority('POS_SETTINGS')")
    public ResponseEntity<PosDevice> register(@RequestBody RegisterRequest req) {
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
        if (branchId != null && status != null) {
            return repo.findByBranchIdAndStatus(branchId, status);
        }
        if (status != null) {
            return repo.findAllByStatus(status);
        }
        return repo.findAll();
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosDevice getById(@PathVariable Long id) {
        return repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Device not found: " + id));
    }

    @GetMapping("/code/{code}")
    @PreAuthorize("isAuthenticated()")
    public PosDevice getByCode(@PathVariable String code) {
        return repo.findByDeviceCode(code)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Device not found: " + code));
    }

    // ── Updates ───────────────────────────────────────────────────────────────

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('POS_SETTINGS')")
    public PosDevice update(@PathVariable Long id, @RequestBody RegisterRequest req) {
        PosDevice device = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Device not found: " + id));
        device.setDeviceName(req.deviceName());
        device.setBranchId(req.branchId());
        device.setBranchName(req.branchName());
        device.setCounterName(req.counterName());
        device.setNotes(req.notes());
        return repo.save(device);
    }

    @PutMapping("/{id}/status")
    @PreAuthorize("hasAuthority('POS_SETTINGS')")
    public PosDevice updateStatus(@PathVariable Long id, @RequestBody Map<String, String> body) {
        PosDevice device = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Device not found: " + id));
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
        PosDevice device = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Device not found: " + id));
        device.setLastHeartbeat(LocalDateTime.now());
        repo.save(device);
        return ResponseEntity.ok().build();
    }

    // ── Soft-delete ───────────────────────────────────────────────────────────

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('POS_SETTINGS')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        PosDevice device = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Device not found: " + id));
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
