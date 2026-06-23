package com.billbull.backend.financials.expensevoucher;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.settings.branch.Branch;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "expense_vouchers", indexes = {
    @Index(name = "idx_ev_branch",  columnList = "branch_id"),
    @Index(name = "idx_ev_date",    columnList = "date"),
    @Index(name = "idx_ev_status",  columnList = "status"),
    @Index(name = "idx_ev_number",  columnList = "voucher_number")
})
@Data
@EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
public class ExpenseVoucher extends BaseEntity {

    @Column(name = "voucher_number", unique = true, length = 50)
    private String voucherNumber;

    private LocalDate date;

    /** Vendor / payee name (free text; not a FK so no vendor master is required) */
    private String vendor;

    /** Optional reference to a vendor entity id */
    private Long vendorId;

    /** Cash | Card | Credit | Bank Transfer | Online Payment | Cheque */
    @Column(name = "payment_mode", length = 40)
    private String paymentMode;

    /** GL account id (string UUID) of the cash/bank ledger funding the voucher */
    @Column(name = "payment_account_id")
    private String paymentAccountId;

    // ARCHFIX §1.6: LAZY (was EAGER). Read/serialize paths JOIN FETCH branch+lines in-session.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id")
    private Branch branch;

    @Column(columnDefinition = "TEXT")
    private String narration;

    /** Draft | Submitted | Paid | Cancelled */
    @Column(length = 20)
    private String status = "Draft";

    @Column(precision = 15, scale = 2)
    private BigDecimal subTotal = BigDecimal.ZERO;

    @Column(name = "total_tax", precision = 15, scale = 2)
    private BigDecimal totalTax = BigDecimal.ZERO;

    @Column(name = "grand_total", precision = 15, scale = 2)
    private BigDecimal grandTotal = BigDecimal.ZERO;

    // ARCHFIX §1.6: LAZY (was EAGER) + @BatchSize for efficient list loads. JOIN FETCH on read paths.
    @OneToMany(mappedBy = "voucher", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @org.hibernate.annotations.BatchSize(size = 50)
    private List<ExpenseVoucherLine> lines = new ArrayList<>();

    public void addLine(ExpenseVoucherLine line) {
        lines.add(line);
        line.setVoucher(this);
    }

    public void recalcTotals() {
        subTotal = lines.stream()
            .map(l -> l.getAmount() != null ? l.getAmount() : BigDecimal.ZERO)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        totalTax = lines.stream()
            .map(l -> l.getTaxAmount() != null ? l.getTaxAmount() : BigDecimal.ZERO)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        grandTotal = subTotal.add(totalTax);
    }
}
