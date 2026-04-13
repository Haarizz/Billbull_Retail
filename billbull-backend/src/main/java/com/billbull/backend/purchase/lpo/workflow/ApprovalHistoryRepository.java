package com.billbull.backend.purchase.lpo.workflow;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface ApprovalHistoryRepository extends JpaRepository<ApprovalHistory, Long> {
    List<ApprovalHistory> findAllByTenantIdAndDocumentIdAndModuleOrderByStepOrderAsc(String tenantId, Long documentId,
            String module);

    void deleteAllByTenantIdAndDocumentIdAndModule(String tenantId, Long documentId, String module);
}
