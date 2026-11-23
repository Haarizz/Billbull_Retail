package com.billbull.backend.pos.offline;

import java.time.LocalDate;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The session and Day Close side of M3 offline selling: a session that has handed an offline
 * lease to a till cannot be closed, start closing, be suspended, transferred, taken over or
 * handed over, and its branch-date cannot be day-closed, until that lease is settled (signed close
 * summary matched) or abandoned by an administrator. Lease expiry does not lift the gate: sales
 * rung before expiry may still be on their way.
 *
 * <p>Separate from {@link PosOfflineLeaseService} so {@code PosSessionService} can depend on it
 * without a cycle. Reads the server-side lease register only; nothing a till reports is trusted.
 */
@Component
public class PosOfflineLeaseBarrier {

    private static final Logger log = LoggerFactory.getLogger(PosOfflineLeaseBarrier.class);

    private final PosOfflineRepository repo;

    public PosOfflineLeaseBarrier(PosOfflineRepository repo) {
        this.repo = repo;
    }

    /**
     * The caller holds the session row lock (as for the M2 checkout barrier). Leases are only issued
     * under that same lock, so under it this plain read is authoritative.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void assertNoOutstandingLease(Long sessionId, String transition) {
        if (sessionId == null) return;
        var leases = repo.findActiveLeasesForSession(sessionId);
        if (leases.isEmpty()) return;
        var l = leases.get(0);
        long[] usage = repo.leaseUsage(l.id());
        log.warn("POS session {} {} refused: offline lease {} outstanding", sessionId, transition, l.id());
        throw new ResponseStatusException(HttpStatus.CONFLICT, "OFFLINE_LEASE_OUTSTANDING: Session #" + sessionId
                + " cannot " + verb(transition) + " while terminal " + l.terminalId() + " holds an offline lease ("
                + l.id() + ", " + (l.expired() ? "expired" : "valid until " + l.notAfter()) + ", " + usage[0]
                + " offline sale(s) received). Bring the till online so it synchronises and settles the lease, "
                + "or have an administrator abandon it.");
    }

    /** True when the session holds an outstanding lease (used by the idle scheduler, which skips). */
    public boolean hasOutstandingLease(Long sessionId) {
        return sessionId != null && !repo.findActiveLeasesForSession(sessionId).isEmpty();
    }

    /** Day Close gate: the server-side lease register, never a count reported by a till. */
    public void assertDayCloseAllowed(Long branchId, LocalDate date) {
        var leases = repo.findUnsettledLeasesForBranchDate(branchId, date);
        if (leases.isEmpty()) return;
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot close day: " + leases.size()
                + " offline lease(s) for this business date are not settled ("
                + leases.stream().map(l -> l.terminalId() + "/" + l.id()).collect(Collectors.joining(", "))
                + "). Synchronise those tills or have an administrator abandon the lease.");
    }

    private static String verb(String transition) {
        return switch (transition) {
            case "CLOSE" -> "be closed";
            case "BEGIN_CLOSURE" -> "start closing";
            case "SUSPEND", "SCHEDULED_SUSPEND" -> "be suspended";
            case "TRANSFER" -> "be transferred to another terminal";
            case "TAKEOVER" -> "be taken over by another user";
            case "REASSIGN_OWNER" -> "be handed over to another cashier";
            default -> "change (" + transition + ")";
        };
    }
}
