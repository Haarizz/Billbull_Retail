package com.billbull.backend.purchase.rfq;

import java.time.LocalDateTime;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** Append-only timeline entry for an RFQ. */
@Entity
@Table(name = "purchase_rfq_activity")
@Getter
@Setter
public class RfqActivity extends BaseEntity {

    @Column(name = "rfq_id", nullable = false)
    private Long rfqId;

    @Column(nullable = false, length = 40)
    private String type;

    @Column(columnDefinition = "TEXT")
    private String description;

    private String actor;

    /** user | vendor | system */
    @Column(name = "actor_type", length = 20)
    private String actorType;

    @Column(name = "occurred_at", nullable = false)
    private LocalDateTime occurredAt;

    @Column(length = 120)
    private String ref;

    @Column(name = "old_value")
    private String oldValue;

    @Column(name = "new_value")
    private String newValue;
}
