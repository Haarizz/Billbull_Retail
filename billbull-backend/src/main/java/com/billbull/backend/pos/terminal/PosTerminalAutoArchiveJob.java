package com.billbull.backend.pos.terminal;

import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Daily Terminal Auto-Archive sweep: moves terminals through
 * {@code ACTIVE/OFFLINE -> STALE -> ARCHIVED} based on each branch's configured inactivity
 * threshold, warning window, and the master enable switch — all in {@link PosSettings}, all OFF
 * by default.
 *
 * <p>This job only ever reads the cached {@link PosTerminal#getLastActivityAt()} column (maintained
 * incrementally by {@link PosTerminalActivityService} from every activity-producing POS flow) — it
 * never joins against session/sales-invoice tables, so the sweep stays O(terminals), not
 * O(terminals x transaction tables). Real-time STALE recovery (a terminal that resumes activity
 * automatically snaps back to ACTIVE/OFFLINE, no admin action needed) is handled separately by
 * {@link PosTerminalLifecycleService#recoverFromStale}, so this job never needs its own "un-stale"
 * pass — a terminal only remains a STALE/ARCHIVE candidate if {@code lastActivityAt} truly hasn't
 * advanced.</p>
 */
@Component
public class PosTerminalAutoArchiveJob {

    private static final Logger log = LoggerFactory.getLogger(PosTerminalAutoArchiveJob.class);

    private final BranchRepository branchRepo;
    private final PosSettingsRepository settingsRepo;
    private final PosTerminalRepository terminalRepo;
    private final PosTerminalLifecycleService lifecycleService;

    public PosTerminalAutoArchiveJob(BranchRepository branchRepo,
                                      PosSettingsRepository settingsRepo,
                                      PosTerminalRepository terminalRepo,
                                      PosTerminalLifecycleService lifecycleService) {
        this.branchRepo = branchRepo;
        this.settingsRepo = settingsRepo;
        this.terminalRepo = terminalRepo;
        this.lifecycleService = lifecycleService;
    }

    @Scheduled(cron = "0 0 2 * * *")
    @Transactional
    public void sweep() {
        List<Branch> branches = branchRepo.findAll();
        int archivedCount = 0;
        int staleCount = 0;

        for (Branch branch : branches) {
            PosSettings settings = settingsRepo.findByBranchId(branch.getId()).orElse(null);
            if (settings == null || !Boolean.TRUE.equals(settings.getTerminalAutoArchiveEnabled())) {
                continue; // master switch OFF for this branch — do nothing
            }

            int archiveAfterDays = settings.getTerminalArchiveAfterDays() != null
                    ? settings.getTerminalArchiveAfterDays() : 30;
            boolean notifyBeforeArchive = Boolean.TRUE.equals(settings.getTerminalArchiveNotifyBefore());
            int warningDays = settings.getTerminalArchiveWarningDays() != null
                    ? settings.getTerminalArchiveWarningDays() : 5;

            List<PosTerminal> candidates = terminalRepo.findAutoArchiveCandidates(branch.getId());
            LocalDateTime now = LocalDateTime.now();

            for (PosTerminal terminal : candidates) {
                if (terminal.getCurrentOpenSessionId() != null) continue;
                if (terminal.getStatus() == PosTerminalStatus.ACTIVE || terminal.getStatus() == PosTerminalStatus.IDLE) continue;

                LocalDateTime lastActivity = terminal.getLastActivityAt();
                int daysSinceActivity = lastActivity == null
                        ? Integer.MAX_VALUE
                        : (int) Duration.between(lastActivity, now).toDays();

                if (daysSinceActivity >= archiveAfterDays) {
                    lifecycleService.autoArchive(terminal, daysSinceActivity);
                    archivedCount++;
                } else if (notifyBeforeArchive && daysSinceActivity >= (archiveAfterDays - warningDays)) {
                    lifecycleService.markStale(terminal, daysSinceActivity, archiveAfterDays, true);
                    staleCount++;
                }
            }
        }

        if (archivedCount > 0 || staleCount > 0) {
            log.info("[PosTerminalAutoArchiveJob] Sweep complete: {} terminal(s) auto-archived, {} marked/kept STALE.",
                    archivedCount, staleCount);
        }
    }
}
