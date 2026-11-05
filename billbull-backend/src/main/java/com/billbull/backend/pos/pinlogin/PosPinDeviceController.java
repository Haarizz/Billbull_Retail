package com.billbull.backend.pos.pinlogin;

import com.billbull.backend.security.BranchScope;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Turning PIN sign-in on and off for tills. Admins and branch admins only; a branch admin is
 * limited to tills in branches their session can reach.
 */
@RestController
@RequestMapping("/api/pos/pin-devices")
@PreAuthorize("hasAnyRole('ADMIN', 'SUPER_ADMIN', 'BRANCH_ADMIN')")
public class PosPinDeviceController {

    private final PosPinLoginService service;
    private final PosPinDeviceRepository repository;

    public PosPinDeviceController(PosPinLoginService service, PosPinDeviceRepository repository) {
        this.service = service;
        this.repository = repository;
    }

    /** Enables PIN sign-in on the calling till. The token in the response is only ever sent once. */
    @PostMapping
    public PosPinLoginService.EnrolledDevice enable(@RequestBody EnableRequest request, Authentication auth) {
        if (request.branchId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose the till's branch first.");
        }
        BranchScope.assertCanAccess(request.branchId());
        return service.enroll(request.branchId(), request.label(), request.terminalId(), auth.getName());
    }

    @GetMapping
    public List<DeviceView> list() {
        return repository.findByRevokedAtIsNullOrderByCreatedAtDesc().stream()
                .filter(d -> canAccess(d.getBranchId()))
                .map(DeviceView::of)
                .toList();
    }

    @DeleteMapping("/{id}")
    public DeviceView disable(@PathVariable Long id, Authentication auth) {
        PosPinDevice device = service.findDevice(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Till not found."));
        BranchScope.assertCanAccess(device.getBranchId());
        return DeviceView.of(service.revoke(id, auth.getName()));
    }

    private static boolean canAccess(Long branchId) {
        try {
            BranchScope.assertCanAccess(branchId);
            return true;
        } catch (ResponseStatusException e) {
            return false;
        }
    }

    public record EnableRequest(Long branchId, String label, String terminalId) {
    }

    public record DeviceView(Long id, Long branchId, String label, String terminalId, String createdBy,
                             LocalDateTime createdAt, LocalDateTime lastUsedAt, LocalDateTime revokedAt) {
        static DeviceView of(PosPinDevice d) {
            return new DeviceView(d.getId(), d.getBranchId(), d.getLabel(), d.getTerminalId(), d.getCreatedBy(),
                    d.getCreatedAt(), d.getLastUsedAt(), d.getRevokedAt());
        }
    }
}
