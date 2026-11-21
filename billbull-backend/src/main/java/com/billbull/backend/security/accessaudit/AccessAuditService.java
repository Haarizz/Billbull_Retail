package com.billbull.backend.security.accessaudit;

import com.billbull.backend.logging.LogContext;
import com.billbull.backend.user.UserRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Writes and verifies the access-control audit ledger ({@code access_audit_events}).
 *
 * <p><b>Same transaction as the change.</b> {@link #record} joins the caller's transaction
 * (Propagation.REQUIRED), so a permission change and its audit row commit or roll back together:
 * there is never a change without its audit row, nor an audit row for a change that failed. This
 * is the opposite of {@code AuditLogService}, whose async writes may be lost.
 *
 * <p><b>Who / where / why</b> is captured here, not by callers: actor from the security context,
 * IP / user agent / tenant host from the current HTTP request, branch from {@link LogContext}, and
 * the reason from the {@value #REASON_HEADER} header (URL-encoded, so non-Latin text survives) or
 * a controller-set request attribute. All rows written during one HTTP request share a
 * {@code change_set_id}, so one "Save" in the UI reads back as one grouped change.
 *
 * <p><b>Tamper evidence.</b> Each row stores {@code prev_hash} (the previous row's hash) and
 * {@code row_hash} = SHA-256 over its own content plus prev_hash. Appends are serialised with a
 * transaction-scoped Postgres advisory lock so two concurrent saves cannot fork the chain.
 * {@link #verifyChain()} recomputes the whole chain.
 */
@Service
public class AccessAuditService {

    private static final Logger log = LoggerFactory.getLogger(AccessAuditService.class);

    public static final String REASON_HEADER = "X-Change-Reason";
    /** Request attribute a controller may set to supply the reason from a request body. */
    public static final String REASON_ATTR = AccessAuditService.class.getName() + ".reason";
    private static final String CHANGE_SET_ATTR = AccessAuditService.class.getName() + ".changeSet";

    /** Arbitrary but fixed key for pg_advisory_xact_lock — serialises chain appends. */
    static final long CHAIN_LOCK_KEY = 7_401_144L;

    static final int MAX_REASON = 1000;
    private static final int MAX_SUMMARY = 1000;
    private static final int MAX_LABEL = 255;
    private static final int MAX_USER_AGENT = 500;
    private static final int MAX_ROLES = 500;
    private static final int VERIFY_PAGE = 500;
    private static final DateTimeFormatter HASH_TIME = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    private final AccessAuditRepository repository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    @PersistenceContext
    private EntityManager entityManager;

    public AccessAuditService(AccessAuditRepository repository,
                              UserRepository userRepository,
                              ObjectMapper objectMapper) {
        this.repository = repository;
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
    }

    /** Test seam — Spring injects the shared EntityManager through {@link PersistenceContext}. */
    void setEntityManager(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Writing
    // ─────────────────────────────────────────────────────────────────────────

    @Transactional(propagation = Propagation.REQUIRED)
    public AccessAuditEvent record(Entry entry) {
        Objects.requireNonNull(entry, "entry");
        HttpServletRequest request = currentRequest();

        AccessAuditEvent e = new AccessAuditEvent(LocalDateTime.now().truncatedTo(ChronoUnit.MICROS));
        e.setAction(entry.action.name());
        e.setTargetType(entry.action.getTargetType().name());
        e.setTargetId(entry.targetId);
        e.setTargetLabel(truncate(entry.targetLabel, MAX_LABEL));
        e.setRoleName(entry.roleName);
        e.setModule(entry.module);
        e.setPreviousValue(toJson(entry.previous));
        e.setNewValue(toJson(entry.next));
        e.setChangeSummary(truncate(entry.summary, MAX_SUMMARY));
        e.setReason(truncate(resolveReason(request, entry.reason), MAX_REASON));

        List<Long> ids = entry.affectedUserIds == null ? List.of() : entry.affectedUserIds;
        List<String> names = entry.affectedUsernames == null ? List.of() : entry.affectedUsernames;
        e.setAffectedUserIds(ids.isEmpty() ? null : ids.stream().map(String::valueOf).collect(Collectors.joining(",")));
        e.setAffectedUsernames(names.isEmpty() ? null : String.join(",", names));
        e.setAffectedUserCount(Math.max(ids.size(), names.size()));

        String actor = currentUsername();
        e.setActorUsername(actor);
        e.setActorUserId(resolveActorId(actor));
        e.setActorRoles(truncate(currentRoles(), MAX_ROLES));
        e.setBranchId(LogContext.getLong(LogContext.BRANCH_ID));
        e.setTenant(blankToNull(LogContext.getOrDefault(LogContext.CLIENT_HOST,
                request != null ? request.getServerName() : null)));
        e.setIpAddress(clientIp(request));
        e.setUserAgent(truncate(request != null ? request.getHeader("User-Agent") : null, MAX_USER_AGENT));
        e.setRequestId(blankToNull(LogContext.get(LogContext.REQUEST_ID)));
        e.setChangeSetId(changeSetId(request));

        lockChain();
        String prevHash = repository.findTopByOrderByIdDesc().map(AccessAuditEvent::getRowHash).orElse(null);
        e.setPrevHash(prevHash);
        e.setRowHash(computeHash(e));
        return repository.save(e);
    }

    /**
     * The reason supplied with the current request, or {@code null}. Controllers whose changes must
     * be justified call {@link #requireReason()} instead.
     */
    public String currentReason() {
        return resolveReason(currentRequest(), null);
    }

    /** Rejects the request with 400 when it carries no reason (min. 5 characters). */
    public String requireReason() {
        String reason = currentReason();
        if (reason == null || reason.trim().length() < 5) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A reason for this access change is required (at least 5 characters).");
        }
        return reason;
    }

    /** Lets a controller pass a reason read from a request body. */
    public void useReason(String reason) {
        HttpServletRequest request = currentRequest();
        if (request != null && reason != null && !reason.isBlank()) {
            request.setAttribute(REASON_ATTR, reason.trim());
        }
    }

    /** Active users holding a role — the "affected users" of any change to that role. */
    @Transactional(readOnly = true)
    public Affected affectedByRole(String roleName) {
        Affected affected = new Affected();
        if (roleName == null || userRepository == null) return affected;
        for (Object[] row : userRepository.findActiveIdAndUsernameByRoleName(roleName)) {
            affected.ids.add((Long) row[0]);
            affected.usernames.add((String) row[1]);
        }
        return affected;
    }

    /** Ordered map of the six RBAC flags — the value shape stored for permission rows. */
    public static Map<String, Object> flags(boolean view, boolean create, boolean edit,
                                            boolean delete, boolean approve, boolean export) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("view", view);
        m.put("create", create);
        m.put("edit", edit);
        m.put("delete", delete);
        m.put("approve", approve);
        m.put("export", export);
        return m;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Verification
    // ─────────────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public ChainVerification verifyChain() {
        long checked = 0;
        long afterId = 0;
        String expectedPrev = null;
        while (true) {
            List<AccessAuditEvent> page = repository.findChainPage(afterId, PageRequest.of(0, VERIFY_PAGE));
            if (page.isEmpty()) break;
            for (AccessAuditEvent e : page) {
                checked++;
                if (!Objects.equals(expectedPrev, e.getPrevHash())) {
                    return ChainVerification.broken(checked, e.getId(),
                            "Row " + e.getId() + " does not link to the row before it — a row was removed, inserted or re-ordered.");
                }
                if (!computeHash(e).equals(e.getRowHash())) {
                    return ChainVerification.broken(checked, e.getId(),
                            "Row " + e.getId() + " content does not match its hash — it was modified after it was written.");
                }
                expectedPrev = e.getRowHash();
                afterId = e.getId();
            }
        }
        return ChainVerification.ok(checked);
    }

    static String computeHash(AccessAuditEvent e) {
        String material = String.join("\u001F",
                nz(e.getPrevHash()),
                e.getOccurredAt() == null ? "" : HASH_TIME.format(e.getOccurredAt()),
                nz(e.getActorUserId()), nz(e.getActorUsername()), nz(e.getActorRoles()),
                nz(e.getAction()), nz(e.getTargetType()), nz(e.getTargetId()), nz(e.getTargetLabel()),
                nz(e.getRoleName()), nz(e.getModule()),
                nz(e.getPreviousValue()), nz(e.getNewValue()), nz(e.getChangeSummary()), nz(e.getReason()),
                nz(e.getAffectedUserIds()), nz(e.getAffectedUsernames()), String.valueOf(e.getAffectedUserCount()),
                nz(e.getBranchId()), nz(e.getTenant()), nz(e.getIpAddress()), nz(e.getUserAgent()),
                nz(e.getRequestId()), nz(e.getChangeSetId()));
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(material.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private void lockChain() {
        if (entityManager == null) return; // unit tests without a database
        entityManager.createNativeQuery("SELECT 1 FROM (SELECT pg_advisory_xact_lock(?1)) l")
                .setParameter(1, CHAIN_LOCK_KEY)
                .getSingleResult();
    }

    private String toJson(Object value) {
        if (value == null) return null;
        if (value instanceof String s) return s;
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            log.warn("[AccessAudit] could not serialise audit value: {}", ex.getMessage());
            return String.valueOf(value);
        }
    }

    private static HttpServletRequest currentRequest() {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        return attrs instanceof ServletRequestAttributes sra ? sra.getRequest() : null;
    }

    private static String resolveReason(HttpServletRequest request, String explicit) {
        if (explicit != null && !explicit.isBlank()) return explicit.trim();
        if (request == null) return null;
        Object attr = request.getAttribute(REASON_ATTR);
        if (attr instanceof String s && !s.isBlank()) return s.trim();
        String header = request.getHeader(REASON_HEADER);
        if (header == null || header.isBlank()) return null;
        try {
            return URLDecoder.decode(header, StandardCharsets.UTF_8).trim();
        } catch (IllegalArgumentException malformed) {
            return header.trim();
        }
    }

    private static String changeSetId(HttpServletRequest request) {
        if (request == null) return UUID.randomUUID().toString();
        Object existing = request.getAttribute(CHANGE_SET_ATTR);
        if (existing instanceof String s) return s;
        String id = UUID.randomUUID().toString();
        request.setAttribute(CHANGE_SET_ATTR, id);
        return id;
    }

    private Long resolveActorId(String username) {
        Long fromContext = LogContext.getLong(LogContext.USER_ID);
        if (fromContext != null) return fromContext;
        if (userRepository == null || username == null || "SYSTEM".equals(username)) return null;
        try {
            return userRepository.findByUsername(username).map(u -> u.getId()).orElse(null);
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static String currentUsername() {
        String fromContext = LogContext.get(LogContext.USERNAME);
        if (!fromContext.isBlank()) return fromContext;
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated() && auth.getName() != null
                && !"anonymousUser".equals(auth.getName())) {
            return auth.getName();
        }
        return "SYSTEM";
    }

    private static String currentRoles() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getAuthorities() == null) return null;
        String roles = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .map(a -> a.startsWith("ROLE_") ? a.substring(5) : a)
                .collect(Collectors.joining(","));
        return roles.isBlank() ? null : roles;
    }

    private static String clientIp(HttpServletRequest request) {
        if (request == null) return null;
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return truncate(forwarded.split(",")[0].trim(), 80);
        }
        return truncate(request.getRemoteAddr(), 80);
    }

    private static String truncate(String value, int max) {
        if (value == null) return null;
        String text = value.trim();
        return text.length() <= max ? text : text.substring(0, max);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static String nz(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Value types
    // ─────────────────────────────────────────────────────────────────────────

    /** Builder for one ledger row. */
    public static final class Entry {
        private final AccessAuditAction action;
        private String targetId;
        private String targetLabel;
        private String roleName;
        private String module;
        private Object previous;
        private Object next;
        private String summary;
        private String reason;
        private List<Long> affectedUserIds;
        private List<String> affectedUsernames;

        private Entry(AccessAuditAction action) {
            this.action = action;
        }

        public static Entry of(AccessAuditAction action) {
            return new Entry(Objects.requireNonNull(action, "action"));
        }

        public Entry target(Object id, String label) {
            this.targetId = id == null ? null : String.valueOf(id);
            this.targetLabel = label;
            return this;
        }

        public Entry role(String roleName) { this.roleName = roleName; return this; }
        public Entry module(String module) { this.module = module; return this; }
        public Entry previous(Object value) { this.previous = value; return this; }
        public Entry next(Object value) { this.next = value; return this; }
        public Entry summary(String summary) { this.summary = summary; return this; }
        public Entry reason(String reason) { this.reason = reason; return this; }

        public Entry affected(Affected affected) {
            if (affected != null) {
                this.affectedUserIds = new ArrayList<>(affected.ids);
                this.affectedUsernames = new ArrayList<>(affected.usernames);
            }
            return this;
        }

        public Entry affectedUser(Long id, String username) {
            this.affectedUserIds = id == null ? List.of() : List.of(id);
            this.affectedUsernames = username == null ? List.of() : List.of(username);
            return this;
        }

        public AccessAuditAction getAction() { return action; }
        public Object getPrevious() { return previous; }
        public Object getNext() { return next; }
        public String getSummary() { return summary; }
        public String getModule() { return module; }
        public String getRoleName() { return roleName; }
    }

    /** Users affected by a change. */
    public static final class Affected {
        final List<Long> ids = new ArrayList<>();
        final List<String> usernames = new ArrayList<>();

        public static Affected of(Collection<Long> ids, Collection<String> usernames) {
            Affected a = new Affected();
            if (ids != null) a.ids.addAll(ids);
            if (usernames != null) a.usernames.addAll(usernames);
            return a;
        }

        public List<Long> getIds() { return ids; }
        public List<String> getUsernames() { return usernames; }
    }

    /** Result of {@link #verifyChain()}. */
    public record ChainVerification(boolean intact, long rowsChecked, Long firstBrokenId, String message) {
        static ChainVerification ok(long checked) {
            return new ChainVerification(true, checked, null,
                    checked == 0 ? "No access changes recorded yet." : "All " + checked + " entries verified — no tampering detected.");
        }

        static ChainVerification broken(long checked, Long id, String message) {
            return new ChainVerification(false, checked, id, message);
        }
    }
}
