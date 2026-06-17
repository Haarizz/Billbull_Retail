package com.billbull.backend.pos.session;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface PosSessionRepository extends JpaRepository<PosSession, Long> {

    Optional<PosSession> findByBranchIdAndTerminalIdAndStatus(Long branchId, String terminalId, PosSessionStatus status);

    Optional<PosSession> findByTerminalIdAndStatus(String terminalId, PosSessionStatus status);

    List<PosSession> findByBranchIdAndStatusOrderByOpenedAtDesc(Long branchId, PosSessionStatus status);

    List<PosSession> findByBranchIdAndSessionDateOrderByOpenedAtDesc(Long branchId, LocalDate sessionDate);

    @Query("SELECT s FROM PosSession s WHERE s.branchId = :branchId AND s.sessionDate = :date AND s.status = 'OPEN'")
    List<PosSession> findOpenSessionsByBranchAndDate(@Param("branchId") Long branchId, @Param("date") LocalDate date);

    boolean existsByBranchIdAndTerminalIdAndStatus(Long branchId, String terminalId, PosSessionStatus status);
}
