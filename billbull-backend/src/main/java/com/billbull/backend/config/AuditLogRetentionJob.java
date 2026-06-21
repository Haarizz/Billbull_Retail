package com.billbull.backend.config;

import com.billbull.backend.security.AuditLogRepository;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * Bounds the unbounded growth of {@code audit_logs} (ARCHFIX §1.12) by deleting rows older than a
 * configurable retention window.
 *
 * DISABLED BY DEFAULT: {@code audit.retention.months <= 0} means "keep forever" (the historical
 * behaviour) so enabling Flyway/this build on an existing deployment never silently purges audit
 * history. Set {@code audit.retention.months} to a positive value (e.g. 24) to activate retention.
 *
 * The delete is a single set-based statement (not entity-by-entity) so it stays cheap even on large
 * tables. Runs nightly at 03:30, after the GL drift check (02:00).
 *
 * NOTE on partitioning: the review also suggests monthly RANGE partitioning of audit_logs. That is
 * deliberately NOT done here — converting an existing populated table to partitioned requires a
 * full table rewrite (create partitioned + copy + swap), which is risky to run unattended across a
 * drifting tenant fleet. Retention bounds growth safely; partitioning is the at-scale follow-up,
 * to be applied as a planned maintenance migration on a per-tenant basis once volumes warrant it.
 */
@Component
@Slf4j
public class AuditLogRetentionJob {

    private final AuditLogRepository auditLogRepository;

    @Value("${audit.retention.months:0}")
    private int retentionMonths;

    public AuditLogRetentionJob(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    /** Runs nightly at 03:30 server time. No-op unless a positive retention window is configured. */
    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void purgeOldAuditLogs() {
        if (retentionMonths <= 0) {
            return; // retention disabled — keep forever
        }
        LocalDateTime cutoff = LocalDateTime.now().minusMonths(retentionMonths);
        int removed = auditLogRepository.deleteByAccessTimeBefore(cutoff);
        if (removed > 0) {
            log.info("[AuditLogRetentionJob] Purged {} audit_logs older than {} ({} month retention).",
                    removed, cutoff, retentionMonths);
        }
    }
}
