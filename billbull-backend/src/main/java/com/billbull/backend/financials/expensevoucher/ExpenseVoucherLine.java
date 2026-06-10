package com.billbull.backend.financials.expensevoucher;

import java.math.BigDecimal;
import java.math.RoundingMode;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "expense_voucher_lines", indexes = {
    @Index(name = "idx_evl_voucher", columnList = "expense_voucher_id")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ExpenseVoucherLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "expense_voucher_id", nullable = false)
    @JsonIgnore
    private ExpenseVoucher voucher;

    /** GL account id of the expense ledger account */
    @Column(name = "gl_account_id")
    private String glAccountId;

    /** Denormalised for display without joins */
    @Column(name = "gl_account_name")
    private String glAccountName;

    @Column(columnDefinition = "TEXT")
    private String description;

    private String category;

    @Column(name = "cost_center")
    private String costCenter;

    @Column(precision = 15, scale = 2)
    private BigDecimal amount = BigDecimal.ZERO;

    @Column(name = "tax_rate", precision = 5, scale = 2)
    private BigDecimal taxRate = BigDecimal.ZERO;

    @Column(name = "tax_amount", precision = 15, scale = 2)
    private BigDecimal taxAmount = BigDecimal.ZERO;

    @Column(name = "line_total", precision = 15, scale = 2)
    private BigDecimal lineTotal = BigDecimal.ZERO;

    public void recalc() {
        if (amount == null) amount = BigDecimal.ZERO;
        if (taxRate == null) taxRate = BigDecimal.ZERO;
        taxAmount = amount.multiply(taxRate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        lineTotal = amount.add(taxAmount);
    }
}
