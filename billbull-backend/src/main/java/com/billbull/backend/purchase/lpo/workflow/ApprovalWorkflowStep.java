package com.billbull.backend.purchase.lpo.workflow;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "approval_workflow_steps", uniqueConstraints = {
        @UniqueConstraint(columnNames = { "tenantId", "module", "stepOrder" })
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApprovalWorkflowStep {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String tenantId;

    @Column(nullable = false)
    private String module; // e.g., "LPO"

    @Column(nullable = false)
    private Integer stepOrder;

    @Column(nullable = false)
    private String roleCode;

    @Column(nullable = false)
    private String displayName;

    @Builder.Default
    private Boolean isMandatory = true;

    @Builder.Default
    private Boolean activeFlag = true;

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
