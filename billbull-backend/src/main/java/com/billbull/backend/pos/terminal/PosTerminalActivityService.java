package com.billbull.backend.pos.terminal;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * Single integration point for "this terminal is in use right now" signals from every POS flow
 * (heartbeat, session open/close, checkout, sales return, cash in/out, payment collection, refund,
 * and any future POS transaction type). Callers do not need to know about the Terminal Auto-Archive
 * feature at all — they just report activity, and this service maintains the cached
 * {@code last_activity_at} timestamp the sweep job reads, plus triggers real-time STALE recovery.
 *
 * <p>Keeping the scheduler decoupled from individual transaction tables (SalesInvoice, PosSession,
 * etc.) means the daily sweep only ever reads one cached column per terminal — O(terminals), not
 * O(terminals x transaction tables) — and any new POS transaction type added later just calls
 * {@link #recordActivity} too, with zero changes needed to the sweep job.</p>
 */
@Service
public class PosTerminalActivityService {

    private final PosTerminalRepository repo;
    private final PosTerminalLifecycleService lifecycleService;

    public PosTerminalActivityService(PosTerminalRepository repo, PosTerminalLifecycleService lifecycleService) {
        this.repo = repo;
        this.lifecycleService = lifecycleService;
    }

    /**
     * Records that {@code source} activity just happened on {@code terminalId}. Advances the cached
     * last-activity timestamp atomically (never regresses it, never loads the full entity on this
     * hot path) and, if the terminal is currently STALE, immediately recovers it — no admin action
     * required.
     */
    @Transactional
    public void recordActivity(String terminalId, String source) {
        if (terminalId == null || terminalId.isBlank()) return;
        LocalDateTime now = LocalDateTime.now();
        repo.touchLastActivity(terminalId, now);

        repo.findByTerminalId(terminalId).ifPresent(terminal -> {
            if (terminal.getStatus() == PosTerminalStatus.STALE) {
                lifecycleService.recoverFromStale(terminal, source);
            }
        });
    }
}
