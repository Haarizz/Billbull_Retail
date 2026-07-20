package com.billbull.backend.financials.expense;

import java.math.BigDecimal;
import java.time.LocalDate;

import com.billbull.backend.settings.branch.Branch;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "expenses", indexes = {
    @Index(name = "idx_expense_branch", columnList = "branch_id")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@jakarta.persistence.EntityListeners(com.billbull.backend.common.ownership.OwnershipAuditListener.class)
@org.hibernate.annotations.Filter(name = "ownerFilter", condition = "created_by_user_id = :ownerId")
public class Expense  implements com.billbull.backend.common.ownership.OwnedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Stable owner id for ownership filtering; stamped on persist by OwnershipAuditListener. Nullable forever. */
    @jakarta.persistence.Column(name = "created_by_user_id", updatable = false)
    private Long createdByUserId;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "branch_id")
    private Branch branch;

    private LocalDate date;
    private String vendor;
    private String category;
    private String costCenter;
    private String location;
    private String glAccountId;
    @Column(precision = 15, scale = 2)
    private BigDecimal amount;
    private Double taxRate;
    @Column(precision = 15, scale = 2)
    private BigDecimal taxAmount;
    @Column(precision = 15, scale = 2)
    private BigDecimal total;
    private String status;

    /**
     * QA-054: how the expense was paid. One of: Cash, Card, Credit,
     * Bank Transfer, Online Payment. Drives the auto-pay ledger
     * preselection in the entry screen and the credit side of the
     * journal entry posted on Paid.
     */
    @Column(name = "payment_mode")
    private String paymentMode;

    /**
     * QA-054: GL account id (UUID) of the cash/bank/AP ledger that
     * funded this expense. When set, the posting engine uses this
     * account on the credit side instead of the default Bank account.
     */
    @Column(name = "payment_account_id")
    private String paymentAccountId;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Override
    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    @Override
    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }
}
