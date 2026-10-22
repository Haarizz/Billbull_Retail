package com.billbull.backend.financials.cheque;

import java.math.BigDecimal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One payment a cheque settles. While {@code active}, the source is off the payee's cheque due;
 * a partial unique index (V119) keeps a source on at most one live cheque.
 */
@Entity
@Table(name = "pay_cheque_allocations")
@Data
@NoArgsConstructor
public class PayChequeAllocation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pay_cheque_id", nullable = false)
    private Long payChequeId;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_type", nullable = false, length = 30)
    private PayChequeSourceType sourceType;

    @Column(name = "source_id", nullable = false)
    private Long sourceId;

    /** Display number of the source (payment voucher number, or EXP-{id}). */
    @Column(name = "source_number", length = 100)
    private String sourceNumber;

    /** What the source paid: purchase invoice number, expense category, etc. */
    @Column(length = 255)
    private String reference;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    /**
     * True when the cheque owns this payment's ledger movement (a CHEQUE_PENDING voucher, or an
     * expense whose credit went to 2150). False for payments that already credited the bank
     * when they were booked (vouchers posted before V120), which the cheque must not post again.
     */
    @Column(name = "posts_gl", nullable = false)
    private boolean postsGl;
}
