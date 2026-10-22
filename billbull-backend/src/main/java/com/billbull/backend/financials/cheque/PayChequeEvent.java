package com.billbull.backend.financials.cheque;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Append-only activity entry for a cheque's timeline. */
@Entity
@Table(name = "pay_cheque_events")
@Data
@NoArgsConstructor
public class PayChequeEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pay_cheque_id", nullable = false)
    private Long payChequeId;

    @Column(nullable = false, length = 50)
    private String action;

    @Column(length = 500)
    private String note;

    private String username;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
