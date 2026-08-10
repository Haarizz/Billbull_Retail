package com.billbull.backend.pos.auth;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Short-lived, single-use grants minted by POST /sessions/{id}/authorize-closure.
 *
 * <p>Day Close lets any authorized user <em>initiate</em> a normal session close, but the
 * closure itself is authorized by the session owner's credentials typed into the Session
 * Owner Verification modal. That verification happens on one request and the actual close
 * arrives on a later one, so the grant has to survive in between — this registry is that
 * bridge. Handing the browser an opaque token (rather than holding the owner's password in
 * page state and replaying it) keeps the credentials on the wire exactly once.
 *
 * <p>A grant is bound to the session it was issued for, expires after {@link #TTL}, and is
 * consumed on first use. In-memory by design: a restart simply forces re-verification.
 */
@Service
public class PosClosureAuthorizationRegistry {

    /** Long enough to count a drawer and settle cards, short enough that a walk-away expires. */
    static final java.time.Duration TTL = java.time.Duration.ofMinutes(15);

    private record Grant(Long sessionId, Long userId, Instant expiresAt) {}

    private final Map<String, Grant> grants = new ConcurrentHashMap<>();

    /** Mints a token authorizing {@code userId} to close {@code sessionId} exactly once. */
    public String issue(Long sessionId, Long userId) {
        purgeExpired();
        String token = UUID.randomUUID().toString();
        grants.put(token, new Grant(sessionId, userId, Instant.now().plus(TTL)));
        return token;
    }

    /**
     * Redeems {@code token} for the verified user id, or empty when it is unknown, expired,
     * already used, or was issued for a different session. Always consumes the token.
     */
    public Optional<Long> consume(Long sessionId, String token) {
        if (sessionId == null || token == null || token.isBlank()) return Optional.empty();
        Grant grant = grants.remove(token);
        if (grant == null) return Optional.empty();
        if (!sessionId.equals(grant.sessionId())) return Optional.empty();
        if (Instant.now().isAfter(grant.expiresAt())) return Optional.empty();
        return Optional.of(grant.userId());
    }

    private void purgeExpired() {
        Instant now = Instant.now();
        grants.values().removeIf(g -> now.isAfter(g.expiresAt()));
    }
}
