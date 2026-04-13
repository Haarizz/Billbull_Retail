package com.billbull.backend.purchase.lpo.workflow;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface ApprovalWorkflowStepRepository extends JpaRepository<ApprovalWorkflowStep, Long> {
    List<ApprovalWorkflowStep> findAllByTenantIdAndModuleOrderByStepOrderAsc(String tenantId, String module);
}
