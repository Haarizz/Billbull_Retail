package com.billbull.backend.pos.printjob;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

public interface PosPrintJobRepository extends JpaRepository<PosPrintJob, Long> {

    List<PosPrintJob> findByStatusAndBranchIdAndTerminalIdOrderByPriorityAscCreatedAtAsc(
            PrintJobStatus status, Long branchId, String terminalId);

    List<PosPrintJob> findByStatusAndBranchIdOrderByPriorityAscCreatedAtAsc(PrintJobStatus status, Long branchId);

    List<PosPrintJob> findByStatusOrderByPriorityAscCreatedAtAsc(PrintJobStatus status);

    /** Phase F dashboard — jobs still in flight (QUEUED or DISPATCHED) for a branch. */
    List<PosPrintJob> findByBranchIdAndStatusIn(Long branchId, Collection<PrintJobStatus> statuses);

    /** Phase F dashboard — completed jobs, for average-print-duration computation. */
    List<PosPrintJob> findByBranchIdAndStatus(Long branchId, PrintJobStatus status);

    /**
     * Atomic claim: a single guarded UPDATE, not a read-then-write, so two concurrent callers
     * can never both transition the same job QUEUED -> DISPATCHED (Phase B.5 hardening — see
     * docs/pos-device-architecture-specification-v2-2026-06-30.md §7 and the Phase B review's
     * "duplicate prevention" finding). Returns the number of rows updated: 1 if this caller won
     * the claim, 0 if the job was already claimed (or otherwise not QUEUED) by someone else.
     */
    @Modifying
    @Query(value = """
            UPDATE pos_print_jobs
            SET status = 'DISPATCHED', dispatched_at = :now
            WHERE id = :id AND status = 'QUEUED'
            """, nativeQuery = true)
    int claimForDispatch(@Param("id") Long id, @Param("now") LocalDateTime now);

    /** Jobs claimed (DISPATCHED) longer ago than the configured timeout, with no result reported. */
    @Query(value = "SELECT * FROM pos_print_jobs WHERE status = 'DISPATCHED' AND dispatched_at < :cutoff",
            nativeQuery = true)
    List<PosPrintJob> findStaleDispatched(@Param("cutoff") LocalDateTime cutoff);

    /**
     * Atomic stale-job recovery: guarded the same way as {@link #claimForDispatch} so a result
     * that legitimately arrives concurrently with the sweep always wins — the sweep only takes
     * effect (returns 1) if the job is still DISPATCHED and still older than the cutoff at the
     * instant of the UPDATE, never overwriting a result that just landed.
     */
    @Modifying
    @Query(value = """
            UPDATE pos_print_jobs
            SET status = 'FAILED', completed_at = :now, last_error = :error, attempt_count = attempt_count + 1
            WHERE id = :id AND status = 'DISPATCHED' AND dispatched_at < :cutoff
            """, nativeQuery = true)
    int failStaleDispatch(@Param("id") Long id, @Param("now") LocalDateTime now,
                           @Param("error") String error, @Param("cutoff") LocalDateTime cutoff);

    /**
     * Jobs that have sat QUEUED past the expiry cutoff with nothing ever claiming them (e.g. the
     * browser created the job but its dispatch call failed). COALESCE(scheduled_for, created_at)
     * keeps deliberately future-scheduled jobs alive until their own time has also passed the
     * cutoff. Without this expiry, stale QUEUED rows would print unexpectedly the day a real
     * polling agent starts consuming the queue.
     */
    @Query(value = """
            SELECT * FROM pos_print_jobs
            WHERE status = 'QUEUED' AND COALESCE(scheduled_for, created_at) < :cutoff
            """, nativeQuery = true)
    List<PosPrintJob> findStaleQueued(@Param("cutoff") LocalDateTime cutoff);

    /**
     * Atomic queued-job expiry: guarded exactly like {@link #failStaleDispatch} — only takes
     * effect (returns 1) if the job is still QUEUED and still past the cutoff at the instant of
     * the UPDATE, so a dispatch claim landing concurrently always wins. attempt_count is left
     * untouched because no print attempt was ever made.
     */
    @Modifying
    @Query(value = """
            UPDATE pos_print_jobs
            SET status = 'FAILED', completed_at = :now, last_error = :error
            WHERE id = :id AND status = 'QUEUED' AND COALESCE(scheduled_for, created_at) < :cutoff
            """, nativeQuery = true)
    int expireStaleQueued(@Param("id") Long id, @Param("now") LocalDateTime now,
                           @Param("error") String error, @Param("cutoff") LocalDateTime cutoff);
}
