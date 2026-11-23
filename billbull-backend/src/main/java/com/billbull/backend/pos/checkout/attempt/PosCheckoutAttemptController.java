package com.billbull.backend.pos.checkout.attempt;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.common.ownership.OwnershipContextHolder;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.auth.PosTillPermission;
import com.billbull.backend.pos.checkout.PosCheckoutRequest;
import com.billbull.backend.pos.checkout.PosCheckoutRequestHasher;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * Read and recovery endpoints for the checkout attempt journal (Phase 0 / M2).
 *
 * <p>The release endpoint is the explicit way out of a STALLED attempt: a supervisor who has
 * looked at the partly recorded sale releases the attempt with a reason, which unblocks the
 * session's close. It changes no invoice, payment or session row. Restricted to the same roles as
 * the other supervisor-only POS session endpoint ({@code /api/pos/sessions/skip-day}), and to
 * branches the caller can act on.
 *
 * <p>The till's endpoints (lookup since M2.2.2; abandon and recoverable since M2.2.3) are gated by
 * the till permission and by one access rule ({@link #authorizeAttempt}): the caller must be able to
 * act on the attempt's branch, and must be the attempt's initiator, the current owner of its
 * session, or a supervisor. Anyone else gets 403, never a NOT_FOUND that would hide the refusal.
 * A terminal id sent by the client is never evidence of access: it only narrows a listing.
 */
@RestController
@RequestMapping("/api/pos/checkout/attempts")
public class PosCheckoutAttemptController {

    static final String SUPERVISOR_ROLES =
            "hasAnyAuthority('SUPERVISOR', 'MANAGER', 'ADMIN', 'ROLE_SUPERVISOR', 'ROLE_MANAGER', 'ROLE_ADMIN')";
    /** The same authorities as {@link #SUPERVISOR_ROLES}, for checks made in code. */
    private static final Set<String> SUPERVISOR_AUTHORITIES =
            Set.of("SUPERVISOR", "MANAGER", "ADMIN", "ROLE_SUPERVISOR", "ROLE_MANAGER", "ROLE_ADMIN");

    private final PosCheckoutAttemptService attemptService;
    private final PosCheckoutAttemptRepository attemptRepository;
    private final BranchAccessService branchAccessService;
    private final PosAuditService auditService;
    private final PosSessionRepository sessionRepository;
    private final ModulePermissionService modulePermissionService;

    public PosCheckoutAttemptController(PosCheckoutAttemptService attemptService,
                                        PosCheckoutAttemptRepository attemptRepository,
                                        BranchAccessService branchAccessService,
                                        PosAuditService auditService,
                                        PosSessionRepository sessionRepository,
                                        ModulePermissionService modulePermissionService) {
        this.attemptService = attemptService;
        this.attemptRepository = attemptRepository;
        this.branchAccessService = branchAccessService;
        this.auditService = auditService;
        this.sessionRepository = sessionRepository;
        this.modulePermissionService = modulePermissionService;
    }

    /** A session's attempts, or (no session) every blocking attempt the caller's branches can see. */
    @GetMapping
    @PreAuthorize(SUPERVISOR_ROLES)
    public List<PosCheckoutAttempt> list(@RequestParam(required = false) Long sessionId,
                                         @RequestParam(required = false, defaultValue = "100") int limit) {
        if (sessionId != null) {
            // The session decides: another branch's session is a 403, not an empty list.
            sessionRepository.findById(sessionId).ifPresent(s ->
                    branchAccessService.assertTransactionBranchAccessible(s.getBranchId(), "POS session"));
        }
        List<PosCheckoutAttempt> rows = sessionId != null
                ? attemptService.attemptsForSession(sessionId)
                : attemptService.blockingAttempts(limit);
        return rows.stream()
                .filter(a -> a.branchId() == null || branchAccessService.canAccessTransactionBranch(a.branchId()))
                .toList();
    }

    /**
     * What the server holds under {@code request.checkoutKey}. The body is the exact checkout request
     * the till saved for that key (without supervisor credentials, which the hash ignores anyway), so
     * {@code sameRequest} says whether the journal row belongs to that request. Changes nothing.
     * Found nothing is {@code found:false, recorded:NO}; that never proves an earlier request under the
     * key cannot still arrive.
     */
    @PostMapping("/lookup")
    @PreAuthorize("isAuthenticated()")
    public PosCheckoutAttemptService.KeyStatus lookup(@RequestBody PosCheckoutRequest request) {
        modulePermissionService.requireCanView(PosTillPermission.MODULE);
        String key = requireKey(request);
        if (request.getBranchId() != null) {
            branchAccessService.assertTransactionBranchAccessible(request.getBranchId(), "POS checkout attempt");
        }
        authorizeKey(key);
        return attemptService.lookup(key, PosCheckoutRequestHasher.hash(request));
    }

    /**
     * Explicit, confirmed abandonment of a checkout key (M2.2.3). The body is the exact request the
     * till saved for the key. 200 when the key is now (or was already) ABANDONED: nothing can ever be
     * recorded under it, and the till may resolve its pending record. 409 with the key's current
     * status when it cannot be abandoned (recorded, in progress, stalled, or another request's key).
     */
    @PostMapping("/abandon")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> abandon(@RequestBody PosCheckoutRequest request,
                                                       @RequestParam(required = false) String reason) {
        modulePermissionService.requireCanView(PosTillPermission.MODULE);
        String key = requireKey(request);
        if (request.getBranchId() != null) {
            branchAccessService.assertTransactionBranchAccessible(request.getBranchId(), "POS checkout attempt");
        }
        String actor = currentUser();
        // A key with a row (or a legacy invoice) is authorized against that; a key the server never saw
        // against the branch and session the tombstone will be filed under.
        boolean known = authorizeKey(key);
        PosCheckoutAttemptService.AbandonTarget target = known ? null : tombstoneTarget(request);
        String why = reason != null && !reason.isBlank() ? reason.trim() : "abandoned from the till by " + actor;
        PosCheckoutAttemptService.AbandonResult result = attemptService.abandon(key, PosCheckoutRequestHasher.hash(request),
                target, actor, why, this::authorizeAttempt);
        PosCheckoutAttemptService.KeyStatus status = result.status();
        if (result.outcome() == PosCheckoutAttemptService.AbandonOutcome.ABANDONED) {
            auditService.logSessionEvent(status.sessionId(), status.terminalId(), status.branchId(), "SUPERVISOR_OVERRIDE",
                    "CHECKOUT_ATTEMPT_ABANDONED key=" + key + " by=" + actor + " reason=" + why);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("checkoutKey", key);
        body.put("outcome", result.outcome().name());
        body.put("terminal", result.terminal());
        body.put("code", result.terminal() ? "CHECKOUT_ABANDONED" : result.refusalCode());
        body.put("message", message(result));
        body.put("status", status);
        return ResponseEntity.status(result.terminal() ? HttpStatus.OK : HttpStatus.CONFLICT).body(body);
    }

    /**
     * Attempts of a branch the caller may recover (M2.2.3): for the till after its local records were
     * lost. A supervisor sees the branch; anyone else only what they started or what belongs to a
     * session they own now. Lists only what the server received: a sale whose request never reached
     * the server cannot be reconstructed from here.
     */
    @GetMapping("/recoverable")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> recoverable(@RequestParam(required = false) Long branchId,
                                           @RequestParam(required = false) Long sessionId,
                                           @RequestParam(required = false) String terminalId,
                                           @RequestParam(required = false, defaultValue = "72") int sinceHours,
                                           @RequestParam(required = false, defaultValue = "100") int limit) {
        modulePermissionService.requireCanView(PosTillPermission.MODULE);
        Long branch = branchId != null ? branchId : branchAccessService.getActiveBranchId();
        if (branch == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "branchId is required");
        branchAccessService.assertTransactionBranchAccessible(branch, "POS checkout attempt");
        boolean supervisor = isSupervisor();
        List<PosCheckoutAttemptService.RecoverableAttempt> rows = attemptService.recoverable(branch,
                supervisor ? null : currentUser(), supervisor ? null : OwnershipContextHolder.currentUserId(),
                sessionId, terminalId, sinceHours, limit);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("branchId", branch);
        body.put("scope", supervisor ? "BRANCH" : "OWN");
        body.put("sinceHours", Math.max(1, Math.min(sinceHours, 24 * 30)));
        body.put("attempts", rows);
        body.put("note", "Only checkouts the server received are listed. A sale whose request never reached the "
                + "server cannot be reconstructed from the server; the server never stores the sale's payload.");
        return body;
    }

    @PostMapping("/{id}/release")
    @PreAuthorize(SUPERVISOR_ROLES)
    public PosCheckoutAttempt release(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        PosCheckoutAttempt current = attemptService.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Checkout attempt not found: " + id));
        if (current.branchId() != null) {
            branchAccessService.assertTransactionBranchAccessible(current.branchId(), "POS checkout attempt");
        }
        String reason = body != null ? body.get("reason") : null;
        String actor = currentUser();
        PosCheckoutAttempt released = attemptService.release(id, reason, actor);
        auditService.logSessionEvent(released.sessionId(), released.terminalId(), released.branchId(),
                "SUPERVISOR_OVERRIDE", "CHECKOUT_ATTEMPT_RELEASED attempt=" + id + " key=" + released.checkoutKey()
                        + " from=" + current.state() + " by=" + actor + " invoice=" + released.invoiceNumber()
                        + " evidence=[" + PosCheckoutAttemptService.evidenceSummary(current) + "] reason=" + reason);
        return released;
    }

    // ------------------------------------------------------------------ access rule

    /**
     * Authorizes the caller for whatever the server holds under {@code key}. Returns false when it
     * holds nothing (no attempt, no legacy invoice): there is nothing to protect yet.
     */
    private boolean authorizeKey(String key) {
        var attempt = attemptService.find(key);
        if (attempt.isPresent()) {
            authorizeAttempt(attempt.get());
            return true;
        }
        var legacy = attemptRepository.legacyInvoiceForKey(key);
        if (legacy.isPresent()) {
            var inv = legacy.get();
            authorize(inv.branchId(), inv.sessionId(), null, inv.createdByUserId());
            return true;
        }
        return false;
    }

    private void authorizeAttempt(PosCheckoutAttempt a) {
        authorize(a.branchId(), a.sessionId(), a.initiatedBy(), null);
    }

    /**
     * Branch access first, always (for the row's branch and for its session's). Then the initiator
     * (by username, or by stable user id for a legacy invoice), the session's current owner, or a
     * supervisor. 403 otherwise.
     */
    private void authorize(Long branchId, Long sessionId, String initiatedBy, Long initiatedByUserId) {
        branchAccessService.assertTransactionBranchAccessible(branchId, "POS checkout attempt");
        PosSession session = sessionId != null ? sessionRepository.findById(sessionId).orElse(null) : null;
        if (session != null) {
            branchAccessService.assertTransactionBranchAccessible(session.getBranchId(), "POS checkout attempt");
        }
        String me = currentUser();
        if (initiatedBy != null && initiatedBy.equalsIgnoreCase(me)) return;
        Long myId = OwnershipContextHolder.currentUserId();
        if (initiatedByUserId != null && Objects.equals(initiatedByUserId, myId)) return;
        if (session != null && ownsSession(session, me)) return;
        if (isSupervisor()) return;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "CHECKOUT_ATTEMPT_FORBIDDEN: this checkout belongs to "
                + "another user's sale. Only the user who started it, the current owner of its session, or a "
                + "supervisor of its branch can see or abandon it.");
    }

    /** The branch and session a tombstone is filed under, authorized like an attempt the caller starts. */
    private PosCheckoutAttemptService.AbandonTarget tombstoneTarget(PosCheckoutRequest request) {
        Long branch = request.getBranchId() != null ? request.getBranchId() : branchAccessService.getActiveBranchId();
        branchAccessService.assertTransactionBranchAccessible(branch, "POS checkout attempt");
        Long sessionId = null;
        if (request.getSessionId() != null) {
            PosSession session = sessionRepository.findById(request.getSessionId()).orElse(null);
            if (session != null) {
                branchAccessService.assertTransactionBranchAccessible(session.getBranchId(), "POS session");
                if (branch != null && !Objects.equals(branch, session.getBranchId())) {
                    throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                            "CHECKOUT_ATTEMPT_FORBIDDEN: the session belongs to another branch.");
                }
                if (!ownsSession(session, currentUser()) && !isSupervisor()) {
                    throw new ResponseStatusException(HttpStatus.FORBIDDEN, "CHECKOUT_ATTEMPT_FORBIDDEN: only the "
                            + "session's current owner or a supervisor can abandon a checkout of this session.");
                }
                sessionId = session.getId();
            }
        }
        return new PosCheckoutAttemptService.AbandonTarget(branch, sessionId, request.getTerminalId());
    }

    private static boolean ownsSession(PosSession session, String me) {
        if (session.getOpenedBy() != null && session.getOpenedBy().equalsIgnoreCase(me)) return true;
        Long myId = OwnershipContextHolder.currentUserId();
        return myId != null && Objects.equals(myId, session.getOwnerUserId());
    }

    private static boolean isSupervisor() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return false;
        for (GrantedAuthority g : auth.getAuthorities()) {
            if (SUPERVISOR_AUTHORITIES.contains(g.getAuthority())) return true;
        }
        return false;
    }

    private static String requireKey(PosCheckoutRequest request) {
        String key = request != null && request.getCheckoutKey() != null ? request.getCheckoutKey().trim() : "";
        if (key.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "checkoutKey is required");
        return key;
    }

    private static String message(PosCheckoutAttemptService.AbandonResult r) {
        if (r.terminal()) {
            return "This checkout is abandoned on the server. Nothing was recorded under it, and nothing ever "
                    + "will be: a late copy of the request is refused.";
        }
        return switch (r.refusalCode()) {
            case "CHECKOUT_RECORDED" -> "This sale is recorded on the server"
                    + (r.status().invoiceNumber() != null ? " as " + r.status().invoiceNumber() : "")
                    + ", so it cannot be abandoned.";
            case "CHECKOUT_STALLED" -> "This sale was only partly recorded. A supervisor must review and release it "
                    + "before it can be abandoned.";
            case "CHECKOUT_KEY_REUSED" -> "This checkout key belongs to a different sale on the server, so this "
                    + "sale cannot be abandoned under it.";
            default -> "This sale is still being recorded. Wait, then check its status again.";
        };
    }

    private static String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }
}
