package com.billbull.backend.sales.voucher;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface CreditVoucherRepository extends JpaRepository<CreditVoucher, Long> {

    /** Case-insensitive lookup by redemption code — the key a scanner or keypad produces. */
    @Query("SELECT v FROM CreditVoucher v WHERE UPPER(v.voucherCode) = UPPER(:code)")
    Optional<CreditVoucher> findByVoucherCode(@Param("code") String code);

    /**
     * Resolves either the redemption code or the scanned barcode payload to a voucher, so the POS
     * lookup works identically whether the cashier scans the printed barcode or types the code.
     */
    @Query("SELECT v FROM CreditVoucher v WHERE UPPER(v.voucherCode) = UPPER(:token) "
            + "OR UPPER(v.barcodeValue) = UPPER(:token)")
    Optional<CreditVoucher> findByCodeOrBarcode(@Param("token") String token);

    Optional<CreditVoucher> findByVoucherNumber(String voucherNumber);

    /**
     * The idempotency key for issuance: one Sales Return can only ever have one voucher. A retried
     * confirmation finds the existing row here instead of minting a second voucher, and the unique
     * constraint on the column is the backstop if two requests race past this check.
     */
    Optional<CreditVoucher> findBySourceReturnNumber(String sourceReturnNumber);

    boolean existsByVoucherCode(String voucherCode);

    boolean existsByVoucherNumber(String voucherNumber);

    /**
     * Pessimistic-write lock on a single voucher, taken before its balance is read at redemption.
     *
     * <p>This is what prevents double-spending. Without it, two terminals can each read
     * "remaining = 100" and both redeem 100, spending 200 of a 100 voucher. Whichever transaction
     * takes the lock second re-reads the already-decremented balance and is refused.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT v FROM CreditVoucher v WHERE v.id = :id")
    Optional<CreditVoucher> findByIdForUpdate(@Param("id") Long id);

    /** Highest sequence issued for a voucher-number prefix, for the next number in series. */
    @Query("SELECT v.voucherNumber FROM CreditVoucher v WHERE v.voucherNumber LIKE CONCAT(:prefix, '%') "
            + "ORDER BY v.voucherNumber DESC")
    List<String> findNumbersByPrefixDesc(@Param("prefix") String prefix);

    List<CreditVoucher> findByCustomerCodeOrderByIdDesc(String customerCode);

    /**
     * Vouchers whose expiry has passed but whose status has not caught up. Drives the sweep that
     * keeps reporting honest; redemption never depends on it having run.
     */
    @Query("SELECT v FROM CreditVoucher v WHERE v.expiryDate IS NOT NULL AND v.expiryDate < :asOf "
            + "AND v.status IN (com.billbull.backend.sales.voucher.CreditVoucherStatus.ACTIVE, "
            + "com.billbull.backend.sales.voucher.CreditVoucherStatus.PARTIALLY_REDEEMED)")
    List<CreditVoucher> findLapsedNeedingStatusSweep(@Param("asOf") LocalDate asOf);

    /** Outstanding voucher liability for a branch — reconciles against GL account 2061. */
    @Query("SELECT COALESCE(SUM(v.remainingAmount), 0) FROM CreditVoucher v "
            + "WHERE (:branchId IS NULL OR v.branch.id = :branchId) "
            + "AND v.status IN (com.billbull.backend.sales.voucher.CreditVoucherStatus.ACTIVE, "
            + "com.billbull.backend.sales.voucher.CreditVoucherStatus.PARTIALLY_REDEEMED)")
    java.math.BigDecimal sumOutstandingLiability(@Param("branchId") Long branchId);
}
