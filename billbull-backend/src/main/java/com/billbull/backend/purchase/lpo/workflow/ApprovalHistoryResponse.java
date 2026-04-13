package com.billbull.backend.purchase.lpo.workflow;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApprovalHistoryResponse {
    private Integer stepOrder;
    private String roleCode;
    private String displayName;
    private String approvedBy;
    private LocalDateTime approvedAt;
    private String status;
    private String remarks;
}
