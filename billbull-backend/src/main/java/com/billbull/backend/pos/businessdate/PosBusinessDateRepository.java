package com.billbull.backend.pos.businessdate;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PosBusinessDateRepository extends JpaRepository<PosBusinessDate, Long> {

    Optional<PosBusinessDate> findByBranchId(Long branchId);
}
