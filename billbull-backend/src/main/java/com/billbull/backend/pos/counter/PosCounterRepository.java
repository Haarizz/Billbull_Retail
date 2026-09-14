package com.billbull.backend.pos.counter;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PosCounterRepository extends JpaRepository<PosCounter, Long> {

    // Reads exclude soft-deleted rows (delete() clears isActive); the counter-code
    // queries below deliberately do not, so a deleted code is never handed out again.
    List<PosCounter> findByBranchIdAndIsActiveTrueOrderByDisplayOrderAscCounterNameAsc(Long branchId);

    List<PosCounter> findByBranchIdAndStatusAndIsActiveTrueOrderByDisplayOrderAsc(Long branchId, PosCounterStatus status);

    Optional<PosCounter> findByBranchIdAndCounterCode(Long branchId, String counterCode);

    boolean existsByBranchIdAndCounterCode(Long branchId, String counterCode);

    long countByBranchId(Long branchId);

    boolean existsByBranchIdAndCounterNameIgnoreCase(Long branchId, String counterName);

    @Query("SELECT COUNT(c) FROM PosCounter c WHERE c.branchId = :branchId AND c.status = 'ACTIVE'")
    long countActiveByBranchId(@Param("branchId") Long branchId);

    @Query("SELECT MAX(c.counterCode) FROM PosCounter c WHERE c.branchId = :branchId AND c.counterCode LIKE 'CTR-%'")
    String findMaxCounterCodeByBranchId(@Param("branchId") Long branchId);
}
