package com.billbull.backend.pos.devicemanager;

import com.billbull.backend.pos.terminal.PosTerminal;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
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
 * POST   /api/pos/hardware-profiles                      create a profile
 * GET    /api/pos/hardware-profiles?branchId=             list profiles available to a branch (global + branch-owned)
 * GET    /api/pos/hardware-profiles/{id}                  get one profile
 * PUT    /api/pos/hardware-profiles/{id}                  update name/branch/description
 * DELETE /api/pos/hardware-profiles/{id}                  decommission
 * POST   /api/pos/hardware-profiles/{id}/devices          assign a device to a role within the profile
 * GET    /api/pos/hardware-profiles/{id}/devices          list the profile's role assignments
 * POST   /api/pos/hardware-profiles/{id}/assign/{terminalId}   assignment engine: bind this profile to a terminal
 * GET    /api/pos/hardware-profiles/sync-status/{terminalId}   is this terminal's profile binding up to date?
 */
@RestController
@RequestMapping("/api/pos/hardware-profiles")
@CrossOrigin
public class HardwareProfileController {

    private final HardwareProfileService service;
    private final HardwareProfileAssignmentEngine assignmentEngine;

    public HardwareProfileController(HardwareProfileService service, HardwareProfileAssignmentEngine assignmentEngine) {
        this.service = service;
        this.assignmentEngine = assignmentEngine;
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosHardwareProfile> create(@RequestBody HardwareProfileService.CreateRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(req));
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<PosHardwareProfile> list(@RequestParam Long branchId) {
        return service.listForBranch(branchId);
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosHardwareProfile get(@PathVariable Long id) {
        return service.get(id);
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosHardwareProfile update(@PathVariable Long id, @RequestBody HardwareProfileService.CreateRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosHardwareProfile decommission(@PathVariable Long id) {
        return service.decommission(id);
    }

    @PostMapping("/{id}/devices")
    @PreAuthorize("isAuthenticated()")
    public PosHardwareProfileDevice assignRole(@PathVariable Long id,
                                                @RequestBody HardwareProfileService.AssignRoleRequest req) {
        return service.assignDeviceToRole(id, req);
    }

    @GetMapping("/{id}/devices")
    @PreAuthorize("isAuthenticated()")
    public List<PosHardwareProfileDevice> devices(@PathVariable Long id) {
        return service.getDevices(id);
    }

    @PostMapping("/{id}/assign/{terminalId}")
    @PreAuthorize("isAuthenticated()")
    public PosTerminal assignToTerminal(@PathVariable Long id, @PathVariable String terminalId) {
        return assignmentEngine.assign(terminalId, id);
    }

    @GetMapping("/sync-status/{terminalId}")
    @PreAuthorize("isAuthenticated()")
    public HardwareProfileService.SyncStatus syncStatus(@PathVariable String terminalId) {
        return service.getSyncStatus(terminalId);
    }
}
