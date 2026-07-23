package com.billbull.backend.pos.layaway;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

/**
 * Daily sweep that releases stock reservations (batch allocations + non-batch
 * {@code PosStockReservation} rows) held by layaways/holds whose due date has passed
 * and were never cancelled or converted. {@link PosLayaway#getEffectiveStatus()}
 * already reports these as EXPIRED at read time without a persisted status change;
 * this job only drops the stock hold so it doesn't understate available stock
 * indefinitely. Idempotent — {@code releaseExpired} is a no-op once nothing RESERVED
 * remains for the layaway, so re-running the sweep on an already-released layaway
 * (still overdue and still open) does not create duplicate releases.
 */
@Component
public class PosLayawayExpiryReleaseJob {

    private static final Logger log = LoggerFactory.getLogger(PosLayawayExpiryReleaseJob.class);

    private final PosLayawayRepository repo;
    private final PosLayawayService service;

    public PosLayawayExpiryReleaseJob(PosLayawayRepository repo, PosLayawayService service) {
        this.repo = repo;
        this.service = service;
    }

    @Scheduled(cron = "0 30 2 * * *")
    @Transactional
    public void sweep() {
        List<PosLayaway> overdue = repo.findOverdueOpenLayaways(LocalDate.now());
        for (PosLayaway layaway : overdue) {
            service.releaseExpired(layaway.getId());
        }
        if (!overdue.isEmpty()) {
            log.info("[PosLayawayExpiryReleaseJob] Released stock holds for {} overdue open layaway(s).",
                    overdue.size());
        }
    }
}
