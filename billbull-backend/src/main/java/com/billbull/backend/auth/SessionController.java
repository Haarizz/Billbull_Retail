package com.billbull.backend.auth;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.HashMap;

import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.pos.session.PosSessionStatus;

import com.billbull.backend.config.JwtUtil;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;

@RestController
@RequestMapping("/api/session")
public class SessionController {

    private final UserRepository userRepository;
    private final BranchRepository branchRepository;
    private final PosSessionRepository posSessionRepository;
    private final JwtUtil jwtUtil;

    public SessionController(
            UserRepository userRepository,
            BranchRepository branchRepository,
            PosSessionRepository posSessionRepository,
            JwtUtil jwtUtil) {
        this.userRepository = userRepository;
        this.branchRepository = branchRepository;
        this.posSessionRepository = posSessionRepository;
        this.jwtUtil = jwtUtil;
    }

    public static class SwitchBranchRequest {
        private Long branchId;
        public Long getBranchId() { return branchId; }
        public void setBranchId(Long branchId) { this.branchId = branchId; }
    }

    public static class SwitchBranchResponse {
        private final String token;
        private final Long activeBranchId;
        private final String activeBranchName;
        private final String activeBranchCode;

        public SwitchBranchResponse(String token, Long id, String name, String code) {
            this.token = token;
            this.activeBranchId = id;
            this.activeBranchName = name;
            this.activeBranchCode = code;
        }

        public String getToken() { return token; }
        public Long getActiveBranchId() { return activeBranchId; }
        public String getActiveBranchName() { return activeBranchName; }
        public String getActiveBranchCode() { return activeBranchCode; }
    }

    @Transactional
    @PostMapping("/switch-branch")
    public ResponseEntity<?> switchBranch(
            Authentication authentication,
            @RequestBody SwitchBranchRequest request) {

        if (authentication == null || authentication.getName() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }

        User user = userRepository.findByUsernameAndIsActiveTrue(authentication.getName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));

        Long requested = request != null ? request.getBranchId() : null;
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        boolean isAllBranches = ctx != null && ctx.isAllBranches();
        Long currentBranchId = ctx != null && !isAllBranches ? ctx.activeBranchId() : null;

        // Implementation Phase 1: Prevent Branch Switching When an Active POS Session Exists
        if (currentBranchId != null) {
            List<PosSession> openSessions = posSessionRepository.findByOwnerUserIdAndBranchIdAndStatus(user.getId(), currentBranchId, PosSessionStatus.OPEN);
            if (!openSessions.isEmpty()) {
                PosSession activeSession = openSessions.get(0);
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("code", "ACTIVE_POS_SESSION");
                errorResponse.put("message", "An active POS session exists.");
                errorResponse.put("branchId", activeSession.getBranchId());
                errorResponse.put("branchName", activeSession.getBranchName());
                errorResponse.put("terminalId", activeSession.getTerminalId());
                errorResponse.put("terminalName", activeSession.getCounterName()); // Map counterName to terminalName
                errorResponse.put("sessionId", activeSession.getId());
                errorResponse.put("sessionNumber", activeSession.getId());
                return ResponseEntity.status(HttpStatus.CONFLICT).body(errorResponse);
            }
        }

        Branch target = null;
        if (requested != null) {
            target = branchRepository.findById(requested)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Branch not found"));

            if (!isAllBranches) {
                // Allowed = primary branch ∪ additional branches (PDF §2.3).
                java.util.Set<Long> allowed = new java.util.HashSet<>();
                if (user.getBranch() != null && user.getBranch().getId() != null) {
                    allowed.add(user.getBranch().getId());
                }
                if (user.getAdditionalBranches() != null) {
                    user.getAdditionalBranches().stream()
                            .filter(b -> b != null && b.getId() != null)
                            .forEach(b -> allowed.add(b.getId()));
                }
                if (!allowed.contains(requested)) {
                    throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                            "You are not allowed to access this branch.");
                }
            }
        } else if (!isAllBranches) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only administrators can switch to 'All Branches'.");
        }

        String token = jwtUtil.generateToken(user, requested);

        return ResponseEntity.ok(new SwitchBranchResponse(
                token,
                target != null ? target.getId() : null,
                target != null ? target.getName() : null,
                target != null ? target.getCode() : null));
    }
}
