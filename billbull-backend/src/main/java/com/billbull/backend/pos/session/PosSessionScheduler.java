package com.billbull.backend.pos.session;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.billbull.backend.pos.checkout.attempt.PosCheckoutAttempt;
import com.billbull.backend.pos.checkout.attempt.PosCheckoutAttemptService;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Detects OPEN sessions that have exceeded their idle timeout or hard wall-clock limit
 * and suspends them automatically. Runs every 60 seconds.
 *
 * <h3>Phase 0 / M2</h3>
 * Each candidate is suspended in its own short transaction that first locks the session row with
 * {@code FOR UPDATE SKIP LOCKED}, then re-checks it under that lock: still OPEN, still past its
 * limit, and holding no ACTIVE or STALLED checkout attempt. A session that is locked right now (a
 * checkout claim, a close, a settlement) is skipped this minute rather than waited for, and one
 * with a checkout in flight is left OPEN; both are reconsidered on the next run. One session's
 * failure no longer rolls back the suspension of the others.
 */
@Component
public class PosSessionScheduler {

    private static final Logger log = LoggerFactory.getLogger(PosSessionScheduler.class);

    private final PosSessionRepository repo;
    /** openedAt/lastActivityAt are stamped from the Business Day clock, so the cutoffs
     *  compared against them must come from the same clock. Reading LocalDateTime.now()
     *  here on a UTC host against Asia/Kolkata timestamps skewed every cutoff by the zone
     *  offset — suspending fresh sessions or never suspending idle ones. */
    private final com.billbull.backend.pos.businessdate.BusinessDayClock clock;
    private final PosCheckoutAttemptService attemptService;
    private final TransactionTemplate tx;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;

    public PosSessionScheduler(PosSessionRepository repo,
                               com.billbull.backend.pos.businessdate.BusinessDayClock clock,
                               PosCheckoutAttemptService attemptService,
                               PlatformTransactionManager transactionManager,
                               org.springframework.jdbc.core.JdbcTemplate jdbc) {
        this.repo = repo;
        this.clock = clock;
        this.attemptService = attemptService;
        this.tx = new TransactionTemplate(transactionManager);
        this.jdbc = jdbc;
    }

    /** M3 offline lease register. Field-injected so the constructor (and its tests) are unchanged. */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.billbull.backend.pos.offline.PosOfflineLeaseBarrier offlineLeaseBarrier;

    /** What happened to one candidate. */
    public enum Outcome { SUSPENDED, SKIPPED_LOCKED, SKIPPED_NOT_DUE, SKIPPED_CHECKOUT_IN_PROGRESS, SKIPPED_OFFLINE_LEASE }

    @Scheduled(fixedRate = 60_000)
    public void suspendIdleSessions() {
        LocalDateTime now = clock.now();
        // Candidates are read without locks; each is re-checked under its own lock below.
        Set<Long> candidates = new LinkedHashSet<>();
        repo.findTimedOutSessions(now).forEach(s -> candidates.add(s.getId()));
        // Idle timeout: we query conservatively with the smallest plausible idle window (1 min);
        // each session carries its own idleTimeoutMinutes snapshot, so it is re-checked inline.
        repo.findIdleSessionsBefore(now.minusMinutes(1)).forEach(s -> candidates.add(s.getId()));
        for (Long id : candidates) {
            try {
                suspendIfDue(id);
            } catch (RuntimeException ex) {
                log.error("Scheduled suspension of POS session {} failed: {}", id, ex.getMessage(), ex);
            }
        }
    }

    /** Suspends one session if, under its row lock, it is still due and holds no checkout. */
    public Outcome suspendIfDue(Long sessionId) {
        return tx.execute(status -> {
            List<Long> locked = jdbc.queryForList(
                    "SELECT id FROM pos_sessions WHERE id = ? FOR UPDATE SKIP LOCKED", Long.class, sessionId);
            if (locked.isEmpty()) {
                log.debug("Session {} is locked by another operation — not suspending it this run", sessionId);
                return Outcome.SKIPPED_LOCKED;
            }
            // First load in this transaction, after the lock: the row as it is now.
            PosSession s = repo.findById(sessionId).orElse(null);
            LocalDateTime now = clock.now();
            String reason = s == null ? null : dueReason(s, now);
            if (reason == null) return Outcome.SKIPPED_NOT_DUE;
            List<PosCheckoutAttempt> blocking = attemptService.blockingAttemptsAfterRecovery(sessionId);
            if (!blocking.isEmpty()) {
                log.info("Session {} is due for suspension ({}) but holds {} checkout attempt(s) {} — left OPEN",
                        sessionId, reason, blocking.size(), blocking.stream().map(a -> a.id() + "/" + a.state()).toList());
                return Outcome.SKIPPED_CHECKOUT_IN_PROGRESS;
            }
            // M3: a till selling offline cannot report activity; never suspend its session under it.
            if (offlineLeaseBarrier != null && offlineLeaseBarrier.hasOutstandingLease(sessionId)) {
                log.info("Session {} is due for suspension ({}) but holds an offline lease — left OPEN", sessionId, reason);
                return Outcome.SKIPPED_OFFLINE_LEASE;
            }
            log.info("Session {} {} — suspending", sessionId, reason);
            s.setStatus(PosSessionStatus.SUSPENDED);
            repo.save(s);
            return Outcome.SUSPENDED;
        });
    }

    /** Why the session should be suspended now, or null when it should not. */
    private static String dueReason(PosSession s, LocalDateTime now) {
        if (s.getStatus() != PosSessionStatus.OPEN) return null;
        if (s.getSessionTimeoutAt() != null && s.getSessionTimeoutAt().isBefore(now)) {
            return "timed out (wall-clock limit)";
        }
        if (s.getIdleTimeoutMinutes() == null || s.getIdleTimeoutMinutes() <= 0) return null;
        LocalDateTime idleCutoff = now.minusMinutes(s.getIdleTimeoutMinutes());
        LocalDateTime lastActivity = s.getLastActivityAt() != null ? s.getLastActivityAt() : s.getOpenedAt();
        if (lastActivity != null && lastActivity.isBefore(idleCutoff)) {
            return "idle for >" + s.getIdleTimeoutMinutes() + " min";
        }
        return null;
    }
}
