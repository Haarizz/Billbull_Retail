package com.billbull.backend.pos.terminal;

import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.notification.NotificationEventPublisher;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Owns the Terminal Auto-Archive state machine (ACTIVE/OFFLINE -> STALE -> ARCHIVED) and the admin
 * actions that act on it (keep-active, archive-now, restore, exempt toggle). Delegates the actual
 * archive/restore mutation to the existing, already-guarded {@link PosTerminalService#archive}
 * and {@link PosTerminalService#restore} — this service only adds the lifecycle bookkeeping
 * (stale timestamps, structured archive context, audit trail, notifications) around them.
 *
 * <p>Real-time STALE recovery (a terminal that resumes activity while STALE snaps straight back to
 * ACTIVE/OFFLINE without any admin action) lives in {@link PosTerminalActivityService}, which calls
 * {@link #recoverFromStale} on every recorded activity.</p>
 */
@Service
public class PosTerminalLifecycleService {

    private final PosTerminalRepository repo;
    private final PosTerminalService terminalService;
    private final PosSessionRepository sessionRepo;
    private final SalesInvoiceRepository salesInvoiceRepo;
    private final PosAuditService auditService;
    private final NotificationEventPublisher notificationPublisher;
    private final ObjectMapper objectMapper;

    public PosTerminalLifecycleService(PosTerminalRepository repo,
                                        PosTerminalService terminalService,
                                        PosSessionRepository sessionRepo,
                                        SalesInvoiceRepository salesInvoiceRepo,
                                        PosAuditService auditService,
                                        NotificationEventPublisher notificationPublisher,
                                        ObjectMapper objectMapper) {
        this.repo = repo;
        this.terminalService = terminalService;
        this.sessionRepo = sessionRepo;
        this.salesInvoiceRepo = salesInvoiceRepo;
        this.auditService = auditService;
        this.notificationPublisher = notificationPublisher;
        this.objectMapper = objectMapper;
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }

    private int daysSince(LocalDateTime from, LocalDateTime now) {
        if (from == null) return Integer.MAX_VALUE;
        return (int) Duration.between(from, now).toDays();
    }

    // -------------------------------------------------------------------------
    // STALE transition + repeat-notification cadence
    // -------------------------------------------------------------------------

    /**
     * Moves a terminal into STALE (idempotent — safe to call every sweep while the terminal remains
     * a candidate) and fires the repeat-warning notification cadence: a first warning at the start
     * of the warning window, then reminders roughly every 2 days, with the last one before the
     * archive day flagged as a final reminder. Recovery (via new activity) clears everything.
     */
    @Transactional
    public void markStale(PosTerminal terminal, int daysInactive, int archiveAfterDays, boolean notifyBeforeArchive) {
        LocalDateTime now = LocalDateTime.now();
        boolean enteringStale = terminal.getStatus() != PosTerminalStatus.STALE;
        if (enteringStale) {
            terminal.setStatus(PosTerminalStatus.STALE);
            terminal.setStaleAt(now);
            repo.save(terminal);
            auditService.logTerminalStale(terminal.getTerminalId(), terminal.getBranchId(), daysInactive);
        }

        if (!notifyBeforeArchive) return;

        int daysUntilArchive = Math.max(archiveAfterDays - daysInactive, 0);
        boolean isFinal = daysUntilArchive <= 1;
        LocalDateTime lastSent = terminal.getStaleWarningSentAt();
        boolean dueForReminder = lastSent == null || ChronoUnit.DAYS.between(lastSent, now) >= 2;
        if (dueForReminder) {
            terminal.setStaleWarningSentAt(now);
            repo.save(terminal);
            notificationPublisher.terminalStaleWarning(
                    terminal.getTerminalName(), daysInactive, daysUntilArchive, terminal.getTerminalId(), isFinal);
            auditService.logTerminalStaleWarningSent(
                    terminal.getTerminalId(), terminal.getBranchId(), daysInactive, daysUntilArchive);
        }
    }

    /**
     * Real-time recovery: called whenever new activity is recorded on a terminal that is currently
     * STALE. No admin action required — STALE must never be a one-way state.
     */
    @Transactional
    public void recoverFromStale(PosTerminal terminal, String activitySource) {
        if (terminal.getStatus() != PosTerminalStatus.STALE) return;
        terminal.setStaleAt(null);
        terminal.setStaleWarningSentAt(null);
        boolean liveActivity = "HEARTBEAT".equals(activitySource) || "SESSION_OPEN".equals(activitySource);
        terminal.setStatus(liveActivity ? PosTerminalStatus.ACTIVE : PosTerminalStatus.OFFLINE);
        repo.save(terminal);
        auditService.logTerminalRecoveredFromStale(terminal.getTerminalId(), terminal.getBranchId(), activitySource);
    }

    // -------------------------------------------------------------------------
    // Archive context snapshot
    // -------------------------------------------------------------------------

    private String buildArchiveContext(PosTerminal terminal, String trigger, int daysInactive) {
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("trigger", trigger);
        context.put("daysInactive", daysInactive);
        context.put("lastHeartbeatAt", terminal.getLastHeartbeatAt());
        sessionRepo.findTopByTerminalPkOrderByOpenedAtDesc(terminal.getId())
                .ifPresent(s -> context.put("lastSessionAt", s.getOpenedAt()));
        salesInvoiceRepo.findTopByPosTerminalIdOrderByCreatedAtDesc(terminal.getTerminalId())
                .ifPresent(inv -> context.put("lastTransactionAt", inv.getCreatedAt()));
        context.put("archivedAt", LocalDateTime.now());
        try {
            return objectMapper.writeValueAsString(context);
        } catch (Exception e) {
            return null;
        }
    }

    // -------------------------------------------------------------------------
    // Archive / restore / keep-active / exempt
    // -------------------------------------------------------------------------

    @Transactional
    public PosTerminal autoArchive(PosTerminal terminal, int daysInactive) {
        String reason = "Auto-archived: inactive for " + daysInactive + " day(s)";
        String context = buildArchiveContext(terminal, "AUTO", daysInactive);
        PosTerminal archived = terminalService.archive(terminal.getId(), reason);
        archived.setArchiveContextJson(context);
        archived.setStaleAt(null);
        archived.setStaleWarningSentAt(null);
        repo.save(archived);
        auditService.logTerminalAutoArchived(archived.getTerminalId(), archived.getBranchId(), reason);
        return archived;
    }

    @Transactional
    public PosTerminal manualArchiveNow(Long terminalPk) {
        PosTerminal terminal = repo.findById(terminalPk)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Terminal not found: " + terminalPk));
        int daysInactive = daysSince(terminal.getLastActivityAt(), LocalDateTime.now());
        String reason = "Manually archived by admin";
        String context = buildArchiveContext(terminal, "MANUAL", daysInactive);
        String adminUser = currentUser();
        PosTerminal archived = terminalService.archive(terminalPk, reason);
        archived.setArchiveContextJson(context);
        archived.setStaleAt(null);
        archived.setStaleWarningSentAt(null);
        repo.save(archived);
        auditService.logTerminalManualArchived(archived.getTerminalId(), archived.getBranchId(), adminUser, reason);
        return archived;
    }

    @Transactional
    public PosTerminal restore(Long terminalPk) {
        String adminUser = currentUser();
        PosTerminal restored = terminalService.restore(terminalPk);
        restored.setStaleAt(null);
        restored.setStaleWarningSentAt(null);
        restored.setArchiveContextJson(null);
        repo.save(restored);
        auditService.logTerminalRestored(restored.getTerminalId(), restored.getBranchId(), adminUser);
        return restored;
    }

    /**
     * Permanently retires a terminal. Admin-only, never triggered automatically — unlike archive,
     * there is deliberately no {@code autoDecommission} sibling to {@link #autoArchive}.
     */
    @Transactional
    public PosTerminal decommission(Long terminalPk, String reason) {
        String adminUser = currentUser();
        String effectiveReason = (reason == null || reason.isBlank()) ? "Decommissioned by admin" : reason;
        PosTerminal decommissioned = terminalService.decommission(terminalPk, effectiveReason);
        decommissioned.setStaleAt(null);
        decommissioned.setStaleWarningSentAt(null);
        repo.save(decommissioned);
        auditService.logTerminalDecommissioned(decommissioned.getTerminalId(), decommissioned.getBranchId(), adminUser, effectiveReason);
        return decommissioned;
    }

    @Transactional
    public PosTerminal keepActive(Long terminalPk) {
        PosTerminal terminal = repo.findById(terminalPk)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Terminal not found: " + terminalPk));
        terminal.setStaleAt(null);
        terminal.setStaleWarningSentAt(null);
        boolean recentHeartbeat = terminal.getLastHeartbeatAt() != null
                && terminal.getLastHeartbeatAt().isAfter(LocalDateTime.now().minusMinutes(15));
        terminal.setStatus(recentHeartbeat ? PosTerminalStatus.ACTIVE : PosTerminalStatus.OFFLINE);
        PosTerminal saved = repo.save(terminal);
        auditService.logTerminalKeptActive(saved.getTerminalId(), saved.getBranchId(), currentUser());
        return saved;
    }

    @Transactional
    public PosTerminal setAutoArchiveExempt(Long terminalPk, boolean exempt) {
        PosTerminal terminal = repo.findById(terminalPk)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Terminal not found: " + terminalPk));
        terminal.setAutoArchiveExempt(exempt);
        PosTerminal saved = repo.save(terminal);
        auditService.logTerminalExemptChanged(saved.getTerminalId(), saved.getBranchId(), currentUser(), exempt);
        return saved;
    }
}
