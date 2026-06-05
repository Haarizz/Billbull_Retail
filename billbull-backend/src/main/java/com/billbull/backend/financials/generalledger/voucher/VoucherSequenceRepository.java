package com.billbull.backend.financials.generalledger.voucher;

import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface VoucherSequenceRepository extends JpaRepository<VoucherSequence, Long> {

    /**
     * Row-locked fetch ({@code SELECT ... FOR UPDATE}) of the counter for a
     * triple. The lock is held for the duration of the surrounding transaction,
     * serializing concurrent increments against the same sequence.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT v FROM VoucherSequence v WHERE v.transactionType = :type "
            + "AND v.branchCode = :branchCode AND v.fiscalYear = :fiscalYear")
    Optional<VoucherSequence> findForUpdate(@Param("type") String type,
            @Param("branchCode") String branchCode,
            @Param("fiscalYear") int fiscalYear);
}
