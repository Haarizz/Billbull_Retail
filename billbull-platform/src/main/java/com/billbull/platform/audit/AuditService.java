package com.billbull.platform.audit;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.platform.auth.PlatformPrincipal;

/**
 * Writes the control plane's audit trail: append-only (DB triggers) and hash-chained, so editing
 * or deleting a row — even directly in the database with the triggers disabled — is detected by
 * {@link #verify()}.
 *
 * <p>Each event is written in its own transaction, so a failed sign-in or a refused action is
 * recorded even though the caller's transaction rolls back. A transaction-scoped advisory lock
 * serialises writers so the chain never forks.
 */
@Service
public class AuditService {

    private static final long CHAIN_LOCK = 0x42494C4C42554C4CL; // "BILLBULL"

    private final AuditEventRepository repository;
    private final JdbcTemplate jdbc;

    public AuditService(AuditEventRepository repository, JdbcTemplate jdbc) {
        this.repository = repository;
        this.jdbc = jdbc;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public AuditEvent record(PlatformPrincipal actor, String action, String targetType, String targetId,
                             Long tenantId, String detail, String ip) {
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(?)::text", String.class, CHAIN_LOCK);
        AuditEvent e = new AuditEvent();
        e.occurredAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        e.actorId = actor != null ? actor.id() : null;
        e.actorEmail = actor != null ? clip(actor.email(), 200) : null;
        e.action = clip(action, 60);
        e.targetType = clip(targetType, 40);
        e.targetId = clip(targetId, 100);
        e.tenantId = tenantId;
        e.detail = detail != null && detail.length() > 8000 ? detail.substring(0, 8000) : detail;
        e.ip = clip(ip, 64);
        e.prevHash = repository.findTopByOrderByIdDesc().map(p -> p.hash).orElse(null);
        e.hash = hash(e);
        return repository.save(e);
    }

    /** Recomputes the whole chain; reports the first broken link. */
    @Transactional(readOnly = true)
    public Map<String, Object> verify() {
        long after = 0;
        String prev = null;
        long checked = 0;
        while (true) {
            List<AuditEvent> chunk = repository.chunkAfter(after, PageRequest.of(0, 1000));
            if (chunk.isEmpty()) break;
            for (AuditEvent e : chunk) {
                checked++;
                if (!Objects.equals(prev, e.prevHash) || !hash(e).equals(e.hash)) {
                    Map<String, Object> bad = new LinkedHashMap<>();
                    bad.put("ok", false);
                    bad.put("checked", checked);
                    bad.put("brokenAtId", e.id);
                    bad.put("message", "Integrity problem at event #" + e.id
                            + ": the row or the one before it was changed after it was written.");
                    return bad;
                }
                prev = e.hash;
                after = e.id;
            }
        }
        Map<String, Object> ok = new LinkedHashMap<>();
        ok.put("ok", true);
        ok.put("checked", checked);
        return ok;
    }

    static String hash(AuditEvent e) {
        String material = String.join("\u001f",
                n(e.prevHash), e.occurredAt.toString(), n(e.actorId), n(e.actorEmail), n(e.action),
                n(e.targetType), n(e.targetId), n(e.tenantId), n(e.detail), n(e.ip));
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(material.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static String n(Object o) {
        return o == null ? "" : o.toString();
    }

    private static String clip(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
