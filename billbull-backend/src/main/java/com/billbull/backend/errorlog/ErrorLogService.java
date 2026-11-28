package com.billbull.backend.errorlog;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

import jakarta.annotation.PreDestroy;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.billbull.backend.BillbullBackendApplication;
import com.billbull.backend.logging.LogContext;

/**
 * Stores captured errors in {@code error_log_groups} / {@code error_log_events} (V155) and serves
 * them to the control plane.
 *
 * <p>Recording never touches the request that failed: it is queued to one background writer
 * (bounded queue, overflow dropped) and every failure inside is swallowed and logged at WARN at
 * most — an ERROR here would be captured by {@link ErrorLogAppender} and loop. Each occurrence
 * bumps its group's count; individual event rows are capped per group per minute so an error
 * storm can't fill the database.
 */
@Service
public class ErrorLogService {

    private static final Logger log = LoggerFactory.getLogger(ErrorLogService.class);

    private final JdbcTemplate jdbc;
    private final boolean enabled;
    private final int maxEventsPerGroupPerMinute;
    private final int eventRetentionDays;
    private final int groupRetentionDays;
    private final String appVersion;

    private final ThreadPoolExecutor writer;
    private final Map<String, long[]> throttle = new ConcurrentHashMap<>();
    private final AtomicBoolean tablesMissingWarned = new AtomicBoolean();
    private final AtomicLong dropped = new AtomicLong();

