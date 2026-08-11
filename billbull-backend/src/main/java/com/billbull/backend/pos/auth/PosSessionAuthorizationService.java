package com.billbull.backend.pos.auth;

import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.user.User;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PosSessionAuthorizationService {

    public AuthorizationResult authorizeSessionClose(PosSession session, User verifiedUser) {
        if (session == null) {
            return AuthorizationResult.unauthorized("SESSION_NOT_FOUND", "Session not found.");
        }
        
        if (session.getStatus() == PosSessionStatus.CLOSED) {
            return AuthorizationResult.unauthorized("SESSION_ALREADY_CLOSED", "Session is already closed.");
        }
        
        if (session.getStatus() != PosSessionStatus.OPEN && session.getStatus() != PosSessionStatus.SUSPENDED) {
            return AuthorizationResult.unauthorized("INVALID_SESSION_STATE", "Session cannot be closed from status: " + session.getStatus());
        }

        if (verifiedUser == null) {
            return AuthorizationResult.unauthorized("UNAUTHORIZED", "No verified user provided.");
        }
        
        boolean isOwner = verifiedUser.getUsername().equalsIgnoreCase(session.getOpenedBy());
        if (isOwner) {
            return AuthorizationResult.success();
        }

        boolean isSupervisor = verifiedUser.getRoles().stream()
                .anyMatch(r -> SUPERVISOR_ROLES.contains(r.getName()));

        if (isSupervisor) {
            return AuthorizationResult.success();
        }

        return AuthorizationResult.unauthorized("NOT_SESSION_OWNER", "Only the session owner or a supervisor may close this session.");
    }

    /**
     * Authorizes <b>cancelling</b> a started closure workflow — deliberately stricter than
     * {@link #authorizeSessionClose}: a supervisor role is required and session ownership
     * alone is NOT sufficient.
     *
     * <p>The asymmetry is the point. Starting a closure and completing it are both the
     * cashier's own job, but un-starting one is what would let a cashier who has been told
     * to close out simply put the till back into service. That decision belongs to a
     * supervisor. The role list is the same one {@link #authorizeSessionClose} uses, so
     * there is one definition of "supervisor" in this service.
     */
    public AuthorizationResult authorizeClosureCancellation(PosSession session, User verifiedUser) {
        if (session == null) {
            return AuthorizationResult.unauthorized("SESSION_NOT_FOUND", "Session not found.");
        }
        if (session.getStatus() == PosSessionStatus.CLOSED) {
            return AuthorizationResult.unauthorized("SESSION_ALREADY_CLOSED",
                    "Session is already closed; its closure cannot be cancelled.");
        }
        if (session.getClosingStartedAt() == null) {
            return AuthorizationResult.unauthorized("CLOSURE_NOT_STARTED",
                    "This session is not in the closure workflow.");
        }
        if (verifiedUser == null) {
            return AuthorizationResult.unauthorized("UNAUTHORIZED", "No verified user provided.");
        }

        boolean isSupervisor = verifiedUser.getRoles().stream()
                .anyMatch(r -> SUPERVISOR_ROLES.contains(r.getName()));
        if (isSupervisor) {
            return AuthorizationResult.success();
        }

        return AuthorizationResult.unauthorized("SUPERVISOR_REQUIRED",
                "Only a supervisor may cancel a session closure that has already been started.");
    }

    /** The one definition of "supervisor" for session closure decisions. */
    private static final List<String> SUPERVISOR_ROLES =
            List.of("ADMIN", "BRANCH_ADMIN", "MANAGER", "SUPERVISOR");
}
