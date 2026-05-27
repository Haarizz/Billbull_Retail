package com.billbull.backend.financials.expense;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "expenses")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Expense {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private LocalDate date;
    private String vendor;
    private String category;
    private String costCenter;
    private String location;
    private String glAccountId;
    private Double amount;
    private Double taxRate;
    private Double taxAmount;
    private Double total;
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
}
