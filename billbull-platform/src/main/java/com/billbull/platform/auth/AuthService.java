package com.billbull.platform.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.platform.audit.AuditService;
import com.billbull.platform.config.SecretCipher;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

/**
 * Platform sign-in: email + password, then a TOTP code.
 *
 * <ol>
 *   <li>{@link #login}: checks the password (with per-account lockout and a per-IP throttle). With
 *       MFA on, returns stage {@code MFA} and a five-minute challenge. With MFA required but not
 *       yet set up, returns stage {@code MFA_SETUP} with a fresh secret to enrol.</li>
 *   <li>{@link #verifyMfa} / {@link #enrollMfa}: checks the code and issues the session.</li>
 * </ol>
 * A code is accepted once: the last used time step is remembered per user.
 */
@Service
public class AuthService {

    public static final int MIN_PASSWORD_LENGTH = 12;
    private static final String ISSUER = "BillBull Platform";

    private final PlatformUserRepository users;
    private final PasswordEncoder encoder;
    /** Hash of a random string, checked when the email is unknown so timing doesn't reveal it. */
    private final String dummyHash;
    private final JwtService jwt;
    private final SecretCipher cipher;
    private final AuditService audit;
    private final boolean requireMfa;
    private final int maxFailures;
    private final Duration lockout;
    private final int ipPerMinute;
    private final Cache<String, Integer> ipAttempts = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(1)).maximumSize(50_000).build();
    private final Cache<Long, Long> lastTotpStep = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(5)).maximumSize(10_000).build();

    public AuthService(PlatformUserRepository users, PasswordEncoder encoder, JwtService jwt, SecretCipher cipher,
                       AuditService audit,
                       @Value("${platform.security.require-mfa:true}") boolean requireMfa,
                       @Value("${platform.security.login.max-failures:5}") int maxFailures,
                       @Value("${platform.security.login.lockout-minutes:15}") int lockoutMinutes,
                       @Value("${platform.security.login.ip-per-minute:20}") int ipPerMinute) {
        this.users = users;
        this.encoder = encoder;
        this.dummyHash = encoder.encode(java.util.UUID.randomUUID().toString());
        this.jwt = jwt;
        this.cipher = cipher;
        this.audit = audit;
        this.requireMfa = requireMfa;
        this.maxFailures = Math.max(3, maxFailures);
        this.lockout = Duration.ofMinutes(Math.max(1, lockoutMinutes));
        this.ipPerMinute = Math.max(5, ipPerMinute);
    }

    /** Failure counters and lockouts must persist although the 401 is an exception. */
    @Transactional(noRollbackFor = ResponseStatusException.class)
    public Map<String, Object> login(String email, String password, String ip) {
        throttle(ip);
        String normalised = email == null ? "" : email.trim();
        PlatformUser user = users.findByEmailIgnoreCase(normalised).orElse(null);
        if (user == null || !user.active) {
            encoder.matches(password == null ? "" : password, dummyHash);
            audit.record(null, "LOGIN_FAILED", "PlatformUser", normalised, null, "Unknown or inactive account", ip);
            throw invalid();
        }
        if (user.lockedUntil != null && user.lockedUntil.isAfter(Instant.now())) {
            audit.record(principal(user), "LOGIN_LOCKED", "PlatformUser", String.valueOf(user.id), null,
                    "Sign-in attempted while locked", ip);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "ACCOUNT_LOCKED: Too many failed attempts. Try again after " + user.lockedUntil);
        }
        if (password == null || !encoder.matches(password, user.passwordHash)) {
            user.failedAttempts++;
            String detail = "Wrong password (" + user.failedAttempts + "/" + maxFailures + ")";
            if (user.failedAttempts >= maxFailures) {
                user.lockedUntil = Instant.now().plus(lockout);
                user.failedAttempts = 0;
                detail += "; locked until " + user.lockedUntil;
            }
            users.save(user);
            audit.record(principal(user), "LOGIN_FAILED", "PlatformUser", String.valueOf(user.id), null, detail, ip);
            throw invalid();
        }
        user.failedAttempts = 0;
        user.lockedUntil = null;

        Map<String, Object> out = new LinkedHashMap<>();
        if (user.mfaEnabled) {
            users.save(user);
            out.put("stage", "MFA");
            out.put("challenge", jwt.issueChallenge(user, JwtService.TYPE_MFA));
            return out;
        }
        if (requireMfa) {
            String secret = Totp.newSecret();
            user.mfaPendingSecretEnc = cipher.encrypt(secret);
            users.save(user);
            out.put("stage", "MFA_SETUP");
            out.put("challenge", jwt.issueChallenge(user, JwtService.TYPE_MFA_SETUP));
            out.put("secret", secret);
            out.put("otpauthUri", Totp.otpauthUri(ISSUER, user.email, secret));
            return out;
        }
        return completeLogin(user, ip, "Password (MFA not required on this deployment)");
    }

    @Transactional
    public Map<String, Object> verifyMfa(String challenge, String code, String ip) {
        throttle(ip);
        PlatformUser user = fromChallenge(challenge, JwtService.TYPE_MFA);
        if (!user.mfaEnabled || user.mfaSecretEnc == null) throw invalid();
        acceptCode(user, cipher.decrypt(user.mfaSecretEnc), code, ip);
        return completeLogin(user, ip, "Password + authenticator code");
    }

    @Transactional
    public Map<String, Object> enrollMfa(String challenge, String code, String ip) {
        throttle(ip);
        PlatformUser user = fromChallenge(challenge, JwtService.TYPE_MFA_SETUP);
        if (user.mfaPendingSecretEnc == null) throw invalid();
        String secret = cipher.decrypt(user.mfaPendingSecretEnc);
        acceptCode(user, secret, code, ip);
        user.mfaSecretEnc = user.mfaPendingSecretEnc;
        user.mfaPendingSecretEnc = null;
        user.mfaEnabled = true;
        audit.record(principal(user), "MFA_ENROLLED", "PlatformUser", String.valueOf(user.id), null,
                "Authenticator app set up", ip);
        return completeLogin(user, ip, "Password + new authenticator code");
    }

    @Transactional
    public void changePassword(PlatformPrincipal who, String current, String next, String ip) {
        PlatformUser user = users.findById(who.id()).orElseThrow(this::invalid);
        if (current == null || !encoder.matches(current, user.passwordHash)) {
            audit.record(who, "PASSWORD_CHANGE_FAILED", "PlatformUser", String.valueOf(user.id), null, "Wrong current password", ip);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Current password is wrong");
        }
        validatePassword(next);
        if (encoder.matches(next, user.passwordHash)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a password different from the current one");
        }
        user.passwordHash = encoder.encode(next);
        user.passwordChangedAt = Instant.now();
        user.mustChangePassword = false;
        users.save(user);
        audit.record(who, "PASSWORD_CHANGED", "PlatformUser", String.valueOf(user.id), null, null, ip);
    }

    /** How long a fresh authenticator code unlocks sensitive actions (database writes, dump downloads). */
    public static final Duration STEP_UP_WINDOW = Duration.ofMinutes(5);
    private final Cache<Long, Instant> elevatedUntil = Caffeine.newBuilder()
            .expireAfterWrite(STEP_UP_WINDOW).maximumSize(10_000).build();

    /**
     * Re-authentication for a sensitive action. Passes when the user confirmed an authenticator
     * code in the last {@link #STEP_UP_WINDOW}; otherwise {@code code} must be a fresh one. Without
     * a code (or with MFA not set up) it answers 403 {@code STEP_UP_REQUIRED}, which the admin app
     * turns into a code prompt — not 401, which would sign the user out.
     *
     * @return when the elevation ends
     */
    public Instant requireStepUp(PlatformPrincipal who, String code, String action, String ip) {
        Instant until = elevatedUntil.getIfPresent(who.id());
        if (until != null && until.isAfter(Instant.now())) return until;
        PlatformUser user = users.findById(who.id()).orElseThrow(this::invalid);
        if (!user.mfaEnabled || user.mfaSecretEnc == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "STEP_UP_UNAVAILABLE: Set up an authenticator app (Account) before using this.");
        }
        if (code == null || code.isBlank()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "STEP_UP_REQUIRED: Enter a code from your authenticator app to " + action + ".");
        }
        try {
            acceptCode(user, cipher.decrypt(user.mfaSecretEnc), code, ip);
        } catch (ResponseStatusException e) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "STEP_UP_INVALID: That code is not valid. Try the next one.");
        }
        Instant end = Instant.now().plus(STEP_UP_WINDOW);
        elevatedUntil.put(who.id(), end);
        audit.record(who, "STEP_UP", "PlatformUser", String.valueOf(user.id), null, "Authenticator code confirmed to " + action, ip);
        return end;
    }

    /** Ends every session the user holds, on every device. */
    @Transactional
    public void signOutEverywhere(PlatformPrincipal who, String ip) {
        PlatformUser user = users.findById(who.id()).orElseThrow(this::invalid);
        user.tokenVersion++;
        users.save(user);
        elevatedUntil.invalidate(user.id);
        audit.record(who, "SIGNED_OUT_EVERYWHERE", "PlatformUser", String.valueOf(user.id), null, null, ip);
    }

    public static void validatePassword(String password) {
        if (password == null || password.length() < MIN_PASSWORD_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Passwords need at least " + MIN_PASSWORD_LENGTH + " characters");
        }
        if (password.length() > 128) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Passwords can be at most 128 characters");
        }
    }

    public static Map<String, Object> userView(PlatformUser u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.id);
        m.put("email", u.email);
        m.put("fullName", u.fullName);
        m.put("role", u.role.name());
        m.put("active", u.active);
        m.put("mfaEnabled", u.mfaEnabled);
        m.put("mustChangePassword", u.mustChangePassword);
        m.put("lastLoginAt", u.lastLoginAt);
        m.put("lastLoginIp", u.lastLoginIp);
        m.put("lockedUntil", u.lockedUntil);
        m.put("createdAt", u.createdAt);
        return m;
    }

    private Map<String, Object> completeLogin(PlatformUser user, String ip, String method) {
        user.lastLoginAt = Instant.now();
        user.lastLoginIp = ip;
        users.save(user);
        audit.record(principal(user), "LOGIN", "PlatformUser", String.valueOf(user.id), null, method, ip);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("stage", "DONE");
        out.put("token", jwt.issueAccess(user));
        out.put("expiresInSeconds", jwt.accessTtl().toSeconds());
        out.put("user", userView(user));
        return out;
    }

    private void acceptCode(PlatformUser user, String secret, String code, String ip) {
        long step = Totp.verify(secret, code, Instant.now().getEpochSecond());
        Long last = lastTotpStep.getIfPresent(user.id);
        if (step < 0 || (last != null && step <= last)) {
            audit.record(principal(user), "MFA_FAILED", "PlatformUser", String.valueOf(user.id), null,
                    step < 0 ? "Wrong authenticator code" : "Authenticator code reused", ip);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "MFA_INVALID: That code is not valid. Try the next one.");
        }
        lastTotpStep.put(user.id, step);
    }

    private PlatformUser fromChallenge(String challenge, String type) {
        try {
            JwtService.Verified v = jwt.verify(challenge, type);
            PlatformUser user = users.findById(v.userId()).orElseThrow(this::invalid);
            if (!user.active || user.tokenVersion != v.tokenVersion()) throw invalid();
            return user;
        } catch (ResponseStatusException e) {
            throw e;
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "CHALLENGE_EXPIRED: Sign in again.");
        }
    }

    private void throttle(String ip) {
        String key = ip == null ? "?" : ip;
        int n = ipAttempts.asMap().merge(key, 1, Integer::sum);
        if (n > ipPerMinute) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Wait a minute and try again.");
        }
    }

    private ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
    }

    static PlatformPrincipal principal(PlatformUser u) {
        return new PlatformPrincipal(u.id, u.email, u.role, u.mustChangePassword);
    }
}
