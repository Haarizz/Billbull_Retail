package com.billbull.platform.users;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.platform.audit.AuditService;
import com.billbull.platform.auth.AuthService;
import com.billbull.platform.auth.CurrentUser;
import com.billbull.platform.auth.PlatformPrincipal;
import com.billbull.platform.auth.PlatformRole;
import com.billbull.platform.auth.PlatformUser;
import com.billbull.platform.auth.PlatformUserRepository;
import com.billbull.platform.web.ClientIp;

/**
 * Platform user administration (OWNER only). New users and password resets get a one-time
 * temporary password they must change at first sign-in; MFA resets force re-enrolment. The last
 * active OWNER can't be demoted or deactivated, and nobody can lock themselves out.
 */
@RestController
@RequestMapping("/api/platform-users")
@PreAuthorize("hasRole('OWNER')")
public class PlatformUserController {

    private final PlatformUserRepository users;
    private final PasswordEncoder encoder;
    private final AuditService audit;
    private final SecureRandom random = new SecureRandom();

    public PlatformUserController(PlatformUserRepository users, PasswordEncoder encoder, AuditService audit) {
        this.users = users;
        this.encoder = encoder;
        this.audit = audit;
    }

    public record CreateUser(String email, String fullName, String role) {}
    public record UpdateUser(String fullName, String role, Boolean active) {}

    @GetMapping
    public List<Map<String, Object>> list() {
        return users.findAllByOrderByEmailAsc().stream().map(AuthService::userView).toList();
    }

    @PostMapping
    @Transactional
    public Map<String, Object> create(@RequestBody CreateUser in, HttpServletRequest request) {
        String email = in.email() == null ? "" : in.email().trim().toLowerCase(Locale.ROOT);
        if (!email.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid email");
        }
        if (users.findByEmailIgnoreCase(email).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, email + " already has a platform account");
        }
        PlatformUser u = new PlatformUser();
        u.email = email;
        u.fullName = in.fullName() == null || in.fullName().isBlank() ? email : in.fullName().trim();
        u.role = role(in.role());
        String temp = tempPassword();
        u.passwordHash = encoder.encode(temp);
        u.mustChangePassword = true;
        users.save(u);
        audit.record(CurrentUser.get(), "USER_CREATED", "PlatformUser", String.valueOf(u.id), null,
                u.email + " as " + u.role, ClientIp.of(request));
        Map<String, Object> out = new java.util.LinkedHashMap<>(AuthService.userView(u));
        out.put("temporaryPassword", temp);
        return out;
    }

    @PutMapping("/{id}")
    @Transactional
    public Map<String, Object> update(@PathVariable long id, @RequestBody UpdateUser in, HttpServletRequest request) {
        PlatformPrincipal me = CurrentUser.get();
        PlatformUser u = find(id);
        PlatformRole newRole = in.role() != null ? role(in.role()) : u.role;
        boolean newActive = in.active() != null ? in.active() : u.active;
        boolean losesOwner = u.role == PlatformRole.OWNER && u.active && (newRole != PlatformRole.OWNER || !newActive);
        if (losesOwner && users.countByRoleAndActiveTrue(PlatformRole.OWNER) <= 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This is the last active OWNER; promote someone else first");
        }
        if (u.id.equals(me.id()) && (!newActive || newRole != u.role)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You can't change your own role or deactivate yourself");
        }
        String before = u.role + (u.active ? "" : " (inactive)");
        if (in.fullName() != null && !in.fullName().isBlank()) u.fullName = in.fullName().trim();
        if (newRole != u.role || newActive != u.active) u.tokenVersion++; // end their sessions
        u.role = newRole;
        u.active = newActive;
        users.save(u);
        audit.record(me, "USER_UPDATED", "PlatformUser", String.valueOf(u.id), null,
                u.email + ": " + before + " → " + u.role + (u.active ? "" : " (inactive)"), ClientIp.of(request));
        return AuthService.userView(u);
    }

    @PostMapping("/{id}/reset-password")
    @Transactional
    public Map<String, Object> resetPassword(@PathVariable long id, HttpServletRequest request) {
        PlatformUser u = find(id);
        String temp = tempPassword();
        u.passwordHash = encoder.encode(temp);
        u.mustChangePassword = true;
        u.failedAttempts = 0;
        u.lockedUntil = null;
        u.tokenVersion++;
        users.save(u);
        audit.record(CurrentUser.get(), "USER_PASSWORD_RESET", "PlatformUser", String.valueOf(u.id), null, u.email,
                ClientIp.of(request));
        Map<String, Object> out = new java.util.LinkedHashMap<>(AuthService.userView(u));
        out.put("temporaryPassword", temp);
        return out;
    }

    @PostMapping("/{id}/reset-mfa")
    @Transactional
    public Map<String, Object> resetMfa(@PathVariable long id, HttpServletRequest request) {
        PlatformUser u = find(id);
        u.mfaEnabled = false;
        u.mfaSecretEnc = null;
        u.mfaPendingSecretEnc = null;
        u.tokenVersion++;
        users.save(u);
        audit.record(CurrentUser.get(), "USER_MFA_RESET", "PlatformUser", String.valueOf(u.id), null,
                u.email + " must set up MFA again", ClientIp.of(request));
        return AuthService.userView(u);
    }

    private PlatformUser find(long id) {
        return users.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
    }

    private static PlatformRole role(String raw) {
        try {
            return PlatformRole.valueOf(raw == null ? "VIEWER" : raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Role must be OWNER, OPERATOR or VIEWER");
        }
    }

    private String tempPassword() {
        byte[] b = new byte[15];
        random.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b); // 20 characters
    }
}
