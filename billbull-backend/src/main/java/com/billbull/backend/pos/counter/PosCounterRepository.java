package com.billbull.backend.pos.counter;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PosCounterRepository extends JpaRepository<PosCounter, Long> {

    List<PosCounter> findByBranchIdOrderByDisplayOrderAscCounterNameAsc(Long branchId);

    List<PosCounter> findByBranchIdAndStatusOrderByDisplayOrderAsc(Long branchId, PosCounterStatus status);

    Optional<PosCounter> findByBranchIdAndCounterCode(Long branchId, String counterCode);

    boolean existsByBranchIdAndCounterCode(Long branchId, String counterCode);

    boolean existsByBranchIdAndCounterNameIgnoreCase(Long branchId, String counterName);

    @Query("SELECT COUNT(c) FROM PosCounter c WHERE c.branchId = :branchId AND c.status = 'ACTIVE'")
    long countActiveByBranchId(@Param("branchId") Long branchId);

    @Query("SELECT MAX(c.counterCode) FROM PosCounter c WHERE c.branchId = :branchId AND c.counterCode LIKE 'CTR-%'")
    String findMaxCounterCodeByBranchId(@Param("branchId") Long branchId);
}
