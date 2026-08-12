package com.billbull.backend.pos.settings;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface PosSettingsRepository extends JpaRepository<PosSettings, Long> {
    Optional<PosSettings> findByBranchId(Long branchId);

    /**
     * Exclusive (row-level {@code FOR UPDATE}) read of a branch's settings, used only by
     * {@code PosSettingsService.save()} when it must decide whether the Business Day schedule
     * may change. Pairs with {@link #findByBranchIdForShare(Long)}, which
     * {@code PosSessionService.openSession()} takes on the same row: the two lock modes
     * conflict, so a session cannot be opened between this service reading "no active
     * sessions" and committing a new schedule.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from PosSettings s where s.branchId = :branchId")
    Optional<PosSettings> findByBranchIdForUpdate(@Param("branchId") Long branchId);

    /**
     * Shared (row-level {@code FOR SHARE}) read of a branch's settings — taken by session
     * opening so the schedule it resolves a Trading Date from cannot be rewritten underneath
     * it. Several sessions may open concurrently (shared locks do not conflict with each
     * other); only a schedule change is excluded. See {@link #findByBranchIdForUpdate(Long)}.
     */
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select s from PosSettings s where s.branchId = :branchId")
    Optional<PosSettings> findByBranchIdForShare(@Param("branchId") Long branchId);
}
