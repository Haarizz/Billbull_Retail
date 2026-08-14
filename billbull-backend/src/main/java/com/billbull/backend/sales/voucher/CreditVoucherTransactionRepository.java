package com.billbull.backend.sales.voucher;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Repository
public interface CreditVoucherTransactionRepository extends JpaRepository<CreditVoucherTransaction, Long> {

    /** A voucher's full history, oldest first — the ledger behind its balance. */
    List<CreditVoucherTransaction> findByVoucher_IdOrderByIdAsc(Long voucherId);

    /**
     * Redemptions already recorded against one sale. Backs the duplicate guard: a retried
     * checkout must not draw the voucher down twice for the same invoice.
     */
    List<CreditVoucherTransaction> findByReferenceTypeAndReferenceNumberAndTransactionType(
            String referenceType, String referenceNumber, CreditVoucherTransactionType transactionType);

    /** Voucher credit issued in a period — the "how much did we give out" reporting question. */
    @Query("SELECT COALESCE(SUM(t.amount), 0) FROM CreditVoucherTransaction t "
            + "WHERE t.transactionType = com.billbull.backend.sales.voucher.CreditVoucherTransactionType.ISSUED "
            + "AND (:branchId IS NULL OR t.branchId = :branchId) "
            + "AND t.businessDate BETWEEN :from AND :to")
    BigDecimal sumIssuedBetween(@Param("from") LocalDate from, @Param("to") LocalDate to,
                                @Param("branchId") Long branchId);

    /** Voucher credit redeemed in a period, for the same reporting surface. */
    @Query("SELECT COALESCE(SUM(t.amount), 0) FROM CreditVoucherTransaction t "
            + "WHERE t.transactionType = com.billbull.backend.sales.voucher.CreditVoucherTransactionType.REDEEMED "
            + "AND (:branchId IS NULL OR t.branchId = :branchId) "
            + "AND t.businessDate BETWEEN :from AND :to")
    BigDecimal sumRedeemedBetween(@Param("from") LocalDate from, @Param("to") LocalDate to,
                                  @Param("branchId") Long branchId);

    /** Redemptions on one POS session, for X/Z report voucher lines. */
    List<CreditVoucherTransaction> findByPosSessionIdAndTransactionType(
            Long posSessionId, CreditVoucherTransactionType transactionType);
}
