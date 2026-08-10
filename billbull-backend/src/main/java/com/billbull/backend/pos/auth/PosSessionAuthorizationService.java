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
                .anyMatch(r -> List.of("ADMIN", "BRANCH_ADMIN", "MANAGER", "SUPERVISOR").contains(r.getName()));

        if (isSupervisor) {
            return AuthorizationResult.success();
        }

        return AuthorizationResult.unauthorized("NOT_SESSION_OWNER", "Only the session owner or a supervisor may close this session.");
    }
}
