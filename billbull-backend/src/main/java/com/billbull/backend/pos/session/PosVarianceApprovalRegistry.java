package com.billbull.backend.pos.session;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Single-use grants authorizing a cash variance at session close.
 *
 * <p>Replaces a client boolean. The threshold gate used to be satisfied by
 * {@code "supervisorApproved": true} in the close request: no credentials, no approver
 * identity, no record of what had been approved. Any caller could close an arbitrarily large
 * shortage, and — because the UI never sent the flag — a genuinely over-threshold session could
 * not be closed through the product at all. The control was simultaneously bypassable and
 * unusable.
 *
 * <p>Modelled on {@link com.billbull.backend.pos.auth.PosClosureAuthorizationRegistry}, which
 * already solves the same shape of problem for closure authorization: verify credentials on one
 * request, hand back an opaque token, spend it on the next.
 *
 * <h3>Bound to the money, not just the session</h3>
 * A grant carries the exact reconciliation it authorizes — session, expected, counted, variance.
 * Approving a 200 shortage must not silently authorize a 500 one, so if the drawer is recounted
 * after approval the grant no longer matches and is refused. Anything else would let an approval
 * be obtained for a small discrepancy and spent on a large one.
 */
@Service
public class PosVarianceApprovalRegistry {

    /** Long enough to fetch a supervisor, short enough that a walk-away expires. */
    static final java.time.Duration TTL = java.time.Duration.ofMinutes(15);

    private record Grant(Long sessionId,
                         BigDecimal expectedCash,
                         BigDecimal countedCash,
                         Long approverUserId,
                         String approverUsername,
                         String reason,
                         Instant approvedAt,
                         Instant expiresAt) {}

    private final Map<String, Grant> grants = new ConcurrentHashMap<>();

    /** What a consumed grant proves, for recording on the session. */
    public record Approval(Long approverUserId, String approverUsername, String reason,
                           Instant approvedAt) {}

    /**
     * Mints a token authorizing exactly this reconciliation on exactly this session.
     *
     * @param expectedCash the expected figure at approval time
     * @param countedCash the counted figure at approval time
     */
    public String issue(Long sessionId, BigDecimal expectedCash, BigDecimal countedCash,
                        Long approverUserId, String approverUsername, String reason) {
        purgeExpired();
        String token = UUID.randomUUID().toString();
        Instant now = Instant.now();
        grants.put(token, new Grant(sessionId, expectedCash, countedCash, approverUserId,
                approverUsername, reason, now, now.plus(TTL)));
        return token;
    }

    /**
     * Redeems {@code token} against the reconciliation actually being closed.
     *
     * <p>Always consumes the token, even when it does not match: a rejected attempt must not
     * leave a grant lying around to be retried against a different count.
     *
     * @return the approval when the token is valid, unexpired, issued for this session, and
     *      authorizes these exact figures; empty otherwise
     */
    public Optional<Approval> consume(Long sessionId, BigDecimal expectedCash, BigDecimal countedCash,
                                      String token) {
        if (sessionId == null || token == null || token.isBlank()) return Optional.empty();
        Grant grant = grants.remove(token);
        if (grant == null) return Optional.empty();
        if (!sessionId.equals(grant.sessionId())) return Optional.empty();
        if (Instant.now().isAfter(grant.expiresAt())) return Optional.empty();
        if (!sameMoney(grant.expectedCash(), expectedCash)) return Optional.empty();
        // The recount case: the drawer changed after approval, so what was authorized is no
        // longer what is being closed.
        if (!sameMoney(grant.countedCash(), countedCash)) return Optional.empty();
        return Optional.of(new Approval(grant.approverUserId(), grant.approverUsername(),
                grant.reason(), grant.approvedAt()));
    }

    /** Scale-insensitive money comparison: 200 and 200.00 are the same authorization. */
    private static boolean sameMoney(BigDecimal a, BigDecimal b) {
        if (a == null || b == null) return a == null && b == null;
        return a.compareTo(b) == 0;
    }

    private void purgeExpired() {
        Instant now = Instant.now();
        grants.values().removeIf(g -> now.isAfter(g.expiresAt()));
    }
}
