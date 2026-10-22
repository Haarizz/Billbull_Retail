package com.billbull.backend.financials.cheque;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/**
 * A bank account the company writes cheques on: the GL bank account it credits, the details
 * printed on the cheque, the next leaf number and the cheque print template to use.
 */
@Entity
@Table(name = "cheque_books")
@Data
@EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
public class ChequeBook extends BaseEntity {

    /** GL account (chart of accounts id) this book's cheques are drawn on. */
    @Column(name = "gl_account_id", length = 64)
    private String glAccountId;

    @Column(name = "gl_account_code", length = 50)
    private String glAccountCode;

    @Column(name = "gl_account_name")
    private String glAccountName;

    @Column(name = "bank_name", nullable = false, length = 150)
    private String bankName;

    @Column(name = "bank_branch", length = 150)
    private String bankBranch;

    @Column(name = "account_name")
    private String accountName;

    @Column(name = "account_number", length = 64)
    private String accountNumber;

    @Column(length = 64)
    private String iban;

    @Column(nullable = false, length = 10)
    private String currency = "AED";

    /** Next leaf number, kept as text so leading zeros survive ("000147"). */
    @Column(name = "next_cheque_number", nullable = false, length = 30)
    private String nextChequeNumber;

    /** Print template (category "Cheque") for this book; null = the default Cheque template. */
    @Column(name = "template_id")
    private Long templateId;
}
