package com.billbull.backend.pos.terminal;

import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Detects terminals that have missed their heartbeat and marks them OFFLINE.
 * Runs every 60 seconds; uses the per-branch offline_threshold_minutes setting
 * (falls back to 15 minutes if no settings row exists).
 */
@Component
public class PosTerminalScheduler {

    private static final Logger log = LoggerFactory.getLogger(PosTerminalScheduler.class);

    private final PosTerminalRepository terminalRepo;
    private final PosSettingsRepository settingsRepo;

    public PosTerminalScheduler(PosTerminalRepository terminalRepo, PosSettingsRepository settingsRepo) {
        this.terminalRepo = terminalRepo;
        this.settingsRepo = settingsRepo;
    }

    @Scheduled(fixedRate = 60_000)
    @Transactional
    public void detectOfflineTerminals() {
        // Use a conservative global threshold as the query filter, then refine per terminal.
        // The widest threshold we'll ever need is 60 min; fetch all stale under that umbrella.
        LocalDateTime globalCutoff = LocalDateTime.now().minusMinutes(60);
        List<PosTerminal> stale = terminalRepo.findAllStaleTerminals(globalCutoff);

        for (PosTerminal terminal : stale) {
            PosSettings settings = settingsRepo.findByBranchId(terminal.getBranchId()).orElse(null);
            int thresholdMinutes = (settings != null && settings.getOfflineThresholdMinutes() != null)
                    ? settings.getOfflineThresholdMinutes() : 15;

            LocalDateTime threshold = LocalDateTime.now().minusMinutes(thresholdMinutes);
            LocalDateTime lastBeat = terminal.getLastHeartbeatAt() != null
                    ? terminal.getLastHeartbeatAt()
                    : terminal.getLastSeenAt();

            if (lastBeat == null || lastBeat.isBefore(threshold)) {
                log.info("Terminal {} (branch {}) is OFFLINE — last heartbeat: {}",
                        terminal.getTerminalId(), terminal.getBranchId(), lastBeat);
                terminal.setStatus(PosTerminalStatus.OFFLINE);
                terminalRepo.save(terminal);
            }
        }
    }
}