    public ErrorLogService(JdbcTemplate jdbc,
                           @Value("${billbull.error-log.enabled:true}") boolean enabled,
                           @Value("${billbull.error-log.max-events-per-group-per-minute:20}") int maxEventsPerGroupPerMinute,
                           @Value("${billbull.error-log.event-retention-days:30}") int eventRetentionDays,
                           @Value("${billbull.error-log.group-retention-days:180}") int groupRetentionDays) {
        this.jdbc = jdbc;
        this.enabled = enabled;
        this.maxEventsPerGroupPerMinute = Math.max(1, maxEventsPerGroupPerMinute);
        this.eventRetentionDays = Math.max(1, eventRetentionDays);
        this.groupRetentionDays = Math.max(this.eventRetentionDays, groupRetentionDays);
        String v = BillbullBackendApplication.class.getPackage().getImplementationVersion();
        this.appVersion = v != null ? v : "dev";
        this.writer = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>(2000), r -> {
            Thread t = new Thread(r, "error-log-writer");
            t.setDaemon(true);
            return t;
        }, (r, ex) -> dropped.incrementAndGet());
    }

    public boolean isEnabled() {
        return enabled;
    }

    /** Fills request id, user, branch, method and path from the current request's log context. */
    public static void fillFromLogContext(CapturedError e) {
        if (e.requestId == null) e.requestId = blankToNull(LogContext.get(LogContext.REQUEST_ID));
        if (e.username == null) e.username = blankToNull(LogContext.get(LogContext.USERNAME));
        if (e.branchId == null) e.branchId = LogContext.getLong(LogContext.BRANCH_ID);
        if (e.httpMethod == null) e.httpMethod = blankToNull(LogContext.get(LogContext.HTTP_METHOD));
        if (e.path == null) e.path = blankToNull(LogContext.get(LogContext.HTTP_PATH));
    }

    /** Queues {@code e} for writing. Never throws, never blocks. */
    public void record(CapturedError e) {
        if (!enabled || e == null) return;
        try {
            writer.execute(() -> {
                try {
                    write(e);
                } catch (RuntimeException ex) {
                    onWriteFailure(ex);
                }
            });
        } catch (RuntimeException ex) {
            dropped.incrementAndGet();
        }
    }

    private static final java.util.regex.Pattern JS_ERROR_NAME =
            java.util.regex.Pattern.compile("^\\s*(?:Uncaught\\s+)?([A-Z][A-Za-z]*(?:Error|Exception)):\\s*(.*)$", java.util.regex.Pattern.DOTALL);
    private static final int MAX_CLIENT_PER_MINUTE = 120;
    private final long[] clientWindow = {0, 0};

    /**
     * A browser-reported error (ClientLogController, level=error). The endpoint is public, so only
     * signed-in users' reports are kept and the whole tenant is capped per minute.
     */
    public void recordClient(String username, String message, String source, String url, String stack,
                             String componentStack, String requestId, Instant occurredAt) {
        if (!enabled || username == null || username.isBlank() || "anonymous".equals(username)) return;
        long minute = System.currentTimeMillis() / 60_000;
        synchronized (clientWindow) {
            if (clientWindow[0] != minute) {
                clientWindow[0] = minute;
                clientWindow[1] = 0;
            }
            if (++clientWindow[1] > MAX_CLIENT_PER_MINUTE) return;
        }
        CapturedError e = new CapturedError();
        e.source = CapturedError.Source.CLIENT;
        e.occurredAt = occurredAt != null && occurredAt.isBefore(Instant.now().plusSeconds(60)) ? occurredAt : Instant.now();
        String msg = message == null ? "" : message.trim();
        java.util.regex.Matcher m = JS_ERROR_NAME.matcher(msg);
        if (m.matches()) {
            e.exceptionClass = m.group(1);
            msg = m.group(2);
        }
        e.message = ErrorCaptureSupport.clipRedacted(msg, 2000);
        e.logger = ErrorCaptureSupport.clip(blankToNull(source), 200);
        e.clientUrl = url;
        e.path = urlPath(url);
        StringBuilder st = new StringBuilder();
        if (stack != null && !stack.isBlank()) st.append(stack.trim());
        if (componentStack != null && !componentStack.isBlank()) {
            st.append(st.length() > 0 ? "\n\nReact component stack:\n" : "React component stack:\n").append(componentStack.trim());
        }
        e.stackTrace = st.length() > 0 ? ErrorCaptureSupport.clip(ErrorCaptureSupport.redact(st.toString()), ErrorCaptureSupport.MAX_STACK) : null;
        e.requestId = blankToNull(requestId);
        e.username = username;
        e.branchId = LogContext.getLong(LogContext.BRANCH_ID);
        record(e);
    }

    static String urlPath(String url) {
        if (url == null || url.isBlank()) return null;
        try {
            String p = java.net.URI.create(url.trim().replace(" ", "%20")).getPath();
            return p == null || p.isBlank() ? "/" : p;
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    void write(CapturedError e) {
        String fingerprint = ErrorCaptureSupport.fingerprint(e);
        Timestamp at = Timestamp.from(e.occurredAt != null ? e.occurredAt : Instant.now());
        String template = ErrorCaptureSupport.pathTemplate(e.path);
        Long groupId = jdbc.queryForObject("""
                INSERT INTO error_log_groups (fingerprint, source, exception_class, root_cause_class, cause_chain,
                    message, root_cause_message, error_code, sql_state, http_method, path_template, http_status,
                    logger, top_frame, stack_trace, app_version, first_seen_at, last_seen_at, occurrences,
                    last_request_id, last_username, last_branch_id, change_seq)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, nextval('error_log_change_seq'))
                ON CONFLICT (fingerprint) DO UPDATE SET
                    last_seen_at = GREATEST(error_log_groups.last_seen_at, EXCLUDED.last_seen_at),
                    occurrences = error_log_groups.occurrences + 1,
                    message = EXCLUDED.message,
                    root_cause_message = EXCLUDED.root_cause_message,
                    http_status = EXCLUDED.http_status,
                    top_frame = EXCLUDED.top_frame,
                    stack_trace = EXCLUDED.stack_trace,
                    app_version = EXCLUDED.app_version,
                    last_request_id = EXCLUDED.last_request_id,
                    last_username = EXCLUDED.last_username,
                    last_branch_id = EXCLUDED.last_branch_id,
                    change_seq = nextval('error_log_change_seq')
                RETURNING id
                """, Long.class,
                fingerprint, e.source.name(), e.exceptionClass, e.rootCauseClass, e.causeChain,
                ErrorCaptureSupport.clipRedacted(e.message, 2000), ErrorCaptureSupport.clipRedacted(e.rootCauseMessage, 2000),
                ErrorCaptureSupport.clip(e.errorCode, 80), e.sqlState, ErrorCaptureSupport.clip(e.httpMethod, 10), template,
                e.httpStatus, ErrorCaptureSupport.clip(e.logger, 200), e.topFrame, e.stackTrace, appVersion, at, at,
                ErrorCaptureSupport.clip(e.requestId, 120), ErrorCaptureSupport.clip(e.username, 100), e.branchId);
        if (groupId == null || !allowEvent(fingerprint)) return;
        jdbc.update("""
                INSERT INTO error_log_events (group_id, occurred_at, request_id, username, branch_id, http_method, path,
                    http_status, message, client_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                groupId, at, ErrorCaptureSupport.clip(e.requestId, 120), ErrorCaptureSupport.clip(e.username, 100), e.branchId,
                ErrorCaptureSupport.clip(e.httpMethod, 10), ErrorCaptureSupport.clipRedacted(stripQuery(e.path), 300),
                e.httpStatus, ErrorCaptureSupport.clipRedacted(e.rootCauseMessage != null ? e.rootCauseMessage : e.message, 2000),
                ErrorCaptureSupport.clipRedacted(stripQuery(e.clientUrl), 300));
    }

    /** At most {@code maxEventsPerGroupPerMinute} event rows per group per minute; the count still rises. */
    boolean allowEvent(String fingerprint) {
        long minute = System.currentTimeMillis() / 60_000;
        if (throttle.size() > 5000) throttle.clear();
        long[] w = throttle.computeIfAbsent(fingerprint, k -> new long[] {minute, 0});
        synchronized (w) {
            if (w[0] != minute) {
                w[0] = minute;
                w[1] = 0;
            }
            return ++w[1] <= maxEventsPerGroupPerMinute;
        }
    }

    private void onWriteFailure(RuntimeException ex) {
        String msg = String.valueOf(ex.getMessage());
        if (msg.contains("error_log_") && msg.contains("does not exist")) {
            if (tablesMissingWarned.compareAndSet(false, true)) {
                log.warn("Error log tables are missing (migration V155 not applied yet); errors are not being recorded");
            }
            return;
        }
        log.warn("Could not record an error in the error log: {}", ex.toString());
    }

    // ------------------------------------------------------------------ read side (platform agent)

    /**
     * One page for the control plane: events after {@code afterEventId}, groups changed after
     * {@code afterGroupSeq}, plus every group an event in the page belongs to. Cursors move only
     * by what was ordered, so a re-read never skips anything; the control plane upserts.
     */
    public Map<String, Object> page(long afterGroupSeq, long afterEventId, int limit) {
        int n = Math.max(1, Math.min(500, limit));
        List<Map<String, Object>> events = jdbc.queryForList("""
                SELECT id, group_id, occurred_at, request_id, username, branch_id, http_method, path, http_status,
                       message, client_url
                FROM error_log_events WHERE id > ? ORDER BY id LIMIT ?
                """, afterEventId, n);
        List<Map<String, Object>> changed = jdbc.queryForList(
                "SELECT " + GROUP_COLUMNS + " FROM error_log_groups WHERE change_seq > ? ORDER BY change_seq LIMIT ?",
                afterGroupSeq, n);

        long nextGroupSeq = afterGroupSeq;
        Map<Object, Map<String, Object>> groups = new LinkedHashMap<>();
        for (Map<String, Object> g : changed) {
            groups.put(g.get("id"), g);
            nextGroupSeq = Math.max(nextGroupSeq, ((Number) g.get("change_seq")).longValue());
        }
        Set<Long> missing = new LinkedHashSet<>();
        long nextEventId = afterEventId;
        for (Map<String, Object> ev : events) {
            Long gid = ((Number) ev.get("group_id")).longValue();
            if (!groups.containsKey(gid)) missing.add(gid);
            nextEventId = Math.max(nextEventId, ((Number) ev.get("id")).longValue());
        }
        if (!missing.isEmpty()) {
            String in = String.join(",", missing.stream().map(String::valueOf).toList());
            for (Map<String, Object> g : jdbc.queryForList(
                    "SELECT " + GROUP_COLUMNS + " FROM error_log_groups WHERE id IN (" + in + ")")) {
                groups.put(g.get("id"), g);
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("serverTime", Instant.now().toString());
        out.put("appVersion", appVersion);
        out.put("enabled", enabled);
        out.put("droppedSinceStart", dropped.get());
        out.put("groups", new ArrayList<>(groups.values().stream().map(ErrorLogService::isoDates).toList()));
        out.put("events", events.stream().map(ErrorLogService::isoDates).toList());
        out.put("nextGroupSeq", nextGroupSeq);
        out.put("nextEventId", nextEventId);
        out.put("more", changed.size() >= n || events.size() >= n);
        // Lets the control plane notice a restored database (cursors ahead of what exists) and start over.
        out.put("maxGroupSeq", jdbc.queryForObject("SELECT COALESCE(max(change_seq), 0) FROM error_log_groups", Long.class));
        out.put("maxEventId", jdbc.queryForObject("SELECT COALESCE(max(id), 0) FROM error_log_events", Long.class));
        return out;
    }

    private static final String GROUP_COLUMNS = """
            id, fingerprint, source, exception_class, root_cause_class, cause_chain, message, root_cause_message,
            error_code, sql_state, http_method, path_template, http_status, logger, top_frame, stack_trace,
            app_version, first_seen_at, last_seen_at, occurrences, last_request_id, last_username, last_branch_id,
            change_seq""";

    private static Map<String, Object> isoDates(Map<String, Object> row) {
        Map<String, Object> m = new LinkedHashMap<>();
        row.forEach((k, v) -> m.put(k, v instanceof Timestamp ts ? ts.toInstant().toString() : v));
        return m;
    }

    // ------------------------------------------------------------------ retention

    @Scheduled(cron = "${billbull.error-log.prune-cron:0 40 3 * * *}")
    public void prune() {
        if (!enabled) return;
        try {
            Timestamp eventsBefore = Timestamp.from(Instant.now().minus(Duration.ofDays(eventRetentionDays)));
            Timestamp groupsBefore = Timestamp.from(Instant.now().minus(Duration.ofDays(groupRetentionDays)));
            int ev = jdbc.update("DELETE FROM error_log_events WHERE occurred_at < ?", eventsBefore);
            int gr = jdbc.update("DELETE FROM error_log_groups WHERE last_seen_at < ?", groupsBefore);
            if (ev + gr > 0) log.info("Error log pruned: {} events, {} groups", ev, gr);
        } catch (DataAccessException ex) {
            log.warn("Error log prune skipped: {}", ex.getMessage());
        }
    }

    @PreDestroy
    void shutdown() {
        writer.shutdown();
        try {
            writer.awaitTermination(3, TimeUnit.SECONDS);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }

    private static String stripQuery(String s) {
        if (s == null) return null;
        int q = s.indexOf('?');
        return q >= 0 ? s.substring(0, q) : s;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
