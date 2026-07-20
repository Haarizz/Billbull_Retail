package com.billbull.backend.purchase.lpo.workflow;

import com.billbull.backend.security.ModulePermissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/approval-workflows")
@RequiredArgsConstructor
public class ApprovalWorkflowController {

    private static final String MODULE = "purchases.lpo";

    private final ApprovalWorkflowStepRepository stepRepository;
    private final ModulePermissionService modulePermissionService;

    @GetMapping("/{module}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<ApprovalWorkflowStep>> getSteps(
            @PathVariable String module,
            @RequestParam(required = false, defaultValue = "DEFAULT") String tenantId) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(stepRepository.findAllByTenantIdAndModuleOrderByStepOrderAsc(tenantId, module));
    }

    @PostMapping("/{module}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<ApprovalWorkflowStep>> updateSteps(
            @PathVariable String module,
            @RequestParam(required = false, defaultValue = "DEFAULT") String tenantId,
            @RequestBody List<ApprovalWorkflowStep> steps) {
        modulePermissionService.requireCanEdit(MODULE);
        // Simple implementation: clear and re-save
        List<ApprovalWorkflowStep> existing = stepRepository.findAllByTenantIdAndModuleOrderByStepOrderAsc(tenantId,
                module);
        stepRepository.deleteAll(existing);

        for (int i = 0; i < steps.size(); i++) {
            ApprovalWorkflowStep step = steps.get(i);
            step.setId(null);
            step.setModule(module);
            step.setTenantId(tenantId);
            step.setStepOrder(i + 1);
        }

        return ResponseEntity.ok(stepRepository.saveAll(steps));
    }
}
