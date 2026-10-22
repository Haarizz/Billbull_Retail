package com.billbull.backend.financials.cheque;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.settings.branch.Branch;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/**
 * An outgoing cheque. The amount is always the sum of its live allocations; the cheque posts
 * nothing to the GL itself (see V119__pay_cheques.sql for why).
 */
@Entity
@Table(name = "pay_cheques", indexes = {
    @Index(name = "idx_pay_cheque_status", columnList = "status"),
    @Index(name = "idx_pay_cheque_branch", columnList = "branch_id")
})
@Data
@EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
public class PayCheque extends BaseEntity {

    @Column(name = "cheque_number", nullable = false, length = 30)
    private String chequeNumber;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "cheque_book_id", nullable = false)
    private ChequeBook chequeBook;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id")
    private Branch branch;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_type", nullable = false, length = 20)
    private PayChequeType paymentType;

    @Column(name = "payee_name", nullable = false)
    private String payeeName;

    /** Vendor code for VENDOR cheques; null for expense payees, which are free text. */
    @Column(name = "vendor_id", length = 100)
    private String vendorId;

    @Column(name = "cheque_date", nullable = false)
    private LocalDate chequeDate;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    @Column(length = 500)
    private String memo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PayChequeStatus status = PayChequeStatus.DRAFT;

    @Column(name = "approved_by")
    private String approvedBy;
    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Column(name = "printed_by")
    private String printedBy;
    @Column(name = "printed_at")
    private LocalDateTime printedAt;
    @Column(name = "print_count", nullable = false)
    private int printCount;

    @Column(name = "issued_by")
    private String issuedBy;
    @Column(name = "issued_at")
    private LocalDateTime issuedAt;

    @Column(name = "paid_by")
    private String paidBy;
    @Column(name = "paid_date")
    private LocalDate paidDate;

    @Column(name = "reconciled_by")
    private String reconciledBy;
    @Column(name = "reconciled_date")
    private LocalDate reconciledDate;

    @Column(name = "cancelled_by")
    private String cancelledBy;
    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;
    @Column(name = "cancel_reason", length = 500)
    private String cancelReason;
}
