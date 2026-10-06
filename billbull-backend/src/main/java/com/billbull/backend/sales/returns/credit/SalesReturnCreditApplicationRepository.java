package com.billbull.backend.sales.returns.credit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

/**
 * Reads over the return-credit allocation ledger.
 *
 * <p>Every query here filters to {@code APPLIED}, because that is the only status that carries a
 * balance effect (see {@link SalesReturnCreditApplicationStatus}). Callers that want the raw
 * history use {@link #findByReturnNumber}.
 */
public interface SalesReturnCreditApplicationRepository
        extends JpaRepository<SalesReturnCreditApplication, Long> {

    /**
     * Credit applied to one invoice — the third term in the canonical invoice-balance recompute.
     *
     * <p>Keyed on invoice number rather than id to match {@code advance_applications}, which the
     * same recompute already reads the same way.
     */
    @Query("SELECT COALESCE(SUM(a.appliedAmount), 0) FROM SalesReturnCreditApplication a "
            + "WHERE a.invoiceNumber = :invoiceNumber "
            + "AND a.status = com.billbull.backend.sales.returns.credit"
            + ".SalesReturnCreditApplicationStatus.APPLIED")
    BigDecimal sumAppliedByInvoiceNumber(@Param("invoiceNumber") String invoiceNumber);

    /**
     * Credit this one return has already allocated, read inside the approval lock so a retried
     * approval cannot allocate twice. Complements the unique index, which is the hard guard.
     */
    @Query("SELECT COALESCE(SUM(a.appliedAmount), 0) FROM SalesReturnCreditApplication a "
            + "WHERE a.returnNumber = :returnNumber "
            + "AND a.status = com.billbull.backend.sales.returns.credit"
            + ".SalesReturnCreditApplicationStatus.APPLIED")
    BigDecimal sumAppliedByReturnNumber(@Param("returnNumber") String returnNumber);

    /**
     * Credit applied across a set of invoices, in one query.
     *
     * <p>Read by the POS Day Close sales reconciliation: credit applied to an invoice that was
     * sold inside the closing range settles that invoice without ever producing tender, so the
     * sales identity has to add it back or the whole allocation reads as a variance.
     */
    @Query("SELECT COALESCE(SUM(a.appliedAmount), 0) FROM SalesReturnCreditApplication a "
            + "WHERE a.invoiceNumber IN :invoiceNumbers "
            + "AND a.status = com.billbull.backend.sales.returns.credit"
            + ".SalesReturnCreditApplicationStatus.APPLIED")
    BigDecimal sumAppliedByInvoiceNumbers(@Param("invoiceNumbers") Collection<String> invoiceNumbers);

    List<SalesReturnCreditApplication> findByReturnNumber(String returnNumber);

    boolean existsByReturnNumberAndInvoiceNumberAndStatus(
            String returnNumber, String invoiceNumber, SalesReturnCreditApplicationStatus status);

    /**
     * Allocations for one customer dated before a statement period — the brought-forward term
     * that replaces the old {@code sumLedgerCreditBeforeDate} classification over
     * {@code refund_method}. This sums credit that was <em>actually applied</em>, which is both
     * narrower and exactly right.
     */
    @Query("SELECT COALESCE(SUM(a.appliedAmount), 0) FROM SalesReturnCreditApplication a "
            + "WHERE a.customerCode = :customerCode AND a.appliedDate < :startDate "
            + "AND a.status = com.billbull.backend.sales.returns.credit"
            + ".SalesReturnCreditApplicationStatus.APPLIED")
    BigDecimal sumAppliedBeforeDate(@Param("customerCode") String customerCode,
                                    @Param("startDate") LocalDate startDate);
}
