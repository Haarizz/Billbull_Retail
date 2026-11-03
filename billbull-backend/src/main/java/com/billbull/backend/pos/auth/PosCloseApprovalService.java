package com.billbull.backend.pos.auth;

import com.billbull.backend.exception.AdminApprovalRequiredException;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsService;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.user.User;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Closing approval (POS Console > Behavior): when a branch turns it on, a POS session close
 * (X-Report) or a Business Day Close (Z-Report) only goes through once an administrator has
 * approved it.
 *
 * <p>The administrator types their own credentials at the till; {@link #approve} mints a
 * short-lived, single-use grant bound to the action and its target (the session id, or the
 * branch id for Day Close). The close request carries the grant, {@link #check} verifies it
 * before the close runs, and {@link #complete} spends it and writes the audit entry only after
 * the close succeeded — so a close that fails for another reason (a cash variance, a range
 * exclusion to confirm) does not make the administrator approve twice.
 *
 * <p>An administrator who is themselves signed in approves implicitly. In-memory by design, like
 * {@link PosClosureAuthorizationRegistry}: a restart simply asks for approval again.
 */
@Service
public class PosCloseApprovalService {

    public enum Action { SESSION_CLOSE, DAY_CLOSE }

    /** Long enough to count a drawer, short enough that an unattended approval lapses. */
    static final Duration TTL = Duration.ofMinutes(15);

    /** Role names (as stored on {@code Role.name}) that count as an administrator. */
    static final Set<String> ADMIN_ROLES = Set.of("ADMIN", "SUPER_ADMIN", "BRANCH_ADMIN");

    private record Grant(Action action, Long targetId, String approver, Instant expiresAt) {}

    private final Map<String, Grant> grants = new ConcurrentHashMap<>();

    private final PosSettingsService posSettingsService;
    private final BranchAccessService branchAccessService;
    private final PosAuditService auditService;

    public PosCloseApprovalService(PosSettingsService posSettingsService,
                                   BranchAccessService branchAccessService,
                                   PosAuditService auditService) {
        this.posSettingsService = posSettingsService;
        this.branchAccessService = branchAccessService;
        this.auditService = auditService;
    }

    /** Whether {@code branchId} requires an administrator's approval for {@code action}. */
    public boolean isRequired(Action action, Long branchId) {
        if (branchId == null) return false;
        PosSettings settings = posSettingsService.getForBranch(branchId);
        return action == Action.SESSION_CLOSE
                ? Boolean.TRUE.equals(settings.getRequireAdminApprovalForSessionClose())
                : Boolean.TRUE.equals(settings.getRequireAdminApprovalForDayClose());
    }

    /**
     * Grants approval for {@code action} on {@code targetId} if {@code approver} is an
     * administrator with access to {@code branchId}. The caller has already verified the
     * approver's credentials.
     */
    public AuthorizationResult approve(Action action, Long targetId, Long branchId, User approver) {
        if (approver == null) {
            return AuthorizationResult.unauthorized("UNAUTHORIZED", "No verified user provided.");
        }
        if (!isAdmin(approver)) {
            return AuthorizationResult.unauthorized("ADMIN_REQUIRED",
                    "Only an administrator can approve this " + label(action) + ".");
        }
        if (!branchAccessService.canAccessBranch(approver.getId(), branchId)) {
            return AuthorizationResult.unauthorized("BRANCH_NOT_ACCESSIBLE",
                    "This administrator does not have access to this branch.");
        }
        purgeExpired();
        String token = UUID.randomUUID().toString();
        grants.put(token, new Grant(action, targetId, approver.getUsername(), Instant.now().plus(TTL)));
        return AuthorizationResult.success().withToken(token);
    }

    /**
     * Refuses the close unless approval is not required, the signed-in user is an
     * administrator, or {@code token} is a live grant for this action and target. Does not
     * spend the grant — {@link #complete} does that once the close has succeeded.
     *
     * @return the approving administrator's username, or null when approval is not required
     */
    public String check(Action action, Long branchId, Long targetId, String token) {
        if (!isRequired(action, branchId)) return null;
        String signedInAdmin = signedInAdminUsername();
        if (signedInAdmin != null) return signedInAdmin;
        Grant grant = token == null || token.isBlank() ? null : grants.get(token);
        if (grant == null || grant.action() != action || !grant.targetId().equals(targetId)
                || Instant.now().isAfter(grant.expiresAt())) {
            throw new AdminApprovalRequiredException(action.name(),
                    "An administrator must approve this " + label(action) + " before it can go through.");
        }
        return grant.approver();
    }

    /** Spends the grant (if any) and records who approved the close. Call after it succeeded. */
    public void complete(Action action, Long branchId, Long sessionId, String terminalId,
                         String token, String approver) {
        if (token != null) grants.remove(token);
        if (approver == null) return;
        auditService.logSessionEvent(sessionId, terminalId, branchId,
                action == Action.SESSION_CLOSE ? "SESSION_CLOSE_ADMIN_APPROVED" : "DAY_CLOSE_ADMIN_APPROVED",
                "approvedBy=" + approver);
    }

    static boolean isAdmin(User user) {
        return user.getRoles() != null && user.getRoles().stream()
                .map(r -> r.getName() == null ? "" : r.getName().replaceFirst("^ROLE_", ""))
                .anyMatch(ADMIN_ROLES::contains);
    }

    private static String signedInAdminUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) return null;
        boolean admin = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .map(a -> a.replaceFirst("^ROLE_", ""))
                .anyMatch(ADMIN_ROLES::contains);
        return admin ? auth.getName() : null;
    }

    private static String label(Action action) {
        return action == Action.SESSION_CLOSE ? "session close" : "Business Day Close";
    }

    private void purgeExpired() {
        Instant now = Instant.now();
        grants.values().removeIf(g -> now.isAfter(g.expiresAt()));
    }
}
