package com.billbull.platform.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.platform.audit.AuditService;
import com.billbull.platform.config.PlatformSecrets;
import com.billbull.platform.config.SecretCipher;

/** Re-authentication before database writes and dump downloads. */
class StepUpTest {

    private PlatformUser user;
    private AuthService service;
    private String secret;
    private final PlatformPrincipal who = new PlatformPrincipal(1L, "owner@billbull.app", PlatformRole.OWNER, false);

    @BeforeEach
    void setUp() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("test");
        PlatformSecrets secrets = new PlatformSecrets("", "", env);
        SecretCipher cipher = new SecretCipher(secrets);
        PlatformUserRepository users = mock(PlatformUserRepository.class);
        user = new PlatformUser();
        user.id = 1L;
        user.email = who.email();
        user.role = PlatformRole.OWNER;
        user.mfaEnabled = true;
        secret = Totp.newSecret();
        user.mfaSecretEnc = cipher.encrypt(secret);
        when(users.findById(1L)).thenReturn(Optional.of(user));
        when(users.save(any())).thenAnswer(i -> i.getArgument(0));
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
        service = new AuthService(users, encoder, new JwtService(secrets, 60), cipher, mock(AuditService.class), true, 3, 15, 1000);
    }

    private String currentCode() {
        return Totp.generate(Totp.base32Decode(secret), Instant.now().getEpochSecond() / Totp.STEP_SECONDS);
    }

    private static String reason(ResponseStatusException e) {
        return e.getReason() == null ? "" : e.getReason();
    }

    @Test
    void withoutACodeItAsksForOneWith403NotA401() {
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.requireStepUp(who, null, "test", "1.2.3.4"));
        assertEquals(403, e.getStatusCode().value());
        assertTrue(reason(e).startsWith("STEP_UP_REQUIRED"));
    }

    @Test
    void aWrongCodeIsRefused() {
        long step = Instant.now().getEpochSecond() / Totp.STEP_SECONDS;
        java.util.Set<String> valid = new java.util.HashSet<>();
        for (long s = step - 2; s <= step + 2; s++) valid.add(Totp.generate(Totp.base32Decode(secret), s));
        String wrong = "000000";
        for (int n = 0; valid.contains(wrong); n++) wrong = String.format("%06d", n * 7919 % 1_000_000);
        String bad = wrong;
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.requireStepUp(who, bad, "test", "1.2.3.4"));
        assertEquals(403, e.getStatusCode().value());
        assertTrue(reason(e).startsWith("STEP_UP_INVALID"));
    }

    @Test
    void aGoodCodeOpensAFiveMinuteWindow() {
        Instant until = service.requireStepUp(who, currentCode(), "test", "1.2.3.4");
        assertTrue(until.isAfter(Instant.now().plusSeconds(290)));
        // within the window no code is needed
        assertEquals(until, service.requireStepUp(who, null, "test", "1.2.3.4"));
    }

    @Test
    void signingOutEverywhereEndsTheWindow() {
        service.requireStepUp(who, currentCode(), "test", "1.2.3.4");
        service.signOutEverywhere(who, "1.2.3.4");
        assertThrows(ResponseStatusException.class, () -> service.requireStepUp(who, null, "test", "1.2.3.4"));
    }

    @Test
    void usersWithoutAnAuthenticatorCantStepUp() {
        user.mfaEnabled = false;
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.requireStepUp(who, "123456", "test", "1.2.3.4"));
        assertTrue(reason(e).startsWith("STEP_UP_UNAVAILABLE"));
    }
}
