package com.billbull.backend.pos.terminal;

import com.billbull.backend.pos.audit.PosAuditLog;
import com.billbull.backend.pos.audit.PosAuditLogRepository;
import com.billbull.backend.pos.businessdate.BusinessDayClock;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Read-only views for the Console's Terminals &amp; Counters tab: who is on each terminal right
 * now (signed-in user + open shift summary) and the branch's recent POS activity feed.
 *
 * <p>Kept apart from {@link PosTerminalService} so the lifecycle service keeps its narrow
 * dependency set; nothing here writes.
 */
@Service
public class PosTerminalInsightService {

    static final int DEFAULT_ACTIVITY_LIMIT = 50;
    static final int MAX_ACTIVITY_LIMIT = 200;

    private final PosSessionRepository sessionRepo;
    private final PosAuditLogRepository auditRepo;
    private final PosTerminalRepository terminalRepo;
    private final UserRepository userRepo;
    /** Session openedAt and audit createdAt are wall-clock readings in the Business Day zone
     *  (see PosSession#getOpenedAtZoned), so they leave here carrying that zone. */
    private final BusinessDayClock clock;

    public PosTerminalInsightService(PosSessionRepository sessionRepo,
                                     PosAuditLogRepository auditRepo,
                                     PosTerminalRepository terminalRepo,
                                     UserRepository userRepo,
                                     BusinessDayClock clock) {
        this.sessionRepo = sessionRepo;
        this.auditRepo = auditRepo;
        this.terminalRepo = terminalRepo;
        this.userRepo = userRepo;
        this.clock = clock;
    }

    /** Fills the @Transient user/shift fields on each terminal in place and returns the list. */
    @Transactional(readOnly = true)
    public List<PosTerminal> enrich(List<PosTerminal> terminals) {
        if (terminals == null || terminals.isEmpty()) return terminals;

        List<Long> sessionIds = terminals.stream()
                .map(PosTerminal::getCurrentOpenSessionId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        Map<Long, PosSession> sessions = sessionIds.isEmpty() ? Map.of()
                : sessionRepo.findAllById(sessionIds).stream()
                        .collect(Collectors.toMap(PosSession::getId, Function.identity(), (a, b) -> a));

        Map<String, String> names = new HashMap<>();
        for (PosTerminal t : terminals) {
            if (t.getLastUser() != null) {
                t.setLastUserDisplayName(displayName(t.getLastUser(), names));
            }
            PosSession s = t.getCurrentOpenSessionId() != null ? sessions.get(t.getCurrentOpenSessionId()) : null;
            if (s != null) {
                t.setShiftOpenedBy(s.getOpenedBy());
                t.setShiftOpenedByDisplayName(s.getOpenedByDisplayName() != null && !s.getOpenedByDisplayName().isBlank()
                        ? s.getOpenedByDisplayName() : displayName(s.getOpenedBy(), names));
                t.setShiftOpenedAt(s.getOpenedAt() != null ? s.getOpenedAt().atZone(clock.zone()) : null);
                t.setShiftInvoiceCount(s.getInvoiceCount());
                t.setShiftTotalSales(s.getTotalSales());
                t.setShiftClosing(s.getClosingStartedAt() != null);
            }
        }
        return terminals;
    }

    /**
     * Most recent POS audit entries for a branch, newest first, optionally narrowed to one
     * terminal. Each entry carries the terminal's current display name and the actor's resolved
     * display name so the UI needs no further lookups.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> recentActivity(Long branchId, String terminalId, Integer limit) {
        int size = limit == null || limit <= 0 ? DEFAULT_ACTIVITY_LIMIT : Math.min(limit, MAX_ACTIVITY_LIMIT);
        PageRequest page = PageRequest.of(0, size);
        List<PosAuditLog> rows = (terminalId != null && !terminalId.isBlank())
                ? auditRepo.findByBranchIdAndTerminalIdOrderByCreatedAtDescIdDesc(branchId, terminalId.trim(), page)
                : auditRepo.findByBranchIdOrderByCreatedAtDescIdDesc(branchId, page);

        Map<String, String> terminalNames = new HashMap<>();
        for (PosTerminal t : terminalRepo.findByBranchIdOrderByTerminalIdAsc(branchId)) {
            terminalNames.put(t.getTerminalId(), t.getTerminalName());
        }
        Map<String, String> names = new HashMap<>();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (PosAuditLog r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.getId());
            m.put("action", r.getAction() != null ? r.getAction().name() : null);
            m.put("description", r.getDescription());
            m.put("terminalId", r.getTerminalId());
            m.put("terminalName", r.getTerminalId() != null ? terminalNames.get(r.getTerminalId()) : null);
            m.put("sessionId", r.getSessionId());
            m.put("entityType", r.getEntityType());
            m.put("entityId", r.getEntityId());
            m.put("userId", r.getUserId());
            m.put("userDisplayName", displayName(r.getUserId(), names));
            m.put("createdAt", r.getCreatedAt() != null ? r.getCreatedAt().atZone(clock.zone()) : null);
            out.add(m);
        }
        return out;
    }

    private String displayName(String username, Map<String, String> cache) {
        if (username == null || username.isBlank() || "system".equals(username)) return username;
        return cache.computeIfAbsent(username, u -> userRepo.findByUsername(u)
                .map(User::getResolvedDisplayName)
                .orElse(u));
    }
}
