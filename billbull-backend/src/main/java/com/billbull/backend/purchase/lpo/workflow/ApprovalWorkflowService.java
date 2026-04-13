package com.billbull.backend.purchase.lpo.workflow;

import com.billbull.backend.common.workflow.ApprovalStatus;
import com.billbull.backend.purchase.lpo.Lpo;
import com.billbull.backend.purchase.lpo.LpoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ApprovalWorkflowService {

    private final ApprovalWorkflowStepRepository stepRepository;
    private final ApprovalHistoryRepository historyRepository;
    private final LpoRepository lpoRepository;

    @Transactional
    public void initializeApproval(Lpo lpo) {
        String tenantId = lpo.getTenantId();
        if (tenantId == null)
            tenantId = "DEFAULT"; // Fallback if tenantId not set

        List<ApprovalWorkflowStep> steps = stepRepository.findAllByTenantIdAndModuleOrderByStepOrderAsc(tenantId,
                "LPO");

        if (steps.isEmpty()) {
            // If no workflow defined, auto-approve?
            // Better to have at least one step or throw error.
            // For now, let's assume we want a workflow.
            lpo.setApprovalStatus(ApprovalStatus.APPROVED);
            return;
        }

        List<ApprovalHistory> history = steps.stream().map(step -> ApprovalHistory.builder()
                .tenantId(lpo.getTenantId())
                .documentId(lpo.getId())
                .module("LPO")
                .stepOrder(step.getStepOrder())
                .roleCode(step.getRoleCode())
                .displayName(step.getDisplayName())
                .status(StepStatus.PENDING)
                .build()).collect(Collectors.toList());

        historyRepository.saveAll(history);
        lpo.setApprovalStatus(ApprovalStatus.PENDING_APPROVAL);
    }

    @Transactional
    public void processApproval(Lpo lpo, String username, List<String> userRoles, String remarks) {
        List<ApprovalHistory> history = historyRepository.findAllByTenantIdAndDocumentIdAndModuleOrderByStepOrderAsc(
                lpo.getTenantId(), lpo.getId(), "LPO");

        if (history.isEmpty()) {
            lpo.setApprovalStatus(ApprovalStatus.APPROVED);
            lpo.setApprovedBy(username);
            lpo.setApprovedAt(LocalDateTime.now());
            return;
        }

        ApprovalHistory currentStep = history.stream()
                .filter(h -> h.getStatus() == StepStatus.PENDING)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "No pending approval steps found. This document might already be approved or rejected."));

        // Validate Role
        if (!userRoles.contains(currentStep.getRoleCode()) && !userRoles.contains("ADMIN")) {
            throw new IllegalStateException("User does not have required role: " + currentStep.getRoleCode());
        }

        currentStep.setStatus(StepStatus.APPROVED);
        currentStep.setApprovedBy(username);
        currentStep.setApprovedAt(LocalDateTime.now());
        currentStep.setRemarks(remarks);
        historyRepository.save(currentStep);

        // Update LPO Status
        boolean allApproved = history.stream().allMatch(h -> h.getStatus() == StepStatus.APPROVED);
        if (allApproved) {
            lpo.setApprovalStatus(ApprovalStatus.APPROVED);
            lpo.setApprovedBy(username);
            lpo.setApprovedAt(LocalDateTime.now());
        } else {
            lpo.setApprovalStatus(ApprovalStatus.PARTIALLY_APPROVED);
        }
    }

    @Transactional
    public void processRejection(Lpo lpo, String username, List<String> userRoles, String remarks) {
        List<ApprovalHistory> history = historyRepository.findAllByTenantIdAndDocumentIdAndModuleOrderByStepOrderAsc(
                lpo.getTenantId(), lpo.getId(), "LPO");

        if (history.isEmpty()) {
            lpo.setApprovalStatus(ApprovalStatus.REJECTED);
            return;
        }

        ApprovalHistory currentStep = history.stream()
                .filter(h -> h.getStatus() == StepStatus.PENDING)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "No pending approval steps found. This document might already be approved or rejected."));

        // Validate Role
        if (!userRoles.contains(currentStep.getRoleCode()) && !userRoles.contains("ADMIN")) {
            throw new IllegalStateException("User does not have required role: " + currentStep.getRoleCode());
        }

        currentStep.setStatus(StepStatus.REJECTED);
        currentStep.setApprovedBy(username);
        currentStep.setApprovedAt(LocalDateTime.now());
        currentStep.setRemarks(remarks);
        historyRepository.save(currentStep);

        // Cancel subsequent steps
        List<ApprovalHistory> remainingSteps = history.stream()
                .filter(h -> h.getStepOrder() > currentStep.getStepOrder())
                .collect(Collectors.toList());

        for (ApprovalHistory step : remainingSteps) {
            step.setStatus(StepStatus.CANCELLED);
        }
        historyRepository.saveAll(remainingSteps);

        lpo.setApprovalStatus(ApprovalStatus.REJECTED);
    }

    @Transactional
    public void revertToDraft(Lpo lpo) {
        historyRepository.deleteAllByTenantIdAndDocumentIdAndModule(
                lpo.getTenantId(), lpo.getId(), "LPO");
        lpo.setApprovalStatus(ApprovalStatus.DRAFT);
        lpo.setApprovedBy(null);
        lpo.setApprovedAt(null);
    }

    @Transactional
    public void revertRejectedToPending(Lpo lpo) {
        List<ApprovalHistory> history = historyRepository.findAllByTenantIdAndDocumentIdAndModuleOrderByStepOrderAsc(
                lpo.getTenantId(), lpo.getId(), "LPO");

        for (ApprovalHistory h : history) {
            h.setStatus(StepStatus.PENDING);
            h.setApprovedBy(null);
            h.setApprovedAt(null);
            h.setRemarks(null);
        }
        historyRepository.saveAll(history);
        lpo.setApprovalStatus(ApprovalStatus.PENDING_APPROVAL);
    }
}
