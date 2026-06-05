package com.billbull.backend.config;

import com.billbull.backend.financials.generalledger.GlAccountBalanceRepository;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Nightly job that checks whether the pre-aggregated {@code gl_account_balances} table
 * has drifted from the live sum of {@code journal_lines} (PDF §20 / Phase 8.1).
 *
 * If drift is detected, an alert is logged (WARN level). In production, wire this log
 * line to an alerting channel (PagerDuty, Slack webhook, etc.).
 *
 * A full rebuild can be triggered manually via:
 *   POST /api/admin/gl-balance/rebuild
 * (not implemented yet — deferred to Phase 9 operations tooling)
 */
@Component
@Slf4j
public class GlBalanceRebuildJob {

    private final GlAccountBalanceRepository glBalanceRepo;

    public GlBalanceRebuildJob(GlAccountBalanceRepository glBalanceRepo) {
        this.glBalanceRepo = glBalanceRepo;
    }

    /** Runs every night at 02:00 server time. */
    @Scheduled(cron = "0 0 2 * * *")
    @Transactional(readOnly = true)
    public void checkDrift() {
        List<String> drifted = glBalanceRepo.findDriftedAccountCodes();
        if (drifted.isEmpty()) {
            log.info("[GlBalanceRebuildJob] No drift detected — gl_account_balances is in sync.");
        } else {
            log.warn("[GlBalanceRebuildJob] DRIFT DETECTED for {} account(s): {}. " +
                     "Run POST /api/admin/gl-balance/rebuild to correct.",
                     drifted.size(), drifted);
        }
    }
}
