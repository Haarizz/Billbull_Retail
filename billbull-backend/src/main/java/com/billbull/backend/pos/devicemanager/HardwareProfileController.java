package com.billbull.backend.pos.devicemanager;

import com.billbull.backend.pos.device.PosDeviceRepository;
import com.billbull.backend.pos.terminal.PosTerminal;
import com.billbull.backend.pos.terminal.PosTerminalRepository;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.BranchAccessService;
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
import org.springframework.web.server.ResponseStatusException;

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
 *
 * <p>Hardware profiles are administration ({@code pos.hardwareprofiles}): view to read, create,
 * edit (including role slots and binding a profile to a terminal) and delete. Every call is
 * limited to the caller's branches, judged on the stored profile, the requested branch, the
 * device placed in a slot and the terminal a profile is bound to. A profile with no branch is a
 * global template: anyone with view may read it, but only an administrator who reaches every
 * branch may create, change or remove one.
 */
@RestController
@RequestMapping("/api/pos/hardware-profiles")
@CrossOrigin
public class HardwareProfileController {

    static final String PROFILE_ADMIN = "pos.hardwareprofiles";
    private static final String LABEL = "Hardware profile";

    private final HardwareProfileService service;
    private final HardwareProfileAssignmentEngine assignmentEngine;
    private final ModulePermissionService modulePermissionService;
    private final BranchAccessService branchAccessService;
    private final PosDeviceRepository deviceRepository;
    private final PosTerminalRepository terminalRepository;

    public HardwareProfileController(HardwareProfileService service, HardwareProfileAssignmentEngine assignmentEngine,
                                     ModulePermissionService modulePermissionService,
                                     BranchAccessService branchAccessService,
                                     PosDeviceRepository deviceRepository,
                                     PosTerminalRepository terminalRepository) {
        this.service = service;
        this.assignmentEngine = assignmentEngine;
        this.modulePermissionService = modulePermissionService;
        this.branchAccessService = branchAccessService;
        this.deviceRepository = deviceRepository;
        this.terminalRepository = terminalRepository;
    }

    private PosHardwareProfile readableProfile(Long id) {
        PosHardwareProfile profile = service.get(id);
        branchAccessService.assertTransactionBranchAccessible(profile.getBranchId(), LABEL);
        return profile;
    }

    /** A branch the caller may write profiles for. No branch means a global template. */
    private void requireWritableBranch(Long branchId) {
        if (branchId == null) {
            BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
            if (ctx == null || !ctx.isAllBranches()) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Global hardware profiles can only be changed by an administrator of every branch.");
            }
            return;
        }
        branchAccessService.assertTransactionBranchAccessible(branchId, LABEL);
    }

    private void requireTerminalInScope(String terminalId) {
        terminalRepository.findByTerminalId(terminalId).ifPresent(terminal ->
                branchAccessService.assertTransactionBranchAccessible(terminal.getBranchId(), "Terminal"));
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosHardwareProfile> create(@RequestBody HardwareProfileService.CreateRequest req) {
        modulePermissionService.requireCanCreate(PROFILE_ADMIN);
        requireWritableBranch(req != null ? req.branchId() : null);
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(req));
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<PosHardwareProfile> list(@RequestParam Long branchId) {
        modulePermissionService.requireCanView(PROFILE_ADMIN);
        branchAccessService.assertTransactionBranchAccessible(branchId, LABEL);
        return service.listForBranch(branchId);
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosHardwareProfile get(@PathVariable Long id) {
        modulePermissionService.requireCanView(PROFILE_ADMIN);
        return readableProfile(id);
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosHardwareProfile update(@PathVariable Long id, @RequestBody HardwareProfileService.CreateRequest req) {
        modulePermissionService.requireCanEdit(PROFILE_ADMIN);
        requireWritableBranch(service.get(id).getBranchId());
        requireWritableBranch(req != null ? req.branchId() : null);
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosHardwareProfile decommission(@PathVariable Long id) {
        modulePermissionService.requireCanDelete(PROFILE_ADMIN);
        requireWritableBranch(service.get(id).getBranchId());
        return service.decommission(id);
    }

    @PostMapping("/{id}/devices")
    @PreAuthorize("isAuthenticated()")
    public PosHardwareProfileDevice assignRole(@PathVariable Long id,
                                                @RequestBody HardwareProfileService.AssignRoleRequest req) {
        modulePermissionService.requireCanEdit(PROFILE_ADMIN);
        requireWritableBranch(service.get(id).getBranchId());
        if (req != null && req.deviceId() != null) {
            deviceRepository.findById(req.deviceId()).ifPresent(device ->
                    branchAccessService.assertTransactionBranchAccessible(device.getBranchId(), "Device"));
        }
        return service.assignDeviceToRole(id, req);
    }

    @GetMapping("/{id}/devices")
    @PreAuthorize("isAuthenticated()")
    public List<PosHardwareProfileDevice> devices(@PathVariable Long id) {
        modulePermissionService.requireCanView(PROFILE_ADMIN);
        readableProfile(id);
        return service.getDevices(id);
    }

    @PostMapping("/{id}/assign/{terminalId}")
    @PreAuthorize("isAuthenticated()")
    public PosTerminal assignToTerminal(@PathVariable Long id, @PathVariable String terminalId) {
        modulePermissionService.requireCanEdit(PROFILE_ADMIN);
        readableProfile(id);
        requireTerminalInScope(terminalId);
        return assignmentEngine.assign(terminalId, id);
    }

    @GetMapping("/sync-status/{terminalId}")
    @PreAuthorize("isAuthenticated()")
    public HardwareProfileService.SyncStatus syncStatus(@PathVariable String terminalId) {
        modulePermissionService.requireCanView(PROFILE_ADMIN);
        requireTerminalInScope(terminalId);
        return service.getSyncStatus(terminalId);
    }
}
