package com.billbull.backend.purchase.lpo.workflow;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "approval_history")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApprovalHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String tenantId;

    @Column(nullable = false)
    private Long documentId; // e.g., LPO ID

    @Column(nullable = false)
    private String module; // e.g., "LPO"

    @Column(nullable = false)
    private Integer stepOrder;

    @Column(nullable = false)
    private String roleCode;

    @Column(nullable = false)
    private String displayName;

    private String approvedBy;
    private LocalDateTime approvedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StepStatus status; // PENDING, APPROVED, REJECTED, CANCELLED

    private String remarks;

    @CreationTimestamp
    private LocalDateTime createdAt;
}
