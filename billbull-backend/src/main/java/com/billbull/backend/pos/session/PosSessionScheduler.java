package com.billbull.backend.pos.session;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Detects OPEN sessions that have exceeded their idle timeout or hard wall-clock limit
 * and suspends them automatically. Runs every 60 seconds.
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

    public PosSessionScheduler(PosSessionRepository repo,
                               com.billbull.backend.pos.businessdate.BusinessDayClock clock) {
        this.repo = repo;
        this.clock = clock;
    }

    @Scheduled(fixedRate = 60_000)
    @Transactional
    public void suspendIdleSessions() {
        LocalDateTime now = clock.now();

        // Hard wall-clock limit exceeded → suspend
        List<PosSession> timedOut = repo.findTimedOutSessions(now);
        for (PosSession s : timedOut) {
            log.info("Session {} timed out (wall-clock limit) — suspending", s.getId());
            s.setStatus(PosSessionStatus.SUSPENDED);
            repo.save(s);
        }

        // Idle timeout: find sessions where lastActivityAt is before (now - idleTimeoutMinutes)
        // We query conservatively with the smallest plausible idle window (1 min);
        // each session carries its own idleTimeoutMinutes snapshot, so we re-check inline.
        LocalDateTime conservativeCutoff = now.minusMinutes(1);
        List<PosSession> maybeIdle = repo.findIdleSessionsBefore(conservativeCutoff);
        for (PosSession s : maybeIdle) {
            if (s.getIdleTimeoutMinutes() == null || s.getIdleTimeoutMinutes() <= 0) continue;
            LocalDateTime idleCutoff = now.minusMinutes(s.getIdleTimeoutMinutes());
            LocalDateTime lastActivity = s.getLastActivityAt() != null ? s.getLastActivityAt() : s.getOpenedAt();
            if (lastActivity != null && lastActivity.isBefore(idleCutoff)) {
                log.info("Session {} idle for >{} min — suspending", s.getId(), s.getIdleTimeoutMinutes());
                s.setStatus(PosSessionStatus.SUSPENDED);
                repo.save(s);
            }
        }
    }
}
