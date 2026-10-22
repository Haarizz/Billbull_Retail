package com.billbull.backend.financials.cheque;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.billbull.backend.financials.expense.Expense;
import com.billbull.backend.purchase.payment.PaymentVoucher;

@Repository
public interface PayChequeAllocationRepository extends JpaRepository<PayChequeAllocation, Long> {

    List<PayChequeAllocation> findByPayChequeIdIn(Collection<Long> payChequeIds);

    List<PayChequeAllocation> findByPayChequeIdAndActiveTrue(Long payChequeId);

    List<PayChequeAllocation> findBySourceTypeAndSourceIdInAndActiveTrue(
            PayChequeSourceType sourceType, Collection<Long> sourceIds);

    /**
     * A vendor's cheque due: CHEQUE-mode payment vouchers not yet on a live cheque. CHEQUE_PENDING
     * is the normal case (allotted in Pay Invoices, nothing posted yet); POSTED covers vouchers
     * approved before V120, which already credited the bank.
     */
    @Query("SELECT v FROM PaymentVoucher v LEFT JOIN FETCH v.branch b "
            + "WHERE v.paymentMode = com.billbull.backend.purchase.payment.PaymentMode.CHEQUE "
            + "AND v.status IN (com.billbull.backend.purchase.payment.PaymentStatus.CHEQUE_PENDING, "
            + "  com.billbull.backend.purchase.payment.PaymentStatus.POSTED) "
            + "AND (:allBranches = true OR b.id IN :branchIds) "
            + "AND NOT EXISTS (SELECT a.id FROM PayChequeAllocation a WHERE a.active = true "
            + "  AND a.sourceType = com.billbull.backend.financials.cheque.PayChequeSourceType.PAYMENT_VOUCHER "
            + "  AND a.sourceId = v.id) "
            + "ORDER BY v.paymentDate, v.id")
    List<PaymentVoucher> findPendingChequeVouchers(@Param("allBranches") boolean allBranches,
                                                   @Param("branchIds") Collection<Long> branchIds);

    /** Expense equivalent: Cheque-mode expenses marked Paid and not yet on a live cheque. */
    @Query("SELECT e FROM Expense e LEFT JOIN FETCH e.branch b "
            + "WHERE LOWER(e.paymentMode) = 'cheque' AND LOWER(e.status) = 'paid' "
            + "AND (:allBranches = true OR b.id IN :branchIds) "
            + "AND NOT EXISTS (SELECT a.id FROM PayChequeAllocation a WHERE a.active = true "
            + "  AND a.sourceType = com.billbull.backend.financials.cheque.PayChequeSourceType.EXPENSE "
            + "  AND a.sourceId = e.id) "
            + "ORDER BY e.date, e.id")
    List<Expense> findPendingChequeExpenses(@Param("allBranches") boolean allBranches,
                                            @Param("branchIds") Collection<Long> branchIds);
}
