package com.billbull.backend.financials.receiptvoucher;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface ReceiptVoucherRepository extends JpaRepository<ReceiptVoucher, Long> {
    List<ReceiptVoucher> findAllByOrderByDateDesc();
    List<ReceiptVoucher> findBySalesInvoiceId(Long salesInvoiceId);
    List<ReceiptVoucher> findByOpeningInvoiceId(Long openingInvoiceId);
    List<ReceiptVoucher> findBySalesOrderIdOrderByDateDesc(Long salesOrderId);

    /**
     * Sum of completed receipts for a customer before a given date, excluding
     * unapplied customer advances (ADVANCE_RECEIVED with no salesInvoiceId link)
     * which are a separate liability until applied and must not reduce AR here.
     * Used by StatementService to compute the opening-balance credit offset.
     */
    @Query("SELECT COALESCE(SUM(rv.amount), 0) FROM ReceiptVoucher rv " +
           "WHERE rv.customerCode = :customerCode AND rv.date < :startDate " +
           "AND LOWER(rv.status) = 'completed' " +
           "AND (rv.purpose <> com.billbull.backend.financials.receiptvoucher.ReceiptPurpose.ADVANCE_RECEIVED " +
           "     OR rv.salesInvoiceId IS NOT NULL)")
    BigDecimal sumCompletedAmountBeforeDate(
            @Param("customerCode") String customerCode,
            @Param("startDate") LocalDate startDate);

    /**
     * Statement entries (credit lines) for a customer within a date range.
     * Used by StatementService to build the SoA.
     */
    @Query("SELECT new com.billbull.backend.financials.statement.StatementEntryDTO(" +
           "rv.date, rv.voucherId, 'PAYMENT_RECEIVED', " +
           "CAST(0 AS java.math.BigDecimal), rv.amount, rv.status) " +
           "FROM ReceiptVoucher rv " +
           "WHERE rv.customerCode = :customerCode " +
           "AND rv.date BETWEEN :startDate AND :endDate " +
           "AND LOWER(rv.status) = 'completed'")
    List<com.billbull.backend.financials.statement.StatementEntryDTO> findStatementEntriesByCustomerCode(
            @Param("customerCode") String customerCode,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    /** Returns all receipts whose customer_code is still null — used by the backfill at startup. */
    @Query("SELECT rv FROM ReceiptVoucher rv WHERE rv.customerCode IS NULL")
    List<ReceiptVoucher> findWithoutCustomerCode();

    /** QA-018: batch lookup used by StatementService to populate description/reference. */
    List<ReceiptVoucher> findByVoucherIdIn(List<String> voucherIds);

    /**
     * Bulk receipts per customer: returns [customerCode, totalReceiptAmount] for all
     * completed receipts. Used by CustomerService to compute currentBalance for the
     * customer list without N+1 per-customer queries.
     */
    @Query("SELECT rv.customerCode, COALESCE(SUM(rv.amount), 0) FROM ReceiptVoucher rv " +
           "WHERE LOWER(rv.status) = 'completed' AND rv.customerCode IS NOT NULL " +
           "GROUP BY rv.customerCode")
    List<Object[]> sumCompletedAmountByCustomerCode();

    /** All advance receipts for a customer (purpose = ADVANCE_RECEIVED). */
    List<ReceiptVoucher> findByCustomerCodeAndPurpose(String customerCode, ReceiptPurpose purpose);

    /**
     * Same as above, ordered oldest-first at the DB layer for FIFO advance
     * application (AdvanceApplicationService.findOpenAdvances /
     * SalesInvoiceService auto-apply).
     */
    List<ReceiptVoucher> findByCustomerCodeAndPurposeOrderByDateAsc(String customerCode, ReceiptPurpose purpose);

    /**
     * Highest voucher_id for a given year-prefix (e.g. "RV-2026-"). Used to derive
     * the next sequence safely — counting all rows can collide with existing keys
     * if records span multiple years or any rows have been deleted.
     */
    @Query("SELECT MAX(rv.voucherId) FROM ReceiptVoucher rv WHERE rv.voucherId LIKE CONCAT(:prefix, '%')")
    String findMaxVoucherIdByPrefix(@Param("prefix") String prefix);

    /**
     * Row-locked lookup for advance application. Held for the duration of the
     * enclosing transaction so two concurrent apply() calls against the same
     * advance receipt can't both read a stale open balance and over-apply it.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT rv FROM ReceiptVoucher rv WHERE rv.id = :id")
    Optional<ReceiptVoucher> findByIdForUpdate(@Param("id") Long id);

    /**
     * Distinct customer codes that have ever recorded a completed general
     * advance (purpose = ADVANCE_RECEIVED). Used by the one-off historical
     * backfill to find candidates worth checking for an open balance — the
     * actual open-balance filtering happens per-customer via
     * AdvanceApplicationService.findOpenAdvances.
     */
    @Query("SELECT DISTINCT rv.customerCode FROM ReceiptVoucher rv " +
           "WHERE rv.purpose = com.billbull.backend.financials.receiptvoucher.ReceiptPurpose.ADVANCE_RECEIVED " +
           "AND LOWER(rv.status) = 'completed' AND rv.customerCode IS NOT NULL")
    List<String> findDistinctCustomerCodesWithAdvances();
}
