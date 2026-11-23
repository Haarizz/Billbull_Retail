package com.billbull.platform.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.platform.audit.AuditService;
import com.billbull.platform.config.PlatformSecrets;
import com.billbull.platform.config.SecretCipher;

class AuthServiceTest {

    private static final String PASSWORD = "correct horse battery";

    private PlatformUserRepository users;
    private PlatformUser user;
    private JwtService jwt;
    private SecretCipher cipher;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);

    @BeforeEach
    void setUp() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("test");
        PlatformSecrets secrets = new PlatformSecrets("", "", env);
        jwt = new JwtService(secrets, 60);
        cipher = new SecretCipher(secrets);
        users = mock(PlatformUserRepository.class);
        user = new PlatformUser();
        user.id = 1L;
        user.email = "ops@billbull.app";
        user.fullName = "Ops";
        user.role = PlatformRole.OPERATOR;
        user.passwordHash = encoder.encode(PASSWORD);
        when(users.findByEmailIgnoreCase(anyString())).thenAnswer(i ->
                i.getArgument(0, String.class).equalsIgnoreCase(user.email) ? Optional.of(user) : Optional.empty());
        when(users.findById(1L)).thenReturn(Optional.of(user));
        when(users.save(any())).thenAnswer(i -> i.getArgument(0));
    }

    private AuthService service(boolean requireMfa) {
        return new AuthService(users, encoder, jwt, cipher, mock(AuditService.class), requireMfa, 3, 15, 1000);
    }

    @Test
    void wrongPasswordCountsAndLocksTheAccount() {
        AuthService auth = service(true);
        for (int i = 0; i < 3; i++) {
            assertThrows(ResponseStatusException.class, () -> auth.login(user.email, "nope", "1.2.3.4"));
        }
        assertNotNull(user.lockedUntil);
        ResponseStatusException locked = assertThrows(ResponseStatusException.class,
                () -> auth.login(user.email, PASSWORD, "1.2.3.4"));
        assertEquals(429, locked.getStatusCode().value(), "even the right password waits out the lock");
    }

    @Test
    void unknownEmailGetsTheSameAnswerAsAWrongPassword() {
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service(true).login("nobody@x.io", PASSWORD, "1.2.3.4"));
        assertEquals(401, e.getStatusCode().value());
        assertEquals("Invalid email or password", e.getReason());
    }

    @Test
    void firstLoginEnrolsMfaThenSecondLoginNeedsTheCode() {
        AuthService auth = service(true);
        Map<String, Object> first = auth.login(user.email, PASSWORD, "ip");
        assertEquals("MFA_SETUP", first.get("stage"));
        String secret = (String) first.get("secret");
        String code = Totp.generate(Totp.base32Decode(secret), Instant.now().getEpochSecond() / 30);

        assertThrows(ResponseStatusException.class,
                () -> auth.enrollMfa((String) first.get("challenge"), "000000".equals(code) ? "111111" : "000000", "ip"));
        Map<String, Object> done = auth.enrollMfa((String) first.get("challenge"), code, "ip");
        assertEquals("DONE", done.get("stage"));
        assertTrue(user.mfaEnabled);
        assertNotNull(jwt.verify((String) done.get("token"), JwtService.TYPE_ACCESS));

        Map<String, Object> second = auth.login(user.email, PASSWORD, "ip");
        assertEquals("MFA", second.get("stage"));
        ResponseStatusException reuse = assertThrows(ResponseStatusException.class,
                () -> auth.verifyMfa((String) second.get("challenge"), code, "ip"));
        assertEquals(401, reuse.getStatusCode().value(), "a code is accepted once");
    }

    @Test
    void challengeTokensCantBeUsedAsSessions() {
        Map<String, Object> r = service(true).login(user.email, PASSWORD, "ip");
        String challenge = (String) r.get("challenge");
        assertThrows(RuntimeException.class, () -> jwt.verify(challenge, JwtService.TYPE_ACCESS));
    }

    @Test
    void bumpedTokenVersionInvalidatesChallenges() {
        AuthService auth = service(true);
        Map<String, Object> r = auth.login(user.email, PASSWORD, "ip");
        user.tokenVersion++;
        assertThrows(ResponseStatusException.class, () -> auth.enrollMfa((String) r.get("challenge"), "123456", "ip"));
    }

    @Test
    void passwordPolicy() {
        assertThrows(ResponseStatusException.class, () -> AuthService.validatePassword("short"));
        AuthService.validatePassword("twelve chars");
        assertEquals(12, "twelve chars".getBytes(StandardCharsets.UTF_8).length);
    }
}
