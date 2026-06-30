package com.billbull.backend.pos.dayclose;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;

@Repository
public interface PosDayCloseRepository extends JpaRepository<PosDayClose, Long> {

    Optional<PosDayClose> findByBranchIdAndCloseDate(Long branchId, LocalDate closeDate);

    boolean existsByBranchIdAndCloseDate(Long branchId, LocalDate closeDate);
}
