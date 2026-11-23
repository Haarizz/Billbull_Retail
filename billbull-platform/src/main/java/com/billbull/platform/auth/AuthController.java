package com.billbull.platform.auth;

import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.billbull.platform.web.ClientIp;

/**
 * <pre>
 *   POST /api/auth/login          {email, password}        → stage MFA | MFA_SETUP | DONE
 *   POST /api/auth/mfa/verify     {challenge, code}        → {token, user}
 *   POST /api/auth/mfa/enroll     {challenge, code}        → {token, user}
 *   GET  /api/auth/me                                       → the signed-in user
 *   POST /api/auth/change-password {currentPassword, newPassword}
 *   POST /api/auth/sign-out-everywhere
 * </pre>
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService auth;
    private final PlatformUserRepository users;

    public AuthController(AuthService auth, PlatformUserRepository users) {
        this.auth = auth;
        this.users = users;
    }

    public record LoginRequest(String email, String password) {}
    public record MfaRequest(String challenge, String code) {}
    public record ChangePasswordRequest(String currentPassword, String newPassword) {}

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody LoginRequest body, HttpServletRequest request) {
        return auth.login(body.email(), body.password(), ClientIp.of(request));
    }

    @PostMapping("/mfa/verify")
    public Map<String, Object> verify(@RequestBody MfaRequest body, HttpServletRequest request) {
        return auth.verifyMfa(body.challenge(), body.code(), ClientIp.of(request));
    }

    @PostMapping("/mfa/enroll")
    public Map<String, Object> enroll(@RequestBody MfaRequest body, HttpServletRequest request) {
        return auth.enrollMfa(body.challenge(), body.code(), ClientIp.of(request));
    }

    @GetMapping("/me")
    public Map<String, Object> me() {
        PlatformPrincipal p = CurrentUser.get();
        return AuthService.userView(users.findById(p.id()).orElseThrow());
    }

    @PostMapping("/change-password")
    public ResponseEntity<Void> changePassword(@RequestBody ChangePasswordRequest body, HttpServletRequest request) {
        auth.changePassword(CurrentUser.get(), body.currentPassword(), body.newPassword(), ClientIp.of(request));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/sign-out-everywhere")
    public ResponseEntity<Void> signOutEverywhere(HttpServletRequest request) {
        auth.signOutEverywhere(CurrentUser.get(), ClientIp.of(request));
        return ResponseEntity.noContent().build();
    }
}
